#!/usr/bin/env bash
# Instalación / actualización de Convertia EN EL SERVIDOR (como root). Idempotente:
# sirve igual la primera vez que en cada actualización. Lo lanza deploy/deploy.sh.
#
# Variables opcionales:
#   DOMAIN=ejemplo.com        dominio previsto (se usa solo si su DNS apunta a esta máquina)
#   SHARED_DOMAIN + BASE_PATH  publicar en una subcarpeta de un dominio que ya sirve nginx
#                              (p. ej. SHARED_DOMAIN=midominio.com BASE_PATH=/convertia)
#   PUBLIC_IP=1.2.3.4         IP pública (si no, se detecta)
#   CERT_MODE=selfsigned      forzar certificado autofirmado (solo para entornos de prueba)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SRC="$(cd "$(dirname "$0")/.." && pwd)"      # carpeta con app/ y deploy/ recién subidos
BASE=/var/conversor
APP=$BASE/app
NODE_DIR=$BASE/node
ENVF=/etc/convertia.env
INFO=$BASE/deploy-info.env
LOG() { printf '\033[1;34m[convertia]\033[0m %s\n' "$*"; }
WARN() { printf '\033[1;33m[convertia] AVISO:\033[0m %s\n' "$*"; }
DIE() { printf '\033[1;31m[convertia] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || DIE "hay que ejecutarlo como root"
mkdir -p "$BASE"

# ------------------------------------------------------------------ 0. inventario (sin tocar nada)
LOG "Revisando qué hay ya en la máquina (no se modifica nada que no sea de Convertia)…"
INV="$BASE/inventario-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "== $(date -Is) $(hostname)"; . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
  echo "== Puertos en escucha"; ss -ltnpH 2>/dev/null || true
  echo "== Servicios en marcha"; systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '{print $1}' || true
  echo "== Sitios nginx"; ls -1 /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
  echo "== Contenedores"; (command -v docker >/dev/null && docker ps --format '{{.Names}} {{.Ports}}') 2>/dev/null || true
} > "$INV" 2>&1
sed 's/^/    /' "$INV" | head -60 || true
listener() { { ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -1 | sed -e 's/users:(("//' -e 's/"$//'; } || true; }
P80="$(listener 80)"; P443="$(listener 443)"
for p in "$P80" "$P443"; do
  if [ -n "$p" ] && [ "$p" != nginx ]; then
    DIE "los puertos 80/443 los usa \"$p\", no nginx. No lo piso: integra Convertia en ese servidor web a mano o libera los puertos."
  fi
done
[ -n "$P80$P443" ] && LOG "nginx ya está sirviendo otros sitios: me integro con su configuración sin tocarlos."

# ------------------------------------------------------------------ 1. paquetes
. /etc/os-release
PKGS=(ffmpeg libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress ghostscript qpdf pandoc zip unzip
  libheif-examples libheif-plugin-libde265 libheif-plugin-x265 fonts-liberation fonts-liberation2 fonts-dejavu-core
  fonts-crosextra-carlito fonts-crosextra-caladea nginx certbot sqlite3 dnsutils curl ca-certificates xz-utils openssl)
if apt-cache show libvips42t64 >/dev/null 2>&1; then PKGS+=(libvips42t64); else PKGS+=(libvips42); fi
MISSING=()
for p in "${PKGS[@]}"; do
  dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || MISSING+=("$p")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  LOG "Instalando paquetes: ${MISSING[*]}"
  apt-get update -qq
  AVAILABLE=()
  for p in "${MISSING[@]}"; do
    if apt-cache show "$p" >/dev/null 2>&1; then AVAILABLE+=("$p"); else WARN "el paquete $p no existe en $PRETTY_NAME; se omite"; fi
  done
  apt-get install -y -qq --no-install-recommends "${AVAILABLE[@]}" >/dev/null
else
  LOG "Paquetes del sistema: ya instalados."
fi

