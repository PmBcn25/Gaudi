// Prueba de humo del panel en Chromium (node --test): todas las secciones se
// pintan sin errores, la importación funciona en el navegador (IndexedDB) y en
// el panel publicado (db simulada, en trozos de menos de 256 KiB).
// Las reseñas de esta prueba son inventadas y solo existen durante el test.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(dir)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(body);
      } catch { res.writeHead(404).end(); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function fakeExport(asin, n) {
  const bodies = {
    5: 'Stunning photography and detailed plans. Perfect before our trip.',
    4: 'Good overview. I wish it had more diagrams of the structure.',
    3: 'Interesting, but too much religion and not enough architecture.',
    2: 'No photos at all, not a diagram anywhere.',
    1: 'Arrived damaged. Very disappointed.'
  };
  const reviews = Array.from({ length: n }, (_, i) => {
    const rating = [5, 5, 4, 3, 5, 2, 5, 1, 4, 5][i % 10];
    return { id: `T${asin}${i}`, author: `Lector de prueba ${i}`, rating, title: `Prueba ${i}`, body: bodies[rating] + ' ' + 'x'.repeat(i % 7),
      date: `${2018 + (i % 9)}-0${1 + (i % 9)}-1${i % 9}`, country: 'Estados Unidos', verified: i % 3 !== 0, helpful: i % 13, images: 0, section: 'main' };
  });
  return { schema: 'kdp-reviews/1', exportedAt: '2026-09-29T12:00:00Z', tool: 'prueba', pageUrl: `https://www.amazon.com/-/es/portal/customer-reviews/${asin}/`,
    complete: true, book: { asin, rating: 4.4, ratingsTotal: 140, histogram: { 5: 70, 4: 15, 3: 7, 2: 4, 1: 4 } }, reviews };
}

const ROUTES = ['inicio', 'libros', 'libro-1632867818', 'resenas', 'resenas-1632867818', 'comparativa', 'temas', 'competencia',
  'contexto', 'nichos', 'avatares', 'enfoques', 'entrar', 'no-entrar', 'posicionamiento', 'plan', 'importar', 'metodologia',
  'propuestas', 'fortalezas'];

let server, browser, base, tmp;
test.before(async () => {
  server = await serve(root);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  tmp = await mkdtemp(path.join(tmpdir(), 'catenaria-'));
  await writeFile(path.join(tmp, 'resenas-1632867818.json'), JSON.stringify(fakeExport('1632867818', 40)));
});
test.after(async () => { await browser?.close(); server?.close(); });

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route(/^https:\/\//, (r) => r.abort()); // sin red: fuentes y portadas externas fuera
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, errors, context };
}

test('todas las secciones se pintan sin errores y sin desbordar el ancho', async () => {
  const { page, errors, context } = await newPage();
  for (const r of ROUTES) {
    await page.goto(`${base}/index.html#${r}`);
    await page.waitForSelector('.page h1, .window h1', { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${r}: desborda ${overflow}px`);
    assert.equal(await page.locator('.callout.crit').count(), 0, `${r}: sección con error`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('importar en el navegador: recalcula, no duplica, persiste y se puede borrar', async () => {
  const { page, errors, context } = await newPage();
  await page.goto(`${base}/index.html#importar`);
  await page.setInputFiles('#import-file', path.join(tmp, 'resenas-1632867818.json'));
  await page.waitForFunction(() => window.KDPStore.imports.length === 1);
  await page.setInputFiles('#import-file', path.join(tmp, 'resenas-1632867818.json'));
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.KDPStore.imports[0].reviews.length), 40);
  await page.reload();
  await page.waitForFunction(() => window.KDPStore.imports.length === 1);
  await page.goto(`${base}/index.html#resenas-1632867818`);
  await page.waitForSelector('.tab');
  assert.match(await page.locator('.tabs').innerText(), /Todas\s*40/);
  await page.goto(`${base}/index.html#inicio`);
  await page.waitForSelector('.verdict');
  // reseñas reales ya guardadas en el repositorio (data/raw) + las 40 de la prueba
  const enRepositorio = await page.evaluate(() => Object.values(window.KDP_DATASET.reviews).reduce((n, l) => n + l.length, 0));
  assert.match(await page.locator('.kpis').first().innerText(), new RegExp(`Reseñas importadas\\s*${enRepositorio + 40}`));
  await page.goto(`${base}/index.html#importar`);
  await page.getByRole('button', { name: 'Borrar' }).click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await page.waitForFunction(() => window.KDPStore.imports.length === 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('panel publicado: guarda en la db en trozos de menos de 256 KiB y vuelve a leerlos', async () => {
  const { page, errors, context } = await newPage();
  // db simulada con la misma interfaz que claude.use('db')
  await page.addInitScript(() => {
    const store = {};
    const segs = (p) => p.split('/');
    const snap = (p) => ({ id: segs(p).pop(), exists: !!store[p], data: () => store[p] && JSON.parse(JSON.stringify(store[p])) });
    const query = (col) => { const n = segs(col).length; const docs = Object.keys(store).filter((p) => p.startsWith(col + '/') && segs(p).length === n + 1).sort().map(snap); return { docs, size: docs.length, empty: !docs.length }; };
    const db = {
      doc: (p) => ({ id: segs(p).pop(), path: p, get: async () => snap(p),
        set: async (d) => { if (JSON.stringify(d).length > 256 * 1024) throw { code: 'invalid_argument' }; store[p] = JSON.parse(JSON.stringify(d)); },
        delete: async () => { delete store[p]; } }),
      collection: (p) => ({ path: p, get: async () => query(p), onSnapshot: () => () => {}, doc: (id) => db.doc(p + '/' + id) })
    };
    window.__store = store;
    window.claude = { use: async (name) => (name === 'db' ? db : null) };
  });
  const big = fakeExport('3836566192', 900);
  big.reviews.forEach((r) => { r.body += ' ' + 'lorem '.repeat(80); });
  await writeFile(path.join(tmp, 'grande.json'), JSON.stringify(big));
  await page.goto(`${base}/index.html#importar`);
  await page.waitForFunction(() => window.KDPStore.backend === 'artefacto');
  await page.setInputFiles('#import-file', path.join(tmp, 'grande.json'));
  await page.waitForFunction(() => window.KDPStore.imports.length === 1, null, { timeout: 10000 });
  const docs = await page.evaluate(() => Object.keys(window.__store));
  const chunks = docs.filter((d) => d.startsWith('imports/3836566192/chunks/'));
  assert.ok(chunks.length > 1, 'debería trocear las reseñas');
  assert.ok(docs.includes('imports/3836566192'));
  // relectura desde la db
  const reread = await page.evaluate(async () => {
    const db = await window.claude.use('db');
    const meta = (await db.doc('imports/3836566192').get()).data();
    const cs = await db.collection('imports/3836566192/chunks').get();
    return { count: meta.count, chunks: meta.chunks, total: cs.docs.reduce((s, d) => s + d.data().reviews.length, 0) };
  });
  assert.equal(reread.count, 900);
  assert.equal(reread.total, 900);
  assert.equal(reread.chunks, chunks.length);
  assert.deepEqual(errors, []);
  await context.close();
});
