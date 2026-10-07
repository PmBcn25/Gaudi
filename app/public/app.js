'use strict';
(() => {
  const d = document;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
  const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${nf0.format(n / 1024)} KB` : n < 1073741824 ? `${nf1.format(n / 1048576)} MB` : `${nf1.format(n / 1073741824)} GB`);
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const left = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim(); };
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;

  // Cabecera con borde al hacer scroll.
  const top = $('.top');
  if (top) addEventListener('scroll', () => top.classList.toggle('sc', scrollY > 4), { passive: true });

  // Formularios de acceso (maqueta): no envían ni guardan nada.
  $$('form[data-mock]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    let m = $('.msg', f);
    if (!m) { m = d.createElement('p'); m.className = 'msg'; m.setAttribute('role', 'status'); f.append(m); }
    m.innerHTML = 'Las cuentas aún no están abiertas. El conversor funciona sin registro: <a href="./#herramienta">úsalo ahora</a>.';
  }));

  // ---------------------------------------------------------------- avisos
  const toasts = $('#toasts');
  function toast(msg, err) {
    if (!toasts) return;
    const t = d.createElement('div');
    t.className = `toast${err ? ' e' : ''}`;
    t.textContent = msg;
    toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3800);
  }

  // ---------------------------------------------------------------- muelles
  // Integración con tiempo real (subpasos de 1/120 s). Si el navegador no da
  // fotogramas (pestaña oculta), un temporizador de respaldo sigue avanzando.
  const springs = new Set();
  let last = 0;
  let raf = 0;
  function step(now) {
    const dt = (now - last) / 1000;
    last = now;
    for (const s of springs) {
      if (dt > 3) { s.x = s.t; s.v = 0; } else if (dt > 0) {
        let n = Math.ceil(dt * 120); const h = dt / n;
        while (n--) { s.v += (-s.k * (s.x - s.t) - s.c * s.v) * h; s.x += s.v * h; }
      }
      if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) { s.x = s.t; s.v = 0; springs.delete(s); }
      s.f(s.x);
    }
  }
  function frame(now) { raf = 0; step(now); if (springs.size) raf = requestAnimationFrame(frame); }
  setInterval(() => { if (springs.size && performance.now() - last > 120) step(performance.now()); }, 100);
  class Spring {
    constructor(f, x = 0, k = 90) { this.f = f; this.x = x; this.t = x; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k); f(x); }
    to(t) {
      this.t = t;
      if (!springs.size) last = performance.now();
      springs.add(this);
      if (!raf) raf = requestAnimationFrame(frame);
    }
    snap(t) { this.x = this.t = t; this.v = 0; springs.delete(this); this.f(t); }
  }

  // ---------------------------------------------------------------- herramienta
  const tool = $('#herramienta');
  if (!tool) return;
  const drop = $('#drop');
  const pick = $('#pick');
  const list = $('#cards');
  const mergeBox = $('#merge');
  const allBtn = $('#all');
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const cards = [];
  const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v|mpe?g|wmv|flv|3gp|3g2|ts|mts|m2ts|vob|ogv|f4v|asf|divx|mxf|qt)$/i;
  const PREVIEW = /^image\/(jpeg|png|webp|gif|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)$/;
  const FAM_ICON = { image: 'image', audio: 'audio', video: 'video', doc: 'doc', sheet: 'doc', slides: 'doc', pdf: 'pdf', text: 'text', subtitle: 'subtitle' };
  const MB = 1048576;

  function dropText() {
    const has = cards.length > 0;
    tool.classList.toggle('has', has);
    $('.drop-main', drop).textContent = touch ? (has ? 'Toca para añadir más archivos' : 'Toca para añadir tus archivos') : (has ? 'Suelta aquí más archivos' : 'Suelta aquí tus archivos');
    $('.drop-sub', drop).textContent = touch ? 'Fotos, vídeos, audio, documentos…' : 'o pulsa para elegirlos';
  }
  dropText();

  const openPicker = () => pick.click();
  drop.addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => { tool.scrollIntoView({ behavior: 'smooth', block: 'start' }); openPicker(); }));
  pick.addEventListener('change', () => { addFiles(pick.files); pick.value = ''; });

  // Toda la ventana es zona de soltar.
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; d.body.classList.add('dragging'); });
  addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) d.body.classList.remove('dragging'); });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; d.body.classList.remove('dragging');
    addFiles(e.dataTransfer.files);
  });
  // Ctrl+V pega archivos; Escape cancela lo que esté en marcha.
  addEventListener('paste', (e) => {
    const files = e.clipboardData ? [...e.clipboardData.files] : [];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const active = cards.filter((c) => ['uploading', 'queued', 'running'].includes(c.state));
    if (!active.length) return;
    active.forEach((c) => c.cancel());
    toast(active.length === 1 ? 'Cancelado' : `${active.length} operaciones canceladas`);
  });
  if (allBtn) allBtn.addEventListener('click', () => cards.filter((c) => c.state === 'ready').forEach((c) => c.convert()));
  $('#merge-go').addEventListener('click', mergePdfs);

  function addFiles(files) {
    const arr = [...(files || [])];
    if (!arr.length) return;
    arr.forEach((f) => new Card(f));
    dropText();
    refresh();
  }

  function refresh() {
    const pdfs = cards.filter((c) => c.info && c.info.family === 'pdf' && !c.merge && ['ready', 'done'].includes(c.state));
    mergeBox.hidden = pdfs.length < 2;
    $('#merge-n').textContent = pdfs.length;
    if (allBtn) {
      const n = cards.filter((c) => c.state === 'ready').length;
      allBtn.disabled = !n;
      allBtn.textContent = n > 1 ? `Convertir todo (${n})` : 'Convertir todo';
    }
  }

  const TPL = `<div class="c-head"><div class="thumb"></div><div class="c-meta"><p class="c-name"></p><p class="c-info"></p><p class="c-note" hidden></p></div><button class="x" type="button" aria-label="Quitar">${icon('x')}</button></div>
<div class="c-body" hidden><div><p class="lbl">Convertir a</p><div class="targets" role="radiogroup"></div></div><div class="opts"></div><p class="note" hidden></p><div class="c-act"><button class="btn go" type="button"></button></div></div>
<div class="prog" hidden><div class="p-row"><span class="p-lbl"></span><span class="p-num"></span></div><div class="track"><div class="fill"></div></div><div class="p-sub"><span class="p-det"></span><button type="button" class="cx">Cancelar</button></div></div>
<div class="done" hidden><p class="save"></p><div class="c-act"><a class="btn btn-ok dl" download>${icon('dl')}<span></span></a><button class="btn btn-o again" type="button">Otra conversión</button></div></div>
<p class="err" role="alert" hidden></p>`;

  class Card {
    constructor(file, merge) {
      this.file = file;
      this.merge = merge || null;
      this.state = 'new';
      this.info = null;
      this.target = null;
      this.vals = {};
      const el = this.el = d.createElement('li');
      el.className = 'card';
      el.innerHTML = TPL;
      this.$ = (s) => $(s, el);
      this.$('.c-name').textContent = file.name;
      this.$('.x').addEventListener('click', () => this.remove());
      this.$('.cx').addEventListener('click', () => this.cancel());
      this.$('.go').addEventListener('click', () => this.convert());
      this.$('.again').addEventListener('click', () => this.ready());
      const fill = this.$('.fill');
      const num = this.$('.p-num');
      this.showNum = false;
      this.bar = new Spring((x) => {
        fill.style.transform = `scaleX(${Math.max(0, Math.min(1, x))})`;
        if (this.showNum) num.textContent = `${Math.floor(Math.max(0, Math.min(1, x)) * 100)} %`;
      });
      list.append(el);
      cards.push(this);
      if (merge) return this.startMerge();
      this.setIcon(null, (file.name.split('.').pop() || '').slice(0, 5));
      if (PREVIEW.test(file.type)) this.setThumb(URL.createObjectURL(file), true);
      this.upload();
    }

    setIcon(family, ext) {
      const t = this.$('.thumb');
      t.className = 'thumb';
      t.innerHTML = `${icon(FAM_ICON[family] || 'doc')}${ext ? `<small>${esc(ext.toUpperCase())}</small>` : ''}`;
    }

    setThumb(src, local) {
      const t = this.$('.thumb');
      const img = new Image();
      img.alt = '';
      img.onload = () => { t.className = 'thumb'; t.replaceChildren(img); if (local) this.blobOk = true; };
      img.onerror = () => { if (local) URL.revokeObjectURL(src); };
      img.src = src;
      if (local) this.blob = src;
    }

    setWave(peaks) {
      const t = this.$('.thumb');
      const w = peaks.length;
      let p = '';
      peaks.forEach((v, i) => { const h = Math.max(0.6, v * 18); p += `M${i + 0.15} ${20 - h}h.7v${2 * h}h-.7z`; });
      t.className = 'thumb audio';
      t.innerHTML = `<svg class="wave" viewBox="0 0 ${w} 40" preserveAspectRatio="none"><path d="${p}"/></svg>`;
    }

    info2() {
      const i = this.info;
      const m = i.meta || {};
      const parts = [['image', 'audio', 'video'].includes(i.family) ? `${i.familyLabel} ${i.label}` : i.family === 'pdf' ? 'PDF' : `${i.familyLabel} · ${i.label}`];
      if (m.duration) parts.push(clock(m.duration));
      if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
      if (m.pages) parts.push(`${m.pages} página${m.pages === 1 ? '' : 's'}`);
      if (i.family === 'video' && m.hasAudio === false) parts.push('sin audio');
      parts.push(bytes(i.size));
      return parts.join(' · ');
    }

    // ------------------------------------------------ subida (progreso real: bytes enviados)
    upload() {
      const f = this.file;
      const isVideo = /^video\//.test(f.type) || VIDEO_EXT.test(f.name);
      if (!f.size) return this.fail('El archivo está vacío (0 bytes).', true);
      if (f.size > 200 * MB) return this.fail(`Pesa ${bytes(f.size)}: el máximo es 200 MB para vídeo y 50 MB para el resto.`, true);
      if (f.size > 50 * MB && !isVideo) return this.fail(`Pesa ${bytes(f.size)}: el máximo para este tipo de archivo es 50 MB (los vídeos, hasta 200 MB).`, true);
      this.state = 'uploading';
      this.prog('Subiendo', 0, '', true);
      const xhr = this.xhr = new XMLHttpRequest();
      const samples = [];
      xhr.upload.onprogress = (e) => {
        const now = performance.now();
        samples.push([now, e.loaded]);
        while (samples.length > 2 && now - samples[0][0] > 1500) samples.shift();
        const [t0, b0] = samples[0];
        const speed = now > t0 ? ((e.loaded - b0) / (now - t0)) * 1000 : 0;
        const det = speed > 0 ? `${nf1.format(speed / MB)} MB/s · ${bytes(e.loaded)} de ${bytes(e.total)}${e.loaded < e.total ? ` · quedan ${left((e.total - e.loaded) / speed)}` : ''}` : `${bytes(e.loaded)} de ${bytes(e.total)}`;
        this.prog(e.loaded < e.total ? 'Subiendo' : 'Analizando el archivo…', e.total ? e.loaded / e.total : 0, det, true);
        if (e.loaded >= e.total) this.indet('Analizando el archivo…', 'Mirando qué es por dentro');
      };
      xhr.onload = () => {
        this.xhr = null;
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* respuesta vacía */ }
        if (xhr.status === 201 && j.file) { this.info = j.file; this.analyzed(); } else this.fail(j.error || `No se ha podido subir el archivo (código ${xhr.status}).`, true);
      };
      xhr.onerror = () => { this.xhr = null; this.fail('Se ha cortado la conexión mientras subía el archivo. Inténtalo de nuevo.', true); };
      xhr.onabort = () => { this.xhr = null; };
      xhr.open('POST', 'api/upload');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(f.name));
      xhr.send(f);
    }

    analyzed() {
      const i = this.info;
      this.$('.c-info').textContent = this.info2();
      if (i.note) { const n = this.$('.c-note'); n.textContent = i.note; n.hidden = false; }
      if (i.meta && i.meta.waveform) this.setWave(i.meta.waveform);
      else if (i.thumb && !this.blobOk) this.setThumb(i.thumb);
      else if (!this.blob) this.setIcon(i.family, i.format);
      this.target = i.defaultTarget;
      const tg = this.$('.targets');
      tg.innerHTML = i.outputs.map((o) => `<button type="button" class="t" role="radio" data-id="${o.id}" aria-checked="${o.id === this.target}">${esc(o.label)}</button>`).join('');
      tg.addEventListener('click', (e) => {
        const b = e.target.closest('.t');
        if (!b) return;
        this.saveVals();
        this.target = b.dataset.id;
        $$('.t', tg).forEach((x) => x.setAttribute('aria-checked', x === b));
        this.renderOpts();
      });
      this.renderOpts();
      this.ready();
    }

    out() { return this.info.outputs.find((o) => o.id === this.target); }

    renderOpts() {
      const o = this.out();
      const v = this.vals[o.id] || {};
      const box = this.$('.opts');
      box.innerHTML = o.options.map((op) => {
        const val = v[op.key] !== undefined ? v[op.key] : op.default;
        if (op.type === 'select') return `<label class="opt">${esc(op.label)}<select data-k="${op.key}">${op.choices.map(([k, l]) => `<option value="${esc(k)}"${String(val) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        if (op.type === 'range') return `<label class="opt"><span>${esc(op.label)}<output>${val}</output></span><input type="range" data-k="${op.key}" min="${op.min}" max="${op.max}" step="${op.step}" value="${val}"></label>`;
        if (op.type === 'toggle') return `<label class="sw"><input type="checkbox" data-k="${op.key}"${val ? ' checked' : ''}>${esc(op.label)}</label>`;
        return `<label class="opt">${esc(op.label)}<input type="text" data-k="${op.key}" value="${esc(v[op.key] || '')}" placeholder="${esc(op.placeholder || '')}" inputmode="numeric" autocomplete="off"></label>`;
      }).join('');
      $$('input[type=range]', box).forEach((r) => r.addEventListener('input', () => { r.previousElementSibling.querySelector('output').textContent = r.value; }));
      const note = this.$('.note');
      const pages = this.info.meta && this.info.meta.pages;
      note.textContent = o.note || (o.id === 'pdf-extract' && pages ? `Este PDF tiene ${pages} página${pages === 1 ? '' : 's'}. Ejemplo: 1-3,5` : '');
      note.hidden = !note.textContent;
      this.$('.go').textContent = this.info.family === 'pdf' ? `${o.label}` : `Convertir a ${o.label}`;
    }

    saveVals() {
      if (!this.target) return;
      const v = {};
      $$('[data-k]', this.$('.opts')).forEach((x) => { v[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; });
      this.vals[this.target] = v;
      return v;
    }

    show(part) {
      for (const p of ['c-body', 'prog', 'done']) this.$(`.${p}`).hidden = p !== part;
    }

    ready() {
      this.state = 'ready';
      this.show(this.merge ? 'done' : 'c-body');
      if (this.merge) this.state = 'done';
      refresh();
    }

    // ------------------------------------------------ progreso
    prog(label, frac, det, cancelable) {
      this.show('prog');
      const p = this.$('.prog');
      p.className = 'prog';
      this.$('.p-lbl').textContent = label;
      this.$('.p-det').textContent = det || '';
      this.$('.cx').hidden = !cancelable;
      this.$('.track').hidden = false;
      this.showNum = true;
      if (frac !== null) this.bar.to(frac);
    }

    indet(label, det, noBar) {
      this.show('prog');
      this.$('.prog').className = `prog indet${noBar ? ' nobar' : ''}`;
      this.$('.track').hidden = !!noBar;
      this.$('.p-lbl').textContent = label;
      this.$('.p-det').textContent = det || '';
      this.showNum = false;
      this.$('.p-num').textContent = '';
    }

    // ------------------------------------------------ conversión
    async convert() {
      if (this.state !== 'ready') return;
      const o = this.out();
      const options = this.saveVals();
      this.state = 'queued';
      this.$('.err').hidden = true;
      this.bar.snap(0);
      this.indet('Enviando…', '');
      this.$('.track').hidden = false;
      refresh();
      let r; let j = {};
      try {
        r = await fetch('api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: this.info.id, target: o.id, options }) });
        j = await r.json();
      } catch { j = { error: 'No hay conexión con el servidor. Inténtalo de nuevo.' }; }
      if (!r || r.status !== 201) {
        this.ready();
        this.error(j.error || 'No se ha podido iniciar la conversión.');
        if (r && r.status === 429) toast(j.error, true);
        return;
      }
      this.follow(j.job, o);
    }

    follow(job, o) {
      this.job = job;
      this.kind = o ? o.progress : 'stages';
      this.started = performance.now();
      const es = this.es = new EventSource(job.events);
      es.onmessage = (e) => { try { this.onEvent(JSON.parse(e.data)); } catch { /* evento ilegible */ } };
      es.onerror = () => {
        if (es.readyState === 2 && this.es === es) { this.es = null; this.ready(); this.error('Se ha perdido la conexión con el servidor. Vuelve a intentarlo.'); }
      };
    }

    closeEs() { if (this.es) { this.es.close(); this.es = null; } }

    onEvent(ev) {
      if (ev.status === 'queued') {
        this.state = 'queued';
        this.indet(`En cola · ${ev.position}º de ${ev.waiting}`, ev.running ? `Hay ${ev.running} conversión${ev.running === 1 ? '' : 'es'} en marcha delante` : 'Empieza enseguida');
        this.$('.prog').className = 'prog queue';
        this.$('.cx').hidden = false;
      } else if (ev.status === 'running') {
        if (this.state !== 'running') { this.state = 'running'; this.bar.snap(0); this.had = false; }
        const stage = ev.stage || 'Convirtiendo';
        const stages = ev.stageCount ? `Etapa ${ev.stageIndex} de ${ev.stageCount}` : '';
        const measurable = this.kind === 'ffmpeg' || this.kind === 'pages';
        if (typeof ev.progress === 'number' && this.kind !== 'instant') {
          this.had = true;
          let det = '';
          if (ev.pages) det = `Página ${Math.min(ev.page, ev.pages)} de ${ev.pages}`;
          else if (ev.speed) det = `${nf1.format(ev.speed)}×${ev.eta != null ? ` · quedan ${left(ev.eta)}` : ''}`;
          this.prog(ev.progress >= 1 && !ev.pages ? 'Terminando…' : stage, ev.progress, [stages, det].filter(Boolean).join(' · '), true);
        } else if (measurable && !this.had) {
          this.prog(stage, 0, 'Calculando…', true);
        } else {
          this.indet(stage, stages || (this.kind === 'instant' ? '' : 'Este paso no informa de su avance: no inventamos un porcentaje'), this.kind === 'instant');
          this.$('.cx').hidden = false;
        }
      } else if (ev.status === 'done') {
        this.closeEs();
        this.finish(ev.result);
      } else if (ev.status === 'error') {
        this.closeEs();
        if (this.merge) return this.fail(ev.error, true);
        this.ready();
        this.error(ev.error);
      } else if (ev.status === 'canceled') {
        this.closeEs();
        if (this.merge) return this.remove(true);
        this.ready();
      }
    }

    finish(res) {
      this.state = 'done';
      this.bar.to(1);
      this.show('done');
      const a = this.$('.dl');
      a.href = res.download;
      a.setAttribute('download', res.name);
      $('span', a).textContent = `Descargar ${res.name.length > 28 ? `${res.name.slice(0, 18)}…${res.name.slice(-8)}` : res.name}`;
      this.$('.again').hidden = !!this.merge;
      if (res.thumb) this.setThumb(res.thumb);
      const save = this.$('.save');
      const before = res.inputSize || 0;
      const after = res.size;
      const diff = before ? Math.round((1 - after / before) * 100) : 0;
      save.className = `save${after > before ? ' more' : ''}`;
      save.innerHTML = `<b class="b1">${bytes(before)}</b><span class="ar">→</span><b class="b2">${bytes(before)}</b><span class="pct"></span>`;
      const b2 = $('.b2', save);
      const pct = $('.pct', save);
      // El tamaño final "cuenta" desde el original con un muelle.
      new Spring((x) => { b2.textContent = bytes(Math.round(x)); }, before, 40).to(after);
      pct.textContent = !before ? '' : after <= before ? `· un ${Math.abs(diff)} % menos` : `· un ${Math.round((after / before - 1) * 100)} % más`;
      refresh();
    }

    error(msg) {
      const e = this.$('.err');
      e.textContent = msg;
      e.hidden = false;
    }

    fail(msg, fatal) {
      this.state = fatal ? 'failed' : 'ready';
      this.show(null);
      this.error(msg);
      if (fatal && !this.info) this.setIcon(null, '!');
      refresh();
    }

    cancel() {
      if (this.state === 'uploading' && this.xhr) { this.xhr.abort(); this.remove(true); return; }
      if (this.job && (this.state === 'queued' || this.state === 'running')) {
        fetch(`api/jobs/${this.job.id}/cancel`, { method: 'POST' }).catch(() => {});
        this.closeEs();
        if (this.merge) return this.remove(true);
        this.ready();
      }
    }

    remove(quiet) {
      if (this.removed) return;
      this.removed = true;
      if (this.xhr) this.xhr.abort();
      this.closeEs();
      const id = this.merge ? this.mergeFile : this.info && this.info.id;
      if (id) fetch(`api/files/${id}`, { method: 'DELETE' }).catch(() => {});
      if (this.blob) URL.revokeObjectURL(this.blob);
      cards.splice(cards.indexOf(this), 1);
      this.el.classList.add('out');
      setTimeout(() => { this.el.remove(); dropText(); }, 280);
      refresh();
      if (!quiet && id) toast('Archivo quitado y borrado del servidor');
    }

    async startMerge() {
      this.setIcon('pdf', 'PDF');
      this.$('.c-info').textContent = `Unión de ${this.merge.length} PDF · ${bytes(this.merge.reduce((s, c) => s + c.info.size, 0))}`;
      this.state = 'queued';
      this.indet('Enviando…', '');
      let r; let j = {};
      try {
        r = await fetch('api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'pdf-merge', fileIds: this.merge.map((c) => c.info.id) }) });
        j = await r.json();
      } catch { j = { error: 'No hay conexión con el servidor.' }; }
      if (!r || r.status !== 201) { this.fail(j.error || 'No se han podido unir los PDF.', true); return; }
      this.mergeFile = j.file && j.file.id;
      this.follow(j.job, null);
    }
  }

  function mergePdfs() {
    const pdfs = cards.filter((c) => c.info && c.info.family === 'pdf' && !c.merge && ['ready', 'done'].includes(c.state));
    if (pdfs.length < 2) return;
    new Card({ name: 'unido.pdf', size: 0, type: 'application/pdf' }, pdfs);
    dropText();
    refresh();
  }
})();
