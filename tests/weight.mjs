// Peso comprimido de la página y cabeceras de caché, gzip y seguridad.
import http from 'node:http';
import https from 'node:https';
import { BASE, kb } from './lib.mjs';

function raw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'accept-encoding': 'gzip', ...headers }, rejectUnauthorized: process.env.INSECURE !== '1' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks).length, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}
let fails = 0;
const check = (ok, label, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); };

const html = await raw(BASE);
const plain = await (await fetch(BASE)).text();
const css = plain.match(/href="(app\.css\?v=[0-9a-f]+)"/)[1];
const js = plain.match(/src="(app\.js\?v=[0-9a-f]+)"/)[1];
const font = plain.match(/href="(fonts\/[^"]+\.woff2\?v=[0-9a-f]+)"/)[1];
const icon = plain.match(/href="(icon\.svg\?v=[0-9a-f]+)"/)[1];
const r = { html, css: await raw(BASE + css), js: await raw(BASE + js), font: await raw(BASE + font), icon: await raw(BASE + icon) };

console.log('\nPeso transferido (comprimido)');
for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(5)} ${kb(v.bytes).padStart(9)}  ${v.headers['content-encoding'] || '(sin gzip)'}  ${v.headers['cache-control']}`);
const page = r.html.bytes + r.css.bytes + r.js.bytes;
console.log(`  HTML + CSS + JS = ${kb(page)} (objetivo < 25 KB) · con la tipografía: ${kb(page + r.font.bytes)}`);
check(page < 25 * 1024, 'página principal por debajo de ~25 KB comprimidos', kb(page));

console.log('\nCabeceras');
for (const k of ['html', 'css', 'js']) check(r[k].headers['content-encoding'] === 'gzip', `gzip en ${k}`);
check(/no-cache/.test(r.html.headers['cache-control']) && !!r.html.headers.etag, 'HTML con no-cache + ETag', `${r.html.headers['cache-control']} ${r.html.headers.etag}`);
for (const k of ['css', 'js', 'font', 'icon']) check(/max-age=31536000/.test(r[k].headers['cache-control']) && /immutable/.test(r[k].headers['cache-control']), `${k} con ?v=hash e immutable`);
const reval = await raw(BASE, { 'if-none-match': r.html.headers.etag });
check(reval.status === 304, 'revalidación del HTML con ETag → 304', String(reval.status));
const csp = r.html.headers['content-security-policy'] || '';
check(/default-src 'self'/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp), 'CSP estricta', csp.slice(0, 80) + '…');
check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(plain) && !/\son[a-z]+=/i.test(plain) && !/\sstyle=/i.test(plain), 'sin scripts, manejadores ni estilos en línea');
check(/<script defer src=/.test(plain), 'un solo JS con defer');
check(/rel="preload" href="fonts\/inter[^"]*" as="font"/.test(plain), 'Inter autoalojada con preload');
const cssText = (await (await fetch(BASE + css)).text());
check(/font-display:swap/.test(cssText) && /content-visibility:auto/.test(cssText), 'font-display: swap y content-visibility: auto');
const third = (plain + cssText).match(/(?:src|href|url)\(?=?["']?https?:\/\/[^"')\s]+/g) || [];
check(third.length === 0, 'cero recursos de terceros en HTML/CSS', third.join(' '));
check((r.html.headers['set-cookie'] || []).length === 0, 'sin cookies');
check(r.html.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
console.log(`\nPeso y cabeceras: ${fails ? `${fails} FALLOS` : 'todo correcto'}`);
process.exitCode = fails ? 1 : 0;
