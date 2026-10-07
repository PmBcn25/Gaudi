'use strict';
// Servidor web (Express) que escucha solo en 127.0.0.1. Sin cuentas, sin cookies,
// sin historial. El control de abuso es por IP, en memoria y sin guardarla en claro.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const { open, newId, jobRow, fileRow } = require('./db');
const formats = require('./formats');
const { maybeVideo } = require('./detect');
const hub = require('./hub');
const staticFiles = require('./static');

const db = open();
fs.mkdirSync(config.tmpDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- límite por IP (solo en memoria)
// La IP nunca se guarda en claro: se usa un HMAC con una clave aleatoria que muere con el proceso.
const ipKey = crypto.randomBytes(32);
const buckets = { conv: new Map(), upload: new Map() };
function limited(req, kind, max) {
  const key = crypto.createHmac('sha256', ipKey).update(req.ip || '').digest('base64url').slice(0, 22);
  const now = Date.now();
  const hour = 3600 * 1000;
  const list = (buckets[kind].get(key) || []).filter((t) => now - t < hour);
  if (list.length >= max) {
    buckets[kind].set(key, list);
    return Math.ceil((hour - (now - list[0])) / 60000);
  }
  list.push(now);
  buckets[kind].set(key, list);
  return 0;
}
setInterval(() => {
  const now = Date.now();
  for (const m of Object.values(buckets)) for (const [k, l] of m) if (!l.length || now - l[l.length - 1] > 3600e3) m.delete(k);
}, 600e3).unref();

// ---------------------------------------------------------------- estado en vivo y SSE
const live = new Map(); // jobId -> último evento del worker
const subs = new Map(); // jobId -> Set(res)

const expired = (f) => !f || Date.now() - f.created_at > config.limits.fileTtlMs;
const getFile = (id) => fileRow(db.prepare('SELECT * FROM files WHERE id=?').get(String(id)));
const getJob = (id) => jobRow(db.prepare('SELECT * FROM jobs WHERE id=?').get(String(id)));

function publicResult(job, result) {
  if (!result) return null;
  const file = getFile(job.file_id);
  let inputSize = file ? file.size : null;
  if (job.inputs) inputSize = job.inputs.reduce((s, id) => s + ((getFile(id) || {}).size || 0), 0);
  return {
    name: result.name, size: result.size, mime: result.mime, inputSize,
    download: `api/jobs/${job.id}/download`, thumb: result.thumb ? `api/jobs/${job.id}/thumb` : null,
    expiresAt: file ? file.created_at + config.limits.fileTtlMs : null,
  };
}

function queuePositions() {
  return db.prepare("SELECT id FROM jobs WHERE status='queued' ORDER BY seq").all().map((r) => r.id);
}

function snapshot(job) {
  if (job.status === 'queued') {
    const q = queuePositions();
    return { status: 'queued', position: q.indexOf(job.id) + 1, waiting: q.length, running: runningCount() };
  }
  const ev = live.get(job.id);
  if (job.status === 'running') return ev && ev.status === 'running' ? ev : { status: 'running', stage: job.stage || 'Convirtiendo', progress: job.progress };
  if (job.status === 'done') return { status: 'done', result: publicResult(job, job.result) };
  if (job.status === 'error') return { status: 'error', error: job.error };
  return { status: 'canceled' };
}
const runningCount = () => db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='running'").get().n;

function push(jobId, ev) {
  const set = subs.get(jobId);
  if (!set) return;
  const data = `data: ${JSON.stringify({ ...ev, t: Date.now() })}\n\n`;
  for (const res of set) res.write(data);
}

// Avisa a todos los trabajos en cola de su posición real ("2º de 3").
function broadcastQueue() {
  const q = queuePositions();
  const run = runningCount();
  q.forEach((id, i) => push(id, { status: 'queued', position: i + 1, waiting: q.length, running: run }));
}

hub.on('job', (msg) => {
  const { t, id, ...ev } = msg;
  const prev = live.get(id);
  live.set(id, ev);
  if (ev.status === 'done') {
    const job = getJob(id);
    push(id, { status: 'done', result: job ? publicResult(job, ev.result) : null });
  } else push(id, ev);
  if (ev.status !== 'running' || !prev) broadcastQueue();
  if (ev.status !== 'running') setTimeout(() => live.delete(id), 60000);
});
hub.on('up', () => log('worker conectado'));
hub.on('down', () => log('worker desconectado'));

// ---------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.set('etag', false);

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(staticFiles.middleware());

const api = express.Router();
const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

api.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, worker: hub.connected, running: runningCount(), queued: queuePositions().length });
});

