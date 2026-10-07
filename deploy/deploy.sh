#!/usr/bin/env bash
# Despliega Convertia en el VPS con una sola orden. Idempotente: vale para la
# primera instalación y para cada actualización.
#
#   deploy/deploy.sh            sube el código, instala/actualiza y comprueba
#   deploy/deploy.sh --test     además lanza todas las pruebas de tests/ contra la URL pública
#
# Conexión: la de scripts/vps.sh (VPS_HOST/VPS_USER/VPS_KEY, deploy/vps.env o CLAUDE.md).
# Opcional (entorno o deploy/vps.env): DOMAIN, SHARED_DOMAIN + BASE_PATH, PUBLIC_IP, CERT_MODE.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS="$ROOT/scripts/vps.sh"
[ -f "$ROOT/deploy/vps.env" ] && { set -a; . "$ROOT/deploy/vps.env"; set +a; }
# Dominio previsto en CLAUDE.md (línea "DOMAIN=…"), si lo hay.
if [ -z "${DOMAIN:-}" ] && [ -f "$ROOT/CLAUDE.md" ]; then
  DOMAIN="$(grep -oE '^DOMAIN=[A-Za-z0-9.-]+' "$ROOT/CLAUDE.md" | head -1 | cut -d= -f2 || true)"
fi
say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }

say "Comprobando la conexión con el VPS…"
REMOTE_USER="$("$VPS" 'id -un')"
SUDO=""; [ "$REMOTE_USER" = root ] || SUDO="sudo -n"
"$VPS" "$SUDO true" || { echo "El usuario $REMOTE_USER necesita sudo sin contraseña." >&2; exit 1; }
say "Conectado como $REMOTE_USER a $("$VPS" --host)."

say "Subiendo el código (app/ y deploy/, sin node_modules)…"
STAMP="$(date +%Y%m%d%H%M%S)"
tar -C "$ROOT" --exclude='node_modules' --exclude='.DS_Store' -czf - app deploy/remote-setup.sh deploy/nginx deploy/systemd \
  | "$VPS" "$SUDO mkdir -p /var/conversor/incoming && $SUDO rm -rf /var/conversor/incoming/$STAMP && $SUDO mkdir -p /var/conversor/incoming/$STAMP && $SUDO tar -xzf - -C /var/conversor/incoming/$STAMP"

say "Instalando y configurando en el servidor (paquetes, Node 20, systemd, nginx, certificado, cortafuegos)…"
VARS=""
for v in DOMAIN SHARED_DOMAIN BASE_PATH PUBLIC_IP CERT_MODE; do
  [ -n "${!v:-}" ] && VARS="$VARS $v=$(printf '%q' "${!v}")"
done
"$VPS" "$SUDO env$VARS bash /var/conversor/incoming/$STAMP/deploy/remote-setup.sh; rc=\$?; $SUDO rm -rf /var/conversor/incoming/$STAMP; exit \$rc"

INFO="$("$VPS" "$SUDO cat /var/conversor/deploy-info.env")"
eval "$INFO"
say "Desplegado: $URL"
echo "    Dominio:     $DOMAIN — $DOMAIN_REASON"
echo "    Certificado: $CERT_MODE — $CERT_REASON"
printf '%s\n' "$INFO" > "$ROOT/deploy/last-deploy.env"

if [ "${1:-}" = "--test" ]; then
  say "Lanzando las pruebas contra $URL…"
  BASE_URL="$URL" bash "$ROOT/tests/run-all.sh"
fi
