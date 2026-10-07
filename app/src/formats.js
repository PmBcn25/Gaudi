'use strict';
// Catálogo de formatos: qué entra, qué sale y qué opciones admite cada salida.
// Lo usan el servidor web (para validar y ofrecer destinos) y el worker.

// ---------------------------------------------------------------- entradas
// id -> [familia, etiqueta, extensión canónica]
const INPUTS = {
  // Imágenes
  jpeg: ['image', 'JPEG', 'jpg'], png: ['image', 'PNG', 'png'], webp: ['image', 'WebP', 'webp'],
  avif: ['image', 'AVIF', 'avif'], tiff: ['image', 'TIFF', 'tif'], gif: ['image', 'GIF', 'gif'],
  heic: ['image', 'HEIC', 'heic'], svg: ['image', 'SVG', 'svg'], bmp: ['image', 'BMP', 'bmp'],
  ico: ['image', 'ICO', 'ico'], tga: ['image', 'TGA', 'tga'], psd: ['image', 'PSD', 'psd'],
  jxl: ['image', 'JPEG XL', 'jxl'], jp2: ['image', 'JPEG 2000', 'jp2'], dds: ['image', 'DDS', 'dds'],
  exr: ['image', 'OpenEXR', 'exr'],
  // Audio
  mp3: ['audio', 'MP3', 'mp3'], wav: ['audio', 'WAV', 'wav'], flac: ['audio', 'FLAC', 'flac'],
  aac: ['audio', 'AAC', 'aac'], m4a: ['audio', 'M4A', 'm4a'], m4b: ['audio', 'M4B (audiolibro)', 'm4b'],
  m4r: ['audio', 'M4R (tono)', 'm4r'], ogg: ['audio', 'OGG', 'ogg'], opus: ['audio', 'Opus', 'opus'],
  wma: ['audio', 'WMA', 'wma'], aiff: ['audio', 'AIFF', 'aiff'], amr: ['audio', 'AMR', 'amr'],
  ac3: ['audio', 'AC3', 'ac3'], mka: ['audio', 'MKA', 'mka'], mp2: ['audio', 'MP2', 'mp2'],
  caf: ['audio', 'CAF', 'caf'], au: ['audio', 'AU', 'au'], wv: ['audio', 'WavPack', 'wv'],
  ape: ['audio', "Monkey's Audio", 'ape'], weba: ['audio', 'WebA', 'weba'],
  // Vídeo
  mp4: ['video', 'MP4', 'mp4'], mov: ['video', 'MOV', 'mov'], mkv: ['video', 'MKV', 'mkv'],
  webm: ['video', 'WebM', 'webm'], avi: ['video', 'AVI', 'avi'], m4v: ['video', 'M4V', 'm4v'],
  mpg: ['video', 'MPEG', 'mpg'], wmv: ['video', 'WMV', 'wmv'], flv: ['video', 'FLV', 'flv'],
  '3gp': ['video', '3GP', '3gp'], ts: ['video', 'MPEG-TS', 'ts'], mts: ['video', 'AVCHD (MTS)', 'mts'],
  m2ts: ['video', 'M2TS', 'm2ts'], vob: ['video', 'VOB (DVD)', 'vob'], ogv: ['video', 'OGV', 'ogv'],
  f4v: ['video', 'F4V', 'f4v'], asf: ['video', 'ASF', 'asf'], divx: ['video', 'DivX', 'divx'],
  mxf: ['video', 'MXF', 'mxf'],
  // Documentos de texto
  docx: ['doc', 'Word (DOCX)', 'docx'], doc: ['doc', 'Word 97–2003 (DOC)', 'doc'],
  odt: ['doc', 'OpenDocument (ODT)', 'odt'], rtf: ['doc', 'RTF', 'rtf'], docm: ['doc', 'Word con macros (DOCM)', 'docm'],
  dot: ['doc', 'Plantilla Word (DOT)', 'dot'], dotx: ['doc', 'Plantilla Word (DOTX)', 'dotx'],
  fodt: ['doc', 'OpenDocument plano (FODT)', 'fodt'], wps: ['doc', 'Works (WPS)', 'wps'],
  // Hojas de cálculo
  xlsx: ['sheet', 'Excel (XLSX)', 'xlsx'], xls: ['sheet', 'Excel 97–2003 (XLS)', 'xls'],
  ods: ['sheet', 'OpenDocument (ODS)', 'ods'], csv: ['sheet', 'CSV', 'csv'], tsv: ['sheet', 'TSV', 'tsv'],
  xlsm: ['sheet', 'Excel con macros (XLSM)', 'xlsm'], xlt: ['sheet', 'Plantilla Excel (XLT)', 'xlt'],
  xltx: ['sheet', 'Plantilla Excel (XLTX)', 'xltx'],
  // Presentaciones
  pptx: ['slides', 'PowerPoint (PPTX)', 'pptx'], ppt: ['slides', 'PowerPoint 97–2003 (PPT)', 'ppt'],
  odp: ['slides', 'OpenDocument (ODP)', 'odp'], pps: ['slides', 'Presentación (PPS)', 'pps'],
  ppsx: ['slides', 'Presentación (PPSX)', 'ppsx'], pptm: ['slides', 'PowerPoint con macros (PPTM)', 'pptm'],
  // PDF
  pdf: ['pdf', 'PDF', 'pdf'],
  // Texto y libros
  md: ['text', 'Markdown', 'md'], html: ['text', 'HTML', 'html'], epub: ['text', 'EPUB', 'epub'],
  txt: ['text', 'Texto plano', 'txt'], textile: ['text', 'Textile', 'textile'],
  ipynb: ['text', 'Jupyter Notebook', 'ipynb'], fb2: ['text', 'FictionBook', 'fb2'],
  mediawiki: ['text', 'MediaWiki', 'wiki'], opml: ['text', 'OPML', 'opml'],
  // Subtítulos
  srt: ['subtitle', 'SubRip (SRT)', 'srt'], vtt: ['subtitle', 'WebVTT', 'vtt'],
  ass: ['subtitle', 'ASS', 'ass'], ssa: ['subtitle', 'SSA', 'ssa'],
};

