'use strict';
// Imágenes: sharp/libvips para lo que sabe leer y escribir; HEIC con libheif
// (heif-convert / heif-enc); el resto se decodifica antes a PNG con FFmpeg.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc');
const { UserError, explain } = require('./errors');
const { inputArgs } = require('./media');

const CLI = path.join(__dirname, 'image-cli.js');
const SHARP_READS = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'svg']);

async function sharpCli(spec, signal) {
  try {
    const { stdout } = await run(process.execPath, [CLI, JSON.stringify(spec)], { signal, nice: true });
    return stdout.toString('utf8');
  } catch (err) {
    if (err.user) throw err;
    throw explain(err, 'image') || new UserError('No se ha podido procesar la imagen.', 'failed');
  }
}

// Devuelve una ruta que sharp pueda leer: el original o un PNG decodificado (cacheado).
async function decodable(file, input, dir, signal) {
  if (SHARP_READS.has(file.format) && !(file.meta && file.meta.decoded)) return input;
  const png = path.join(dir, 'decoded.png');
  if (fs.existsSync(png)) return png;
  const tmp = png + '.part.png';
  try {
    if (file.format === 'heic') {
      await run('heif-convert', [input, tmp], { signal, nice: true });
      // heif-convert puede añadir sufijos si hay varias imágenes; nos quedamos con la principal.
      if (!fs.existsSync(tmp)) {
        const alt = fs.readdirSync(dir).find((f) => f.startsWith('decoded.png.part') && f.endsWith('.png'));
        if (!alt) throw new UserError('No se ha podido leer la foto HEIC.', 'corrupt');
        fs.renameSync(path.join(dir, alt), tmp);
      }
    } else {
      const pre = file.format === 'exr' ? ['-apply_trc', 'iec61966_2_1'] : [];
      await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...inputArgs(input, pre),
        '-frames:v', '1', '-update', '1', tmp], { signal, nice: true });
    }
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* nada */ }
    if (err.user) throw err;
    throw explain(err, 'image') || new UserError('La imagen está dañada o usa una variante que no podemos leer.', 'corrupt');
  }
  if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) throw new UserError('La imagen está dañada o vacía.', 'corrupt');
  fs.renameSync(tmp, png);
  return png;
}

// Análisis: dimensiones, si es animada, miniatura.
async function analyze(file, input, dir, signal) {
  let src = await decodable(file, input, dir, signal);
  let out;
  let decoded = false;
  try {
    out = await sharpCli({ op: 'probe-thumb', input: src, thumb: path.join(dir, 'thumb.webp') }, signal);
  } catch (err) {
    // Variantes que libvips no lee (p. ej. TIFF YCbCr submuestreado): se decodifican con FFmpeg.
    if (!SHARP_READS.has(file.format) || file.format === 'svg' || err.code === 'canceled') throw err;
    file.meta = { ...file.meta, decoded: true };
    src = await decodable(file, input, dir, signal);
    out = await sharpCli({ op: 'probe-thumb', input: src, thumb: path.join(dir, 'thumb.webp') }, signal);
    decoded = true;
  }
  const m = JSON.parse(out);
  return { width: m.width, height: m.height, animated: file.format === 'gif' && m.pages > 1, frames: m.pages, hasAlpha: m.hasAlpha, thumb: 'thumb.webp', decoded };
}

function jxlDistance(q) {
  // Mapeo de calidad (0-100) a distancia de libjxl, el mismo criterio que usa cjxl.
  if (q >= 100) return 0;
  return q >= 30 ? +(0.1 + (100 - q) * 0.09).toFixed(2) : +(6.4 + Math.pow(2.5, (30 - q) / 5) / 6.25).toFixed(2);
}

async function convert(ctx) {
  const { job, file, input, dir, outPath, signal } = ctx;
  const t = job.target;
  const o = job.options;
  if (!SHARP_READS.has(file.format) || file.meta.decoded) ctx.stage(`Leyendo ${file.meta.label || file.format.toUpperCase()}`);
  const src = await decodable(file, input, dir, signal);
  const work = path.join(ctx.outDir, 'work.png');
  const label = { 'img-heic': 'HEIC', 'img-jxl': 'JPEG XL', 'img-bmp': 'BMP', 'img-ico': 'ICO', 'img-pdf': 'PDF' }[t];
  ctx.stage(`Generando ${label || t.slice(4).toUpperCase()}`);
  switch (t) {
    case 'img-webp': case 'img-jpeg': case 'img-png': case 'img-avif': case 'img-tiff': case 'img-gif':
      await sharpCli({ op: 'convert', input: src, output: outPath, format: t.slice(4), quality: o.quality, maxWidth: o.maxWidth }, signal);
      break;
    case 'img-ico': {
      const sizes = o.icoSize === 'all' ? [16, 32, 48, 64, 128, 256] : [Number(o.icoSize)];
      await sharpCli({ op: 'ico', input: src, output: outPath, sizes }, signal);
      break;
    }
    case 'img-pdf':
      await sharpCli({ op: 'pdf', input: src, output: outPath, quality: o.quality, maxWidth: o.maxWidth }, signal);
      break;
    case 'img-heic':
      await sharpCli({ op: 'convert', input: src, output: work, format: 'png', maxWidth: o.maxWidth }, signal);
      await run('heif-enc', ['-q', String(o.quality), '-o', outPath, work], { signal, nice: true })
        .catch((err) => { throw explain(err, 'image') || new UserError('No se ha podido codificar el HEIC.', 'failed'); });
      break;
    case 'img-jxl':
      await sharpCli({ op: 'convert', input: src, output: work, format: 'png', maxWidth: o.maxWidth }, signal);
      await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...inputArgs(work), '-frames:v', '1',
        '-c:v', 'libjxl', '-distance', String(jxlDistance(o.quality)), '-effort', '5', '-f', 'image2', '-update', '1', outPath], { signal, nice: true })
        .catch((err) => { throw explain(err, 'image') || new UserError('No se ha podido codificar el JPEG XL.', 'failed'); });
      break;
    case 'img-bmp':
      await sharpCli({ op: 'convert', input: src, output: work, format: 'png', maxWidth: o.maxWidth }, signal);
      await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...inputArgs(work), '-frames:v', '1',
        '-pix_fmt', file.meta && file.meta.hasAlpha ? 'bgra' : 'bgr24', '-c:v', 'bmp', '-f', 'image2', '-update', '1', outPath], { signal, nice: true })
        .catch((err) => { throw explain(err, 'image') || new UserError('No se ha podido generar el BMP.', 'failed'); });
      break;
    default:
      throw new UserError('Conversión de imagen no soportada.', 'unsupported');
  }
  fs.rmSync(work, { force: true });
}

module.exports = { analyze, convert, decodable, sharpCli, SHARP_READS };
