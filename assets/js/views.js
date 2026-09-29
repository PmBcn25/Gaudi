/* Vistas del panel. Cada vista recibe el contexto (datos + análisis) y el contenedor. */
(function (root) {
  'use strict';
  var U = root.KDPUI, C = root.KDPCharts, A = root.KDPAnalysis;
  var h = U.h;
  var V = {};

  var AMAZON = 'https://www.amazon.com';
  var TYPE_LABEL = { grande: 'Editorial grande', especializada: 'Editorial especializada', independiente: 'Autoedición' };
  var TYPE_SERIES = { grande: 0, especializada: 1, independiente: 2 };

  // ------------------------------------------------------------ utilidades

  function shortTitle(b) { return b.shortTitle || b.title || b.asin; }
  function productUrl(b) { return AMAZON + '/-/es/dp/' + b.asin; }
  function reviewsUrl(ctx, b) {
    var links = ctx.DS.links && ctx.DS.links.list || [];
    for (var i = 0; i < links.length; i++) if (links[i].asin === b.asin) return links[i].url;
    return AMAZON + '/-/es/portal/customer-reviews/' + b.asin + '/ref=cm_cr_dp_d_show_all_top?_encoding=UTF8&ie=UTF8&reviewerType=all_reviews';
  }
  function isApprox(b) { return b.metaSource !== 'amazon'; }
  function pct(v, d) { return v == null ? '—' : U.fmtNum(v, d == null ? (Math.round(v) === v ? 0 : 1) : d) + ' %'; }
  function mainPrice(b) {
    var list = b.prices || [];
    if (b.price && b.price.amount != null && b.metaSource === 'amazon') return b.price;
    for (var i = 0; i < list.length; i++) if (list[i].amount != null) return list[i];
    return null;
  }
  function priceText(b) {
    var p = mainPrice(b);
    if (!p) return b.priceNote ? 'sin dato en EE. UU.' : '—';
    return (isApprox(b) ? '≈ ' : '') + U.fmtMoney(p.amount, p.currency);
  }
  function ratingsText(b, long) {
    if (b.ratingsTotal != null) return (isApprox(b) ? '≈ ' : '') + U.fmtNum(b.ratingsTotal) + (long ? ' valoraciones' : '');
    if (b.ratingProxy) return 'sin dato en EE. UU.' + (long ? ' (' + marketName(b.ratingProxy.market) + ': ' + b.ratingProxy.ratingsTotal + ')' : '');
    return 'sin dato';
  }
  function reviewsOf(ctx, asin) { return ctx.reviews[asin] || []; }
  function marketName(m) {
    var map = { 'Amazon.co.uk': 'Reino Unido', 'Amazon.ca': 'Canadá', 'Amazon.com.au': 'Australia', 'Amazon.de': 'Alemania', 'Amazon.es': 'España', 'Amazon.co.jp': 'Japón' };
    return map[m] || m;
  }
  function themeLabel(id) { var t = A.themeById(id); return t ? t.label : id; }
  function themeShort(id) { var t = A.themeById(id); return t ? t.short : id; }
  function themeStat(ctx, id) {
    var list = ctx.res.themes;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function signalsFor(ctx, asin, type) {
    return (ctx.DS.signals || []).filter(function (s) { return (!asin || s.asin === asin) && (!type || s.type === type); });
  }

  // Cuenta en vivo de las reseñas importadas para una lista de temas.
  function liveCounts(ctx, themes) {
    if (!ctx.hasReviews || !themes || !themes.length) return null;
    var parts = themes.map(function (id) {
      var t = themeStat(ctx, id);
      if (!t) return null;
      return t.short + ': ' + U.fmtNum(t.praise) + ' elogios / ' + U.fmtNum(t.pain) + ' quejas';
    }).filter(Boolean);
    return h('p', { class: 'live' }, 'En las reseñas importadas · ' + parts.join(' · '));
  }

  function quote(ctx, s, opts) {
    opts = opts || {};
    var b = ctx.byAsin[s.asin];
    return h('blockquote', { class: 'quote ' + (s.type === 'positivo' ? 'pos' : 'neg'), style: { margin: 0 } },
      h('p', { class: s.kind === 'cita' ? 'q' : '' }, s.kind === 'cita' ? '«' + s.text + '»' : s.text),
      s.es ? h('p', { class: 'tr' }, 'Traducción: ' + s.es) : null,
      h('p', { class: 'src' },
        h('span', null, (s.who === 'crítica' ? 'Crítica' : 'Lector') + ' · ' + (s.kind === 'cita' ? 'cita' : 'paráfrasis') +
          ' · fiabilidad ' + s.confidence),
        opts.showBook && b ? h('a', { href: '#libro-' + b.asin }, shortTitle(b)) : null,
        U.extLink(s.source, U.hostOf(s.source))));
  }

  function evidenceList(ctx, list) {
    if (!list || !list.length) return null;
    return h('ul', { class: 'evidence' }, list.map(function (e) {
      var b = e.asin && ctx.byAsin[e.asin];
      return h('li', null, e.text,
        b ? [' ', h('a', { href: '#libro-' + b.asin }, '(' + shortTitle(b) + ')')] : null,
        e.source ? [' ', U.extLink(e.source, U.hostOf(e.source))] : null);
    }));
  }

  function dataStatusCallout(ctx) {
    if (ctx.hasReviews) {
      var withData = ctx.books.filter(function (b) { return reviewsOf(ctx, b.asin).length; }).length;
      return h('div', { class: 'callout' },
        h('strong', null, U.fmtNum(ctx.res.reviewCount) + ' reseñas importadas de ' + withData + ' de los ' + ctx.books.length + ' libros.'),
        h('span', null, 'Las gráficas y los temas usan esas reseñas. Los libros sin reseñas importadas siguen con datos de búsqueda web.'));
    }
    return h('div', { class: 'callout warn' },
      h('strong', null, 'Las reseñas completas de Amazon aún no están importadas.'),
      h('span', null, 'Este panel no puede abrir Amazon por sí mismo. Mientras tanto, el análisis se apoya en datos públicos del ' +
        U.fmtDate(ctx.DS.consultado) + ': valoraciones y precios aproximados, ' + (ctx.DS.signals || []).length +
        ' señales de lectores y crítica, y el contexto de 2026.'),
      h('span', null, h('a', { href: '#importar' }, 'Cómo extraer e importar las reseñas →')));
  }

  function basisNote(ctx) {
    return h('p', { class: 'foot-note' }, ctx.hasReviews
      ? 'Estrategia redactada el ' + U.fmtDate(ctx.INS.updated) + ' con datos preliminares; los números en verde salen de las reseñas importadas.'
      : ctx.INS.basisNote);
  }

  function statusForScore(score) {
    if (score == null) return 'none';
    return score >= 65 ? 'good' : score >= 50 ? 'warn' : score >= 35 ? 'serious' : 'crit';
  }

  function emptyText(text) { return h('div', { class: 'callout' }, h('span', null, text)); }

  // ---------------------------------------------------------- gráficas

  function chartDemand(ctx, holder) {
    var rows = ctx.books.slice().sort(function (a, b) { return (b.ratingsTotal || -1) - (a.ratingsTotal || -1); }).map(function (b) {
      return {
        label: shortTitle(b), value: b.ratingsTotal,
        display: b.ratingsTotal != null ? (isApprox(b) ? '≈ ' : '') + U.fmtNum(b.ratingsTotal) : ratingsText(b),
        tip: [ratingsText(b, true), shortTitle(b), b.ratingsTotal != null ? 'Nota media ' + U.fmtRating(b.rating) : (b.ratingNote || '')]
      };
    });
    C.hbar(holder, {
      title: 'Demanda por libro',
      subtitle: 'Valoraciones totales en Amazon.com. Es la mejor pista pública de cuánto se vende cada libro.',
      rows: rows,
      table: { head: ['Libro', 'Valoraciones', 'Nota'], rows: ctx.books.map(function (b) { return [shortTitle(b), ratingsText(b), U.fmtRating(b.rating)]; }) },
      note: ctx.books.some(isApprox) ? '≈ Dato aproximado de búsqueda web; se sustituye por el real al importar las reseñas.' : null
    });
  }

  function chartTimeline(ctx, holder) {
    var pts = ctx.books.map(function (b) {
      return {
        x: U.decimalYear(b.publicationDate) || 2000, y: b.ratingsTotal, label: shortTitle(b),
        series: TYPE_SERIES[b.publisherType] || 0,
        labelShow: true,
        tip: [shortTitle(b), 'Publicado: ' + U.fmtDate(b.publicationDate), b.ratingsTotal != null ? ratingsText(b, true) : 'Sin dato de valoraciones',
          TYPE_LABEL[b.publisherType] || '']
      };
    });
    var years = pts.map(function (p) { return p.x; });
    C.marketTimeline(holder, {
      title: 'Un mercado de libros anteriores a los grandes hitos',
      subtitle: 'Año de publicación frente a valoraciones. Las líneas verticales marcan hitos del templo que esos libros no recogen.',
      points: pts,
      xMin: Math.floor(Math.min.apply(null, years)) - 1, xMax: 2027,
      events: [
        { x: 2021.93, label: 'Torre de la Virgen' },
        { x: 2025.83, label: 'Iglesia más alta' },
        { x: 2026.14, label: 'Torre de Jesucristo' }
      ],
      legend: [
        { label: 'Editorial grande', color: 'var(--series-1)', shape: 'dot' },
        { label: 'Especializada', color: 'var(--series-2)', shape: 'dot' },
        { label: 'Autoedición', color: 'var(--series-3)', shape: 'dot' },
        { label: 'Sin dato de valoraciones', color: 'transparent', shape: 'dot', hollow: true }
      ],
      table: { head: ['Libro', 'Publicación', 'Valoraciones', 'Tipo'], rows: ctx.books.map(function (b) {
        return [shortTitle(b), U.fmtDate(b.publicationDate), ratingsText(b), TYPE_LABEL[b.publisherType] || '—'];
      }) }
    });
  }

  // Temas: desde las reseñas si existen; si no, desde las señales públicas.
  function themeRows(ctx, limit) {
    if (ctx.hasReviews) {
      return ctx.res.themes.filter(function (t) { return t.praise + t.pain > 0; })
        .sort(function (a, b) { return (b.praise + b.pain) - (a.praise + a.pain); })
        .slice(0, limit || 12)
        .map(function (t) { return { id: t.id, label: t.short, praise: t.praise, pain: t.pain }; });
    }
    var acc = {};
    (ctx.DS.signals || []).forEach(function (s) {
      (s.themes || []).forEach(function (id) {
        acc[id] = acc[id] || { id: id, label: themeShort(id), praise: 0, pain: 0 };
        if (s.type === 'positivo') acc[id].praise++; else acc[id].pain++;
      });
    });
    return Object.keys(acc).map(function (k) { return acc[k]; })
      .sort(function (a, b) { return (b.praise + b.pain) - (a.praise + a.pain); }).slice(0, limit || 12);
  }

  function chartThemes(ctx, holder, limit) {
    var rows = themeRows(ctx, limit);
    if (!rows.length) {
      C.empty(holder, { title: 'Elogios y quejas por tema', emptyText: 'No hay datos de temas.' });
      return;
    }
    C.themesDiverging(holder, {
      title: 'Qué se elogia y de qué se quejan',
      subtitle: ctx.hasReviews
        ? 'Número de reseñas que elogian o critican cada tema (' + U.fmtNum(ctx.res.reviewCount) + ' reseñas importadas).'
        : 'Provisional: ' + (ctx.DS.signals || []).length + ' señales públicas de lectores y crítica. Se sustituye por las reseñas al importarlas.',
      rows: rows,
      table: { head: ['Tema', 'Elogios', 'Quejas y deseos'], rows: rows.map(function (r) { return [r.label, r.praise, r.pain]; }) }
    });
  }

  function chartGoodreads(ctx, holder) {
    var rows = ctx.books.filter(function (b) { return b.rating != null && b.goodreads && b.goodreads.rating != null && b.goodreads.ratings >= 50; })
      .map(function (b) { return { label: shortTitle(b), a: b.rating, b: b.goodreads.rating }; })
      .sort(function (x, y) { return (y.a - y.b) - (x.a - x.b); });
    if (!rows.length) { holder.textContent = ''; return; }
    C.dumbbell(holder, {
      title: 'Amazon frente a Goodreads',
      subtitle: 'En Goodreads, los lectores puntúan mucho peor los libros de texto sin imágenes.',
      rows: rows, aLabel: 'Amazon', bLabel: 'Goodreads', domain: [3, 5],
      table: { head: ['Libro', 'Amazon', 'Goodreads'], rows: rows.map(function (r) { return [r.label, U.fmtRating(r.a), U.fmtNum(r.b, 2)]; }) }
    });
  }

  function distRows(ctx) {
    return ctx.books.map(function (b) {
      var st = ctx.res.perBook[b.asin];
      if (st && st.rated >= 5) return { label: shortTitle(b), dist: st.dist, total: st.rated, source: 'reseñas' };
      if (b.histogram && b.ratingsTotal) {
        var d = {};
        [1, 2, 3, 4, 5].forEach(function (s) { d[s] = (b.histogram[String(s)] || 0) / 100 * b.ratingsTotal; });
        return { label: shortTitle(b), dist: d, total: [1, 2, 3, 4, 5].reduce(function (x, s) { return x + d[s]; }, 0), source: 'histograma' };
      }
      return null;
    }).filter(Boolean);
  }

  function chartStars(ctx, holder) {
    var rows = distRows(ctx);
    if (!rows.length) {
      C.empty(holder, {
        title: 'Distribución de estrellas por libro',
        emptyTitle: 'Pendiente de las reseñas',
        emptyText: 'Aparecerá al importar las reseñas o el histograma de estrellas de cada libro.',
        action: { href: '#importar', label: 'Importar reseñas' }
      });
      return;
    }
    C.starsDiverging(holder, {
      title: 'Distribución de estrellas por libro',
      subtitle: 'A la izquierda, 1-2★ y la mitad de las 3★; a la derecha, 4-5★. El porcentaje final es el de valoraciones positivas.',
      rows: rows,
      table: { head: ['Libro', '1★', '2★', '3★', '4★', '5★'], rows: rows.map(function (r) {
        return [r.label].concat([1, 2, 3, 4, 5].map(function (s) { return U.fmtNum(r.dist[s] / (r.total || 1) * 100) + ' %'; }));
      }) }
    });
  }

  function chartYears(ctx, holder, asin) {
    var per = {};
    var list = asin ? reviewsOf(ctx, asin) : [].concat.apply([], ctx.books.map(function (b) { return reviewsOf(ctx, b.asin); }));
    list.forEach(function (r) { if (r.date) { var y = parseInt(r.date.slice(0, 4), 10); per[y] = (per[y] || 0) + 1; } });
    var years = Object.keys(per).map(Number).sort();
    if (years.length < 2) {
      C.empty(holder, { title: 'Reseñas por año', emptyTitle: 'Pendiente de las reseñas',
        emptyText: 'Con las fechas de las reseñas verás si el interés crece o se apaga.',
        action: ctx.hasReviews ? null : { href: '#importar', label: 'Importar reseñas' } });
      return;
    }
    var pts = [];
    for (var y = years[0]; y <= years[years.length - 1]; y++) pts.push({ x: y, y: per[y] || 0 });
    C.yearsArea(holder, {
      title: 'Reseñas por año',
      subtitle: 'Reseñas publicadas cada año' + (asin ? '.' : ' en todos los libros. Si la curva sube, el nicho está vivo.'),
      points: pts, unit: 'reseñas',
      table: { head: ['Año', 'Reseñas'], rows: pts.map(function (p) { return [p.x, p.y]; }) }
    });
  }

  function chartPricePage(ctx, holder) {
    var rows = ctx.books.map(function (b) {
      var p = mainPrice(b);
      if (!p || !b.pages) return null;
      var v = p.amount / b.pages * 100;
      return { label: shortTitle(b), value: v, display: U.fmtNum(v, 1) + ' ¢', tip: [U.fmtNum(v, 1) + ' céntimos de dólar por página', shortTitle(b), U.fmtMoney(p.amount, p.currency) + ' · ' + b.pages + ' páginas'] };
    }).filter(Boolean).sort(function (a, b) { return a.value - b.value; });
    if (!rows.length) { holder.textContent = ''; return; }
    C.hbar(holder, {
      title: 'Precio por página',
      subtitle: 'Céntimos de dólar por página. TASCHEN marca el listón de valor.',
      rows: rows,
      table: { head: ['Libro', '¢ por página'], rows: rows.map(function (r) { return [r.label, U.fmtNum(r.value, 1)]; }) }
    });
  }

  // ---------------------------------------------------------------- INICIO

  V.home = function (ctx, main) {
    var sc = ctx.res.score;
    var level = statusForScore(sc.total);
    var links = ctx.DS.links;
    main.appendChild(U.pageHead('Nicho: Gaudí y la Sagrada Família · amazon.com', '¿Merece la pena este nicho?', ctx.INS.summary && ctx.INS.summary.headline));
    main.appendChild(dataStatusCallout(ctx));

    // Veredicto
    var verdict = h('section', { class: 'verdict', 'aria-labelledby': 'verdict-title' },
      U.catenary('verdict-arch', 1000, 58),
      h('div', { class: 'verdict-main' },
        h('p', { class: 'eyebrow', id: 'verdict-title' }, 'Puntuación del nicho'),
        h('p', { class: 'score' }, sc.total == null ? '—' : String(sc.total), h('small', null, ' / 100')),
        h('div', { class: 'meter ' + level, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(sc.total || 0), 'aria-label': 'Puntuación del nicho' },
          h('span', { style: { width: (sc.total || 0) + '%' } })),
        h('p', { class: 'verdict-label' }, U.status(level, sc.verdict.label)),
        h('p', { class: 'small ink-2' }, 'Calculada con el ' + sc.coverage + ' % de los datos que necesita. ',
          h('a', { href: '#metodologia' }, 'Cómo se calcula'))),
      h('div', { class: 'parts' }, sc.parts.map(function (p) {
        return h('div', { class: 'part' + (p.score == null ? ' null' : '') },
          h('span', { class: 'name' }, p.label),
          h('span', { class: 'bar' }, h('span', { style: { width: (p.score || 0) + '%' } })),
          h('span', { class: 'val' }, p.score == null ? '—' : String(p.score)),
          h('span', { class: 'why' }, p.detail, ' ', U.chip('confianza ' + p.confidence)));
      })));
    main.appendChild(verdict);

    // KPIs
    var m = ctx.res.market;
    var kpis = [
      { label: 'Libros únicos', value: String(ctx.books.length), detail: links ? 'de ' + links.total + ' enlaces; ' + links.duplicates + ' repetidos descartados' : '' },
      { label: 'Valoraciones sumadas', value: (ctx.books.some(isApprox) ? '≈ ' : '') + U.fmtNum(m.totalRatings), detail: 'en ' + m.booksWithRatings + ' libros con dato' },
      { label: 'Nota media ponderada', value: m.avgRatingWeighted == null ? '—' : U.fmtRating(m.avgRatingWeighted) + '★', detail: 'por número de valoraciones' },
      { label: 'Precio mediano en papel', value: m.printPrice.median == null ? '—' : U.fmtMoney(m.printPrice.median), detail: m.printPrice.n + ' libros con precio' },
      { label: 'Libros de 5 años o más', value: m.ageYears.older5 + ' de ' + m.ageYears.n, detail: 'antigüedad mediana ' + U.fmtNum(m.ageYears.median, 1) + ' años' },
      { label: 'Reseñas importadas', value: U.fmtNum(ctx.res.reviewCount), detail: ctx.hasReviews ? (m.pctCriticalReviews != null ? pct(m.pctCriticalReviews) + ' de 1-3★' : '') : 'pendiente de extraer' }
    ];
    main.appendChild(h('section', { 'aria-label': 'Cifras clave' }, U.kpiGrid(kpis)));

    // Lectura rápida
    if (ctx.INS.summary) {
      main.appendChild(U.section('Lectura rápida', null, h('ul', { class: 'prose', style: { paddingLeft: '1.2em', margin: 0 } },
        ctx.INS.summary.bullets.map(function (b) { return h('li', null, b); }))));
    }

    // Gráficas
    var g1 = h('div'), g2 = h('div'), g3 = h('div'), g4 = h('div'), g5 = h('div'), g6 = h('div');
    main.appendChild(U.section('El mercado en gráficas', null, h('div', { class: 'grid grid-2' }, g1, g2, g3, g4, g5, g6)));
    chartDemand(ctx, g1);
    chartTimeline(ctx, g2);
    chartThemes(ctx, g3, 10);
    chartGoodreads(ctx, g4);
    chartStars(ctx, g5);
    chartYears(ctx, g6);

    // Contexto 2026
    var mk = ctx.DS.market;
    if (mk && mk.kpis) {
      main.appendChild(U.section('Por qué ahora', 'El centenario de Gaudí y el final de la torre central disparan el interés.',
        [U.kpiGrid(mk.kpis.slice(0, 4)), h('p', null, h('a', { href: '#contexto' }, 'Ver el contexto completo de 2026 →'))]));
    }

    // Entrar / no entrar
    var enter = (ctx.INS.enter || []).slice(0, 3), avoid = (ctx.INS.avoid || []).slice(0, 3);
    main.appendChild(h('div', { class: 'grid grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'Cómo entrar'),
        enter.length ? h('ol', { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '6px' } }, enter.map(function (e) { return h('li', null, e.title); }))
          : h('p', { class: 'muted' }, 'No hay recomendaciones todavía.'),
        h('a', { href: '#entrar' }, 'Ver todo →')),
      h('section', { class: 'card' }, h('h3', null, 'Cómo no entrar'),
        avoid.length ? h('ul', { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '6px' } }, avoid.map(function (e) { return h('li', null, e.title); }))
          : h('p', { class: 'muted' }, 'No se ha detectado nada que desaconsejar.'),
        h('a', { href: '#no-entrar' }, 'Ver todo →'))));

    // Accesos
    var win = ctx.routes.filter(function (r) { return r.window; })[0];
    main.appendChild(U.section('Todas las secciones', null, [h('nav', { class: 'shortcuts', 'aria-label': 'Accesos' },
      ctx.routes.filter(function (r) { return r.id !== 'inicio' && !r.window; }).map(function (r) {
        return h('a', { class: 'shortcut', href: '#' + r.id }, h('strong', null, r.label), h('span', null, r.desc));
      })),
      win ? h('div', { class: 'window-cta' }, h('div', { class: 'stack', style: { gap: '2px' } }, h('strong', null, win.label), h('span', { class: 'small ink-2' }, win.desc + '. Se abre en su propia ventana.')),
        h('a', { class: 'btn primary', href: '#' + win.id }, 'Abrir ↗')) : null]));
    main.appendChild(basisNote(ctx));
  };

  // ---------------------------------------------------------------- LIBROS

  function bookCard(ctx, b) {
    var st = ctx.res.perBook[b.asin];
    return h('a', { class: 'card card-link book-card', href: '#libro-' + b.asin },
      U.cover(b),
      h('div', { class: 'book-meta' },
        h('h3', null, b.title),
        b.subtitle ? h('p', { class: 'sub' }, b.subtitle) : null,
        h('p', { class: 'small ink-2' }, (b.authors || []).join(', ')),
        h('div', { class: 'row' }, U.stars(b.rating, { empty: 'sin nota' }), h('span', { class: 'small ink-2 num' }, ratingsText(b, true))),
        h('div', { class: 'row small' }, h('strong', { class: 'num' }, priceText(b)), h('span', { class: 'muted' }, (mainPrice(b) || {}).format || b.format || '')),
        h('div', { class: 'row' }, U.chip(U.fmtDate(b.publicationDate)), U.chip(b.language || '—'), U.chip(TYPE_LABEL[b.publisherType] || b.publisher || '—')),
        st && st.extracted ? h('p', { class: 'live' }, U.plural(st.extracted, 'reseña importada', 'reseñas importadas')) : null));
  }

  V.books = function (ctx, main) {
    var links = ctx.DS.links;
    main.appendChild(U.pageHead('Libros', 'Los ' + ctx.books.length + ' libros analizados',
      links ? 'Enviaste ' + links.total + ' enlaces; ' + links.duplicates + ' estaban repetidos y se han descartado. Pulsa un libro para ver su ficha y sus reseñas.' : null));
    var sortSel = h('select', { class: 'input', id: 'sort-books' },
      [['valoraciones', 'Más valoraciones'], ['nota', 'Mejor nota'], ['precio', 'Precio'], ['anio', 'Más recientes']].map(function (o) {
        return h('option', { value: o[0] }, o[1]);
      }));
    sortSel.value = U.loadPref('sortBooks', 'valoraciones');
    var grid = h('div', { class: 'book-grid' });
    function draw() {
      var k = sortSel.value;
      U.savePref('sortBooks', k);
      var list = ctx.books.slice().sort(function (a, b) {
        if (k === 'nota') return (b.rating || 0) - (a.rating || 0);
        if (k === 'precio') return ((mainPrice(a) || {}).amount || 999) - ((mainPrice(b) || {}).amount || 999);
        if (k === 'anio') return (U.decimalYear(b.publicationDate) || 0) - (U.decimalYear(a.publicationDate) || 0);
        return (b.ratingsTotal || -1) - (a.ratingsTotal || -1);
      });
      grid.textContent = '';
      list.forEach(function (b) { grid.appendChild(bookCard(ctx, b)); });
    }
    sortSel.addEventListener('change', draw);
    main.appendChild(h('div', { class: 'filters' }, h('div', { class: 'field' }, h('label', { for: 'sort-books' }, 'Ordenar por'), sortSel)));
    main.appendChild(grid);
    draw();
    if (ctx.books.some(isApprox)) {
      main.appendChild(h('p', { class: 'foot-note' }, '≈ Valoraciones y precios aproximados de búsqueda web (' + U.fmtDate(ctx.DS.consultado) +
        '). Al importar las reseñas de un libro se sustituyen por los datos exactos de Amazon.'));
    }
    if (links) {
      main.appendChild(U.section('Enlaces recibidos', 'Los repetidos no se analizan dos veces.', h('div', { class: 'table-wrap' },
        h('table', null, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Enlace'), h('th', null, 'Libro'), h('th', null, 'Estado'))),
          h('tbody', null, links.list.map(function (l, i) {
            var b = l.asin && ctx.byAsin[l.asin];
            return h('tr', null, h('td', { class: 'num' }, String(i + 1)),
              h('td', null, U.extLink(l.url, l.asin ? '…/customer-reviews/' + l.asin : l.url)),
              h('td', null, b ? h('a', { href: '#libro-' + b.asin }, shortTitle(b)) : '—'),
              h('td', null, l.duplicate ? U.chip('repetido') : U.chip('analizado', 'accent')));
          }))))));
    }
  };

  // ------------------------------------------------------------ FICHA LIBRO

  V.book = function (ctx, main, asin) {
    var b = ctx.byAsin[asin];
    if (!b) { main.appendChild(U.pageHead('Libros', 'Libro no encontrado', 'No hay ningún libro con el ASIN ' + asin + '.')); return; }
    var st = ctx.res.perBook[asin];
    var reviews = reviewsOf(ctx, asin);
    var p = mainPrice(b);
    main.appendChild(h('p', null, h('a', { href: '#libros' }, '← Todos los libros')));
    var facts = [
      ['Valoraciones', ratingsText(b, false)],
      ['Nota media', b.rating != null ? U.fmtRating(b.rating) + ' de 5' : (b.ratingProxy ? 'sin dato en EE. UU. (' + marketName(b.ratingProxy.market) + ': ' + U.fmtRating(b.ratingProxy.rating) + ')' : 'sin dato')],
      ['Precio', p ? priceText(b) + (p.format ? ' · ' + p.format : '') : (b.priceNote || '—')],
      ['Páginas', b.pages ? String(b.pages) : '—'],
      ['Formato', b.format || b.formatLine || '—'],
      ['Publicación', U.fmtDate(b.publicationDate)],
      ['Editorial', (b.publisher || '—') + (b.publisherType ? ' · ' + (TYPE_LABEL[b.publisherType] || '') : '')],
      ['Idioma', b.language || '—'],
      ['ASIN / ISBN', b.asin + (b.isbn13 ? ' · ' + b.isbn13 : '')],
      ['Goodreads', b.goodreads ? U.fmtNum(b.goodreads.rating, 2) + ' (' + U.fmtNum(b.goodreads.ratings) + ')' : '—']
    ];
    if (b.bestSellersRank && b.bestSellersRank.length) {
      facts.push(['Ranking de ventas', b.bestSellersRank.map(function (r) { return 'n.º ' + U.fmtNum(r.rank) + ' en ' + r.category; }).join(' · '), true]);
    }
    main.appendChild(h('header', { class: 'book-hero' },
      U.cover(b, 'lg'),
      h('div', { class: 'stack-lg' },
        h('div', { class: 'stack' },
          h('p', { class: 'eyebrow' }, b.type || 'Libro'),
          h('h1', null, b.title),
          b.subtitle ? h('p', { class: 'lead ink-2', style: { fontSize: 'var(--step-1)' } }, b.subtitle) : null,
          h('p', { class: 'ink-2' }, (b.authors || []).join(', ')),
          h('div', { class: 'row' }, U.stars(b.rating), h('span', { class: 'ink-2 num' }, ratingsText(b, true)))),
        h('div', { class: 'facts' }, facts.map(function (f) { return h('div', { class: 'fact' + (f[2] ? ' wide' : '') }, h('span', { class: 'k' }, f[0]), h('span', { class: 'v' }, f[1])); })),
        h('div', { class: 'row' },
          h('a', { class: 'btn primary', href: '#resenas-' + asin }, reviews.length ? 'Ver sus ' + U.fmtNum(reviews.length) + ' reseñas' : 'Página de reseñas'),
          U.extLink(productUrl(b), 'Ficha en Amazon ↗', 'btn'),
          U.extLink(reviewsUrl(ctx, b), 'Reseñas en Amazon ↗', 'btn')),
        h('p', { class: 'foot-note' }, isApprox(b)
          ? 'Datos de búsqueda web del ' + U.fmtDate(b.metaDate) + '. ' + (b.ratingNote || '')
          : 'Datos extraídos de Amazon el ' + U.fmtDate((b.metaDate || '').slice(0, 10)) + '.'))));

    var note = ctx.INS.bookNotes && ctx.INS.bookNotes[asin];
    if (note) {
      main.appendChild(h('div', { class: 'grid grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'Qué hace bien (no lo copies, iguálalo)'), h('p', null, note.learn)),
        h('section', { class: 'card' }, h('h3', null, 'Dónde puedes superarlo'), h('p', null, note.beat))));
    }

    if (b.customersSay || (b.aspects && b.aspects.length)) {
      main.appendChild(U.section('Lo que resume Amazon', 'Resumen automático de Amazon a partir de las reseñas.', h('div', { class: 'card' },
        b.customersSay ? h('p', null, b.customersSay) : null,
        b.aspects && b.aspects.length ? h('div', { class: 'row' }, b.aspects.map(function (a) {
          var s = a.sentiment === 'positive' ? 'good' : a.sentiment === 'negative' ? 'crit' : 'warn';
          return h('span', { class: 'chip' }, U.status(s, a.name + (a.positive != null ? ' · ' + a.positive + ' +' : '') + (a.negative != null ? ' / ' + a.negative + ' −' : '')));
        })) : null)));
    }

    if (st && st.extracted) {
      var gA = h('div'), gB = h('div');
      main.appendChild(U.section('Sus reseñas en números', null, [
        U.kpiGrid([['Reseñas importadas', U.fmtNum(st.extracted)], ['Positivas (4-5★)', pct(st.pctPos)], ['Negativas (1-2★)', pct(st.pctNeg)],
          ['Compra verificada', pct(st.verifiedPct)], ['Última reseña', U.fmtDate(st.lastDate)], ['Últimos 12 meses', U.fmtNum(st.last12m)]]
          .map(function (k) { return { label: k[0], value: k[1] }; })),
        h('div', { class: 'grid grid-2' }, gA, gB)]));
      var rows = st.themes.filter(function (t) { return t.praise + t.pain; }).slice(0, 10).map(function (t) { return { label: t.short, praise: t.praise, pain: t.pain }; });
      if (rows.length) C.themesDiverging(gA, { title: 'Temas de este libro', subtitle: 'Reseñas que elogian o critican cada tema.', rows: rows,
        table: { head: ['Tema', 'Elogios', 'Quejas'], rows: rows.map(function (r) { return [r.label, r.praise, r.pain]; }) } });
      chartYears(ctx, gB, asin);
      var best = st.topPositive, worst = st.topNegative;
      main.appendChild(h('div', { class: 'grid grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'Las buenas más útiles'), best.length ? best.map(function (r) { return reviewNode(r, { compact: true }); }) : h('p', { class: 'muted' }, 'No hay reseñas positivas.')),
        h('section', { class: 'card' }, h('h3', null, 'Las malas más útiles'), worst.length ? worst.map(function (r) { return reviewNode(r, { compact: true }); }) : h('p', { class: 'muted' }, 'No hay reseñas de 1-2★.'))));
    }

    var pos = signalsFor(ctx, asin, 'positivo'), neg = signalsFor(ctx, asin, 'negativo');
    main.appendChild(U.section('Señales públicas de lectores y crítica', 'Encontradas con un buscador; no sustituyen a las reseñas de Amazon.', h('div', { class: 'two-cols' },
      h('div', { class: 'stack' }, h('h3', null, 'A favor'), pos.length ? pos.map(function (s) { return quote(ctx, s); }) : h('p', { class: 'muted' }, 'No se encontraron.')),
      h('div', { class: 'stack' }, h('h3', null, 'En contra'), neg.length ? neg.map(function (s) { return quote(ctx, s); }) : h('p', { class: 'muted' }, 'No se encontraron.')))));

    var outdated = ((ctx.DS.market && ctx.DS.market.outdated) || []).filter(function (o) { return (o.affects || []).indexOf(asin) >= 0; });
    if (outdated.length) {
      main.appendChild(U.section('Qué tiene desfasado', 'Hechos posteriores a su publicación (' + U.fmtDate(b.publicationDate) + ').',
        h('ul', { class: 'evidence' }, outdated.map(function (o) { return h('li', null, o.text, ' ', U.extLink(o.source, U.hostOf(o.source))); }))));
    }
    if (b.notes || (b.sources && b.sources.length)) {
      main.appendChild(U.section('Notas y fuentes', null, h('div', { class: 'stack' },
        b.notes ? h('p', null, b.notes) : null,
        b.sources ? h('ul', { class: 'evidence' }, b.sources.map(function (s) { return h('li', null, U.extLink(s, s.replace(/^https?:\/\//, '').slice(0, 90))); })) : null)));
    }
  };

  // --------------------------------------------------------------- RESEÑAS

  function reviewNode(r, opts) {
    opts = opts || {};
    var a = r.__a || A.analyzeReview(r);
    var body = h('p', { class: 'review-body' + (r.body.length > 600 && !opts.full ? ' clamped' : '') }, r.body || '(sin texto)');
    var more = null;
    if (r.body.length > 600 && !opts.full) {
      more = h('button', { class: 'linkish', type: 'button', 'aria-expanded': 'false' }, 'Leer entera');
      more.addEventListener('click', function () {
        var open = body.classList.toggle('clamped');
        more.textContent = open ? 'Leer entera' : 'Mostrar menos';
        more.setAttribute('aria-expanded', String(!open));
      });
    }
    return h('article', { class: 'review' },
      h('div', { class: 'review-head' }, U.stars(r.rating), r.title ? h('span', { class: 'review-title' }, r.title) : null),
      h('div', { class: 'review-meta' },
        h('span', null, r.author || 'Anónimo'),
        r.date ? h('span', null, U.fmtDate(r.date)) : (r.dateText ? h('span', null, r.dateText) : null),
        r.country ? h('span', null, r.country) : null,
        r.verified ? h('span', null, 'Compra verificada') : null,
        r.vine ? h('span', null, 'Vine') : null,
        r.format ? h('span', null, r.format) : null,
        r.helpful ? h('span', null, 'Útil para ' + U.fmtNum(r.helpful)) : null),
      body, more,
      a.themes.length && !opts.compact ? h('div', { class: 'row' }, a.themes.slice(0, 6).map(function (id) { return U.chip(themeShort(id)); })) : null);
  }

  V.reviewsIndex = function (ctx, main) {
    main.appendChild(U.pageHead('Reseñas', 'Reseñas por libro', 'Cada libro tiene su página con todas sus reseñas, las buenas y las malas, con filtros y búsqueda.'));
    main.appendChild(dataStatusCallout(ctx));
    main.appendChild(h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Libro'), h('th', { class: 'n' }, 'Importadas'), h('th', { class: 'n' }, 'Buenas'), h('th', { class: 'n' }, 'Neutras'), h('th', { class: 'n' }, 'Malas'), h('th', null, 'Última'), h('th', null, ''))),
      h('tbody', null, ctx.books.map(function (b) {
        var st = ctx.res.perBook[b.asin];
        return h('tr', null,
          h('td', null, h('a', { href: '#resenas-' + b.asin }, shortTitle(b))),
          h('td', { class: 'n' }, U.fmtNum(st.extracted)),
          h('td', { class: 'n' }, U.fmtNum(st.dist[4] + st.dist[5])),
          h('td', { class: 'n' }, U.fmtNum(st.dist[3])),
          h('td', { class: 'n' }, U.fmtNum(st.dist[1] + st.dist[2])),
          h('td', null, U.fmtDate(st.lastDate)),
          h('td', null, U.extLink(reviewsUrl(ctx, b), 'Amazon ↗')));
      })))));
    if (ctx.hasReviews) {
      var q = h('input', { class: 'input', id: 'global-search', type: 'search', placeholder: 'Buscar en todas las reseñas…' });
      var out = h('div');
      q.addEventListener('input', function () {
        var term = A.normalize(q.value);
        out.textContent = '';
        if (term.length < 3) return;
        var hits = [];
        ctx.books.forEach(function (b) { reviewsOf(ctx, b.asin).forEach(function (r) { if (A.normalize((r.title || '') + ' ' + r.body).indexOf(term) >= 0) hits.push({ b: b, r: r }); }); });
        out.appendChild(h('p', { class: 'small muted' }, U.plural(hits.length, 'resultado', 'resultados')));
        hits.slice(0, 60).forEach(function (x) {
          out.appendChild(h('div', null, h('p', { class: 'small' }, h('a', { href: '#resenas-' + x.b.asin }, shortTitle(x.b))), reviewNode(x.r)));
        });
      });
      main.appendChild(U.section('Buscar en todas las reseñas', null, [h('div', { class: 'field' }, h('label', { for: 'global-search' }, 'Palabra o frase'), q), out]));
    }
  };

  V.bookReviews = function (ctx, main, asin) {
    var b = ctx.byAsin[asin];
    if (!b) { main.appendChild(U.pageHead('Reseñas', 'Libro no encontrado', '')); return; }
    var list = reviewsOf(ctx, asin);
    var st = ctx.res.perBook[asin];
    main.appendChild(h('p', null, h('a', { href: '#resenas' }, '← Reseñas de todos los libros'), ' · ', h('a', { href: '#libro-' + asin }, 'Ficha del libro')));
    main.appendChild(h('header', { class: 'book-card', style: { gridTemplateColumns: '64px minmax(0,1fr)' } }, U.cover(b),
      h('div', { class: 'stack' }, h('p', { class: 'eyebrow' }, 'Reseñas'), h('h1', { style: { fontSize: 'var(--step-3)' } }, b.title),
        b.subtitle ? h('p', { class: 'ink-2' }, b.subtitle) : null,
        h('div', { class: 'row' }, U.stars(b.rating), h('span', { class: 'ink-2' }, ratingsText(b, true)),
          list.length ? U.chip(U.plural(list.length, 'reseña importada', 'reseñas importadas'), 'accent') : null))));

    if (!list.length) {
      main.appendChild(h('div', { class: 'callout warn' },
        h('strong', null, 'Aún no hay reseñas importadas de este libro.'),
        h('span', null, 'Abre sus reseñas en Amazon, ejecuta el extractor («Ver más reseñas» y «Mostrar 10 opiniones más» hasta el final) e importa el archivo en el panel.'),
        h('span', { class: 'row' }, U.extLink(reviewsUrl(ctx, b), 'Abrir sus reseñas en Amazon ↗', 'btn'), h('a', { class: 'btn primary', href: '#importar' }, 'Importar reseñas'))));
      var pos = signalsFor(ctx, asin, 'positivo'), neg = signalsFor(ctx, asin, 'negativo');
      if (pos.length || neg.length) {
        main.appendChild(U.section('Mientras tanto: señales públicas', 'Opiniones encontradas con un buscador (no son las reseñas completas).', h('div', { class: 'two-cols' },
          h('div', { class: 'stack' }, h('div', { class: 'col-head' }, h('h3', null, 'Las buenas')), pos.length ? pos.map(function (s) { return quote(ctx, s); }) : h('p', { class: 'muted' }, 'No se encontraron.')),
          h('div', { class: 'stack' }, h('div', { class: 'col-head neg' }, h('h3', null, 'Las malas')), neg.length ? neg.map(function (s) { return quote(ctx, s); }) : h('p', { class: 'muted' }, 'No se encontraron.')))));
      }
      return;
    }

    // Las buenas y las malas, de un vistazo
    var byHelp = function (x, y) { return (y.helpful - x.helpful) || (y.body.length - x.body.length); };
    var good = list.filter(function (r) { return r.rating >= 4; }).sort(byHelp);
    var bad = list.filter(function (r) { return r.rating && r.rating <= 2; }).sort(byHelp);
    main.appendChild(h('div', { class: 'two-cols' },
      h('section', { class: 'stack' }, h('div', { class: 'col-head' }, h('h2', { style: { fontSize: 'var(--step-2)' } }, 'Las buenas'), h('p', { class: 'small ink-2' }, U.plural(good.length, 'reseña de 4-5★', 'reseñas de 4-5★') + '; las más útiles primero.')),
        good.length ? good.slice(0, 5).map(function (r) { return reviewNode(r, { compact: true }); }) : h('p', { class: 'muted' }, 'No hay reseñas de 4-5★.')),
      h('section', { class: 'stack' }, h('div', { class: 'col-head neg' }, h('h2', { style: { fontSize: 'var(--step-2)' } }, 'Las malas'), h('p', { class: 'small ink-2' }, U.plural(bad.length, 'reseña de 1-2★', 'reseñas de 1-2★') + '; las más útiles primero.')),
        bad.length ? bad.slice(0, 5).map(function (r) { return reviewNode(r, { compact: true }); }) : h('p', { class: 'muted' }, 'No hay reseñas de 1-2★.'))));

    // Lista completa con filtros
    var filter = U.loadPref('revFilter', 'todas');
    var tabs = [['buenas', 'Buenas 4-5★', good.length], ['neutras', 'Neutras 3★', st.dist[3]], ['malas', 'Malas 1-2★', bad.length], ['todas', 'Todas', list.length]];
    var tabRow = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Filtrar por estrellas' });
    var search = h('input', { class: 'input', type: 'search', id: 'rev-search', placeholder: 'Buscar en estas reseñas…' });
    var sort = h('select', { class: 'input', id: 'rev-sort' }, [['utiles', 'Más útiles'], ['recientes', 'Más recientes'], ['antiguas', 'Más antiguas'], ['mejor', 'Mejor nota'], ['peor', 'Peor nota']].map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    var themeSel = h('select', { class: 'input', id: 'rev-theme' }, h('option', { value: '' }, 'Todos los temas'),
      st.themes.filter(function (t) { return t.mentions; }).map(function (t) { return h('option', { value: t.id }, t.short + ' (' + t.mentions + ')'); }));
    var listBox = h('div');
    var shown = 30;
    function current() {
      var term = A.normalize(search.value);
      var th = themeSel.value;
      var out = list.filter(function (r) {
        if (filter === 'buenas' && !(r.rating >= 4)) return false;
        if (filter === 'neutras' && r.rating !== 3) return false;
        if (filter === 'malas' && !(r.rating && r.rating <= 2)) return false;
        if (th && (r.__a ? r.__a.themes : A.analyzeReview(r).themes).indexOf(th) < 0) return false;
        if (term.length >= 2 && A.normalize((r.title || '') + ' ' + r.body + ' ' + (r.author || '')).indexOf(term) < 0) return false;
        return true;
      });
      var k = sort.value;
      out.sort(function (x, y) {
        if (k === 'recientes') return String(y.date || '').localeCompare(String(x.date || ''));
        if (k === 'antiguas') return String(x.date || '9').localeCompare(String(y.date || '9'));
        if (k === 'mejor') return (y.rating || 0) - (x.rating || 0) || byHelp(x, y);
        if (k === 'peor') return (x.rating || 9) - (y.rating || 9) || byHelp(x, y);
        return byHelp(x, y);
      });
      return out;
    }
    function draw() {
      U.savePref('revFilter', filter);
      tabRow.textContent = '';
      tabs.forEach(function (t) {
        var b = h('button', { class: 'tab', type: 'button', 'aria-pressed': String(filter === t[0]) }, t[1], h('span', { class: 'num' }, String(t[2])));
        b.addEventListener('click', function () { filter = t[0]; shown = 30; draw(); });
        tabRow.appendChild(b);
      });
      var items = current();
      listBox.textContent = '';
      listBox.appendChild(h('p', { class: 'small muted' }, U.plural(items.length, 'reseña', 'reseñas')));
      var wrap = h('div', { class: 'card', style: { gap: '0' } });
      items.slice(0, shown).forEach(function (r) { wrap.appendChild(reviewNode(r)); });
      if (!items.length) wrap.appendChild(h('p', { class: 'muted' }, 'Ninguna reseña coincide con el filtro.'));
      listBox.appendChild(wrap);
      if (items.length > shown) {
        var more = h('button', { class: 'btn', type: 'button', style: { marginTop: '12px' } }, 'Mostrar ' + Math.min(30, items.length - shown) + ' más');
        more.addEventListener('click', function () { shown += 30; draw(); });
        listBox.appendChild(more);
      }
    }
    search.addEventListener('input', function () { shown = 30; draw(); });
    sort.addEventListener('change', draw);
    themeSel.addEventListener('change', function () { shown = 30; draw(); });
    main.appendChild(U.section('Todas las reseñas', null, [
      tabRow,
      h('div', { class: 'filters' },
        h('div', { class: 'field', style: { flex: '1 1 220px' } }, h('label', { for: 'rev-search' }, 'Buscar'), search),
        h('div', { class: 'field' }, h('label', { for: 'rev-sort' }, 'Orden'), sort),
        h('div', { class: 'field' }, h('label', { for: 'rev-theme' }, 'Tema'), themeSel)),
      listBox]));
    draw();
  };

  // ------------------------------------------------------------ COMPARATIVA

  V.compare = function (ctx, main) {
    main.appendChild(U.pageHead('Mercado', 'Comparativa de los libros', 'Todos los datos en una tabla. Pulsa una cabecera para ordenar.'));
    var cols = [
      { k: 'titulo', label: 'Libro', get: function (b) { return shortTitle(b); }, render: function (b) { return h('a', { href: '#libro-' + b.asin }, shortTitle(b)); } },
      { k: 'tipo', label: 'Editorial', get: function (b) { return (b.publisher || '') + ''; }, render: function (b) { return h('span', null, b.publisher || '—', h('br'), h('span', { class: 'muted' }, TYPE_LABEL[b.publisherType] || '')); } },
      { k: 'anio', label: 'Año', n: true, get: function (b) { return U.decimalYear(b.publicationDate) || 0; }, render: function (b) { return U.fmtDate(b.publicationDate); } },
      { k: 'formato', label: 'Formato', get: function (b) { return b.format || ''; } },
      { k: 'idioma', label: 'Idioma', get: function (b) { return b.language || ''; } },
      { k: 'paginas', label: 'Págs.', n: true, get: function (b) { return b.pages || 0; }, render: function (b) { return b.pages ? String(b.pages) : '—'; } },
      { k: 'precio', label: 'Precio', n: true, get: function (b) { return (mainPrice(b) || {}).amount || 0; }, render: function (b) { return priceText(b); } },
      { k: 'ppp', label: '¢/pág.', n: true, get: function (b) { var p = mainPrice(b); return p && b.pages ? p.amount / b.pages * 100 : 0; }, render: function (b) { var p = mainPrice(b); return p && b.pages ? U.fmtNum(p.amount / b.pages * 100, 1) : '—'; } },
      { k: 'nota', label: 'Nota', n: true, get: function (b) { return b.rating || 0; }, render: function (b) { return U.fmtRating(b.rating); } },
      { k: 'val', label: 'Valoraciones', n: true, get: function (b) { return b.ratingsTotal || 0; }, render: function (b) { return ratingsText(b); } },
      { k: 'gr', label: 'Goodreads', n: true, get: function (b) { return b.goodreads ? b.goodreads.rating : 0; }, render: function (b) { return b.goodreads ? U.fmtNum(b.goodreads.rating, 2) : '—'; } },
      { k: 'imp', label: 'Reseñas imp.', n: true, get: function (b) { return ctx.res.perBook[b.asin].extracted; }, render: function (b) { return U.fmtNum(ctx.res.perBook[b.asin].extracted); } },
      { k: 'crit', label: '% 1-3★', n: true, get: function (b) { return ctx.res.perBook[b.asin].pctCritical || 0; }, render: function (b) { var v = ctx.res.perBook[b.asin].pctCritical; return pct(v); } }
    ];
    var sortKey = U.loadPref('cmpSort', 'val'), dir = U.loadPref('cmpDir', -1);
    var wrap = h('div', { class: 'table-wrap' });
    function draw() {
      U.savePref('cmpSort', sortKey); U.savePref('cmpDir', dir);
      var col = cols.filter(function (c) { return c.k === sortKey; })[0] || cols[0];
      var rows = ctx.books.slice().sort(function (a, b) {
        var x = col.get(a), y = col.get(b);
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
      wrap.textContent = '';
      wrap.appendChild(h('table', null,
        h('thead', null, h('tr', null, cols.map(function (c) {
          var btn = h('button', { type: 'button' }, c.label + (c.k === sortKey ? (dir < 0 ? ' ↓' : ' ↑') : ''));
          btn.addEventListener('click', function () { if (sortKey === c.k) dir = -dir; else { sortKey = c.k; dir = c.n ? -1 : 1; } draw(); });
          return h('th', { class: c.n ? 'n' : null, 'aria-sort': c.k === sortKey ? (dir < 0 ? 'descending' : 'ascending') : 'none' }, btn);
        }))),
        h('tbody', null, rows.map(function (b) {
          return h('tr', null, cols.map(function (c) { var v = c.render ? c.render(b) : c.get(b) || '—'; return h('td', { class: c.n ? 'n' : null }, v); }));
        }))));
    }
    draw();
    main.appendChild(wrap);
    main.appendChild(h('p', { class: 'foot-note' }, '≈ = dato aproximado de búsqueda web. ¢/pág. = céntimos de dólar por página. «% 1-3★» se calcula con las reseñas importadas.'));
    var g1 = h('div'), g2 = h('div');
    main.appendChild(h('div', { class: 'grid grid-2' }, g1, g2));
    chartPricePage(ctx, g1);
    chartGoodreads(ctx, g2);
  };

  // ---------------------------------------------------------------- TEMAS

  V.themes = function (ctx, main) {
    main.appendChild(U.pageHead('Mercado', 'Temas de las reseñas', ctx.hasReviews
      ? 'Qué comentan los lectores, clasificado en ' + A.themes.length + ' temas. Cada reseña puede tocar varios.'
      : 'Aún no hay reseñas importadas: los temas se muestran con las señales públicas y se recalcularán solos con las reseñas.'));
    var g = h('div');
    main.appendChild(g);
    chartThemes(ctx, g, 22);
    if (!ctx.hasReviews) {
      main.appendChild(U.section('Señales por tema', null, h('div', { class: 'grid grid-2' }, themeRows(ctx, 22).map(function (t) {
        var sigs = (ctx.DS.signals || []).filter(function (s) { return (s.themes || []).indexOf(t.id) >= 0; });
        return h('section', { class: 'card' }, h('h3', null, themeLabel(t.id)), h('p', { class: 'small ink-2' }, t.praise + ' a favor · ' + t.pain + ' en contra'),
          sigs.slice(0, 3).map(function (s) { return quote(ctx, s, { showBook: true }); }));
      }))));
      return;
    }
    var sel = h('select', { class: 'input', id: 'theme-pick' }, ctx.res.themes.filter(function (t) { return t.mentions; }).map(function (t) {
      return h('option', { value: t.id }, t.label + ' (' + t.mentions + ')');
    }));
    var box = h('div', { class: 'stack-lg' });
    function draw() {
      var t = themeStat(ctx, sel.value);
      box.textContent = '';
      if (!t) return;
      box.appendChild(U.kpiGrid([['Reseñas que lo mencionan', U.fmtNum(t.mentions) + ' (' + pct(t.share) + ')'], ['Nota media de esas reseñas', U.fmtRating(t.avgRating) + '★'], ['Elogios', U.fmtNum(t.praise)], ['Quejas', U.fmtNum(t.complaint)], ['Deseos («me hubiera gustado…»)', U.fmtNum(t.wish)]]
        .map(function (k) { return { label: k[0], value: k[1] }; })));
      var cols = [['praise', 'Elogios', 'pos'], ['complaint', 'Quejas', 'neg'], ['wish', 'Deseos y carencias', 'neg']];
      box.appendChild(h('div', { class: 'grid grid-3' }, cols.map(function (c) {
        var ex = t.examples[c[0]];
        return h('section', { class: 'card' }, h('h3', null, c[1]), ex.length ? ex.map(function (e) {
          var b = ctx.byAsin[e.asin];
          return h('blockquote', { class: 'quote ' + c[2], style: { margin: 0 } }, h('p', null, '«' + e.text + '»'),
            h('p', { class: 'src' }, U.stars(e.rating), b ? h('a', { href: '#resenas-' + b.asin }, shortTitle(b)) : null, e.helpful ? h('span', null, 'útil para ' + e.helpful) : null));
        }) : h('p', { class: 'muted' }, 'Sin ejemplos.'));
      })));
      var books = Object.keys(t.byBook).sort(function (a, b) { return t.byBook[b] - t.byBook[a]; });
      box.appendChild(h('p', { class: 'small ink-2' }, 'Por libro: ', books.map(function (a, i) {
        var b = ctx.byAsin[a];
        return [i ? ' · ' : '', h('a', { href: '#resenas-' + a }, b ? shortTitle(b) : a), ' ' + t.byBook[a]];
      })));
    }
    sel.addEventListener('change', draw);
    main.appendChild(U.section('Explorar un tema', null, [h('div', { class: 'field' }, h('label', { for: 'theme-pick' }, 'Tema'), sel), box]));
    draw();
    var terms = ctx.res.terms;
    if (terms.critical.length || terms.positive.length) {
      var termList = function (list) {
        return h('div', { class: 'row' }, list.map(function (t) { return U.chip(t.term + ' · ' + (t.critical || t.positive)); }));
      };
      main.appendChild(U.section('Palabras que distinguen a las reseñas críticas', 'Palabras y parejas de palabras mucho más frecuentes en las reseñas de 1-3★ que en las de 4-5★, y al revés (log-odds con prior informativo).', h('div', { class: 'grid grid-2' },
        h('section', { class: 'card' }, h('h3', null, 'En las reseñas críticas (1-3★)'), termList(terms.critical)),
        h('section', { class: 'card' }, h('h3', null, 'En las reseñas positivas (4-5★)'), termList(terms.positive)))));
    }
  };

  // ----------------------------------------------------------- COMPETENCIA

  V.competitors = function (ctx, main) {
    var list = ctx.DS.competitors || [];
    var indie = list.filter(function (c) { return c.indie; });
    main.appendChild(U.pageHead('Mercado', 'Competencia ampliada', 'Otros libros del nicho que no estaban en tus enlaces, encontrados con un buscador.'));
    main.appendChild(U.kpiGrid([
      { label: 'Competidores encontrados', value: String(list.length) },
      { label: 'Autoeditados (KDP)', value: String(indie.length), detail: (function () {
        var checked = indie.filter(function (c) { return c.ratingsChecked; }).length;
        return checked ? checked + ' revisados, ninguno con valoraciones visibles' : '';
      })() },
      { label: 'Editoriales tradicionales', value: String(list.length - indie.length) }]));
    main.appendChild(h('div', { class: 'callout' }, h('strong', null, 'Lectura: '), h('span', null, 'los fotolibros y libros de colorear autoeditados de 2025-2026 que se revisaron no tienen valoraciones visibles. Las editoriales tradicionales cubren los formatos visuales, infantiles y técnicos. Ya hay alguna guía autoeditada: revisa sus reseñas.')));
    main.appendChild(h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Título'), h('th', null, 'Autor'), h('th', null, 'Ángulo'), h('th', null, 'Tipo'), h('th', null, 'Nota'), h('th', null, 'Fuente'))),
      h('tbody', null, list.map(function (c) {
        return h('tr', null, h('td', null, c.title), h('td', null, c.author), h('td', null, c.angle),
          h('td', null, c.indie ? U.chip('Autoedición') : U.chip('Editorial')),
          h('td', null, c.note || '', c.indie ? h('span', { class: 'muted' }, c.ratingsChecked ? ' · sin valoraciones visibles' : ' · valoraciones sin comprobar') : null),
          h('td', null, U.extLink(c.source, U.hostOf(c.source))));
      })))));
  };

  // ------------------------------------------------------------- CONTEXTO

  V.context = function (ctx, main) {
    var mk = ctx.DS.market;
    main.appendChild(U.pageHead('Mercado', 'Contexto de 2026', 'Lo que ha pasado alrededor de Gaudí y la Sagrada Família, y lo que significa para un libro nuevo.'));
    if (!mk) { main.appendChild(emptyText('No hay datos de contexto.')); return; }
    main.appendChild(U.kpiGrid(mk.kpis.map(function (k) {
      return { label: k.label, value: k.value, detail: [k.detail, ' ', U.extLink(k.source, 'fuente')] };
    })));
    main.appendChild(U.section('Qué significa para tu libro', null, h('ul', { class: 'evidence', style: { fontSize: 'var(--step-0)' } },
      ['Demanda en máximos: récord de visitantes y la torre central recién terminada. EE. UU. es el primer mercado de visitantes.',
        'Todos los libros anteriores a 2025 están desfasados en algo importante: es la ventaja más fácil de conseguir.',
        'Pon fecha a los datos («actualizado a 2026»): la beatificación y la fachada de la Gloria pueden cambiar en meses.',
        'En español hay muchas novedades del centenario; en inglés, muy pocas de editoriales tradicionales.'].map(function (t) { return h('li', null, t); }))));
    main.appendChild(U.section('Cronología', null, h('ol', { class: 'timeline' }, mk.timeline.map(function (t) {
      return h('li', { class: t.kind }, h('span', { class: 'when' }, U.fmtDate(t.date === '2026-12-31' ? '2026-12' : t.date === '2027-06-01' ? '2027' : t.date)),
        h('span', null, t.text, ' ', U.extLink(t.source, U.hostOf(t.source))));
    }))));
    main.appendChild(h('div', { class: 'grid grid-2' }, mk.sections.map(function (s) {
      return h('section', { class: 'card' }, h('h3', null, s.title), h('ul', { class: 'evidence' }, s.items.map(function (i) {
        return h('li', null, i.text, ' ', U.extLink(i.source, U.hostOf(i.source)));
      })));
    })));
    main.appendChild(U.section('Qué libros quedan desfasados', null, h('div', { class: 'stack' }, mk.outdated.map(function (o) {
      return h('div', { class: 'card' }, h('p', null, o.text),
        o.affects && o.affects.length ? h('p', { class: 'small ink-2' }, 'Afecta a: ', o.affects.map(function (a, i) { var b = ctx.byAsin[a]; return [i ? ', ' : '', h('a', { href: '#libro-' + a }, b ? shortTitle(b) : a)]; })) : null,
        h('p', { class: 'small' }, U.extLink(o.source, U.hostOf(o.source))));
    }))));
    main.appendChild(h('p', { class: 'foot-note' }, mk._nota));
  };

  // ---------------------------------------------------------------- NICHOS

  function levelChip(label, value) {
    var map = { alta: 'good', media: 'warn', baja: 'crit', 'muy alta': 'crit' };
    var inverse = label === 'Competencia';
    var cls = inverse ? ({ baja: 'good', media: 'warn', alta: 'crit', 'muy alta': 'crit' })[value] : map[value];
    return h('span', { class: 'chip' }, U.status(cls || 'none', label + ': ' + value));
  }

  V.niches = function (ctx, main) {
    var list = ctx.INS.niches || [];
    main.appendChild(U.pageHead('Estrategia', 'Nichos posibles', 'Subnichos dentro de «Gaudí y la Sagrada Família», con su demanda, su competencia y cuánto encajan con las quejas de los lectores.'));
    main.appendChild(basisNote(ctx));
    if (!list.length) { main.appendChild(emptyText('No se ha identificado ningún subnicho.')); return; }
    main.appendChild(h('div', { class: 'grid grid-2' }, list.map(function (n) {
      return h('section', { class: 'card' },
        h('div', { class: 'card-foot' }, h('h3', null, n.name), h('span', { class: 'pill-verdict ' + n.verdict }, n.verdict === 'recomendado' ? 'Recomendado' : n.verdict === 'posible' ? 'Posible' : 'Evitar')),
        h('p', null, n.pitch),
        h('div', { class: 'row' }, levelChip('Demanda', n.demand), levelChip('Competencia', n.competition), levelChip('Encaje', n.fit)),
        h('h4', null, 'Por qué'), evidenceList(ctx, n.evidence),
        liveCounts(ctx, n.themes),
        n.risks && n.risks.length ? [h('h4', null, 'Riesgos'), h('ul', { class: 'evidence' }, n.risks.map(function (r) { return h('li', null, r); }))] : null);
    })));
  };

  // -------------------------------------------------------------- AVATARES

  V.avatars = function (ctx, main) {
    var list = ctx.INS.avatars || [];
    main.appendChild(U.pageHead('Estrategia', 'Avatares de lector', 'Quién compra estos libros, qué busca y qué le frustra. El primero es el lector principal recomendado.'));
    main.appendChild(basisNote(ctx));
    if (!list.length) { main.appendChild(emptyText('No hay avatares definidos.')); return; }
    main.appendChild(h('div', { class: 'grid grid-2' }, list.map(function (a) {
      var ul = function (items) { return h('ul', { class: 'evidence' }, items.map(function (x) { return h('li', null, x); })); };
      return h('section', { class: 'card' },
        h('div', { class: 'card-foot' }, h('h3', null, a.name), a.primary ? U.chip('Lector principal', 'accent') : null),
        h('p', { class: 'ink-2' }, a.profile),
        h('div', { class: 'grid grid-2', style: { gap: '12px' } },
          h('div', { class: 'stack' }, h('h4', null, 'Quiere'), ul(a.wants)),
          h('div', { class: 'stack' }, h('h4', null, 'Le frustra'), ul(a.frustrations))),
        h('div', { class: 'stack' }, h('h4', null, 'Qué le hace comprar'), ul(a.triggers)),
        h('div', { class: 'callout' }, h('strong', null, 'Promesa: '), h('span', null, a.promise)),
        h('div', { class: 'stack' }, h('h4', null, 'En qué nos basamos'), ul(a.evidence)),
        liveCounts(ctx, a.themes));
    })));
  };

  // -------------------------------------------------------------- ENFOQUES

  V.approaches = function (ctx, main) {
    var list = ctx.INS.approaches || [];
    main.appendChild(U.pageHead('Estrategia', 'Enfoques para tu libro', 'Cinco formas de entrar, con su formato, su precio y sus pros y contras. Las barras van de 1 (peor) a 5 (mejor).'));
    main.appendChild(basisNote(ctx));
    if (!list.length) { main.appendChild(emptyText('No hay enfoques definidos.')); return; }
    var avatarName = {};
    (ctx.INS.avatars || []).forEach(function (a) { avatarName[a.id] = a.name; });
    main.appendChild(h('div', { class: 'grid grid-2' }, list.map(function (a) {
      var ul = function (items) { return h('ul', { class: 'evidence' }, items.map(function (x) { return h('li', null, x); })); };
      var labels = { demanda: 'Demanda', competencia: 'Poca competencia', encaje: 'Encaje', coste: 'Coste bajo' };
      return h('section', { class: 'card' },
        h('div', { class: 'card-foot' }, h('h3', null, a.name), a.recommended ? U.chip('Recomendado', 'accent') : null),
        h('p', null, a.idea),
        h('div', { class: 'facts' }, h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Formato'), h('span', { class: 'v' }, a.format)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Precio'), h('span', { class: 'v' }, a.price))),
        h('div', { class: 'stack' }, Object.keys(a.scores).map(function (k) {
          return h('div', { class: 'scorebar' }, h('span', null, labels[k] || k), h('span', { class: 'bar' }, h('span', { style: { width: a.scores[k] * 20 + '%' } })), h('span', { class: 'num' }, String(a.scores[k])));
        })),
        h('div', { class: 'grid grid-2', style: { gap: '12px' } }, h('div', { class: 'stack' }, h('h4', null, 'A favor'), ul(a.pros)), h('div', { class: 'stack' }, h('h4', null, 'En contra'), ul(a.cons))),
        h('p', null, h('strong', null, 'Diferencia: '), a.differentiation),
        h('p', { class: 'small ink-2' }, 'Para: ', a.avatars.map(function (id) { return avatarName[id] || id; }).join(' · ')));
    })));
  };

  // ------------------------------------------------ CÓMO ENTRAR / NO ENTRAR

  V.enter = function (ctx, main) {
    var list = ctx.INS.enter || [];
    main.appendChild(U.pageHead('Estrategia', 'Cómo entrar', 'El enfoque recomendado para tu libro, por orden de importancia.'));
    main.appendChild(basisNote(ctx));
    if (!list.length) { main.appendChild(emptyText('No hay recomendaciones: con los datos actuales no se ve una forma clara de entrar en este nicho.')); return; }
    main.appendChild(h('div', { class: 'item-list' }, list.map(function (e) {
      return h('article', { class: 'item' }, h('h3', null, e.title), h('p', { class: 'why' }, e.why),
        e.how ? h('p', { class: 'how' }, h('strong', null, 'Cómo: '), e.how) : null,
        h('div', null, evidenceList(ctx, e.evidence), liveCounts(ctx, e.themes)));
    })));
  };

  V.avoid = function (ctx, main) {
    var list = ctx.INS.avoid || [];
    main.appendChild(U.pageHead('Estrategia', 'Cómo no entrar', 'Lo que no debes poner nunca o lo que está desaconsejado en este nicho.'));
    main.appendChild(basisNote(ctx));
    if (!list.length) { main.appendChild(emptyText('No se ha detectado nada que desaconsejar en este nicho con los datos actuales.')); return; }
    var groups = [['nunca', 'Nunca'], ['desaconsejado', 'Desaconsejado']];
    groups.forEach(function (g) {
      var items = list.filter(function (x) { return x.severity === g[0]; });
      main.appendChild(U.section(g[1], null, items.length ? h('div', { class: 'item-list' }, items.map(function (e) {
        return h('article', { class: 'item no' }, h('h3', null, e.title), h('p', { class: 'why' }, e.why),
          h('div', null, evidenceList(ctx, e.evidence), liveCounts(ctx, e.themes)));
      })) : h('p', { class: 'muted' }, g[0] === 'nunca' ? 'No hay nada que se deba evitar siempre.' : 'No hay nada desaconsejado.')));
    });
  };

  // ------------------------------------------------------- POSICIONAMIENTO

  function royaltyCalculator() {
    var presets = {
      bn: { label: 'Tapa blanda, blanco y negro', fixed: 1.0, perPage: 0.012, minPages: 110, smallFixed: 2.3 },
      std: { label: 'Tapa blanda, color estándar', fixed: 1.0, perPage: 0.0255, minPages: 72, smallFixed: null },
      prem: { label: 'Tapa blanda, color prémium', fixed: 1.0, perPage: 0.07, minPages: 24, smallFixed: null }
    };
    var f = {
      kind: h('select', { class: 'input', id: 'calc-kind' }, Object.keys(presets).map(function (k) { return h('option', { value: k }, presets[k].label); })),
      pages: h('input', { class: 'input', id: 'calc-pages', type: 'number', min: '24', max: '828', value: '140' }),
      price: h('input', { class: 'input', id: 'calc-price', type: 'number', min: '0.99', step: '0.01', value: '19.99' }),
      fixed: h('input', { class: 'input', id: 'calc-fixed', type: 'number', step: '0.01' }),
      perPage: h('input', { class: 'input', id: 'calc-pp', type: 'number', step: '0.0001' }),
      ebook: h('input', { class: 'input', id: 'calc-ebook', type: 'number', step: '0.01', value: '6.99' }),
      mb: h('input', { class: 'input', id: 'calc-mb', type: 'number', step: '0.5', value: '20' })
    };
    f.kind.value = 'std';
    var out = h('div', { class: 'kpis c4' });
    function preset() { var p = presets[f.kind.value]; f.fixed.value = p.fixed; f.perPage.value = p.perPage; calc(); }
    function calc() {
      var p = presets[f.kind.value];
      var pages = Math.max(24, parseInt(f.pages.value, 10) || 0);
      var price = parseFloat(f.price.value) || 0;
      var cost = (p.smallFixed != null && pages < p.minPages) ? p.smallFixed : (parseFloat(f.fixed.value) || 0) + pages * (parseFloat(f.perPage.value) || 0);
      var roy = price * 0.6 - cost;
      var eb = parseFloat(f.ebook.value) || 0;
      // Plan del 70 % (solo entre 2,99 y 9,99 US$, con coste de entrega por MB) frente al 35 %: se muestra el mejor.
      var roy70 = eb >= 2.99 && eb <= 9.99 ? eb * 0.7 - 0.15 * (parseFloat(f.mb.value) || 0) : null;
      var roy35 = eb * 0.35;
      var ebRate = roy70 != null && roy70 > roy35 ? 0.7 : 0.35;
      var ebRoy = ebRate === 0.7 ? roy70 : roy35;
      out.textContent = '';
      [['Coste de impresión', U.fmtMoney(cost)], ['Regalía por libro en papel', U.fmtMoney(roy), roy <= 0 ? 'crit' : null],
        ['Margen sobre el precio', price ? U.fmtNum(roy / price * 100) + ' %' : '—'], ['Regalía Kindle (plan del ' + (ebRate * 100) + ' %)', U.fmtMoney(ebRoy)]]
        .forEach(function (k) {
          out.appendChild(h('div', { class: 'kpi' }, h('span', { class: 'label' }, k[0]), h('span', { class: 'value' + (k[2] ? ' ' : '') , style: k[2] ? { color: 'var(--critical-ink)' } : null }, k[1])));
        });
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', k === 'kind' ? preset : calc); });
    f.kind.addEventListener('change', preset);
    var field = function (id, label, input) { return h('div', { class: 'field' }, h('label', { for: id }, label), input); };
    var node = h('section', { class: 'card' },
      h('h3', null, 'Calculadora de regalías (orientativa)'),
      h('p', { class: 'small ink-2' }, 'Tarifas de ejemplo para Amazon.com y tamaños estándar. KDP las actualiza: comprueba las vigentes en la calculadora de KDP antes de decidir el precio. Regalía en papel = 60 % del precio − coste de impresión. Kindle: plan del 70 % entre 2,99 y 9,99 US$ menos la entrega (≈ 0,15 US$ por MB) o plan del 35 %; se muestra el que deja más. Con muchas imágenes, la entrega pesa: comprime las fotos.'),
      h('div', { class: 'filters' }, field('calc-kind', 'Interior', f.kind), field('calc-pages', 'Páginas', f.pages), field('calc-price', 'Precio papel (US$)', f.price),
        field('calc-fixed', 'Coste fijo (US$)', f.fixed), field('calc-pp', 'Coste por página (US$)', f.perPage), field('calc-ebook', 'Precio Kindle (US$)', f.ebook), field('calc-mb', 'Tamaño Kindle (MB)', f.mb)),
      out);
    preset();
    return node;
  }

  V.positioning = function (ctx, main) {
    var p = ctx.INS.positioning;
    main.appendChild(U.pageHead('Estrategia', 'Título y posicionamiento', 'Propuestas de título, subtítulo, palabras clave, categorías, precio, formato y descripción.'));
    if (!p) { main.appendChild(emptyText('No hay propuestas de posicionamiento.')); return; }
    main.appendChild(U.section('Títulos propuestos', null, h('div', { class: 'stack' }, p.titles.map(function (t) {
      var full = t.title + ': ' + t.subtitle;
      var copy = h('button', { class: 'btn', type: 'button' }, 'Copiar');
      copy.addEventListener('click', function () { U.copyText(full, 'Título copiado'); });
      return h('div', { class: 'card' }, h('div', { class: 'card-foot' }, h('div', { class: 'stack', style: { gap: '2px' } },
        h('p', { class: 'eyebrow' }, t.lang === 'EN' ? 'Inglés' : 'Español'), h('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'var(--step-2)' } }, t.title),
        h('p', { class: 'ink-2' }, t.subtitle)), copy), h('p', { class: 'small' }, t.note));
    }))));
    var kw = function (lang) {
      return h('section', { class: 'card' }, h('h3', null, lang === 'EN' ? 'Palabras clave en inglés' : 'Palabras clave en español'),
        h('ol', { style: { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '4px' } }, p.keywords[lang].map(function (k) {
          return h('li', null, k, ' ', U.extLink(AMAZON + '/s?k=' + encodeURIComponent(k) + '&i=stripbooks', 'buscar en Amazon ↗', 'small'));
        })));
    };
    main.appendChild(U.section('Palabras clave (7 huecos de KDP)', 'Pulsa «buscar» para ver qué libros salen hoy con cada una.', h('div', { class: 'grid grid-2' }, kw('EN'), kw('ES'))));
    main.appendChild(h('div', { class: 'grid grid-2' },
      h('section', { class: 'card' }, h('h3', null, 'Categorías'), h('ul', { class: 'evidence' }, p.categories.map(function (c) { return h('li', null, c); })), h('p', { class: 'foot-note' }, p.categoriesNote)),
      h('section', { class: 'card' }, h('h3', null, 'Precio y formato'),
        h('div', { class: 'facts' },
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Papel'), h('span', { class: 'v' }, p.price.print)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Kindle'), h('span', { class: 'v' }, p.price.kindle)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Tamaño'), h('span', { class: 'v' }, p.format.trim)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Páginas'), h('span', { class: 'v' }, p.format.pages)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Interior'), h('span', { class: 'v' }, p.format.interior)),
          h('div', { class: 'fact' }, h('span', { class: 'k' }, 'Ebook'), h('span', { class: 'v' }, p.format.ebook))),
        h('p', { class: 'small ink-2' }, p.price.note))));
    main.appendChild(U.section('Descripción de Amazon (borrador)', null, h('div', { class: 'grid grid-2' }, ['EN', 'ES'].map(function (lang) {
      var copy = h('button', { class: 'btn', type: 'button' }, 'Copiar');
      copy.addEventListener('click', function () { U.copyText(p.description[lang], 'Descripción copiada'); });
      return h('section', { class: 'card' }, h('div', { class: 'card-foot' }, h('h3', null, lang === 'EN' ? 'Inglés' : 'Español'), copy), h('p', null, p.description[lang]));
    }))));
    main.appendChild(royaltyCalculator());
  };

  // ------------------------------------------------------------------ PLAN

  V.plan = function (ctx, main) {
    var plan = ctx.INS.plan || [];
    main.appendChild(U.pageHead('Estrategia', 'Plan de acción', 'Marca los pasos según los completes (se guarda en este navegador).'));
    var done = U.loadPref('plan', {});
    main.appendChild(h('div', { class: 'grid grid-2' }, plan.map(function (ph, i) {
      return h('section', { class: 'card' }, h('div', { class: 'card-foot' }, h('h3', null, (i + 1) + '. ' + ph.phase), U.chip(ph.when)),
        h('div', null, ph.steps.map(function (s, j) {
          var id = 'plan-' + i + '-' + j;
          var cb = h('input', { type: 'checkbox', id: id });
          cb.checked = !!done[id];
          cb.addEventListener('change', function () { done[id] = cb.checked; U.savePref('plan', done); });
          return h('label', { class: 'check', for: id }, cb, h('span', null, s));
        })));
    })));
  };

  // -------------------------------------------------------------- IMPORTAR

  var importLog = { at: 0, lines: [] };

  V.importer = function (ctx, main, app) {
    var S = root.KDPStore;
    main.appendChild(U.pageHead('Datos', 'Importar reseñas', 'Extrae las reseñas en tu navegador (con tu sesión de Amazon) y súbelas aquí. El panel se recalcula solo.'));
    var backendText = {
      artefacto: 'Se guardan en este panel publicado: las verás en cualquier dispositivo y Claude podrá leerlas para afinar el análisis.',
      navegador: 'Se guardan en este navegador (IndexedDB). Para compartirlas, guarda los archivos en data/raw/ del repositorio y ejecuta npm run build.',
      memoria: 'Tu navegador no permite guardar: las reseñas se mantienen hasta que cierres la página.'
    };
    main.appendChild(h('div', { class: 'callout' }, h('strong', null, 'Almacenamiento: '), h('span', { id: 'backend-text' }, S.backend ? backendText[S.backend] : 'comprobando…')));

    var X = root.KDP_EXTRACTOR;
    if (X && X.source) {
      var copySrc = h('button', { class: 'btn primary', type: 'button' }, 'Copiar el código del extractor');
      copySrc.addEventListener('click', function () { U.copyText(X.source, 'Código copiado: pégalo en la consola de Amazon'); });
      var tools = [copySrc];
      if (X.bookmarklet) {
        var bm = h('a', { class: 'btn', href: X.bookmarklet, title: 'Arrástralo a tu barra de marcadores' }, 'Extraer reseñas KDP');
        bm.addEventListener('click', function (e) { e.preventDefault(); U.toast('Arrástralo a la barra de marcadores; se usa en Amazon'); });
        var copyBm = h('button', { class: 'btn', type: 'button' }, 'Copiar el marcador');
        copyBm.addEventListener('click', function () { U.copyText(X.bookmarklet, 'Marcador copiado'); });
        tools.push(bm, copyBm);
      }
      main.appendChild(h('div', { class: 'callout' },
        h('strong', null, 'Extractor listo' + (X.version ? ' (versión ' + X.version + ')' : '') + '.'),
        h('span', null, 'Arrastra «Extraer reseñas KDP» a tu barra de marcadores, o copia el código y pégalo en la consola (F12) de la página de reseñas de Amazon.'),
        h('div', { class: 'row' }, tools)));
    }
    main.appendChild(U.section('1. Extrae las reseñas de cada libro', 'Hay tres formas; la más sencilla es el marcador.', h('div', { class: 'grid grid-3' },
      h('section', { class: 'card' }, h('h3', null, 'Con el marcador (recomendado)'),
        h('ol', { class: 'steps' },
          h('li', null, root.KDP_EXTRACTOR && root.KDP_EXTRACTOR.bookmarklet
            ? 'Arrastra el botón «Extraer reseñas KDP» de arriba a tu barra de marcadores (o usa extractor/instalar-marcador.html del repositorio).'
            : 'Abre extractor/instalar-marcador.html del repositorio y arrastra el botón a tu barra de marcadores.'),
          h('li', null, 'Abre en Amazon la página de reseñas de un libro (enlaces abajo), con tu sesión iniciada.'),
          h('li', null, 'Pulsa el marcador: hace clic en «Ver más reseñas» y en «Mostrar 10 opiniones más» hasta el final.'),
          h('li', null, 'Al terminar descarga resenas-ASIN.json. Repite con cada libro.'))),
      h('section', { class: 'card' }, h('h3', null, 'Pegándolo en la consola'),
        h('ol', { class: 'steps' },
          h('li', null, 'En la página de reseñas pulsa F12 y abre la pestaña Consola.'),
          h('li', null, 'Pega el contenido de extractor/extractor.js y pulsa Intro (Chrome pide escribir «allow pasting» la primera vez).'),
          h('li', null, 'Descarga el JSON cuando termine.'))),
      h('section', { class: 'card' }, h('h3', null, 'Automático con Playwright'),
        h('ol', { class: 'steps' },
          h('li', null, h('code', null, 'npm install'), ' y ', h('code', null, 'npx playwright install chromium')),
          h('li', null, h('code', null, 'npm run scrape'), ': abre un navegador, inicias sesión una vez y recorre los 8 libros.'),
          h('li', null, 'Guarda los archivos en data/raw/; después ', h('code', null, 'npm run build'), '.'))))));

    // zona de carga
    var log = h('div', { class: 'log', 'aria-live': 'polite' });
    function logLine(cls, text) {
      if (Date.now() - importLog.at > 10 * 60 * 1000) importLog.lines = [];
      importLog.at = Date.now();
      importLog.lines.push({ cls: cls, text: text });
      (importLog.el || log).appendChild(h('p', { class: cls }, text));
    }
    importLog.el = log;
    if (Date.now() - importLog.at < 10 * 60 * 1000) importLog.lines.forEach(function (l) { log.appendChild(h('p', { class: l.cls }, l.text)); });
    var input = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', multiple: true, class: 'visually-hidden' });
    var drop = h('div', { class: 'drop' },
      h('strong', null, 'Arrastra aquí los archivos resenas-*.json'),
      h('span', { class: 'small ink-2' }, 'o'),
      h('label', { class: 'btn primary', for: 'import-file' }, 'Elegir archivos'),
      input,
      h('span', { class: 'small muted' }, 'También puedes pegar el JSON copiado con «Copiar JSON» (Ctrl+V en esta página).'));
    function handleTexts(items) {
      var imports = [];
      items.forEach(function (it) {
        try {
          var parsed = A.parseImport(JSON.parse(it.text));
          parsed.forEach(function (p) { imports.push(p); });
          logLine('ok', '✓ ' + it.name + ': ' + parsed.map(function (p) { return p.asin + ' (' + p.reviews.length + ' reseñas)'; }).join(', '));
        } catch (e) {
          logLine('err', '✕ ' + it.name + ': ' + (e && e.message ? e.message : 'no es un JSON válido') + '. Usa el archivo que descarga el extractor.');
        }
      });
      if (!imports.length) return;
      logLine('', 'Guardando…');
      S.save(imports).then(function (res) {
        logLine('ok', 'Guardado. ' + res.map(function (r) { var b = ctx.byAsin[r.asin]; return (b ? shortTitle(b) : r.asin) + ': ' + r.total + ' reseñas (' + r.added + ' nuevas)'; }).join(' · '));
        U.toast('Reseñas importadas');
      }, function (err) {
        var msg = err && err.code === 'invalid_argument' ? 'No tienes permiso para guardar datos en este panel.' : 'No se pudo guardar (' + ((err && (err.message || err.code)) || 'error') + ').';
        logLine('err', msg);
      });
    }
    function readFiles(files) {
      var arr = Array.prototype.slice.call(files || []);
      Promise.all(arr.map(function (file) {
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve({ name: file.name, text: String(fr.result) }); };
          fr.onerror = function () { resolve({ name: file.name, text: '' }); };
          fr.readAsText(file);
        });
      })).then(handleTexts);
    }
    input.addEventListener('change', function () { readFiles(input.files); input.value = ''; });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); readFiles(e.dataTransfer.files); });
    var onPaste = function (e) {
      var txt = e.clipboardData && e.clipboardData.getData('text');
      if (txt && /"reviews"\s*:/.test(txt)) { e.preventDefault(); handleTexts([{ name: 'texto pegado', text: txt }]); }
    };
    document.addEventListener('paste', onPaste);
    app.onLeave(function () { document.removeEventListener('paste', onPaste); });
    main.appendChild(U.section('2. Súbelos al panel', null, [drop, log]));

    // estado por libro
    main.appendChild(U.section('3. Estado por libro', null, h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Libro'), h('th', null, 'Reseñas en Amazon'), h('th', { class: 'n' }, 'Importadas'), h('th', null, 'Fecha'), h('th', null, '¿Completo?'), h('th', null, ''))),
      h('tbody', null, ctx.books.map(function (b) {
        var imp = (S.imports || []).filter(function (x) { return x.asin === b.asin; })[0];
        var repoCount = (ctx.DS.reviews[b.asin] || []).length;
        var cell = h('td');
        if (imp) {
          var del = h('button', { class: 'btn danger', type: 'button' }, 'Borrar');
          del.addEventListener('click', function () {
            cell.textContent = '';
            var yes = h('button', { class: 'btn danger', type: 'button' }, 'Sí, borrar');
            var no = h('button', { class: 'btn', type: 'button' }, 'Cancelar');
            yes.addEventListener('click', function () { S.remove(b.asin).then(function () { U.toast('Reseñas borradas'); }, function () { U.toast('No se pudo borrar'); }); });
            no.addEventListener('click', function () { cell.textContent = ''; cell.appendChild(del); });
            cell.appendChild(h('span', { class: 'row' }, h('span', { class: 'small' }, '¿Borrar ' + (imp.count || imp.reviews.length) + ' reseñas?'), yes, no));
          });
          cell.appendChild(del);
        }
        return h('tr', null,
          h('td', null, h('a', { href: '#resenas-' + b.asin }, shortTitle(b))),
          h('td', null, U.extLink(reviewsUrl(ctx, b), 'Abrir ↗')),
          h('td', { class: 'n' }, U.fmtNum((imp ? (imp.count || imp.reviews.length) : 0) + repoCount)),
          h('td', null, imp ? U.fmtDate((imp.exportedAt || imp.importedAt || '').slice(0, 10)) : repoCount ? 'en el repositorio' : '—'),
          h('td', null, imp ? (imp.complete ? U.status('good', 'sí') : U.status('warn', 'parcial')) : '—'),
          cell);
      }))))));
    main.appendChild(h('p', { class: 'foot-note' }, 'Amazon suele limitar cada listado a unas 100 reseñas; el extractor recorre también los filtros por estrellas para llegar a más. Usa el extractor con calma y solo para tu investigación.'));
  };

  // ------------------------------------------------------------ METODOLOGÍA

  V.method = function (ctx, main) {
    var w = A.weights;
    main.appendChild(U.pageHead('Datos', 'Metodología', 'De dónde salen los datos, cómo se calcula la puntuación y qué límites tiene.'));
    main.appendChild(U.section('Fuentes', null, h('ul', { class: 'evidence', style: { fontSize: 'var(--step-0)' } },
      h('li', null, 'Datos de los 8 libros: búsqueda web del ' + U.fmtDate(ctx.DS.consultado) + ' (Amazon no era accesible desde el entorno de trabajo). Se marcan con ≈ y se sustituyen al importar los datos exactos de Amazon.'),
      h('li', null, 'Señales públicas: ' + (ctx.DS.signals || []).length + ' citas y paráfrasis de lectores y crítica (Amazon de otros países, Goodreads, Kirkus, Publishers Weekly, blogs), con su fuente y su fiabilidad.'),
      h('li', null, 'Contexto 2026: noticias fechadas y con fuente sobre el centenario, las obras, la beatificación, el turismo y las novedades editoriales.'),
      h('li', null, 'Reseñas: las que importes con el extractor (Amazon.com, con tu sesión).'))));
    main.appendChild(U.section('Puntuación del nicho (0-100)', 'Media ponderada de seis factores. Si falta un factor, se reparte su peso entre los demás y baja la «cobertura».', h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Factor'), h('th', { class: 'n' }, 'Peso'), h('th', null, 'Cómo se calcula'))),
      h('tbody', null,
        h('tr', null, h('td', null, 'Demanda'), h('td', { class: 'n' }, w.demanda * 100 + ' %'), h('td', null, 'Escala logarítmica de las valoraciones sumadas (30 → 0; 5.000 → 100). Con reseñas fechadas, pesa también cuántas son de los últimos 2 años.')),
        h('tr', null, h('td', null, 'Competencia'), h('td', { class: 'n' }, w.competencia * 100 + ' %'), h('td', null, '100 − fuerza de los líderes: valoraciones del libro líder (45 %), peso de editoriales grandes o especializadas (35 %) y nota media (20 %).')),
        h('tr', null, h('td', null, 'Hueco por cubrir'), h('td', { class: 'n' }, w.hueco * 100 + ' %'), h('td', null, '% de reseñas de 1-3★ (30 % o más = máximo) y % de reseñas positivas con alguna pega o deseo. Necesita las reseñas o los histogramas.')),
        h('tr', null, h('td', null, 'Actualidad'), h('td', { class: 'n' }, w.actualidad * 100 + ' %'), h('td', null, 'Proporción de libros con 5 años o más (75 %) y de libros publicados en el último año (25 %, resta).')),
        h('tr', null, h('td', null, 'Margen de precio'), h('td', { class: 'n' }, w.precio * 100 + ' %'), h('td', null, 'Precio mediano en papel entre 10 US$ (0) y 35 US$ (100).')),
        h('tr', null, h('td', null, 'Espacio para autoedición'), h('td', { class: 'n' }, w.indie * 100 + ' %'), h('td', null, '80 si algún autoeditado tiene 20 o más valoraciones; 45 si los hay sin tracción; 30 si no hay ninguno.'))))),
      { aside: null }));
    main.appendChild(U.section('Veredicto', null, h('ul', { class: 'evidence', style: { fontSize: 'var(--step-0)' } },
      h('li', null, '65 o más: buen nicho, merece la pena entrar.'),
      h('li', null, '50-64: nicho viable con un enfoque diferenciado.'),
      h('li', null, '35-49: nicho difícil, solo con un ángulo muy concreto.'),
      h('li', null, 'Menos de 35: poco recomendable.'))));
    main.appendChild(U.section('Temas, elogios y quejas', null, h('div', { class: 'prose' },
      h('p', null, 'Cada reseña se divide en frases y cada frase en «antes» y «después» de un conector de contraste («pero», «aunque», «however»…). Cada trozo se clasifica en ' + A.themes.length + ' temas con un diccionario en español e inglés (assets/js/lexicon.js) y como elogio, queja o deseo:'),
      h('ul', { class: 'evidence' },
        h('li', null, 'Reseñas de 1-2★: todo lo que mencionan cuenta como queja.'),
        h('li', null, 'Reseñas de 3★: queja si hay una palabra negativa o sigue a un «pero».'),
        h('li', null, 'Reseñas de 4-5★: elogio, salvo que haya una palabra negativa («demasiado pequeño», «sin fotos»…) o un deseo («me hubiera gustado», «le falta»…).')),
      h('p', null, 'Las palabras distintivas usan log-odds con prior informativo (Monroe y otros, 2008) entre reseñas de 1-3★ y de 4-5★.'))));
    main.appendChild(U.section('Límites', null, h('ul', { class: 'evidence', style: { fontSize: 'var(--step-0)' } },
      h('li', null, 'Las valoraciones son una pista de ventas, no ventas reales. El ranking de ventas (BSR) es mejor indicador y se captura con el extractor.'),
      h('li', null, 'Amazon limita cuántas reseñas se pueden listar; con los filtros por estrellas se llega a la mayoría en libros de este tamaño.'),
      h('li', null, 'El clasificador de temas es un diccionario: acierta en lo frecuente y falla con la ironía. Revisa siempre los ejemplos.'),
      h('li', null, 'Las señales públicas se encontraron con un buscador y no se pudieron abrir en la página original.'))));
  };

  // ------------------------------------------------------------- PROPUESTAS

  V.proposals = function (ctx, main) {
    var n = ctx.INS.name, pr = ctx.INS.proposals;
    main.appendChild(U.pageHead('Datos', 'Propuestas', 'El nombre del panel y lo que se puede añadir.'));
    if (n) {
      main.appendChild(U.section('Nombre', null, h('div', { class: 'grid grid-2' },
        h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Elegido'), h('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'var(--step-3)' } }, n.chosen),
          h('p', { class: 'ink-2' }, n.tagline), h('p', null, n.why)),
        h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Alternativas'), h('div', { class: 'stack' }, n.alternatives.map(function (a) {
          return h('div', null, h('strong', null, a.name), h('p', { class: 'small ink-2' }, a.why));
        }))))));
    }
    if (pr) {
      var block = function (title, items) {
        return h('section', { class: 'card' }, h('h3', null, title), h('div', { class: 'stack-lg' }, items.map(function (i) {
          var st = i.status === 'incluido' ? 'good' : i.status === 'propuesta' ? 'none' : 'warn';
          return h('div', { class: 'stack', style: { gap: '4px' } },
            h('span', null, h('span', { class: 'chip' }, U.status(st, i.status))),
            h('span', null, i.text, i.url ? [' ', U.extLink(i.url, i.linkText || 'enlace')] : null));
        })));
      };
      main.appendChild(h('div', { class: 'grid grid-3' }, block('Más datos para la portada', pr.homeData), block('Más enlaces', pr.links), block('Más herramientas', pr.tools)));
    }
  };

  // ------------------------------------------- PUNTOS FUERTES Y DÉBILES (ventana)

  V.strengthsWindow = function (ctx, body) {
    var ins = ctx.INS;
    body.appendChild(h('div', { class: 'stack' },
      h('p', { class: 'eyebrow' }, 'Todos los libros'),
      h('h1', null, 'Puntos fuertes y débiles del nicho'),
      h('p', { class: 'lead ink-2', style: { maxWidth: '75ch' } }, '«Lo que gusta» reúne lo que los lectores elogian de estos libros: no lo copies, pero tu libro tiene que estar a su altura. «Quejas y críticas» reúne lo que critican o echan en falta: es tu oportunidad.')));
    body.appendChild(ctx.hasReviews ? h('div', { class: 'callout' }, h('span', null, 'Los números en verde salen de las ' + U.fmtNum(ctx.res.reviewCount) + ' reseñas importadas.'))
      : h('div', { class: 'callout warn' }, h('span', null, 'Aún sin reseñas importadas: se muestran las conclusiones preliminares y las señales públicas. '), h('a', { href: '#importar' }, 'Importar reseñas')));

    function counts(themeId, kind) {
      if (!ctx.hasReviews) return null;
      var t = themeStat(ctx, themeId);
      if (!t) return null;
      var v = kind === 'praise' ? t.praise : t.pain;
      return h('p', { class: 'live' }, U.plural(v, 'reseña', 'reseñas') + (kind === 'praise' ? ' lo elogian' : ' se quejan o lo echan en falta'));
    }
    function examples(themeId, kind) {
      if (!ctx.hasReviews) return null;
      var t = themeStat(ctx, themeId);
      if (!t) return null;
      var ex = kind === 'praise' ? t.examples.praise : t.examples.complaint.concat(t.examples.wish);
      return ex.slice(0, 2).map(function (e) {
        var b = ctx.byAsin[e.asin];
        return h('blockquote', { class: 'quote ' + (kind === 'praise' ? 'pos' : 'neg'), style: { margin: 0 } }, h('p', null, '«' + e.text + '»'),
          h('p', { class: 'src' }, U.stars(e.rating), b ? h('a', { href: '#resenas-' + b.asin }, shortTitle(b)) : null));
      });
    }
    function signalQuotes(themeId, type) {
      if (ctx.hasReviews) return null;
      return (ctx.DS.signals || []).filter(function (s) { return s.type === type && (s.themes || []).indexOf(themeId) >= 0; })
        .slice(0, 2).map(function (s) { return quote(ctx, s, { showBook: true }); });
    }
    function bookLinks(list) {
      if (!list || !list.length) return null;
      return h('p', { class: 'small ink-2' }, 'Libros: ', list.map(function (a, i) { var b = ctx.byAsin[a]; return [i ? ' · ' : '', h('a', { href: '#libro-' + a }, b ? shortTitle(b) : a)]; }));
    }

    var strengths = ins.strengths || [], weaknesses = ins.weaknesses || [];
    // temas detectados en las reseñas que no estén ya en la lista curada
    var extraPraise = [], extraPain = [];
    if (ctx.hasReviews) {
      var have = function (list) { var o = {}; list.forEach(function (x) { o[x.theme] = true; }); return o; };
      var hs = have(strengths), hw = have(weaknesses);
      ctx.res.themes.forEach(function (t) {
        if (t.praise >= 3 && !hs[t.id]) extraPraise.push(t);
        if (t.pain >= 3 && !hw[t.id]) extraPain.push(t);
      });
    }
    var left = h('section', { class: 'stack' }, h('div', { class: 'col-head' }, h('h2', null, 'Lo que gusta'), h('p', { class: 'small ink-2' }, 'No lo copies: es el listón mínimo que tu libro debe igualar.')));
    var right = h('section', { class: 'stack' }, h('div', { class: 'col-head neg' }, h('h2', null, 'Quejas y críticas'), h('p', { class: 'small ink-2' }, 'Tu oportunidad: resuélvelas en tu libro.')));
    if (!strengths.length && !extraPraise.length) left.appendChild(h('p', { class: 'muted' }, 'No se ha detectado nada que los lectores elogien de forma repetida.'));
    if (!weaknesses.length && !extraPain.length) right.appendChild(h('p', { class: 'muted' }, 'No se han detectado quejas repetidas.'));
    strengths.forEach(function (s) {
      left.appendChild(h('article', { class: 'sw-item' }, h('h3', null, s.title), h('p', null, s.text), counts(s.theme, 'praise'), examples(s.theme, 'praise'), signalQuotes(s.theme, 'positivo'), bookLinks(s.books)));
    });
    extraPraise.forEach(function (t) {
      left.appendChild(h('article', { class: 'sw-item' }, h('h3', null, t.label), h('p', { class: 'small ink-2' }, 'Detectado en las reseñas.'), counts(t.id, 'praise'), examples(t.id, 'praise')));
    });
    weaknesses.forEach(function (s) {
      right.appendChild(h('article', { class: 'sw-item' }, h('h3', null, s.title), h('p', null, s.text), s.opportunity ? h('p', { class: 'opportunity' }, 'Oportunidad: ' + s.opportunity) : null,
        counts(s.theme, 'pain'), examples(s.theme, 'pain'), signalQuotes(s.theme, 'negativo'), bookLinks(s.books)));
    });
    extraPain.forEach(function (t) {
      right.appendChild(h('article', { class: 'sw-item' }, h('h3', null, t.label), h('p', { class: 'small ink-2' }, 'Detectado en las reseñas.'), counts(t.id, 'pain'), examples(t.id, 'pain')));
    });
    body.appendChild(h('div', { class: 'two-cols' }, left, right));
    var g = h('div');
    body.appendChild(g);
    chartThemes(ctx, g, 14);
  };

  V._helpers = { shortTitle: shortTitle };
  root.KDPViews = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
