#!/usr/bin/env node
// Genera data/dataset.js (lo que lee el panel) a partir de:
//   data/libros-base.json      datos de partida de cada libro
//   data/senales-publicas.json señales públicas y competencia ampliada
//   data/mercado.json          contexto de mercado (opcional)
//   data/enlaces.txt           enlaces originales (para mostrar duplicados)
//   data/raw/*.json            reseñas extraídas de Amazon con el extractor
//
// Uso: npm run build
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);

await import(rel('assets/js/lexicon.js'));
await import(rel('assets/js/analysis.js'));
const A = globalThis.KDPAnalysis;

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

const ASIN_RE = /\/(?:dp|product-reviews|customer-reviews|gp\/product)\/([A-Z0-9]{10})/i;

async function readLinks() {
  const file = rel('data/enlaces.txt');
  if (!existsSync(file)) return null;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const seen = new Map();
  const list = lines.map((url) => {
    const m = url.match(ASIN_RE) || url.match(/^([A-Z0-9]{10})$/i);
    const asin = m ? m[1].toUpperCase() : null;
    const dup = asin != null && seen.has(asin);
    if (asin && !dup) seen.set(asin, url);
    return { url, asin, duplicate: dup };
  });
  return { total: list.length, unique: seen.size, duplicates: list.filter((l) => l.duplicate).length, list };
}

async function readRawImports() {
  const dir = rel('data/raw');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const imports = [];
  for (const f of files) {
    try {
      const json = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
      for (const imp of A.parseImport(json)) imports.push({ ...imp, file: f });
    } catch (err) {
      console.warn(`  ! ${f}: ${err.message}`);
    }
  }
  return imports;
}

const base = await readJson(rel('data/libros-base.json'), { books: [] });
const signals = await readJson(rel('data/senales-publicas.json'), { signals: [], competitors: [] });
const market = await readJson(rel('data/mercado.json'), null);
const links = await readLinks();
const imports = await readRawImports();

const baseBooks = base.books.map((b) => ({ ...b, metaSource: 'web', metaDate: base.consultado }));
const merged = A.mergeData(baseBooks, {}, imports);

const dataset = {
  schema: 'kdp-dataset/1',
  generatedAt: new Date().toISOString(),
  consultado: base.consultado,
  links,
  books: merged.books,
  reviews: merged.reviews,
  signals: signals.signals || [],
  competitors: signals.competitors || [],
  market,
  imports: imports.map((i) => ({ asin: i.asin, file: i.file, count: i.reviews.length, exportedAt: i.exportedAt,
    complete: i.complete, tool: i.tool }))
};

const banner = '/* Archivo generado por tools/build-data.mjs. No lo edites a mano: cambia los JSON de data/ y ejecuta npm run build. */\n';
await writeFile(rel('data/dataset.js'), banner + 'window.KDP_DATASET = ' + JSON.stringify(dataset, null, 1) + ';\n');

// El código del extractor, para copiarlo desde la página «Importar reseñas».
if (existsSync(rel('extractor/extractor.js'))) {
  const source = await readFile(rel('extractor/extractor.js'), 'utf8');
  const bookmarklet = existsSync(rel('extractor/bookmarklet.txt')) ? (await readFile(rel('extractor/bookmarklet.txt'), 'utf8')).trim() : null;
  const version = (source.match(/version\s*[:=]\s*['"]([^'"]+)['"]/) || [])[1] || null;
  await writeFile(rel('data/extractor.js'), banner + 'window.KDP_EXTRACTOR = ' +
    JSON.stringify({ version, source, bookmarklet }) + ';\n');
}

const res = A.analyzeAll(merged.books, merged.reviews, { now: new Date().toISOString() });
console.log(`Libros: ${merged.books.length}  ·  enlaces: ${links ? `${links.total} (${links.unique} únicos, ${links.duplicates} repetidos)` : '—'}`);
console.log(`Reseñas importadas: ${res.reviewCount} de ${imports.length} archivo(s) en data/raw/`);
for (const b of merged.books) {
  const s = res.perBook[b.asin];
  console.log(`  ${b.asin}  ${String(b.shortTitle || b.title).padEnd(40).slice(0, 40)}  ` +
    `${String(s.extracted).padStart(4)} reseñas  ★ ${b.rating ?? '—'}  (${b.ratingsTotal ?? '—'} valoraciones)`);
}
console.log(`Puntuación del nicho: ${res.score.total ?? '—'} / 100 · ${res.score.verdict.label} (cobertura de datos ${res.score.coverage} %)`);
console.log('Escrito data/dataset.js');
