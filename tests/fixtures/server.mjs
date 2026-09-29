// Servidor estático mínimo (node:http) que sirve las páginas de prueba con las mismas rutas que
// Amazon. Lo usan los tests; también se puede arrancar a mano para probar el marcador:
//   node tests/fixtures/server.mjs [puerto]   →   http://127.0.0.1:8765/-/es/dp/TESTASIN01
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

const LANG = '(?:/-/[a-z]{2}(?:[_-][a-z]{2})?)?';
const DP_RE = new RegExp(`^${LANG}/(?:[^/]+/)?(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)`, 'i');
const REVIEWS_RE = new RegExp(`^${LANG}/(?:[^/]+/)?(?:portal/customer-reviews|product-reviews)/([A-Z0-9]{10})(?:[/?]|$)`, 'i');

async function sendFile(res, name, status = 200) {
  const html = await readFile(join(HERE, name));
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

/**
 * Starts the fixture server.
 * Routes: /-/es/dp/TESTASIN01 (ficha), /-/es/portal/customer-reviews/TESTASIN01 (reseñas ES con
 * «Mostrar 10 opiniones más»), /product-reviews/TESTASIN02?pageNumber=1..3 (paginación EN),
 * reseñas de TESTLOGIN1 → redirección a /ap/signin, /errors/validateCaptcha, /images/* (GIF 1×1).
 * @returns {Promise<{url: string, port: number, hits: string[], close: () => Promise<void>}>}
 */
export async function startFixtureServer({ port = 0, host = '127.0.0.1' } = {}) {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || host}`);
      const path = url.pathname;
      hits.push(path + url.search);
      if (path.startsWith('/images/grande/')) { // image over the 60 KB coverData limit
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(Buffer.alloc(70 * 1024, 7));
        return;
      }
      if (path.startsWith('/images/')) {
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'max-age=3600' });
        res.end(GIF);
        return;
      }
      if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      let m = path.match(DP_RE);
      if (m) {
        if (m[1].toUpperCase() === 'TESTASIN01') return await sendFile(res, 'ficha-producto-es.html');
        return await sendFile(res, 'no-encontrado.html', 404);
      }
      m = path.match(REVIEWS_RE);
      if (m) {
        const asin = m[1].toUpperCase();
        if (asin === 'TESTASIN01') return await sendFile(res, 'resenas-portal-es.html');
        if (asin === 'TESTASIN02') {
          const n = parseInt(url.searchParams.get('pageNumber') || '1', 10);
          if (n >= 1 && n <= 3) return await sendFile(res, `resenas-paginadas-en-p${n}.html`);
          return await sendFile(res, 'no-encontrado.html', 404);
        }
        if (asin === 'TESTLOGIN1') {
          res.writeHead(302, { Location: `/ap/signin?openid.return_to=${encodeURIComponent(url.href)}` });
          res.end();
          return;
        }
        return await sendFile(res, 'no-encontrado.html', 404);
      }
      if (path === '/ap/signin') return await sendFile(res, 'inicio-sesion.html');
      if (path === '/errors/validateCaptcha') return await sendFile(res, 'captcha.html');
      return await sendFile(res, 'no-encontrado.html', 404);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(err && err.stack ? err.stack : err));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actual = server.address().port;
  return {
    url: `http://${host}:${actual}`,
    port: actual,
    hits,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    })
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = parseInt(process.argv[2] || '8765', 10);
  const srv = await startFixtureServer({ port });
  console.log(`Servidor de páginas de prueba en ${srv.url}`);
  console.log(`  Ficha (ES):             ${srv.url}/-/es/dp/TESTASIN01`);
  console.log(`  Reseñas (ES, «Mostrar 10 opiniones más»): ${srv.url}/-/es/portal/customer-reviews/TESTASIN01/ref=cm_cr_dp_d_show_all_top?ie=UTF8&reviewerType=all_reviews`);
  console.log(`  Reseñas (EN, paginadas): ${srv.url}/product-reviews/TESTASIN02/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`);
  console.log('Pulsa Ctrl+C para parar.');
}
