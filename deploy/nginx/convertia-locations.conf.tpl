# Convertia: ubicaciones (generado por deploy/remote-setup.sh; no editar a mano).
# Privacidad: sin access_log en ninguna ruta de la aplicación.

# Subidas: hasta 200 MB, en streaming hacia la app (el progreso de subida es real).
location __PREFIX__/api/upload {
    access_log off;
    error_log /var/log/nginx/convertia-error.log crit;
    client_max_body_size 200m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_pass http://127.0.0.1:__PORT__/api/upload;
    include /etc/nginx/snippets/convertia-proxy.conf;
}

# Progreso en tiempo real (SSE): nada de búfer ni compresión, o llega a trompicones.
location ~ ^__PREFIX__/api/jobs/[A-Za-z0-9_-]+/events$ {
    access_log off;
    error_log /var/log/nginx/convertia-error.log crit;
__REWRITE__
    proxy_pass http://127.0.0.1:__PORT__;
    include /etc/nginx/snippets/convertia-proxy.conf;
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 1h;
    add_header X-Accel-Buffering no always;
}

# Todo lo demás: páginas, recursos con caché inmutable, API y descargas.
location __PREFIX__/ {
    access_log off;
    error_log /var/log/nginx/convertia-error.log crit;
    client_max_body_size 1m;
    proxy_pass http://127.0.0.1:__PORT__/;
    include /etc/nginx/snippets/convertia-proxy.conf;
    proxy_max_temp_file_size 0;
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/css text/javascript application/javascript application/json image/svg+xml text/plain;
}