# Node.js 20 privado para Convertia (no se toca el Node del sistema ni el de otros proyectos).
ARCH="$(uname -m)"; case "$ARCH" in x86_64) NARCH=x64 ;; aarch64|arm64) NARCH=arm64 ;; *) DIE "arquitectura $ARCH no soportada" ;; esac
if ! "$NODE_DIR/bin/node" -v 2>/dev/null | grep -q '^v20\.'; then
  LOG "Instalando Node.js 20 en $NODE_DIR…"
  SUMS="$(curl -fsSL https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt)"
  TARBALL="$(grep -oE "node-v20\.[0-9]+\.[0-9]+-linux-$NARCH\.tar\.xz" <<<"$SUMS" | head -1)"
  [ -n "$TARBALL" ] || DIE "no encuentro Node 20 en nodejs.org"
  TMPD="$(mktemp -d)"
  curl -fsSL -o "$TMPD/$TARBALL" "https://nodejs.org/dist/latest-v20.x/$TARBALL"
  (cd "$TMPD" && grep " $TARBALL\$" <<<"$SUMS" | sha256sum -c - >/dev/null) || DIE "la suma SHA-256 de Node no coincide"
  rm -rf "$NODE_DIR.new" && mkdir -p "$NODE_DIR.new"
  tar xJf "$TMPD/$TARBALL" -C "$NODE_DIR.new" --strip-components=1
  rm -rf "$NODE_DIR" && mv "$NODE_DIR.new" "$NODE_DIR" && rm -rf "$TMPD"
fi
LOG "Node $("$NODE_DIR/bin/node" -v) en $NODE_DIR"

# ------------------------------------------------------------------ 2. swap (red de seguridad)
if [ -z "$(swapon --noheadings --show 2>/dev/null)" ]; then
  LOG "Creando 2 GB de swap en /swapfile-convertia…"
  if [ ! -f /swapfile-convertia ]; then
    fallocate -l 2G /swapfile-convertia 2>/dev/null || dd if=/dev/zero of=/swapfile-convertia bs=1M count=2048 status=none
    chmod 600 /swapfile-convertia && mkswap /swapfile-convertia >/dev/null
  fi
  if swapon /swapfile-convertia 2>/dev/null; then
    grep -q '^/swapfile-convertia ' /etc/fstab || echo '/swapfile-convertia none swap sw 0 0' >> /etc/fstab
  else WARN "no se pudo activar la swap (¿contenedor sin permisos?); se sigue sin ella"; fi
else
  LOG "Swap: ya existe ($(swapon --noheadings --show=NAME,SIZE | tr '\n' ' '))"
fi

# ------------------------------------------------------------------ 3. usuario y carpetas
id convertia >/dev/null 2>&1 || useradd --system --home-dir $BASE/home --no-create-home --shell /usr/sbin/nologin --user-group convertia
install -d -o root -g root -m 755 $BASE
for d in tmp db run home; do install -d -o convertia -g convertia -m 750 "$BASE/$d"; done

# Puerto interno (solo 127.0.0.1). 3100 salvo que lo use otro programa.
PORT="$(grep -oE '^PORT=[0-9]+' "$ENVF" 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-3100}"
mine() { systemctl is-active --quiet convertia-web && ss -ltnpH "sport = :$1" | grep -q "pid=$(systemctl show -p MainPID --value convertia-web)," ; }
while ss -ltnH "sport = :$PORT" | grep -q . && ! mine "$PORT"; do PORT=$((PORT + 1)); done
cat > "$ENVF" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
CONVERTIA_DATA=$BASE
EOF
chmod 644 "$ENVF"

# ------------------------------------------------------------------ 4. código
LOG "Instalando la aplicación en $APP…"
rm -rf "$APP.new" && cp -a "$SRC/app" "$APP.new"
rm -rf "$APP.new/node_modules"
(cd "$APP.new" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error) || {
  WARN "npm ci falló; instalo herramientas de compilación y reintento"
  apt-get install -y -qq build-essential python3 >/dev/null
  (cd "$APP.new" && PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error)
}
(cd "$APP.new" && "$NODE_DIR/bin/node" -e "require('sharp'); require('better-sqlite3'); require('express')") || DIE "las dependencias no cargan"
chown -R root:root "$APP.new" && chmod -R go-w "$APP.new"
install -d -o root -g root -m 755 /var/cache/fontconfig

# ------------------------------------------------------------------ 5. systemd
for u in convertia-web.service convertia-worker.service convertia-cleanup.service convertia-cleanup.timer; do
  install -m 644 "$SRC/deploy/systemd/$u" /etc/systemd/system/$u
