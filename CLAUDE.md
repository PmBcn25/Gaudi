# Convertia — runbook

Conversor de archivos con formato SaaS (landing + herramienta + precios + FAQ + acceso + legal).
La herramienta funciona **sin cuentas**: sin registro, sin login, sin cookies, sin historial.
Precios, cuentas y textos legales son *placeholder* (fake door): están, pero no hacen nada.

## Estructura

```
app/                      la aplicación (Node.js 20 + Express, sin build)
  src/server.js           servidor web: solo 127.0.0.1, API, SSE, estáticos con ?v=hash
  src/worker.js           worker aparte: cola SQLite, 2 trabajos máx., 1 LibreOffice máx., 15 min máx.
  src/cleanup.js          borra todo lo que supere 30 min (timer de systemd cada 10 min)
  src/formats.js          catálogo: qué entra, qué sale, opciones de cada salida
  src/detect.js           tipo real del archivo por su contenido (cabeceras, ZIP, OLE2, texto)
  src/convert/*.js        imagen (sharp/libheif/FFmpeg), audio/vídeo (FFmpeg), LibreOffice,
                          Ghostscript/qpdf, Pandoc (+ lua/safe.lua), subtítulos
  public/                 index.html, acceso.html, terminos.html, privacidad.html, app.css, app.js,
                          icon.svg, fonts/inter-latin-var.woff2 (todo relativo, sin terceros)
deploy/deploy.sh          despliegue con una orden (idempotente)
deploy/remote-setup.sh    lo que se ejecuta en el servidor (como root)
deploy/systemd/           convertia-web, convertia-worker (sin red), convertia-cleanup(.timer)
deploy/nginx/             plantillas: proxy, SSE sin búfer, gzip, sin access_log
scripts/vps.sh            ejecutar comandos en el VPS por SSH
tests/                    pruebas contra la URL pública (ver abajo)
```

## Conexión con el VPS

`scripts/vps.sh '<comando>'` ejecuta un comando remoto. Toma la conexión, por orden, de:

1. Variables de entorno `VPS_HOST`, `VPS_USER` (por defecto root), `VPS_PORT` (22), `VPS_KEY`.
2. `deploy/vps.env` (no se versiona), con esas mismas variables.
3. Este archivo: una línea `VPS_HOST=<ip-del-vps>` / `VPS_USER=<usuario>`, o un comando ssh de ejemplo.

La clave privada va en `secret/` (no se versiona): `scripts/vps.sh` usa el primer archivo de esa carpeta
que contenga una clave privada. La huella del servidor se guarda en `secret/known_hosts`; no se toca
`~/.ssh`. **No generar claves nuevas ni cambiar la configuración SSH del servidor.**

Si el usuario no es root necesita `sudo` sin contraseña.

## Dominio

Orden de preferencia (lo decide `deploy/remote-setup.sh`, sin preguntar):

1. Un dominio previsto (variable `DOMAIN` en el entorno o en `deploy/vps.env`, o una línea que empiece
   por `DOMAIN=` en este archivo) **si su DNS apunta a la IP del VPS** (se comprueba con `dig`).
   Ahora mismo no hay ninguno previsto.
2. Si no, `<ip-con-guiones>.sslip.io` (p. ej. `203-0-113-45.sslip.io`) con certificado real de Let's Encrypt.
3. Solo si Let's Encrypt falla (límite de emisiones u otro motivo): certificado autofirmado, y el
   despliegue lo avisa en voz alta.

Regla de la casa opcional: para publicar en una subcarpeta de un dominio compartido que ya sirve nginx,
define `SHARED_DOMAIN` y `BASE_PATH` (p. ej. `/convertia`). Todas las rutas del frontend son relativas,
así que funciona igual en la raíz que en una subcarpeta.

## Desplegar

```bash
deploy/deploy.sh            # primera vez y actualizaciones: misma orden
deploy/deploy.sh --test     # y además todas las pruebas contra la URL pública
```

Qué hace (idempotente, sin pisar nada ajeno):

- Inventario previo de la máquina (puertos, servicios, sitios nginx) en `/var/conversor/inventario-*.txt`.
  Si 80/443 los usa algo que no es nginx, se detiene sin tocar nada.
- Paquetes: ffmpeg, libvips, libreoffice-core + writer/calc/impress, ghostscript, qpdf, pandoc, zip,
  libheif-examples + plugins libde265/x265, fuentes (liberation, dejavu, carlito, caladea), nginx, certbot.
