'use strict';
// Audio y vídeo con FFmpeg. Progreso real: out_time de -progress / duración (ffprobe).
const fs = require('fs');
const path = require('path');
const { run } = require('./proc');
const { UserError } = require('./errors');
const { inputArgs, ffprobe, duration, ffmpeg } = require('./media');
const config = require('../config');

const isCover = (s) => s.codec_type === 'video' && ((s.disposition && s.disposition.attached_pic) || ['mjpeg', 'png', 'bmp'].includes(s.codec_name) && !(Number(s.nb_frames) > 1));

// Reclasificación por contenido real: un MP4 sin vídeo es audio, un OGG con Theora es vídeo…
const TO_AUDIO = { mp4: 'm4a', m4v: 'm4a', mov: 'm4a', '3gp': 'm4a', f4v: 'm4a', mkv: 'mka', webm: 'weba', ogv: 'ogg', wmv: 'wma', asf: 'wma' };
const TO_VIDEO = { ogg: 'ogv', mka: 'mkv', weba: 'webm', wma: 'wmv', m4a: 'mp4', m4b: 'mp4', m4r: 'mp4', opus: 'ogv' };

async function analyze(file, input, dir, signal) {
  const probe = await ffprobe(input, signal);
  const streams = probe.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !isCover(s));
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v && !a) throw new UserError('El archivo no contiene ninguna pista de audio ni de vídeo.', 'corrupt');
  let format = file.format;
  let family = v ? 'video' : 'audio';
  if (family === 'audio' && TO_AUDIO[format]) format = TO_AUDIO[format];
  if (family === 'video' && TO_VIDEO[format]) format = TO_VIDEO[format];
  const dur = await duration(input, probe, signal);
  if (!(dur > 0)) throw new UserError('No se ha podido determinar la duración: el archivo parece dañado.', 'corrupt');
  const meta = { duration: dur, hasAudio: !!a };
  if (a) Object.assign(meta, { acodec: a.codec_name, sampleRate: Number(a.sample_rate) || null, channels: a.channels || null });
  if (family === 'video') {
    if (dur > config.limits.videoSeconds + 0.5) {
      throw new UserError(`El vídeo dura ${clock(dur)} y el máximo es ${clock(config.limits.videoSeconds)}. Recórtalo y vuelve a subirlo.`, 'toolong');
    }
    let w = v.width; let h = v.height;
    const rot = Math.abs(Number((v.side_data_list || []).map((d) => d.rotation).find((r) => r !== undefined) || (v.tags && v.tags.rotate) || 0));
    if (rot === 90 || rot === 270) [w, h] = [h, w];
    const [fn, fd] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
    Object.assign(meta, { width: w, height: h, fps: fd ? +(fn / fd).toFixed(2) : null, vcodec: v.codec_name });
    // Miniatura: un fotograma real del vídeo (al 10 % de su duración). Si el salto rápido no
    // da ningún fotograma (pasa con algunos MPEG-TS), se decodifica desde el principio.
    const at = Math.min(dur * 0.1, Math.max(0, dur - 0.1)).toFixed(2);
    const thumb = path.join(dir, 'thumb.jpg');
    const shot = (seek) => run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...(seek === 'in' ? ['-ss', at] : []), ...inputArgs(input),
      ...(seek === 'out' ? ['-ss', at] : []), '-map', `0:${v.index}`, '-frames:v', '1', '-vf', 'scale=320:320:force_original_aspect_ratio=decrease',
      '-q:v', '5', '-update', '1', thumb], { signal, nice: true }).catch(() => {});
    await shot('in');
    if (!fs.existsSync(thumb)) await shot('out');
    if (!fs.existsSync(thumb)) await shot('none');
    if (fs.existsSync(path.join(dir, 'thumb.jpg'))) meta.thumb = 'thumb.jpg';
  } else {
    if (file.size > config.limits.uploadOther) throw new UserError('Los archivos de audio pueden pesar como máximo 50 MB.', 'toolarge');
    meta.waveform = await waveform(input, a.index, dur, signal).catch(() => null);
  }
  return { format, family, meta };
}