done
systemctl daemon-reload
systemctl stop convertia-worker convertia-web 2>/dev/null || true
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"; mv "$APP.new" "$APP"; rm -rf "$APP.old"
systemctl enable --now convertia-web.service convertia-worker.service convertia-cleanup.timer >/dev/null 2>&1
systemctl restart convertia-web.service; sleep 1; systemctl restart convertia-worker.service
for i in $(seq 1 60); do
  curl --noproxy "*" -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"worker":true' && break; sleep 0.5
done
curl --noproxy "*" -fsS "http://127.0.0.1:$PORT/api/health" | grep -q '"worker":true' || {
  journalctl -u convertia-web -u convertia-worker -n 40 --no-pager; DIE "la aplicación no arranca"; }
LOG "Servicios en marcha (web en 127.0.0.1:$PORT, worker sin red)."

# ------------------------------------------------------------------ 6. dominio
detect_ip() {
  [ -n "${PUBLIC_IP:-}" ] && { echo "$PUBLIC_IP"; return; }
  for u in https://api.ipify.org https://ipv4.icanhazip.com https://ifconfig.me/ip; do
    ip="$(curl -4fsS --max-time 8 "$u" 2>/dev/null | tr -d '[:space:]')" && [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && { echo "$ip"; return; }
  done
  { ip -4 route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | cut -d' ' -f2; } || true
}
resolve() { { dig +short +time=3 +tries=2 A "$1" @1.1.1.1 2>/dev/null; dig +short +time=3 A "$1" 2>/dev/null; getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}'; } | grep -E '^[0-9.]+$' | sort -u; }
IP="$(detect_ip)"; [ -n "$IP" ] || DIE "no he podido averiguar la IP pública"
PREFIX=""
if [ -n "${SHARED_DOMAIN:-}" ] && [ -n "${BASE_PATH:-}" ]; then
  DOMAIN="$SHARED_DOMAIN"; PREFIX="/${BASE_PATH#/}"; PREFIX="${PREFIX%/}"
  DOMAIN_REASON="regla de la casa: subcarpeta $PREFIX del dominio compartido $SHARED_DOMAIN"
elif [ -n "${DOMAIN:-}" ] && resolve "$DOMAIN" | grep -qx "$IP"; then
  DOMAIN_REASON="dominio previsto ($DOMAIN) y su DNS apunta a esta máquina ($IP)"
else
  [ -n "${DOMAIN:-}" ] && WARN "el dominio $DOMAIN no apunta a $IP (apunta a: $(resolve "$DOMAIN" | tr '\n' ' ')); uso sslip.io"
  REASON0="${DOMAIN:+el dominio previsto $DOMAIN no apunta a esta IP; }"
  DOMAIN="${IP//./-}.sslip.io"
  DOMAIN_REASON="${REASON0}no hay dominio propio apuntando aquí: sslip.io con la IP pública $IP"
fi
LOG "Dominio: $DOMAIN ($DOMAIN_REASON)"

# ------------------------------------------------------------------ 7. nginx
install -m 644 "$SRC/deploy/nginx/convertia-proxy.conf" /etc/nginx/snippets/convertia-proxy.conf
REWRITE=""; [ -n "$PREFIX" ] && REWRITE="    rewrite ^$PREFIX(/.*)\$ \$1 break;"
sed -e "s#__PREFIX__#$PREFIX#g" -e "s#__PORT__#$PORT#g" "$SRC/deploy/nginx/convertia-locations.conf.tpl" \
  | awk -v r="$REWRITE" '{ if ($0 == "__REWRITE__") { if (r != "") print r } else print }' > /etc/nginx/snippets/convertia-locations.conf
V6=""; [ -f /proc/net/if_inet6 ] && V6="    listen [::]:80;"
NGV="$(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
newer() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]; }
SITE=/etc/nginx/sites-available/convertia.conf
install -d -m 755 /var/www/convertia-acme
backup_nginx() { rm -rf /root/.convertia-nginx-backup; cp -a /etc/nginx /root/.convertia-nginx-backup; }
restore_nginx() { rm -rf /etc/nginx; cp -a /root/.convertia-nginx-backup /etc/nginx; }

