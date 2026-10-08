'use strict';
// Codifica MP3 con lamejs en un hilo aparte. El progreso es real: muestras codificadas / total.
importScripts('vendor/lame.min.js');

const clamp = (v) => (v > 1 ? 32767 : v < -1 ? -32768 : Math.round(v * 32767));

onmessage = ({ data }) => {
  try {
    const { left, right, rate, kbps, gain } = data;
    const enc = new lamejs.Mp3Encoder(right ? 2 : 1, rate, kbps);
    const block = 1152 * 16;
    const total = left.length;
    const L = new Int16Array(block);
    const R = right ? new Int16Array(block) : null;
    const parts = [];
    let last = 0;
    for (let i = 0; i < total; i += block) {
      const n = Math.min(block, total - i);
      for (let j = 0; j < n; j++) {
        L[j] = clamp(left[i + j] * gain);
        if (R) R[j] = clamp(right[i + j] * gain);
      }
      const out = R ? enc.encodeBuffer(L.subarray(0, n), R.subarray(0, n)) : enc.encodeBuffer(L.subarray(0, n));
      if (out.length) parts.push(new Uint8Array(out.buffer, out.byteOffset, out.length).slice());
      const now = performance.now();
      if (now - last > 100) { postMessage({ type: 'progress', done: i + n, total }); last = now; }
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end.buffer, end.byteOffset, end.length).slice());
    postMessage({ type: 'progress', done: total, total });
    postMessage({ type: 'done', parts }, parts.map((p) => p.buffer));
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
