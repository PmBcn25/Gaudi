#!/usr/bin/env node
// Genera el marcador (bookmarklet) a partir de extractor/extractor.js:
//   extractor/bookmarklet.txt        → URL «javascript:…» lista para pegar en un marcador
//   extractor/instalar-marcador.html → página para instalarlo arrastrando un botón
// Uso: npm run bookmarklet
//
// The "minifier" is deliberately conservative and dependency-free: a small lexer that understands
// strings, template literals, regex literals and comments. It (1) renames the functions/variables
// declared at the top level of the IIFE to short fresh names (never property names), (2) removes
// comments and redundant whitespace, and line breaks only where automatic semicolon insertion can
// never apply. The result is compiled with node:vm before being written (and the tests compare its
// syntax tree with the original); if anything fails, the original file is used unchanged.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCE = join(ROOT, 'extractor', 'extractor.js');
const OUT_TXT = join(ROOT, 'extractor', 'bookmarklet.txt');
const OUT_HTML = join(ROOT, 'extractor', 'instalar-marcador.html');
// Firefox does not store bookmark URLs longer than 65 536 characters.
export const MAX_BOOKMARKLET_LENGTH = 65000;

const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCTUATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];

function isIdStart(c) { return /[A-Za-z_$\u0080-\uffff]/.test(c); }
function isIdPart(c) { return /[\w$\u0080-\uffff]/.test(c); }

/**
 * Splits JavaScript source into tokens: ws, nl, comment, str, tpl, re, id, num, punc.
 * Regex vs. division is decided from the previous significant token (the usual heuristic).
 */
export function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let prev = null; // previous significant token
  const push = (type, value) => {
    const t = { type, value };
    tokens.push(t);
    if (type !== 'ws' && type !== 'nl' && type !== 'comment') prev = t;
  };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.type === 'num' || prev.type === 'str' || prev.type === 'tpl' || prev.type === 're') return false;
    if (prev.type === 'id') return REGEX_KEYWORDS.has(prev.value);
    return !(prev.value === ')' || prev.value === ']' || prev.value === '}');
  };
  const readString = (start) => {
    const q = src[start];
    let j = start + 1;
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') j++;
      else if (src[j] === '\n') throw new Error(`Cadena sin cerrar en la posición ${start}`);
      j++;
    }
    if (j >= n) throw new Error(`Cadena sin cerrar en la posición ${start}`);
    return j + 1;
  };
  const readTemplate = (start) => {
    let j = start + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && src[j + 1] === '{') {
        j += 2;
        let depth = 1;
        while (j < n && depth > 0) {
          const d = src[j];
          if (d === '"' || d === "'") { j = readString(j); continue; }
          if (d === '`') { j = readTemplate(j); continue; }
          if (d === '{') depth++;
          else if (d === '}') depth--;
          j++;
        }
        continue;
      }
      j++;
    }
    throw new Error(`Plantilla sin cerrar en la posición ${start}`);
  };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '\n') { push('nl', '\n'); i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff') {
      let j = i + 1;
      while (j < n && /[ \t\r\f\v\u00a0\ufeff]/.test(src[j])) j++;
      push('ws', src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      push('comment', src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error(`Comentario sin cerrar en la posición ${i}`);
      push('comment', src.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") { const j = readString(i); push('str', src.slice(i, j)); i = j; continue; }
    if (c === '`') { const j = readTemplate(i); push('tpl', src.slice(i, j)); i = j; continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') throw new Error(`Expresión regular sin cerrar en la posición ${i}`);
        if (inClass) { if (d === ']') inClass = false; } else if (d === '[') inClass = true; else if (d === '/') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      push('re', src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && /[+-]/.test(src[j + 1])) j++;
        j++;
      }
      push('num', src.slice(i, j));
      i = j;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src[j])) j++;
      push('id', src.slice(i, j));
      i = j;
      continue;
    }
    const p = PUNCTUATORS.find((x) => src.startsWith(x, i)) || c;
    push('punc', p);
    i += p.length;
  }
  return tokens;
}

const wordy = (t) => t && (t.type === 'id' || t.type === 'num' || (t.type === 're' && /[a-z]$/i.test(t.value)));

function needsSpace(a, b) {
  if (!a || !b) return false;
  if (wordy(a) && (b.type === 'id' || b.type === 'num')) return true;
  const av = a.value, bv = b.value;
  if ((av.endsWith('+') && bv.startsWith('+')) || (av.endsWith('-') && bv.startsWith('-'))) return true;
  if (av.endsWith('/') && (bv.startsWith('/') || bv.startsWith('*'))) return true;
  if (a.type === 'num' && bv.startsWith('.')) return true;
  if (av === '<' && bv.startsWith('!')) return true;
  return false;
}

