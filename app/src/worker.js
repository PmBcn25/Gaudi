'use strict';
// Worker: proceso aparte, sin red (PrivateNetwork en systemd). Lee la cola de SQLite,
// ejecuta como máximo 2 trabajos a la vez (y solo 1 de LibreOffice), aplica el
// límite de 15 minutos y manda el progreso real al servidor web por un socket Unix.
const fs = require('fs');
const net = require('net');
const path = require('path');
const config = require('./config');
const { open, jobRow, fileRow } = require('./db');
const { OUT } = require('./formats');
const { UserError, explain } = require('./convert/errors');
const { analyze } = require('./convert/analyze');
const image = require('./convert/image');
const av = require('./convert/av');
const docs = require('./convert/docs');

const db = open();
const running = new Map(); // jobId -> { ac, lo, timer }
const log = (...a) => console.log(new Date().toISOString(), ...a);

for (const d of [config.tmpDir, config.homeDir, path.join(config.homeDir, 'tmp')]) fs.mkdirSync(d, { recursive: true });

// Si el worker se reinició con trabajos a medias, se marcan como fallidos (no se pueden retomar).
db.prepare("UPDATE jobs SET status='error', error=?, finished_at=? WHERE status='running'")
  .run('El servicio de conversión se reinició mientras convertía tu archivo. Vuelve a intentarlo.', Date.now());

// ---------------------------------------------------------------- socket con el servidor web
let sock = null;
let buf = '';
function connect() {
  const s = net.createConnection(config.socketPath);
  s.on('connect', () => { sock = s; send({ t: 'hello', pid: process.pid }); schedule(); });
  s.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch (err) { log('mensaje inválido', err.message); }
    }
  });
  s.on('error', () => {});
  s.on('close', () => { if (sock === s) sock = null; buf = ''; setTimeout(connect, 500); });
}
function send(msg) {
  if (sock && !sock.destroyed) sock.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  if (msg.t === 'analyze') enqueueAnalysis(msg);
  else if (msg.t === 'wake') schedule();
  else if (msg.t === 'cancel') cancel(msg.jobId);
}

