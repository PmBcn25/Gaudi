#!/usr/bin/env bash
# Ejecuta comandos en el VPS por SSH, con la clave de secret/.
#
#   scripts/vps.sh 'systemctl status convertia-web'      # un comando
#   scripts/vps.sh bash -s < script.sh                    # un script por la entrada estándar
#   scripts/vps.sh --host                                 # imprime el host configurado
#
# De dónde saca la conexión (el primero que exista):
#   1. Variables de entorno VPS_HOST, VPS_USER (root), VPS_PORT (22), VPS_KEY.
#   2. deploy/vps.env (no se versiona) con esas mismas variables.
#   3. CLAUDE.md: líneas "VPS_HOST=…"/"VPS_USER=…" o un comando "ssh … usuario@host".
# La clave: VPS_KEY o el primer archivo de secret/ que contenga una clave privada.
# No toca ~/.ssh: la huella del servidor se guarda en secret/known_hosts.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -f "$ROOT/deploy/vps.env" ] && { set -a; . "$ROOT/deploy/vps.env"; set +a; }

if [ -z "${VPS_HOST:-}" ] && [ -f "$ROOT/CLAUDE.md" ]; then
  VPS_HOST="$(grep -oE 'VPS_HOST[[:space:]]*[=:][[:space:]]*`?[A-Za-z0-9._-]+' "$ROOT/CLAUDE.md" | head -1 | sed -E 's/.*[=:][[:space:]]*`?//' || true)"
  VPS_USER="${VPS_USER:-$(grep -oE 'VPS_USER[[:space:]]*[=:][[:space:]]*`?[A-Za-z0-9._-]+' "$ROOT/CLAUDE.md" | head -1 | sed -E 's/.*[=:][[:space:]]*`?//' || true)}"
  if [ -z "$VPS_HOST" ]; then
    line="$(grep -E '(^|[[:space:]`])ssh[[:space:]].*[A-Za-z0-9._-]+@[A-Za-z0-9._-]+' "$ROOT/CLAUDE.md" | grep -v 'git@' | head -1 || true)"
    if [ -n "$line" ]; then
      ua="$(grep -oE '[A-Za-z0-9._-]+@[A-Za-z0-9._-]+' <<<"$line" | head -1)"
      VPS_USER="${VPS_USER:-${ua%@*}}"; VPS_HOST="${ua#*@}"
      VPS_PORT="${VPS_PORT:-$(grep -oE '[[:space:]]-p[[:space:]]*[0-9]+' <<<"$line" | grep -oE '[0-9]+' | head -1 || true)}"
    fi
  fi
fi
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"

if [ "${1:-}" = "--host" ]; then echo "${VPS_HOST:-}"; exit 0; fi
if [ -z "${VPS_HOST:-}" ]; then
  echo "vps.sh: no sé a qué servidor conectar. Define VPS_HOST (y VPS_USER si no es root) en el entorno o en deploy/vps.env." >&2
  exit 2
fi

if [ -z "${VPS_KEY:-}" ]; then
  for f in "$ROOT"/secret/*; do
    [ -f "$f" ] || continue
    case "$f" in *.pub|*known_hosts*) continue ;; esac
    if grep -q 'PRIVATE KEY' "$f" 2>/dev/null; then VPS_KEY="$f"; break; fi
  done
fi
KEYOPT=()
if [ -n "${VPS_KEY:-}" ]; then chmod 600 "$VPS_KEY" 2>/dev/null || true; KEYOPT=(-i "$VPS_KEY" -o IdentitiesOnly=yes); fi
mkdir -p "$ROOT/secret"

exec ssh "${KEYOPT[@]}" -p "$VPS_PORT" \
  -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 \
  -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$ROOT/secret/known_hosts" \
  "$VPS_USER@$VPS_HOST" "$@"
