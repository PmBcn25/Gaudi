// Prueba al menos una vez CADA formato de salida, comprobando la cabecera mágica del
// resultado (y, en audio/vídeo, el códec real con ffprobe).
// Uso: BASE_URL=https://… RESTART_CMD='scripts/vps.sh systemctl restart convertia-web' node tests/formats.mjs
import { runCases, codec, zipList } from './runner.mjs';

const noLeak = (buf) => {
  const t = buf.toString('utf8');
  if (/root:x:0:0|\/bin\/bash|\/usr\/sbin\/nologin/.test(t)) throw new Error('¡el resultado contiene /etc/passwd!');
  return 'sin fugas de archivos del servidor';
};
const pages = (n) => (buf) => {
  const c = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (n && c !== n) throw new Error(`${c} páginas, se esperaban ${n}`);
  return `${c} páginas`;
};
const zipOf = (n, ext) => (buf) => {
  const names = zipList(buf);
  if (names.length !== n || !names.every((x) => x.endsWith(ext))) throw new Error(`ZIP con ${names.join(', ')}`);
  return `ZIP con ${n} ${ext}`;
};
const icoCount = (buf) => { const n = buf.readUInt16LE(4); if (n !== 6) throw new Error(`${n} tamaños`); return '6 tamaños (16–256 px)'; };
const animated = (buf) => {
  let frames = 0;
  for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9) frames++;
  if (frames < 2) throw new Error('el GIF no está animado');
  return `${frames} fotogramas`;
};
const contains = (s) => (buf) => { if (!buf.toString('utf8').includes(s)) throw new Error(`no contiene "${s}"`); return `contiene "${s}"`; };

