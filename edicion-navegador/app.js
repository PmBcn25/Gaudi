'use strict';
// Convertia, edición navegador: todo se convierte en el dispositivo de quien usa la página.
(() => {
  const d = document;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
  const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${nf0.format(n / 1024)} KB` : n < 1073741824 ? `${nf1.format(n / 1048576)} MB` : `${nf1.format(n / 1073741824)} GB`);
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const left = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim(); };
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const MB = 1048576;

  class UserError extends Error { constructor(m, code = 'failed') { super(m); this.user = true; this.code = code; } }
  const canceled = () => new UserError('Conversión cancelada.', 'canceled');

  // ---------------------------------------------------------------- vistas (#terminos, #privacidad)
  const VIEWS = { terminos: 'v-terminos', privacidad: 'v-privacidad', cookies: 'v-privacidad' };
  function route() {
    const h = location.hash.slice(1);
    const v = VIEWS[h] || 'v-inicio';
    for (const id of ['v-inicio', 'v-terminos', 'v-privacidad']) $(`#${id}`).hidden = id !== v;
    const target = h && d.getElementById(h);
    if (target) target.scrollIntoView(); else scrollTo(0, 0);
  }
  addEventListener('hashchange', route);
  route();

  const top = $('.top');
  addEventListener('scroll', () => top.classList.toggle('sc', scrollY > 4), { passive: true });


  // ---------------------------------------------------------------- avisos
  const toasts = $('#toasts');
  function toast(msg, err) {
    const t = d.createElement('div');
    t.className = `toast${err ? ' e' : ''}`;
    t.textContent = msg;
    toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3800);
  }

  // ---------------------------------------------------------------- muelles (tiempo real + temporizador de respaldo)
  const springs = new Set();
  let last = 0;
  let raf = 0;
  function step(now) {
    const dt = (now - last) / 1000;
    last = now;
    for (const s of springs) {
      if (dt > 3) { s.x = s.t; s.v = 0; } else if (dt > 0) {
        let n = Math.ceil(dt * 120); const h = dt / n;
        while (n--) { s.v += (-s.k * (s.x - s.t) - s.c * s.v) * h; s.x += s.v * h; }
      }
      if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) { s.x = s.t; s.v = 0; springs.delete(s); }
      s.f(s.x);
    }
  }
  function frame(now) { raf = 0; step(now); if (springs.size) raf = requestAnimationFrame(frame); }
  setInterval(() => { if (springs.size && performance.now() - last > 120) step(performance.now()); }, 100);
  class Spring {
    constructor(f, x = 0, k = 90) { this.f = f; this.x = x; this.t = x; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k); f(x); }
    to(t) { this.t = t; if (!springs.size) last = performance.now(); springs.add(this); if (!raf) raf = requestAnimationFrame(frame); }
    snap(t) { this.x = this.t = t; this.v = 0; springs.delete(this); this.f(t); }
  }

  // ---------------------------------------------------------------- bibliotecas (se cargan solo cuando hacen falta)
  const LIBS = {
    pdflib: 'vendor/pdf-lib.min.js', pdfjs: 'vendor/pdf.min.js', xlsx: 'vendor/xlsx.full.min.js', mammoth: 'vendor/mammoth.browser.min.js',
    marked: 'vendor/marked.min.js', turndown: 'vendor/turndown.js', fflate: 'vendor/fflate.js', gifenc: 'vendor/gifenc.js',
  };
  const loading = {};
  function lib(name) {
    if (!loading[name]) {
      loading[name] = new Promise((res, rej) => {
        const s = d.createElement('script');
        s.src = LIBS[name];
        s.onload = res;
        s.onerror = () => { delete loading[name]; rej(new UserError('No se ha podido cargar una parte del conversor. Recarga la página e inténtalo de nuevo.')); };
        d.head.append(s);
      }).then(() => { if (name === 'pdfjs') self.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; });
    }
    return loading[name];
  }

  // ---------------------------------------------------------------- guardar (capacidad «downloads» de Claude)
  // Claude solo deja guardar ciertas extensiones; el resto se entrega dentro de un ZIP.
  const ALLOWED = new Set('gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip'.split(' '));
  const inViewer = !!(self.claude && self.claude.use);
  const dlReady = inViewer ? self.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  async function saveFile(blob, name) {
    const dl = await dlReady;
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast(`Guardado: ${name}`); } catch (err) {
        const code = err && err.code;
        if (code === 'declined') toast('No se ha guardado el archivo.');
        else if (code === 'rate_limited') toast('Ya hay una descarga esperando tu confirmación.', true);
        else if (code === 'too_large') toast('El archivo es demasiado grande para guardarlo desde aquí.', true);
        else toast('Esta vista no permite guardar archivos. Abre la página en claude.ai.', true);
      }
      return;
    }
    if (inViewer) { toast('Esta vista no permite guardar archivos. Abre la página en claude.ai.', true); return; }
    // Fuera de Claude (copia local de la página): descarga normal.
    const a = d.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; d.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function packForSave(blob, name, level = 6) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ALLOWED.has(ext)) return { blob, name, zipped: false };
    await lib('fflate');
    const data = new Uint8Array(await blob.arrayBuffer());
    const zip = self.fflate.zipSync({ [name]: [data, { level }] });
    return { blob: new Blob([zip], { type: 'application/zip' }), name: `${name}.zip`, zipped: true };
  }
  async function zipFiles(files, name, ctx) {
    await lib('fflate');
    const entries = {};
    for (const [n, blob] of files) entries[n] = [new Uint8Array(await blob.arrayBuffer()), { level: /\.(jpe?g|png|mp3|webp|gif)$/i.test(n) ? 0 : 6 }];
    if (ctx) ctx.stage('Comprimiendo en un ZIP');
    return { blob: new Blob([self.fflate.zipSync(entries)], { type: 'application/zip' }), name };
  }

  // ---------------------------------------------------------------- capacidades del navegador
  const encodes = {};
  async function canEncode(type) {
    if (encodes[type] !== undefined) return encodes[type];
    const c = d.createElement('canvas'); c.width = c.height = 2;
    const b = await new Promise((r) => c.toBlob(r, type, 0.8));
    return (encodes[type] = !!b && b.type === type);
  }

  // ---------------------------------------------------------------- tipos
  const INPUTS = {
    jpeg: ['image', 'JPEG'], png: ['image', 'PNG'], webp: ['image', 'WebP'], avif: ['image', 'AVIF'], gif: ['image', 'GIF'],
    bmp: ['image', 'BMP'], ico: ['image', 'ICO'], svg: ['image', 'SVG'], heic: ['image', 'HEIC'],
    mp3: ['audio', 'MP3'], wav: ['audio', 'WAV'], flac: ['audio', 'FLAC'], ogg: ['audio', 'OGG'], opus: ['audio', 'Opus'],
    m4a: ['audio', 'M4A'], aac: ['audio', 'AAC'], weba: ['audio', 'WebA'],
    mp4: ['video', 'MP4'], webm: ['video', 'WebM'], mov: ['video', 'MOV'], mkv: ['video', 'MKV'],
    docx: ['doc', 'Word (DOCX)'], xlsx: ['sheet', 'Excel (XLSX)'], xls: ['sheet', 'Excel 97–2003 (XLS)'], ods: ['sheet', 'OpenDocument (ODS)'],
    csv: ['sheet', 'CSV'], tsv: ['sheet', 'TSV'], pdf: ['pdf', 'PDF'], md: ['text', 'Markdown'], html: ['text', 'HTML'], txt: ['text', 'Texto plano'],
    srt: ['subtitle', 'SubRip (SRT)'], vtt: ['subtitle', 'WebVTT'], ass: ['subtitle', 'ASS'], ssa: ['subtitle', 'SSA'],
  };
  const FAMILY_LABEL = { image: 'Imagen', audio: 'Audio', video: 'Vídeo', doc: 'Documento', sheet: 'Hoja de cálculo', pdf: 'PDF', text: 'Texto', subtitle: 'Subtítulos' };
  const SERVER_ONLY = {
    pptx: 'Las presentaciones PPTX', ppt: 'Las presentaciones PPT', odp: 'Las presentaciones ODP', doc: 'Los documentos DOC', odt: 'Los documentos ODT',
    rtf: 'Los documentos RTF', epub: 'Los libros EPUB', avi: 'Los vídeos AVI', wmv: 'Los vídeos WMV', flv: 'Los vídeos FLV', psd: 'Los PSD',
    tiff: 'Las imágenes TIFF', tga: 'Las imágenes TGA', jxl: 'Las imágenes JPEG XL', mpg: 'Los vídeos MPEG', ts: 'Los vídeos MPEG-TS',
  };

  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
  }
  function looksText(b) {
    const n = Math.min(b.length, 8192);
    let bad = 0;
    for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32 && c !== 27)) bad++; }
    return n > 0 && bad / n < 0.01;
  }

  // Tipo real por el contenido (cabeceras), no por la extensión.
  async function sniff(file) {
    if (!file.size) throw new UserError('El archivo está vacío (0 bytes).', 'corrupt');
    const ext = ((file.name.match(/\.([a-z0-9]{1,8})$/i) || [])[1] || '').toLowerCase();
    const b = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const latin = new TextDecoder('latin1');
    const s = (o, n) => latin.decode(b.subarray(o, o + n));
    const has = (o, a) => a.every((x, i) => b[o + i] === x);
    let id = null;
    if (has(0, [0xff, 0xd8, 0xff])) id = 'jpeg';
    else if (has(0, [0x89, 0x50, 0x4e, 0x47])) id = 'png';
    else if (s(0, 4) === 'GIF8') id = 'gif';
    else if (s(0, 4) === 'RIFF') id = { WEBP: 'webp', WAVE: 'wav', 'AVI ': 'avi' }[s(8, 4)] || null;
    else if (s(0, 2) === 'BM') id = 'bmp';
    else if (has(0, [0, 0, 1, 0])) id = 'ico';
    else if (s(0, 1024).includes('%PDF-')) id = 'pdf';
    else if (s(4, 4) === 'ftyp') {
      const brand = s(8, 4);
      if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) id = s(16, 64).includes('avif') ? 'avif' : 'heic';
      else if (['avif', 'avis'].includes(brand)) id = 'avif';
      else if (brand === 'qt  ') id = 'mov';
      else if (['M4A ', 'M4B ', 'M4P '].includes(brand)) id = 'm4a';
      else id = ext === 'm4a' ? 'm4a' : 'mp4';
    } else if (['moov', 'mdat', 'wide', 'free'].includes(s(4, 4))) id = 'mov';
    else if (s(0, 4) === 'fLaC') id = 'flac';
    else if (s(0, 4) === 'OggS') id = s(0, 200).includes('OpusHead') ? 'opus' : 'ogg';
    else if (has(0, [0x1a, 0x45, 0xdf, 0xa3])) id = s(0, 64).includes('webm') ? (ext === 'weba' ? 'weba' : 'webm') : 'mkv';
    else if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) id = (b[1] & 0xf6) === 0xf0 ? 'aac' : 'mp3';
    else if (s(0, 4) === 'PK\x03\x04') {
      const t = s(0, b.length);
      const mime = s(30, 8) === 'mimetype' ? s(38, 60) : '';
      if (mime.startsWith('application/vnd.oasis.opendocument.spreadsheet')) id = 'ods';
      else if (mime.startsWith('application/vnd.oasis.opendocument.text')) id = 'odt';
      else if (mime.startsWith('application/vnd.oasis.opendocument.presentation')) id = 'odp';
      else if (mime.startsWith('application/epub+zip')) id = 'epub';
      else if (t.includes('word/')) id = 'docx';
      else if (t.includes('xl/')) id = 'xlsx';
      else if (t.includes('ppt/')) id = 'pptx';
      else if (['docx', 'xlsx', 'pptx'].includes(ext)) id = ext;
      else throw new UserError('Es un archivo ZIP. Sube directamente los archivos que contiene: los ZIP no se convierten.', 'unsupported');
    } else if (has(0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) id = ext === 'xls' || ext === 'xlt' ? 'xls' : ext === 'ppt' ? 'ppt' : 'doc';
    else if (s(0, 4) === '8BPS') id = 'psd';
    else if (has(0, [0x49, 0x49, 0x2a, 0x00]) || has(0, [0x4d, 0x4d, 0x00, 0x2a])) id = 'tiff';
    else if (s(0, 5) === '{\\rtf') id = 'rtf';
    else if (looksText(b)) {
      const t = new TextDecoder('utf-8').decode(b).replace(/^\uFEFF/, '').trimStart();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'mp3', 'mp4', 'wav', 'docx', 'xlsx'].includes(ext)) {
        throw new UserError(`El archivo se llama .${ext} pero dentro solo hay texto: no es un ${ext.toUpperCase()} válido.`, 'corrupt');
      }
      if (/^#EXTM3U|^ffconcat/i.test(t)) throw new UserError('Las listas de reproducción (M3U, M3U8…) no se aceptan: apuntan a otros archivos en lugar de contener el audio o el vídeo.', 'unsupported');
      if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(t)) id = 'svg';
      else if (/^WEBVTT/.test(t)) id = 'vtt';
      else if (/^\[Script Info\]/im.test(t)) id = /ScriptType:\s*v4\.00\+/i.test(t) || ext === 'ass' ? 'ass' : 'ssa';
      else if (/^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(t)) id = 'srt';
      else if (ext === 'csv' || ext === 'tsv') id = ext;
      else if (/^(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(t) || (['html', 'htm', 'xhtml'].includes(ext) && /<[a-z!]/i.test(t))) id = 'html';
      else if (['md', 'markdown', 'mdown', 'mkd'].includes(ext)) id = 'md';
      else if (['tex', 'rst', 'org', 'textile', 'wiki', 'ipynb', 'fb2', 'opml'].includes(ext)) {
        throw new UserError(`Los archivos .${ext} necesitan Pandoc en un servidor: están en la edición con servidor de Convertia.`, 'unsupported');
      } else id = 'txt';
    }
    if (id && SERVER_ONLY[id]) throw new UserError(`${SERVER_ONLY[id]} necesitan un servidor (FFmpeg o LibreOffice): están en la edición con servidor de Convertia.`, 'unsupported');
    if (!id || !INPUTS[id]) throw new UserError(ext ? `El formato .${ext} no está soportado.` : 'No reconocemos el tipo de este archivo.', 'unsupported');
    const claimed = { jpg: 'jpeg', jpe: 'jpeg', htm: 'html', markdown: 'md', m4b: 'm4a', oga: 'ogg' }[ext] || ext;
    const note = INPUTS[claimed] && claimed !== id && !(['mp4', 'mov', 'm4a'].includes(claimed) && ['mp4', 'mov', 'm4a'].includes(id))
      && !(claimed === 'webm' && id === 'weba') && !(claimed === 'ogg' && id === 'opus') ? `Aunque se llama .${ext}, en realidad es ${INPUTS[id][1]}.` : null;
    return { format: id, family: INPUTS[id][0], label: INPUTS[id][1], note };
  }

  // ---------------------------------------------------------------- decodificación
  async function decodeImage(file, format) {
    if (format !== 'svg' && format !== 'ico' && self.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* sigue con <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } catch {
      if (format === 'heic') throw new UserError('Tu navegador no sabe abrir fotos HEIC (solo Safari). En la edición con servidor sí se convierten.', 'unsupported');
      throw new UserError('La imagen está dañada o tu navegador no sabe abrirla.', 'corrupt');
    } finally { URL.revokeObjectURL(url); }
  }
  const dims = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

  async function decodeAudio(file, what = 'audio') {
    const ab = await file.arrayBuffer();
    const ctx = new (self.OfflineAudioContext || self.webkitOfflineAudioContext)(2, 1, 44100);
    try {
      return await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    } catch {
      throw new UserError(what === 'video'
        ? 'Este vídeo no tiene pista de audio o tu navegador no sabe leerla.'
        : 'Tu navegador no sabe leer este audio. Prueba con otro navegador o usa la edición con servidor.', 'unsupported');
    }
  }
  function peaks(buf, bars = 96) {
    const ch = buf.getChannelData(0);
    const per = Math.max(1, Math.floor(ch.length / bars));
    const out = [];
    let max = 1e-6;
    for (let b = 0; b < bars; b++) {
      let p = 0;
      for (let i = b * per, e = Math.min(ch.length, (b + 1) * per); i < e; i += 4) { const v = Math.abs(ch[i]); if (v > p) p = v; }
      out.push(p); if (p > max) max = p;
    }
    return out.map((p) => p / max);
  }

  function loadVideo(file) {
    return new Promise((res, rej) => {
      const v = d.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const url = URL.createObjectURL(file);
      const fail = () => { URL.revokeObjectURL(url); rej(new UserError('Tu navegador no puede reproducir este vídeo. Para convertirlo hace falta la edición con servidor.', 'unsupported')); };
      const timer = setTimeout(fail, 15000);
      v.onloadeddata = () => { clearTimeout(timer); v.__url = url; res(v); };
      v.onerror = () => { clearTimeout(timer); fail(); };
      v.src = url;
    });
  }
  function seek(v, t) {
    return new Promise((res) => {
      const done = () => { v.removeEventListener('seeked', done); res(); };
      v.addEventListener('seeked', done);
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
    });
  }
  const canvasOf = (w, h) => { const c = d.createElement('canvas'); c.width = w; c.height = h; return c; };
  const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new UserError('Tu navegador no ha podido generar la imagen.'))), type, q));

  async function openPdf(file) {
    await lib('pdfjs');
    try {
      return await self.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new UserError('El PDF está protegido con contraseña. Quítale la contraseña y vuelve a añadirlo.', 'protected');
      throw new UserError('El PDF está dañado y no se puede leer.', 'corrupt');
    }
  }
  async function pdfThumb(pdf) {
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = 160 / vp.width;
    const c = canvasOf(Math.round(vp.width * scale), Math.round(vp.height * scale));
    await page.render({ canvasContext: c.getContext('2d'), viewport: page.getViewport({ scale }) }).promise;
    return URL.createObjectURL(await toBlob(c, 'image/png'));
  }

  // JPEG: segmentos hasta el primer SOS y, después, el marcador de fin (FF D9). PNG: trozos hasta IEND.
  // Así se aceptan fotos con datos añadidos tras el final (Motion Photos) y se rechazan las cortadas.
  function complete(b, format) {
    if (format === 'png') {
      for (let p = 8; p + 8 <= b.length;) {
        const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
        if (b[p + 4] === 0x49 && b[p + 5] === 0x45 && b[p + 6] === 0x4e && b[p + 7] === 0x44) return true; // IEND
        p += 12 + len;
      }
      return false;
    }
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) return false;
      const m = b[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m === 0xda) break; // SOS: empiezan los datos de imagen
      if (m === 0xd9) return true;
      p += 2 + ((b[p + 2] << 8) | b[p + 3]);
    }
    for (let i = p; i + 1 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xd9) return true;
    return false;
  }

  // ---------------------------------------------------------------- análisis de cada archivo
  async function analyze(card) {
    const file = card.file;
    const info = await sniff(file);
    const meta = {};
    if (info.family === 'video' && file.size > 200 * MB) throw new UserError('Los vídeos pueden pesar como máximo 200 MB.', 'toolarge');
    if (info.family !== 'video' && file.size > 200 * MB) throw new UserError('Este archivo pesa más de 200 MB, el máximo.', 'toolarge');
    if (info.family === 'image') {
      // Los navegadores pintan imágenes cortadas sin quejarse: se comprueba que la estructura llega al final.
      if ((info.format === 'jpeg' || info.format === 'png') && !complete(new Uint8Array(await file.arrayBuffer()), info.format)) {
        throw new UserError('La imagen está incompleta (el archivo está cortado) y no se puede convertir bien.', 'corrupt');
      }
      const img = await decodeImage(file, info.format);
      [meta.width, meta.height] = dims(img);
      if (img.close) img.close();
    } else if (info.family === 'audio') {
      const buf = await decodeAudio(file);
      card.audio = buf;
      meta.duration = buf.duration; meta.waveform = peaks(buf);
    } else if (info.family === 'video') {
      const v = await loadVideo(file);
      try {
        if (!v.videoWidth) { // MP4/WebM sin imagen: es audio
          info.family = 'audio'; info.format = info.format === 'webm' ? 'weba' : 'm4a'; info.label = INPUTS[info.format][1];
          const buf = await decodeAudio(file); card.audio = buf; meta.duration = buf.duration; meta.waveform = peaks(buf);
        } else {
          meta.duration = v.duration; meta.width = v.videoWidth; meta.height = v.videoHeight;
          if (!(v.duration > 0) || v.duration === Infinity) throw new UserError('No se ha podido saber cuánto dura el vídeo: parece dañado.', 'corrupt');
          if (v.duration > 300.5) throw new UserError(`El vídeo dura ${clock(v.duration)} y el máximo es 5:00. Recórtalo y vuelve a añadirlo.`, 'toolong');
          await seek(v, v.duration * 0.1);
          const k = 160 / v.videoWidth;
          const c = canvasOf(160, Math.max(1, Math.round(v.videoHeight * k)));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          meta.thumb = URL.createObjectURL(await toBlob(c, 'image/jpeg', 0.8));
        }
      } finally { URL.revokeObjectURL(v.__url); v.removeAttribute('src'); v.load(); }
    } else if (info.family === 'pdf') {
      const pdf = await openPdf(file);
      meta.pages = pdf.numPages;
      meta.thumb = await pdfThumb(pdf).catch(() => null);
      pdf.destroy();
    } else if (info.family === 'subtitle') {
      const cues = parseSubs(decodeText(new Uint8Array(await file.arrayBuffer())), info.format);
      if (!cues.length) throw new UserError('El archivo de subtítulos no tiene ningún subtítulo válido.', 'corrupt');
      meta.cues = cues.length;
    }
    return { ...info, meta, size: file.size };
  }

  // ---------------------------------------------------------------- catálogo de salidas
  const opt = {
    maxWidth: { key: 'maxWidth', type: 'select', label: 'Ancho máximo', default: '0', choices: [['0', 'Original'], ['3840', '3840 px'], ['1920', '1920 px'], ['1280', '1280 px'], ['800', '800 px'], ['400', '400 px']] },
    quality: { key: 'quality', type: 'range', label: 'Calidad', min: 10, max: 100, step: 1, default: 80 },
    icoSize: { key: 'icoSize', type: 'select', label: 'Tamaños', default: 'all', choices: [['all', 'Todos (16–256 px)'], ['16', '16 px'], ['32', '32 px'], ['48', '48 px'], ['64', '64 px'], ['128', '128 px'], ['256', '256 px']] },
    bitrate: { key: 'bitrate', type: 'select', label: 'Bitrate', default: '192', choices: [['64', '64 kbps'], ['128', '128 kbps'], ['192', '192 kbps'], ['256', '256 kbps'], ['320', '320 kbps']] },
    normalize: { key: 'normalize', type: 'toggle', label: 'Normalizar volumen', default: false },
    gifWidth: { key: 'width', type: 'select', label: 'Ancho', default: '480', choices: [['320', '320 px'], ['480', '480 px'], ['640', '640 px']] },
    gifFps: { key: 'fps', type: 'select', label: 'Fotogramas/s', default: '10', choices: [['6', '6 fps'], ['10', '10 fps'], ['12', '12 fps'], ['15', '15 fps']] },
    gifDuration: { key: 'duration', type: 'select', label: 'Duración', default: '10', choices: [['5', 'Primeros 5 s'], ['10', 'Primeros 10 s'], ['30', 'Primeros 30 s'], ['0', 'Completo']] },
    at: { key: 'at', type: 'select', label: 'Momento', default: '0.5', choices: [['0', 'Inicio'], ['0.25', 'Un cuarto'], ['0.5', 'Mitad'], ['0.75', 'Tres cuartos'], ['1', 'Final']] },
    pages: { key: 'pages', type: 'text', label: 'Páginas', placeholder: '1-3,5', default: '' },
    rotate: { key: 'angle', type: 'select', label: 'Giro', default: '90', choices: [['90', '90° a la derecha'], ['180', '180°'], ['270', '90° a la izquierda']] },
    dpi: { key: 'dpi', type: 'select', label: 'Resolución', default: '150', choices: [['72', '72 ppp'], ['150', '150 ppp'], ['300', '300 ppp']] },
  };
  const OUT = {
    'img-webp': { label: 'WebP', ext: 'webp', options: [opt.maxWidth, opt.quality], kind: 'instant', need: 'image/webp' },
    'img-jpeg': { label: 'JPEG', ext: 'jpg', options: [opt.maxWidth, opt.quality], kind: 'instant' },
    'img-png': { label: 'PNG', ext: 'png', options: [opt.maxWidth], kind: 'instant' },
    'img-avif': { label: 'AVIF', ext: 'avif', options: [opt.maxWidth, opt.quality], kind: 'instant', need: 'image/avif' },
    'img-gif': { label: 'GIF', ext: 'gif', options: [opt.maxWidth], kind: 'instant' },
    'img-bmp': { label: 'BMP', ext: 'bmp', options: [opt.maxWidth], kind: 'instant' },
    'img-ico': { label: 'ICO (favicon)', ext: 'ico', options: [opt.icoSize], kind: 'instant' },
    'img-pdf': { label: 'PDF', ext: 'pdf', options: [opt.maxWidth, opt.quality], kind: 'instant' },
    'a-mp3': { label: 'MP3', ext: 'mp3', options: [opt.bitrate, opt.normalize], kind: 'real' },
    'a-wav': { label: 'WAV', ext: 'wav', options: [opt.normalize], kind: 'real' },
    'v-gif': { label: 'GIF animado', ext: 'gif', options: [opt.gifWidth, opt.gifFps, opt.gifDuration], kind: 'real' },
    'v-jpg': { label: 'Fotograma JPG', ext: 'jpg', options: [opt.at], kind: 'instant' },
    'v-png': { label: 'Fotograma PNG', ext: 'png', options: [opt.at], kind: 'instant' },
    'v-mp3': { label: 'Solo audio MP3', ext: 'mp3', options: [opt.bitrate, opt.normalize], kind: 'real' },
    'v-wav': { label: 'Solo audio WAV', ext: 'wav', options: [opt.normalize], kind: 'real' },
    'd-html': { label: 'HTML', ext: 'html', options: [], kind: 'stages' },
    'd-md': { label: 'Markdown', ext: 'md', options: [], kind: 'stages' },
    'd-txt': { label: 'Texto (TXT)', ext: 'txt', options: [], kind: 'stages' },
    's-xlsx': { label: 'XLSX', ext: 'xlsx', options: [], kind: 'stages' },
    's-ods': { label: 'ODS', ext: 'ods', options: [], kind: 'stages' },
    's-csv': { label: 'CSV', ext: 'csv', options: [], kind: 'stages', note: 'Una hoja = un CSV (varias, en ZIP)' },
    's-html': { label: 'HTML', ext: 'html', options: [], kind: 'stages' },
    's-json': { label: 'JSON', ext: 'json', options: [], kind: 'stages' },
    'pdf-extract': { label: 'Extraer páginas', ext: 'pdf', options: [opt.pages], kind: 'real' },
    'pdf-split': { label: 'Separar páginas (ZIP)', ext: 'zip', options: [], kind: 'real' },
    'pdf-rotate': { label: 'Rotar', ext: 'pdf', options: [opt.rotate], kind: 'real' },
    'pdf-jpg': { label: 'Imágenes JPG', ext: 'jpg', options: [opt.dpi], kind: 'real' },
    'pdf-png': { label: 'Imágenes PNG', ext: 'png', options: [opt.dpi], kind: 'real' },
    'pdf-txt': { label: 'Extraer texto (TXT)', ext: 'txt', options: [], kind: 'real' },
    'pdf-merge': { label: 'Unir PDF', ext: 'pdf', options: [], kind: 'real' },
    't-html': { label: 'HTML', ext: 'html', options: [], kind: 'instant' },
    't-docx': { label: 'DOCX', ext: 'docx', options: [], kind: 'instant' },
    't-md': { label: 'Markdown', ext: 'md', options: [], kind: 'instant' },
    't-txt': { label: 'Texto plano', ext: 'txt', options: [], kind: 'instant' },
    'sub-srt': { label: 'SRT', ext: 'srt', options: [], kind: 'instant' },
    'sub-vtt': { label: 'WebVTT', ext: 'vtt', options: [], kind: 'instant' },
    'sub-ass': { label: 'ASS', ext: 'ass', options: [], kind: 'instant' },
  };
  for (const [id, o] of Object.entries(OUT)) o.id = id;
  const FAMILY_OUT = {
    image: ['img-webp', 'img-jpeg', 'img-png', 'img-avif', 'img-gif', 'img-bmp', 'img-ico', 'img-pdf'],
    audio: ['a-mp3', 'a-wav'],
    video: ['v-gif', 'v-jpg', 'v-png', 'v-mp3', 'v-wav'],
    doc: ['d-html', 'd-md', 'd-txt'],
    sheet: ['s-xlsx', 's-ods', 's-csv', 's-html', 's-json'],
    pdf: ['pdf-extract', 'pdf-split', 'pdf-rotate', 'pdf-jpg', 'pdf-png', 'pdf-txt'],
    text: ['t-html', 't-docx', 't-md', 't-txt'],
    subtitle: ['sub-srt', 'sub-vtt', 'sub-ass'],
  };
  const SAME = { webp: 'img-webp', png: 'img-png', gif: 'img-gif', bmp: 'img-bmp', ico: 'img-ico', avif: 'img-avif', mp3: 'a-mp3', wav: 'a-wav',
    xlsx: 's-xlsx', ods: 's-ods', csv: 's-csv', html: 't-html', md: 't-md', txt: 't-txt', srt: 'sub-srt', vtt: 'sub-vtt', ass: 'sub-ass' };
  const DEFAULT = { jpeg: 'img-webp', png: 'img-webp', webp: 'img-jpeg', avif: 'img-jpeg', heic: 'img-jpeg', svg: 'img-png', bmp: 'img-png', ico: 'img-png', gif: 'img-png',
    wav: 'a-mp3', mp3: 'a-wav', video: 'v-gif', doc: 'd-html', sheet: 's-xlsx', xlsx: 's-csv', pdf: 'pdf-jpg', md: 't-docx', html: 't-md', txt: 't-docx', srt: 'sub-vtt', vtt: 'sub-srt', ass: 'sub-srt', ssa: 'sub-srt' };
  async function outputsFor(info) {
    const list = [];
    for (const id of FAMILY_OUT[info.family] || []) {
      if (SAME[info.format] === id) continue;
      if (OUT[id].need && !(await canEncode(OUT[id].need))) continue;
      list.push(OUT[id]);
    }
    return list;
  }

  // ---------------------------------------------------------------- conversores
  function jpegToPdf(jpeg, w, h) {
    let pw = (w * 72) / 96; let ph = (h * 72) / 96;
    const k = Math.min(1, 14400 / Math.max(pw, ph));
    pw = +(pw * k).toFixed(2); ph = +(ph * k).toFixed(2);
    const enc = new TextEncoder();
    const parts = []; const offsets = []; let len = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    push('%PDF-1.4\n');
    const obj = (n, f) => { offsets[n] = len; push(`${n} 0 obj\n`); f(); push('\nendobj\n'); };
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push('\nendstream'); });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = len;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    push(`${x}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  function bmp(imgData) {
    const { width: w, height: h, data } = imgData;
    const row = Math.ceil((w * 3) / 4) * 4;
    const buf = new DataView(new ArrayBuffer(54 + row * h));
    const u8 = new Uint8Array(buf.buffer);
    u8[0] = 0x42; u8[1] = 0x4d; buf.setUint32(2, 54 + row * h, true); buf.setUint32(10, 54, true);
    buf.setUint32(14, 40, true); buf.setInt32(18, w, true); buf.setInt32(22, h, true); buf.setUint16(26, 1, true); buf.setUint16(28, 24, true);
    buf.setUint32(34, row * h, true); buf.setInt32(38, 2835, true); buf.setInt32(42, 2835, true);
    for (let y = 0; y < h; y++) {
      const o = 54 + (h - 1 - y) * row;
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u8[o + x * 3] = data[i + 2]; u8[o + x * 3 + 1] = data[i + 1]; u8[o + x * 3 + 2] = data[i]; }
    }
    return new Blob([u8], { type: 'image/bmp' });
  }
  async function ico(src, sizes) {
    const pngs = [];
    for (const s of sizes) {
      const c = canvasOf(s, s);
      const [w, h] = dims(src); const k = Math.min(s / w, s / h);
      c.getContext('2d').drawImage(src, (s - w * k) / 2, (s - h * k) / 2, w * k, h * k);
      pngs.push(new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()));
    }
    const head = new DataView(new ArrayBuffer(6 + 16 * sizes.length));
    head.setUint16(2, 1, true); head.setUint16(4, sizes.length, true);
    let off = 6 + 16 * sizes.length;
    sizes.forEach((s, i) => {
      const e = 6 + 16 * i;
      head.setUint8(e, s >= 256 ? 0 : s); head.setUint8(e + 1, s >= 256 ? 0 : s); head.setUint16(e + 4, 1, true); head.setUint16(e + 6, 32, true);
      head.setUint32(e + 8, pngs[i].length, true); head.setUint32(e + 12, off, true); off += pngs[i].length;
    });
    return new Blob([head.buffer, ...pngs], { type: 'image/x-icon' });
  }

  async function convImage(job, ctx) {
    const { card, out, o } = job;
    ctx.stage(`Generando ${out.label}`);
    const src = await decodeImage(card.file, card.info.format);
    let [w, h] = dims(src);
    if (card.info.format === 'svg' && w < 1000) { const k = 2000 / w; w = Math.round(w * k); h = Math.round(h * k); }
    const mw = Number(o.maxWidth) || 0;
    if (mw && w > mw) { h = Math.max(1, Math.round((h * mw) / w)); w = mw; }
    if (out.id === 'img-ico') return ico(src, o.icoSize === 'all' ? [16, 32, 48, 64, 128, 256] : [Number(o.icoSize)]);
    const c = canvasOf(w, h);
    const g = c.getContext('2d');
    if (['img-jpeg', 'img-pdf', 'img-bmp'].includes(out.id)) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(src, 0, 0, w, h);
    const q = (Number(o.quality) || 80) / 100;
    switch (out.id) {
      case 'img-jpeg': return toBlob(c, 'image/jpeg', q);
      case 'img-webp': return toBlob(c, 'image/webp', q);
      case 'img-avif': return toBlob(c, 'image/avif', q);
      case 'img-png': return toBlob(c, 'image/png');
      case 'img-bmp': return bmp(g.getImageData(0, 0, w, h));
      case 'img-pdf': return jpegToPdf(new Uint8Array(await (await toBlob(c, 'image/jpeg', q)).arrayBuffer()), w, h);
      case 'img-gif': {
        await lib('gifenc');
        const { quantize, applyPalette, GIFEncoder } = self.gifenc;
        const { data } = g.getImageData(0, 0, w, h);
        const palette = quantize(data, 256);
        const enc = GIFEncoder();
        enc.writeFrame(applyPalette(data, palette), w, h, { palette });
        enc.finish();
        return new Blob([enc.bytes()], { type: 'image/gif' });
      }
      default: throw new UserError('Conversión de imagen no soportada.');
    }
  }

  async function convAudio(job, ctx) {
    const { card, out, o } = job;
    let buf = card.audio;
    if (!buf) { ctx.stage(card.info.family === 'video' ? 'Leyendo el audio del vídeo' : 'Decodificando el audio'); buf = card.audio = await decodeAudio(card.file, card.info.family); }
    ctx.check();
    const chans = [];
    for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) chans.push(buf.getChannelData(i));
    let gain = 1;
    if (o.normalize) {
      let peak = 0;
      for (const ch of chans) for (let i = 0; i < ch.length; i += 2) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
      if (peak > 0) gain = 0.891 / peak; // pico a -1 dBFS
    }
    const rate = buf.sampleRate;
    const total = chans[0].length;
    const t0 = performance.now();
    const report = (done) => {
      const wall = (performance.now() - t0) / 1000;
      const speed = wall > 0.2 ? done / rate / wall : null;
      ctx.progress(done / total, speed ? { speed, eta: (total - done) / rate / speed } : {});
    };
    if (out.ext === 'wav') {
      ctx.stage(o.normalize ? 'Normalizando y escribiendo WAV' : 'Escribiendo WAV');
      const nc = chans.length;
      const data = new DataView(new ArrayBuffer(44 + total * nc * 2));
      const w = (o2, str) => { for (let i = 0; i < str.length; i++) data.setUint8(o2 + i, str.charCodeAt(i)); };
      w(0, 'RIFF'); data.setUint32(4, 36 + total * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true);
      data.setUint16(20, 1, true); data.setUint16(22, nc, true); data.setUint32(24, rate, true); data.setUint32(28, rate * nc * 2, true);
      data.setUint16(32, nc * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, total * nc * 2, true);
      const chunk = rate * 2;
      for (let i = 0; i < total; i += chunk) {
        const e = Math.min(total, i + chunk);
        for (let j = i; j < e; j++) for (let c = 0; c < nc; c++) {
          const v = Math.max(-1, Math.min(1, chans[c][j] * gain));
          data.setInt16(44 + (j * nc + c) * 2, v < 0 ? v * 32768 : v * 32767, true);
        }
        report(e); await tick(); ctx.check();
      }
      return new Blob([data.buffer], { type: 'audio/wav' });
    }
    ctx.stage(o.normalize ? 'Normalizando y codificando MP3' : 'Codificando MP3');
    return new Promise((res, rej) => {
      const worker = new Worker('mp3-worker.js');
      ctx.onCancel(() => { worker.terminate(); rej(canceled()); });
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') report(data.done);
        else if (data.type === 'done') { worker.terminate(); res(new Blob(data.parts, { type: 'audio/mpeg' })); } else { worker.terminate(); rej(new UserError('No se ha podido codificar el MP3.')); }
      };
      worker.onerror = () => { worker.terminate(); rej(new UserError('No se ha podido iniciar el codificador de MP3.')); };
      const l = chans[0].slice();
      const r = chans[1] ? chans[1].slice() : null;
      worker.postMessage({ left: l, right: r, rate, kbps: Number(o.bitrate) || 192, gain }, r ? [l.buffer, r.buffer] : [l.buffer]);
    });
  }

  async function convVideo(job, ctx) {
    const { card, out, o } = job;
    if (out.id === 'v-mp3' || out.id === 'v-wav') return convAudio(job, ctx);
    ctx.stage('Abriendo el vídeo');
    const v = await loadVideo(card.file);
    try {
      if (out.id === 'v-jpg' || out.id === 'v-png') {
        ctx.stage('Capturando el fotograma');
        await seek(v, v.duration * Number(o.at));
        const c = canvasOf(v.videoWidth, v.videoHeight);
        c.getContext('2d').drawImage(v, 0, 0);
        return toBlob(c, out.id === 'v-jpg' ? 'image/jpeg' : 'image/png', 0.92);
      }
      await lib('gifenc');
      const { quantize, applyPalette, GIFEncoder } = self.gifenc;
      const w = Math.min(Number(o.width) || 480, v.videoWidth);
      const h = Math.max(2, Math.round((v.videoHeight * w) / v.videoWidth));
      const fps = Number(o.fps) || 10;
      const dur = Number(o.duration) > 0 ? Math.min(Number(o.duration), v.duration) : v.duration;
      const n = Math.max(1, Math.floor(dur * fps));
      const c = canvasOf(w, h);
      const g = c.getContext('2d', { willReadFrequently: true });
      const enc = GIFEncoder();
      const t0 = performance.now();
      ctx.stage('Generando GIF (una paleta por fotograma)');
      for (let i = 0; i < n; i++) {
        ctx.check();
        await seek(v, i / fps);
        g.drawImage(v, 0, 0, w, h);
        const { data } = g.getImageData(0, 0, w, h);
        const palette = quantize(data, 256);
        enc.writeFrame(applyPalette(data, palette), w, h, { palette, delay: Math.round(1000 / fps) });
        const wall = (performance.now() - t0) / 1000;
        const speed = wall > 0.3 ? ((i + 1) / fps) / wall : null;
        ctx.progress((i + 1) / n, { frame: i + 1, frames: n, speed, eta: speed ? (dur - (i + 1) / fps) / speed : null });
      }
      enc.finish();
      return new Blob([enc.bytes()], { type: 'image/gif' });
    } finally { URL.revokeObjectURL(v.__url); v.removeAttribute('src'); v.load(); }
  }

  async function convDoc(job, ctx) {
    const { card, out } = job;
    ctx.stage('mammoth: leyendo el DOCX');
    await lib('mammoth');
    const arrayBuffer = await card.file.arrayBuffer();
    try {
      if (out.id === 'd-txt') return new Blob([(await self.mammoth.extractRawText({ arrayBuffer })).value], { type: 'text/plain' });
      const html = (await self.mammoth.convertToHtml({ arrayBuffer })).value;
      if (out.id === 'd-html') return new Blob([htmlPage(baseName(card.file.name), html)], { type: 'text/html' });
      ctx.stage('turndown: HTML → Markdown');
      await lib('turndown');
      return new Blob([turndown(html)], { type: 'text/markdown' });
    } catch (err) {
      if (err.user) throw err;
      throw new UserError('El documento DOCX está dañado o no se puede leer.', 'corrupt');
    }
  }

  function csvSep(text) {
    const lines = text.split(/\r?\n/).slice(0, 20).filter(Boolean);
    let best = [0, ','];
    for (const ch of [',', ';', '\t', '|']) {
      const counts = lines.map((l) => l.split(ch).length - 1);
      if (!counts.length || !counts[0]) continue;
      const score = counts.filter((c) => c === counts[0]).length * 100 + counts[0];
      if (score > best[0]) best = [score, ch];
    }
    return best[1];
  }
  async function convSheet(job, ctx) {
    const { card, out } = job;
    ctx.stage('SheetJS: leyendo la hoja de cálculo');
    await lib('xlsx');
    const X = self.XLSX;
    let wb;
    try {
      if (['csv', 'tsv'].includes(card.info.format)) {
        const text = decodeText(new Uint8Array(await card.file.arrayBuffer())).replace(/^\uFEFF/, '');
        wb = X.read(text, { type: 'string', FS: card.info.format === 'tsv' ? '\t' : csvSep(text), raw: false });
      } else wb = X.read(new Uint8Array(await card.file.arrayBuffer()), { type: 'array' });
    } catch {
      throw new UserError('La hoja de cálculo está dañada o protegida con contraseña.', 'corrupt');
    }
    ctx.check();
    ctx.stage(`SheetJS: generando ${out.label}`);
    const base = baseName(card.file.name);
    if (out.id === 's-xlsx') return new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })]);
    if (out.id === 's-ods') {
      // El estándar ODF exige que «mimetype» sea la primera entrada y sin comprimir: se reempaqueta.
      await lib('fflate');
      const parts = self.fflate.unzipSync(new Uint8Array(X.write(wb, { bookType: 'ods', type: 'array' })));
      const ordered = { mimetype: [parts.mimetype || new TextEncoder().encode('application/vnd.oasis.opendocument.spreadsheet'), { level: 0 }] };
      for (const [k, v] of Object.entries(parts)) if (k !== 'mimetype') ordered[k] = [v, { level: 6 }];
      return new Blob([self.fflate.zipSync(ordered)]);
    }
    if (out.id === 's-csv') {
      const csvs = wb.SheetNames.map((n) => [n, X.utils.sheet_to_csv(wb.Sheets[n])]);
      if (csvs.length === 1) return new Blob(['\uFEFF' + csvs[0][1]], { type: 'text/csv' });
      return zipFiles(csvs.map(([n, c]) => [`${base}-${n.replace(/[\\/:*?"<>|]/g, '_')}.csv`, new Blob(['\uFEFF' + c])]), `${base}.zip`, ctx);
    }
    if (out.id === 's-html') {
      const body = wb.SheetNames.map((n) => `<h2>${esc(n)}</h2>${X.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })}`).join('\n');
      return new Blob([htmlPage(base, body, 'table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}')], { type: 'text/html' });
    }
    const json = {};
    for (const n of wb.SheetNames) json[n] = X.utils.sheet_to_json(wb.Sheets[n], { defval: null });
    return new Blob([JSON.stringify(wb.SheetNames.length === 1 ? json[wb.SheetNames[0]] : json, null, 2)], { type: 'application/json' });
  }

  // "1-3,5" validado contra el número de páginas.
  function parsePages(spec, total) {
    const s = String(spec || '').replace(/\s+/g, '');
    if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(s)) throw new UserError('Escribe las páginas como en "1-3,5": números y rangos separados por comas.', 'invalid');
    const out = [];
    for (const part of s.split(',')) {
      const [a, b] = part.split('-').map(Number);
      const hi = b === undefined ? a : b;
      if (a < 1 || hi < a) throw new UserError(`El rango "${part}" no es válido.`, 'invalid');
      if (hi > total) throw new UserError(`Ese PDF solo tiene ${total} página${total === 1 ? '' : 's'}: no existe la página ${hi}.`, 'invalid');
      for (let p = a; p <= hi; p++) out.push(p - 1);
    }
    return out;
  }
  async function loadPdfLib(file) {
    await lib('pdflib');
    try { return await self.PDFLib.PDFDocument.load(await file.arrayBuffer()); } catch (err) {
      if (/encrypt/i.test(String(err && err.message))) throw new UserError('El PDF está protegido con contraseña. Quítale la contraseña y vuelve a añadirlo.', 'protected');
      throw new UserError('El PDF está dañado y no se puede leer.', 'corrupt');
    }
  }
  async function convPdf(job, ctx) {
    const { card, out, o } = job;
    const base = baseName(card.file.name);
    const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });
    if (out.id === 'pdf-merge') {
      ctx.stage(`pdf-lib: uniendo ${job.inputs.length} PDF`);
      const { PDFDocument } = (await lib('pdflib'), self.PDFLib);
      const doc = await PDFDocument.create();
      for (let i = 0; i < job.inputs.length; i++) {
        ctx.check();
        const src = await loadPdfLib(job.inputs[i].file);
        (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
        ctx.progress((i + 1) / job.inputs.length, { detail: `PDF ${i + 1} de ${job.inputs.length}` });
        await tick();
      }
      return pdfBlob(await doc.save());
    }
    if (out.id === 'pdf-extract' || out.id === 'pdf-split' || out.id === 'pdf-rotate') {
      ctx.stage('pdf-lib: leyendo el PDF');
      const src = await loadPdfLib(card.file);
      const { PDFDocument, degrees } = self.PDFLib;
      const total = src.getPageCount();
      if (out.id === 'pdf-extract') {
        const idx = parsePages(o.pages, total);
        ctx.stage('pdf-lib: extrayendo páginas');
        const doc = await PDFDocument.create();
        (await doc.copyPages(src, idx)).forEach((p) => doc.addPage(p));
        ctx.progress(1, { detail: `${idx.length} página${idx.length === 1 ? '' : 's'}` });
        return pdfBlob(await doc.save());
      }
      if (out.id === 'pdf-rotate') {
        ctx.stage('pdf-lib: rotando páginas');
        src.getPages().forEach((p, i) => { p.setRotation(degrees((p.getRotation().angle + Number(o.angle)) % 360)); ctx.progress((i + 1) / total, { page: i + 1, pages: total }); });
        return pdfBlob(await src.save());
      }
      if (total === 1) return { blob: pdfBlob(await src.save()), name: `${base}.pdf` };
      ctx.stage('pdf-lib: separando páginas');
      const files = [];
      for (let i = 0; i < total; i++) {
        ctx.check();
        const doc = await PDFDocument.create();
        doc.addPage((await doc.copyPages(src, [i]))[0]);
        files.push([`${base}-pagina-${String(i + 1).padStart(String(total).length, '0')}.pdf`, pdfBlob(await doc.save())]);
        ctx.progress((i + 1) / total, { page: i + 1, pages: total });
        await tick();
      }
      return zipFiles(files, `${base}-paginas.zip`, ctx);
    }
    // pdf.js: imágenes y texto, página a página (progreso real).
    ctx.stage('pdf.js: abriendo el PDF');
    const pdf = await openPdf(card.file);
    const total = pdf.numPages;
    try {
      if (out.id === 'pdf-txt') {
        ctx.stage('pdf.js: extrayendo el texto');
        const pages = [];
        for (let p = 1; p <= total; p++) {
          ctx.check();
          const tc = await (await pdf.getPage(p)).getTextContent();
          let lastY = null; let line = ''; const lines = [];
          for (const it of tc.items) {
            const y = it.transform ? Math.round(it.transform[5]) : lastY;
            if (lastY !== null && y !== lastY) { lines.push(line); line = ''; }
            line += it.str; lastY = y;
            if (it.hasEOL) { lines.push(line); line = ''; lastY = null; }
          }
          if (line) lines.push(line);
          pages.push(lines.join('\n').replace(/\n{3,}/g, '\n\n'));
          ctx.progress(p / total, { page: p, pages: total });
        }
        return new Blob([pages.join('\n\n\f')], { type: 'text/plain' });
      }
      const isJpg = out.id === 'pdf-jpg';
      const scale = Number(o.dpi) / 72;
      ctx.stage(`pdf.js: renderizando páginas a ${o.dpi} ppp`);
      const files = [];
      for (let p = 1; p <= total; p++) {
        ctx.check();
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        const c = canvasOf(Math.round(vp.width), Math.round(vp.height));
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        files.push([`${base}-${String(p).padStart(3, '0')}.${out.ext}`, await toBlob(c, isJpg ? 'image/jpeg' : 'image/png', 0.9)]);
        ctx.progress(p / total, { page: p, pages: total });
      }
      if (files.length === 1) return { blob: files[0][1], name: `${base}.${out.ext}` };
      return zipFiles(files, `${base}-${out.ext}.zip`, ctx);
    } finally { pdf.destroy(); }
  }

  // ---------------------------------------------------------------- texto (Markdown/HTML/TXT) y DOCX propio
  const baseName = (n) => (String(n).replace(/\.[^.]{1,10}$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'archivo');
  const htmlPage = (title, body, css = '') => `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px}img{max-width:100%}${css}</style></head><body>\n${body}\n</body></html>\n`;
  function turndown(html) {
    const td = new self.TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    return td.turndown(html);
  }
  const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Markdown -> bloques sencillos -> DOCX (WordprocessingML mínimo, con estilos de título reales).
  function mdBlocks(md) {
    const blocks = [];
    const inline = (tokens, fmt = {}) => {
      const runs = [];
      for (const t of tokens || []) {
        if (t.type === 'strong') runs.push(...inline(t.tokens, { ...fmt, b: true }));
        else if (t.type === 'em') runs.push(...inline(t.tokens, { ...fmt, i: true }));
        else if (t.type === 'codespan') runs.push({ text: t.text, ...fmt, code: true });
        else if (t.type === 'link') runs.push(...inline(t.tokens, { ...fmt, u: true }));
        else if (t.type === 'br') runs.push({ text: '\n', ...fmt });
        else if (t.tokens) runs.push(...inline(t.tokens, fmt));
        else if (t.type === 'image') runs.push({ text: t.text ? `[${t.text}]` : '', ...fmt, i: true });
        else runs.push({ text: decodeEntities(t.text || t.raw || ''), ...fmt });
      }
      return runs;
    };
    const walk = (tokens, quote = false) => {
      for (const t of tokens) {
        if (t.type === 'heading') blocks.push({ style: `Heading${Math.min(6, t.depth)}`, runs: inline(t.tokens) });
        else if (t.type === 'paragraph' || t.type === 'text') blocks.push({ style: quote ? 'Quote' : null, runs: inline(t.tokens || [{ type: 'text', text: t.text }]) });
        else if (t.type === 'list') t.items.forEach((it, i) => blocks.push({ style: 'List', prefix: t.ordered ? `${(Number(t.start) || 1) + i}. ` : '• ', runs: inline((it.tokens || []).flatMap((x) => x.tokens || [x])) }));
        else if (t.type === 'code') t.text.split('\n').forEach((l) => blocks.push({ style: 'Code', runs: [{ text: l, code: true }] }));
        else if (t.type === 'blockquote') walk(t.tokens, true);
        else if (t.type === 'table') {
          blocks.push({ style: null, runs: t.header.flatMap((c, i) => [...(i ? [{ text: ' | ' }] : []), ...inline(c.tokens, { b: true })]) });
          t.rows.forEach((r) => blocks.push({ style: null, runs: r.flatMap((c, i) => [...(i ? [{ text: ' | ' }] : []), ...inline(c.tokens)]) }));
        } else if (t.type === 'hr') blocks.push({ style: null, runs: [{ text: '———' }] });
      }
    };
    walk(self.marked.lexer(md));
    return blocks;
  }
  function decodeEntities(s) { const t = d.createElement('textarea'); t.innerHTML = s; return t.value; }
  async function docx(blocks) {
    await lib('fflate');
    const run = (r) => {
      const pr = `${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}${r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F2F4F7"/>' : ''}`;
      return String(r.text).split('\n').map((t, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`).join('');
    };
    const body = blocks.map((bl) => `<w:p>${bl.style ? `<w:pPr><w:pStyle w:val="${bl.style}"/></w:pPr>` : ''}${bl.prefix ? run({ text: bl.prefix }) : ''}${bl.runs.map(run).join('')}</w:p>`).join('');
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const h = (n, sz) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${h(1, 36)}${h(2, 30)}${h(3, 26)}${h(4, 24)}${h(5, 22)}${h(6, 22)}<w:style w:type="paragraph" w:styleId="List"><w:name w:val="List"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style></w:styles>`;
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
      'word/styles.xml': styles,
    };
    const enc = new TextEncoder();
    const zip = self.fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc.encode(v)])));
    return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function htmlText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
    doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,br,section,article,blockquote,pre').forEach((n) => n.append('\n'));
    return (doc.body ? doc.body.textContent : '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  const mdEscape = (s) => s.replace(/([\\`*_[\]#<>|])/g, '\\$1').replace(/^(\s*)([-+]|\d+\.)\s/gm, '$1\\$2 ');
  async function convText(job, ctx) {
    const { card, out } = job;
    const src = decodeText(new Uint8Array(await card.file.arrayBuffer())).replace(/^\uFEFF/, '');
    const fmt = card.info.format;
    const title = baseName(card.file.name);
    ctx.stage(`Convirtiendo a ${out.label}`);
    let md;
    if (fmt === 'md') md = src;
    else if (fmt === 'html') { await lib('turndown'); md = turndown(src); } else md = mdEscape(src).replace(/\n(?!\n)/g, '  \n');
    if (out.id === 't-md') return new Blob([md], { type: 'text/markdown' });
    if (out.id === 't-txt') {
      if (fmt === 'html') return new Blob([htmlText(src)], { type: 'text/plain' });
      await lib('marked');
      return new Blob([htmlText(self.marked.parse(md))], { type: 'text/plain' });
    }
    await lib('marked');
    if (out.id === 't-html') {
      const body = fmt === 'txt' ? src.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n') : self.marked.parse(md);
      return new Blob([htmlPage(title, body)], { type: 'text/html' });
    }
    return docx(mdBlocks(md));
  }

  // ---------------------------------------------------------------- subtítulos (SRT, WebVTT, ASS/SSA)
  function parseTime(t) {
    const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/.exec(t.trim());
    if (!m) return NaN;
    return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
  }
  function parseSubs(text, fmt) {
    const cues = [];
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (fmt === 'ass' || fmt === 'ssa') {
      let fields = null;
      for (const line of text.split('\n')) {
        if (/^Format:/i.test(line) && fields === null && /Start/i.test(line) && /Text/i.test(line)) fields = line.slice(7).split(',').map((s) => s.trim().toLowerCase());
        const m = /^Dialogue:\s*(.*)$/i.exec(line);
        if (!m || !fields) continue;
        const parts = m[1].split(',');
        const ti = fields.indexOf('text');
        const get = (k) => (parts[fields.indexOf(k)] || '').trim();
        const txt = parts.slice(ti).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ');
        const parseAss = (t) => { const x = /(\d+):(\d{2}):(\d{2})[.:](\d{2})/.exec(t); return x ? Number(x[1]) * 3600 + Number(x[2]) * 60 + Number(x[3]) + Number(x[4]) / 100 : NaN; };
        const s = parseAss(get('start')); const e = parseAss(get('end'));
        if (Number.isFinite(s) && Number.isFinite(e)) cues.push({ start: s, end: e, text: txt.trim() });
      }
      return cues;
    }
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i < 0) continue;
      const [a, b] = lines[i].split('-->');
      const s = parseTime(a); const e = parseTime(b.split(/\s+/).filter(Boolean)[0] || '');
      if (Number.isFinite(s) && Number.isFinite(e)) cues.push({ start: s, end: e, text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, (t) => (/^<\/?[biu]>$/i.test(t) ? t : '')) });
    }
    return cues;
  }
  function fmtTime(t, sep, hours = true) {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000);
    return `${hours ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
  }
  async function convSubs(job, ctx) {
    const { card, out } = job;
    ctx.stage(`Convirtiendo a ${out.label}`);
    const cues = parseSubs(decodeText(new Uint8Array(await card.file.arrayBuffer())), card.info.format);
    if (!cues.length) throw new UserError('El archivo de subtítulos no tiene ningún subtítulo válido.', 'corrupt');
    let s;
    if (out.id === 'sub-srt') s = cues.map((c, i) => `${i + 1}\n${fmtTime(c.start, ',')} --> ${fmtTime(c.end, ',')}\n${c.text}\n`).join('\n');
    else if (out.id === 'sub-vtt') s = `WEBVTT\n\n${cues.map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${c.text}\n`).join('\n')}`;
    else {
      const t = (x) => { const cs = Math.round(x * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
      s = `[Script Info]\nScriptType: v4.00+\nPlayResX: 384\nPlayResY: 288\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,16,&Hffffff,&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,0\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cues.map((c) => `Dialogue: 0,${t(c.start)},${t(c.end)},Default,,0,0,0,,${c.text.replace(/<\/?[biu]>/gi, '').replace(/\n/g, '\\N')}`).join('\n')}\n`;
    }
    return new Blob([s], { type: 'text/plain' });
  }

  const ENGINE = { image: convImage, audio: convAudio, video: convVideo, doc: convDoc, sheet: convSheet, pdf: convPdf, text: convText, subtitle: convSubs };

  // ---------------------------------------------------------------- cola local: como mucho 2 a la vez
  const queue = [];
  let active = 0;
  function enqueue(job) { queue.push(job); pump(); }
  function pump() {
    while (active < 2 && queue.length) {
      const job = queue.shift();
      active++;
      job.start().finally(() => { active--; pump(); });
    }
    queue.forEach((j, i) => j.card.queued(i + 1, queue.length, active));
  }
  function dequeue(job) { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); pump(); return true; } return false; }

  // ---------------------------------------------------------------- herramienta
  const tool = $('#herramienta');
  const drop = $('#drop');
  const pick = $('#pick');
  const list = $('#cards');
  const mergeBox = $('#merge');
  const allBtn = $('#all');
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const cards = [];
  const PREVIEW = /^image\/(jpeg|png|webp|gif|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)$/;
  const FAM_ICON = { image: 'image', audio: 'audio', video: 'video', doc: 'doc', sheet: 'doc', pdf: 'pdf', text: 'text', subtitle: 'subtitle' };

  function dropText() {
    const has = cards.length > 0;
    tool.classList.toggle('has', has);
    $('.drop-main', drop).textContent = touch ? (has ? 'Toca para añadir más archivos' : 'Toca para añadir tus archivos') : (has ? 'Suelta aquí más archivos' : 'Suelta aquí tus archivos');
    $('.drop-sub', drop).textContent = touch ? 'Fotos, vídeos, audio, documentos…' : 'o pulsa para elegirlos';
  }
  dropText();
  const openPicker = () => pick.click();
  drop.addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => { if (location.hash && VIEWS[location.hash.slice(1)]) location.hash = 'herramienta'; tool.scrollIntoView({ behavior: 'smooth', block: 'start' }); openPicker(); }));
  pick.addEventListener('change', () => { addFiles(pick.files); pick.value = ''; });

  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; d.body.classList.add('dragging'); });
  addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) d.body.classList.remove('dragging'); });
  addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; d.body.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
  addEventListener('paste', (e) => { const files = e.clipboardData ? [...e.clipboardData.files] : []; if (files.length) { e.preventDefault(); addFiles(files); } });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const act = cards.filter((c) => ['queued', 'running'].includes(c.state));
    if (!act.length) return;
    act.forEach((c) => c.cancel());
    toast(act.length === 1 ? 'Cancelado' : `${act.length} conversiones canceladas`);
  });
  allBtn.addEventListener('click', () => cards.filter((c) => c.state === 'ready').forEach((c) => c.convert()));
  $('#merge-go').addEventListener('click', () => {
    const pdfs = cards.filter((c) => c.info && c.info.family === 'pdf' && !c.merge && ['ready', 'done'].includes(c.state));
    if (pdfs.length >= 2) { new Card({ name: 'unido.pdf', size: pdfs.reduce((s, c) => s + c.file.size, 0), type: 'application/pdf' }, pdfs); dropText(); refresh(); }
  });

  function addFiles(files) {
    const arr = [...(files || [])];
    if (!arr.length) return;
    if (location.hash && VIEWS[location.hash.slice(1)]) location.hash = 'herramienta';
    arr.forEach((f) => new Card(f));
    dropText(); refresh();
  }
  function refresh() {
    const pdfs = cards.filter((c) => c.info && c.info.family === 'pdf' && !c.merge && ['ready', 'done'].includes(c.state));
    mergeBox.hidden = pdfs.length < 2;
    $('#merge-n').textContent = pdfs.length;
    const n = cards.filter((c) => c.state === 'ready').length;
    allBtn.disabled = !n;
    allBtn.textContent = n > 1 ? `Convertir todo (${n})` : 'Convertir todo';
  }

  const TPL = `<div class="c-head"><div class="thumb"></div><div class="c-meta"><p class="c-name"></p><p class="c-info"></p><p class="c-note" hidden></p></div><button class="x" type="button" aria-label="Quitar">${icon('x')}</button></div>
<div class="c-body" hidden><div><p class="lbl">Convertir a</p><div class="targets" role="radiogroup"></div></div><div class="opts"></div><p class="note" hidden></p><div class="c-act"><button class="btn go" type="button"></button></div></div>
<div class="prog" hidden><div class="p-row"><span class="p-lbl"></span><span class="p-num"></span></div><div class="track"><div class="fill"></div></div><div class="p-sub"><span class="p-det"></span><button type="button" class="cx">Cancelar</button></div></div>
<div class="done" hidden><p class="save"></p><p class="zipnote" hidden></p><div class="c-act"><button class="btn btn-ok dl" type="button">${icon('dl')}<span></span></button><button class="btn btn-o again" type="button">Otra conversión</button></div></div>
<p class="err" role="alert" hidden></p>`;

  let uid = 0;
  class Card {
    constructor(file, merge) {
      this.id = ++uid;
      this.file = file;
      this.merge = merge || null;
      this.state = 'new';
      this.info = null;
      this.target = null;
      this.vals = {};
      const el = this.el = d.createElement('li');
      el.className = 'card';
      el.innerHTML = TPL;
      this.$ = (s) => $(s, el);
      this.$('.c-name').textContent = file.name;
      this.$('.x').addEventListener('click', () => this.remove());
      this.$('.cx').addEventListener('click', () => this.cancel());
      this.$('.go').addEventListener('click', () => this.convert());
      this.$('.again').addEventListener('click', () => this.ready());
      this.$('.dl').addEventListener('click', () => { if (this.result) saveFile(this.result.blob, this.result.name); });
      const fill = this.$('.fill');
      const num = this.$('.p-num');
      this.showNum = false;
      this.bar = new Spring((x) => {
        const v = Math.max(0, Math.min(1, x));
        fill.style.transform = `scaleX(${v})`;
        if (this.showNum) num.textContent = `${Math.floor(v * 100)} %`;
      });
      list.append(el);
      cards.push(this);
      if (merge) {
        this.info = { family: 'pdf', format: 'pdf', label: 'PDF unido', size: file.size, meta: {} };
        this.setIcon('pdf', 'PDF');
        this.$('.c-info').textContent = `Unión de ${merge.length} PDF · ${bytes(file.size)}`;
        this.out = OUT['pdf-merge'];
        this.run({ card: this, out: OUT['pdf-merge'], o: {}, inputs: merge });
        return;
      }
      this.setIcon(null, (file.name.split('.').pop() || '').slice(0, 5));
      if (PREVIEW.test(file.type)) this.setThumb(URL.createObjectURL(file));
      this.analyze();
    }

    setIcon(family, ext) {
      const t = this.$('.thumb');
      t.className = 'thumb';
      t.innerHTML = `${icon(FAM_ICON[family] || 'doc')}${ext ? `<small>${esc(String(ext).toUpperCase())}</small>` : ''}`;
    }
    setThumb(src) {
      const t = this.$('.thumb');
      const img = new Image();
      img.alt = '';
      img.onload = () => { t.className = 'thumb'; t.replaceChildren(img); this.thumbOk = true; };
      img.src = src;
      (this.urls ||= []).push(src);
    }
    setWave(pk) {
      const t = this.$('.thumb');
      let p = '';
      pk.forEach((v, i) => { const h = Math.max(0.6, v * 18); p += `M${i + 0.15} ${20 - h}h.7v${2 * h}h-.7z`; });
      t.className = 'thumb audio';
      t.innerHTML = `<svg class="wave" viewBox="0 0 ${pk.length} 40" preserveAspectRatio="none"><path d="${p}"/></svg>`;
    }
    infoLine() {
      const i = this.info; const m = i.meta || {};
      const parts = [['image', 'audio', 'video'].includes(i.family) ? `${FAMILY_LABEL[i.family]} ${i.label}` : i.family === 'pdf' ? 'PDF' : `${FAMILY_LABEL[i.family]} · ${i.label}`];
      if (m.duration) parts.push(clock(m.duration));
      if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
      if (m.pages) parts.push(`${m.pages} página${m.pages === 1 ? '' : 's'}`);
      if (m.cues) parts.push(`${m.cues} subtítulos`);
      parts.push(bytes(this.file.size));
      return parts.join(' · ');
    }

    async analyze() {
      this.state = 'analyzing';
      this.indet('Analizando el archivo…', 'Mirando qué es por dentro', false);
      this.$('.cx').hidden = true;
      try {
        this.info = await analyze(this);
      } catch (err) {
        return this.fail(err.user ? err.message : 'No hemos podido leer el archivo. Puede estar dañado.');
      }
      if (this.removed) return;
      const i = this.info;
      this.$('.c-info').textContent = this.infoLine();
      if (i.note) { const n = this.$('.c-note'); n.textContent = i.note; n.hidden = false; }
      if (i.meta.waveform) this.setWave(i.meta.waveform);
      else if (i.meta.thumb) this.setThumb(i.meta.thumb);
      else if (!this.thumbOk) this.setIcon(i.family, i.format);
      i.outputs = await outputsFor(i);
      const pref = DEFAULT[i.format] || DEFAULT[i.family];
      this.target = (i.outputs.find((o) => o.id === pref) || i.outputs[0]).id;
      const tg = this.$('.targets');
      tg.innerHTML = i.outputs.map((o) => `<button type="button" class="t" role="radio" data-id="${o.id}" aria-checked="${o.id === this.target}">${esc(o.label)}</button>`).join('');
      tg.addEventListener('click', (e) => {
        const b = e.target.closest('.t');
        if (!b) return;
        this.saveVals();
        this.target = b.dataset.id;
        $$('.t', tg).forEach((x) => x.setAttribute('aria-checked', x === b));
        this.renderOpts();
      });
      this.renderOpts();
      this.ready();
    }

    renderOpts() {
      const o = OUT[this.target];
      const v = this.vals[o.id] || {};
      const box = this.$('.opts');
      box.innerHTML = o.options.map((op) => {
        const val = v[op.key] !== undefined ? v[op.key] : op.default;
        const id = `o${this.id}-${op.key}`;
        if (op.type === 'select') return `<label class="opt" for="${id}">${esc(op.label)}<select id="${id}" data-k="${op.key}">${op.choices.map(([k, l]) => `<option value="${esc(k)}"${String(val) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        if (op.type === 'range') return `<label class="opt" for="${id}"><span>${esc(op.label)}<output>${val}</output></span><input type="range" id="${id}" data-k="${op.key}" min="${op.min}" max="${op.max}" step="${op.step}" value="${val}"></label>`;
        if (op.type === 'toggle') return `<label class="sw" for="${id}"><input type="checkbox" id="${id}" data-k="${op.key}"${val ? ' checked' : ''}>${esc(op.label)}</label>`;
        return `<label class="opt" for="${id}">${esc(op.label)}<input type="text" id="${id}" data-k="${op.key}" value="${esc(val || '')}" placeholder="${esc(op.placeholder || '')}" inputmode="numeric" autocomplete="off"></label>`;
      }).join('');
      $$('input[type=range]', box).forEach((r) => r.addEventListener('input', () => { r.previousElementSibling.querySelector('output').textContent = r.value; }));
      const note = this.$('.note');
      const pages = this.info.meta && this.info.meta.pages;
      const zipped = !ALLOWED.has(o.ext) ? `Se guarda dentro de un ZIP: Claude no deja guardar archivos .${o.ext} sueltos.` : '';
      note.textContent = [o.note, o.id === 'pdf-extract' && pages ? `Este PDF tiene ${pages} página${pages === 1 ? '' : 's'}. Ejemplo: 1-3,5` : '', zipped].filter(Boolean).join(' · ');
      note.hidden = !note.textContent;
      this.$('.go').textContent = this.info.family === 'pdf' ? o.label : `Convertir a ${o.label}`;
    }
    saveVals() {
      if (!this.target) return {};
      const v = {};
      $$('[data-k]', this.$('.opts')).forEach((x) => { v[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; });
      this.vals[this.target] = v;
      return v;
    }
    show(part) { for (const p of ['c-body', 'prog', 'done']) this.$(`.${p}`).hidden = p !== part; }
    ready() {
      this.state = 'ready';
      this.show('c-body');
      refresh();
    }
    prog(label, frac, det) {
      this.show('prog');
      this.$('.prog').className = 'prog';
      this.$('.track').hidden = false;
      this.$('.p-lbl').textContent = label;
      this.$('.p-det').textContent = det || '';
      this.$('.cx').hidden = false;
      this.showNum = true;
      if (frac !== null) this.bar.to(frac);
    }
    indet(label, det, noBar) {
      this.show('prog');
      this.$('.prog').className = 'prog indet';
      this.$('.track').hidden = !!noBar;
      this.$('.p-lbl').textContent = label;
      this.$('.p-det').textContent = det || '';
      this.$('.cx').hidden = false;
      this.showNum = false;
      this.$('.p-num').textContent = '';
    }
    queued(pos, waiting, running) {
      this.indet(`En cola · ${pos}º de ${waiting}`, running ? `Hay ${running} conversión${running === 1 ? '' : 'es'} en marcha delante` : 'Empieza enseguida');
      this.$('.prog').className = 'prog queue';
    }

    convert() {
      if (this.state !== 'ready') return;
      const out = OUT[this.target];
      const o = this.saveVals();
      if (out.id === 'pdf-extract') {
        try { parsePages(o.pages, this.info.meta.pages); } catch (err) { this.error(err.message); return; }
      }
      this.run({ card: this, out, o });
    }
    run(job) {
      this.$('.err').hidden = true;
      this.state = 'queued';
      this.bar.snap(0);
      this.out = job.out;
      const ac = { aborted: false, cbs: [] };
      job.ac = ac;
      this.job = job;
      job.start = async () => {
        if (ac.aborted) return;
        this.state = 'running';
        this.had = false;
        const kind = job.out.kind;
        let stage = { label: 'Preparando', index: null, count: null };
        const ctx = {
          check: () => { if (ac.aborted) throw canceled(); },
          onCancel: (f) => ac.cbs.push(f),
          stage: (label) => {
            stage = { label };
            if (kind === 'real' && !this.had) this.prog(label, 0, 'Calculando…');
            else if (kind === 'real') this.indet(label, '');
            else this.indet(label, kind === 'instant' ? '' : 'Este paso no informa de su avance: no inventamos un porcentaje', kind === 'instant');
          },
          progress: (frac, x = {}) => {
            this.had = true;
            let det = '';
            if (x.pages) det = `Página ${x.page} de ${x.pages}`;
            else if (x.frames) det = `Fotograma ${x.frame} de ${x.frames}`;
            else if (x.detail) det = x.detail;
            if (x.speed) det = [det, `${nf1.format(x.speed)}×${x.eta != null ? ` · quedan ${left(x.eta)}` : ''}`].filter(Boolean).join(' · ');
            this.prog(stage.label, frac, det);
          },
        };
        ctx.stage('Preparando');
        await tick();
        try {
          let res = await ENGINE[job.card.info.family](job, ctx);
          ctx.check();
          if (res instanceof Blob) res = { blob: res, name: `${baseName(job.out.id === 'pdf-merge' ? 'unido' : this.file.name)}.${job.out.ext}` };
          const packed = await packForSave(res.blob, res.name, /\.(mp3|ico)$/.test(res.name) ? 0 : 6);
          this.finish(packed, res.blob.size);
        } catch (err) {
          if (ac.aborted || (err && err.code === 'canceled')) return;
          if (!err.user) console.error(err);
          const msg = err.user ? err.message : 'La conversión ha fallado por un problema inesperado. Prueba con otro formato o con otro archivo.';
          if (this.merge) this.fail(msg); else { this.ready(); this.error(msg); }
        }
      };
      enqueue(job);
      refresh();
    }
    finish(res, innerSize) {
      if (this.result && this.result.thumb) URL.revokeObjectURL(this.result.thumb);
      this.result = res;
      this.state = 'done';
      this.bar.to(1);
      this.show('done');
      $('span', this.$('.dl')).textContent = `Guardar ${res.name.length > 28 ? `${res.name.slice(0, 18)}…${res.name.slice(-8)}` : res.name}`;
      this.$('.again').hidden = !!this.merge;
      const zn = this.$('.zipnote');
      zn.hidden = !res.zipped;
      zn.textContent = res.zipped ? 'Va dentro de un ZIP porque Claude no deja guardar ese tipo de archivo suelto.' : '';
      const save = this.$('.save');
      const before = this.file.size;
      const after = innerSize;
      save.className = `save${after > before ? ' more' : ''}`;
      save.innerHTML = `<b class="b1">${bytes(before)}</b><span class="ar">→</span><b class="b2">${bytes(before)}</b><span class="pct"></span>`;
      const b2 = $('.b2', save);
      new Spring((x) => { b2.textContent = bytes(Math.round(x)); }, before, 40).to(after);
      $('.pct', save).textContent = !before ? '' : after <= before ? `· un ${Math.round((1 - after / before) * 100)} % menos` : `· un ${Math.round((after / before - 1) * 100)} % más`;
      refresh();
    }
    error(msg) { const e = this.$('.err'); e.textContent = msg; e.hidden = false; }
    fail(msg) {
      this.state = 'failed';
      this.show(null);
      this.error(msg);
      if (!this.info) this.setIcon(null, '!');
      refresh();
    }
    cancel() {
      if (!this.job || !['queued', 'running'].includes(this.state)) return;
      const job = this.job;
      job.ac.aborted = true;
      job.ac.cbs.forEach((f) => { try { f(); } catch { /* nada */ } });
      dequeue(job);
      if (this.merge) return this.remove(true);
      this.ready();
    }
    remove(quiet) {
      if (this.removed) return;
      this.removed = true;
      if (['queued', 'running'].includes(this.state)) this.cancel();
      (this.urls || []).forEach((u) => URL.revokeObjectURL(u));
      if (this.info && this.info.meta && this.info.meta.thumb) URL.revokeObjectURL(this.info.meta.thumb);
      this.audio = null; this.result = null;
      cards.splice(cards.indexOf(this), 1);
      this.el.classList.add('out');
      setTimeout(() => { this.el.remove(); dropText(); }, 280);
      refresh();
      if (!quiet) toast('Archivo quitado');
    }
  }
})();
