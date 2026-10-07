'use strict';
// Documentos: LibreOffice (headless, uno a la vez), Ghostscript + qpdf para PDF,
// Pandoc para texto y libros, FFmpeg para subtítulos.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc');
const { UserError, explain } = require('./errors');
const { inputArgs } = require('./media');
const { decodeText } = require('../detect');
const config = require('../config');

const toolEnv = () => ({
  PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: config.homeDir, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
  XDG_CACHE_HOME: path.join(config.homeDir, '.cache'), XDG_CONFIG_HOME: path.join(config.homeDir, '.config'),
  XDG_DATA_HOME: path.join(config.homeDir, '.local', 'share'), TMPDIR: path.join(config.homeDir, 'tmp'),
});

async function zipFiles(files, out, signal) {
  await run('zip', ['-q', '-j', '-X', out, ...files], { signal, nice: true });
}

// ---------------------------------------------------------------- LibreOffice
const LO_NAMES = { doc: 'documento', sheet: 'hoja de cálculo', slides: 'presentación' };
const LO_FILTER = {
  'd-pdf': 'pdf:writer_pdf_Export', 'd-docx': 'docx:MS Word 2007 XML', 'd-odt': 'odt:writer8',
  'd-rtf': 'rtf:Rich Text Format', 'd-txt': 'txt:Text (encoded):UTF8',
  's-pdf': 'pdf:calc_pdf_Export', 's-xlsx': 'xlsx:Calc MS Excel 2007 XML', 's-ods': 'ods:calc8',
  // Cada hoja a su propio CSV (último parámetro -1), UTF-8, coma y comillas dobles.
  's-csv': 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1',
  'p-pdf': 'pdf:impress_pdf_Export', 'p-pptx': 'pptx:Impress MS PowerPoint 2007 XML', 'p-odp': 'odp:impress8',
};

async function soffice(input, outDir, filter, { signal, infilter }) {
  const profile = path.join(config.homeDir, 'lo-profile');
  fs.mkdirSync(path.join(config.homeDir, 'tmp'), { recursive: true });
  const args = [`-env:UserInstallation=file://${profile}`, '--headless', '--invisible', '--nocrashreport', '--nodefault',
    '--nofirststartwizard', '--nolockcheck', '--nologo', '--norestore',
    ...(infilter ? [`--infilter=${infilter}`] : []), '--convert-to', filter, '--outdir', outDir, input];
  try {
    const r = await run('soffice', args, { signal, nice: true, env: toolEnv() });
    return r.stdout.toString('utf8') + r.stderr;
  } catch (err) {
    try { fs.rmSync(path.join(profile, '.lock'), { force: true }); } catch { /* nada */ }
    throw err;
  }
}

// CSV/TSV: separador detectado de verdad (en España es habitual el punto y coma) y texto a UTF-8.
function prepareCsv(file, input, workDir) {
  const raw = fs.readFileSync(input);
  const { text } = decodeText(raw);
  const out = path.join(workDir, `in.${file.format}`);
  fs.writeFileSync(out, text.replace(/^﻿/, ''), 'utf8');
  let sep = file.format === 'tsv' ? 9 : 44;
  if (file.format === 'csv') {
    const lines = text.split(/\r?\n/).slice(0, 20).filter(Boolean);
    const score = (ch) => {
      const counts = lines.map((l) => l.split(ch).length - 1);
      if (!counts.length || counts[0] === 0) return 0;
      const same = counts.filter((c) => c === counts[0]).length;
      return same * 100 + counts[0];
    };
    const best = [[',', 44], [';', 59], ['\t', 9], ['|', 124]].map(([c, n]) => [score(c), n]).sort((a, b) => b[0] - a[0])[0];
    if (best[0] > 0) sep = best[1];
  }
  return { path: out, infilter: `CSV:${sep},34,76,1` };
}

