'use strict';
// Análisis de un archivo recién subido (en el worker, aislado): tipo real,
// metadatos (duración, páginas, dimensiones…) y miniatura.
const path = require('path');
const { detectFile, DetectError } = require('../detect');
const { INPUTS } = require('../formats');
const { UserError } = require('./errors');
const image = require('./image');
const av = require('./av');
const docs = require('./docs');
const config = require('../config');

async function analyze({ dir, input, name, size }, signal) { // eslint-disable-line prefer-const
  let det;
  try {
    det = detectFile(input, name);
  } catch (err) {
    if (err instanceof DetectError) throw new UserError(err.message, err.code);
    throw err;
  }
  let format = det.id;
  let family = INPUTS[format][0];
  // El original pasa a llamarse in.<ext>: FFmpeg (TGA), LibreOffice y Pandoc deciden por la extensión.
  const inPath = path.join(dir, `in.${INPUTS[format][2]}`);
  require('fs').renameSync(input, inPath);
  input = inPath;
  let meta = { note: det.note || null };
  if (det.encoding) meta.encoding = det.encoding;
  const file = { format, family, size, meta };

  if (family === 'image') {
    Object.assign(meta, await image.analyze(file, input, dir, signal));
  } else if (family === 'audio' || family === 'video') {
    if (size > config.limits.uploadVideo) throw new UserError('Los vídeos pueden pesar como máximo 200 MB.', 'toolarge');
    const r = await av.analyze(file, input, dir, signal);
    format = r.format; family = r.family;
    Object.assign(meta, r.meta);
  } else if (family === 'pdf') {
    Object.assign(meta, await docs.analyzePdf(file, input, dir, signal));
  } else if (family === 'subtitle') {
    await docs.analyzeSubtitle(file, input, signal);
  } else if (format === 'ipynb') {
    try { JSON.parse(require('fs').readFileSync(input, 'utf8')); } catch { throw new UserError('El cuaderno de Jupyter no es un JSON válido: parece dañado.', 'corrupt'); }
  }
  if (family !== 'video' && size > config.limits.uploadOther) {
    throw new UserError('Este tipo de archivo puede pesar como máximo 50 MB (los vídeos, hasta 200 MB).', 'toolarge');
  }
  let label = INPUTS[format] ? INPUTS[format][1] : format;
  if (INPUTS[format] && INPUTS[format][0] === 'video' && family === 'audio') label += ' (solo audio)';
  if (meta.animated) label = 'GIF animado';
  // Si la reclasificación cambió el formato (p. ej. MP4 solo audio -> M4A), se ajusta la extensión.
  const finalPath = path.join(dir, `in.${INPUTS[format][2]}`);
  if (finalPath !== input) require('fs').renameSync(input, finalPath);
  meta.input = path.basename(finalPath);
  return { format, family, label, meta };
}

module.exports = { analyze, path };