write_site() { # $1 = cert, $2 = key, $3 = hsts(yes/no)
  local https="" body="    include /etc/nginx/snippets/convertia-locations.conf;"
  if [ -n "$1" ]; then
    local l443="    listen 443 ssl;"; local h2="    http2 on;"
    newer "$NGV" 1.25.1 || { l443="    listen 443 ssl http2;"; h2=""; }
    local l443v6=""; [ -n "$V6" ] && l443v6="${l443/listen /listen [::]:}"
    body='    location / { return 301 https://$host$request_uri; }'
    https="server {
$l443
$l443v6
$h2
    server_name $DOMAIN;
    ssl_certificate $1;
    ssl_certificate_key $2;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:convertia:10m;
    ssl_session_timeout 1d;
    access_log off;
$( if [ "$3" = yes ]; then echo '    add_header Strict-Transport-Security "max-age=31536000" always;'; fi )
    include /etc/nginx/snippets/convertia-locations.conf;
}"
  fi
  awk -v d="$DOMAIN" -v v6="$V6" -v body="$body" -v https="$https" '{
    gsub("__DOMAIN__", d);
    if ($0 == "__LISTEN80_V6__") { if (v6 != "") print v6; next }
    if ($0 == "__HTTP_BODY__") { print body; next }
    if ($0 == "__HTTPS_BLOCK__") { print https; next }
    print }' "$SRC/deploy/nginx/convertia-site.conf.tpl" | grep -v '^[[:space:]]*$' > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/convertia.conf
}

reload_nginx() {
  # Máquinas sin IPv6: si nginx no puede abrir [::], se regenera el sitio solo con IPv4.
  if [ -n "$V6" ] && [ -f "$SITE" ] && nginx -t 2>&1 | grep -q 'Address family not supported'; then
    WARN "esta máquina no admite IPv6: el sitio escucha solo en IPv4"
    V6=""; sed -i '/listen \[::\]/d' "$SITE"
  fi
  if nginx -t >/dev/null 2>&1; then
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl is-active --quiet nginx && systemctl reload nginx || systemctl restart nginx
  else
    nginx -t || true; restore_nginx; systemctl reload nginx 2>/dev/null || true
    DIE "la configuración de nginx no es válida; he restaurado la anterior"
  fi
}

backup_nginx
CERT_MODE_FINAL=""; CERT_REASON=""
if [ -n "$PREFIX" ]; then
  # Subcarpeta de un dominio que ya existe: se añade un include a SU bloque server (443 si lo hay).
  CONF="$(grep -rlE "server_name[^;]*[[:space:]]$DOMAIN([[:space:];]|$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)"
  [ -n "$CONF" ] || DIE "no encuentro en nginx un server para $DOMAIN donde colgar $PREFIX"
  CONF="$(readlink -f "$CONF")"
  if ! grep -q 'snippets/convertia-locations.conf' "$CONF"; then
    awk -v d="$DOMAIN" '
      /server_name/ && index($0, d) && !done { print; print "    include /etc/nginx/snippets/convertia-locations.conf;  # Convertia"; if (seen443) done=1; next }
      /listen[^;]*443/ { seen443=1 } { print }' "$CONF" > "$CONF.convertia.tmp" && mv "$CONF.convertia.tmp" "$CONF"
  fi
  reload_nginx
  if grep -qE 'listen[^;]*443' "$CONF"; then
    SCHEME=https; CERT_MODE_FINAL="existente"; CERT_REASON="se usa el certificado que ya tiene $DOMAIN"
  else
    SCHEME=http; CERT_MODE_FINAL="ninguno"; CERT_REASON="el dominio compartido $DOMAIN solo sirve HTTP; no se toca su configuración TLS"
    WARN "$CERT_REASON"
  fi
  URL="$SCHEME://$DOMAIN$PREFIX/"