async function office(ctx) {
  const { job, file, input, outDir, signal } = ctx;
  const filter = LO_FILTER[job.target];
  const from = (file.format || '').toUpperCase();
  const to = job.target.split('-')[1].toUpperCase();
  let src = input;
  let infilter;
  const work = path.join(outDir, 'lo');
  fs.mkdirSync(work, { recursive: true });
  if (file.format === 'csv' || file.format === 'tsv') ({ path: src, infilter } = prepareCsv(file, input, work));
  ctx.stage(`LibreOffice: ${from} → ${to}`);
  const log = await soffice(src, work, filter, { signal, infilter });
  let outs = fs.readdirSync(work).filter((f) => f.toLowerCase().endsWith('.' + job.target.split('-')[1]) && path.join(work, f) !== src);
  if (!outs.length) {
    const why = /password/i.test(log) ? 'está protegido con contraseña' : 'parece dañado o no es un ' + (LO_NAMES[file.family] || 'documento') + ' válido';
    throw new UserError(`LibreOffice no ha podido abrir el archivo: ${why}.`, /password/i.test(log) ? 'protected' : 'corrupt');
  }
  outs = outs.sort();
  if (job.target === 's-csv' && outs.length > 1) {
    ctx.stage('Comprimiendo las hojas en un ZIP');
    const renamed = outs.map((f) => {
      const sheet = f.replace(/^in-?/, '').replace(/\.csv$/i, '') || 'hoja';
      const dst = path.join(work, `${ctx.baseName}-${sheet}.csv`.replace(/[\\/]/g, '_'));
      fs.renameSync(path.join(work, f), dst);
      return dst;
    });
    const zip = ctx.setOutput('zip', 'application/zip');
    await zipFiles(renamed, zip, signal);
  } else {
    fs.renameSync(path.join(work, outs[0]), ctx.outPath);
  }
  fs.rmSync(work, { recursive: true, force: true });
  if (job.target.endsWith('-pdf')) await ctx.pdfThumb(ctx.outPath);
}

// ---------------------------------------------------------------- PDF
const GS = ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dNOPROMPT'];

async function gs(args, ctx, pages) {
  // Ghostscript anuncia "Page N" al terminar cada página: con el total, es un porcentaje real.
  let done = 0;
  try {
    await run('gs', [...GS, ...args], {
      signal: ctx.signal, nice: true, env: toolEnv(),
      onStdout: (line) => {
        const m = /^Page (\d+)/.exec(line);
        if (m && pages) { done = Number(m[1]); ctx.progress({ fraction: Math.min(1, (done - 1) / pages), page: done, pages }); }
      },
    });
  } catch (err) {
    throw explain(err, 'pdf') || new UserError('Ghostscript no ha podido procesar el PDF; puede estar dañado.', 'corrupt');
  }
  if (pages) ctx.progress({ fraction: 1, page: pages, pages });
}

async function qpdf(args, ctx) {
  try {
    // qpdf devuelve 3 cuando termina con avisos: es un éxito.
    return await run('qpdf', args, { signal: ctx.signal, nice: true, okCodes: [0, 3] });
  } catch (err) {
    throw explain(err, 'pdf') || new UserError('qpdf no ha podido procesar el PDF; puede estar dañado.', 'corrupt');
  }
}

// "1-3,5" -> valida contra el número de páginas.
function parsePages(spec, total) {
  const s = String(spec || '').replace(/\s+/g, '');
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(s)) {
    throw new UserError('Escribe las páginas como en "1-3,5": números y rangos separados por comas.', 'invalid');
  }
  for (const part of s.split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (a < 1 || (b !== undefined && b < a)) throw new UserError(`El rango "${part}" no es válido.`, 'invalid');
    const hi = b === undefined ? a : b;
    if (hi > total) throw new UserError(`Ese PDF solo tiene ${total} página${total === 1 ? '' : 's'}: no existe la página ${hi}.`, 'invalid');
  }
  return s;
}