const cases = [
  // ---------------- imágenes
  { name: 'jpg-a-jxl', file: 'photo.jpg', target: 'img-jxl', magic: 'jxl' },
  { name: 'jpg-a-ico', file: 'photo.jpg', target: 'img-ico', magic: 'ico', check: icoCount },
  { name: 'jpg-a-bmp', file: 'photo.jpg', target: 'img-bmp', magic: 'bmp' },
  { name: 'jpg-a-pdf', file: 'photo.jpg', target: 'img-pdf', options: { quality: 85 }, magic: 'pdf', check: pages(1) },
  { name: 'gif-animado-a-mp4', file: 'anim.gif', target: 'gif-mp4', magic: 'mp4', check: codec('video', 'h264') },
  { name: 'gif-animado-a-webm', file: 'anim.gif', target: 'gif-webm', magic: 'webm', check: codec('video', 'vp9') },
  { name: 'heic-a-jpg', file: 'iphone.heic', target: 'img-jpeg', magic: 'jpg' },
  { name: 'png-a-heic', file: 'photo.png', target: 'img-heic', options: { quality: 60 }, magic: 'heic' },
  { name: 'jpg-a-avif', file: 'photo.jpg', target: 'img-avif', magic: 'avif' },
  { name: 'jpg-a-webp-1280', file: 'photo.jpg', target: 'img-webp', options: { maxWidth: '1280', quality: 70 }, magic: 'webp' },
  { name: 'jpg-a-tiff', file: 'photo.jpg', target: 'img-tiff', magic: 'tif' },
  { name: 'jpg-a-gif', file: 'photo.jpg', target: 'img-gif', magic: 'gif' },
  { name: 'psd-a-png', file: 'image.psd', target: 'img-png', magic: 'png' },
  { name: 'tga-a-webp', file: 'image.tga', target: 'img-webp', magic: 'webp' },
  { name: 'exr-a-png', file: 'image.exr', target: 'img-png', magic: 'png' },
  { name: 'jp2-a-jpg', file: 'image.jp2', target: 'img-jpeg', magic: 'jpg' },
  { name: 'svg-a-png', file: 'logo.svg', target: 'img-png', magic: 'png' },
  { name: 'bmp-a-jpg', file: 'image.bmp', target: 'img-jpeg', magic: 'jpg' },
  { name: 'ico-a-png', file: 'favicon.ico', target: 'img-png', magic: 'png' },
  { name: 'jxl-a-png', file: 'image.jxl', target: 'img-png', magic: 'png' },
  { name: 'tiff-ycbcr-a-jpg', file: 'ycbcr.tiff', target: 'img-jpeg', magic: 'jpg' },
  // ---------------- audio
  { name: 'wav-a-aiff', file: 'tone.wav', target: 'a-aiff', magic: 'aiff', check: codec('audio', 'pcm_s16be') },
  { name: 'wav-a-alac', file: 'tone.wav', target: 'a-alac', magic: 'm4a', check: codec('audio', 'alac') },
  { name: 'wav-a-ac3', file: 'tone.wav', target: 'a-ac3', magic: 'ac3', check: codec('audio', 'ac3') },
  { name: 'wav-a-wma', file: 'tone.wav', target: 'a-wma', magic: 'wma', check: codec('audio', 'wmav2') },
  { name: 'mp3-a-m4r-tono', file: 'voice.mp3', target: 'a-m4r', options: { start: '0' }, magic: 'm4r', check: codec('audio', 'aac') },
  { name: 'wav-a-m4a', file: 'tone.wav', target: 'a-m4a', options: { bitrate: '128' }, magic: 'm4a', check: codec('audio', 'aac') },
  { name: 'wav-a-ogg', file: 'tone.wav', target: 'a-ogg', magic: 'ogg', check: codec('audio', 'vorbis') },
  { name: 'wav-a-opus', file: 'tone.wav', target: 'a-opus', magic: 'opus', check: codec('audio', 'opus') },
  { name: 'mp3-a-flac', file: 'voice.mp3', target: 'a-flac', magic: 'flac', check: codec('audio', 'flac') },
  { name: 'mp3-a-wav-normalizado', file: 'voice.mp3', target: 'a-wav', options: { normalize: true }, magic: 'wav', check: codec('audio', 'pcm_s16le') },
  { name: 'flac-a-mp3-320', file: 'music.flac', target: 'a-mp3', options: { bitrate: '320' }, magic: 'mp3', check: codec('audio', 'mp3') },
  // ---------------- vídeo
  { name: 'mp4-a-mov', file: 'clip.mp4', target: 'v-mov', magic: 'mov', check: codec('video', 'h264') },
  { name: 'mp4-a-mkv', file: 'clip.mp4', target: 'v-mkv', magic: 'mkv', check: codec('video', 'h264') },
  { name: 'mp4-a-avi', file: 'clip.mp4', target: 'v-avi', magic: 'avi', check: codec('video', 'mpeg4') },
  { name: 'mp4-a-gif', file: 'clip.mp4', target: 'v-gif', options: { width: '320', fps: '12', duration: '10' }, magic: 'gif', check: animated },
  { name: 'mp4-extraer-mp3', file: 'clip.mp4', target: 'v-mp3', magic: 'mp3', check: codec('audio', 'mp3') },
  { name: 'mp4-extraer-m4a', file: 'clip.mp4', target: 'v-m4a', magic: 'm4a', check: codec('audio', 'aac') },
  { name: 'mp4-extraer-ogg', file: 'clip.mp4', target: 'v-ogg', magic: 'ogg', check: codec('audio', 'vorbis') },
  { name: 'mp4-extraer-wav', file: 'clip.mp4', target: 'v-wav', magic: 'wav', check: codec('audio', 'pcm_s16le') },
  { name: 'mp4-extraer-flac', file: 'clip.mp4', target: 'v-flac', magic: 'flac', check: codec('audio', 'flac') },
  { name: 'webm-vfr-sin-duracion-a-mp4', file: 'screen.webm', target: 'v-mp4', magic: 'mp4', check: codec('video', 'h264') },
  { name: 'mov-a-mp4-480p', file: 'clip.mov', target: 'v-mp4', options: { resolution: '480', quality: 'baja' }, magic: 'mp4', check: codec('video', 'h264') },
  { name: 'avi-a-webm', file: 'clip.avi', target: 'v-webm', magic: 'webm', check: codec('video', 'vp9') },
  { name: 'vob-a-mp4', file: 'clip.vob', target: 'v-mp4', magic: 'mp4', check: codec('video', 'h264') },
  { name: 'ts-a-mkv', file: 'clip.ts', target: 'v-mkv', magic: 'mkv', check: codec('video', 'h264') },
  // ---------------- documentos (LibreOffice / Pandoc)
  { name: 'csv-a-xlsx', file: 'personas.csv', target: 's-xlsx', magic: 'xlsx' },
  { name: 'xlsx-a-ods', from: 'csv-a-xlsx', target: 's-ods', magic: 'ods' },
  { name: 'xlsx-a-csv', from: 'csv-a-xlsx', target: 's-csv', magic: 'csv', check: contains('Marta') },
  { name: 'xlsx-a-pdf', from: 'csv-a-xlsx', target: 's-pdf', magic: 'pdf', check: pages() },
  { name: 'csv-puntoycoma-a-ods', file: 'ventas.csv', target: 's-ods', magic: 'ods' },
  { name: 'tsv-a-csv', file: 'tabla.tsv', target: 's-csv', magic: 'csv', check: contains('1,2,3') },
  { name: 'xls-a-xlsx', file: 'personas.xls', target: 's-xlsx', magic: 'xlsx' },
  { name: 'docx-a-odt', file: 'report.docx', target: 'd-odt', magic: 'odt' },
  { name: 'docx-a-rtf', file: 'report.docx', target: 'd-rtf', magic: 'rtf' },
  { name: 'docx-a-txt', file: 'report.docx', target: 'd-txt', magic: 'txt', check: contains('pingüino') },
  { name: 'docx-a-md', file: 'report.docx', target: 'd-md', magic: 'md', check: contains('Informe trimestral') },
  { name: 'odt-a-html', file: 'report.odt', target: 'd-html', magic: 'html', check: contains('Conclusiones') },
  { name: 'docx-a-epub', file: 'report.docx', target: 'd-epub', magic: 'epub' },
  { name: 'doc-a-docx', file: 'report.doc', target: 'd-docx', magic: 'docx' },
  { name: 'rtf-a-pdf', file: 'report.rtf', target: 'd-pdf', magic: 'pdf', check: pages() },
  { name: 'pptx-a-odp', file: 'deck.pptx', target: 'p-odp', magic: 'odp' },
  { name: 'ppt-a-pptx', file: 'deck.ppt', target: 'p-pptx', magic: 'pptx' },
  { name: 'odp-a-pdf', file: 'deck.odp', target: 'p-pdf', magic: 'pdf', check: pages() },
  // ---------------- texto y libros (Pandoc)
  { name: 'md-a-pptx', file: 'slides.md', target: 't-pptx', magic: 'pptx' },
  { name: 'pptx-de-md-a-odp', from: 'md-a-pptx', target: 'p-odp', magic: 'odp' },
  { name: 'pptx-de-md-a-pdf', from: 'md-a-pptx', target: 'p-pdf', magic: 'pdf', check: pages() },
  { name: 'md-a-pdf-dos-etapas', file: 'doc.md', target: 't-pdf', magic: 'pdf', check: pages() },
  { name: 'md-a-latex', file: 'readme.md', target: 't-latex', magic: 'tex', check: noLeak },
  { name: 'md-a-rst', file: 'readme.md', target: 't-rst', magic: 'rst' },
  { name: 'md-a-asciidoc', file: 'readme.md', target: 't-adoc', magic: 'adoc' },
  { name: 'md-a-org', file: 'readme.md', target: 't-org', magic: 'org' },
  { name: 'md-a-mediawiki', file: 'readme.md', target: 't-wiki', magic: 'wiki' },
  { name: 'md-a-fb2', file: 'readme.md', target: 't-fb2', magic: 'fb2', check: noLeak },
  { name: 'md-a-html-autonomo', file: 'readme.md', target: 't-html', magic: 'html', check: noLeak },
  { name: 'md-a-epub', file: 'readme.md', target: 't-epub', magic: 'epub', check: noLeak },
  { name: 'md-a-docx', file: 'readme.md', target: 't-docx', magic: 'docx', check: noLeak },
  { name: 'md-a-odt', file: 'readme.md', target: 't-odt', magic: 'odt' },
  { name: 'md-a-rtf', file: 'readme.md', target: 't-rtf', magic: 'rtf' },
  { name: 'html-a-md', file: 'page.html', target: 't-md', magic: 'md' },
  { name: 'epub-a-docx', file: 'book.epub', target: 't-docx', magic: 'docx' },
  { name: 'ipynb-a-html', file: 'notebook.ipynb', target: 't-html', magic: 'html', check: contains('Cuaderno') },
  { name: 'opml-a-md', file: 'outline.opml', target: 't-md', magic: 'md' },
  { name: 'textile-a-txt', file: 'notes.textile', target: 't-txt', magic: 'txt' },
  { name: 'wiki-a-epub', file: 'article.wiki', target: 't-epub', magic: 'epub' },
  { name: 'fb2-a-odt', file: 'book.fb2', target: 't-odt', magic: 'odt' },
  { name: 'txt-a-pdf', file: 'notes.txt', target: 't-pdf', magic: 'pdf', check: pages() },
  // ---------------- PDF
  { name: 'pdf-a-jpg-zip', file: 'pages.pdf', target: 'pdf-jpg', options: { dpi: '72' }, magic: 'zip', check: zipOf(6, '.jpg') },
  { name: 'pdf-a-png-zip', file: 'pages.pdf', target: 'pdf-png', options: { dpi: '72' }, magic: 'zip', check: zipOf(6, '.png') },
  { name: 'pdf-a-texto', file: 'pages.pdf', target: 'pdf-txt', magic: 'txt', check: contains('Pagina 6') },
  { name: 'pdf-a-grises', file: 'photos.pdf', target: 'pdf-gray', magic: 'pdf', check: pages(8) },
  { name: 'pdf-comprimir', file: 'photos.pdf', target: 'pdf-compress', options: { level: 'screen' }, magic: 'pdf', check: pages(8) },
  { name: 'pdf-separar-zip', file: 'pages.pdf', target: 'pdf-split', magic: 'zip', check: zipOf(6, '.pdf') },
  { name: 'pdf-rotar', file: 'pages.pdf', target: 'pdf-rotate', options: { angle: '90' }, magic: 'pdf', check: (b) => { if (!/\/Rotate\s+90/.test(b.toString('latin1'))) throw new Error('sin /Rotate 90'); return '/Rotate 90'; } },
  { name: 'pdf-extraer-1-3-5', file: 'pages.pdf', target: 'pdf-extract', options: { pages: '1-3,5' }, magic: 'pdf', check: pages(4) },
  { name: 'pdf-1-pagina-a-png-suelta', from: 'pdf-extraer-1-3-5', target: 'pdf-extract', options: { pages: '2' }, magic: 'pdf', check: pages(1) },
  { name: 'pdf-una-pagina-a-imagen', from: 'pdf-1-pagina-a-png-suelta', target: 'pdf-png', options: { dpi: '72' }, magic: 'png' },
  // ---------------- subtítulos
  { name: 'srt-a-ass', file: 'subs.srt', target: 'sub-ass', magic: 'ass' },
  { name: 'vtt-a-srt', file: 'subs.vtt', target: 'sub-srt', magic: 'srt' },
  { name: 'ass-a-vtt', file: 'subs.ass', target: 'sub-vtt', magic: 'vtt' },
];

