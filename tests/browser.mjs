// La web en un navegador real (Chromium): escritorio y móvil (375 px).
// Sin desbordes horizontales, sin errores de consola, sin recursos de terceros,
// el dropeador funciona (clic, teclado, arrastrar a la ventana, pegar) y los
// formularios de acceso no envían nada.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { BASE, FIX, OUTDIR } from './lib.mjs';

const host = new URL(BASE).host;
let fails = 0;
const check = (ok, label, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); };
const browser = await chromium.launch();

async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.sprite, .skip, .veil, .toasts, [hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${el.className && el.className.baseVal === undefined ? el.className : ''}`);
    }
    return { scroll: document.documentElement.scrollWidth, width: w, bad: bad.slice(0, 5) };
  });
}

for (const [name, opts] of [
  ['escritorio', { viewport: { width: 1366, height: 860 } }],
  ['móvil 375 px', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  console.log(`\nNavegador: ${name}`);
  const ctx = await browser.newContext({ ...opts, ignoreHTTPSErrors: process.env.INSECURE === '1' });
  const page = await ctx.newPage();
  const errors = [];
  const foreign = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['blob:', 'data:'].includes(u.protocol) && u.host !== host) foreign.push(r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  const slug = name.startsWith('m') ? 'movil' : 'escritorio';
  await page.screenshot({ path: path.join(OUTDIR, `web-${slug}-inicio.png`) });
  const dropText = await page.textContent('.drop-main');
  check(opts.isMobile ? /Toca para añadir/.test(dropText) : /Suelta aquí tus archivos/.test(dropText), 'texto del dropeador', `«${dropText}»`);

  // Recorre la página entera (secciones con content-visibility) buscando desbordes.
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(40); }
  await page.evaluate(() => scrollTo(0, 0));
  let o = await overflow(page);
  check(o.scroll <= o.width && !o.bad.length, 'sin desbordes horizontales (página entera)', `${o.scroll}px de ${o.width}px ${o.bad.join(' ')}`);

  // Pulsar el dropeador abre el selector del sistema (ratón/dedo y teclado).
  let chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  if (opts.hasTouch) await page.tap('#drop'); else await page.click('#drop');
  const fc = await chooser.catch(() => null);
  check(!!fc, opts.hasTouch ? 'tocar el dropeador abre el selector' : 'clic en el dropeador abre el selector');
  if (fc) await fc.setFiles([path.join(FIX, 'photo.jpg')]);
  if (!opts.hasTouch) {
    await page.focus('#drop');
    chooser = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.keyboard.press('Enter');
    check(!!(await chooser.catch(() => null)), 'Enter con el foco en el dropeador abre el selector');
  }

  // Arrastrar un archivo a CUALQUIER parte de la ventana: velo y borde animado; soltar añade la tarjeta.
  const dt = await page.evaluateHandle(async () => {
    const d = new DataTransfer();
    d.items.add(new File(['1\n00:00:01,000 --> 00:00:02,000\nHola\n'], 'arrastrado.srt', { type: 'application/x-subrip' }));
    return d;
  });
  await page.dispatchEvent('footer', 'dragenter', { dataTransfer: dt });
  const veil = await page.evaluate(() => document.body.classList.contains('dragging') && getComputedStyle(document.querySelector('.veil')).opacity);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUTDIR, `web-${slug}-arrastrando.png`) });
  check(!!veil, 'al arrastrar sobre la ventana, toda la página reacciona (velo)');
  await page.dispatchEvent('footer', 'drop', { dataTransfer: dt });
  // Pegar (Ctrl+V) un archivo del portapapeles.
  await page.evaluate(() => {
    const d = new DataTransfer();
    d.items.add(new File(['# Pegado\n\nTexto.'], 'pegado.md', { type: 'text/markdown' }));
    const ev = new ClipboardEvent('paste', { clipboardData: d, bubbles: true });
    document.dispatchEvent(ev);
  });
  await page.waitForFunction(() => document.querySelectorAll('.card').length >= 3, null, { timeout: 15000 }).catch(() => {});
  const names = await page.$$eval('.card .c-name', (els) => els.map((e) => e.textContent));
  check(names.includes('photo.jpg') && names.includes('arrastrado.srt') && names.includes('pegado.md'), 'tarjetas por selector, arrastre y pegado', names.join(', '));
  await page.waitForFunction(() => [...document.querySelectorAll('.card')].every((c) => !c.querySelector('.c-body').hidden || !c.querySelector('.err').hidden), null, { timeout: 30000 }).catch(() => {});
  const compact = await page.textContent('.drop-main');
  check(/más archivos/.test(compact), 'con archivos, el dropeador se compacta', `«${compact}»`);

  // Convertir la foto y descargar.
  const card = page.locator('.card', { hasText: 'photo.jpg' });
  await card.locator('.go').click();
  await card.locator('.done:not([hidden])').waitFor({ timeout: 60000 }).catch(() => {});
  const saving = (await card.locator('.save').textContent().catch(() => '')) || '';
  const href = await card.locator('a.dl').getAttribute('href').catch(() => null);
  check(/→/.test(saving) && /api\/jobs\/.+\/download/.test(href || ''), 'convertir y enlace de descarga', saving.replace(/\s+/g, ' ').trim());
  if (href) {
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await card.locator('a.dl').click();
    const d = await dl.catch(() => null);
    check(!!d && /\.webp$/.test(d.suggestedFilename()), 'la descarga funciona', d ? d.suggestedFilename() : 'sin descarga');
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUTDIR, `web-${slug}-convertido.png`), fullPage: false });

  // Escape cancela lo que está en marcha.
  if (!opts.isMobile) {
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#drop')]);
    await fc2.setFiles([path.join(FIX, 'long1080.mp4')]);
    const vcard = page.locator('.card', { hasText: 'long1080.mp4' });
    await vcard.locator('.go').waitFor({ state: 'visible', timeout: 60000 });
    await vcard.locator('.t', { hasText: 'WebM' }).click();
    await vcard.locator('.go').click();
    await vcard.locator('.p-num:has-text("%")').waitFor({ timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: path.join(OUTDIR, `web-${slug}-progreso.png`) });
    await page.keyboard.press('Escape');
    await vcard.locator('.c-body:not([hidden])').waitFor({ timeout: 10000 }).catch(() => {});
    check(await vcard.locator('.c-body').isVisible(), 'Escape cancela la conversión en marcha');
  }

  o = await overflow(page);
  check(o.scroll <= o.width && !o.bad.length, 'sin desbordes con tarjetas abiertas', `${o.scroll}px de ${o.width}px ${o.bad.join(' ')}`);
  if (opts.isMobile) {
    const bar = await page.locator('#bar').isVisible();
    const box = await page.locator('#all').boundingBox();
    check(bar && box && box.width > 250, 'barra inferior fija con «+» y «Convertir todo» a ancho completo', box ? `${Math.round(box.width)}px` : '');
  }

  // Acceso: solo correo, nunca contraseña; al enviar no sale ninguna petición.
  await page.goto(BASE + 'acceso.html#crear');
  const pw = await page.locator('input[type=password]').count();
  check(pw === 0, 'la página de acceso no pide contraseña');
  const sent = [];
  page.on('request', (r) => sent.push(r.url()));
  for (const f of ['#entrar', '#crear']) {
    await page.fill(`${f} input[type=email]`, 'prueba@example.com');
    await page.click(`${f} button[type=submit]`);
  }
  await page.waitForTimeout(800);
  const msgs = await page.$$eval('form .msg', (els) => els.map((e) => e.textContent));
  check(sent.length === 0 && msgs.length === 2 && msgs.every((m) => /aún no están abiertas/.test(m)), 'los formularios no envían nada y muestran el aviso', `${sent.length} peticiones`);
  await page.screenshot({ path: path.join(OUTDIR, `web-${slug}-acceso.png`) });
  for (const p of ['terminos.html', 'privacidad.html']) {
    await page.goto(BASE + p);
    o = await overflow(page);
    check(o.scroll <= o.width, `${p} sin desbordes`);
  }
  check(errors.length === 0, 'sin errores de consola', errors.slice(0, 3).join(' | '));
  check(foreign.length === 0, 'cero recursos de terceros', foreign.slice(0, 3).join(' '));
  await ctx.close();
}
await browser.close();
console.log(`\nNavegador: ${fails ? `${fails} FALLOS` : 'todo correcto'}  (capturas en tests/out/)`);
fs.writeFileSync(path.join(OUTDIR, 'browser.txt'), `fallos: ${fails}\n`);
process.exitCode = fails ? 1 : 0;
