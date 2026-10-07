'use strict';
// Enlace con el worker: socket Unix en /var/conversor/run. El worker (sin red)
// se conecta aquí; por él llegan el análisis de las subidas y el progreso real.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { EventEmitter } = require('events');
const config = require('./config');

class Hub extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.pending = new Map();
    this.rid = 0;
  }

  get connected() { return !!(this.sock && !this.sock.destroyed); }

  listen() {
    fs.mkdirSync(path.dirname(config.socketPath), { recursive: true });
    try { fs.unlinkSync(config.socketPath); } catch { /* no existía */ }
    const server = net.createServer((s) => this.attach(s));
    return new Promise((resolve) => server.listen(config.socketPath, () => {
      fs.chmodSync(config.socketPath, 0o660);
      resolve();
    }));
  }

  attach(s) {
    if (this.sock) this.sock.destroy();
    this.sock = s;
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        this.onMessage(msg);
      }
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (this.sock !== s) return;
      this.sock = null;
      for (const [, p] of this.pending) p.reject(Object.assign(new Error('worker caído'), { status: 503 }));
      this.pending.clear();
      this.emit('down');
    });
  }

  onMessage(msg) {
    if (msg.t === 'hello') this.emit('up');
    else if (msg.t === 'analyzed') {
      const p = this.pending.get(msg.rid);
      if (!p) return;
      this.pending.delete(msg.rid);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(Object.assign(new Error(msg.error), { status: 422, user: true, code: msg.code }));
    } else if (msg.t === 'job') this.emit('job', msg);
  }

  send(msg) {
    if (!this.connected) return false;
    this.sock.write(JSON.stringify(msg) + '\n');
    return true;
  }

  analyze(fileId, name, size) {
    return new Promise((resolve, reject) => {
      const rid = ++this.rid;
      if (!this.send({ t: 'analyze', rid, fileId, name, size })) {
        return reject(Object.assign(new Error('worker no disponible'), { status: 503 }));
      }
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(Object.assign(new Error('El análisis del archivo ha tardado demasiado.'), { status: 422, user: true }));
      }, config.limits.analyzeTimeoutMs + 30000);
      this.pending.set(rid, { resolve, reject, timer });
    });
  }
}

module.exports = new Hub();