// Line breaks can be dropped only where automatic semicolon insertion could never apply:
// after a token that cannot end a statement, or before a token that can only continue one.
const RESTRICTED = new Set(['return', 'throw', 'break', 'continue', 'yield', 'async']);
const JOIN_AFTER = new Set([';', '{', '(', '[', ',', '.', '?', ':', '=', '=>', '==', '===', '!=', '!==', '<', '>', '<=', '>=',
  '&&', '||', '??', '+', '-', '*', '/', '%', '**', '&', '|', '^', '!', '~', '+=', '-=', '*=', '/=', '%=', '&=', '|=',
  '^=', '<<', '>>', '>>>', '<<=', '>>=', '>>>=', '...']);
const JOIN_BEFORE = new Set(['.', ',', ')', ']', '}', ';', '?', ':', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>',
  '<=', '>=', '*', '%', '=', '+=', '-=', '*=', '/=', '%=', '|', '&', '^']);

function canJoinLines(prev, next) {
  if (prev.type === 'id' && RESTRICTED.has(prev.value)) return false;
  if ((prev.type === 'punc' && (prev.value === '++' || prev.value === '--')) ||
      (next.type === 'punc' && (next.value === '++' || next.value === '--'))) return false;
  if (prev.type === 'punc' && JOIN_AFTER.has(prev.value)) return true;
  if (next.type === 'punc' && JOIN_BEFORE.has(next.value)) return true;
  return prev.type === 'punc' && prev.value === '}' && next.type === 'id' && ['else', 'catch', 'finally'].includes(next.value);
}

/** Removes comments and redundant whitespace, and line breaks where that is provably safe. */
export function stripJs(src) {
  const sig = [];
  let nl = false, ws = false;
  for (const t of tokenize(src)) {
    if (t.type === 'nl' || (t.type === 'comment' && t.value.includes('\n'))) { nl = true; continue; }
    if (t.type === 'ws' || t.type === 'comment') { ws = true; continue; }
    sig.push({ ...t, nl, ws });
    nl = false;
    ws = false;
  }
  const out = [];
  sig.forEach((t, k) => {
    const prev = sig[k - 1];
    if (prev) {
      if (t.nl && !canJoinLines(prev, t)) out.push('\n');
      else if (needsSpace(prev, t)) out.push(' ');
    }
    out.push(t.value);
  });
  return out.join('');
}

// Contexts where "{" starts an object literal (otherwise it starts a block).
const OBJECT_AFTER = new Set(['=', '(', ',', ':', '[', '?', '||', '&&', '??', '!', '+', '-', '*', '/', '%', '==', '===', '!=',
  '!==', '<', '>', '<=', '>=', '+=', '-=', '...', '&', '|', '^', '~', 'return', 'typeof', 'void', 'in', 'of', 'case',
  'throw', 'delete', 'instanceof', 'yield', 'await']);
const NEVER_RENAME = new Set(['arguments', 'eval', 'undefined', 'window', 'document', 'this']);

function freshNames(taken) {
  let n = 0;
  return () => {
    let name;
    do { name = `$${(n++).toString(36)}`; } while (taken.has(name));
    return name;
  };
}

/**
 * Renames the functions and variables declared directly in the body of the outer IIFE to short
 * fresh names. Uniform renaming of those bindings is safe: every free use inside the IIFE refers
 * to them, local shadowing declarations are renamed consistently and the new names are unused.
 * Property accesses (a.name) and object keys ({name: …}) are never touched; names that appear as
 * shorthand properties or methods are skipped altogether.
 * @returns {{ code: string, map: Record<string, string> }}
 */
