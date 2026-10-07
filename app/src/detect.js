'use strict';
// Detección del tipo real de un archivo mirando su contenido (cabeceras mágicas,
// estructura ZIP/OLE2 y, para texto, su forma), no solo la extensión.
const fs = require('fs');
const zlib = require('zlib');
const { INPUTS } = require('./formats');

const ext = (name) => {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
};

// Alias de extensión -> id de formato de entrada.
const EXT_ALIAS = {
  jpg: 'jpeg', jpeg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg', tif: 'tiff', tiff: 'tiff', heif: 'heic', heic: 'heic',
  hif: 'heic', svgz: 'svg', j2k: 'jp2', jpf: 'jp2', jpx: 'jp2', j2c: 'jp2', icb: 'tga', vda: 'tga', vst: 'tga',
  aif: 'aiff', aifc: 'aiff', oga: 'ogg', snd: 'au', mpeg: 'mpg', mpe: 'mpg', m2v: 'mpg', m2t: 'ts',
  mkv: 'mkv', qt: 'mov', '3g2': '3gp', htm: 'html', xhtml: 'html', markdown: 'md', mdown: 'md', mkd: 'md',
  wiki: 'mediawiki', mediawiki: 'mediawiki', text: 'txt', vtt: 'vtt', webvtt: 'vtt',
};
const byExt = (e) => EXT_ALIAS[e] || (INPUTS[e] ? e : null);

const has = (b, off, sig) => {
  if (b.length < off + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[off + i] !== sig[i]) return false;
  return true;
};
const ascii = (b, off, len) => b.toString('latin1', off, Math.min(b.length, off + len));

