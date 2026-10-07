// Ejecutor de casos de conversión por tandas. El límite es de 20 conversiones por hora
// e IP (y NO se sube): entre tandas se reinicia el servicio web con RESTART_CMD
// (en producción: scripts/vps.sh 'systemctl restart convertia-web').
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BASE, FIX, upload, convert, MAGIC, probe, save, kb } from './lib.mjs';

export async function restartWeb() {
  const cmd = process.env.RESTART_CMD;
  if (!cmd) throw new Error('Falta RESTART_CMD para reiniciar el servicio web entre tandas.');
  execSync(cmd, { stdio: 'ignore', shell: '/bin/bash' });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + 'api/health');
      if (r.ok && (await r.json()).worker) return;
    } catch { /* aún no responde */ }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error('El servicio web no volvió tras el reinicio');
}

// Un caso: { name, file | from (nombre de un resultado anterior), target, options, magic, check(buf, result) }
export async function runCases(cases, { batch = 20, label = 'casos' } = {}) {
  const results = [];
  const produced = new Map();
  let used = 0;
  for (const c of cases) {
    if (used >= batch) { process.stdout.write(`   … tanda completa (${used} conversiones): reiniciando el servicio web\n`); await restartWeb(); used = 0; }
    const t0 = performance.now();
    let src = c.file ? path.join(FIX, c.file) : produced.get(c.from);
    let r;
    try {
      if (!src) throw new Error(`no hay resultado previo "${c.from}"`);
      used++;
      r = await convert(src, c.target, c.options || {});
      if (r.error) throw new Error(r.error);
      const magic = MAGIC[c.magic];
      if (!magic) throw new Error(`sin comprobador de cabecera para ${c.magic}`);
      if (!magic(r.buf)) throw new Error(`la cabecera no es ${c.magic} (${r.buf.subarray(0, 12).toString('hex')})`);
      let detail = '';
      if (c.check) detail = (await c.check(r.buf, r.result)) || '';
      const out = save(`${c.name}.${c.saveExt || r.result.name.split('.').pop()}`, r.buf);
      produced.set(c.name, out);
      const ms = Math.round(performance.now() - t0);
      results.push({ name: c.name, ok: true, ms, size: r.buf.length, detail });
      console.log(`  ✓ ${c.name.padEnd(30)} ${c.magic.padEnd(5)} ${kb(r.buf.length).padStart(10)} ${String(ms).padStart(6)} ms ${detail}`);
    } catch (err) {
      results.push({ name: c.name, ok: false, error: err.message });
      console.log(`  ✗ ${c.name.padEnd(30)} ${err.message}`);
    }
  }
  const ok = results.filter((x) => x.ok).length;
  console.log(`\n${label}: ${ok}/${results.length} correctas`);
  return results;
}

// Comprobaciones con ffprobe.
export const codec = (type, name) => (buf, res) => {
  const p = probe(buf, res.name.split('.').pop());
  const s = p.streams.find((x) => x.codec_type === type);
  if (!s) throw new Error(`no hay pista de ${type}`);
  if (name && s.codec_name !== name) throw new Error(`códec ${s.codec_name}, se esperaba ${name}`);
  const d = p.format && p.format.duration ? ` ${(+p.format.duration).toFixed(1)} s` : '';
  return `${s.codec_name}${s.width ? ` ${s.width}×${s.height}` : ''}${d}`;
};

export function zipList(buf) {
  // Nombres del directorio central del ZIP.
  const names = [];
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const nl = buf.readUInt16LE(p + 28); const xl = buf.readUInt16LE(p + 30); const cl = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
  }
  return names;
}

export { fs, path, upload };
