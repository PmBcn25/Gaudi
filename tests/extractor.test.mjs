// Pruebas del extractor de reseñas KDP (node:test + Chromium de Playwright sin ventana).
// Todo se prueba contra páginas locales que imitan el DOM de Amazon (tests/fixtures/), porque
// amazon.com no es accesible desde el entorno de pruebas.
// Ejecutar: node --test tests/extractor.test.mjs
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { startFixtureServer } from './fixtures/server.mjs';
import { tokenize, build as buildBookmarklet } from '../tools/build-bookmarklet.mjs';
import { extractAsin, parseLinks, dedupeEntries, parseArgs } from '../extractor/scrape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = await readFile(join(ROOT, 'extractor', 'extractor.js'), 'utf8');
const VERSION = SRC.match(/var version = '([^']+)'/i)[1];

const PORTAL = '/-/es/portal/customer-reviews/TESTASIN01/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews';
const PAGINATED = '/product-reviews/TESTASIN02/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews';
const PRODUCT = '/-/es/dp/TESTASIN01';
const BOOK_KEYS = ['asin', 'title', 'subtitle', 'authors', 'cover', 'coverData', 'rating', 'ratingsTotal', 'reviewsWithText',
  'histogram', 'price', 'formats', 'formatLine', 'pages', 'publisher', 'publicationDate', 'language', 'isbn10', 'isbn13',
  'bestSellersRank', 'customersSay', 'aspects'];
const REVIEW_KEYS = ['id', 'author', 'rating', 'title', 'body', 'date', 'dateText', 'country', 'verified', 'vine', 'format',
  'helpful', 'images', 'section'];
const EXPORT_KEYS = ['schema', 'exportedAt', 'tool', 'pageUrl', 'marketplace', 'complete', 'clicks', 'book', 'reviews'];

let server;
let browser;

