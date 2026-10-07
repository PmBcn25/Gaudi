'use strict';
// Limpieza (systemd timer cada 10 minutos): borra todo lo que supere los 30 minutos.
// Un archivo con una conversión en marcha se respeta hasta que termina (máximo 60 min).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { open } = require('./db');

const db = open();
const now = Date.now();
const ttl = config.limits.fileTtlMs;
let removed = 0;

const active = new Set(db.prepare("SELECT DISTINCT file_id FROM jobs WHERE status IN ('queued','running')").all().map((r) => r.file_id));
const old = db.prepare('SELECT id, created_at FROM files WHERE created_at < ?').all(now - ttl);
for (const f of old) {
  if (active.has(f.id) && now - f.created_at < 2 * ttl) continue;
  db.prepare("UPDATE jobs SET status='canceled' WHERE file_id=? AND status IN ('queued','running')").run(f.id);
  db.prepare('DELETE FROM jobs WHERE file_id=?').run(f.id);
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  fs.rmSync(path.join(config.tmpDir, f.id), { recursive: true, force: true });
  removed++;
}

// Carpetas huérfanas (subidas cortadas, análisis fallidos…) por fecha de modificación.
const known = new Set(db.prepare('SELECT id FROM files').all().map((r) => r.id));
for (const name of fs.existsSync(config.tmpDir) ? fs.readdirSync(config.tmpDir) : []) {
  if (known.has(name)) continue;
  const p = path.join(config.tmpDir, name);
  try {
    const st = fs.statSync(p);
    if (now - st.mtimeMs > ttl) { fs.rmSync(p, { recursive: true, force: true }); removed++; }
  } catch { /* desapareció */ }
}
db.prepare('DELETE FROM jobs WHERE file_id NOT IN (SELECT id FROM files)').run();
db.pragma('wal_checkpoint(TRUNCATE)');
console.log(`limpieza: ${removed} elementos borrados`);
