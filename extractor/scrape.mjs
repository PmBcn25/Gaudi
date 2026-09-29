#!/usr/bin/env node
// Extractor de reseñas de Amazon con Playwright — se ejecuta en TU ordenador.
//
//   npm run scrape -- [--enlaces data/enlaces.txt] [--salida data/raw] [--sin-estrellas] [--headless]
//                     [--base-url URL] [--max-clics N] [--perfil DIR] [ASIN o URL ...]
//
// Abre un Chromium con un perfil propio (.perfil-amazon) para que inicies sesión en Amazon una
// sola vez. Por cada libro: ficha del producto (/dp/) → «Ver más reseñas» → pulsa «Mostrar 10
// opiniones más» hasta el final → repite con los filtros de 1 a 5 estrellas → guarda
// data/raw/<ASIN>.json (esquema kdp-reviews/1, ver docs/formato-datos.md).
// The page-side logic lives in extractor/extractor.js (same code as the bookmarklet).
import { chromium, request as pwRequest } from 'playwright';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EXTRACTOR = join(HERE, 'extractor.js');
const DEFAULT_BASE = 'https://www.amazon.com';
const STARS = ['five_star', 'four_star', 'three_star', 'two_star', 'one_star'];
const STAR_NAMES = { five_star: '5 estrellas', four_star: '4 estrellas', three_star: '3 estrellas', two_star: '2 estrellas', one_star: '1 estrella' };
const WAIT_BLOCK_MS = 10 * 60 * 1000;
const COVER_MAX_BYTES = 60 * 1024;
// KDPX_RAPIDO=1 removes the polite pauses. Only for the automated tests against local pages.
const FAST = process.env.KDPX_RAPIDO === '1';
const PAUSE = FAST
  ? { step: [5, 20], book: [10, 30], settle: [0, 10] }
  : { step: [2000, 4500], book: [4000, 9000], settle: [800, 1600] };

const ASIN_URL_RE = /\/(?:dp|product-reviews|customer-reviews|gp\/product)\/([A-Z0-9]{10})(?=[/?#&]|$)/i;
const BARE_ASIN_RE = /^[A-Z0-9]{10}$/i;

class UsageError extends Error {}

/* ------------------------------------------------------------------ arguments & links */

export function parseArgs(argv) {
  const o = { enlaces: null, salida: null, estrellas: true, headless: false, baseUrl: null, maxClics: 400, perfil: null, positional: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    const value = () => {
      const v = inline != null ? inline : argv[++i];
      if (v == null || v === '') throw new UsageError(`Falta el valor de ${a}`);
      return v;
    };
    switch (a) {
      case '--enlaces': o.enlaces = value(); break;
      case '--salida': o.salida = value(); break;
      case '--sin-estrellas': o.estrellas = false; break;
      case '--headless': o.headless = true; break;
      case '--base-url': o.baseUrl = value().replace(/\/+$/, ''); break;
      case '--max-clics': o.maxClics = parseInt(value(), 10); break;
      case '--perfil': o.perfil = value(); break;
      case '-h': case '--help': case '--ayuda': o.help = true; break;
      default:
        if (a.startsWith('-')) throw new UsageError(`Opción desconocida: ${a}`);
        o.positional.push(argv[i]);
    }
  }
  if (!Number.isInteger(o.maxClics) || o.maxClics < 1) throw new UsageError('--max-clics debe ser un número entero positivo');
  if (o.baseUrl) {
    try { new URL(o.baseUrl); } catch { throw new UsageError(`--base-url no es una URL válida: ${o.baseUrl}`); }
  }
  return o;
}

export function extractAsin(s) {
  const t = String(s || '').trim();
  const m = t.match(ASIN_URL_RE);
  if (m) return m[1].toUpperCase();
  return BARE_ASIN_RE.test(t) ? t.toUpperCase() : null;
}

export function parseLinks(text, source = 'enlaces') {
  const entries = [], invalid = [];
  String(text).split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const asin = extractAsin(line);
    if (!asin) invalid.push({ line: idx + 1, text: line, source });
    else entries.push({ asin, url: /^https?:\/\//i.test(line) ? line : null, line: idx + 1, source });
  });
  return { entries, invalid };
}

export function dedupeEntries(entries) {
  const first = new Map(), unique = [], duplicates = [];
  for (const e of entries) {
    const prev = first.get(e.asin);
    if (prev) {
      if (!prev.url && e.url) prev.url = e.url;
      duplicates.push({ ...e, firstLine: prev.line, firstSource: prev.source });
      continue;
    }
    const copy = { ...e };
    first.set(e.asin, copy);
    unique.push(copy);
  }
  return { unique, duplicates };
}

/* ------------------------------------------------------------------ small helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = ([a, b]) => Math.round(a + Math.random() * (b - a));
const pause = (range) => sleep(between(range));
const isReviewsUrl = (u) => /\/(?:product-reviews|customer-reviews)\//i.test(String(u || ''));
const stripHash = (u) => String(u || '').split('#')[0];
const rel = (p) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const firstLine = (msg) => String(msg || '').split('\n')[0];

function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && v.length === 0); }

function withStarFilter(url, star) {
  const u = new URL(url);
  u.hash = '';
  u.searchParams.set('filterByStar', star);
  u.searchParams.set('sortBy', 'recent');
  u.searchParams.delete('pageNumber');
  if (!u.searchParams.get('reviewerType')) u.searchParams.set('reviewerType', 'all_reviews');
  return u.href;
}

function baseFor(opts, entry) {
  if (opts.baseUrl) return opts.baseUrl;
  if (entry.url) {
    try {
      const u = new URL(entry.url);
      if (/(^|\.)amazon\./i.test(u.hostname)) return u.origin;
    } catch { /* ignore */ }
  }
  return DEFAULT_BASE;
}

