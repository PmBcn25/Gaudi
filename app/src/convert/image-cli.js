'use strict';
// Proceso hijo para todo lo que hace sharp/libvips. Se ejecuta aparte para que una
// imagen maliciosa o rota no pueda tumbar el worker. Uso: node image-cli.js '<json>'
const fs = require('fs');
const sharp = require('sharp');

sharp.cache(false);
sharp.concurrency(1);

const spec = JSON.parse(process.argv[2]);

function open(input, meta) {
  const o = { failOn: 'error', animated: false, limitInputPixels: 268402689 };
  // Los SVG se rasterizan a una densidad que dé al menos ~2000 px de ancho.
  if (meta && meta.format === 'svg' && meta.width) {
    o.density = Math.max(72, Math.min(1200, Math.round(72 * Math.max(1, 2000 / meta.width))));
  }
  return sharp(input, o);
}

async function probe(input) {
  const m = await sharp(input, { failOn: 'error', limitInputPixels: 268402689 }).metadata();
  return m;
}

async function main() {
  const meta = await probe(spec.input);
  if (spec.op === 'probe-thumb') {
    // Decodificar la miniatura obliga a leer la imagen entera: así detectamos archivos rotos.
    await open(spec.input, meta).rotate().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 }).toFile(spec.thumb);
    process.stdout.write(JSON.stringify({
      width: meta.autoOrient ? meta.autoOrient.width : (meta.orientation >= 5 ? meta.height : meta.width),
      height: meta.autoOrient ? meta.autoOrient.height : (meta.orientation >= 5 ? meta.width : meta.height),
      pages: meta.pages || 1, hasAlpha: !!meta.hasAlpha, format: meta.format,
    }));
    return;
  }
  if (spec.op === 'thumb') {
    await open(spec.input, meta).rotate().resize({ width: spec.width || 320, height: spec.width || 320, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 }).toFile(spec.output);
    return;
  }

  let img = open(spec.input, meta).rotate();
  const maxW = Number(spec.maxWidth) || 0;
  if (maxW > 0) img = img.resize({ width: maxW, withoutEnlargement: true });
  const q = Number(spec.quality) || 80;

  if (spec.op === 'ico') {
    // Favicon con varias resoluciones; cada entrada va como PNG (válido desde Windows Vista).
    const sizes = spec.sizes;
    const pngs = [];
    for (const s of sizes) {
      pngs.push(await open(spec.input, meta).rotate()
        .resize({ width: s, height: s, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer());
    }
    const head = Buffer.alloc(6 + 16 * sizes.length);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    let offset = head.length;
    sizes.forEach((s, i) => {
      const e = 6 + 16 * i;
      head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
      head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
      head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
      head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
      offset += pngs[i].length;
    });
    fs.writeFileSync(spec.output, Buffer.concat([head, ...pngs]));
    return;
  }

  if (spec.op === 'pdf') {
    // PDF de una página con la imagen (JPEG embebido tal cual, DCTDecode).
    const { data, info } = await img.flatten({ background: '#ffffff' }).jpeg({ quality: q, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true });
    fs.writeFileSync(spec.output, jpegToPdf(data, info.width, info.height));
    return;
  }

  switch (spec.format) {
    case 'webp': img = img.webp({ quality: q, effort: 4 }); break;
    case 'jpeg': img = img.flatten({ background: '#ffffff' }).jpeg({ quality: q, progressive: true, mozjpeg: false }); break;
    case 'png': img = img.png({ compressionLevel: 6 }); break;
    case 'avif': img = img.avif({ quality: Math.max(1, q - 15), effort: 2 }); break;
    case 'tiff': img = img.tiff({ compression: 'lzw' }); break;
    case 'gif': img = img.gif({ effort: 4 }); break;
    default: throw new Error('formato desconocido ' + spec.format);
  }
  await img.toFile(spec.output);
}

function jpegToPdf(jpeg, w, h) {
  // Página a 96 ppp (los píxeles se ven a su tamaño real en pantalla), máximo 200 pulgadas.
  let pw = (w * 72) / 96; let ph = (h * 72) / 96;
  const k = Math.min(1, 14400 / Math.max(pw, ph));
  pw = +(pw * k).toFixed(2); ph = +(ph * k).toFixed(2);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const parts = [];
  const offsets = [];
  let len = 0;
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(buf); len += buf.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg); push('\nendstream');
  });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push('<< /Producer (Convertia) >>'));
  const xref = len;
  let x = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

main().catch((err) => {
  process.stderr.write(String(err && err.message ? err.message : err));
  process.exit(1);
});
