'use strict';
// Cola de trabajos en SQLite (modo WAL: el servidor web y el worker la comparten).
// Ninguna tabla guarda IPs ni nada que identifique a quien sube un archivo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('./config');

function open() {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  const db = new Database(config.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      format TEXT,
      family TEXT,
      meta TEXT,
      virtual INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS jobs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      file_id TEXT NOT NULL,
      inputs TEXT,
      target TEXT NOT NULL,
      options TEXT NOT NULL,
      lo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      progress REAL,
      stage TEXT,
      error TEXT,
      result TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, seq);
    CREATE INDEX IF NOT EXISTS jobs_file ON jobs(file_id);
  `);
  return db;
}

// Identificador aleatorio largo (192 bits) e imposible de adivinar.
const newId = () => crypto.randomBytes(24).toString('base64url');

const parse = (s) => (s ? JSON.parse(s) : null);
function jobRow(r) {
  if (!r) return null;
  return { ...r, inputs: parse(r.inputs), options: parse(r.options) || {}, result: parse(r.result), lo: !!r.lo };
}
function fileRow(r) {
  if (!r) return null;
  return { ...r, meta: parse(r.meta) || {}, virtual: !!r.virtual };
}

module.exports = { open, newId, jobRow, fileRow };
