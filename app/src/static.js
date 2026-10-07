'use strict';
// Recursos estáticos servidos desde memoria. CSS, JS, SVG y la tipografía se
// referencian con ?v=<hash del contenido> y se cachean un año (immutable);
// el HTML va con no-cache + ETag. Las rutas son relativas, así que todo funciona
// igual en la raíz de un dominio que colgado de una subcarpeta.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

function load() {
  const dir = config.publicDir;
  const read = (f) => fs.readFileSync(path.join(dir, f));
  const assets = new Map(); // ruta -> { body, type, hash, immutable }
  const add = (name, body, immutable) => assets.set(name, { body, type: TYPES[path.extname(name)] || 'application/octet-stream', hash: hash(body), immutable });

  // 1) Binarios y SVG, tal cual.
  for (const f of ['fonts/inter-latin-var.woff2', 'icon.svg', 'fonts/OFL.txt']) add(f, read(f), true);
  const ver = (name) => `${name}?v=${assets.get(name).hash}`;
  const rewrite = (text) => text.replace(/(["'(])(fonts\/inter-latin-var\.woff2|icon\.svg|app\.css|app\.js)(?=["')])/g,
    (m, q, name) => (assets.has(name) ? q + ver(name) : m));
  // 2) CSS (apunta a la tipografía) y JS.
  add('app.css', Buffer.from(rewrite(read('app.css').toString('utf8'))), true);
  add('app.js', Buffer.from(rewrite(read('app.js').toString('utf8'))), true);
  // 3) HTML (apunta a todo lo anterior).
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) add(f, Buffer.from(rewrite(read(f).toString('utf8'))), false);
  return assets;
}

function middleware() {
  const assets = load();
  const ROUTES = { '': 'index.html', 'index.html': 'index.html', acceso: 'acceso.html', terminos: 'terminos.html', privacidad: 'privacidad.html' };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (ROUTES[p]) p = ROUTES[p];
    const a = assets.get(p);
    if (!a) return next();
    res.setHeader('Content-Type', a.type);
    if (a.immutable && req.query.v === a.hash) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (a.immutable) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    } else {
      const etag = `"${a.hash}"`;
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', etag);
      // nginx convierte la ETag en débil (W/"…") al comprimir con gzip: se aceptan ambas.
      const inm = String(req.headers['if-none-match'] || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
      if (inm.includes(etag)) return res.status(304).end();
    }
    res.setHeader('Content-Length', a.body.length);
    if (req.method === 'HEAD') return res.end();
    return res.end(a.body);
  };
}

module.exports = { middleware, load };