export function mangleTopLevel(src) {
  const toks = tokenize(src);
  const sig = [];
  toks.forEach((t, i) => { if (t.type !== 'ws' && t.type !== 'nl' && t.type !== 'comment') sig.push(i); });
  const stack = [];
  let braces = 0;
  const declared = new Set();
  const unsafe = new Set();
  const taken = new Set();
  const refs = [];
  sig.forEach((i, s) => {
    const t = toks[i];
    const prev = s > 0 ? toks[sig[s - 1]] : null;
    const next = s + 1 < sig.length ? toks[sig[s + 1]] : null;
    if (t.type === 'punc') {
      if (t.value === '{') { stack.push({ ch: '{', obj: !!prev && OBJECT_AFTER.has(prev.value) }); braces++; }
      else if (t.value === '(' || t.value === '[') stack.push({ ch: t.value, obj: false });
      else if (t.value === '}' || t.value === ')' || t.value === ']') {
        const top = stack.pop();
        if (top && top.ch === '{') braces--;
      }
      return;
    }
    if (t.type !== 'id') return;
    taken.add(t.value);
    if (prev && (prev.value === '.' || prev.value === '?.')) return; // property access
    const top = stack[stack.length - 1];
    if (top && top.obj && prev && (prev.value === '{' || prev.value === ',')) {
      if (next && next.value === ':') return; // object key
      unsafe.add(t.value); // shorthand property or method: leave this name alone
      return;
    }
    if (braces === 1 && prev && prev.type === 'id' && (prev.value === 'function' || prev.value === 'var')) declared.add(t.value);
    refs.push(i);
  });
  const counts = new Map();
  refs.forEach((i) => {
    const v = toks[i].value;
    if (declared.has(v) && !unsafe.has(v) && !NEVER_RENAME.has(v) && v.length > 2) counts.set(v, (counts.get(v) || 0) + 1);
  });
  const next = freshNames(taken);
  const map = {};
  [...counts.entries()].sort((a, b) => b[1] * b[0].length - a[1] * a[0].length).forEach(([name]) => { map[name] = next(); });
  refs.forEach((i) => { if (map[toks[i].value]) toks[i] = { ...toks[i], value: map[toks[i].value] }; });
  return { code: toks.map((t) => t.value).join(''), map };
}

/**
 * Returns the code with string/template/regex contents and comments blanked out (same length is
 * not preserved) plus the list of regex literals — used by the tests to check the syntax level.
 */
export function maskJs(src) {
  const regexes = [];
  const code = tokenize(src).map((t) => {
    if (t.type === 'comment') return ' ';
    if (t.type === 'str') return '""';
    if (t.type === 'tpl') return '``';
    if (t.type === 're') { regexes.push(t.value); return '/re/'; }
    return t.value;
  }).join('');
  return { code, regexes };
}