// ---------------------------------------------------------------- análisis de subidas
const analysisQueue = [];
let analyzing = 0;
function enqueueAnalysis(msg) { analysisQueue.push(msg); pumpAnalysis(); }
function pumpAnalysis() {
  while (analyzing < 2 && analysisQueue.length) {
    const msg = analysisQueue.shift();
    analyzing++;
    runAnalysis(msg).finally(() => { analyzing--; pumpAnalysis(); });
  }
}
async function runAnalysis(msg) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new UserError('El análisis del archivo ha tardado demasiado; puede estar dañado.', 'timeout')), config.limits.analyzeTimeoutMs);
  const started = Date.now();
  try {
    const dir = path.join(config.tmpDir, msg.fileId);
    const input = path.join(dir, 'upload.bin');
    const r = await analyze({ dir, input, name: msg.name, size: msg.size }, ac.signal);
    send({ t: 'analyzed', rid: msg.rid, ok: true, result: r });
    log(`análisis ${r.family}/${r.format} en ${Date.now() - started} ms`);
  } catch (err) {
    const e = err.user ? err : (explain(err) || null);
    if (!e) log('análisis fallido', err && err.stack ? err.stack : err);
    send({ t: 'analyzed', rid: msg.rid, ok: false, error: e ? e.message : 'No hemos podido leer el archivo. Puede estar dañado.', code: e ? e.code : 'failed' });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- planificador
function schedule() {
  if (running.size >= config.limits.concurrentJobs) return;
  const queued = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY seq").all();
  let loBusy = [...running.values()].filter((r) => r.lo).length >= config.limits.concurrentOffice;
  const claim = db.prepare("UPDATE jobs SET status='running', started_at=?, stage=? WHERE id=? AND status='queued'");
  for (const row of queued) {
    if (running.size >= config.limits.concurrentJobs) break;
    if (row.lo && loBusy) continue; // un solo LibreOffice a la vez; los demás trabajos pueden adelantarlo
    if (claim.run(Date.now(), 'Preparando', row.id).changes !== 1) continue;
    if (row.lo) loBusy = true;
    start(jobRow(row));
  }
}

function start(job) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new UserError('La conversión ha superado el límite de 15 minutos y se ha cancelado.', 'timeout')), config.limits.jobTimeoutMs);
  running.set(job.id, { ac, lo: job.lo, timer });
  emit(job.id, { status: 'running', stage: 'Preparando', progress: null });
  const t0 = Date.now();
  execute(job, ac.signal).then((result) => {
    db.prepare("UPDATE jobs SET status='done', finished_at=?, progress=1, result=?, stage=NULL WHERE id=?").run(Date.now(), JSON.stringify(result), job.id);
    emit(job.id, { status: 'done', result });
    log(`trabajo ${job.target} terminado en ${Date.now() - t0} ms`);
  }).catch((err) => {
    const reason = ac.signal.aborted ? ac.signal.reason : null;
    const canceled = (err && err.code === 'canceled') || (reason && reason.code === 'canceled');
    const outDir = path.join(config.tmpDir, job.file_id, `out-${job.id}`);
    fs.rm(outDir, { recursive: true, force: true }, () => {});
    if (canceled) {
      db.prepare("UPDATE jobs SET status='canceled', finished_at=? WHERE id=?").run(Date.now(), job.id);
      emit(job.id, { status: 'canceled' });
      log(`trabajo ${job.target} cancelado`);
      return;
    }
    const e = (reason && reason.user ? reason : null) || (err && err.user ? err : explain(err));
    if (!e) log(`trabajo ${job.target} falló:`, err && err.stack ? err.stack : err, err && err.stderr ? String(err.stderr).slice(-2000) : '');
    const message = e ? e.message : 'La conversión ha fallado por un problema inesperado. Prueba con otro formato o con otro archivo.';
    db.prepare("UPDATE jobs SET status='error', finished_at=?, error=? WHERE id=?").run(Date.now(), message, job.id);
    emit(job.id, { status: 'error', error: message });
  }).finally(() => {
    clearTimeout(timer);
    running.delete(job.id);
    setImmediate(schedule);
  });
}

function cancel(jobId) {
  const r = running.get(jobId);
  if (r) r.ac.abort(new UserError('Conversión cancelada.', 'canceled'));
}

// Progreso al servidor web en cada evento; a la base de datos, como mucho una vez por segundo.
const lastDb = new Map();
function emit(id, ev) {
  send({ t: 'job', id, ...ev });
  if (ev.status === 'running') {
    const now = Date.now();
    if (now - (lastDb.get(id) || 0) > 1000) {
      lastDb.set(id, now);
      db.prepare('UPDATE jobs SET progress=?, stage=? WHERE id=?').run(ev.progress == null ? null : ev.progress, ev.stage || null, id);
    }
  } else lastDb.delete(id);
}

