# Convertia en __DOMAIN__ (generado por deploy/remote-setup.sh; no editar a mano).
server {
    listen 80;
__LISTEN80_V6__
    server_name __DOMAIN__;
    access_log off;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/convertia-acme;
        default_type text/plain;
    }
__HTTP_BODY__
}
__HTTPS_BLOCK__
