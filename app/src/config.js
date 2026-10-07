'use strict';
// Configuración central. Todo se puede sobrescribir por variables de entorno
// (útil en desarrollo), pero los valores por defecto son los de producción.
const path = require('path');

const DATA = process.env.CONVERTIA_DATA || '/var/conversor';
const MB = 1024 * 1024;

module.exports = {
  brand: 'Convertia',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3100),

  dataDir: DATA,
  tmpDir: path.join(DATA, 'tmp'),
  dbFile: path.join(DATA, 'db', 'queue.sqlite'),
  socketPath: path.join(DATA, 'run', 'worker.sock'),
  homeDir: path.join(DATA, 'home'),
  publicDir: path.join(__dirname, '..', 'public'),
  luaDir: path.join(__dirname, 'lua'),

  limits: {
    concurrentJobs: 2, // trabajos simultáneos en total
    concurrentOffice: 1, // procesos de LibreOffice a la vez
    uploadVideo: 200 * MB,
    uploadOther: 50 * MB,
    videoSeconds: 5 * 60,
    conversionsPerHour: 20,
    uploadsPerHour: 120,
    jobTimeoutMs: 15 * 60 * 1000,
    analyzeTimeoutMs: 60 * 1000,
    fileTtlMs: 30 * 60 * 1000,
    maxFilesPerMerge: 30,
  },
};
