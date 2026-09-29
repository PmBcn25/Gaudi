/*
 * Gráficas SVG del panel. Sin dependencias.
 * Cada gráfica se redibuja con el ancho real de su contenedor (el texto
 * mantiene su tamaño en móvil), lleva tooltip al pasar o enfocar cada
 * marca y una tabla equivalente en «Ver tabla».
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var FONT = '11px "Instrument Sans", system-ui, sans-serif';
  var measureCtx = null;

  function textWidth(s, font) {
    try {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = font || FONT;
      return measureCtx.measureText(String(s)).width;
    } catch (e) {
      return String(s).length * 6.2;
    }
  }

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  function text(parent, x, y, str, attrs) {
    var t = el('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  function fitLabel(str, maxW, font) {
    str = String(str);
    if (textWidth(str, font) <= maxW) return str;
    while (str.length > 3 && textWidth(str + '…', font) > maxW) str = str.slice(0, -1);
    return str.replace(/\s+$/, '') + '…';
  }

  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-ES', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 });
  }

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }

  function ticks(max, count) {
    var step = niceMax(max / (count || 4));
    var out = [];
    for (var v = 0; v <= max + 1e-9; v += step) out.push(v);
    return out;
  }

  // Barra con extremo de datos redondeado (4px) y base recta.
  function barPath(x, y, w, h, r, dir) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (dir === 'left') {
      return 'M' + (x + w) + ',' + y + 'H' + (x + r) + 'Q' + x + ',' + y + ' ' + x + ',' + (y + r) +
        'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w) + 'Z';
    }
    return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z';
  }

  // ------------------------------------------------------------- tooltip
  var tip = null;
  function showTip(evt, rows) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    tip.textContent = '';
    rows.forEach(function (r, i) {
      var d = document.createElement('div');
      d.className = i === 0 ? 'tv' : 'tk';
      d.textContent = r;
      tip.appendChild(d);
    });
    tip.hidden = false;
    var x, y;
    if (evt && evt.clientX != null && evt.type.indexOf('pointer') === 0) { x = evt.clientX; y = evt.clientY; } else {
      var b = evt.target.getBoundingClientRect();
      x = b.left + b.width / 2; y = b.top;
    }
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(window.innerWidth - tw - 8, Math.max(8, x + 14));
    var top = y - th - 12 < 8 ? y + 16 : y - th - 12;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function bindTip(node, rows, group) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', rows.join('. '));
    var on = function (e) {
      showTip(e, rows);
      if (group) group.forEach(function (m) { m.classList.toggle('dim', m !== node.__mark); });
    };
    var off = function () {
      hideTip();
      if (group) group.forEach(function (m) { m.classList.remove('dim'); });
    };
    node.addEventListener('pointermove', on);
    node.addEventListener('pointerenter', on);
    node.addEventListener('pointerleave', off);
    node.addEventListener('focus', on);
    node.addEventListener('blur', off);
  }

  // ------------------------------------------------------- contenedor común
  function frame(container, opts, draw) {
    container.textContent = '';
    var fig = document.createElement('figure');
    fig.className = 'chart';
    fig.style.margin = '0';
    if (opts.title || opts.subtitle) {
      var head = document.createElement('figcaption');
      head.className = 'chart-head';
      if (opts.title) { var h = document.createElement('h3'); h.textContent = opts.title; head.appendChild(h); }
      if (opts.subtitle) { var p = document.createElement('p'); p.textContent = opts.subtitle; head.appendChild(p); }
      fig.appendChild(head);
    }
    var holder = document.createElement('div');
    fig.appendChild(holder);
    var foot = document.createElement('div');
    foot.className = 'chart-foot';
    if (opts.legend && opts.legend.length) {
      var lg = document.createElement('div');
      lg.className = 'legend';
      opts.legend.forEach(function (it) {
        var s = document.createElement('span');
        var sw = document.createElement('span');
        sw.className = 'sw' + (it.shape === 'dot' ? ' dot' : '');
        if (it.hollow) { sw.style.background = 'transparent'; sw.style.boxShadow = 'inset 0 0 0 2px var(--muted)'; } else sw.style.background = it.color;
        s.appendChild(sw);
        s.appendChild(document.createTextNode(it.label));
        lg.appendChild(s);
      });
      foot.appendChild(lg);
    }
    if (opts.table) {
      var det = document.createElement('details');
      var sum = document.createElement('summary');
      sum.textContent = 'Ver tabla';
      det.appendChild(sum);
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      var t = document.createElement('table');
      var thead = document.createElement('thead');
      var tr = document.createElement('tr');
      opts.table.head.forEach(function (c, i) {
        var th = document.createElement('th'); th.textContent = c; if (i > 0) th.className = 'n'; tr.appendChild(th);
      });
      thead.appendChild(tr); t.appendChild(thead);
      var tb = document.createElement('tbody');
      opts.table.rows.forEach(function (r) {
        var row = document.createElement('tr');
        r.forEach(function (c, i) {
          var td = document.createElement('td'); td.textContent = c; if (i > 0) td.className = 'n'; row.appendChild(td);
        });
        tb.appendChild(row);
      });
      t.appendChild(tb); wrap.appendChild(t); det.appendChild(wrap); foot.appendChild(det);
    }
    if (foot.childNodes.length) fig.appendChild(foot);
    if (opts.note) {
      var n = document.createElement('p');
      n.className = 'foot-note';
      n.textContent = opts.note;
      fig.appendChild(n);
    }
    container.appendChild(fig);
    var last = 0;
    function render() {
      var w = Math.floor(holder.clientWidth || container.clientWidth || 600);
      if (w < 10 || w === last) return;
      last = w;
      holder.textContent = '';
      draw(holder, Math.max(260, w));
    }
    render();
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { render(); });
      ro.observe(holder);
    }
    return fig;
  }

  function empty(container, opts) {
    container.textContent = '';
    var fig = document.createElement('figure');
    fig.className = 'chart';
    fig.style.margin = '0';
    var head = document.createElement('figcaption');
    head.className = 'chart-head';
    var h = document.createElement('h3'); h.textContent = opts.title; head.appendChild(h);
    if (opts.subtitle) { var p = document.createElement('p'); p.textContent = opts.subtitle; head.appendChild(p); }
    fig.appendChild(head);
    var box = document.createElement('div');
    box.className = 'chart-empty';
    var s = document.createElement('strong'); s.textContent = opts.emptyTitle || 'Sin datos todavía';
    var m = document.createElement('span'); m.textContent = opts.emptyText || '';
    box.appendChild(s); box.appendChild(m);
    if (opts.action) {
      var a = document.createElement('a'); a.className = 'btn'; a.href = opts.action.href; a.textContent = opts.action.label;
      box.appendChild(a);
    }
    fig.appendChild(box);
    container.appendChild(fig);
  }

  // ------------------------------------------------ barras horizontales
  // rows: [{label, value, display, tip:[...], href}] · value null = sin dato
  function hbar(container, opts) {
    var rows = opts.rows;
    return frame(container, opts, function (holder, W) {
      var rowH = 30, barH = 14, top = 6;
      var labelW = Math.min(Math.max.apply(null, rows.map(function (r) { return textWidth(r.label); })) + 12, W * 0.42);
      var valueRoom = 64;
      var plotW = Math.max(60, W - labelW - valueRoom);
      var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) || 1);
      var H = top + rows.length * rowH + 22;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      ticks(max, 4).forEach(function (v) {
        var x = labelW + v / max * plotW;
        el('line', { x1: x, x2: x, y1: top - 2, y2: top + rows.length * rowH, class: 'gridline' }, svg);
        text(svg, x, H - 6, fmt(v), { 'text-anchor': 'middle', class: 't-muted' });
      });
      el('line', { x1: labelW, x2: labelW, y1: top - 2, y2: top + rows.length * rowH, class: 'axisline' }, svg);
      var marks = [];
      rows.forEach(function (r, i) {
        var y = top + i * rowH;
        var cy = y + rowH / 2;
        var lab = text(svg, labelW - 10, cy + 4, fitLabel(r.label, labelW - 14), { 'text-anchor': 'end' });
        if (r.strong) lab.setAttribute('class', 't-strong');
        if (r.value == null) {
          text(svg, labelW + 8, cy + 4, r.display || 'sin dato', { class: 't-muted' });
          return;
        }
        var w = Math.max(2, r.value / max * plotW);
        var p = el('path', { d: barPath(labelW, cy - barH / 2, w, barH, 4), fill: r.color || 'var(--series-1)', class: 'mark' }, svg);
        marks.push(p);
        text(svg, labelW + w + 6, cy + 4, r.display || fmt(r.value), { class: 't-strong' });
        var hit = el('rect', { x: 0, y: y, width: W, height: rowH, class: 'hit' }, svg);
        hit.__mark = p;
        bindTip(hit, r.tip || [r.display || fmt(r.value), r.label], marks);
      });
    });
  }

  // ----------------------------------------- estrellas: barras divergentes
  // rows: [{label, dist:{1..5: n}, total}] centradas en 3★
  function starsDiverging(container, opts) {
    var rows = opts.rows;
    var colors = { 1: 'var(--star-1)', 2: 'var(--star-2)', 3: 'var(--star-3)', 4: 'var(--star-4)', 5: 'var(--star-5)' };
    opts.legend = [1, 2, 3, 4, 5].map(function (s) { return { label: s + '★', color: colors[s] }; });
    return frame(container, opts, function (holder, W) {
      var rowH = 30, barH = 16, top = 8;
      var labelW = Math.min(Math.max.apply(null, rows.map(function (r) { return textWidth(r.label); })) + 12, W * 0.38);
      var plotW = W - labelW - 8;
      var H = top + rows.length * rowH + 24;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      // Centro en la mitad de las 3★: a la izquierda 1-2★, a la derecha 4-5★.
      // Cada lado admite el 100 %; la derecha es más ancha porque suele dominar.
      var cx = labelW + plotW * 0.34;
      var scaleL = (cx - labelW) * 0.94;
      var scaleR = labelW + plotW - cx - 46;
      [-0.5, 0, 0.5, 1].forEach(function (v) {
        var x = v < 0 ? cx + v * scaleL : cx + v * scaleR;
        el('line', { x1: x, x2: x, y1: top - 4, y2: top + rows.length * rowH, class: v === 0 ? 'axisline' : 'gridline' }, svg);
        text(svg, x, H - 6, Math.abs(v * 100) + ' %', { 'text-anchor': 'middle', class: 't-muted' });
      });
      var marks = [];
      rows.forEach(function (r, i) {
        var y = top + i * rowH, cy = y + rowH / 2, t = r.total || 1;
        text(svg, labelW - 10, cy + 4, fitLabel(r.label, labelW - 14), { 'text-anchor': 'end' });
        var gap = 1;
        // izquierda: mitad de 3★, 2★, 1★
        var xL = cx;
        [[3, 0.5], [2, 1], [1, 1]].forEach(function (pair) {
          var s = pair[0], share = (r.dist[s] || 0) * pair[1] / t;
          if (!share) return;
          var w = share * scaleL;
          var seg = el('rect', { x: xL - w + (s === 3 ? 0 : gap), y: cy - barH / 2, width: Math.max(0.5, w - (s === 3 ? 0 : gap)),
            height: barH, fill: colors[s], class: 'mark' }, svg);
          seg.__mark = seg; marks.push(seg);
          bindTip(seg, [fmt((r.dist[s] || 0) / t * 100, 0) + ' % con ' + s + '★', r.label + ' · ' + fmt(r.dist[s] || 0) + ' de ' + fmt(t)], marks);
          xL -= w;
        });
        var xR = cx;
        [[3, 0.5], [4, 1], [5, 1]].forEach(function (pair) {
          var s = pair[0], share = (r.dist[s] || 0) * pair[1] / t;
          if (!share) return;
          var w = share * scaleR;
          var seg = el('rect', { x: xR + (s === 3 ? 0 : gap), y: cy - barH / 2, width: Math.max(0.5, w - (s === 3 ? 0 : gap)),
            height: barH, fill: colors[s], class: 'mark' }, svg);
          seg.__mark = seg; marks.push(seg);
          if (s !== 3) bindTip(seg, [fmt((r.dist[s] || 0) / t * 100, 0) + ' % con ' + s + '★', r.label + ' · ' + fmt(r.dist[s] || 0) + ' de ' + fmt(t)], marks);
          xR += w;
        });
        var pos = ((r.dist[4] || 0) + (r.dist[5] || 0)) / t * 100;
        text(svg, Math.min(xR + 6, W - 2), cy + 4, fmt(pos) + ' %', { class: 't-strong', 'text-anchor': xR + 40 > W ? 'end' : 'start' });
      });
    });
  }

  // --------------------------------------------- temas: elogios vs quejas
  // rows: [{label, praise, pain}]
  function themesDiverging(container, opts) {
    var rows = opts.rows;
    opts.legend = [{ label: 'Quejas y deseos', color: 'var(--star-1)' }, { label: 'Elogios', color: 'var(--series-1)' }];
    return frame(container, opts, function (holder, W) {
      var rowH = 26, barH = 12, top = 20;
      var labelW = Math.min(Math.max.apply(null, rows.map(function (r) { return textWidth(r.label); })) + 12, W * 0.34);
      var plotW = W - labelW - 36;
      var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.praise, r.pain); })) || 1);
      var cx = labelW + 30 + plotW / 2;
      var half = plotW / 2 - 18;
      var H = top + rows.length * rowH + 10;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      text(svg, cx - 8, 12, '← quejas', { 'text-anchor': 'end', class: 't-muted' });
      text(svg, cx + 8, 12, 'elogios →', { class: 't-muted' });
      el('line', { x1: cx, x2: cx, y1: top - 4, y2: top + rows.length * rowH, class: 'axisline' }, svg);
      var marks = [];
      rows.forEach(function (r, i) {
        var y = top + i * rowH, cy = y + rowH / 2;
        text(svg, labelW, cy + 4, fitLabel(r.label, labelW - 6), { 'text-anchor': 'end' });
        if (r.pain) {
          var wl = r.pain / max * half;
          var pl = el('path', { d: barPath(cx - wl - 1, cy - barH / 2, wl, barH, 4, 'left'), fill: 'var(--star-1)', class: 'mark' }, svg);
          marks.push(pl);
          text(svg, cx - wl - 6, cy + 4, fmt(r.pain), { 'text-anchor': 'end', class: 't-strong' });
          var hl = el('rect', { x: labelW + 4, y: y, width: cx - labelW - 4, height: rowH, class: 'hit' }, svg);
          hl.__mark = pl;
          bindTip(hl, [fmt(r.pain) + ' quejas o deseos', r.label].concat(r.tipPain || []), marks);
        }
        if (r.praise) {
          var wr = r.praise / max * half;
          var pr = el('path', { d: barPath(cx + 1, cy - barH / 2, wr, barH, 4), fill: 'var(--series-1)', class: 'mark' }, svg);
          marks.push(pr);
          text(svg, cx + wr + 6, cy + 4, fmt(r.praise), { class: 't-strong' });
          var hr = el('rect', { x: cx, y: y, width: W - cx, height: rowH, class: 'hit' }, svg);
          hr.__mark = pr;
          bindTip(hr, [fmt(r.praise) + ' elogios', r.label].concat(r.tipPraise || []), marks);
        }
      });
    });
  }

  // ------------------------------------- línea de tiempo del mercado (años)
  // points: [{x: year(decimal), y: ratings|null, label, series: 0..2, tip:[]}]
  // events: [{x, label}]
  function marketTimeline(container, opts) {
    var pts = opts.points, events = (opts.events || []).slice().sort(function (a, b) { return a.x - b.x; });
    var seriesColors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
    return frame(container, opts, function (holder, W) {
      var padL = 44, padR = 16, plotH = 190, bottom = 34;
      var x0 = opts.xMin, x1 = opts.xMax;
      var X = function (v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); };
      // Etiquetas de hitos en filas para que no se pisen.
      var rowsEnd = [];
      var evPlaced = events.map(function (ev) {
        var x = X(ev.x), w = textWidth(ev.label) + 8;
        var anchor = x > W * 0.5 ? 'end' : 'start';
        var left = anchor === 'end' ? x - w : x;
        var right = anchor === 'end' ? x : x + w;
        var row = 0;
        while (rowsEnd[row] != null && rowsEnd[row] > left - 6) row++;
        rowsEnd[row] = right;
        return { ev: ev, x: x, anchor: anchor, row: row };
      });
      var rowsN = Math.max(1, rowsEnd.length);
      var top = 14 + rowsN * 14;
      var H = top + plotH + bottom;
      var yMax = niceMax(Math.max.apply(null, pts.map(function (p) { return p.y || 0; })) || 1);
      var Y = function (v) { return top + plotH - v / yMax * plotH; };
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      ticks(yMax, 4).forEach(function (v) {
        el('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: 'gridline' }, svg);
        text(svg, padL - 8, Y(v) + 4, fmt(v), { 'text-anchor': 'end', class: 't-muted' });
      });
      var step = W < 520 ? 5 : 2;
      for (var yr = Math.ceil(x0 / step) * step; yr <= x1; yr += step) {
        text(svg, X(yr), top + plotH + 18, String(yr), { 'text-anchor': 'middle', class: 't-muted' });
      }
      el('line', { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), class: 'axisline' }, svg);
      evPlaced.forEach(function (e) {
        var ly = 12 + e.row * 14;
        el('line', { x1: e.x, x2: e.x, y1: ly + 3, y2: top + plotH, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
        text(svg, e.anchor === 'end' ? e.x - 4 : e.x + 4, ly, e.ev.label, { 'text-anchor': e.anchor, class: 't-muted' });
      });
      var marks = [];
      var boxes = [];
      var dots = pts.map(function (p) { return { x: X(p.x), y: p.y == null ? Y(0) : Y(p.y) }; });
      pts.forEach(function (p, i) {
        var cx = dots[i].x, cy = dots[i].y;
        var color = seriesColors[p.series || 0];
        var dot;
        if (p.y == null) {
          dot = el('circle', { cx: cx, cy: cy, r: 5, fill: 'var(--chart-surface)', stroke: color, 'stroke-width': 2, class: 'mark' }, svg);
        } else {
          dot = el('circle', { cx: cx, cy: cy, r: 6, fill: color, stroke: 'var(--chart-surface)', 'stroke-width': 2, class: 'mark' }, svg);
        }
        marks.push(dot);
      });
      // Etiquetas de puntos: se prueba a la derecha/izquierda, arriba/abajo, y se omiten si chocan (quedan en el tooltip).
      function overlaps(b) {
        for (var k = 0; k < boxes.length; k++) {
          var o = boxes[k];
          if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) return true;
        }
        for (var d = 0; d < dots.length; d++) {
          if (dots[d].x > b.x - 6 && dots[d].x < b.x + b.w + 6 && dots[d].y > b.y - 6 && dots[d].y < b.y + b.h + 6) return true;
        }
        return b.x < padL || b.x + b.w > W - padR + 2 || b.y < top - 2 || b.y + b.h > top + plotH + 2;
      }
      pts.forEach(function (p, i) {
        if (!p.labelShow) return;
        var label = fitLabel(p.label, 150);
        var w = textWidth(label) + 2, hh = 13;
        var cx = dots[i].x, cy = dots[i].y;
        var tries = [
          { x: cx + 10, y: cy - 18 }, { x: cx - 10 - w, y: cy - 18 },
          { x: cx + 10, y: cy + 6 }, { x: cx - 10 - w, y: cy + 6 },
          { x: cx - w / 2, y: cy - 24 }
        ];
        for (var t = 0; t < tries.length; t++) {
          var b = { x: tries[t].x, y: tries[t].y, w: w, h: hh };
          if (!overlaps(b)) {
            boxes.push(b);
            text(svg, b.x, b.y + 10, label, { class: 't-strong' });
            return;
          }
        }
      });
      pts.forEach(function (p, i) {
        var hit = el('circle', { cx: dots[i].x, cy: dots[i].y, r: 14, class: 'hit' }, svg);
        hit.__mark = marks[i];
        bindTip(hit, p.tip || [p.label], marks);
      });
    });
  }

  // --------------------------------------------------- serie por año
  // points: [{x: year, y: count}]
  function yearsArea(container, opts) {
    var pts = opts.points;
    return frame(container, opts, function (holder, W) {
      var padL = 40, padR = 16, top = 14, plotH = 160, bottom = 26;
      var H = top + plotH + bottom;
      var xs = pts.map(function (p) { return p.x; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      if (x0 === x1) { x0 -= 1; x1 += 1; }
      var yMax = niceMax(Math.max.apply(null, pts.map(function (p) { return p.y; })) || 1);
      var X = function (v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); };
      var Y = function (v) { return top + plotH - v / yMax * plotH; };
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      ticks(yMax, 4).forEach(function (v) {
        el('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: 'gridline' }, svg);
        text(svg, padL - 8, Y(v) + 4, fmt(v), { 'text-anchor': 'end', class: 't-muted' });
      });
      var every = Math.ceil(pts.length / Math.max(2, Math.floor((W - 60) / 46)));
      pts.forEach(function (p, i) { if (i % every === 0 || i === pts.length - 1) text(svg, X(p.x), H - 8, String(p.x), { 'text-anchor': 'middle', class: 't-muted' }); });
      var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x) + ',' + Y(p.y); }).join('');
      el('path', { d: line + 'L' + X(pts[pts.length - 1].x) + ',' + Y(0) + 'L' + X(pts[0].x) + ',' + Y(0) + 'Z', fill: 'var(--series-1)', opacity: 0.1 }, svg);
      el('path', { d: line, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      var lastP = pts[pts.length - 1];
      el('circle', { cx: X(lastP.x), cy: Y(lastP.y), r: 4, fill: 'var(--series-1)', stroke: 'var(--chart-surface)', 'stroke-width': 2 }, svg);
      var cross = el('line', { x1: 0, x2: 0, y1: top, y2: top + plotH, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
      var hit = el('rect', { x: padL, y: top, width: W - padL - padR, height: plotH, class: 'hit' }, svg);
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('aria-label', pts.map(function (p) { return p.x + ': ' + p.y; }).join(', '));
      hit.addEventListener('pointermove', function (e) {
        var box = svg.getBoundingClientRect();
        var mx = (e.clientX - box.left) * (W / box.width);
        var best = pts[0];
        pts.forEach(function (p) { if (Math.abs(X(p.x) - mx) < Math.abs(X(best.x) - mx)) best = p; });
        cross.setAttribute('x1', X(best.x)); cross.setAttribute('x2', X(best.x)); cross.setAttribute('visibility', 'visible');
        showTip(e, [fmt(best.y) + ' ' + (opts.unit || ''), String(best.x)]);
      });
      hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    });
  }

  // ----------------------------------------------- dumbbell (antes/después)
  // rows: [{label, a, b}] · aLabel/bLabel · domain [min,max]
  function dumbbell(container, opts) {
    var rows = opts.rows;
    opts.legend = [{ label: opts.aLabel, color: 'var(--series-1)', shape: 'dot' }, { label: opts.bLabel, color: 'var(--series-2)', shape: 'dot' }];
    return frame(container, opts, function (holder, W) {
      var rowH = 30, top = 8;
      var labelW = Math.min(Math.max.apply(null, rows.map(function (r) { return textWidth(r.label); })) + 12, W * 0.4);
      var plotW = W - labelW - 24;
      var d0 = opts.domain[0], d1 = opts.domain[1];
      var X = function (v) { return labelW + 8 + (v - d0) / (d1 - d0) * plotW; };
      var H = top + rows.length * rowH + 24;
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': opts.title || '' }, holder);
      for (var v = d0; v <= d1 + 1e-9; v += 0.5) {
        el('line', { x1: X(v), x2: X(v), y1: top - 2, y2: top + rows.length * rowH, class: 'gridline' }, svg);
        text(svg, X(v), H - 6, fmt(v, 1), { 'text-anchor': 'middle', class: 't-muted' });
      }
      var marks = [];
      rows.forEach(function (r, i) {
        var cy = top + i * rowH + rowH / 2;
        text(svg, labelW - 4, cy + 4, fitLabel(r.label, labelW - 10), { 'text-anchor': 'end' });
        el('line', { x1: X(r.a), x2: X(r.b), y1: cy, y2: cy, stroke: 'var(--axis)', 'stroke-width': 2 }, svg);
        var a = el('circle', { cx: X(r.a), cy: cy, r: 5, fill: 'var(--series-1)', stroke: 'var(--chart-surface)', 'stroke-width': 2, class: 'mark' }, svg);
        var b = el('circle', { cx: X(r.b), cy: cy, r: 5, fill: 'var(--series-2)', stroke: 'var(--chart-surface)', 'stroke-width': 2, class: 'mark' }, svg);
        marks.push(a, b);
        var hit = el('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit' }, svg);
        hit.__mark = a;
        bindTip(hit, [opts.aLabel + ' ' + fmt(r.a, 2) + ' · ' + opts.bLabel + ' ' + fmt(r.b, 2), r.label, 'Diferencia: ' + fmt(r.a - r.b, 2)], null);
      });
    });
  }

  root.KDPCharts = {
    hbar: hbar,
    starsDiverging: starsDiverging,
    themesDiverging: themesDiverging,
    marketTimeline: marketTimeline,
    yearsArea: yearsArea,
    dumbbell: dumbbell,
    empty: empty,
    fmt: fmt,
    hideTip: hideTip
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
