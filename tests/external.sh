#!/usr/bin/env bash
# Desde ESTA máquina (no desde el servidor): HTTPS con certificado válido en la URL
# pública, HTTP redirige a HTTPS, y el puerto interno de la app NO responde desde fuera.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${BASE_URL:?Falta BASE_URL}"
HOST="$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$URL")"
IP="$(getent ahostsv4 "$HOST" | awk 'NR==1{print $1}')"
PORT="$("$ROOT/scripts/vps.sh" 'grep -oE "^PORT=[0-9]+" /etc/convertia.env | cut -d= -f2' 2>/dev/null || echo 3100)"
fails=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; fails=$((fails + 1)); }
echo
echo "Acceso externo a $URL ($HOST → $IP)"
CA=()
[ -n "${CACERT:-}" ] && CA=(--cacert "$CACERT")
out="$(curl -sS "${CA[@]}" -o /dev/null -w '%{http_code} %{ssl_verify_result}' "$URL" 2>&1)"
MODE="$("$ROOT/scripts/vps.sh" 'cat /var/conversor/deploy-info.env' 2>/dev/null | grep -oE '^CERT_MODE="[^"]*"' | cut -d'"' -f2)"
if [[ "$out" == "200 0" ]]; then
  ok "HTTPS responde 200 con certificado verificado${CACERT:+ (contra $CACERT)}"
elif [ "$MODE" = autofirmado ]; then
  # El despliegue cayó al plan C (autofirmado) y lo avisó: se verifica contra el certificado fijado.
  PIN="$(mktemp)"; "$ROOT/scripts/vps.sh" "cat /etc/ssl/convertia/$HOST.crt" > "$PIN" 2>/dev/null
  out2="$(curl -sS --cacert "$PIN" -o /dev/null -w '%{http_code} %{ssl_verify_result}' "$URL" 2>&1)"
  echo "  ⚠ certificado AUTOFIRMADO (las CA públicas no lo validan; ver CERT_REASON en deploy-info.env)"
  if [[ "$out2" == "200 0" ]]; then ok "HTTPS responde 200 y el certificado verifica contra el fijado del servidor"; else ko "HTTPS ni siquiera con el certificado fijado: $out2"; fi
  rm -f "$PIN"
else
  ko "HTTPS con verificación: $out"
fi
cert="$(echo | openssl s_client -connect "$IP:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -issuer -subject -enddate 2>/dev/null | tr '\n' ' ')"
echo "    certificado: $cert"
code="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST/" 2>&1)"
[[ "$code" == 301\ https://* ]] && ok "HTTP redirige a HTTPS ($code)" || ko "HTTP → $code"
for p in "$PORT" 3100; do
  if timeout 6 bash -c "exec 3<>/dev/tcp/$IP/$p" 2>/dev/null; then ko "el puerto interno $p RESPONDE desde fuera"; else ok "el puerto interno $p no responde desde fuera"; fi
done
echo
[ $fails -eq 0 ] && echo "Acceso externo: todo correcto" || echo "Acceso externo: $fails FALLOS"
exit $fails