async function pdfThumb(pdf, outJpg, signal) {
  await run('gs', [...GS, '-q', '-sDEVICE=jpeg', '-dJPEGQ=80', '-r40', '-dFirstPage=1', '-dLastPage=1',
    '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${outJpg}`, pdf], { signal, nice: true, env: toolEnv() });
}

async function pdfPages(input, signal) {
  try {
    const r = await run('qpdf', ['--show-npages', input], { signal, okCodes: [0, 3] });
    return parseInt(r.stdout.toString(), 10);
  } catch (err) {
    if (/invalid password|password/i.test(err.stderr || '')) {
      throw new UserError('El PDF está protegido con contraseña. Quítale la contraseña y vuelve a subirlo.', 'protected');
    }
    throw new UserError('El PDF está dañado y no se puede leer.', 'corrupt');
  }
}

async function analyzePdf(file, input, dir, signal) {
  const pages = await pdfPages(input, signal);
  if (!(pages > 0)) throw new UserError('El PDF no tiene páginas o está dañado.', 'corrupt');
  const meta = { pages };
  await pdfThumb(input, path.join(dir, 'thumb.jpg'), signal).catch(() => {});
  if (fs.existsSync(path.join(dir, 'thumb.jpg'))) meta.thumb = 'thumb.jpg';
  return meta;
}

async function pdf(ctx) {
  const { job, file, input, outDir, signal } = ctx;
  const o = job.options;
  const pages = file.meta.pages;
  switch (job.target) {
    case 'pdf-compress':
      ctx.stage('Ghostscript: comprimiendo');
      await gs(['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=/${o.level}`, '-dDetectDuplicateImages=true',
        `-sOutputFile=${ctx.outPath}`, input], ctx, pages);
      break;
    case 'pdf-gray':
      ctx.stage('Ghostscript: pasando a escala de grises');
      await gs(['-sDEVICE=pdfwrite', '-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray', '-dOverrideICC',
        '-dCompatibilityLevel=1.5', `-sOutputFile=${ctx.outPath}`, input], ctx, pages);
      break;
    case 'pdf-txt':
      ctx.stage('Ghostscript: extrayendo el texto');
      await gs(['-sDEVICE=txtwrite', `-sOutputFile=${ctx.outPath}`, input], ctx, pages);
      break;
    case 'pdf-jpg': case 'pdf-png': {
      const isJpg = job.target === 'pdf-jpg';
      const dir = path.join(outDir, 'pages');
      fs.mkdirSync(dir, { recursive: true });
      ctx.stage(`Ghostscript: renderizando páginas a ${o.dpi} ppp`);
      await gs([isJpg ? '-sDEVICE=jpeg' : '-sDEVICE=png16m', ...(isJpg ? ['-dJPEGQ=90'] : []), `-r${o.dpi}`,
        '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${path.join(dir, `${ctx.baseName}-%03d.${isJpg ? 'jpg' : 'png'}`)}`, input], ctx, pages);
      const imgs = fs.readdirSync(dir).sort().map((f) => path.join(dir, f));
      if (imgs.length === 1) {
        fs.renameSync(imgs[0], ctx.outPath);
      } else {
        ctx.stage('Comprimiendo las páginas en un ZIP');
        await zipFiles(imgs, ctx.setOutput('zip', 'application/zip'), signal);
      }
      fs.rmSync(dir, { recursive: true, force: true });
      break;
    }
    case 'pdf-extract': {
      const range = parsePages(o.pages, pages);
      ctx.stage('qpdf: extrayendo páginas');
      await qpdf(['--decrypt', input, '--pages', '.', range, '--', ctx.outPath], ctx);
      break;
    }
    case 'pdf-rotate':
      ctx.stage('qpdf: rotando páginas');
      await qpdf(['--decrypt', input, ctx.outPath, `--rotate=+${o.angle}:1-z`], ctx);
      break;
    case 'pdf-split': {
      if (pages === 1) { ctx.stage('qpdf: el PDF solo tiene una página'); ctx.setOutput('pdf', 'application/pdf'); await qpdf(['--decrypt', input, ctx.outPath], ctx); break; }
      const dir = path.join(outDir, 'split');
      fs.mkdirSync(dir, { recursive: true });
      ctx.stage('qpdf: separando páginas');
      await qpdf(['--decrypt', '--split-pages', input, path.join(dir, `${ctx.baseName}-pagina-%d.pdf`)], ctx);
      ctx.stage('Comprimiendo en un ZIP');
      await zipFiles(fs.readdirSync(dir).sort().map((f) => path.join(dir, f)), ctx.outPath, signal);
      fs.rmSync(dir, { recursive: true, force: true });
      break;
    }
    case 'pdf-merge': {
      ctx.stage(`qpdf: uniendo ${ctx.inputs.length} PDF`);
      const list = [];
      for (const i of ctx.inputs) list.push(i.path);
      await qpdf(['--decrypt', '--empty', '--pages', ...list, '--', ctx.outPath], ctx);
      break;
    }
    default:
      throw new UserError('Operación de PDF no soportada.', 'unsupported');
  }
  if (job.target === 'pdf-compress' || job.target === 'pdf-gray' || job.target === 'pdf-merge' || job.target === 'pdf-rotate' || job.target === 'pdf-extract') {
    await ctx.pdfThumb(ctx.outPath);
  }
}

// ---------------------------------------------------------------- Pandoc
const READER = {
  md: 'markdown', html: 'html', epub: 'epub', txt: 'markdown+hard_line_breaks-raw_html-raw_tex-tex_math_dollars',
  textile: 'textile', ipynb: 'ipynb', fb2: 'fb2', mediawiki: 'mediawiki', opml: 'opml', docx: 'docx', odt: 'odt',
};
const STANDALONE = new Set(['html', 'latex', 'rtf', 'fb2', 'epub3', 'docx', 'odt', 'pptx']);

async function pandocRun(ctx, from, to, out, extra = []) {
  const work = path.join(ctx.outDir, 'pandoc');
  fs.mkdirSync(work, { recursive: true }); // carpeta de trabajo vacía: no hay nada que incluir
  const title = ctx.baseName.replace(/[\r\n]/g, ' ').slice(0, 120);
  const args = ['+RTS', '-M1500m', '-RTS', '-f', from, '-t', to, '--lua-filter', path.join(config.luaDir, 'safe.lua'),
    '--resource-path', '.', ...(STANDALONE.has(to) ? ['--standalone'] : []),
    ...(to === 'html' ? ['--embed-resources', '--metadata', `pagetitle=${title}`] : []),
    ...(to === 'epub3' ? ['--metadata', `title=${title}`] : []), ...extra, '-o', out, ctx.input];
  try {
    await run('pandoc', args, { cwd: work, signal: ctx.signal, nice: true, env: toolEnv() });
  } catch (err) {
    if (err.user) throw err;
    throw explain(err, 'pandoc') || new UserError('Pandoc no ha podido convertir el documento.', 'failed');
  }
  return work;
}

const NAMES = { markdown: 'Markdown', html: 'HTML', epub: 'EPUB', textile: 'Textile', ipynb: 'Jupyter', fb2: 'FB2', mediawiki: 'MediaWiki',
  opml: 'OPML', docx: 'DOCX', odt: 'ODT', gfm: 'Markdown', epub3: 'EPUB', pptx: 'PPTX', rtf: 'RTF', plain: 'texto', latex: 'LaTeX',
  rst: 'rST', asciidoc: 'AsciiDoc', org: 'Org' };

async function pandoc(ctx) {
  const { job, file, outDir, signal } = ctx;
  const from = READER[file.format];
  if (!from) throw new UserError('Este formato no se puede convertir con Pandoc.', 'unsupported');
  const fromName = file.format === 'txt' ? 'texto' : NAMES[from.split(/[+-]/)[0]];
  // DOCX/ODT -> Markdown, HTML o EPUB.
  if (job.target.startsWith('d-')) {
    const to = { 'd-md': 'gfm', 'd-html': 'html', 'd-epub': 'epub3' }[job.target];
    ctx.stage(`Pandoc: ${fromName} → ${NAMES[to]}`);
    if (to === 'gfm') {
      const md = path.join(outDir, 'pandoc-out.md');
      const work = await pandocRun(ctx, from, to, md, ['--extract-media=media', '--wrap=none']);
      const media = path.join(work, 'media');
      if (fs.existsSync(media) && fs.readdirSync(media).length) {
        // Con imágenes: Markdown + carpeta media/ en un ZIP.
        fs.renameSync(md, path.join(work, `${ctx.baseName}.md`));
        ctx.stage('Comprimiendo Markdown e imágenes en un ZIP');
        await run('zip', ['-q', '-r', '-X', ctx.setOutput('zip', 'application/zip'), `${ctx.baseName}.md`, 'media'], { cwd: work, signal, nice: true });
      } else {
        fs.renameSync(md, ctx.outPath);
      }
    } else {
      await pandocRun(ctx, from, to, ctx.outPath);
    }
    return;
  }
  const out = require('../formats').OUT[job.target];
  if (job.target === 't-pdf') {
    // Dos etapas reales: Pandoc -> ODT y LibreOffice -> PDF.
    ctx.stage(`Pandoc: ${fromName} → ODT`, 1, 2);
    const odt = path.join(outDir, 'etapa1.odt');
    await pandocRun(ctx, from, 'odt', odt);
    ctx.stage('LibreOffice: ODT → PDF', 2, 2);
    const lo = path.join(outDir, 'lo');
    fs.mkdirSync(lo, { recursive: true });
    await soffice(odt, lo, 'pdf:writer_pdf_Export', { signal });
    const pdfOut = path.join(lo, 'etapa1.pdf');
    if (!fs.existsSync(pdfOut)) throw new UserError('LibreOffice no ha podido generar el PDF.', 'failed');
    fs.renameSync(pdfOut, ctx.outPath);
    fs.rmSync(lo, { recursive: true, force: true });
    fs.rmSync(odt, { force: true });
    await ctx.pdfThumb(ctx.outPath);
    return;
  }
  ctx.stage(`Pandoc: ${fromName} → ${NAMES[out.to] || out.label}`);
  await pandocRun(ctx, from, out.to, ctx.outPath, out.to === 'gfm' || out.to === 'plain' ? ['--wrap=none'] : []);
}

// ---------------------------------------------------------------- Subtítulos
async function subtitle(ctx) {
  const { job, file, input, signal } = ctx;
  const out = require('../formats').OUT[job.target];
  const pre = file.meta && file.meta.encoding && file.meta.encoding !== 'utf-8' ? ['-sub_charenc', file.meta.encoding === 'windows-1252' ? 'CP1252' : file.meta.encoding.toUpperCase()] : [];
  ctx.stage(`Convirtiendo a ${out.label}`);
  try {
    await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...inputArgs(input, pre), '-map', '0:s:0', '-c:s', out.fmt === 'webvtt' ? 'webvtt' : out.fmt,
      '-f', out.fmt, ctx.outPath], { signal, nice: true });
  } catch (err) {
    throw explain(err, 'subtitle');
  }
}

async function analyzeSubtitle(file, input, signal) {
  const pre = file.meta && file.meta.encoding && file.meta.encoding !== 'utf-8' ? ['-sub_charenc', 'CP1252'] : [];
  const { stdout } = await run('ffprobe', ['-v', 'error', ...inputArgs(input, pre).slice(0, -2), '-i', input, '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0'], { signal }).catch(() => ({ stdout: Buffer.from('') }));
  if (!/subtitle/.test(stdout.toString())) throw new UserError('El archivo de subtítulos no tiene un formato válido.', 'corrupt');
}

module.exports = { office, pdf, pandoc, subtitle, analyzePdf, analyzeSubtitle, pdfThumb, parsePages, toolEnv };