function rebase(url, base) {
  const u = new URL(url);
  const b = new URL(base);
  u.protocol = b.protocol;
  u.host = b.host;
  return u.href;
}

function progressPrinter() {
  let last = '';
  return {
    update(p) {
      if (!process.stdout.isTTY || !p) return;
      const parts = [`${p.count} reseñas`, `${p.clicks} clics`];
      if (p.pages) parts.push(`${p.pages} páginas`);
      const line = `    … ${parts.join(' · ')}`;
      if (line !== last) { process.stdout.write(`\r${line.padEnd(60)}`); last = line; }
    },
    done() {
      if (process.stdout.isTTY && last) process.stdout.write(`\r${' '.repeat(62)}\r`);
      last = '';
    }
  };
}
const progress = progressPrinter();

/* ------------------------------------------------------------------ page helpers */

async function goto(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load', { timeout: FAST ? 5000 : 20000 }).catch(() => {});
  await pause(PAUSE.settle); // let Amazon's scripts attach their handlers
  return resp;
}

async function inject(page, src) {
  const ready = await page.evaluate(() => !!(window.KDPExtractor && window.KDPExtractor.collect)).catch(() => false);
  if (!ready) await page.evaluate(`window.KDPX_NO_AUTORUN = true;\n${src}`);
}

async function blockKind(page, src) {
  await inject(page, src);
  return page.evaluate(() => window.KDPExtractor.detectBlock(document));
}

// Sign-in or captcha: in a visible window, wait (up to 10 min) for the user to solve it.
async function ensureAccess(page, opts, src, targetUrl) {
  let kind = null;
  try { kind = await blockKind(page, src); } catch { kind = null; }
  if (!kind) return;
  if (opts.headless) {
    throw new Error(kind === 'login'
      ? 'Amazon pide iniciar sesión y con --headless no puedes hacerlo. Ejecuta una vez sin --headless, inicia sesión en la ventana de Chromium y vuelve a lanzar el proceso (la sesión queda guardada).'
      : 'Amazon muestra un captcha y con --headless no puedes resolverlo. Ejecuta sin --headless y resuélvelo en la ventana del navegador.');
  }
  progress.done();
  console.log('');
  if (kind === 'login') {
    console.log('  ⚠ Amazon pide iniciar sesión.');
    console.log('    → Inicia sesión con tu cuenta normal en la ventana de Chromium que se ha abierto.');
    console.log('    → La sesión se guarda en el perfil .perfil-amazon: solo tendrás que hacerlo una vez.');
  } else {
    console.log('  ⚠ Amazon muestra una comprobación de seguridad (captcha).');
    console.log('    → Resuélvela en la ventana de Chromium. Si aparece a menudo, deja pasar unos minutos entre ejecuciones.');
  }
  console.log('    El proceso continuará solo en cuanto termines (espero hasta 10 minutos)…');
  const deadline = Date.now() + WAIT_BLOCK_MS;
  while (kind && Date.now() < deadline) {
    await sleep(3000);
    try { kind = await blockKind(page, src); } catch { kind = 'navegando'; }
  }
  if (kind) throw new Error('Tiempo de espera agotado (10 minutos) sin completar el inicio de sesión o el captcha.');
  console.log('  ✔ Hecho, continúo.');
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  if (targetUrl) {
    let samePath = false;
    try { samePath = new URL(page.url()).pathname === new URL(targetUrl).pathname; } catch { /* ignore */ }
    if (!samePath) {
      await goto(page, targetUrl);
      if (await blockKind(page, src)) throw new Error('Amazon sigue pidiendo iniciar sesión o captcha.');
    }
  }
}

