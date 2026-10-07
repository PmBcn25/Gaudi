'use strict';
// Lanzar herramientas externas: siempre en su propio grupo de procesos (para poder
// matar también a los hijos, p. ej. soffice.bin), con prioridad baja si se pide
// y cancelables con una AbortSignal.
const { spawn } = require('child_process');
const { UserError } = require('./errors');

function run(cmd, args, opts = {}) {
  const { cwd, signal, nice = false, env, onStdout, onStderr, okCodes = [0], input, maxStdout = 64 * 1024 * 1024 } = opts;
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError(signal));
    const bin = nice ? 'nice' : cmd;
    const argv = nice ? ['-n', '10', cmd, ...args] : args;
    const child = spawn(bin, argv, {
      cwd, detached: true, env: env || process.env,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = [];
    let stdoutLen = 0;
    let errTail = '';
    let outBuf = '';
    let errBuf = '';
    const killGroup = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ya terminó */ }
    };
    const onAbort = () => killGroup();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => {
      if (onStdout) {
        outBuf += d.toString('utf8');
        let i;
        while ((i = outBuf.indexOf('\n')) >= 0) { onStdout(outBuf.slice(0, i).replace(/\r$/, '')); outBuf = outBuf.slice(i + 1); }
      } else if (stdoutLen < maxStdout) { stdout.push(d); stdoutLen += d.length; }
    });
    child.stderr.on('data', (d) => {
      const s = d.toString('utf8');
      errTail = (errTail + s).slice(-16384);
      if (onStderr) {
        errBuf += s;
        let i;
        while ((i = errBuf.search(/[\r\n]/)) >= 0) { const line = errBuf.slice(0, i); errBuf = errBuf.slice(i + 1); if (line) onStderr(line); }
      }
    });
    if (input) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err.code === 'ENOENT' ? new Error(`Falta la herramienta ${cmd} en el servidor`) : err);
    });
    child.on('close', (code, sig) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      killGroup(); // por si quedaron nietos vivos
      if (onStdout && outBuf) onStdout(outBuf);
      if (onStderr && errBuf) onStderr(errBuf);
      if (signal && signal.aborted) return reject(abortError(signal));
      const out = Buffer.concat(stdout);
      if (code !== null && okCodes.includes(code)) return resolve({ code, stdout: out, stderr: errTail });
      const e = new Error(`${cmd} terminó con ${code === null ? 'señal ' + sig : 'código ' + code}`);
      e.code = code; e.stderr = errTail; e.cmd = cmd;
      reject(e);
    });
  });
}

function abortError(signal) {
  const r = signal.reason;
  if (r instanceof Error) return r;
  return new UserError('Conversión cancelada.', 'canceled');
}

module.exports = { run };