// ¿Podría ser un contenedor de vídeo? Solo sirve para decidir el límite de tamaño
// mientras se sube (200 MB vídeo / 50 MB lo demás); la decisión final es del análisis.
function maybeVideo(b) {
  if (b.length < 12) return false;
  const box = ascii(b, 4, 4);
  if (['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(box)) return true;
  if (has(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return true; // EBML (MKV/WebM)
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'AVI ') return true;
  if (has(b, 0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return true; // ASF/WMV
  if (has(b, 0, [0, 0, 1, 0xba]) || has(b, 0, [0, 0, 1, 0xb3])) return true; // MPEG-PS
  if (ascii(b, 0, 3) === 'FLV') return true;
  if (ascii(b, 0, 4) === 'OggS') return true;
  if (has(b, 0, [0x06, 0x0e, 0x2b, 0x34])) return true; // MXF
  if (isTS(b, 188, 0) || isTS(b, 192, 4)) return true;
  return false;
}
function isTS(b, size, off) {
  if (b.length < off + size * 3) return false;
  for (let i = 0; i < 3; i++) if (b[off + i * size] !== 0x47) return false;
  return true;
}

// Detección por cabecera mágica sobre los primeros KB. Devuelve un id de INPUTS,
// un marcador de contenedor ('zip', 'ole', 'text', 'ftyp:<marca>', 'ebml', 'ogg', 'asf'…) o null.
function sniffMagic(b) {
  if (b.length === 0) return 'empty';
  if (has(b, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (has(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF') {
    const t = ascii(b, 8, 4);
    if (t === 'WEBP') return 'webp';
    if (t === 'WAVE') return 'wav';
    if (t === 'AVI ') return 'avi';
    return null;
  }
  if (ascii(b, 0, 4) === 'RF64' && ascii(b, 8, 4) === 'WAVE') return 'wav';
  if (has(b, 0, [0x49, 0x49, 0x2a, 0x00]) || has(b, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (has(b, 0, [0x49, 0x49, 0x2b, 0x00]) || has(b, 0, [0x4d, 0x4d, 0x00, 0x2b])) return 'tiff'; // BigTIFF
  if (ascii(b, 0, 2) === 'BM' && b.length > 26 && b.readUInt32LE(14) >= 12 && b.readUInt32LE(14) <= 124) return 'bmp';
  if (has(b, 0, [0, 0, 1, 0]) && b.length > 6 && b.readUInt16LE(4) > 0 && b.readUInt16LE(4) < 256) return 'ico';
  if (ascii(b, 0, 4) === '8BPS') return 'psd';
  if (has(b, 0, [0xff, 0x0a])) return 'jxl';
  if (has(b, 0, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'jxl';
  if (has(b, 0, [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'jp2';
  if (has(b, 0, [0xff, 0x4f, 0xff, 0x51])) return 'jp2';
  if (ascii(b, 0, 4) === 'DDS ') return 'dds';
  if (has(b, 0, [0x76, 0x2f, 0x31, 0x01])) return 'exr';
  if (ascii(b, 0, 5) === '%PDF-' || (b.length > 1024 && ascii(b, 0, 1024).includes('%PDF-'))) return 'pdf';
  if (ascii(b, 0, 5) === '{\\rtf') return 'rtf';
  if (ascii(b, 0, 4) === 'fLaC') return 'flac';
  if (ascii(b, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(b, 8, 4))) return 'aiff';
  if (ascii(b, 0, 5) === '#!AMR') return 'amr';
  if (ascii(b, 0, 4) === 'caff') return 'caf';
  if (ascii(b, 0, 4) === '.snd') return 'au';
  if (ascii(b, 0, 4) === 'wvpk') return 'wv';
  if (ascii(b, 0, 4) === 'MAC ') return 'ape';
  if (ascii(b, 0, 4) === 'OggS') return 'ogg-container';
  if (has(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'ebml';
  if (has(b, 0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return 'asf';
  if (ascii(b, 0, 3) === 'FLV') return 'flv';
  if (has(b, 0, [0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01])) return 'mxf';
  if (has(b, 0, [0, 0, 1, 0xba]) || has(b, 0, [0, 0, 1, 0xb3])) return 'mpg';
  if (isTS(b, 192, 4)) return 'm2ts';
  if (isTS(b, 188, 0)) return 'ts';
  const box = ascii(b, 4, 4);
  if (box === 'ftyp') return 'ftyp:' + ascii(b, 8, 4);
  if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(box)) return 'mov';
  if (ascii(b, 0, 3) === 'ID3') return 'mp3';
  if (has(b, 0, [0x0b, 0x77])) return 'ac3';
  if (has(b, 0, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (has(b, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (has(b, 0, [0x1f, 0x8b])) return 'gzip';
  // Tramas MPEG de audio sin ID3 (MP3/MP2) o AAC ADTS.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    const layer = (b[1] >> 1) & 3;
    if ((b[1] & 0xf6) === 0xf0) return 'aac';
    if (layer === 1) return 'mp3';
    if (layer === 2) return 'mp2';
  }
  if (looksText(b)) return 'text';
  // TGA no tiene firma: se acepta por extensión si la cabecera es coherente.
  if (b.length > 18 && [1, 2, 3, 9, 10, 11].includes(b[2]) && [8, 15, 16, 24, 32].includes(b[16])) return 'tga?';
  return null;
}

function looksText(b) {
  const n = Math.min(b.length, 8192);
  if (n === 0) return false;
  if (has(b, 0, [0xff, 0xfe]) || has(b, 0, [0xfe, 0xff])) return true; // UTF-16 con BOM
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) bad++;
  }
  return bad / n < 0.01;
}

// Decodifica texto: UTF-8 (estricto), UTF-16 con BOM o, si no, Windows-1252.
function decodeText(buf) {
  if (has(buf, 0, [0xef, 0xbb, 0xbf])) return { text: buf.toString('utf8', 3), encoding: 'utf-8' };
  if (has(buf, 0, [0xff, 0xfe])) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' };
  if (has(buf, 0, [0xfe, 0xff])) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    // Puede que el corte de 64 KB parta un carácter multibyte: reintenta sin los últimos bytes.
    try {
      if (buf.length >= 65536) return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, buf.length - 4)), encoding: 'utf-8' };
    } catch { /* sigue */ }
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' };
  }
}

const REJECT_TEXT = { rst: 'reStructuredText', tex: 'LaTeX', latex: 'LaTeX', ltx: 'LaTeX', org: 'Org' };
const PLAYLISTS = ['m3u', 'm3u8', 'pls', 'ffconcat', 'cue', 'xspf', 'asx', 'wpl'];

class DetectError extends Error {
  constructor(message, code = 'unsupported') { super(message); this.code = code; }
}

// Clasifica texto según su contenido y la extensión.
function detectText(buf, e) {
  const { text, encoding } = decodeText(buf);
  const head = text.slice(0, 4096).replace(/^﻿/, '');
  const t = head.trimStart();
  if (/^#EXTM3U/i.test(t) || /^ffconcat/i.test(t) || /^\[playlist\]/i.test(t) || PLAYLISTS.includes(e)) {
    throw new DetectError('Las listas de reproducción (M3U, M3U8, ffconcat…) no se aceptan: apuntan a otros archivos en lugar de contener el audio o el vídeo.');
  }
  if (REJECT_TEXT[e]) {
    throw new DetectError(`Por seguridad no aceptamos ${REJECT_TEXT[e]} como entrada (puede incluir otros archivos del servidor). Sí puedes convertir a ${REJECT_TEXT[e]} desde Markdown, HTML, DOCX y otros.`);
  }
  let id = null;
  if (/^\{/.test(t) && /"cells"\s*:/.test(text.slice(0, 65536)) && /"nbformat"/.test(text)) id = 'ipynb';
  else if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(t)) id = 'svg';
  else if (/<FictionBook[\s>]/.test(head)) id = 'fb2';
  else if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<opml[\s>]/i.test(t)) id = 'opml';
  else if (/<office:document[\s>]/.test(head)) {
    if (/office:mimetype="application\/vnd\.oasis\.opendocument\.text"/.test(head)) id = 'fodt';
    else throw new DetectError('Este documento OpenDocument plano no es de texto; solo aceptamos FODT.');
  } else if (/^WEBVTT/.test(t)) id = 'vtt';
  else if (/^\[Script Info\]/im.test(head)) id = /ScriptType:\s*v4\.00\+/i.test(head) || e === 'ass' ? 'ass' : 'ssa';
  else if (/^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/m.test(t)) id = 'srt';
  else if (e === 'csv' || e === 'tsv') id = e;
  else if (/^(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(t) || ((e === 'html' || e === 'htm' || e === 'xhtml') && /<[a-z!]/i.test(t))) id = 'html';
  else if (['md', 'markdown', 'mdown', 'mkd'].includes(e)) id = 'md';
  else if (e === 'textile') id = 'textile';
  else if (e === 'wiki' || e === 'mediawiki') id = 'mediawiki';
  else if (e === 'rtf') throw new DetectError('El archivo se llama .rtf pero no es un RTF válido.', 'corrupt');
  else if (e === 'svg') throw new DetectError('El archivo se llama .svg pero no contiene una imagen SVG válida.', 'corrupt');
  else id = 'txt';
  return { id, encoding };
}

// ---------------------------------------------------------------- ZIP
// Lee el directorio central de un ZIP (sin descomprimir nada salvo lo pedido).
function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new DetectError('El archivo ZIP está incompleto o dañado.', 'corrupt');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff + cdSize > size || cdSize > 32 * 1024 * 1024) throw new DetectError('El archivo ZIP está dañado.', 'corrupt');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const xlen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nlen);
      entries.push({ name, method, csize, usize, local });
      p += 46 + nlen + xlen + clen;
    }
    const read = (name, max = 2 * 1024 * 1024) => {
      const en = entries.find((x) => x.name === name);
      if (!en || en.usize > max || en.csize > max) return null;
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, en.local);
      if (lh.readUInt32LE(0) !== 0x04034b50) return null;
      const start = en.local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const data = Buffer.alloc(en.csize);
      fs.readSync(fd, data, 0, en.csize, start);
      if (en.method === 0) return data;
      if (en.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: max });
      return null;
    };
    return { entries, names: new Set(entries.map((x) => x.name)), read, close: () => fs.closeSync(fd) };
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
}

function detectZip(file, e) {
  const z = zipEntries(file);
  try {
    const mime = z.names.has('mimetype') ? (z.read('mimetype', 200) || Buffer.alloc(0)).toString('latin1').trim() : '';
    const odf = {
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/vnd.oasis.opendocument.spreadsheet': 'ods',
      'application/vnd.oasis.opendocument.presentation': 'odp',
      'application/epub+zip': 'epub',
    }[mime];
    if (odf) return odf;
    if (mime.startsWith('application/vnd.oasis.opendocument')) {
      throw new DetectError('Este tipo de documento OpenDocument no está soportado (solo texto, hojas y presentaciones).');
    }
    const ct = z.names.has('[Content_Types].xml') ? (z.read('[Content_Types].xml') || Buffer.alloc(0)).toString('utf8') : '';
    const pick = (fam, variants, def) => (variants.includes(e) ? e : def);
    if (z.names.has('word/document.xml') || /wordprocessingml|ms-word/.test(ct)) {
      if (/ms-word\.document\.macroEnabled/.test(ct)) return 'docm';
      if (/wordprocessingml\.template/.test(ct)) return 'dotx';
      return pick('doc', ['docx', 'docm', 'dotx'], 'docx');
    }
    if (z.names.has('xl/workbook.xml') || /spreadsheetml|ms-excel/.test(ct)) {
      if (/ms-excel\.sheet\.macroEnabled/.test(ct)) return 'xlsm';
      if (/spreadsheetml\.template/.test(ct)) return 'xltx';
      return pick('sheet', ['xlsx', 'xlsm', 'xltx'], 'xlsx');
    }
    if (z.names.has('ppt/presentation.xml') || /presentationml|ms-powerpoint/.test(ct)) {
      if (/ms-powerpoint\.presentation\.macroEnabled/.test(ct)) return 'pptm';
      if (/presentationml\.slideshow/.test(ct)) return 'ppsx';
      return pick('slides', ['pptx', 'pptm', 'ppsx'], 'pptx');
    }
    throw new DetectError('Es un archivo ZIP. Sube directamente los archivos que contiene: los ZIP no se convierten.');
  } finally {
    z.close();
  }
}

// OLE2 (DOC/XLS/PPT/WPS y también DOCX cifrados). Busca los nombres de los
// flujos (UTF-16LE) en el archivo entero: el directorio puede estar en cualquier sector.
function detectOle(file, e) {
  const buf = fs.readFileSync(file);
  const u = (s) => Buffer.from(s, 'utf16le');
  if (buf.includes(u('EncryptedPackage'))) {
    throw new DetectError('El documento está protegido con contraseña. Ábrelo, quita la contraseña y vuelve a subirlo.', 'protected');
  }
  if (buf.includes(u('WordDocument'))) return ['doc', 'dot'].includes(e) ? e : 'doc';
  if (buf.includes(u('Workbook')) || buf.includes(u('Book'))) return ['xls', 'xlt'].includes(e) ? e : 'xls';
  if (buf.includes(u('PowerPoint Document'))) return ['ppt', 'pps'].includes(e) ? e : 'ppt';
  if (buf.includes(u('MatOST')) || buf.includes(u('CONTENTS')) || e === 'wps') return 'wps';
  throw new DetectError('Es un archivo de Office antiguo que no reconocemos (no es DOC, XLS, PPT ni WPS).');
}

// ftyp: marca principal y compatibles -> familia ISO-BMFF.
function ftypKind(b) {
  const size = Math.min(b.readUInt32BE(0), b.length);
  const brands = [ascii(b, 8, 4)];
  for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(b, i, 4));
  const major = brands[0];
  if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].includes(major)) return 'heic';
  if (['avif', 'avis'].includes(major)) return 'avif';
  if (['mif1', 'msf1'].includes(major)) {
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
    return 'heic';
  }
  if (['jxl '].includes(major)) return 'jxl';
  if (major === 'qt  ') return 'mov';
  if (major === 'M4A ' || major === 'M4P ') return 'm4a';
  if (major === 'M4B ') return 'm4b';
  if (major === 'M4V ' || major === 'M4VH' || major === 'M4VP') return 'm4v';
  if (major.startsWith('3g')) return '3gp';
  if (major.startsWith('f4v') || major === 'F4V ') return 'f4v';
  if (major === 'crx ') throw new DetectError('Los RAW de cámara (CR3) no están soportados.');
  return 'mp4'; // isom, mp41, mp42, avc1, dash, iso2…
}

// Detección principal sobre el archivo en disco. Devuelve { id, encoding?, note? }.
function detectFile(file, originalName) {
  const e = ext(originalName);
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(65536);
  const n = fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  const b = head.subarray(0, n);
  const m = sniffMagic(b);
  let id = null;
  let encoding;
  if (m === 'empty') throw new DetectError('El archivo está vacío (0 bytes).', 'corrupt');
  if (m === 'zip') id = detectZip(file, e);
  else if (m === 'ole') id = detectOle(file, e);
  else if (m === 'text') {
    // Texto con extensión de formato binario (p. ej. un .png que en realidad es texto): está mal.
    const claimed0 = byExt(e);
    const TEXTUAL = new Set(['svg', 'rtf', 'fodt', 'csv', 'tsv', 'md', 'html', 'txt', 'textile', 'ipynb', 'fb2', 'mediawiki', 'opml', 'srt', 'vtt', 'ass', 'ssa']);
    if (claimed0 && !TEXTUAL.has(claimed0)) {
      throw new DetectError(`El archivo se llama .${e} pero dentro solo hay texto: no es un ${INPUTS[claimed0][1]} válido.`, 'corrupt');
    }
    ({ id, encoding } = detectText(b, e));
  }
  else if (m && m.startsWith('ftyp:')) id = ftypKind(b);
  else if (m === 'ogg-container') id = ['ogv', 'opus', 'oga'].includes(e) ? (e === 'oga' ? 'ogg' : e) : 'ogg';
  else if (m === 'ebml') {
    const doc = ascii(b, 0, 64).includes('webm') ? 'webm' : 'mkv';
    id = doc === 'webm' ? (e === 'weba' ? 'weba' : 'webm') : (e === 'mka' ? 'mka' : 'mkv');
  } else if (m === 'asf') id = e === 'wma' ? 'wma' : e === 'asf' ? 'asf' : 'wmv';
  else if (m === 'avi') id = e === 'divx' ? 'divx' : 'avi';
  else if (m === 'mpg') id = e === 'vob' ? 'vob' : 'mpg';
  else if (m === 'm2ts') id = e === 'mts' ? 'mts' : 'm2ts';
  else if (m === 'mp3' && e === 'mp2') id = 'mp2';
  else if (m === 'tga?') id = e === 'tga' || EXT_ALIAS[e] === 'tga' ? 'tga' : null;
  else if (m === 'gzip') {
    if (e === 'svgz') id = 'svg';
    else throw new DetectError('Es un archivo comprimido (gzip). Descomprímelo y sube el archivo de dentro.');
  } else id = m;

  if (!id || !INPUTS[id]) {
    const known = byExt(e);
    if (known && m !== null) throw new DetectError(`El archivo se llama .${e} pero su contenido no es ${INPUTS[known][1]} válido.`, 'corrupt');
    if (known) throw new DetectError(`No hemos podido leer este ${INPUTS[known][1]}: el archivo parece dañado.`, 'corrupt');
    throw new DetectError(e ? `El formato .${e} no está soportado.` : 'No reconocemos el tipo de este archivo.');
  }
  // Aviso si la extensión engaña (no cuenta como engaño un alias del mismo contenedor).
  const claimed = byExt(e);
  const ALIASES = [['mp4', 'm4v', 'm4a', 'm4b', 'm4r', 'mov', '3gp', 'f4v'], ['ogg', 'opus', 'ogv'], ['mkv', 'mka', 'webm', 'weba'],
    ['wmv', 'wma', 'asf'], ['avi', 'divx'], ['mpg', 'vob'], ['ts', 'mts', 'm2ts'], ['mp3', 'mp2'], ['heic', 'avif']];
  let note = null;
  if (claimed && claimed !== id && !ALIASES.some((g) => g.includes(claimed) && g.includes(id))) {
    note = `Aunque se llama .${e}, en realidad es ${INPUTS[id][1]}.`;
  }
  if (claimed === 'm4r' && ['m4a', 'mp4'].includes(id)) id = 'm4r';
  if (claimed === 'm4b' && ['m4a', 'mp4'].includes(id)) id = 'm4b';
  if (claimed === 'm4a' && id === 'mp4') id = 'm4a';
  if (claimed === 'm4v' && id === 'mp4') id = 'm4v';
  if (claimed === 'mov' && id === 'mp4') id = 'mov';
  if (claimed === '3gp' && id === 'mp4') id = '3gp';
  return { id, encoding, note };
}

module.exports = { ext, sniffMagic, maybeVideo, detectFile, decodeText, zipEntries, DetectError };