// Subida: cuerpo en bruto (sin multipart), en streaming a disco.
api.post('/upload', (req, res) => {
  if (!hub.connected) return fail(res, 503, 'El servicio de conversión se está reiniciando. Inténtalo de nuevo en unos segundos.');
  const len = Number(req.headers['content-length']);
  if (!Number.isFinite(len)) return fail(res, 411, 'Falta el tamaño del archivo.');
  if (len === 0) return fail(res, 422, 'El archivo está vacío (0 bytes).');
  if (len > config.limits.uploadVideo) return fail(res, 413, 'El archivo pesa más de 200 MB, el máximo para vídeo (50 MB para el resto).');
  const wait = limited(req, 'upload', config.limits.uploadsPerHour);
  if (wait) return fail(res, 429, `Has subido demasiados archivos en la última hora. Prueba de nuevo en ${wait} min.`);
  let name = 'archivo';
  try { name = decodeURIComponent(String(req.headers['x-file-name'] || 'archivo')).slice(0, 200) || 'archivo'; } catch { /* nombre raro */ }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, '_');

  const id = newId();
  const dir = path.join(config.tmpDir, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  const tmp = path.join(dir, 'upload.bin');
  const out = fs.createWriteStream(tmp, { mode: 0o640 });
  let got = 0;
  let cap = null;
  let head = Buffer.alloc(0);
  let finished = false;
  const abort = (status, msg) => {
    if (finished) return;
    finished = true;
    req.unpipe(out); out.destroy();
    fs.rm(dir, { recursive: true, force: true }, () => {});
    if (status && !res.headersSent) { res.setHeader('Connection', 'close'); fail(res, status, msg); }
    req.resume();
  };
  req.on('data', (chunk) => {
    got += chunk.length;
    if (cap === null) {
      head = Buffer.concat([head, chunk]);
      if (head.length >= 64 || got >= len) {
        // Límite según lo que parece ser el archivo (la decisión final la toma el análisis).
        cap = maybeVideo(head) ? config.limits.uploadVideo : config.limits.uploadOther;
        if (len > cap) return abort(413, 'Este tipo de archivo puede pesar como máximo 50 MB (los vídeos, hasta 200 MB).');
      }
    }
    if (got > len || (cap && got > cap)) abort(413, 'El archivo supera el tamaño máximo.');
  });
  req.on('aborted', () => abort());
  req.on('error', () => abort());
  req.pipe(out);
  out.on('error', () => abort(500, 'No se ha podido guardar el archivo en el servidor.'));
  out.on('finish', async () => {
    if (finished) return;
    if (got !== len) return abort(400, 'La subida se ha cortado antes de terminar.');
    finished = true;
    try {
      const r = await hub.analyze(id, name, got);
      const createdAt = Date.now();
      db.prepare('INSERT INTO files (id, created_at, name, size, format, family, meta) VALUES (?,?,?,?,?,?,?)')
        .run(id, createdAt, name, got, r.format, r.family, JSON.stringify({ ...r.meta, label: r.label }));
      res.status(201).json({ file: publicFile(getFile(id)) });
    } catch (err) {
      fs.rm(dir, { recursive: true, force: true }, () => {});
      if (err.status === 503) return fail(res, 503, 'El servicio de conversión se está reiniciando. Inténtalo de nuevo en unos segundos.');
      return fail(res, err.status || 500, err.user ? err.message : 'No hemos podido analizar el archivo.', { code: err.code || 'failed' });
    }
  });
});

