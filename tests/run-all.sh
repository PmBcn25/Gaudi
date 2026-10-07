#!/usr/bin/env bash
# Todas las pruebas contra la URL pública, desde esta máquina.
#   BASE_URL=https://… tests/run-all.sh [--reboot]
# Necesita: node 20+, ffmpeg/ffprobe, pandoc, libreoffice, ghostscript, qpdf, heif-enc (para
# generar los archivos de prueba) y la conexión SSH de scripts/vps.sh (para reiniciar el
# servicio web entre tandas: el límite de 20 conversiones/hora NO se sube).
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
: "${BASE_URL:?Define BASE_URL, p. ej. https://203-0-113-45.sslip.io/}"
export BASE_URL
SUDO=""; [ "$("$ROOT/scripts/vps.sh" 'id -un')" = root ] || SUDO="sudo -n "
export RESTART_CMD="${RESTART_CMD:-\"$ROOT/scripts/vps.sh\" '${SUDO}systemctl restart convertia-web'}"
[ -d node_modules/playwright ] || npm install --no-audit --no-fund --silent
[ -f fixtures/long1080.mp4 ] || ./gen-fixtures.sh
mkdir -p out
declare -A R
run() { local name="$1"; shift; echo; echo "════════ $name"; bash -c "$RESTART_CMD" >/dev/null 2>&1; sleep 1; "$@"; R[$name]=$?; }
run "1. Conversiones (7 categorías)" node conversions.mjs
run "2. Formatos de salida"           node formats.mjs
run "3. Progreso real (SSE)"          node progress.mjs
run "4. Errores, cola y cancelación"  node errors-queue.mjs
run "5. Navegador escritorio/móvil"   node browser.mjs
run "6. Peso y cabeceras"             node weight.mjs
[ "${1:-}" = "--reboot" ] && run "7. Reinicio completo" ./reboot.sh
run "8. Acceso externo"               ./external.sh
echo; echo "════════ Resumen"
fail=0
for k in "${!R[@]}"; do printf '  %s %s\n' "$([ "${R[$k]}" = 0 ] && echo ✓ || echo ✗)" "$k"; [ "${R[$k]}" = 0 ] || fail=1; done | sort -k2
exit $fail