- Node.js 20 **privado** en `/var/conversor/node` (no toca el Node del sistema ni de otros proyectos).
- 2 GB de swap (`/swapfile-convertia`) si no hay ninguna.
- Usuario de sistema `convertia`; datos en `/var/conversor/{tmp,db,run,home}`; código en `/var/conversor/app`.
- Puerto interno 3100 en 127.0.0.1 (si está ocupado por otro programa, el siguiente libre; queda en
  `/etc/convertia.env`).
- systemd: `convertia-web`, `convertia-worker` (PrivateNetwork, ProtectSystem=strict, solo escribe en
  /var/conversor, no ve /home, /srv, /opt ni el resto de /var), `convertia-cleanup.timer`. Todo habilitado
  para el arranque y con reinicio automático.
- nginx: sitio propio `convertia.conf` (otros sitios intactos), SSE con `proxy_buffering off` y
  `X-Accel-Buffering: no`, gzip, subidas de 200 MB en streaming, **sin access_log**.
- Certificado (ver «Dominio») y cortafuegos: abre 80 y 443 (ufw/firewalld/iptables) y deja el resto igual.
- Resultado en `/var/conversor/deploy-info.env` (y una copia local en `deploy/last-deploy.env`).

## Probar

```bash
BASE_URL=https://<dominio>/ tests/run-all.sh            # todo menos el reinicio
BASE_URL=https://<dominio>/ tests/run-all.sh --reboot   # incluido reiniciar el VPS entero
```

`tests/gen-fixtures.sh` genera archivos reales (necesita ffmpeg, pandoc, libreoffice, ghostscript, qpdf,
heif-enc). El límite es de 20 conversiones/hora por IP y **no se sube**: las pruebas van en tandas y
reinician `convertia-web` entre tandas (el contador vive solo en memoria).

| Script | Qué comprueba |
|---|---|
| `conversions.mjs` | una conversión real de cada una de las 7 categorías |
| `formats.mjs` | cada formato de salida al menos una vez, con cabecera mágica y códec (ffprobe) |
| `progress.mjs` | eventos SSE por segundo, salto máximo, monotonía; páginas de Ghostscript |
| `errors-queue.mjs` | errores claros, cola «1º de 2», 1 LibreOffice a la vez, cancelar, límite 20/h |
| `browser.mjs` | Chromium escritorio y 375 px: desbordes, consola, terceros, dropeador, acceso |
| `weight.mjs` | peso gzip, `?v=hash` + immutable, HTML no-cache + ETag, CSP, sin cookies |
| `external.sh` | HTTPS con certificado válido, HTTP→HTTPS, puerto interno cerrado desde fuera |
| `reboot.sh` | `reboot` del VPS y comprobación de que todo vuelve solo |

## Operar

```bash
scripts/vps.sh 'journalctl -u convertia-web -u convertia-worker -n 100 --no-pager'
scripts/vps.sh 'systemctl restart convertia-web convertia-worker'
scripts/vps.sh 'cat /var/conversor/deploy-info.env'
```

Privacidad: ninguna tabla ni log relaciona IP y archivo. El límite por IP usa un HMAC con una clave
aleatoria que muere con el proceso. nginx no escribe access_log para Convertia.

## Trampas conocidas (no volver a tropezar)

- Pandoc 3.1.x (Ubuntu 24.04) falla con `--sandbox`: no se usa; lo compensan `src/lua/safe.lua`
  (descarta imágenes absolutas, con `..`, con esquema o inexistentes, y HTML/LaTeX en bruto peligroso),
  la carpeta de trabajo vacía y el aislamiento de systemd. LaTeX, rST y Org no se aceptan como entrada.
- El escritor PPTX de Pandoc aborta con imágenes inexistentes: el filtro las cambia por su texto.
- WebM grabados en el navegador no traen duración: se calcula recorriendo los paquetes.
- Vídeos de tasa variable: `-fps_mode vfr` (salvo AVI y GIF).
- sharp no lee BMP/ICO/TGA/PSD/JXL/JP2/DDS/EXR (ni TIFF YCbCr): se decodifican antes a PNG con FFmpeg.
- LibreOffice con CSV/TSV necesita `--infilter` (se detecta coma/punto y coma) y filtro por salida.
- LibreOffice deja hijos: se lanza en su propio grupo y se mata el grupo entero.
- qpdf devuelve 3 cuando termina con avisos: es éxito.
- FFmpeg siempre con `-protocol_whitelist file` y `-format_whitelist` (nada de m3u8/ffconcat).
- Una paleta de GIF por fotograma (`palettegen=stats_mode=single` + `paletteuse=new=1`) para escribir en
  streaming; con `palettegen` normal sobre una entrada infinita se agota la memoria.
