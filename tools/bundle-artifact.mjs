#!/usr/bin/env node
// Empaqueta el panel en un único HTML (dist/catenaria.html) para publicarlo
// como página de claude.ai: estilos, datos y scripts van incrustados.
// Uso: npm run bundle
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);

const html = await readFile(rel('index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const css = await readFile(rel('assets/css/app.css'), 'utf8');
const fonts = (html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)">/) || [])[1];

// Evita que un "</script>" dentro de datos o reseñas cierre la etiqueta antes de tiempo.
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const parts = [];
parts.push('<title>Catenaria KDP</title>');
if (fonts) parts.push(`<link rel="stylesheet" href="${fonts}">`);
parts.push(`<style>\n${css}\n</style>`);
parts.push('<div id="app"><p style="padding:24px;font-family:system-ui,sans-serif">Cargando el panel…</p></div>');
parts.push('<script>window.KDP_ARTIFACT = true; window.KDP_OFFLINE_COVERS = true;</script>');
for (const src of scripts) {
  const file = rel(src);
  if (!existsSync(file)) { console.warn(`  (se omite ${src}: no existe)`); continue; }
  parts.push(`<script>/* ${src} */\n${safe(await readFile(file, 'utf8'))}\n</script>`);
}

await mkdir(rel('dist'), { recursive: true });
const out = parts.join('\n');
await writeFile(rel('dist/catenaria.html'), out);
console.log(`dist/catenaria.html · ${(out.length / 1024).toFixed(0)} KB · ${scripts.length} scripts incrustados`);
