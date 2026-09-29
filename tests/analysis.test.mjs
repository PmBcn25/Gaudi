// Pruebas del motor de análisis (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(path.join(root, 'assets/js/lexicon.js'));
await import(path.join(root, 'assets/js/analysis.js'));
const A = globalThis.KDPAnalysis;

const R = (id, rating, body, extra = {}) => A.normalizeReview({ id, rating, body, ...extra }, 'X000000001');

test('normaliza texto sin tildes ni eñes', () => {
  assert.equal(A.normalize('Tamaño PEQUEÑO, ¡precioso!'), 'tamano pequeno precioso');
});

test('detecta temas en español e inglés', () => {
  assert.ok(A.themesIn('Las fotografías son espectaculares').includes('fotos'));
  assert.ok(A.themesIn('Not a diagram or drawing anywhere').includes('planos'));
  assert.ok(A.themesIn('Perfect before our trip to Barcelona').includes('visita'));
});

test('«Sagrada Familia» no dispara los temas de familia ni de simbolismo', () => {
  const t = A.themesIn('The Sagrada Familia is the Holy Family basilica');
  assert.ok(!t.includes('ninos'));
  assert.ok(!t.includes('simbolismo'));
});

test('clasifica elogios, quejas y deseos', () => {
  assert.equal(A.sentenceKind('Las fotos son preciosas', 5), 'praise');
  assert.equal(A.sentenceKind('Me hubiera gustado que tuviera más planos', 5), 'wish');
  assert.equal(A.sentenceKind('The photos are too small', 4), 'complaint');
  assert.equal(A.sentenceKind('Las fotos son bonitas', 2), 'complaint');
});

test('atribuye la pega al tema que va después del «pero»', () => {
  const a = A.analyzeReview(R('r1', 4, 'Great photos but the book is a little on the small side.'));
  const stats = A.themeStats([a]);
  const fotos = stats.find((t) => t.id === 'fotos');
  const formato = stats.find((t) => t.id === 'formato');
  assert.equal(fotos.praise, 1);
  assert.equal(fotos.complaint, 0);
  assert.equal(formato.complaint, 1);
});

test('un «caro, pero merece la pena» no es una queja de lo que sigue', () => {
  const a = A.analyzeReview(R('r2', 5, 'A bit pricey but worth it for the photographs.'));
  const seg = a.sentences[0].segs[1];
  assert.equal(seg.kind, 'praise');
});

test('estadísticas por libro', () => {
  const list = [R('a', 5, 'Precioso libro, fotos increíbles.', { date: '2025-01-10', verified: true, helpful: 3 }),
    R('b', 1, 'Llegó dañado y roto.', { date: '2019-05-01' }),
    R('c', 3, 'Está bien, pero desordenado.', { date: '2024-12-01' })];
  const st = A.bookStats({ asin: 'X000000001' }, list, { now: '2025-06-01' });
  assert.equal(st.extracted, 3);
  assert.equal(st.avg, 3);
  assert.equal(st.dist[5], 1);
  assert.equal(st.pctNeg, 33.3);
  assert.equal(st.firstDate, '2019-05-01');
  assert.equal(st.last12m, 2);
  assert.equal(st.topPositive[0].id, 'a');
});

test('importación: acepta el formato del extractor y rechaza lo demás', () => {
  const imp = A.parseImport({ schema: 'kdp-reviews/1', book: { asin: '1632867818' }, reviews: [{ id: 'R1', rating: '4,0', body: 'ok', helpful: 'A 12 personas' }] });
  assert.equal(imp[0].asin, '1632867818');
  assert.equal(imp[0].reviews[0].rating, 4);
  assert.equal(imp[0].reviews[0].helpful, 12);
  const byUrl = A.parseImport({ pageUrl: 'https://www.amazon.com/-/es/portal/customer-reviews/B0GF2QG1T9/ref=x', reviews: [] });
  assert.equal(byUrl[0].asin, 'B0GF2QG1T9');
  assert.throws(() => A.parseImport({ reviews: [] }), /ASIN/);
});

