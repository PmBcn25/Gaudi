// Errores claros, cola real (posiciones "1º de 2"), un solo LibreOffice a la vez,
// cancelar uno en cola y otro en marcha, y el límite de 20 conversiones por hora.
import path from 'node:path';
import { FIX, upload, createJob, follow, cancel } from './lib.mjs';
import { restartWeb } from './runner.mjs';

let fails = 0;
const check = (ok, label, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); };

console.log('\nErrores en lenguaje claro');
const bad = [
  ['corrupt.jpg', /dañada|incompleta/], ['corrupt.pdf', /PDF está dañado/], ['corrupt.docx', /dañado|incompleto/],
  ['truncated.mp4', /incompleto|dañado/], ['fake.png', /solo hay texto/], ['random.xyz', /no está soportado/],
  ['playlist.m3u8', /listas de reproducción/], ['evil.tex', /Por seguridad/], ['locked.pdf', /contraseña/],
];
for (const [f, re] of bad) {
  const r = await upload(path.join(FIX, f));
  check(r.status >= 400 && r.status < 500 && re.test(r.error || ''), `${f.padEnd(14)} → ${r.status}`, `«${r.error}»`);
}
{
  const up = await upload(path.join(FIX, 'pages.pdf'));
  const r = await createJob(up.file.id, 'pdf-extract', { pages: '1-9' });
  check(r.status === 400 && /solo tiene 6 páginas/.test(r.error), 'extraer 1-9 de un PDF de 6 páginas', `«${r.error}»`);
  const r2 = await createJob(up.file.id, 'v-mp4', {});
  check(r2.status === 400 && /No se puede convertir/.test(r2.error), 'pedir MP4 a partir de un PDF', `«${r2.error}»`);
  const r3 = await createJob(up.file.id, 'pdf-extract', { pages: 'tres' });
  check(r3.status === 400 && /1-3,5/.test(r3.error), 'páginas mal escritas', `«${r3.error}»`);
}

console.log('\nCola real con 4 trabajos a la vez (máximo 2 simultáneos)');
await restartWeb();
const vid = await upload(path.join(FIX, 'long1080.mp4'));
const jobs = [];
for (let i = 0; i < 4; i++) jobs.push((await createJob(vid.file.id, 'v-webm', { quality: 'baja' })).job);
const seen = jobs.map(() => new Set());
const states = jobs.map(() => []);
const followers = jobs.map((j, i) => follow(j.id, {
  onEvent: (e) => { states[i].push(e.status); if (e.status === 'queued') seen[i].add(`${e.position}º de ${e.waiting}`); },
}));
await new Promise((r) => setTimeout(r, 2500));
console.log(`  posiciones vistas: ${jobs.map((j, i) => `#${i + 1} [${[...seen[i]].join(', ') || 'en marcha'}]`).join('  ')}`);
check(seen[2].has('1º de 2') && seen[3].has('2º de 2'), 'el 3.º espera «1º de 2» y el 4.º «2º de 2»');
await cancel(jobs[3].id); // cancelar uno en cola
await new Promise((r) => setTimeout(r, 500));
await cancel(jobs[0].id); // cancelar uno en marcha
const res = await Promise.race([Promise.all(followers.slice(0, 1).concat(followers.slice(3))), new Promise((r) => setTimeout(() => r(null), 15000))]);
check(res && res[0].at(-1).status === 'canceled', 'cancelar el que estaba en marcha', res ? res[0].at(-1).status : 'sin respuesta');
check(res && res[1].at(-1).status === 'canceled', 'cancelar el que estaba en cola', res ? res[1].at(-1).status : 'sin respuesta');
await new Promise((r) => setTimeout(r, 2500));
check(states[2].includes('running'), 'al liberarse un hueco, el 3.º pasa de la cola a convertirse', states[2].filter((s, i, a) => s !== a[i - 1]).join(' → '));
await cancel(jobs[1].id); await cancel(jobs[2].id);
await Promise.all(followers);

console.log('\nUn solo LibreOffice a la vez');
await restartWeb();
const d1 = await upload(path.join(FIX, 'report.docx'));
const d2 = await upload(path.join(FIX, 'deck.pptx'));
const lo1 = (await createJob(d1.file.id, 'd-pdf')).job;
const lo2 = (await createJob(d2.file.id, 'p-pdf')).job;
const ev2 = [];
const [e1, e2] = await Promise.all([follow(lo1.id), follow(lo2.id, { onEvent: (e) => ev2.push(e) })]);
const queuedWhileOneRunning = ev2.some((e) => e.status === 'queued' && e.running === 1);
check(queuedWhileOneRunning && e1.at(-1).status === 'done' && e2.at(-1).status === 'done',
  'el 2.º documento espera aunque haya un hueco libre, y ambos terminan', queuedWhileOneRunning ? 'esperó con 1 trabajo en marcha' : 'no esperó');

console.log('\nLímite de 20 conversiones por hora e IP');
await restartWeb();
const sub = await upload(path.join(FIX, 'subs.srt'));
let accepted = 0; let rejected = null;
for (let i = 0; i < 21; i++) {
  const r = await createJob(sub.file.id, i % 2 ? 'sub-ass' : 'sub-vtt');
  if (r.status === 201) { accepted++; await follow(r.job.id); } else { rejected = r; break; }
}
check(accepted === 20 && rejected && rejected.status === 429, `20 aceptadas y la 21.ª rechazada (${rejected ? rejected.status : '-'})`, rejected ? `«${rejected.error}»` : '');
await restartWeb();

console.log(`\nErrores, cola y límites: ${fails ? `${fails} FALLOS` : 'todo correcto'}`);
process.exitCode = fails ? 1 : 0;
