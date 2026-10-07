#!/usr/bin/env bash
# Reinicia el servidor ENTERO y comprueba que todo se levanta solo, sin tocar nada.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS="$ROOT/scripts/vps.sh"
URL="${BASE_URL:?Falta BASE_URL}"
K=(); [ "${INSECURE:-}" = 1 ] && K=(-k)
sig() { "$VPS" 'echo "$(cat /proc/sys/kernel/random/boot_id) $(stat -c %Y /proc/1)"' 2>/dev/null; }
echo
before="$(sig)"; echo "Reinicio completo del servidor (arranque actual: $before)"
t0=$(date +%s)
"$VPS" 'sudo -n systemctl reboot 2>/dev/null || systemctl reboot || reboot' >/dev/null 2>&1 || true
sleep 10
for i in $(seq 1 120); do
  now="$(sig)"; [ -n "$now" ] && [ "$now" != "$before" ] && break; sleep 5
done
[ -n "${now:-}" ] && [ "$now" != "$before" ] || { echo "  ✗ el servidor no ha vuelto"; exit 1; }
echo "  ✓ el servidor ha vuelto en $(( $(date +%s) - t0 )) s (arranque nuevo: $now)"
for i in $(seq 1 90); do
  curl -fsS "${K[@]}" "${URL}api/health" 2>/dev/null | grep -q '"worker":true' && break; sleep 2
done
h="$(curl -fsS "${K[@]}" "${URL}api/health" 2>&1)"
echo "  salud: $h"
states="$("$VPS" 'systemctl is-active convertia-web convertia-worker convertia-cleanup.timer nginx | tr "\n" " "; systemctl is-enabled convertia-web convertia-worker convertia-cleanup.timer | tr "\n" " "')"
echo "  servicios: $states"
fails=0
grep -q '"worker":true' <<<"$h" || fails=1
[[ "$states" == "active active active active enabled enabled enabled "* ]] || fails=1
# Y una conversión real de punta a punta tras el reinicio.
(cd "$ROOT/tests" && node -e "
import('./lib.mjs').then(async (l) => {
  const r = await l.convert(l.FIX + '/subs.srt', 'sub-vtt');
  console.log(r.buf && l.MAGIC.vtt(r.buf) ? '  ✓ conversión tras el reinicio: SRT → WebVTT correcta' : '  ✗ conversión tras el reinicio: ' + r.error);
  process.exitCode = r.buf ? 0 : 1;
});") || fails=1
[ $fails -eq 0 ] && echo "Reinicio: todo se levanta solo" || echo "Reinicio: FALLA"
exit $fails