// Forma de onda real: picos de la señal decodificada (mono, 2 kHz) en 96 tramos.
async function waveform(input, index, dur, signal) {
  const rate = dur > 1800 ? 500 : 2000;
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', ...inputArgs(input), '-map', `0:${index}`,
    '-ac', '1', '-ar', String(rate), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], { signal, nice: true, maxStdout: 16 * 1024 * 1024 });
  const n = Math.floor(stdout.length / 2);
  if (!n) return null;
  const bars = 96;
  const per = Math.max(1, Math.floor(n / bars));
  const peaks = [];
  let max = 1;
  for (let b = 0; b < bars; b++) {
    let p = 0;
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) p = Math.max(p, Math.abs(stdout.readInt16LE(i * 2)));
    peaks.push(p); max = Math.max(max, p);
  }
  return peaks.map((p) => +(p / max).toFixed(3));
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- audio
function audioCodec(target, o, meta) {
  const br = `${o.bitrate}k`;
  const ch = meta.channels || 2;
  const hiRes = ['flac', 'alac', 'pcm_s24le', 'pcm_s32le', 'pcm_s24be', 'wavpack', 'ape'].includes(meta.acodec);
  const fmt = target.replace(/^[av]-/, '');
  switch (fmt) {
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', br, ...(ch > 2 ? ['-ac', '2'] : [])];
    case 'm4a': return ['-c:a', 'aac', '-b:a', br, '-f', 'ipod', '-movflags', '+faststart'];
    case 'ogg': return ['-c:a', 'libvorbis', '-b:a', br];
    case 'opus': return ['-c:a', 'libopus', '-b:a', br, '-ar', '48000'];
    case 'flac': return ['-c:a', 'flac'];
    case 'wav': return ['-c:a', hiRes ? 'pcm_s24le' : 'pcm_s16le'];
    case 'aiff': return ['-c:a', hiRes ? 'pcm_s24be' : 'pcm_s16be'];
    case 'alac': return ['-c:a', 'alac', '-f', 'ipod'];
    case 'ac3': return ['-c:a', 'ac3', '-b:a', br, ...(ch > 6 ? ['-ac', '6'] : [])];
    case 'wma': return ['-c:a', 'wmav2', '-b:a', br, ...(ch > 2 ? ['-ac', '2'] : []), '-f', 'asf'];
    case 'm4r': return ['-c:a', 'aac', '-b:a', '256k', ...(ch > 2 ? ['-ac', '2'] : []), '-f', 'ipod'];
    default: throw new UserError('Formato de audio no soportado.', 'unsupported');
  }
}