test('mezcla: los datos de Amazon sustituyen a los aproximados y no se duplican reseñas', () => {
  const base = [{ asin: '1632867818', title: 'The Sagrada Familia', subtitle: 'The Astonishing Story', rating: 4.3, ratingsTotal: 130, metaSource: 'web' }];
  const imp = A.parseImport({ book: { asin: '1632867818', rating: 4.4, ratingsTotal: 141, price: { amount: 24.5, currency: 'USD', format: 'Tapa dura', text: '24,50 US$' } },
    reviews: [{ id: 'R1', rating: 5, body: 'x' }, { id: 'R1', rating: 5, body: 'x' }, { id: 'R2', rating: 2, body: 'y' }] });
  const m = A.mergeData(base, {}, imp.concat(imp));
  assert.equal(m.books[0].ratingsTotal, 141);
  assert.equal(m.books[0].metaSource, 'amazon');
  assert.equal(m.books[0].subtitle, 'The Astonishing Story');
  assert.equal(m.reviews['1632867818'].length, 2);
  assert.equal(m.books[0].prices[0].amount, 24.5);
});

test('precios en formatos de Amazon', () => {
  assert.equal(A.parsePrice('US$25,00'), 25);
  assert.equal(A.parsePrice('$1,234.50'), 1234.5);
  assert.equal(A.parsePrice('25,99 US$'), 25.99);
  assert.equal(A.parsePrice(null), null);
});

test('puntuación del nicho: pesos, cobertura y veredicto', () => {
  const books = [
    { asin: 'A', ratingsTotal: 354, rating: 4.8, publisherType: 'grande', publicationDate: '2020-07-06', prices: [{ format: 'Tapa dura', amount: 30 }] },
    { asin: 'B', ratingsTotal: 130, rating: 4.3, publisherType: 'grande', publicationDate: '2017-07', prices: [{ format: 'Tapa dura', amount: 27 }] },
    { asin: 'C', ratingsTotal: null, rating: null, publisherType: 'independiente', publicationDate: '2026-01-05', prices: [] }
  ];
  const res = A.analyzeAll(books, {}, { now: '2026-09-29' });
  const s = res.score;
  assert.ok(s.total >= 0 && s.total <= 100);
  assert.equal(s.parts.find((p) => p.id === 'hueco').score, null);
  assert.ok(s.coverage < 100);
  assert.ok(['bueno', 'viable', 'dificil', 'malo'].includes(s.verdict.level));
  assert.equal(res.market.totalRatings, 484);
  assert.equal(res.market.printPrice.median, 28.5);
});

test('términos distintivos entre reseñas críticas y positivas', () => {
  const rs = [];
  for (let i = 0; i < 6; i++) rs.push(A.analyzeReview(R('n' + i, 1, 'No illustrations at all, words only, disorganized chapters.')));
  for (let i = 0; i < 6; i++) rs.push(A.analyzeReview(R('p' + i, 5, 'Stunning photographs and beautiful binding, lovely gift.')));
  const t = A.distinctiveTerms(rs);
  assert.ok(t.critical.some((x) => x.term.includes('illustrations')));
  assert.ok(t.positive.some((x) => x.term.includes('photographs')));
});

test('fechas de publicación en texto pasan a ISO', () => {
  assert.equal(A.isoPublicationDate('13 de diciembre de 2022'), '2022-12-13');
  assert.equal(A.isoPublicationDate('July 11, 2017'), '2017-07-11');
  assert.equal(A.isoPublicationDate('diciembre de 2022'), '2022-12');
  assert.equal(A.isoPublicationDate('2020-07-06'), '2020-07-06');
  assert.equal(A.isoPublicationDate('Bloomsbury (2017)'), '2017');
  assert.equal(A.isoPublicationDate('sin fecha'), null);
});
