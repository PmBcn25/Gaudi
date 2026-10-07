// Cliente de pruebas: habla con la URL pública como lo haría el navegador
// (subida en bruto, trabajo, progreso por SSE, descarga) y comprueba resultados.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const BASE = (process.env.BASE_URL || process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://127.0.0.1:3100/').replace(/\/?$/, '/');
if (process.env.INSECURE === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const FIX = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
export const OUTDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUTDIR, { recursive: true });

export async function upload(file, name = path.basename(file)) {
  const body = fs.readFileSync(file);
  const r = await fetch(BASE + 'api/upload', {
    method: 'POST', body,
    headers: { 'x-file-name': encodeURIComponent(name), 'content-type': 'application/octet-stream' },
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

export async function createJob(fileId, target, options = {}, extra = {}) {
  const r = await fetch(BASE + 'api/jobs', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileId, target, options, ...extra }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

// Lee el flujo SSE de un trabajo y registra cada evento con su instante de llegada.
export async function follow(jobId, { onEvent, timeoutMs = 16 * 60 * 1000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const events = [];
  const r = await fetch(BASE + `api/jobs/${jobId}/events`, { signal: ac.signal, headers: { accept: 'text/event-stream' } });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (!data) continue;
        const ev = JSON.parse(data);
        ev.at = performance.now();
        events.push(ev);
        if (onEvent) onEvent(ev);
        if (['done', 'error', 'canceled'].includes(ev.status)) { ac.abort(); return events; }
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) throw err;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

export async function download(url) {
  const r = await fetch(BASE + url);
  if (!r.ok) throw new Error(`descarga ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function cancel(jobId) {
  const r = await fetch(BASE + `api/jobs/${jobId}/cancel`, { method: 'POST' });
  return r.json();
}

// Convierte de principio a fin. Devuelve { buf, result, events, error }.
export async function convert(fileOrId, target, options = {}, extra = {}) {
  let fileId = fileOrId;
  if (typeof fileOrId === 'string' && fs.existsSync(fileOrId)) {
    const up = await upload(fileOrId);
    if (up.status !== 201) return { error: up.error || `subida ${up.status}`, uploadStatus: up.status };
    fileId = up.file.id;
  }
  const j = await createJob(fileId, target, options, extra);
  if (j.status !== 201) return { error: j.error || `trabajo ${j.status}`, jobStatus: j.status };
  const events = await follow(j.job.id);
  const last = events[events.length - 1];
  if (!last || last.status !== 'done') return { error: last ? last.error || last.status : 'sin eventos', events };
  const buf = await download(last.result.download);
  return { buf, result: last.result, events, fileId, jobId: j.job.id };
}

// ---------------------------------------------------------------- cabeceras mágicas
const s = (b, o, n) => b.toString('latin1', o, o + n);
const zipHas = (b, name) => b.includes(Buffer.from(name, 'latin1'));
export const MAGIC = {
  webp: (b) => s(b, 0, 4) === 'RIFF' && s(b, 8, 4) === 'WEBP',
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  avif: (b) => s(b, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(s(b, 8, 4)),
  heic: (b) => s(b, 4, 4) === 'ftyp' && ['heic', 'heix', 'mif1'].includes(s(b, 8, 4)) && b.includes(Buffer.from('hvcC')),
  jxl: (b) => (b[0] === 0xff && b[1] === 0x0a) || s(b, 4, 8) === 'JXL \r\n\x87\n',
  tif: (b) => ['II*\0', 'MM\0*'].includes(s(b, 0, 4)),
  gif: (b) => s(b, 0, 4) === 'GIF8',
  bmp: (b) => s(b, 0, 2) === 'BM' && b.readUInt32LE(2) === b.length,
  ico: (b) => b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1 && b.readUInt16LE(4) >= 1,
  pdf: (b) => s(b, 0, 5) === '%PDF-' && b.includes(Buffer.from('%%EOF')),
  mp4: (b) => s(b, 4, 4) === 'ftyp' && s(b, 8, 4) !== 'qt  ',
  mov: (b) => s(b, 4, 4) === 'ftyp' && s(b, 8, 4) === 'qt  ',
  webm: (b) => b.readUInt32BE(0) === 0x1a45dfa3 && s(b, 0, 64).includes('webm'),
  mkv: (b) => b.readUInt32BE(0) === 0x1a45dfa3 && s(b, 0, 64).includes('matroska'),
  avi: (b) => s(b, 0, 4) === 'RIFF' && s(b, 8, 4) === 'AVI ',
  mp3: (b) => s(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  m4a: (b) => s(b, 4, 4) === 'ftyp' && s(b, 8, 4) === 'M4A ',
  m4r: (b) => s(b, 4, 4) === 'ftyp' && s(b, 8, 4) === 'M4A ',
  ogg: (b) => s(b, 0, 4) === 'OggS' && b.includes(Buffer.from('vorbis')),
  opus: (b) => s(b, 0, 4) === 'OggS' && b.includes(Buffer.from('OpusHead')),
  flac: (b) => s(b, 0, 4) === 'fLaC',
  wav: (b) => s(b, 0, 4) === 'RIFF' && s(b, 8, 4) === 'WAVE',
  aiff: (b) => s(b, 0, 4) === 'FORM' && s(b, 8, 4) === 'AIFF',
  ac3: (b) => b[0] === 0x0b && b[1] === 0x77,
  wma: (b) => b.subarray(0, 8).equals(Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])),
  zip: (b) => s(b, 0, 4) === 'PK\x03\x04',
  docx: (b) => s(b, 0, 4) === 'PK\x03\x04' && zipHas(b, 'word/'),
  xlsx: (b) => s(b, 0, 4) === 'PK\x03\x04' && zipHas(b, 'xl/'),
  pptx: (b) => s(b, 0, 4) === 'PK\x03\x04' && zipHas(b, 'ppt/'),
  odt: (b) => s(b, 0, 4) === 'PK\x03\x04' && s(b, 30, 80).includes('application/vnd.oasis.opendocument.text'),
  ods: (b) => s(b, 0, 4) === 'PK\x03\x04' && s(b, 30, 90).includes('application/vnd.oasis.opendocument.spreadsheet'),
  odp: (b) => s(b, 0, 4) === 'PK\x03\x04' && s(b, 30, 90).includes('application/vnd.oasis.opendocument.presentation'),
  epub: (b) => s(b, 0, 4) === 'PK\x03\x04' && s(b, 30, 60).includes('application/epub+zip'),
  rtf: (b) => s(b, 0, 5) === '{\\rtf',
  txt: (b) => b.length > 0 && !b.includes(0),
  csv: (b) => !b.includes(0) && /[,;]/.test(b.toString('utf8')),
  md: (b) => /^#|\n#|\*\*|\n- |\n\* |\|/.test(b.toString('utf8')),
  html: (b) => /<html[\s>]/i.test(b.toString('utf8')),
  tex: (b) => b.toString('utf8').includes('\\documentclass'),
  rst: (b) => /\n(=+|-+|~+)\n/.test(b.toString('utf8')),
  adoc: (b) => /(^|\n)=+ \S/.test(b.toString('utf8')),
  org: (b) => /^\* |\n\* |#\+/.test(b.toString('utf8')),
  wiki: (b) => /(^|\n)==? .+ ==?/.test(b.toString('utf8')),
  fb2: (b) => b.toString('utf8').includes('<FictionBook'),
  srt: (b) => /^\uFEFF?1\r?\n\d\d:\d\d:\d\d,\d\d\d --> /.test(b.toString('utf8')),
  vtt: (b) => b.toString('utf8').startsWith('WEBVTT'),
  ass: (b) => b.toString('utf8').includes('[Script Info]'),
};

// Inspección extra con ffprobe (disponible en la máquina de pruebas).
export function probe(buf, ext) {
  const f = path.join(OUTDIR, `probe-${process.pid}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(f, buf);
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height:format=duration', '-of', 'json', f]);
    return JSON.parse(out.toString());
  } finally { fs.rmSync(f, { force: true }); }
}

export function save(name, buf) {
  const p = path.join(OUTDIR, name);
  fs.writeFileSync(p, buf);
  return p;
}

export const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
