// Siete pruebas, siete resultados: una conversión real de cada categoría.
import { runCases, codec } from './runner.mjs';

const pdfPages = (buf) => `${(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length} páginas`;
const cases = [
  { name: '1-imagen  JPEG → WebP', file: 'photo.jpg', target: 'img-webp', magic: 'webp', saveExt: 'webp' },
  { name: '2-audio   WAV → MP3', file: 'tone.wav', target: 'a-mp3', magic: 'mp3', check: codec('audio', 'mp3'), saveExt: 'mp3' },
  { name: '3-vídeo   MP4 → WebM', file: 'clip.mp4', target: 'v-webm', magic: 'webm', check: codec('video', 'vp9'), saveExt: 'webm' },
  { name: '4-documento DOCX → PDF', file: 'report.docx', target: 'd-pdf', magic: 'pdf', check: pdfPages, saveExt: 'pdf' },
  { name: '5-pdf     comprimir', file: 'photos.pdf', target: 'pdf-compress', options: { level: 'ebook' }, magic: 'pdf', check: pdfPages, saveExt: 'pdf' },
  { name: '6-texto   Markdown → DOCX', file: 'readme.md', target: 't-docx', magic: 'docx', saveExt: 'docx' },
  { name: '7-subtítulos SRT → WebVTT', file: 'subs.srt', target: 'sub-vtt', magic: 'vtt', saveExt: 'vtt' },
];
const res = await runCases(cases, { label: 'Conversiones por categoría' });
process.exitCode = res.every((r) => r.ok) ? 0 : 1;