// Percent-encodes only what a javascript: URL needs: "%" (the browser percent-decodes the URL
// before running it), controls/line breaks (URL parsers drop them), non-ASCII, and "?" / "#".
// Without a raw "?" or "#" the whole URL is an "opaque path", where browsers keep spaces and
// quotes as they are; after a raw "?" they would re-encode every space as %20 and the stored
// bookmark would grow well past Firefox's 65 536-character limit. The result is its own
// WHATWG serialization: new URL(href).href === href.
export function toBookmarklet(code) {
  let out = '';
  for (const ch of code) {
    const cp = ch.codePointAt(0);
    out += (cp < 0x21 && ch !== ' ') || cp > 0x7e || '%?#`'.includes(ch) ? encodeURIComponent(ch) : ch;
  }
  return `javascript:${out}`;
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderInstallPage({ href, consoleCode, version, length }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instalar el marcador · Extractor de reseñas KDP</title>
<style>
  :root { --bg:#f6f5f2; --fg:#1d1d1f; --muted:#5f6368; --card:#ffffff; --line:#e2e0da; --accent:#9a6b00; --btn:#ffd814; --btn-fg:#111111; --code:#f1efe9; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#151618; --fg:#ececec; --muted:#a3a7ab; --card:#1e2023; --line:#34373b; --accent:#e5b94e; --btn:#f0c14b; --btn-fg:#111111; --code:#26292d; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 30px; line-height:1.2; margin: 0 0 8px; }
  h2 { font-size: 20px; margin: 0 0 12px; }
  .lead { color: var(--muted); margin: 0 0 24px; }
  .card { background: var(--card); border:1px solid var(--line); border-radius: 14px; padding: 20px 20px 16px; margin: 0 0 18px; }
  ol, ul { padding-left: 22px; margin: 0 0 12px; }
  li { margin: 4px 0; }
  kbd { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code); border:1px solid var(--line); border-bottom-width:2px; border-radius:5px; padding:0 5px; }
  code { font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code); border-radius:4px; padding:1px 4px; }
  .drag { text-align:center; margin: 18px 0 8px; }
  .bookmarklet { display:inline-block; font-size:22px; font-weight:700; padding:14px 26px; border-radius:12px; background:var(--btn); color:var(--btn-fg); text-decoration:none; box-shadow:0 3px 0 rgba(0,0,0,.18); cursor:grab; }
  .bookmarklet:active { cursor:grabbing; }
  .hint { text-align:center; color: var(--muted); font-size: 14px; margin: 0 0 8px; }
  textarea { width:100%; height:110px; resize:vertical; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code); color: var(--fg); border:1px solid var(--line); border-radius:8px; padding:8px; }
  button.copy { font: inherit; font-size:15px; margin: 8px 0 4px; padding: 7px 14px; border-radius: 8px; border:1px solid var(--line); background: var(--card); color: var(--fg); cursor:pointer; }
  details summary { cursor:pointer; color: var(--accent); font-weight:600; margin: 8px 0; }
  table { border-collapse: collapse; width:100%; font-size: 15px; }
  th, td { text-align:left; vertical-align:top; padding: 6px 8px; border-top:1px solid var(--line); }
  .muted { color: var(--muted); font-size: 14px; }
  footer { color: var(--muted); font-size: 13px; text-align:center; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <h1>📥 Extractor de reseñas KDP</h1>
  <p class="lead">Un marcador del navegador que descarga todas las reseñas de un libro de Amazon (buenas y malas) y sus datos —portada, título, subtítulo, nota, número de valoraciones, precio— en un archivo JSON para el panel de análisis.</p>

  <section class="card">
    <h2>1. Instala el marcador</h2>
    <ol>
      <li>Muestra la barra de marcadores: <kbd>Ctrl</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd> en Windows/Linux, <kbd>⌘</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd> en Mac.</li>
      <li>Arrastra este botón hasta la barra de marcadores y suéltalo allí:</li>
    </ol>
    <p class="drag"><a class="bookmarklet" id="marcador" href="${escHtml(href)}" title="Arrástrame a la barra de marcadores">📥 Extraer reseñas KDP</a></p>
    <p class="hint">Arrástralo, no lo pulses: en esta página no hace nada.</p>
    <details>
      <summary>¿No puedes arrastrarlo? Créalo a mano</summary>
      <ol>
        <li>Copia la dirección del marcador con este botón (también está en <code>extractor/bookmarklet.txt</code>):<br>
          <button type="button" class="copy" data-copiar="url-marcador">Copiar dirección del marcador</button>
          <textarea readonly id="url-marcador" aria-label="Dirección del marcador">${escHtml(href)}</textarea></li>
        <li>Chrome / Edge: clic derecho en la barra de marcadores → «Añadir página…». Firefox: clic derecho → «Añadir marcador…». Safari: añade esta página a Favoritos y luego «Editar dirección».</li>
        <li>Nombre: <code>Extraer reseñas KDP</code>. En «URL» / «Dirección», pega lo copiado y guarda.</li>
      </ol>
    </details>
  </section>

  <section class="card">
    <h2>2. Úsalo en Amazon</h2>
    <ol>
      <li><strong>Inicia sesión en Amazon</strong> con tu cuenta normal: Amazon solo muestra la lista completa de reseñas con la sesión iniciada.</li>
      <li>Abre la ficha del libro (la página del producto) o directamente su página de reseñas.</li>
      <li>Pulsa el marcador <strong>📥 Extraer reseñas KDP</strong>. Aparece un panel abajo a la derecha.</li>
      <li>Si estabas en la ficha, el panel guarda precio, formatos y ranking y abre la página de reseñas: <strong>cuando termine de cargar, pulsa el marcador otra vez</strong>.</li>
      <li>El panel pulsa «Mostrar 10 opiniones más» él solo hasta que no queden más, con pausas para no saturar a Amazon. Puedes pulsar <em>Detener</em> en cualquier momento.</li>
      <li>Marca <em>«Recorrer también los filtros por estrellas (más completo)»</em> si el libro tiene muchas reseñas: Amazon muestra como mucho unas 100 por lista y los filtros de 1 a 5 estrellas permiten recoger más.</li>
      <li>Al terminar se descarga <code>resenas-&lt;ASIN&gt;.json</code> en tu carpeta de descargas. Llévalo al panel (página «Importar») o guárdalo en <code>data/raw/</code>.</li>
    </ol>
  </section>

  <section class="card">
    <h2>3. Alternativa: pegar el código en la consola</h2>
    <ol>
      <li>En la página de reseñas de Amazon abre las herramientas de desarrollo: <kbd>F12</kbd> (Mac: <kbd>⌥</kbd>+<kbd>⌘</kbd>+<kbd>J</kbd> en Chrome, <kbd>⌥</kbd>+<kbd>⌘</kbd>+<kbd>C</kbd> en Safari) y ve a la pestaña <strong>Consola</strong>.</li>
      <li>Copia el código con el botón, pégalo en la consola y pulsa <kbd>Intro</kbd>.</li>
      <li>La primera vez el navegador bloquea el pegado: escribe <code>permitir pegar</code> (o <code>allow pasting</code> si está en inglés), pulsa <kbd>Intro</kbd> y vuelve a pegar.</li>
    </ol>
    <button type="button" class="copy" data-copiar="codigo-consola">Copiar código para la consola</button>
    <textarea readonly id="codigo-consola" aria-label="Código para la consola">${escHtml(consoleCode)}</textarea>
  </section>

  <section class="card">
    <h2>Notas por navegador</h2>
    <table>
      <tr><th>Chrome / Edge</th><td>Arrastrar funciona. No pegues el código en la barra de direcciones: Chrome borra el prefijo <code>javascript:</code>; úsalo siempre desde el marcador.</td></tr>
      <tr><th>Firefox</th><td>Arrastrar funciona. El marcador mide ${length.toLocaleString('es-ES')} caracteres (Firefox admite hasta 65 536).</td></tr>
      <tr><th>Safari</th><td>Activa la barra de Favoritos (<kbd>⌘</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd>) y arrastra el botón. Si no lo guarda, usa «Créalo a mano» o la consola (activa antes el menú Desarrollo en Ajustes → Avanzado).</td></tr>
    </table>
  </section>

  <section class="card">
    <h2>Privacidad</h2>
    <p class="muted">El código solo lee las páginas de Amazon que tienes abiertas (y otras del mismo dominio de Amazon, como las páginas siguientes de reseñas o la ficha del libro). No envía datos a ningún otro sitio: el resultado se queda en tu ordenador como archivo JSON.</p>
  </section>

  <footer>Extractor de reseñas KDP v${escHtml(version)} · generado por <code>npm run bookmarklet</code></footer>
</main>
<script>
  document.getElementById('marcador').addEventListener('click', function (e) {
    e.preventDefault();
    alert('Arrastra este botón a la barra de marcadores. Después, úsalo en la página de reseñas de un libro en Amazon.');
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-copiar]'), function (btn) {
    btn.addEventListener('click', function () {
      var box = document.getElementById(btn.getAttribute('data-copiar'));
      var label = btn.textContent;
      function done(ok) { btn.textContent = ok ? '¡Copiado!' : 'Selecciónalo y copia con Ctrl+C'; setTimeout(function () { btn.textContent = label; }, 2500); }
      function fallback() { box.focus(); box.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(function () { done(true); }, fallback);
      else fallback();
    });
  });
</script>
</body>
</html>
`;
}

export async function build({ quiet = false, write = true } = {}) {
  const src = await readFile(SOURCE, 'utf8');
  const version = (src.match(/var version = '([^']+)'/i) || [])[1] || '0';
  let code;
  let map = {};
  try {
    const mangled = mangleTopLevel(src);
    map = mangled.map;
    code = stripJs(mangled.code);
    new vm.Script(code, { filename: 'bookmarklet.js' });
  } catch (e) {
    if (!quiet) console.warn(`Aviso: no se pudo compactar el código (${e.message}); uso el archivo completo.`);
    code = src;
    map = {};
  }
  code = code.trim();
  if (!/void 0;$/.test(code)) code += '\nvoid 0;';
  const href = toBookmarklet(code);
  const html = renderInstallPage({ href, consoleCode: code, version, length: href.length });
  if (!write) return { href, code, version, html, map };
  await writeFile(OUT_TXT, href, 'utf8');
  await writeFile(OUT_HTML, html, 'utf8');
  if (!quiet) {
    console.log(`Marcador v${version} generado:`);
    console.log(`  extractor/bookmarklet.txt        (${href.length.toLocaleString('es-ES')} caracteres; original ${src.length.toLocaleString('es-ES')})`);
    console.log('  extractor/instalar-marcador.html (ábrelo en el navegador y arrastra el botón a la barra de marcadores)');
    if (href.length > MAX_BOOKMARKLET_LENGTH) console.warn('Aviso: el marcador supera 65 000 caracteres; Firefox podría no guardarlo. Usa la consola en ese caso.');
  }
  return { href, code, version, html, map };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => {
    console.error(`Error generando el marcador: ${e.message}`);
    process.exitCode = 1;
  });
}