const res = await runCases(cases, { label: 'Formatos de salida' });
process.exitCode = res.every((r) => r.ok) ? 0 : 1;

// Unir: solo tiene sentido con dos o más PDF subidos.
{
  const { upload, createJob, follow, download, MAGIC, save } = await import('./lib.mjs');
  const { FIX } = await import('./lib.mjs');
  const { restartWeb } = await import('./runner.mjs');
  await restartWeb();
  const a = await upload(`${FIX}/pages.pdf`);
  const b = await upload(`${FIX}/second.pdf`);
  const c = await upload(`${FIX}/photos.pdf`);
  const j = await createJob(null, 'pdf-merge', {}, { fileIds: [a.file.id, b.file.id, c.file.id] });
  const ev = j.job ? await follow(j.job.id) : [];
  const last = ev[ev.length - 1] || {};
  let ok = false; let detail = j.error || last.error || '';
  if (last.status === 'done') {
    const buf = await download(last.result.download);
    const n = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok = MAGIC.pdf(buf) && n === 20;
    detail = `${n} páginas (6 + 6 + 8)`;
    save('pdf-unir-3.pdf', buf);
  }
  console.log(`  ${ok ? '✓' : '✗'} ${'pdf-unir-3'.padEnd(30)} pdf   ${detail}`);
  if (!ok) process.exitCode = 1;
}
