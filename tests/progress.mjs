// ¿La barra de progreso del vídeo avanza de forma continua y real? Registra cada
// evento SSE con su instante y calcula eventos por segundo, salto máximo y si es
// siempre creciente. También mide el progreso por páginas de Ghostscript.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, FIX, OUTDIR, upload, createJob, follow, kb } from './lib.mjs';

async function measure(file, target, options) {
  const up = await upload(path.join(FIX, file));
  if (up.status !== 201) throw new Error(up.error);
  const j = await createJob(up.file.id, target, options);
  if (j.status !== 201) throw new Error(j.error);
  // Cabeceras de la respuesta SSE (sin búfer en nginx).
  const head = await fetch(BASE + `api/jobs/${j.job.id}/events`);
  const hdr = { type: head.headers.get('content-type'), accel: head.headers.get('x-accel-buffering'), encoding: head.headers.get('content-encoding') };
  head.body.cancel();
  const t0 = performance.now();
  const events = await follow(j.job.id);
  const run = events.filter((e) => e.status === 'running' && typeof e.progress === 'number');
  const firstRun = events.find((e) => e.status === 'running');
  const done = events[events.length - 1];
  let maxJump = 0; let monotonic = true; let maxGap = 0;
  for (let i = 1; i < run.length; i++) {
    const dp = run[i].progress - run[i - 1].progress;
    if (dp < 0) monotonic = false;
    maxJump = Math.max(maxJump, dp);
    maxGap = Math.max(maxGap, run[i].at - run[i - 1].at);
  }
  const span = run.length > 1 ? (run[run.length - 1].at - run[0].at) / 1000 : 0;
  const perSecond = span ? (run.length - 1) / span : 0;
  // Línea de tiempo: el % alcanzado al final de cada segundo.
  const timeline = [];
  if (run.length) {
    const start = run[0].at;
    for (let s = 1; s <= Math.ceil(span) + 1; s++) {
      const upto = run.filter((e) => e.at - start <= s * 1000);
      if (upto.length) timeline.push(Math.round(upto[upto.length - 1].progress * 100));
    }
  }
  return {
    file, target, size: up.file.size, duration: up.file.meta.duration, pages: up.file.meta.pages, sse: hdr,
    totalEvents: events.length, progressEvents: run.length, seconds: +(span.toFixed(2)), eventsPerSecond: +perSecond.toFixed(2),
    maxJumpPct: +(maxJump * 100).toFixed(2), maxGapMs: Math.round(maxGap), monotonic,
    firstProgressPct: run.length ? +(run[0].progress * 100).toFixed(2) : null,
    lastProgressPct: run.length ? +(run[run.length - 1].progress * 100).toFixed(2) : null,
    startLatencyMs: firstRun ? Math.round(firstRun.at - t0) : null,
    speeds: run.filter((e) => e.speed).map((e) => e.speed).slice(-1)[0] || null,
    final: done.status, resultSize: done.result ? done.result.size : null, timeline,
  };
}

const video = await measure('long1080.mp4', 'v-mp4', { resolution: '0', quality: 'media' });
console.log(`\nVídeo: ${video.file} (${kb(video.size)}, ${video.duration} s, 1080p) → MP4 H.264`);
console.log(`  SSE: ${video.sse.type}, X-Accel-Buffering: ${video.sse.accel}, compresión: ${video.sse.encoding || 'ninguna'}`);
console.log(`  ${video.progressEvents} eventos de progreso en ${video.seconds} s → ${video.eventsPerSecond} eventos/s`);
console.log(`  salto máximo: ${video.maxJumpPct} %   hueco máximo entre eventos: ${video.maxGapMs} ms   siempre creciente: ${video.monotonic ? 'sí' : 'NO'}`);
console.log(`  primer valor: ${video.firstProgressPct} %   último: ${video.lastProgressPct} %   velocidad final: ${video.speeds}×   resultado: ${video.final}`);
console.log(`  % al final de cada segundo: ${video.timeline.join(' ')}`);

const pdf = await measure('photos.pdf', 'pdf-gray', {});
console.log(`\nPDF: ${pdf.file} (${pdf.pages} páginas) → escala de grises (Ghostscript, "Page N")`);
console.log(`  ${pdf.progressEvents} eventos en ${pdf.seconds} s · salto máximo ${pdf.maxJumpPct} % (1 página = ${(100 / pdf.pages).toFixed(1)} %) · creciente: ${pdf.monotonic ? 'sí' : 'NO'} · ${pdf.final}`);

const ok = video.final === 'done' && video.monotonic && video.eventsPerSecond >= 3 && video.maxJumpPct <= 10
  && video.sse.accel === 'no' && !video.sse.encoding && pdf.final === 'done' && pdf.monotonic && pdf.progressEvents >= pdf.pages;
fs.writeFileSync(path.join(OUTDIR, 'progress.json'), JSON.stringify({ video, pdf }, null, 2));
console.log(`\nProgreso real: ${ok ? 'CORRECTO' : 'FALLA'} (criterio: ≥3 eventos/s, salto ≤10 %, siempre creciente, sin búfer)`);
process.exitCode = ok ? 0 : 1;
