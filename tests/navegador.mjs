// Prueba la edición navegador (edicion-navegador/) en Chromium: conversiones reales en el
// propio navegador, descarga del resultado y comprobación de su cabecera mágica.
// Uso: node tests/navegador.mjs            (sirve la página en local)
//      BASE_URL=http://… node tests/navegador.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { FIX, OUTDIR, MAGIC, kb } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'edicion-navegador');
let base = process.env.NAV_URL;
let server;
if (!base) {
  // Igual que el artifact: el contenido de index.html dentro de un esqueleto mínimo.
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>${fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')}</body></html>`;
  const types = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain' };
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(page); }
    const f = path.join(ROOT, path.normalize(u).replace(/^\/+/, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
}

function unzipFirst(buf) {
  // Primer archivo de un ZIP (almacenado o deflate) usando el directorio central.
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const names = [];
  let first = null;
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28); const xl = buf.readUInt16LE(p + 30); const cl = buf.readUInt16LE(p + 32); const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    names.push(name);
    if (!first) {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = buf.subarray(start, start + csize);
      first = method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nl + xl + cl;
  }
  return { names, first };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);

let ok = 0; let total = 0;
async function addFile(file) {
  await page.waitForFunction(() => !document.querySelector('.card.out'));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#drop')]);
  await fc.setFiles(path.join(FIX, file));
  const card = page.locator('.card:not(.out)').last();
  await card.locator('.c-body:not([hidden]), .err:not([hidden])').first().waitFor({ timeout: 60000 });
  return card;
}
async function run(file, target, magic, opts = {}) {
  total++;
  const label = `${file} → ${target}`;
  const t0 = Date.now();
  try {
    const card = await addFile(file);
    const err = await card.locator('.err:not([hidden])').count();
    if (err) throw new Error(await card.locator('.err').textContent());
    await card.locator(`.t[data-id="${target}"]`).click();
    for (const [k, v] of Object.entries(opts)) await card.locator(`[data-k="${k}"]`).fill(String(v));
    await card.locator('.go').click();
    await card.locator('.done:not([hidden]), .err:not([hidden])').first().waitFor({ timeout: 180000 });
    if (await card.locator('.err:not([hidden])').count()) throw new Error(await card.locator('.err').textContent());
    const [dl] = await Promise.all([page.waitForEvent('download'), card.locator('.dl').click()]);
    const name = dl.suggestedFilename();
    const buf = fs.readFileSync(await dl.path());
    let inner = buf; let note = '';
    if (name.endsWith('.zip') && magic !== 'zip') { const z = unzipFirst(buf); inner = z.first; note = ` (ZIP: ${z.names.join(', ')})`; }
    fs.writeFileSync(path.join(OUTDIR, `nav-${name}`), buf);
    if (!MAGIC[magic](inner)) throw new Error(`cabecera no es ${magic}: ${inner.subarray(0, 12).toString('hex')}`);
    ok++;
    console.log(`  ✓ ${label.padEnd(34)} ${name.padEnd(30)} ${kb(buf.length).padStart(9)} ${String(Date.now() - t0).padStart(6)} ms${note}`);
    await card.locator('.x').click();
  } catch (e) {
    console.log(`  ✗ ${label.padEnd(34)} ${String(e.message).split('\n')[0]}`);
  }
}
async function expectError(file, re) {
  total++;
  const card = await addFile(file);
  const msg = (await card.locator('.err').textContent().catch(() => '')) || '';
  const pass = re.test(msg);
  if (pass) ok++;
  console.log(`  ${pass ? '✓' : '✗'} ${`${file} (error)`.padEnd(34)} «${msg}»`);
  await card.locator('.x').click();
}

console.log(`\nEdición navegador en ${base}`);
{
  total++;
  const html = await page.content();
  const pass = !/iniciar sesi|crear cuenta|#entrar|#crear|9 €|29 €/i.test(html) && (await page.locator('.plan').count()) === 1;
  if (pass) ok++;
  console.log(`  ${pass ? '✓' : '✗'} sin «Iniciar sesión» ni «Crear cuenta»; un único plan (0 €)`);
}
console.log('Imágenes');
await run('photo.jpg', 'img-webp', 'webp');
await run('photo.jpg', 'img-png', 'png');
await run('photo.jpg', 'img-gif', 'gif');
await run('photo.jpg', 'img-bmp', 'bmp');
await run('photo.jpg', 'img-ico', 'ico');
await run('photo.jpg', 'img-pdf', 'pdf');
await run('alpha.png', 'img-jpeg', 'jpg');
await run('logo.svg', 'img-png', 'png');
await run('image.bmp', 'img-webp', 'webp');
await run('favicon.ico', 'img-png', 'png');
await run('image.webp', 'img-jpeg', 'jpg');
console.log('Audio');
await run('tone.wav', 'a-mp3', 'mp3');
await run('voice.mp3', 'a-wav', 'wav');
await run('music.flac', 'a-mp3', 'mp3');
await run('song.ogg', 'a-wav', 'wav');
await run('song.opus', 'a-mp3', 'mp3');
console.log('Vídeo (WebM VP9 + Opus; Chromium de pruebas no trae H.264/AAC)');
await run('screen.webm', 'v-gif', 'gif');
await run('screen.webm', 'v-jpg', 'jpg');
await run('screen.webm', 'v-mp3', 'mp3');
console.log('Documentos');
await run('report.docx', 'd-html', 'html');
await run('report.docx', 'd-md', 'md');
await run('report.docx', 'd-txt', 'txt');
await run('personas.xlsx', 's-csv', 'csv');
await run('personas.xlsx', 's-ods', 'ods');
await run('personas.xlsx', 's-json', 'txt');
await run('ventas.csv', 's-xlsx', 'xlsx');
await run('personas.xls', 's-xlsx', 'xlsx');
console.log('PDF');
await run('pages.pdf', 'pdf-extract', 'pdf', { pages: '1-3,5' });
await run('pages.pdf', 'pdf-split', 'zip');
await run('pages.pdf', 'pdf-rotate', 'pdf');
await run('pages.pdf', 'pdf-jpg', 'zip');
await run('pages.pdf', 'pdf-png', 'zip');
await run('pages.pdf', 'pdf-txt', 'txt');
console.log('Texto');
await run('readme.md', 't-html', 'html');
await run('readme.md', 't-docx', 'docx');
await run('page.html', 't-md', 'md');
await run('notes.txt', 't-docx', 'docx');
console.log('Subtítulos');
await run('subs.srt', 'sub-vtt', 'vtt');
await run('subs.vtt', 'sub-srt', 'srt');
await run('subs.ass', 'sub-srt', 'srt');
await run('subs.srt', 'sub-ass', 'ass');
console.log('Unir PDF');
{
  total++;
  await addFile('pages.pdf'); await addFile('second.pdf');
  await page.locator('#merge-go').click();
  const card = page.locator('.card').last();
  await card.locator('.done:not([hidden]), .err:not([hidden])').first().waitFor({ timeout: 60000 });
  const merr = await card.locator('.err:not([hidden])').count() ? await card.locator('.err').textContent() : '';
  if (merr) console.log(`    error: ${merr}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), card.locator('.dl').click()]).catch((e) => { console.log(`    ${e.message.split('\n')[0]}`); return [null]; });
  const buf = dl ? fs.readFileSync(await dl.path()) : Buffer.alloc(0);
  let pages = 0;
  if (buf.length) { const f = path.join(OUTDIR, 'nav-unido.pdf'); fs.writeFileSync(f, buf); try { pages = Number(execFileSync('qpdf', ['--show-npages', f]).toString()); } catch { pages = 0; } }
  const pass = MAGIC.pdf(buf) && pages === 12;
  if (pass) ok++;
  console.log(`  ${pass ? '✓' : '✗'} ${'pages.pdf + second.pdf → unir'.padEnd(34)} ${pages} páginas`);
}
console.log('Errores claros');
await expectError('corrupt.jpg', /incompleta|dañada/);
await expectError('fake.png', /solo hay texto/);
await expectError('random.xyz', /no está soportado/);
await expectError('deck.pptx', /servidor/);
await expectError('locked.pdf', /contraseña/);
await expectError('corrupt.pdf', /dañado/);

console.log(`\nEdición navegador: ${ok}/${total} correctas · errores de consola: ${errors.length ? errors.slice(0, 3).join(' | ') : 'ninguno'}`);
await browser.close();
if (server) server.close();
process.exitCode = ok === total && !errors.length ? 0 : 1;
