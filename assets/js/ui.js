/* Utilidades de interfaz compartidas por las vistas. */
(function (root) {
  'use strict';

  // h('div', {class: 'x', onclick: fn}, 'texto', otroNodo, [lista])
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-ES', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 });
  }
  function fmtRating(r) { return r == null ? '—' : fmtNum(r, 1); }
  function fmtMoney(amount, currency) {
    if (amount == null || isNaN(amount)) return '—';
    var sym = !currency || currency === 'USD' ? ' US$' : currency === 'EUR' ? ' €' : currency === 'GBP' ? ' £' : ' ' + currency;
    return fmtNum(amount, Math.round(amount) === amount ? 0 : 2) + sym;
  }
  function fmtDate(s) {
    if (!s) return '—';
    var m = String(s).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!m) return String(s);
    if (m[3]) return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
    if (m[2]) return MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
    return m[1];
  }
  function yearOf(s) { var m = String(s || '').match(/^(\d{4})/); return m ? parseInt(m[1], 10) : null; }
  function decimalYear(s) {
    var m = String(s || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!m) return null;
    var y = parseInt(m[1], 10), mo = m[2] ? parseInt(m[2], 10) - 1 : 6, d = m[3] ? parseInt(m[3], 10) : 15;
    return y + (mo + d / 31) / 12;
  }
  function plural(n, one, many) { return fmtNum(n) + ' ' + (n === 1 ? one : many); }

  function stars(rating, opts) {
    opts = opts || {};
    if (rating == null) return h('span', { class: 'stars muted' }, opts.empty || 'sin nota');
    var pct = Math.max(0, Math.min(100, rating / 5 * 100));
    var g = h('span', { class: 'glyphs', 'aria-hidden': 'true' }, h('span', { style: { width: pct + '%' } }));
    return h('span', { class: 'stars', title: fmtRating(rating) + ' de 5' }, g,
      h('span', { class: 'num' }, fmtRating(rating)), h('span', { class: 'visually-hidden' }, ' de 5 estrellas'));
  }

  // Portada: imagen de Amazon si carga; si no, una portada tipográfica.
  var COVER_TONES = ['#1f4e5a', '#5a3d2b', '#2f4a2b', '#4a2e4f', '#6b4a1b', '#23395b', '#56302f', '#3b4f4a'];
  function toneFor(asin) {
    var s = 0;
    for (var i = 0; i < asin.length; i++) s = (s * 31 + asin.charCodeAt(i)) >>> 0;
    return COVER_TONES[s % COVER_TONES.length];
  }
  function coverUrl(book) {
    if (book.cover) return book.cover;
    if (/^\d{9}[\dX]$/.test(book.asin)) return 'https://images-na.ssl-images-amazon.com/images/P/' + book.asin + '.01.LZZZZZZZ.jpg';
    return null;
  }
  function generatedCover(book) {
    var tone = toneFor(book.asin);
    return h('div', { class: 'cover-gen', style: { background: 'linear-gradient(160deg, ' + tone + ', #111 140%)' } },
      h('span', { class: 't' }, book.title || book.asin),
      h('span', { class: 'a' }, (book.authors && book.authors[0]) || ''));
  }
  function cover(book, size) {
    var box = h('div', { class: 'cover' + (size === 'lg' ? ' lg' : ''), role: 'img', 'aria-label': 'Portada de ' + (book.title || book.asin) });
    box.appendChild(generatedCover(book));
    var url = root.KDP_OFFLINE_COVERS ? null : coverUrl(book);
    if (url) {
      var img = h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('load', function () {
        // Amazon devuelve un gif de 1×1 cuando no tiene la imagen.
        if (img.naturalWidth < 20) img.remove();
      });
      img.addEventListener('error', function () { img.remove(); });
      img.src = url;
      box.appendChild(img);
    }
    return box;
  }

  // Fila de cifras: elige columnas según cuántas haya, para que ninguna quede sola.
  function kpiGrid(items) {
    var n = items.length;
    var cls = n >= 6 ? 'c6' : n === 5 ? 'c5' : n === 4 ? 'c4' : n === 3 ? 'c3' : '';
    return h('div', { class: 'kpis ' + cls }, items.map(function (k) {
      return h('div', { class: 'kpi' }, h('span', { class: 'label' }, k.label), h('span', { class: 'value' }, k.value),
        k.detail ? h('span', { class: 'detail' }, k.detail) : null);
    }));
  }

  function chip(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }
  function status(level, text) { return h('span', { class: 'status ' + level }, ' ' + text); }
  function extLink(href, text, cls) {
    return h('a', { href: href, target: '_blank', rel: 'noopener noreferrer', class: cls || null }, text);
  }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }

  function pageHead(eyebrow, title, lead) {
    return h('header', { class: 'page-head' },
      eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', null, title),
      lead ? h('p', { class: 'lead' }, lead) : null);
  }
  function section(title, sub, children, opts) {
    opts = opts || {};
    return h('section', { class: 'section', id: opts.id || null },
      h('div', { class: 'section-head' }, h('h2', null, title), opts.aside || null),
      sub ? h('p', { class: 'ink-2' }, sub) : null,
      children);
  }

  function toast(msg) {
    var t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'Copiado'); };
    try {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } catch (e) { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* sin portapapeles */ }
    ta.remove();
  }

  function safeStorage() {
    try { var k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { return null; }
  }
  function loadPref(key, fallback) {
    var s = safeStorage();
    if (!s) return fallback;
    try { var v = s.getItem('catenaria:' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function savePref(key, value) {
    var s = safeStorage();
    if (!s) return;
    try { s.setItem('catenaria:' + key, JSON.stringify(value)); } catch (e) { /* lleno o bloqueado */ }
  }

  // Curva catenaria (y = a·cosh(x/a)) como línea decorativa y de marca.
  function catenaryPath(w, hgt, sag) {
    var a = 1 / (2 * Math.acosh(1 + sag));
    var pts = [];
    for (var i = 0; i <= 48; i++) {
      var t = i / 48 - 0.5;
      var y = a * (Math.cosh(t / a) - 1);
      var ymax = a * (Math.cosh(0.5 / a) - 1);
      pts.push((i ? 'L' : 'M') + (t + 0.5) * w + ',' + (hgt - 2 - (1 - y / ymax) * (hgt - 4)));
    }
    return pts.join('');
  }
  function catenary(cls, w, hgt) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', catenaryPath(w, hgt, 2.2));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(p);
    return svg;
  }

  root.KDPUI = {
    h: h, append: append, fmtNum: fmtNum, fmtRating: fmtRating, fmtMoney: fmtMoney, fmtDate: fmtDate,
    yearOf: yearOf, decimalYear: decimalYear, plural: plural, stars: stars, cover: cover, coverUrl: coverUrl,
    chip: chip, status: status, kpiGrid: kpiGrid, extLink: extLink, hostOf: hostOf, pageHead: pageHead, section: section,
    toast: toast, copyText: copyText, loadPref: loadPref, savePref: savePref, catenary: catenary
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