before(async () => {
  server = await startFixtureServer();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

// Opens a fixture page in a fresh browser context and loads the extractor (without auto-run).
async function open(path, { code = SRC, autorun = false, options = null, permissions = [] } = {}) {
  const context = await browser.newContext({ locale: 'es-ES', acceptDownloads: true });
  if (permissions.length) await context.grantPermissions(permissions, { origin: server.url });
  // Nothing may leave the local server during the tests.
  await context.route((url) => url.origin !== server.url, (route) => route.abort());
  if (!autorun) await context.addInitScript(() => { window.KDPX_NO_AUTORUN = true; });
  if (options) await context.addInitScript((o) => { window.KDPX_OPTIONS = o; }, options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url + path);
  if (code) await page.evaluate(code);
  return { page, context, errors };
}

const byId = (list, id) => list.find((r) => r.id === id);

// Playwright ships a Babel parser internally; used (when present) to prove that the minified
// bookmarklet has exactly the same syntax tree as extractor.js, modulo the renamed bindings.
function loadBabelParse() {
  try {
    const req = createRequire(import.meta.url);
    return req(join(ROOT, 'node_modules', 'playwright', 'lib', 'transform', 'babelBundle.js')).babelParse || null;
  } catch {
    return null;
  }
}
const AST_IGNORED = new Set(['start', 'end', 'loc', 'range', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'errors', 'tokens']);
function assertSameAst(a, b, map, path = 'program') {
  if (a === b) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    throw new Error(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) throw new Error(`${path}: longitudes distintas`);
    a.forEach((x, i) => assertSameAst(x, b[i], map, `${path}[${i}]`));
    return;
  }
  if (a.type !== b.type) throw new Error(`${path}: ${a.type} ≠ ${b.type}`);
  if (a.type === 'Identifier') {
    const expected = map[a.name] || a.name;
    if (b.name !== expected) throw new Error(`${path}: ${a.name} → ${b.name} (se esperaba ${expected})`);
    return;
  }
  for (const k of Object.keys(a)) {
    if (AST_IGNORED.has(k)) continue;
    const literalName = !a.computed && a[k] && a[k].type === 'Identifier' &&
      ((k === 'property' && /MemberExpression$/.test(a.type)) || (k === 'key' && /^Object(Property|Method)$/.test(a.type)));
    if (literalName) {
      if (!b[k] || b[k].name !== a[k].name) throw new Error(`${path}.${k}: la propiedad «${a[k].name}» no debe renombrarse`);
      continue;
    }
    assertSameAst(a[k], b[k], map, `${path}.${k}`);
  }
}
const panelText = (page) => page.evaluate(() => document.getElementById('kdpx-panel').shadowRoot.querySelector('.box').textContent);

/* ------------------------------------------------------------------ (a) portal ES */

describe('página de reseñas ES («portal», «Mostrar 10 opiniones más»)', () => {
  let ctx;
  let data;
  before(async () => {
    ctx = await open(PORTAL);
    data = await ctx.page.evaluate(() => {
      const lm = KDPExtractor.findLoadMore(document);
      return {
        type: KDPExtractor.pageType(document),
        reviews: KDPExtractor.parseReviews(document),
        book: KDPExtractor.parseBookMeta(document),
        loadMoreHook: !!(lm && lm.closest('[data-hook="show-more-button"]'))
      };
    });
  });
  after(() => ctx.context.close());

  test('reconoce la página y el botón «Mostrar 10 opiniones más»', () => {
    assert.equal(data.type, 'reviews');
    assert.equal(data.loadMoreHook, true);
    assert.deepEqual(ctx.errors, []);
  });

  test('datos del libro en la página de reseñas', () => {
    const b = data.book;
    assert.deepEqual(Object.keys(b), BOOK_KEYS);
    assert.equal(b.asin, 'TESTASIN01');
    assert.equal(b.title, 'Libro de Prueba');
    assert.equal(b.subtitle, 'Subtítulo de prueba');
    assert.deepEqual(b.authors, ['Autora Ficticia']);
    assert.ok(b.cover.endsWith('/images/I/41TESTCOVER01._SY88.jpg'), b.cover);
    assert.equal(b.rating, 4.6);
    assert.equal(b.ratingsTotal, 1234);
    assert.equal(b.reviewsWithText, 456);
    assert.deepEqual(b.histogram, { 5: 74, 4: 14, 3: 6, 2: 3, 1: 3 });
    assert.match(b.customersSay, /^Los lectores de prueba destacan la calidad de las fotografías/);
    assert.doesNotMatch(b.customersSay, /Generado por IA/);
    assert.deepEqual(b.aspects, [
      { name: 'Calidad de las fotografías', sentiment: 'positive', positive: 45, negative: 3 },
      { name: 'Relación calidad-precio', sentiment: 'mixed', positive: 12, negative: 11 },
      { name: 'Tamaño de letra', sentiment: 'negative', positive: 2, negative: 9 }
    ]);
    assert.equal(b.price, null);
    assert.equal(b.coverData, null);
  });

  test('10 reseñas visibles + 3 de otros países, con todos los campos', () => {
    assert.equal(data.reviews.length, 13);
    assert.equal(data.reviews.filter((r) => r.section === 'main').length, 10);
    assert.equal(data.reviews.filter((r) => r.section === 'international').length, 3);
    for (const r of data.reviews) {
      assert.deepEqual(Object.keys(r), REVIEW_KEYS);
      assert.doesNotMatch(String(r.title), /de 5 estrellas/, 'el título no debe incluir el texto de las estrellas');
      assert.doesNotMatch(String(r.body), /Leer más|Informar|multimedia/);
    }
  });

  test('reseña con título al estilo antiguo, imágenes y dos párrafos', () => {
    assert.deepEqual(byId(data.reviews, 'R1TESTREVIEW01'), {
      id: 'R1TESTREVIEW01',
      author: 'Lector de prueba 1',
      rating: 5,
      title: 'Una guía preciosa y muy completa',
      body: 'Primer párrafo de prueba: las fotografías del templo son magníficas.\nSegundo párrafo de prueba: el texto explica bien la simbología de las fachadas.',
      date: '2023-03-03',
      dateText: 'Revisado en Estados Unidos el 3 de marzo de 2023',
      country: 'Estados Unidos',
      verified: true,
      vine: false,
      format: 'Tapa dura',
      helpful: 12,
      images: 2,
      section: 'main'
    });
  });

  test('título nuevo (estrella dentro del enlace), «Calificado en México», «Una persona…»', () => {
    const r = byId(data.reviews, 'R1TESTREVIEW02');
    assert.equal(r.title, 'Buen libro, pero la letra es pequeña');
    assert.equal(r.rating, 4);
    assert.equal(r.date, '2024-01-12');
    assert.equal(r.country, 'México');
    assert.equal(r.helpful, 1);
    assert.equal(r.format, 'Tapa blanda');
    assert.equal(r.verified, true);
  });

  test('reseña Vine: vine=true, no verificada, «A una persona le resultó útil»', () => {
    const r = byId(data.reviews, 'R1TESTREVIEW03');
    assert.equal(r.vine, true);
    assert.equal(r.verified, false);
    assert.equal(r.helpful, 1);
    assert.equal(r.format, 'Tapa dura');
    assert.equal(r.date, '2023-06-20');
  });

  test('reseña sin id ni campos opcionales: id estable por hash y valores por defecto', () => {
    const r = data.reviews.find((x) => x.author === 'Lector de prueba 4');
    assert.match(r.id, /^h[0-9a-f]{16}$/);
    assert.equal(r.title, null);
    assert.equal(r.format, null);
    assert.equal(r.verified, false);
    assert.equal(r.vine, false);
    assert.equal(r.helpful, 0);
    assert.equal(r.images, 0);
    assert.equal(r.rating, 3);
    assert.equal(r.date, '2021-07-07');
    assert.equal(r.body, 'Correcto, sin más.');
  });

  test('franja de formato sin enlace, «Leer más» eliminado, «12 personas encontraron esto útil»', () => {
    const r = byId(data.reviews, 'R1TESTREVIEW05');
    assert.equal(r.format, 'Versión Kindle');
    assert.equal(r.verified, true);
    assert.equal(r.helpful, 12);
    assert.equal(r.rating, 1);
    assert.equal(r.body, 'Texto de prueba: la versión Kindle no muestra bien los planos.\nAdemás, el índice no enlaza con los capítulos.');
  });

  test('bandera en la fecha y separador de miles «1.234»', () => {
    const r = byId(data.reviews, 'R1TESTREVIEW06');
    assert.equal(r.country, 'Estados Unidos');
    assert.equal(r.date, '2022-08-15');
    assert.equal(r.helpful, 1234);
  });

  test('reseña con vídeo: el aviso de contenido multimedia no entra en el texto', () => {
    assert.equal(byId(data.reviews, 'R1TESTREVIEW07').body, 'Texto de prueba: en el vídeo se ve el tamaño real del libro.');
  });

  test('reseñas de otros países: original (no la traducción), país y fecha', () => {
    const uk = byId(data.reviews, 'R3TESTINTL002');
    assert.equal(uk.section, 'international');
    assert.equal(uk.title, 'Beautiful photographs');
    assert.equal(uk.body, 'Test text: beautiful photographs, slightly thin paper.');
    assert.equal(uk.country, 'Reino Unido');
    assert.equal(uk.date, '2021-11-21');
    assert.equal(uk.rating, 4);
    const de = byId(data.reviews, 'R3TESTINTL003');
    assert.equal(de.country, 'Alemania');
    assert.equal(de.date, '2020-07-01');
    assert.equal(de.rating, 2);
    assert.equal(de.helpful, 1);
    assert.equal(de.format, null);
    const es = byId(data.reviews, 'R3TESTINTL001');
    assert.equal(es.country, 'España');
    assert.equal(es.helpful, 3);
  });
});

/* ------------------------------------------------------------------ expansion */

describe('expansión de la lista y filtros por estrellas', () => {
  test('expandAll pulsa «Mostrar 10 opiniones más» hasta el final: 37 + 3 reseñas, completo', async () => {
    const { page, context, errors } = await open(PORTAL);
    const r = await page.evaluate(async () => {
      const ex = await KDPExtractor.expandAll({ fast: true });
      const reviews = KDPExtractor.parseReviews(document);
      return { ex, reviews, left: !!KDPExtractor.findLoadMore(document) };
    });
    assert.equal(r.ex.clicks, 3);
    assert.equal(r.ex.complete, true);
    assert.equal(r.ex.reason, 'no-more');
    assert.equal(r.left, false);
    assert.equal(r.reviews.filter((x) => x.section === 'main').length, 37);
    assert.equal(r.reviews.filter((x) => x.section === 'international').length, 3);
    assert.equal(new Set(r.reviews.map((x) => x.id)).size, 40);
    assert.ok(byId(r.reviews, 'R1TESTREVIEW37'));
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('flujo «Ver más reseñas» (botón en la página) y después «Mostrar 10 opiniones más»', async () => {
    const { page, context } = await open(`${PORTAL}&variante=ver-mas`);
    const r = await page.evaluate(async () => {
      const first = KDPExtractor.findLoadMore(document).closest('[data-hook="show-more-button"]').textContent.trim();
      const ex = await KDPExtractor.expandAll({ fast: true });
      return { first, ex, main: KDPExtractor.parseReviews(document).filter((x) => x.section === 'main').length };
    });
    assert.equal(r.first, 'Ver más reseñas');
    assert.equal(r.ex.complete, true);
    assert.equal(r.ex.clicks, 3);
    assert.equal(r.main, 37);
    await context.close();
  });

  test('filterByStar=one_star muestra solo reseñas de 1 estrella (también las ocultas sin filtro)', async () => {
    const { page, context } = await open(`${PORTAL}&filterByStar=one_star&sortBy=recent`);
    const r = await page.evaluate(async () => {
      await KDPExtractor.expandAll({ fast: true });
      return KDPExtractor.parseReviews(document);
    });
    assert.ok(r.length > 0);
    assert.ok(r.every((x) => x.rating === 1));
    assert.ok(byId(r, 'R9TESTHIDDEN01') && byId(r, 'R9TESTHIDDEN03'));
    await context.close();
  });

  test('collect con filtros por estrellas (iframes ocultos): 43 reseñas únicas, sin tocar los datos del libro', async () => {
    const { page, context, errors } = await open(PORTAL);
    const r = await page.evaluate(() => KDPExtractor.collect({ fast: true, stars: true }));
    assert.equal(r.reviews.length, 43);
    assert.equal(new Set(r.reviews.map((x) => x.id)).size, 43);
    assert.equal(r.complete, true);
    assert.deepEqual(r.starPasses.map((s) => s.star), ['five_star', 'four_star', 'three_star', 'two_star', 'one_star']);
    assert.ok(r.starPasses.every((s) => s.ok), JSON.stringify(r.starPasses));
    assert.equal(r.starPasses.find((s) => s.star === 'one_star').added, 3);
    assert.equal(r.book.reviewsWithText, 456, 'los datos del libro salen de la lista sin filtrar');
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'los iframes se eliminan');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('toExport elimina duplicados por id y fusiona (sección principal, texto más largo)', async () => {
    const { page, context } = await open(PORTAL);
    const exp = await page.evaluate(() => {
      const main = KDPExtractor.parseReviews(document);
      const shortCopy = main.map((r) => Object.assign({}, r, { section: 'product-page', body: 'corto', helpful: 99 }));
      return KDPExtractor.toExport({ book: KDPExtractor.parseBookMeta(document), reviews: shortCopy.concat(main, main), clicks: 2, complete: true });
    });
    assert.deepEqual(Object.keys(exp), EXPORT_KEYS);
    assert.equal(exp.reviews.length, 13);
    const r1 = byId(exp.reviews, 'R1TESTREVIEW01');
    assert.equal(r1.section, 'main');
    assert.match(r1.body, /^Primer párrafo/);
    assert.equal(r1.helpful, 99);
    await context.close();
  });
});

/* ------------------------------------------------------------------ (b) paginated EN */

describe('página de reseñas EN con paginación clásica', () => {
  let ctx;
  let data;
  before(async () => {
    ctx = await open(PAGINATED);
    data = await ctx.page.evaluate(() => ({
      reviews: KDPExtractor.parseReviews(document),
      book: KDPExtractor.parseBookMeta(document),
      loadMore: KDPExtractor.findLoadMore(document),
      next: KDPExtractor.findNextPageUrl(document)
    }));
  });
  after(() => ctx.context.close());

  test('fechas, países, «útil», formato y verificada en inglés', () => {
    assert.equal(data.reviews.length, 10);
    assert.deepEqual(byId(data.reviews, 'R2TESTENREV01'), {
      id: 'R2TESTENREV01',
      author: 'Test reader 1',
      rating: 5,
      title: 'A lovely invented book',
      body: 'First test paragraph.\nSecond test paragraph.',
      date: '2023-03-03',
      dateText: 'Reviewed in the United States on March 3, 2023',
      country: 'United States',
      verified: true,
      vine: false,
      format: 'Paperback',
      helpful: 12,
      images: 0,
      section: 'main'
    });
    const uk = byId(data.reviews, 'R2TESTENREV02');
    assert.equal(uk.country, 'United Kingdom');
    assert.equal(uk.date, '2023-03-03');
    assert.equal(uk.helpful, 1);
    assert.equal(uk.format, 'Kindle Edition');
    assert.equal(uk.title, 'Good but small print');
    assert.equal(uk.rating, 4);
    const ca = byId(data.reviews, 'R2TESTENREV03');
    assert.equal(ca.country, 'Canada');
    assert.equal(ca.date, '2024-01-12');
    assert.equal(ca.helpful, 1234);
    assert.equal(ca.verified, false);
  });

  test('datos del libro (EN): nota, totales, histograma y «Customers say»', () => {
    const b = data.book;
    assert.equal(b.asin, 'TESTASIN02');
    assert.equal(b.title, 'An Invented Test Book');
    assert.equal(b.subtitle, 'A Subtitle for Testing');
    assert.deepEqual(b.authors, ['Fictional Author']);
    assert.equal(b.rating, 4.3);
    assert.equal(b.ratingsTotal, 2345);
    assert.equal(b.reviewsWithText, 612);
    assert.deepEqual(b.histogram, { 5: 61, 4: 20, 3: 10, 2: 5, 1: 4 });
    assert.equal(b.customersSay, 'Test readers say this invented book is clear and well illustrated, but some mention the small print.');
  });

  test('sin botón «cargar más»; enlace a la página siguiente', () => {
    assert.equal(data.loadMore, null);
    assert.match(data.next, /pageNumber=2$/);
  });

  test('collect recorre las páginas 2 y 3 con fetch + DOMParser', async () => {
    const { page, context } = await open(PAGINATED);
    const r = await page.evaluate(() => KDPExtractor.collect({ fast: true }));
    assert.equal(r.reviews.length, 25);
    assert.equal(r.pages, 2);
    assert.equal(r.clicks, 2);
    assert.equal(r.complete, true);
    assert.ok(byId(r.reviews, 'R2TESTENREV25'));
    assert.ok(server.hits.some((h) => h.includes('TESTASIN02') && h.endsWith('pageNumber=3')));
    await context.close();
  });
});

/* ------------------------------------------------------------------ (c) product page */

describe('ficha de producto ES (/dp/)', () => {
  let ctx;
  let data;
  before(async () => {
    ctx = await open(PRODUCT);
    data = await ctx.page.evaluate(() => {
      const see = KDPExtractor.findSeeAllReviews(document);
      return {
        type: KDPExtractor.pageType(document),
        book: KDPExtractor.parseProductPage(document),
        reviews: KDPExtractor.parseReviews(document, 'product-page'),
        seeAll: see && see.href,
        loadMore: KDPExtractor.findLoadMore(document)
      };
    });
  });
  after(() => ctx.context.close());

  test('título, subtítulo, autores, nota, valoraciones y portada grande', () => {
    const b = data.book;
    assert.equal(data.type, 'product');
    assert.deepEqual(Object.keys(b), BOOK_KEYS);
    assert.equal(b.asin, 'TESTASIN01');
    assert.equal(b.title, 'Libro de Prueba');
    assert.equal(b.subtitle, 'Subtítulo de prueba');
    assert.equal(b.formatLine, 'Tapa dura – 15 marzo 2019');
    assert.deepEqual(b.authors, ['Autora Ficticia', 'Ilustrador Inventado']);
    assert.equal(b.rating, 4.6);
    assert.equal(b.ratingsTotal, 1234);
    assert.equal(b.cover, 'https://m.media-amazon.com/images/I/51TESTCOVER01._SY466_.jpg');
  });

  test('precio del formato seleccionado y todos los formatos', () => {
    assert.deepEqual(data.book.price, { text: 'US$25.00', amount: 25, currency: 'USD', format: 'Tapa dura' });
    assert.deepEqual(data.book.formats, [
      { format: 'Versión Kindle', price: { text: 'US$9.99', amount: 9.99, currency: 'USD' } },
      { format: 'Tapa dura', price: { text: 'US$25.00', amount: 25, currency: 'USD' } },
      { format: 'Tapa blanda', price: { text: 'US$18.50', amount: 18.5, currency: 'USD' } }
    ]);
  });

  test('detalles: páginas, editorial, fecha, idioma, ISBN y ranking de ventas', () => {
    const b = data.book;
    assert.equal(b.pages, 192);
    assert.equal(b.publisher, 'Editorial Inventada');
    assert.equal(b.publicationDate, '2019-03-15');
    assert.equal(b.language, 'Español');
    assert.equal(b.isbn10, '8400000019');
    assert.equal(b.isbn13, '9788400000017');
    assert.deepEqual(b.bestSellersRank, [
      { rank: 123456, category: 'Libros' },
      { rank: 12, category: 'Arquitectura religiosa' },
      { rank: 345, category: 'Historia de la arquitectura' }
    ]);
    assert.deepEqual(b.histogram, { 5: 74, 4: 14, 3: 6, 2: 3, 1: 3 });
    assert.match(b.customersSay, /^Los lectores de prueba destacan/);
    assert.equal(b.aspects.length, 3);
  });

  test('reseñas de la ficha (sección product-page) y de otros países', () => {
    assert.equal(data.reviews.length, 4);
    assert.deepEqual(data.reviews.map((r) => r.section), ['product-page', 'product-page', 'product-page', 'international']);
    const r1 = byId(data.reviews, 'R1TESTREVIEW01');
    assert.equal(r1.body.split('\n').length, 2);
    assert.doesNotMatch(r1.body, /Leer más/);
    assert.equal(byId(data.reviews, 'R3TESTINTL001').country, 'España');
  });

  test('«Ver más reseñas» es un enlace a otra página, no un botón de «cargar más»', () => {
    assert.match(data.seeAll, /\/-\/es\/portal\/customer-reviews\/TESTASIN01\//);
    assert.equal(data.loadMore, null);
  });
});

/* ------------------------------------------------------------------ run() */

describe('run(): flujo del marcador con panel', () => {
  test('en la ficha guarda los datos y abre las reseñas; al volver a pulsar descarga el JSON', async () => {
    const { page, context } = await open(PRODUCT);
    const first = await page.evaluate(() => KDPExtractor.run({ fast: true, navigateDelay: 300 }));
    assert.equal(first.status, 'navigating');
    assert.match(await panelText(page), /pulsa otra vez el marcador/);
    await page.waitForURL(/\/portal\/customer-reviews\/TESTASIN01\//);
    const cached = await page.evaluate(() => JSON.parse(sessionStorage.getItem('kdpx:meta:TESTASIN01')));
    assert.equal(cached.book.price.amount, 25);
    const dpHits = server.hits.filter((h) => h.includes('/dp/TESTASIN01')).length;
    await page.evaluate(SRC); // «pulsar el marcador otra vez»
    const [download, res] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => KDPExtractor.run({ fast: true }))
    ]);
    assert.equal(res.status, 'done');
    assert.equal(download.suggestedFilename(), 'resenas-TESTASIN01.json');
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(saved.reviews.length, 40);
    assert.equal(saved.complete, true);
    assert.equal(saved.book.price.amount, 25);
    assert.equal(saved.book.bestSellersRank.length, 3);
    assert.equal(saved.book.reviewsWithText, 456);
    assert.equal(server.hits.filter((h) => h.includes('/dp/TESTASIN01')).length, dpHits, 'usa la caché de sessionStorage');
    await context.close();
  });

  test('directamente en la página de reseñas: completa datos con la ficha y respeta el esquema', async () => {
    const { page, context, errors } = await open(PORTAL);
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const res = await page.evaluate(() => KDPExtractor.run({ fast: true, download: false }));
    assert.equal(res.status, 'done');
    const exp = res.data;
    assert.deepEqual(Object.keys(exp), EXPORT_KEYS);
    assert.deepEqual(Object.keys(exp.book), BOOK_KEYS);
    exp.reviews.forEach((r) => assert.deepEqual(Object.keys(r), REVIEW_KEYS));
    assert.equal(exp.schema, 'kdp-reviews/1');
    assert.equal(exp.tool, `marcador/${VERSION}`);
    assert.equal(exp.marketplace, new URL(server.url).host);
    assert.equal(exp.complete, true);
    assert.equal(exp.clicks, 3);
    assert.equal(exp.reviews.length, 40);
    assert.ok(!Number.isNaN(Date.parse(exp.exportedAt)));
    assert.equal(exp.book.price.amount, 25, 'precio obtenido de la ficha con fetch del mismo dominio');
    assert.equal(exp.book.pages, 192);
    assert.equal(exp.book.coverData, null, 'la miniatura externa está bloqueada en las pruebas: null, sin error');
    const text = await panelText(page);
    for (const s of ['Detener', 'Descargar JSON', 'Copiar JSON', 'Recorrer también los filtros por estrellas (más completo)', '¡Listo!', 'Reseñas cargadas: 40']) {
      assert.ok(text.includes(s), `el panel muestra «${s}»`);
    }
    const foreign = requests.filter((u) => new URL(u).origin !== server.url);
    assert.ok(foreign.every((u) => /^https:\/\/m\.media-amazon\.com\/images\/I\/[^/]+\._SY240_\.jpg$/.test(u)), foreign.join('\n'));
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('portada local: coverData se incrusta como data URI', async () => {
    const { page, context } = await open(PAGINATED);
    const res = await page.evaluate(() => KDPExtractor.run({ fast: true, download: false }));
    assert.equal(res.data.reviews.length, 25);
    assert.match(res.data.book.coverData, /^data:image\/gif;base64,R0lGOD/);
    await context.close();
  });

  test('«Copiar JSON» copia la exportación al portapapeles', async () => {
    const { page, context } = await open(PAGINATED, { permissions: ['clipboard-read', 'clipboard-write'] });
    await page.evaluate(() => KDPExtractor.run({ fast: true, download: false }));
    await page.locator('#kdpx-panel').getByRole('button', { name: 'Copiar JSON' }).click();
    await page.waitForFunction(() => document.getElementById('kdpx-panel').shadowRoot.textContent.includes('JSON copiado'));
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(copied.schema, 'kdp-reviews/1');
    assert.equal(copied.reviews.length, 25);
    await context.close();
  });

  test('«Detener» corta la extracción y deja el JSON parcial disponible', async () => {
    const { page, context } = await open(PORTAL);
    await page.evaluate(() => { window.__kdpxPrueba = KDPExtractor.run({ download: false, minDelay: 1500, maxDelay: 1500, confirmDelay: 100, settle: 50 }); });
    await page.waitForFunction(() => KDPExtractor._state.clicks >= 1, null, { timeout: 20000 });
    await page.locator('#kdpx-panel').getByRole('button', { name: 'Detener' }).click();
    const res = await page.evaluate(() => window.__kdpxPrueba);
    assert.equal(res.status, 'stopped');
    assert.equal(res.data.complete, false);
    assert.ok(res.data.reviews.length >= 23 && res.data.reviews.length < 40, String(res.data.reviews.length));
    assert.match(await panelText(page), /Detenido/);
    await context.close();
  });

  test('detecta inicio de sesión, captcha y páginas que no son de Amazon', async () => {
    const cases = [['/ap/signin?openid.return_to=x', 'login', /iniciar sesión/], ['/errors/validateCaptcha', 'captcha', /captcha/], ['/pagina-inexistente', 'unsupported', /no parece/]];
    for (const [path, status, message] of cases) {
      const { page, context } = await open(path);
      const res = await page.evaluate(() => KDPExtractor.run({ fast: true }));
      assert.equal(res.status, status, path);
      assert.match(await panelText(page), message);
      await context.close();
    }
  });

  test('coverData: data URI si la miniatura es válida; null (sin excepción) si falla', async () => {
    const { page, context } = await open(PORTAL);
    await page.route('**/lenta/**', () => { /* never answers */ });
    const r = await page.evaluate(async () => ({
      ok: await KDPExtractor.coverData('/images/I/41TESTCOVER01._SY88.jpg'),
      blocked: await KDPExtractor.coverData('https://m.media-amazon.com/images/I/51TESTCOVER01._SY466_.jpg'),
      notImage: await KDPExtractor.coverData('/pagina-inexistente/portada.jpg'),
      tooBig: await KDPExtractor.coverData('/images/grande/51GRANDE._SY466_.jpg'),
      slow: await KDPExtractor.coverData('/images/lenta/51LENTA._SY466_.jpg', 300),
      none: await KDPExtractor.coverData(null),
      t1: KDPExtractor.utils.thumbUrl('https://m.media-amazon.com/images/I/51abc+def._SX331_BO1,204,203,200_.jpg'),
      t2: KDPExtractor.utils.thumbUrl('https://m.media-amazon.com/images/I/51abc.jpg'),
      t3: KDPExtractor.utils.thumbUrl('https://m.media-amazon.com/images/I/41TEST._SY88.jpg')
    }));
    assert.match(r.ok, /^data:image\/gif;base64,R0lGOD/);
    assert.ok(server.hits.includes('/images/I/41TESTCOVER01._SY240_.jpg'), 'pide la miniatura _SY240_');
    assert.equal(r.blocked, null);
    assert.equal(r.notImage, null);
    assert.equal(r.tooBig, null);
    assert.equal(r.slow, null);
    assert.equal(r.none, null);
    assert.equal(r.t1, 'https://m.media-amazon.com/images/I/51abc+def._SY240_.jpg');
    assert.equal(r.t2, 'https://m.media-amazon.com/images/I/51abc._SY240_.jpg');
    assert.equal(r.t3, 'https://m.media-amazon.com/images/I/41TEST._SY240_.jpg');
    await context.close();
  });
});

/* ------------------------------------------------------------------ text helpers */

describe('utilidades de texto (fechas, países, útiles, precios, ranking)', () => {
  let ctx;
  let u;
  before(async () => {
    ctx = await open('/pagina-inexistente');
    u = await ctx.page.evaluate(() => {
      const x = KDPExtractor.utils;
      return {
        dates: [
          'Revisado en Estados Unidos el 3 de marzo de 2023', 'Reviewed in the United States on March 3, 2023',
          'Reviewed in the United Kingdom on 3 March 2023', 'Commenté en France le 1er mars 2023',
          'Rezension aus Deutschland vom 3. März 2023', 'Recensito in Italia il 3 marzo 2023',
          'Avaliado no Brasil em 3 de março de 2023', 'Beoordeeld in Nederland op 3 maart 2023',
          'Valorado en España el 15 de septiembre de 2021', '15 marzo 2019', 'texto sin fecha'
        ].map(x.parseDate),
        countries: [
          'Revisado en Estados Unidos el 3 de marzo de 2023', 'Reviewed in the United States on March 3, 2023',
          'Commenté en France le 3 mars 2023', 'Rezension aus Deutschland vom 3. März 2023',
          'Recensito in Italia il 3 marzo 2023', 'Avaliado no Brasil em 3 de março de 2023', 'Reviewed in Hong Kong on 3 March 2023'
        ].map(x.parseCountry),
        helpful: [
          'A 12 personas les resultó útil', '12 personas encontraron esto útil', 'Una persona encontró esto útil',
          'A una persona le resultó útil', '12 people found this helpful', 'One person found this helpful',
          '1.234 personas encontraron esto útil', '1,234 people found this helpful', 'Une personne a trouvé cela utile', ''
        ].map(x.parseHelpful),
        amounts: ['US$25,00', '$25.00', '25,00 US$', 'US$1,234.56', '1.234,56 €', '£12.99', 'US$9.99'].map(x.toAmount),
        currencies: ['US$25.00', '$25.00', '25,00 €', '£12.99', 'MX$250.00'].map((s) => x.detectCurrency(s, 'www.amazon.com')),
        bsr: x.parseBSR('#123,456 in Books (See Top 100 in Books) #12 in Religious Architecture (Books)'),
        split: x.splitTitle('Gaudí: Arquitecto de Dios: Edición ilustrada'),
        star: x.withStarFilter('https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=x?ie=UTF8&pageNumber=3', 'two_star')
      };
    });
  });
  after(() => ctx.context.close());

  test('fechas en varios idiomas → AAAA-MM-DD', () => {
    assert.deepEqual(u.dates, ['2023-03-03', '2023-03-03', '2023-03-03', '2023-03-01', '2023-03-03', '2023-03-03', '2023-03-03', '2023-03-03', '2021-09-15', '2019-03-15', null]);
  });
  test('países', () => {
    assert.deepEqual(u.countries, ['Estados Unidos', 'United States', 'France', 'Deutschland', 'Italia', 'Brasil', 'Hong Kong']);
  });
  test('votos «útil»', () => {
    assert.deepEqual(u.helpful, [12, 12, 1, 1, 12, 1, 1234, 1234, 1, 0]);
  });
  test('importes y monedas', () => {
    assert.deepEqual(u.amounts, [25, 25, 25, 1234.56, 1234.56, 12.99, 9.99]);
    assert.deepEqual(u.currencies, ['USD', 'USD', 'EUR', 'GBP', 'MXN']);
  });
  test('ranking de ventas en inglés, título/subtítulo y URL con filtro', () => {
    assert.deepEqual(u.bsr, [{ rank: 123456, category: 'Books' }, { rank: 12, category: 'Religious Architecture' }]);
    assert.deepEqual(u.split, { title: 'Gaudí', subtitle: 'Arquitecto de Dios: Edición ilustrada' });
    const url = new URL(u.star);
    assert.equal(url.searchParams.get('filterByStar'), 'two_star');
    assert.equal(url.searchParams.get('sortBy'), 'recent');
    assert.equal(url.searchParams.get('pageNumber'), null);
  });
});

/* ------------------------------------------------------------------ code quality */

describe('calidad del script para el navegador', () => {
  test('solo usa sintaxis y APIs de ES2019', () => {
    const toks = tokenize(SRC).filter((t) => !['ws', 'nl', 'comment'].includes(t.type));
    const bad = [];
    toks.forEach((t, i) => {
      if (t.type === 'punc' && ['?.', '??', '??=', '||=', '&&=', '#'].includes(t.value)) bad.push(t.value);
      if (t.type === 'id' && ['globalThis', 'structuredClone', 'BigInt', 'import', 'let', 'const', 'class'].includes(t.value)) bad.push(t.value);
      if (t.type === 'id' && toks[i - 1] && toks[i - 1].value === '.' && ['matchAll', 'replaceAll', 'allSettled', 'any', 'at', 'hasOwn', 'findLast', 'findLastIndex'].includes(t.value)) bad.push(`.${t.value}`);
      if (t.type === 'num' && (/_/.test(t.value) || /^\d+n$/.test(t.value))) bad.push(t.value);
      if (t.type === 're') {
        if (/\(\?<[=!]?/.test(t.value)) bad.push(t.value);
        if (!/^[gimsuy]*$/.test(t.value.slice(t.value.lastIndexOf('/') + 1))) bad.push(t.value);
      }
    });
    assert.deepEqual(bad, []);
    assert.doesNotThrow(() => new vm.Script(SRC));
  });

  test('no deja variables globales salvo window.KDPExtractor', async () => {
    const { page, context } = await open(PRODUCT, { code: null });
    const before = await page.evaluate(() => Object.keys(window));
    await page.evaluate(SRC);
    await page.evaluate(() => {
      KDPExtractor.parseProductPage(document);
      KDPExtractor.parseReviews(document);
      KDPExtractor.parseBookMeta(document);
    });
    const added = await page.evaluate((b) => Object.keys(window).filter((k) => !b.includes(k)), before);
    assert.deepEqual(added, ['KDPExtractor']);
    await context.close();
  });

  test('una reseña malformada no interrumpe el análisis', async () => {
    const { page, context } = await open(PORTAL);
    const r = await page.evaluate(() => {
      const bad = document.querySelector('[data-hook="review"]');
      Object.defineProperty(bad, 'cloneNode', { value: () => { throw new Error('nodo roto'); } });
      return KDPExtractor.parseReviews(document).length;
    });
    assert.equal(r, 12);
    await context.close();
  });
});

/* ------------------------------------------------------------------ bookmarklet */

describe('marcador (bookmarklet)', () => {
  let href;
  let code;
  before(async () => {
    href = (await readFile(join(ROOT, 'extractor', 'bookmarklet.txt'), 'utf8')).trim();
    code = decodeURIComponent(href.slice('javascript:'.length));
  });

  test('bookmarklet.txt es una URL javascript: válida, compila y está actualizada', async () => {
    assert.ok(href.startsWith('javascript:'));
    assert.ok(href.length < 65536, `demasiado largo para Firefox: ${href.length}`);
    assert.equal(new URL(href).href, href, 'los navegadores lo guardan tal cual (sin reescribirlo más largo)');
    assert.doesNotMatch(href, /[\n\r\t?#`]/);
    assert.doesNotMatch(href, /%(?![0-9A-F]{2})/i);
    assert.doesNotThrow(() => new vm.Script(code));
    const fresh = await buildBookmarklet({ write: false, quiet: true });
    assert.equal(href, fresh.href, 'bookmarklet.txt está desactualizado: ejecuta npm run bookmarklet');
  });

  test('el código compactado tiene el mismo árbol sintáctico que extractor.js', async (t) => {
    const babelParse = loadBabelParse();
    if (!babelParse) {
      t.skip('no se encontró el analizador de Babel incluido en Playwright');
      return;
    }
    const { code: minified, map } = await buildBookmarklet({ write: false, quiet: true });
    assert.ok(Object.keys(map).length > 50, 'renombra las funciones internas');
    const original = babelParse(SRC, 'extractor.js', false);
    const compact = babelParse(minified, 'extractor.js', false);
    const used = new Set();
    JSON.stringify(original, (k, v) => { if (v && v.type === 'Identifier') used.add(v.name); return v; });
    for (const fresh of Object.values(map)) assert.ok(!used.has(fresh), `nombre nuevo no usado antes: ${fresh}`);
    assertSameAst(original.program, compact.program, map);
  });

  test('al pulsarlo en una página de reseñas se ejecuta solo y termina la extracción', async () => {
    const { page, context, errors } = await open(PORTAL, { code: null, autorun: true, options: { fast: true, download: false } });
    await page.evaluate((h) => {
      const a = document.createElement('a');
      a.href = h;
      a.textContent = 'marcador';
      document.body.appendChild(a);
      a.click();
    }, href);
    await page.waitForFunction(() => window.KDPExtractor && window.KDPExtractor.lastExport, null, { timeout: 30000 });
    const exp = await page.evaluate(() => window.KDPExtractor.lastExport);
    assert.equal(exp.reviews.length, 40);
    assert.equal(exp.complete, true);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('la versión compactada da exactamente los mismos resultados que el original', async () => {
    const probe = () => ({
      reviews: KDPExtractor.parseReviews(document),
      meta: KDPExtractor.parseBookMeta(document),
      product: KDPExtractor.parseProductPage(document),
      loadMore: !!KDPExtractor.findLoadMore(document),
      next: KDPExtractor.findNextPageUrl(document)
    });
    for (const path of [PORTAL, PAGINATED, PRODUCT]) {
      const a = await open(path);
      const b = await open(path, { code });
      assert.deepEqual(await b.page.evaluate(probe), await a.page.evaluate(probe), path);
      await a.context.close();
      await b.context.close();
    }
  });

  test('instalar-marcador.html: botón arrastrable con el marcador e instrucciones en español', async () => {
    const file = join(ROOT, 'extractor', 'instalar-marcador.html');
    const html = await readFile(file, 'utf8');
    for (const s of ['Extraer reseñas KDP', 'Arrastra', 'permitir pegar', 'Copiar código para la consola', 'lang="es"']) {
      assert.ok(html.includes(s), s);
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.getAttribute('#marcador', 'href'), href);
    assert.equal(await page.inputValue('#codigo-consola'), code);
    await context.close();
  });
});

/* ------------------------------------------------------------------ scrape.mjs */

const USER_LINKS = `https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/1632867818/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/0060935634/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/1632867818/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/0060935634/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/3836566192/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/1632867818/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/0060935634/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/1632867818/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/8491031987/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/B0GF2QG1T9/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/B01FN37I44/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews
https://www.amazon.com/-/es/portal/customer-reviews/3836560283/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews`;

function runNode(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('scrape.mjs (Playwright)', () => {
  test('reconoce ASIN en enlaces de todo tipo', () => {
    assert.equal(extractAsin('https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8'), '8484788946');
    assert.equal(extractAsin('https://www.amazon.com/Sagrada-Familia/dp/B01FN37I44/ref=sr_1_1'), 'B01FN37I44');
    assert.equal(extractAsin('https://www.amazon.com/product-reviews/080213412X?pageNumber=2'), '080213412X');
    assert.equal(extractAsin('https://www.amazon.com/gp/product/B0GF2QG1T9'), 'B0GF2QG1T9');
    assert.equal(extractAsin('b0gf2qg1t9'), 'B0GF2QG1T9');
    assert.equal(extractAsin('https://www.amazon.com/gp/customer-reviews/R2ABCDEFGHIJKL/ref=cm_cr_arp_d_rvw_ttl'), null);
    assert.equal(extractAsin('esto no es un enlace'), null);
  });

  test('los 15 enlaces del usuario son 8 libros distintos (7 duplicados)', () => {
    const { entries, invalid } = parseLinks(`# comentario\n\n${USER_LINKS}\n`);
    assert.equal(entries.length, 15);
    assert.equal(invalid.length, 0);
    const { unique, duplicates } = dedupeEntries(entries);
    assert.deepEqual(unique.map((e) => e.asin), ['8484788946', '1632867818', '0060935634', '3836566192', '8491031987', 'B0GF2QG1T9', 'B01FN37I44', '3836560283']);
    assert.equal(duplicates.length, 7);
    assert.deepEqual(duplicates[0], { ...entries[2], firstLine: 3, firstSource: 'enlaces' });
  });

  test('opciones de la línea de comandos', () => {
    const o = parseArgs(['--enlaces', 'x.txt', '--salida=out', '--sin-estrellas', '--headless', '--base-url', 'http://127.0.0.1:9/', '--max-clics', '5', 'B01FN37I44']);
    assert.equal(o.enlaces, 'x.txt');
    assert.equal(o.salida, 'out');
    assert.equal(o.estrellas, false);
    assert.equal(o.headless, true);
    assert.equal(o.baseUrl, 'http://127.0.0.1:9');
    assert.equal(o.maxClics, 5);
    assert.deepEqual(o.positional, ['B01FN37I44']);
    assert.throws(() => parseArgs(['--desconocida']), /Opción desconocida/);
    assert.throws(() => parseArgs(['--max-clics', 'cero']), /max-clics/);
  });

  test('de principio a fin contra el servidor local: 2 libros, duplicado, login y fusión', { timeout: 240000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kdpx-e2e-'));
    try {
      const out = join(dir, 'raw');
      await mkdir(out);
      // An older export of TESTASIN02 that must be merged (review kept, missing fields filled).
      await writeFile(join(out, 'TESTASIN02.json'), JSON.stringify({
        schema: 'kdp-reviews/1', exportedAt: '2026-01-01T00:00:00.000Z', tool: 'marcador/0.9.0', pageUrl: 'x', marketplace: 'www.amazon.com',
        complete: false, clicks: 0,
        book: { asin: 'TESTASIN02', title: 'Título antiguo', pages: 321, publisher: 'Editorial Antigua', authors: [], formats: [], bestSellersRank: [], aspects: [] },
        reviews: [{ id: 'ROLDREVIEW001', author: 'Lector antiguo', rating: 3, title: 'Antigua', body: 'Reseña guardada antes.', date: '2020-01-01', dateText: null, country: null, verified: false, vine: false, format: null, helpful: 0, images: 0, section: 'main' }]
      }));
      await writeFile(join(dir, 'enlaces.txt'), [
        '# enlaces de prueba',
        `https://www.amazon.com${PORTAL}`,
        `https://www.amazon.com${PAGINATED}`,
        '',
        `https://www.amazon.com${PORTAL}`,
        'https://www.amazon.com/-/es/portal/customer-reviews/TESTLOGIN1/ref=cm_cr_dp_d_show_all_top?ie=UTF8&reviewerType=all_reviews'
      ].join('\n'));
      const script = join(ROOT, 'extractor', 'scrape.mjs');
      const common = ['--base-url', server.url, '--headless', '--perfil', join(dir, 'perfil')];
      const run1 = await runNode([script, ...common, '--salida', out, '--enlaces', join(dir, 'enlaces.txt')], { KDPX_RAPIDO: '1' });
      const log = run1.stdout + run1.stderr;
      assert.equal(run1.code, 0, log);
      assert.match(log, /Enlaces leídos: 4 → 3 libros distintos \(1 duplicado ignorado\)/);
      assert.match(log, /Duplicado ignorado: TESTASIN01/);
      assert.match(log, /TESTLOGIN1: Amazon pide iniciar sesión/);
      assert.match(log, /Resumen/);
      assert.equal(existsSync(join(out, 'TESTLOGIN1.json')), false);

      const a = JSON.parse(await readFile(join(out, 'TESTASIN01.json'), 'utf8'));
      assert.deepEqual(Object.keys(a), EXPORT_KEYS);
      assert.deepEqual(Object.keys(a.book), BOOK_KEYS);
      assert.equal(a.schema, 'kdp-reviews/1');
      assert.equal(a.tool, `playwright/${VERSION}`);
      assert.equal(a.marketplace, new URL(server.url).host);
      assert.match(a.pageUrl, /\/portal\/customer-reviews\/TESTASIN01\//);
      assert.equal(a.complete, true);
      assert.ok(a.clicks >= 3);
      assert.equal(a.reviews.length, 43, 'lista completa + 3 reseñas que solo aparecen con el filtro de 1 estrella');
      assert.equal(new Set(a.reviews.map((r) => r.id)).size, 43);
      assert.equal(a.reviews.filter((r) => r.section === 'international').length, 3);
      assert.equal(byId(a.reviews, 'R1TESTREVIEW01').section, 'main');
      assert.equal(a.book.title, 'Libro de Prueba');
      assert.equal(a.book.subtitle, 'Subtítulo de prueba');
      assert.equal(a.book.price.amount, 25);
      assert.equal(a.book.pages, 192);
      assert.equal(a.book.reviewsWithText, 456);
      assert.equal(a.book.bestSellersRank[0].rank, 123456);
      assert.ok(a.book.coverData === null || a.book.coverData.startsWith('data:image/'), 'coverData es null o una imagen');

      const b = JSON.parse(await readFile(join(out, 'TESTASIN02.json'), 'utf8'));
      assert.equal(b.reviews.length, 26, '25 nuevas + 1 del archivo anterior');
      assert.ok(byId(b.reviews, 'ROLDREVIEW001'));
      assert.equal(b.book.title, 'An Invented Test Book', 'los datos nuevos del libro mandan');
      assert.equal(b.book.pages, 321, 'lo que falta se conserva del archivo anterior');
      assert.equal(b.book.publisher, 'Editorial Antigua');
      assert.equal(b.complete, true);
      assert.match(b.book.coverData, /^data:image\/gif;base64,/);

      // Second run: bare ASIN argument, no star filters.
      const out2 = join(dir, 'raw2');
      const run2 = await runNode([script, ...common, '--salida', out2, '--sin-estrellas', 'TESTASIN01'], { KDPX_RAPIDO: '1' });
      assert.equal(run2.code, 0, run2.stdout + run2.stderr);
      assert.doesNotMatch(run2.stdout, /Filtro/);
      const c = JSON.parse(await readFile(join(out2, 'TESTASIN01.json'), 'utf8'));
      assert.equal(c.reviews.length, 40);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