const REVIEW_SELECTOR = '[data-hook="review"], [id^="customer_review-"], [id^="customer_review_foreign-"], div.review';

// Runs KDPExtractor.collect() inside the page (expand + parse + pagination).
async function collectOnPage(page, src, options) {
  // Reviews may be rendered by Amazon's scripts after "load": give them a moment to appear.
  await page.waitForSelector(REVIEW_SELECTOR, { timeout: FAST ? 2000 : 8000 }).catch(() => {});
  for (let attempt = 1; attempt <= 2; attempt++) {
    await inject(page, src);
    try {
      const res = await page.evaluate(async (o) => {
        const onProgress = (p) => { try { if (window.kdpxProgress) window.kdpxProgress(p); } catch (e) { /* ignore */ } };
        return window.KDPExtractor.collect(Object.assign({}, o, { onProgress }));
      }, options);
      progress.done();
      return res;
    } catch (e) {
      progress.done();
      if (attempt === 2 || !/Execution context was destroyed|navigat|context/i.test(e.message)) throw e;
      console.log('    La página cambió durante la extracción; lo intento de nuevo…');
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
    }
  }
  return null;
}

// Small cover thumbnail as a data: URI (book.coverData). Fetched from Node, without cookies,
// so it does not depend on CORS. Any failure, non-image, >60 KB or >5 s -> null.
async function coverDataFor(api, page, src, cover) {
  if (!api || !cover || /^data:/i.test(cover)) return null;
  try {
    await inject(page, src);
    const thumb = await page.evaluate((u) => window.KDPExtractor.utils.thumbUrl(u), cover);
    const res = await api.get(thumb, { timeout: 5000, failOnStatusCode: false, maxRedirects: 3 });
    const type = String(res.headers()['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!res.ok() || !type.startsWith('image/')) return null;
    const body = await res.body();
    if (!body.length || body.length > COVER_MAX_BYTES) return null;
    return `data:${type};base64,${body.toString('base64')}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ one book */

async function scrapeBook(page, entry, opts, src, version) {
  const asin = entry.asin;
  const base = baseFor(opts, entry);
  const inPage = { fast: FAST, maxClicks: opts.maxClics };

  // 1) Product page: metadata (price, formats, BSR…) + the reviews shown there.
  let productBook = null, productReviews = [], seeAll = null;
  const dpUrl = `${base}/-/es/dp/${asin}`;
  try {
    const resp = await goto(page, dpUrl);
    await ensureAccess(page, opts, src, dpUrl);
    await inject(page, src);
    const info = await page.evaluate(() => {
      const K = window.KDPExtractor;
      const see = K.findSeeAllReviews(document);
      if (see && see.el) see.el.setAttribute('data-kdpx-ver-mas', '1');
      return {
        type: K.pageType(document),
        book: K.parseProductPage(document),
        reviews: K.parseReviews(document, 'product-page'),
        seeAll: see ? { href: see.href } : null
      };
    });
    if (resp && resp.status() < 400 && info.type === 'product' && info.book.title) {
      productBook = info.book;
      productReviews = info.reviews;
      seeAll = info.seeAll;
      const price = productBook.price ? productBook.price.text : 'sin precio';
      console.log(`  · Ficha: «${productBook.title}» · ${price} · ${productBook.ratingsTotal ?? '?'} valoraciones`);
    } else {
      console.log(`  · No se pudo leer la ficha del producto (${resp ? `HTTP ${resp.status()}` : 'sin respuesta'}); sigo con las reseñas.`);
    }
  } catch (e) {
    if (/iniciar sesión|captcha|Tiempo de espera/.test(e.message)) throw e;
    console.log(`  · No se pudo abrir la ficha del producto (${firstLine(e.message)}); sigo con las reseñas.`);
  }

  // 2) Reviews page: click «Ver más reseñas» or open the link from the list.
  await pause(PAUSE.step);
  const fallbackUrl = entry.url && isReviewsUrl(entry.url)
    ? (opts.baseUrl ? rebase(entry.url, base) : entry.url)
    : `${base}/-/es/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
  const intendedUrl = seeAll && seeAll.href ? seeAll.href : fallbackUrl;
  let onProductPage = false;
  if (seeAll && seeAll.href) {
    const before = page.url();
    try {
      await Promise.all([
        page.waitForURL((u) => u.href !== before, { timeout: 20000, waitUntil: 'domcontentloaded' }),
        page.click('[data-kdpx-ver-mas]', { timeout: 10000 })
      ]);
      await page.waitForLoadState('load', { timeout: FAST ? 5000 : 20000 }).catch(() => {});
      await pause(PAUSE.settle);
    } catch {
      await goto(page, seeAll.href);
    }
  } else if (seeAll && productBook) {
    onProductPage = true; // «Ver más reseñas» expands the list in place
    await page.click('[data-kdpx-ver-mas]', { timeout: 10000 }).catch(() => {});
    await pause(PAUSE.settle);
  } else {
    await goto(page, fallbackUrl);
  }
  await ensureAccess(page, opts, src, onProductPage ? null : intendedUrl);
  await inject(page, src);

  // A reviews page that only links to the full list: follow it once.
  if (!onProductPage) {
    const hop = await page.evaluate(() => {
      const K = window.KDPExtractor;
      const s = K.findSeeAllReviews(document);
      return { loadMore: !!K.findLoadMore(document), href: s && s.href };
    });
    if (!hop.loadMore && hop.href && isReviewsUrl(hop.href) && stripHash(hop.href) !== stripHash(page.url())) {
      await goto(page, hop.href);
      await ensureAccess(page, opts, src, hop.href);
    }
  }

  const mainUrl = page.url();
  const main = await collectOnPage(page, src, { ...inPage, section: onProductPage ? 'product-page' : 'main' });
  const state = main.complete ? 'completo' : `INCOMPLETO: ${main.reason}`;
  console.log(`  · Reseñas: ${main.reviews.length} (${main.clicks} clics${main.pages ? `, ${main.pages} páginas` : ''}, ${state})`);

  // 3) Star filters (Amazon caps each list at ~100 reviews, the filters show more).
  const starReviews = [];
  let starClicks = 0;
  if (opts.estrellas) {
    const starBase = isReviewsUrl(mainUrl) ? mainUrl : `${base}/-/es/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
    const known = new Set([...main.reviews, ...productReviews].map((r) => r.id));
    for (const star of STARS) {
      await pause(PAUSE.step);
      const url = withStarFilter(starBase, star);
      try {
        await goto(page, url);
        await ensureAccess(page, opts, src, url);
        const r = await collectOnPage(page, src, { ...inPage, meta: false });
        const fresh = r.reviews.filter((x) => !known.has(x.id));
        fresh.forEach((x) => known.add(x.id));
        starReviews.push(...r.reviews);
        starClicks += r.clicks;
        console.log(`  · Filtro ${STAR_NAMES[star]}: ${r.reviews.length} reseñas (${fresh.length} nuevas)`);
      } catch (e) {
        if (/iniciar sesión|captcha|Tiempo de espera/.test(e.message)) throw e;
        console.log(`  · Filtro ${STAR_NAMES[star]} omitido: ${firstLine(e.message)}`);
      }
    }
  }

  // 4) Export object (same normalisation as the bookmarklet) + cover thumbnail.
  await inject(page, src);
  const marketplace = new URL(base).host;
  const exp = await page.evaluate((d) => {
    const K = window.KDPExtractor;
    const book = K.mergeBook(d.productBook, d.mainBook);
    if (!book.asin) book.asin = d.asin;
    return K.toExport({
      book, reviews: d.reviews, clicks: d.clicks, complete: d.complete,
      pageUrl: d.pageUrl, marketplace: d.marketplace, tool: d.tool
    });
  }, {
    asin, productBook, mainBook: main.book, marketplace, pageUrl: mainUrl, tool: `playwright/${version}`,
    reviews: [...main.reviews, ...starReviews, ...productReviews],
    clicks: main.clicks + starClicks, complete: main.complete
  });
  if (exp.book.cover && !exp.book.coverData) exp.book.coverData = await coverDataFor(opts.api, page, src, exp.book.cover);
  return exp;
}

/* ------------------------------------------------------------------ output */

export async function saveMerged(file, exp) {
  let old = null;
  try { old = JSON.parse(await readFile(file, 'utf8')); } catch { old = null; }
  let merged = exp;
  let before = 0;
  if (old && old.schema === exp.schema && Array.isArray(old.reviews)) {
    before = old.reviews.length;
    const byId = new Map();
    for (const r of old.reviews) if (r && r.id != null) byId.set(String(r.id), r);
    for (const r of exp.reviews) {
      const prev = byId.get(r.id);
      if (!prev) { byId.set(r.id, r); continue; }
      const next = { ...prev };
      for (const [k, v] of Object.entries(r)) if (!isEmpty(v)) next[k] = v;
      byId.set(r.id, next);
    }
    const book = { ...exp.book };
    for (const k of Object.keys(book)) if (isEmpty(book[k]) && old.book && !isEmpty(old.book[k])) book[k] = old.book[k];
    merged = { ...exp, book, reviews: [...byId.values()] };
  }
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
  return { merged, before };
}

function printSummary(rows) {
  const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : (s || ''));
  const header = ['ASIN', 'Título', 'Reseñas', 'Nota', 'Valoraciones', 'Precio'];
  const data = rows.map((r) => (r.error
    ? [r.asin, trunc(`ERROR: ${r.error}`, 42), '—', '—', '—', '—']
    : [
        r.asin,
        trunc(r.title || '(sin título)', 42),
        String(r.reviews),
        r.rating != null ? String(r.rating).replace('.', ',') : '—',
        r.ratingsTotal != null ? r.ratingsTotal.toLocaleString('es-ES') : '—',
        r.price || '—'
      ]));
  const widths = header.map((h, i) => Math.max(h.length, ...data.map((d) => d[i].length)));
  const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('\nResumen');
  console.log(fmt(header));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  data.forEach((d) => console.log(fmt(d)));
}

function printHelp() {
  console.log(`Extractor de reseñas de Amazon (Playwright)

Uso:
  npm run scrape -- [opciones] [ASIN o URL ...]

Opciones:
  --enlaces FICHERO   Lista de enlaces, uno por línea (por defecto data/enlaces.txt).
                      Se ignoran líneas vacías, las que empiezan por # y los duplicados.
  --salida CARPETA    Dónde guardar <ASIN>.json (por defecto data/raw).
  --sin-estrellas     No recorrer los filtros de 1 a 5 estrellas (más rápido, menos completo).
  --headless          Navegador oculto (solo si ya iniciaste sesión antes).
  --base-url URL      Dominio de Amazon (por defecto https://www.amazon.com).
  --max-clics N       Límite de clics en «Mostrar más» por lista (por defecto 400).
  --perfil CARPETA    Perfil del navegador donde se guarda la sesión (por defecto .perfil-amazon).
  --ayuda             Muestra esta ayuda.

Ejemplos:
  npm run scrape
  npm run scrape -- 8484788946 B01FN37I44 --sin-estrellas`);
}

/* ------------------------------------------------------------------ main */

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`Error: ${e.message}\n`);
    printHelp();
    process.exitCode = 2;
    return;
  }
  if (opts.help) { printHelp(); return; }

  const linksFile = opts.enlaces ? resolve(opts.enlaces) : (opts.positional.length ? null : join(ROOT, 'data', 'enlaces.txt'));
  const outDir = opts.salida ? resolve(opts.salida) : join(ROOT, 'data', 'raw');
  const profileDir = opts.perfil ? resolve(opts.perfil) : join(ROOT, '.perfil-amazon');

  const entries = [];
  if (linksFile) {
    if (!existsSync(linksFile)) {
      console.error(`No encuentro ${rel(linksFile)}. Crea ese archivo con un enlace de Amazon por línea, o pasa los ASIN directamente:\n  npm run scrape -- 8484788946 B01FN37I44`);
      process.exitCode = 2;
      return;
    }
    const { entries: found, invalid } = parseLinks(await readFile(linksFile, 'utf8'), rel(linksFile));
    entries.push(...found);
    invalid.forEach((x) => console.warn(`  ⚠ ${x.source}, línea ${x.line}: no contiene un ASIN, la ignoro («${x.text.slice(0, 80)}»)`));
  }
  opts.positional.forEach((p, i) => {
    const asin = extractAsin(p);
    if (!asin) console.warn(`  ⚠ Argumento ignorado (no es un ASIN ni un enlace de Amazon): ${p}`);
    else entries.push({ asin, url: /^https?:\/\//i.test(p) ? p : null, line: i + 1, source: 'argumento' });
  });

  const { unique, duplicates } = dedupeEntries(entries);
  const dupText = duplicates.length ? ` (${plural(duplicates.length, 'duplicado ignorado', 'duplicados ignorados')})` : '';
  console.log(`Enlaces leídos: ${entries.length} → ${plural(unique.length, 'libro distinto', 'libros distintos')}${dupText}`);
  duplicates.forEach((d) => console.log(`  · Duplicado ignorado: ${d.asin} (${d.source}, línea ${d.line}; ya estaba en la línea ${d.firstLine})`));
  if (!unique.length) {
    console.error('No hay ningún ASIN que procesar.');
    process.exitCode = 2;
    return;
  }

  await mkdir(outDir, { recursive: true });
  const src = await readFile(EXTRACTOR, 'utf8');
  const version = (src.match(/var version = '([^']+)'/i) || [])[1] || '0';

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: opts.headless,
      locale: 'es-ES',
      viewport: opts.headless ? { width: 1280, height: 900 } : null,
      acceptDownloads: false
    });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      console.error('No encuentro el navegador Chromium de Playwright. Instálalo una vez con:\n  npx playwright install chromium');
    } else if (/ProcessSingleton|SingletonLock|already in use/i.test(e.message)) {
      console.error(`El perfil ${rel(profileDir)} está en uso: cierra la otra ventana del extractor y vuelve a intentarlo.`);
    } else {
      console.error(`No se pudo abrir el navegador: ${firstLine(e.message)}`);
    }
    process.exitCode = 1;
    return;
  }
  const stopOnSignal = () => {
    console.log('\nInterrumpido. Los libros ya terminados están guardados.');
    context.close().catch(() => {}).finally(() => process.exit(130));
  };
  process.once('SIGINT', stopOnSignal);

  await context.exposeBinding('kdpxProgress', (_source, p) => progress.update(p));
  opts.api = await pwRequest.newContext().catch(() => null); // cover thumbnails (no cookies)
  const page = context.pages()[0] || await context.newPage();
  console.log(`Perfil del navegador: ${rel(profileDir)} · salida: ${rel(outDir)}${opts.estrellas ? '' : ' · sin filtros por estrellas'}`);

  const rows = [];
  for (let i = 0; i < unique.length; i++) {
    const entry = unique[i];
    console.log(`\n[${i + 1}/${unique.length}] ${entry.asin}`);
    try {
      const exp = await scrapeBook(page, entry, opts, src, version);
      const file = join(outDir, `${entry.asin}.json`);
      const { merged, before } = await saveMerged(file, exp);
      const extra = before ? ` (antes había ${before}; fusionadas por id)` : '';
      console.log(`  ✔ Guardado ${rel(file)}: ${merged.reviews.length} reseñas${extra}`);
      rows.push({
        asin: entry.asin,
        title: merged.book.title,
        reviews: merged.reviews.length,
        rating: merged.book.rating,
        ratingsTotal: merged.book.ratingsTotal,
        price: merged.book.price ? merged.book.price.text : null
      });
    } catch (e) {
      progress.done();
      console.error(`  ✖ ${entry.asin}: ${firstLine(e.message)}`);
      rows.push({ asin: entry.asin, error: firstLine(e.message) });
    }
    if (i < unique.length - 1) await pause(PAUSE.book);
  }

  process.removeListener('SIGINT', stopOnSignal);
  if (opts.api) await opts.api.dispose().catch(() => {});
  await context.close().catch(() => {});
  printSummary(rows);
  const ok = rows.filter((r) => !r.error).length;
  console.log(`\n${ok} de ${rows.length} libros guardados en ${rel(outDir)}.`);
  process.exitCode = ok > 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`Error inesperado: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  });
}
