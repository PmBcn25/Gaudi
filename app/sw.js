// Service worker: guarda la app para que abra al instante y funcione sin conexión
// (la generación con IA sí necesita Internet). Cambia VERSION al publicar cambios.
const VERSION = "gaudi-v1";
const ARCHIVOS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/opciones.js", "js/prompt.js", "js/ia.js", "js/almacen.js", "js/imagen.js",
  "icons/icono.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para la app (así siempre llega la última versión) y caché si no hay conexión.
// Las llamadas a la IA (otros dominios) no pasan por aquí.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
