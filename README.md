# Convertia

Conversor de archivos web con formato SaaS: imágenes, audio, vídeo, documentos, PDF, libros y
subtítulos. Funciona **gratis y sin registro** (sin cuentas, sin cookies, sin historial); los archivos
se borran solos a los 30 minutos. Progreso real por SSE (FFmpeg, Ghostscript), cola real y errores
en lenguaje claro.

- Código: `app/` (Node.js 20 + Express, worker aparte con cola SQLite; frontend sin dependencias).
- Despliegue con una orden: `deploy/deploy.sh` (ver `CLAUDE.md`).
- Pruebas contra la URL pública: `BASE_URL=https://… tests/run-all.sh [--reboot]`.
- Edición navegador (sin servidor, publicada en Claude): https://claude.ai/artifact/HK5nQbX2xk3VUUthyLdybS — código en `edicion-navegador/`.

Precios, cuentas y textos legales son maquetas (*fake door*): no hay pagos, ni usuarios, ni correos.