function publicFile(f) {
  const outputs = formats.outputsFor(f);
  const m = f.meta;
  return {
    id: f.id, name: f.name, size: f.size, format: f.format, family: f.family, label: m.label || f.format,
    familyLabel: formats.FAMILY_LABEL[f.family], note: m.note || null,
    meta: { width: m.width, height: m.height, duration: m.duration, pages: m.pages, hasAudio: m.hasAudio, animated: m.animated, fps: m.fps, waveform: m.waveform || null },
    thumb: m.thumb ? `api/files/${f.id}/thumb` : null,
    outputs: outputs.map(formats.publicOutput), defaultTarget: formats.defaultTarget(f, outputs),
    expiresAt: f.created_at + config.limits.fileTtlMs,
  };
}

api.get('/files/:id/thumb', (req, res) => {
  const f = getFile(req.params.id);
  if (expired(f) || !f.meta.thumb) return res.status(404).end();
  sendFile(res, path.join(config.tmpDir, f.id, f.meta.thumb), f.meta.thumb.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
});

// Quitar una tarjeta: cancela sus trabajos y borra el archivo del servidor.
api.delete('/files/:id', (req, res) => {
  const f = getFile(req.params.id);
  if (!f) return res.json({ ok: true });
  forget(f.id);
  res.json({ ok: true });
});

function forget(fileId) {
  const jobs = db.prepare('SELECT id, status FROM jobs WHERE file_id=?').all(fileId);
  for (const j of jobs) {
    if (j.status === 'running' || j.status === 'queued') {
      db.prepare("UPDATE jobs SET status='canceled', finished_at=? WHERE id=?").run(Date.now(), j.id);
      hub.send({ t: 'cancel', jobId: j.id });
      push(j.id, { status: 'canceled' });
    }
  }
  db.prepare('DELETE FROM jobs WHERE file_id=?').run(fileId);
  db.prepare('DELETE FROM files WHERE id=?').run(fileId);
  fs.rm(path.join(config.tmpDir, fileId), { recursive: true, force: true }, () => {});
  broadcastQueue();
}

api.post('/jobs', express.json({ limit: '16kb' }), (req, res) => {
  const body = req.body || {};
  const target = String(body.target || '');
  const out = formats.OUT[target];
  if (!out) return fail(res, 400, 'Formato de destino desconocido.');
  let file;
  let inputs = null;
  if (out.multi) {
    const ids = Array.isArray(body.fileIds) ? body.fileIds.map(String) : [];
    if (ids.length < 2) return fail(res, 400, 'Para unir hacen falta al menos dos PDF.');
    if (ids.length > config.limits.maxFilesPerMerge) return fail(res, 400, `Se pueden unir como máximo ${config.limits.maxFilesPerMerge} PDF a la vez.`);
    const files = ids.map(getFile);
    if (files.some(expired)) return fail(res, 410, 'Alguno de los PDF ya no está en el servidor (caducó o lo quitaste). Vuelve a subirlo.');
    if (files.some((f) => f.family !== 'pdf' || f.virtual)) return fail(res, 400, 'Solo se pueden unir archivos PDF.');
    inputs = ids;
  } else {
    file = getFile(body.fileId);
    if (expired(file)) return fail(res, 410, 'El archivo ya no está en el servidor: han pasado más de 30 minutos o lo quitaste. Vuelve a subirlo.');
    if (!formats.outputsFor(file).includes(target)) return fail(res, 400, `No se puede convertir ${file.meta.label || file.format} a ${out.label}.`);
  }
  const v = formats.validateOptions(target, body.options);
  if (v.error) return fail(res, 400, v.error);
  if (target === 'pdf-extract') {
    try { require('./convert/docs').parsePages(v.options.pages, file.meta.pages); } catch (err) { return fail(res, 400, err.message); }
  }
  const wait = limited(req, 'conv', config.limits.conversionsPerHour);
  if (wait) {
    return fail(res, 429, `Has hecho ${config.limits.conversionsPerHour} conversiones en la última hora, el máximo gratuito. Podrás seguir dentro de ${wait} min.`, { retryInMin: wait });
  }
  if (out.multi) {
    // El resultado de unir vive en su propia carpeta ("archivo virtual"), con su propia caducidad.
    const vid = newId();
    fs.mkdirSync(path.join(config.tmpDir, vid), { recursive: true, mode: 0o750 });
    const size = inputs.reduce((s, id) => s + getFile(id).size, 0);
    db.prepare('INSERT INTO files (id, created_at, name, size, format, family, meta, virtual) VALUES (?,?,?,?,?,?,?,1)')
      .run(vid, Math.min(...inputs.map((id) => getFile(id).created_at)), 'unido.pdf', size, 'pdf', 'pdf', JSON.stringify({ label: 'PDF unido' }));
    file = getFile(vid);
  }
  const id = newId();
  db.prepare('INSERT INTO jobs (id, file_id, inputs, target, options, lo, status, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, file.id, inputs ? JSON.stringify(inputs) : null, target, JSON.stringify(v.options), out.lo ? 1 : 0, 'queued', Date.now());
  hub.send({ t: 'wake' });
  setImmediate(broadcastQueue);
  res.status(201).json({ job: { id, target, fileId: file.id, events: `api/jobs/${id}/events` }, file: out.multi ? { id: file.id } : undefined });
});

// Progreso en tiempo real por Server-Sent Events.
api.get('/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return fail(res, 404, 'Este trabajo ya no existe.');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  if (!subs.has(job.id)) subs.set(job.id, new Set());
  subs.get(job.id).add(res);
  res.write(`data: ${JSON.stringify({ ...snapshot(job), t: Date.now() })}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    const set = subs.get(job.id);
    if (set) { set.delete(res); if (!set.size) subs.delete(job.id); }
  });
});

api.post('/jobs/:id/cancel', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.json({ ok: true });
  if (job.status === 'queued' || job.status === 'running') {
    db.prepare("UPDATE jobs SET status='canceled', finished_at=? WHERE id=? AND status IN ('queued','running')").run(Date.now(), job.id);
    if (job.status === 'running') hub.send({ t: 'cancel', jobId: job.id });
    push(job.id, { status: 'canceled' });
    live.delete(job.id);
    setImmediate(broadcastQueue);
  }
  res.json({ ok: true });
});

function gone(req, res, msg) {
  if (String(req.headers.accept || '').includes('text/html')) {
    res.status(410).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Enlace caducado</title><body style="font:16px system-ui;padding:40px;max-width:560px;margin:auto"><h1>Este enlace ha caducado</h1><p>${msg}</p><p><a href="../../../">Volver a Convertia</a></p>`);
  } else fail(res, 410, msg);
}

api.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  const file = job && getFile(job.file_id);
  if (!job || job.status !== 'done' || expired(file)) {
    return gone(req, res, 'Los archivos se borran solos a los 30 minutos y el enlace de descarga caduca con ellos.');
  }
  const p = path.join(config.tmpDir, job.result.file);
  if (!fs.existsSync(p)) return gone(req, res, 'El archivo ya se ha borrado del servidor.');
  const name = job.result.name;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  sendFile(res, p, job.result.mime, 'private, no-store');
});

api.get('/jobs/:id/thumb', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'done' || !job.result.thumb || expired(getFile(job.file_id))) return res.status(404).end();
  sendFile(res, path.join(config.tmpDir, job.result.thumb), 'image/jpeg');
});

function sendFile(res, p, type, cache = 'private, max-age=1800') {
  fs.stat(p, (err, st) => {
    if (err) return res.status(404).end();
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', st.size);
    res.setHeader('Cache-Control', cache);
    fs.createReadStream(p).on('error', () => res.destroy()).pipe(res);
  });
}

api.use((req, res) => fail(res, 404, 'No existe.'));
app.use('/api', api);

app.use((req, res) => {
  res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>No encontrado</title><p style="font:16px system-ui;padding:40px">Esta página no existe. <a href="./">Ir a Convertia</a>');
});
// Errores inesperados: mensaje claro, nunca un volcado técnico.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  log('error', err && err.message);
  if (res.headersSent) return res.destroy();
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Petición mal formada.');
  return fail(res, 500, 'Ha ocurrido un problema inesperado en el servidor. Inténtalo de nuevo.');
});

(async () => {
  await hub.listen();
  app.listen(config.port, config.host, () => log(`web en http://${config.host}:${config.port}`));
})();