else
  LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  SS_DIR=/etc/ssl/convertia; SS_CERT="$SS_DIR/$DOMAIN.crt"; SS_KEY="$SS_DIR/$DOMAIN.key"
  if [ "${CERT_MODE:-}" != selfsigned ] && [ -s "$LE_CERT" ] && openssl x509 -checkend 864000 -noout -in "$LE_CERT" >/dev/null 2>&1; then
    CERT_MODE_FINAL="letsencrypt"; CERT_REASON="certificado de Let's Encrypt ya emitido y vigente"
  elif [ "${CERT_MODE:-}" != selfsigned ]; then
    write_site "" "" no; reload_nginx   # primero solo HTTP para el reto ACME
    LOG "Pidiendo certificado a Let's Encrypt para $DOMAIN…"
    if OUT="$(certbot certonly ${CERTBOT_STAGING:+--staging} --webroot -w /var/www/convertia-acme -d "$DOMAIN" --non-interactive --agree-tos \
        --register-unsafely-without-email --keep-until-expiring --deploy-hook 'systemctl reload nginx' 2>&1)"; then
      CERT_MODE_FINAL="letsencrypt"; CERT_REASON="certificado válido de Let's Encrypt"
    else
      { echo "$OUT" | tail -8 | sed 's/^/    /'; } || true
      if grep -qiE 'too many certificates|rateLimited|rate limit' <<<"$OUT"; then
        CERT_REASON="Let's Encrypt ha rechazado la emisión por límite de emisiones (rate limit)"
      else
        DETAIL="$( { grep -oiE 'Detail: .*' <<<"$OUT" || grep -iE 'error|exception|refused|timed? ?out|unauthorized|NXDOMAIN' <<<"$OUT" | grep -v 'unexpected error occurred' || true; } | head -1 | sed 's/^[[:space:]]*//' | cut -c1-200)"
        CERT_REASON="Let's Encrypt no ha emitido el certificado (${DETAIL:-motivo desconocido})"
      fi
      WARN "$CERT_REASON → uso un certificado autofirmado"
    fi
  else
    CERT_REASON="certificado autofirmado forzado (CERT_MODE=selfsigned, entorno de pruebas)"
  fi
  if [ "$CERT_MODE_FINAL" = letsencrypt ]; then
    write_site "$LE_CERT" "$LE_KEY" yes
  else
    CERT_MODE_FINAL="autofirmado"
    install -d -m 700 "$SS_DIR"
    if ! openssl x509 -checkend 864000 -noout -in "$SS_CERT" >/dev/null 2>&1; then
      openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes -keyout "$SS_KEY" -out "$SS_CERT" \
        -subj "/CN=$DOMAIN" -addext "subjectAltName=DNS:$DOMAIN" >/dev/null 2>&1
      chmod 600 "$SS_KEY"
    fi
    write_site "$SS_CERT" "$SS_KEY" no
  fi
  reload_nginx
  URL="https://$DOMAIN/"
fi

# ------------------------------------------------------------------ 8. cortafuegos: abrir 80 y 443, el resto igual
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; LOG "ufw: abiertos 80 y 443 (el resto, como estaba)"
elif systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd -q --permanent --add-service=http --add-service=https && firewall-cmd -q --reload; LOG "firewalld: abiertos http y https"
elif command -v iptables >/dev/null && iptables -S INPUT 2>/dev/null | grep -qE '^-P INPUT (DROP|REJECT)'; then
  for p in 80 443; do iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport $p -j ACCEPT; done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
  LOG "iptables: abiertos 80 y 443"
else
  LOG "Cortafuegos: no hay ninguno activo que bloquee 80/443; no se toca nada."
fi

# ------------------------------------------------------------------ 9. comprobación final
SCHEME="${SCHEME:-https}"; P=443; [ "$SCHEME" = http ] && P=80
curl --noproxy "*" -fsS -k --resolve "$DOMAIN:$P:127.0.0.1" "$SCHEME://$DOMAIN$PREFIX/api/health" | grep -q '"worker":true' \
  || DIE "nginx no sirve la aplicación en $SCHEME://$DOMAIN$PREFIX/"
cat > "$INFO" <<EOF
URL="$URL"
DOMAIN="$DOMAIN"
DOMAIN_REASON="$DOMAIN_REASON"
CERT_MODE="$CERT_MODE_FINAL"
CERT_REASON="$CERT_REASON"
PORT="$PORT"
PUBLIC_IP="$IP"
DEPLOYED_AT="$(date -Is)"
EOF
LOG "Listo: $URL  (certificado: $CERT_MODE_FINAL)"
