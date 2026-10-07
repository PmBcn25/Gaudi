'use strict';
// FFmpeg / ffprobe con lista blanca de protocolos y de contenedores, y progreso real
// a partir de -progress (out_time_us) dividido entre la duración total.
const { run } = require('./proc');
const { UserError, explain } = require('./errors');

// Demuxers permitidos. Nada de hls, concat, playlists, http, ni nada que pueda
// apuntar a otros archivos. (av_match_list compara cada nombre del demuxer.)
const FORMAT_WHITELIST = [
  'mov', 'matroska', 'webm', 'avi', 'asf', 'mpeg', 'mpegts', 'mpegvideo', 'flv', 'ogg', 'mxf', 'wav', 'w64', 'flac',
  'aiff', 'amr', 'amrnb', 'amrwb', 'ac3', 'eac3', 'aac', 'mp3', 'caf', 'au', 'wv', 'ape', 'gif', 'h264', 'hevc', 'm4v',
  'image2', 'png_pipe', 'jpeg_pipe', 'bmp_pipe', 'ico', 'dds_pipe', 'exr_pipe', 'psd_pipe', 'jpegxl_pipe', 'j2k_pipe',
  'webp_pipe', 'tiff_pipe', 'gif_pipe', 'srt', 'webvtt', 'ass', 'dv', 'dts', 'mp2', 'smjpeg',
].join(',');

const inputArgs = (file, extra = []) => ['-protocol_whitelist', 'file', '-format_whitelist', FORMAT_WHITELIST, ...extra, '-i', file];

async function ffprobe(file, signal) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', FORMAT_WHITELIST,
      '-show_format', '-show_streams', '-of', 'json', file], { signal });
    return JSON.parse(stdout.toString('utf8'));
  } catch (err) {
    throw explain(err, 'media') || new UserError('El archivo está dañado o no es un archivo multimedia válido.', 'corrupt');
  }
}

// Duración en segundos. Si la cabecera no la trae (WebM grabados en el navegador),
// se recorre el índice de paquetes: el último pts + su duración.
async function duration(file, probe, signal) {
  const f = parseFloat(probe.format && probe.format.duration);
  if (Number.isFinite(f) && f > 0) return f;
  let best = 0;
  for (const s of probe.streams || []) {
    const d = parseFloat(s.duration);
    if (Number.isFinite(d) && d > best) best = d;
  }
  if (best > 0) return best;
  const v = (probe.streams || []).find((s) => s.codec_type === 'video') ? 'v:0' : 'a:0';
  const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', FORMAT_WHITELIST,
    '-select_streams', v, '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', file], { signal });
  let max = 0;
  for (const line of stdout.toString('utf8').split('\n')) {
    const [pts, dur] = line.split(',').map(parseFloat);
    if (Number.isFinite(pts)) max = Math.max(max, pts + (Number.isFinite(dur) ? dur : 0));
  }
  return max;
}

// Ejecuta FFmpeg informando del progreso real: fracción = out_time / total.
// Emite varias veces por segundo (-stats_period 0.2).
async function ffmpeg(args, { total, signal, onProgress, cwd }) {
  const full = ['-hide_banner', '-nostdin', '-y', ...args.slice(0, -1),
    '-progress', 'pipe:1', '-nostats', '-stats_period', '0.2', args[args.length - 1]];
  let block = {};
  const started = Date.now();
  try {
    await run('ffmpeg', full, {
      signal, nice: true, cwd,
      onStdout: (line) => {
        const i = line.indexOf('=');
        if (i < 0) return;
        const k = line.slice(0, i); const v = line.slice(i + 1).trim();
        block[k] = v;
        if (k !== 'progress') return;
        const us = Number(block.out_time_us);
        const t = Number.isFinite(us) && us > 0 ? us / 1e6 : 0;
        const sp = parseFloat(block.speed);
        let speed = Number.isFinite(sp) && sp > 0 ? sp : null;
        const wall = (Date.now() - started) / 1000;
        if (!speed && t > 0 && wall > 0.5) speed = t / wall;
        const frac = total > 0 ? Math.min(1, t / total) : null;
        const eta = speed && total ? Math.max(0, (total - t) / speed) : null;
        if (onProgress) onProgress({ fraction: frac, time: t, speed, eta, done: v === 'end' });
        block = {};
      },
    });
  } catch (err) {
    if (err.user) throw err;
    throw explain(err, 'media') || new UserError('No se ha podido convertir el archivo multimedia.', 'failed');
  }
}

module.exports = { FORMAT_WHITELIST, inputArgs, ffprobe, duration, ffmpeg };