const FAMILY_LABEL = {
  image: 'Imagen', audio: 'Audio', video: 'Vídeo', doc: 'Documento', sheet: 'Hoja de cálculo',
  slides: 'Presentación', pdf: 'PDF', text: 'Texto', subtitle: 'Subtítulos',
};

// ---------------------------------------------------------------- opciones
const opt = {
  maxWidth: {
    key: 'maxWidth', type: 'select', label: 'Ancho máximo', default: '0',
    choices: [['0', 'Original'], ['3840', '3840 px'], ['2560', '2560 px'], ['1920', '1920 px'],
      ['1280', '1280 px'], ['800', '800 px'], ['400', '400 px']],
  },
  quality: { key: 'quality', type: 'range', label: 'Calidad', min: 10, max: 100, step: 1, default: 80 },
  icoSize: {
    key: 'icoSize', type: 'select', label: 'Tamaños', default: 'all',
    choices: [['all', 'Todos (16–256 px)'], ['16', '16 px'], ['32', '32 px'], ['48', '48 px'],
      ['64', '64 px'], ['128', '128 px'], ['256', '256 px']],
  },
  normalize: { key: 'normalize', type: 'toggle', label: 'Normalizar volumen', default: false },
  ringStart: {
    key: 'start', type: 'select', label: 'Empieza en', default: '0',
    choices: [['0', '0:00'], ['15', '0:15'], ['30', '0:30'], ['45', '0:45'], ['60', '1:00'], ['90', '1:30'], ['120', '2:00']],
  },
  resolution: {
    key: 'resolution', type: 'select', label: 'Resolución', default: '0',
    choices: [['0', 'Original'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']],
  },
  vquality: {
    key: 'quality', type: 'select', label: 'Calidad', default: 'media',
    choices: [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja (más ligero)']],
  },
  gifWidth: {
    key: 'width', type: 'select', label: 'Ancho', default: '480',
    choices: [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px']],
  },
  gifFps: {
    key: 'fps', type: 'select', label: 'Fotogramas/s', default: '12',
    choices: [['8', '8 fps'], ['12', '12 fps'], ['15', '15 fps'], ['20', '20 fps'], ['25', '25 fps']],
  },
  gifDuration: {
    key: 'duration', type: 'select', label: 'Duración', default: '30',
    choices: [['10', 'Primeros 10 s'], ['30', 'Primeros 30 s'], ['60', 'Primer minuto'], ['0', 'Completo']],
  },
  pdfLevel: {
    key: 'level', type: 'select', label: 'Compresión', default: 'ebook',
    choices: [['screen', 'Máxima (72 ppp)'], ['ebook', 'Equilibrada (150 ppp)'], ['printer', 'Ligera (300 ppp)']],
  },
  pages: { key: 'pages', type: 'text', label: 'Páginas', placeholder: '1-3,5', default: '1', required: true },
  rotate: {
    key: 'angle', type: 'select', label: 'Giro', default: '90',
    choices: [['90', '90° a la derecha'], ['180', '180°'], ['270', '90° a la izquierda']],
  },
  dpi: {
    key: 'dpi', type: 'select', label: 'Resolución', default: '150',
    choices: [['72', '72 ppp'], ['150', '150 ppp'], ['300', '300 ppp']],
  },
};

function bitrate(def, list) {
  return { key: 'bitrate', type: 'select', label: 'Bitrate', default: String(def), choices: list.map((b) => [String(b), `${b} kbps`]) };
}

// ---------------------------------------------------------------- salidas
// id -> definición. engine: quién la ejecuta. progress: 'ffmpeg' | 'pages' | 'stages' | 'instant'.
const IMG_Q = [opt.maxWidth, opt.quality];
const OUT = {
  // Imagen
  'img-webp': { label: 'WebP', ext: 'webp', mime: 'image/webp', engine: 'image', progress: 'instant', options: IMG_Q },
  'img-jpeg': { label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', engine: 'image', progress: 'instant', options: IMG_Q },
  'img-png': { label: 'PNG', ext: 'png', mime: 'image/png', engine: 'image', progress: 'instant', options: [opt.maxWidth] },
  'img-avif': { label: 'AVIF', ext: 'avif', mime: 'image/avif', engine: 'image', progress: 'instant', options: IMG_Q },
  'img-heic': { label: 'HEIC', ext: 'heic', mime: 'image/heic', engine: 'image', progress: 'instant', options: IMG_Q },
  'img-jxl': { label: 'JPEG XL', ext: 'jxl', mime: 'image/jxl', engine: 'image', progress: 'instant', options: IMG_Q },
  'img-tiff': { label: 'TIFF', ext: 'tif', mime: 'image/tiff', engine: 'image', progress: 'instant', options: [opt.maxWidth] },
  'img-gif': { label: 'GIF', ext: 'gif', mime: 'image/gif', engine: 'image', progress: 'instant', options: [opt.maxWidth] },
  'img-bmp': { label: 'BMP', ext: 'bmp', mime: 'image/bmp', engine: 'image', progress: 'instant', options: [opt.maxWidth] },
  'img-ico': { label: 'ICO (favicon)', ext: 'ico', mime: 'image/x-icon', engine: 'image', progress: 'instant', options: [opt.icoSize] },
  'img-pdf': { label: 'PDF', ext: 'pdf', mime: 'application/pdf', engine: 'image', progress: 'instant', options: IMG_Q },
  'gif-mp4': { label: 'Vídeo MP4', ext: 'mp4', mime: 'video/mp4', engine: 'video', progress: 'ffmpeg', options: [opt.vquality] },
  'gif-webm': { label: 'Vídeo WebM', ext: 'webm', mime: 'video/webm', engine: 'video', progress: 'ffmpeg', options: [opt.vquality] },

  // Audio
  'a-mp3': { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256, 320]), opt.normalize] },
  'a-m4a': { label: 'AAC (M4A)', ext: 'm4a', mime: 'audio/mp4', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256]), opt.normalize] },
  'a-ogg': { label: 'OGG Vorbis', ext: 'ogg', mime: 'audio/ogg', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256]), opt.normalize] },
  'a-opus': { label: 'Opus', ext: 'opus', mime: 'audio/ogg', engine: 'audio', progress: 'ffmpeg', options: [bitrate(128, [64, 96, 128, 160]), opt.normalize] },
  'a-flac': { label: 'FLAC', ext: 'flac', mime: 'audio/flac', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize] },
  'a-wav': { label: 'WAV', ext: 'wav', mime: 'audio/wav', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize] },
  'a-aiff': { label: 'AIFF', ext: 'aiff', mime: 'audio/aiff', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize] },
  'a-alac': { label: 'ALAC (Apple Lossless)', ext: 'm4a', mime: 'audio/mp4', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize] },
  'a-ac3': { label: 'AC3', ext: 'ac3', mime: 'audio/ac3', engine: 'audio', progress: 'ffmpeg', options: [bitrate(384, [192, 384, 448, 640]), opt.normalize] },
  'a-wma': { label: 'WMA', ext: 'wma', mime: 'audio/x-ms-wma', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192]), opt.normalize] },
  'a-m4r': { label: 'Tono de iPhone (M4R)', ext: 'm4r', mime: 'audio/mp4', engine: 'audio', progress: 'ffmpeg', options: [opt.ringStart, opt.normalize], note: 'Máximo 40 segundos' },

  // Vídeo
  'v-mp4': { label: 'MP4 (H.264)', ext: 'mp4', mime: 'video/mp4', engine: 'video', progress: 'ffmpeg', options: [opt.resolution, opt.vquality] },
  'v-webm': { label: 'WebM (VP9)', ext: 'webm', mime: 'video/webm', engine: 'video', progress: 'ffmpeg', options: [opt.resolution, opt.vquality] },
  'v-mov': { label: 'MOV', ext: 'mov', mime: 'video/quicktime', engine: 'video', progress: 'ffmpeg', options: [opt.resolution, opt.vquality] },
  'v-mkv': { label: 'MKV', ext: 'mkv', mime: 'video/x-matroska', engine: 'video', progress: 'ffmpeg', options: [opt.resolution, opt.vquality] },
  'v-avi': { label: 'AVI', ext: 'avi', mime: 'video/x-msvideo', engine: 'video', progress: 'ffmpeg', options: [opt.resolution, opt.vquality] },
  'v-gif': { label: 'GIF animado', ext: 'gif', mime: 'image/gif', engine: 'video', progress: 'ffmpeg', options: [opt.gifWidth, opt.gifFps, opt.gifDuration] },
  'v-mp3': { label: 'Solo audio MP3', ext: 'mp3', mime: 'audio/mpeg', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256, 320]), opt.normalize], needsAudio: true },
  'v-m4a': { label: 'Solo audio M4A', ext: 'm4a', mime: 'audio/mp4', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256]), opt.normalize], needsAudio: true },
  'v-ogg': { label: 'Solo audio OGG', ext: 'ogg', mime: 'audio/ogg', engine: 'audio', progress: 'ffmpeg', options: [bitrate(192, [128, 192, 256]), opt.normalize], needsAudio: true },
  'v-wav': { label: 'Solo audio WAV', ext: 'wav', mime: 'audio/wav', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize], needsAudio: true },
  'v-flac': { label: 'Solo audio FLAC', ext: 'flac', mime: 'audio/flac', engine: 'audio', progress: 'ffmpeg', options: [opt.normalize], needsAudio: true },

  // Documentos (LibreOffice salvo los marcados con pandoc)
  'd-pdf': { label: 'PDF', ext: 'pdf', mime: 'application/pdf', engine: 'office', progress: 'stages', lo: true },
  'd-docx': { label: 'DOCX', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', engine: 'office', progress: 'stages', lo: true },
  'd-odt': { label: 'ODT', ext: 'odt', mime: 'application/vnd.oasis.opendocument.text', engine: 'office', progress: 'stages', lo: true },
  'd-rtf': { label: 'RTF', ext: 'rtf', mime: 'application/rtf', engine: 'office', progress: 'stages', lo: true },
  'd-txt': { label: 'Texto (TXT)', ext: 'txt', mime: 'text/plain; charset=utf-8', engine: 'office', progress: 'stages', lo: true },
  'd-md': { label: 'Markdown', ext: 'md', mime: 'text/markdown; charset=utf-8', engine: 'pandoc', progress: 'stages' },
  'd-html': { label: 'HTML', ext: 'html', mime: 'text/html; charset=utf-8', engine: 'pandoc', progress: 'stages' },
  'd-epub': { label: 'EPUB', ext: 'epub', mime: 'application/epub+zip', engine: 'pandoc', progress: 'stages' },
  's-pdf': { label: 'PDF', ext: 'pdf', mime: 'application/pdf', engine: 'office', progress: 'stages', lo: true },
  's-xlsx': { label: 'XLSX', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', engine: 'office', progress: 'stages', lo: true },
  's-ods': { label: 'ODS', ext: 'ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', engine: 'office', progress: 'stages', lo: true },
  's-csv': { label: 'CSV', ext: 'csv', mime: 'text/csv; charset=utf-8', engine: 'office', progress: 'stages', lo: true, note: 'Una hoja = un CSV (varias, en ZIP)' },
  'p-pdf': { label: 'PDF', ext: 'pdf', mime: 'application/pdf', engine: 'office', progress: 'stages', lo: true },
  'p-pptx': { label: 'PPTX', ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', engine: 'office', progress: 'stages', lo: true },
  'p-odp': { label: 'ODP', ext: 'odp', mime: 'application/vnd.oasis.opendocument.presentation', engine: 'office', progress: 'stages', lo: true },

  // PDF
  'pdf-compress': { label: 'Comprimir', ext: 'pdf', mime: 'application/pdf', engine: 'pdf', progress: 'pages', options: [opt.pdfLevel] },
  'pdf-extract': { label: 'Extraer páginas', ext: 'pdf', mime: 'application/pdf', engine: 'pdf', progress: 'stages', options: [opt.pages] },
  'pdf-split': { label: 'Separar páginas (ZIP)', ext: 'zip', mime: 'application/zip', engine: 'pdf', progress: 'stages' },
  'pdf-rotate': { label: 'Rotar', ext: 'pdf', mime: 'application/pdf', engine: 'pdf', progress: 'stages', options: [opt.rotate] },
  'pdf-gray': { label: 'Escala de grises', ext: 'pdf', mime: 'application/pdf', engine: 'pdf', progress: 'pages' },
  'pdf-jpg': { label: 'Imágenes JPG', ext: 'jpg', mime: 'image/jpeg', engine: 'pdf', progress: 'pages', options: [opt.dpi] },
  'pdf-png': { label: 'Imágenes PNG', ext: 'png', mime: 'image/png', engine: 'pdf', progress: 'pages', options: [opt.dpi] },
  'pdf-txt': { label: 'Extraer texto (TXT)', ext: 'txt', mime: 'text/plain; charset=utf-8', engine: 'pdf', progress: 'pages' },
  'pdf-merge': { label: 'Unir PDF', ext: 'pdf', mime: 'application/pdf', engine: 'pdf', progress: 'stages', multi: true },

  // Texto y libros (Pandoc). PDF en dos etapas: Pandoc -> ODT -> LibreOffice -> PDF.
  't-pdf': { label: 'PDF', ext: 'pdf', mime: 'application/pdf', engine: 'pandoc', progress: 'stages', lo: true, to: 'odt' },
  't-docx': { label: 'DOCX', ext: 'docx', mime: OUTMIME('docx'), engine: 'pandoc', progress: 'stages', to: 'docx' },
  't-html': { label: 'HTML', ext: 'html', mime: 'text/html; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'html' },
  't-md': { label: 'Markdown', ext: 'md', mime: 'text/markdown; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'gfm' },
  't-epub': { label: 'EPUB', ext: 'epub', mime: 'application/epub+zip', engine: 'pandoc', progress: 'stages', to: 'epub3' },
  't-odt': { label: 'ODT', ext: 'odt', mime: 'application/vnd.oasis.opendocument.text', engine: 'pandoc', progress: 'stages', to: 'odt' },
  't-pptx': { label: 'Presentación PPTX', ext: 'pptx', mime: OUTMIME('pptx'), engine: 'pandoc', progress: 'stages', to: 'pptx' },
  't-rtf': { label: 'RTF', ext: 'rtf', mime: 'application/rtf', engine: 'pandoc', progress: 'stages', to: 'rtf' },
  't-txt': { label: 'Texto plano', ext: 'txt', mime: 'text/plain; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'plain' },
  't-latex': { label: 'LaTeX', ext: 'tex', mime: 'application/x-tex; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'latex' },
  't-rst': { label: 'reStructuredText', ext: 'rst', mime: 'text/x-rst; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'rst' },
  't-adoc': { label: 'AsciiDoc', ext: 'adoc', mime: 'text/plain; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'asciidoc' },
  't-org': { label: 'Org', ext: 'org', mime: 'text/plain; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'org' },
  't-wiki': { label: 'MediaWiki', ext: 'wiki', mime: 'text/plain; charset=utf-8', engine: 'pandoc', progress: 'stages', to: 'mediawiki' },
  't-fb2': { label: 'FictionBook (FB2)', ext: 'fb2', mime: 'application/x-fictionbook+xml', engine: 'pandoc', progress: 'stages', to: 'fb2' },

  // Subtítulos
  'sub-srt': { label: 'SRT', ext: 'srt', mime: 'application/x-subrip; charset=utf-8', engine: 'subtitle', progress: 'instant', fmt: 'srt' },
  'sub-vtt': { label: 'WebVTT', ext: 'vtt', mime: 'text/vtt; charset=utf-8', engine: 'subtitle', progress: 'instant', fmt: 'webvtt' },
  'sub-ass': { label: 'ASS', ext: 'ass', mime: 'text/x-ssa; charset=utf-8', engine: 'subtitle', progress: 'instant', fmt: 'ass' },
};
function OUTMIME(ext) {
  return {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }[ext];
}
for (const [id, o] of Object.entries(OUT)) { o.id = id; o.options = o.options || []; }

const FAMILY_OUTPUTS = {
  image: ['img-webp', 'img-jpeg', 'img-png', 'img-avif', 'img-heic', 'img-jxl', 'img-tiff', 'img-gif', 'img-bmp', 'img-ico', 'img-pdf'],
  audio: ['a-mp3', 'a-m4a', 'a-ogg', 'a-opus', 'a-flac', 'a-wav', 'a-aiff', 'a-alac', 'a-ac3', 'a-wma', 'a-m4r'],
  video: ['v-mp4', 'v-webm', 'v-mov', 'v-mkv', 'v-avi', 'v-gif', 'v-mp3', 'v-m4a', 'v-ogg', 'v-wav', 'v-flac'],
  doc: ['d-pdf', 'd-docx', 'd-odt', 'd-rtf', 'd-txt'],
  sheet: ['s-pdf', 's-xlsx', 's-ods', 's-csv'],
  slides: ['p-pdf', 'p-pptx', 'p-odp'],
  pdf: ['pdf-compress', 'pdf-extract', 'pdf-split', 'pdf-rotate', 'pdf-gray', 'pdf-jpg', 'pdf-png', 'pdf-txt'],
  text: ['t-pdf', 't-docx', 't-html', 't-md', 't-epub', 't-odt', 't-pptx', 't-rtf', 't-txt', 't-latex', 't-rst', 't-adoc', 't-org', 't-wiki', 't-fb2'],
  subtitle: ['sub-srt', 'sub-vtt', 'sub-ass'],
};

// Salida "igual" a la entrada (no tiene sentido ofrecerla).
const SAME = {
  'img-webp': ['webp'], 'img-png': ['png'], 'img-gif': ['gif'], 'img-bmp': ['bmp'], 'img-ico': ['ico'], 'img-tiff': ['tiff'],
  'a-mp3': ['mp3'], 'a-flac': ['flac'], 'a-wav': ['wav'], 'a-aiff': ['aiff'], 'a-ac3': ['ac3'], 'a-wma': ['wma'],
  'a-opus': ['opus'], 'a-m4r': ['m4r'], 'a-ogg': ['ogg'],
  'd-docx': ['docx'], 'd-odt': ['odt'], 'd-rtf': ['rtf'],
  's-xlsx': ['xlsx'], 's-ods': ['ods'], 's-csv': ['csv'],
  'p-pptx': ['pptx'], 'p-odp': ['odp'],
  't-html': ['html'], 't-md': ['md'], 't-epub': ['epub'], 't-txt': ['txt'], 't-wiki': ['mediawiki'], 't-fb2': ['fb2'],
  'sub-srt': ['srt'], 'sub-vtt': ['vtt'], 'sub-ass': ['ass'],
};

// Destino recomendado por defecto según el formato de entrada.
const DEFAULT_TARGET = {
  jpeg: 'img-webp', png: 'img-webp', webp: 'img-jpeg', avif: 'img-jpeg', tiff: 'img-jpeg', gif: 'img-png',
  heic: 'img-jpeg', svg: 'img-png', bmp: 'img-png', ico: 'img-png', tga: 'img-png', psd: 'img-png',
  jxl: 'img-jpeg', jp2: 'img-jpeg', dds: 'img-png', exr: 'img-png',
  wav: 'a-mp3', flac: 'a-mp3', aiff: 'a-mp3', mp3: 'a-m4a', video: 'v-mp4', mp4: 'v-webm',
  doc: 'd-pdf', sheet: 's-pdf', slides: 'p-pdf', pdf: 'pdf-compress',
  md: 't-docx', html: 't-docx', epub: 't-docx', txt: 't-docx', srt: 'sub-vtt', vtt: 'sub-srt',
};

// Lista de salidas válidas para un archivo ya analizado.
function outputsFor(file) {
  const fam = file.family;
  let list = (FAMILY_OUTPUTS[fam] || []).filter((id) => !(SAME[id] || []).includes(file.format));
  if (fam === 'video' && !(file.meta && file.meta.hasAudio)) list = list.filter((id) => !OUT[id].needsAudio);
  // Los GIF animados también a vídeo; los fijos no.
  if (file.format === 'gif' && file.meta && file.meta.animated) list = ['gif-mp4', 'gif-webm', ...list];
  // DOCX y ODT, además, con Pandoc a Markdown, HTML y EPUB.
  if (file.format === 'docx' || file.format === 'odt') list = [...list, 'd-md', 'd-html', 'd-epub'];
  return list;
}

function defaultTarget(file, outputs) {
  const pref = DEFAULT_TARGET[file.format] || DEFAULT_TARGET[file.family];
  if (pref && outputs.includes(pref)) return pref;
  if (file.family === 'video' && outputs.includes('v-mp4')) return 'v-mp4';
  if (file.family === 'audio' && outputs.includes('a-mp3')) return 'a-mp3';
  if (file.family === 'text' && outputs.includes('t-docx')) return 't-docx';
  return outputs[0];
}

// Valida y normaliza las opciones de un destino. Devuelve {options} o {error}.
function validateOptions(outId, input) {
  const out = OUT[outId];
  const res = {};
  input = input && typeof input === 'object' ? input : {};
  for (const o of out.options) {
    let v = input[o.key];
    if (v === undefined || v === null || v === '') v = o.default;
    if (o.type === 'select') {
      v = String(v);
      if (!o.choices.some(([k]) => k === v)) return { error: `Opción no válida: ${o.label}.` };
    } else if (o.type === 'range') {
      v = Math.round(Number(v));
      if (!Number.isFinite(v) || v < o.min || v > o.max) return { error: `${o.label} debe estar entre ${o.min} y ${o.max}.` };
    } else if (o.type === 'toggle') {
      v = v === true || v === 'true' || v === 1 || v === '1';
    } else if (o.type === 'text') {
      v = String(v).trim().slice(0, 200);
    }
    res[o.key] = v;
  }
  return { options: res };
}

// Cliente: una vista reducida (sin detalles internos).
function publicOutput(id) {
  const o = OUT[id];
  return {
    id, label: o.label, ext: o.ext, progress: o.progress, note: o.note || null,
    options: o.options.map((x) => ({ ...x })),
  };
}

module.exports = { INPUTS, OUT, FAMILY_LABEL, FAMILY_OUTPUTS, outputsFor, defaultTarget, validateOptions, publicOutput };