const safeBase = (name) => (String(name || '').replace(/\.[^.]{1,10}$/, '').replace(/[%\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').trim().slice(0, 80) || 'archivo');

async function execute(job, signal) {
  const out = OUT[job.target];
  const file = fileRow(db.prepare('SELECT * FROM files WHERE id=?').get(job.file_id));
  if (!file) throw new UserError('El archivo ya no está en el servidor (caducó o lo quitaste).', 'gone');
  const dir = path.join(config.tmpDir, file.id);
  const outDir = path.join(dir, `out-${job.id}`);
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = safeBase(out.multi ? 'unido' : file.name);
  let stage = { stage: 'Preparando', stageIndex: null, stageCount: null };
  let lastSent = 0;
  const ctx = {
    job, file, dir, outDir, signal, baseName,
    input: file.virtual ? null : path.join(dir, file.meta.input),
    outPath: path.join(outDir, `${baseName}.${out.ext}`),
    mime: out.mime,
    thumb: null,
    setOutput(ext, mime) { ctx.outPath = path.join(outDir, `${baseName}.${ext}`); ctx.mime = mime; return ctx.outPath; },
    stage(label, index = null, count = null) {
      stage = { stage: label, stageIndex: index, stageCount: count };
      emit(job.id, { status: 'running', ...stage, progress: null });
    },
    progress(p) {
      const now = Date.now();
      if (now - lastSent < 100 && !p.done && p.fraction !== 1) return;
      lastSent = now;
      emit(job.id, {
        status: 'running', ...stage, progress: p.fraction == null ? null : +p.fraction.toFixed(4),
        speed: p.speed ? +p.speed.toFixed(2) : null, eta: p.eta == null ? null : +p.eta.toFixed(1),
        time: p.time == null ? null : +p.time.toFixed(2), page: p.page || null, pages: p.pages || null,
      });
    },
    async pdfThumb(pdf) {
      const t = path.join(outDir, 'thumb.jpg');
      await docs.pdfThumb(pdf, t, signal).catch(() => {});
      if (fs.existsSync(t)) ctx.thumb = 'thumb.jpg';
    },
    inputs: [],
  };
  if (out.multi) {
    for (const id of job.inputs || []) {
      const f = fileRow(db.prepare('SELECT * FROM files WHERE id=?').get(id));
      if (!f) throw new UserError('Uno de los PDF ya no está en el servidor (caducó o lo quitaste).', 'gone');
      ctx.inputs.push({ file: f, path: path.join(config.tmpDir, f.id, f.meta.input) });
    }
  } else if (!ctx.input || !fs.existsSync(ctx.input)) {
    throw new UserError('El archivo ya no está en el servidor (caducó o lo quitaste).', 'gone');
  }
  switch (out.engine) {
    case 'image': await image.convert(ctx); break;
    case 'audio': case 'video': await av.convert(ctx); break;
    case 'office': await docs.office(ctx); break;
    case 'pdf': await docs.pdf(ctx); break;
    case 'pandoc': await docs.pandoc(ctx); break;
    case 'subtitle': await docs.subtitle(ctx); break;
    default: throw new UserError('Conversión no soportada.', 'unsupported');
  }
  if (signal.aborted) throw signal.reason;
  if (!fs.existsSync(ctx.outPath) || fs.statSync(ctx.outPath).size === 0) {
    throw new UserError('La conversión no ha producido ningún resultado. El archivo de entrada puede estar dañado.', 'failed');
  }
  // Limpieza de restos intermedios (solo queda el resultado y su miniatura).
  for (const f of fs.readdirSync(outDir)) {
    const p = path.join(outDir, f);
    if (p !== ctx.outPath && f !== ctx.thumb) fs.rmSync(p, { recursive: true, force: true });
  }
  return {
    name: path.basename(ctx.outPath), file: path.relative(config.tmpDir, ctx.outPath), size: fs.statSync(ctx.outPath).size,
    mime: ctx.mime, thumb: ctx.thumb ? path.relative(config.tmpDir, path.join(outDir, ctx.thumb)) : null,
  };
}

// Red de seguridad: revisa la cola cada segundo (por si se pierde un aviso) y
// aborta los trabajos que se cancelaron desde el servidor web.
setInterval(() => {
  for (const [id, r] of running) {
    const row = db.prepare('SELECT status FROM jobs WHERE id=?').get(id);
    if (!row || row.status === 'canceled') r.ac.abort(new UserError('Conversión cancelada.', 'canceled'));
  }
  schedule();
}, 1000);

function shutdown() {
  for (const r of running.values()) r.ac.abort(new UserError('El servicio de conversión se ha reiniciado mientras convertía tu archivo. Vuelve a intentarlo.', 'restart'));
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

connect();
log(`worker listo (pid ${process.pid})`);