async function convertAudio(ctx) {
  const { job, file, input, outPath, signal } = ctx;
  const o = job.options;
  const meta = file.meta;
  const pre = [];
  let total = meta.duration;
  const extra = [];
  if (job.target === 'a-m4r') {
    const start = Number(o.start) || 0;
    if (start >= meta.duration - 1) throw new UserError(`El audio dura ${clock(meta.duration)}: no puede empezar en ${clock(start)}.`, 'invalid');
    if (start > 0) pre.push('-ss', String(start));
    total = Math.min(40, meta.duration - start);
    extra.push('-t', '40');
  }
  const filters = [];
  if (o.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  const sr = meta.sampleRate;
  const keepRate = job.target.endsWith('opus') ? null : (o.normalize ? ([44100, 48000].includes(sr) ? sr : 48000)
    : (['a-mp3', 'v-mp3', 'a-ac3', 'a-wma', 'a-m4r'].includes(job.target) && sr && sr > 48000 ? 48000 : null));
  const args = [...inputArgs(input, pre), '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '0', ...extra,
    ...(filters.length ? ['-af', filters.join(',')] : []), ...(keepRate ? ['-ar', String(keepRate)] : []),
    ...audioCodec(job.target, o, meta), outPath];
  ctx.stage(o.normalize ? 'Normalizando y codificando audio' : 'Codificando audio');
  await ffmpeg(args, { total, signal, onProgress: ctx.progress });
}

// ---------------------------------------------------------------- vídeo
const CRF = { alta: 20, media: 23, baja: 28 };
const VP9_CRF = { alta: 30, media: 35, baja: 41 };
const MPEG4_Q = { alta: 3, media: 5, baja: 8 };

function scaleFilter(res, meta) {
  const r = Number(res) || 0;
  if (r > 0 && Math.min(meta.width || 0, meta.height || 0) > r) {
    // Lado corto = resolución elegida (vale igual para vídeos verticales); dimensiones pares.
    return `scale='if(gt(iw,ih),-2,${r})':'if(gt(iw,ih),${r},-2)'`;
  }
  return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
}

async function convertVideo(ctx) {
  const { job, file, input, outPath, signal } = ctx;
  const o = job.options;
  const meta = file.meta;
  let total = meta.duration;
  const t = job.target;
  const hasAudio = meta.hasAudio;
  const vmap = ['-map', '0:V:0?', ...(hasAudio ? ['-map', '0:a:0?'] : [])];
  const fromGif = t.startsWith('gif-');
  let args;
  let label;
  if (fromGif && !meta.duration) total = null;
  if (t === 'v-gif') {
    const d = Number(o.duration) || 0;
    if (d > 0 && d < meta.duration) total = d;
    const w = Number(o.width) || 480;
    // Paleta por fotograma (stats_mode=single + new=1): el GIF se escribe en streaming.
    const vf = `fps=${Number(o.fps) || 12},scale='min(${w},iw)':-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1:dither=bayer:bayer_scale=4`;
    args = [...inputArgs(input), ...(d > 0 ? ['-t', String(d)] : []), '-map', '0:V:0', '-an', '-vf', vf, '-loop', '0', '-f', 'gif', outPath];
    label = 'Generando GIF';
  } else {
    const q = o.quality || 'media';
    const vf = fromGif ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p' : `${scaleFilter(o.resolution, meta)},format=yuv420p`;
    const vfr = ['-fps_mode', 'vfr'];
    const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(CRF[q]), '-profile:v', 'high'];
    const aac = hasAudio && !fromGif ? ['-c:a', 'aac', '-b:a', '160k', ...(meta.channels > 2 ? ['-ac', '2'] : [])] : ['-an'];
    const map = fromGif ? ['-map', '0:V:0', '-an'] : vmap;
    switch (t) {
      case 'v-mp4': case 'gif-mp4':
        args = [...inputArgs(input), ...map, '-vf', vf, ...vfr, ...h264, ...aac, '-movflags', '+faststart', '-f', 'mp4', outPath];
        label = 'Codificando H.264'; break;
      case 'v-mov':
        args = [...inputArgs(input), ...map, '-vf', vf, ...vfr, ...h264, ...aac, '-movflags', '+faststart', '-f', 'mov', outPath];
        label = 'Codificando H.264 (MOV)'; break;
      case 'v-mkv':
        args = [...inputArgs(input), ...map, '-vf', vf, ...vfr, ...h264, ...aac, '-f', 'matroska', outPath];
        label = 'Codificando H.264 (MKV)'; break;
      case 'v-webm': case 'gif-webm':
        args = [...inputArgs(input), ...map, '-vf', vf, ...vfr, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '7', '-row-mt', '1',
          '-b:v', '0', '-crf', String(VP9_CRF[q]),
          ...(hasAudio && !fromGif ? ['-c:a', 'libopus', '-b:a', '128k', ...(meta.channels > 2 ? ['-ac', '2'] : [])] : ['-an']), '-f', 'webm', outPath];
        label = 'Codificando VP9'; break;
      case 'v-avi':
        // AVI no admite tasa variable: aquí no va -fps_mode vfr.
        args = [...inputArgs(input), ...vmap, '-vf', vf, '-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String(MPEG4_Q[q]),
          ...(hasAudio ? ['-c:a', 'libmp3lame', '-b:a', '192k', '-ac', '2'] : ['-an']), '-f', 'avi', outPath];
        label = 'Codificando MPEG-4 (AVI)'; break;
      default:
        throw new UserError('Conversión de vídeo no soportada.', 'unsupported');
    }
  }
  ctx.stage(label);
  await ffmpeg(args, { total, signal, onProgress: ctx.progress });
}

// GIF animado de entrada: su duración para el progreso.
async function gifDuration(input, signal) {
  const probe = await ffprobe(input, signal);
  return duration(input, probe, signal);
}

async function convert(ctx) {
  if (ctx.job.target.startsWith('gif-')) {
    if (!ctx.file.meta.duration) ctx.file.meta.duration = await gifDuration(ctx.input, ctx.signal);
    return convertVideo(ctx);
  }
  if (ctx.file.family === 'audio' || ['v-mp3', 'v-m4a', 'v-ogg', 'v-wav', 'v-flac'].includes(ctx.job.target)) return convertAudio(ctx);
  return convertVideo(ctx);
}

module.exports = { analyze, convert, clock };
