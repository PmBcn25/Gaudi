/* Arranque del panel: datos, menú, enrutado por #ancla y recálculo al importar. */
(function (root) {
  'use strict';
  var U = root.KDPUI, A = root.KDPAnalysis, S = root.KDPStore, V = root.KDPViews;
  var h = U.h;
  var DS = root.KDP_DATASET || { books: [], reviews: {}, signals: [], competitors: [], market: null, links: null };
  DS.reviews = DS.reviews || {};
  var INS = root.KDP_INSIGHTS || {};
  var NAME = (INS.name && INS.name.chosen) || 'Catenaria';

  var ROUTES = [
    { id: 'inicio', group: 'Mercado', label: 'Inicio', desc: 'Veredicto, gráficas y accesos', view: V.home },
    { id: 'libros', group: 'Mercado', label: 'Libros', desc: 'Portada, título, reseñas, estrellas y precio de cada libro', view: V.books },
    { id: 'resenas', group: 'Mercado', label: 'Reseñas', desc: 'Las buenas y las malas de cada libro', view: V.reviewsIndex },
    { id: 'comparativa', group: 'Mercado', label: 'Comparativa', desc: 'Todos los libros en una tabla', view: V.compare },
    { id: 'temas', group: 'Mercado', label: 'Temas', desc: 'Qué se elogia y de qué se quejan', view: V.themes },
    { id: 'competencia', group: 'Mercado', label: 'Competencia ampliada', desc: 'Otros libros del nicho', view: V.competitors },
    { id: 'contexto', group: 'Mercado', label: 'Contexto 2026', desc: 'Centenario, obras, turismo y novedades', view: V.context },
    { id: 'nichos', group: 'Estrategia', label: 'Nichos', desc: 'Subnichos y cuáles conviene evitar', view: V.niches },
    { id: 'avatares', group: 'Estrategia', label: 'Avatares', desc: 'Quién compra y qué le frustra', view: V.avatars },
    { id: 'enfoques', group: 'Estrategia', label: 'Enfoques', desc: 'Cinco formas de plantear tu libro', view: V.approaches },
    { id: 'entrar', group: 'Estrategia', label: 'Cómo entrar', desc: 'El enfoque recomendado', view: V.enter },
    { id: 'no-entrar', group: 'Estrategia', label: 'Cómo no entrar', desc: 'Lo que no debes poner nunca', view: V.avoid },
    { id: 'posicionamiento', group: 'Estrategia', label: 'Título y posicionamiento', desc: 'Títulos, palabras clave, precio y regalías', view: V.positioning },
    { id: 'plan', group: 'Estrategia', label: 'Plan de acción', desc: 'Pasos para validar, escribir y lanzar', view: V.plan },
    { id: 'importar', group: 'Datos', label: 'Importar reseñas', desc: 'Extraer las reseñas de Amazon y subirlas', view: V.importer },
    { id: 'metodologia', group: 'Datos', label: 'Metodología', desc: 'Fuentes, cálculos y límites', view: V.method },
    { id: 'propuestas', group: 'Datos', label: 'Propuestas', desc: 'Nombre del panel y próximas mejoras', view: V.proposals },
    { id: 'fortalezas', group: null, label: 'Puntos fuertes y débiles', desc: 'Lo que gusta y lo que se critica de todos los libros', window: true }
  ];
  var BY_ID = {};
  ROUTES.forEach(function (r) { BY_ID[r.id] = r; });

  var ctx = null;
  var leaveHooks = [];
  var lastPage = 'inicio';
  var navLinks = {};
  var app, main, overlay = null;

  function buildCtx() {
    var merged = A.mergeData(DS.books || [], DS.reviews || {}, S.imports || []);
    var res = A.analyzeAll(merged.books, merged.reviews, { now: new Date().toISOString() });
    var byAsin = {};
    merged.books.forEach(function (b) { byAsin[b.asin] = b; });
    ctx = { DS: DS, INS: INS, books: merged.books, reviews: merged.reviews, res: res, byAsin: byAsin,
      hasReviews: res.reviewCount > 0, routes: ROUTES, backend: S.backend };
  }

  function parseRoute(raw) {
    raw = String(raw || '').replace(/^#\/?/, '');
    try { raw = decodeURIComponent(raw); } catch (e) { /* ancla rara */ }
    if (!raw) return { id: 'inicio' };
    var m = raw.match(/^(libro|resenas)-([A-Z0-9]{10})$/i);
    if (m) return { id: m[1].toLowerCase(), asin: m[2].toUpperCase() };
    return BY_ID[raw] ? { id: raw } : { id: 'inicio', unknown: raw };
  }
  function parseHash() { return parseRoute(root.location.hash); }

  var appApi = { onLeave: function (fn) { leaveHooks.push(fn); } };

  function titleFor(route) {
    if (route.id === 'libro' || (route.id === 'resenas' && route.asin)) {
      var b = ctx.byAsin[route.asin];
      return (b ? (b.shortTitle || b.title) : route.asin) + (route.id === 'resenas' ? ' · reseñas' : '');
    }
    return (BY_ID[route.id] || BY_ID.inicio).label;
  }

  function renderPage(route) {
    leaveHooks.forEach(function (fn) { try { fn(); } catch (e) { /* */ } });
    leaveHooks = [];
    root.KDPCharts.hideTip();
    main.textContent = '';
    var page = h('div', { class: 'page' });
    main.appendChild(page);
    try {
      if (route.id === 'libro') V.book(ctx, page, route.asin);
      else if (route.id === 'resenas' && route.asin) V.bookReviews(ctx, page, route.asin);
      else (BY_ID[route.id].view || V.home)(ctx, page, appApi);
    } catch (err) {
      console.error(err);
      page.appendChild(h('div', { class: 'callout crit' }, h('strong', null, 'Esta sección no se ha podido mostrar.'), h('span', null, String(err && err.message || err))));
    }
    var navId = route.id === 'libro' ? 'libros' : route.id;
    Object.keys(navLinks).forEach(function (k) {
      if (k === navId) navLinks[k].setAttribute('aria-current', 'page'); else navLinks[k].removeAttribute('aria-current');
    });
  }

  function closeWindow() {
    if (overlay) { overlay.remove(); overlay = null; document.body.style.overflow = ''; }
  }

  function openWindow() {
    closeWindow();
    var close = h('button', { class: 'btn', type: 'button' }, 'Cerrar');
    var newTab = h('a', { class: 'btn', href: root.location.pathname + '#fortalezas', target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña');
    var body = h('div', { class: 'window-body' });
    var win = h('div', { class: 'window', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Puntos fuertes y débiles' },
      h('div', { class: 'window-bar' }, h('span', { class: 'title' }, 'Puntos fuertes y débiles'), h('span', { class: 'spacer' }), root.KDP_ARTIFACT ? null : newTab, close),
      body);
    overlay = h('div', { class: 'window-backdrop' }, win);
    close.addEventListener('click', function () { root.location.hash = lastPage; });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) root.location.hash = lastPage; });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    try { V.strengthsWindow(ctx, body); } catch (err) { console.error(err); body.appendChild(h('p', null, String(err))); }
    close.focus();
  }

  function route(opts) {
    opts = opts || {};
    var r = parseHash();
    app.classList.remove('nav-open');
    if (r.id === 'fortalezas') {
      // La ventana se abre encima de la página en la que estabas (o de Inicio si entras directo).
      if (!main.childNodes.length) renderPage(parseRoute(lastPage));
      openWindow();
      document.title = 'Puntos fuertes y débiles · ' + NAME;
      return;
    }
    var wasWindow = !!overlay;
    closeWindow();
    var hash = root.location.hash.replace(/^#/, '') || 'inicio';
    if (wasWindow && hash === lastPage && main.childNodes.length) { document.title = titleFor(r) + ' · ' + NAME; return; }
    lastPage = hash;
    renderPage(r);
    document.title = titleFor(r) + ' · ' + NAME;
    if (!opts.keepScroll) root.scrollTo(0, 0);
  }

  function buildLayout() {
    var groups = {};
    ROUTES.forEach(function (r) { if (r.group) (groups[r.group] = groups[r.group] || []).push(r); });
    var nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' });
    Object.keys(groups).forEach(function (g) {
      nav.appendChild(h('div', { class: 'nav-group' }, h('p', { class: 'eyebrow' }, g), groups[g].map(function (r) {
        var a = h('a', { href: '#' + r.id }, r.label);
        navLinks[r.id] = a;
        return a;
      })));
    });
    var win = BY_ID.fortalezas;
    var winLink = h('a', { class: 'nav-window', href: '#fortalezas' }, win.label);
    navLinks.fortalezas = winLink;
    nav.appendChild(h('div', { class: 'nav-group' }, h('p', { class: 'eyebrow' }, 'Al final'), winLink));

    var themeBtn = h('button', { class: 'theme-toggle', type: 'button' });
    var themes = ['sistema', 'claro', 'oscuro'];
    var cur = U.loadPref('theme', 'sistema');
    function applyTheme() {
      var rootEl = document.documentElement;
      if (cur === 'claro') rootEl.setAttribute('data-theme', 'light');
      else if (cur === 'oscuro') rootEl.setAttribute('data-theme', 'dark');
      else if (!root.KDP_ARTIFACT) rootEl.removeAttribute('data-theme');
      themeBtn.textContent = 'Tema: ' + cur;
    }
    themeBtn.addEventListener('click', function () { cur = themes[(themes.indexOf(cur) + 1) % themes.length]; U.savePref('theme', cur); applyTheme(); });
    // En claude.ai el tema lo pone el visor; en local se puede forzar claro u oscuro.
    if (!root.KDP_ARTIFACT) applyTheme();

    var brand = h('a', { class: 'brand', href: '#inicio' }, U.catenary('brand-mark', 200, 26), h('span', { class: 'brand-name' }, NAME),
      h('span', { class: 'brand-tag' }, ((INS.name && INS.name.tagline) || 'Radar de nichos KDP') + ' · Gaudí'));
    var sidebar = h('aside', { class: 'sidebar', id: 'sidebar' }, brand, nav,
      h('div', { class: 'sidebar-foot' }, root.KDP_ARTIFACT ? null : themeBtn, h('p', { class: 'small muted' }, 'Datos del ' + U.fmtDate(DS.consultado || '') + (DS.generatedAt ? ' · generado ' + U.fmtDate(DS.generatedAt.slice(0, 10)) : ''))));
    var menuBtn = h('button', { class: 'menu-btn', type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'false' }, 'Menú');
    menuBtn.addEventListener('click', function () {
      var open = app.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    var topbar = h('header', { class: 'topbar' }, menuBtn, h('a', { class: 'brand', href: '#inicio', style: { display: 'flex', alignItems: 'baseline', gap: '8px' } }, h('span', { class: 'brand-name' }, NAME)));
    var scrim = h('div', { class: 'scrim', hidden: true });
    main = h('main', { class: 'main', id: 'contenido', tabindex: '-1' });
    app = h('div', { class: 'app' }, sidebar, scrim, h('div', { style: { minWidth: '0' } }, topbar, main));
    scrim.addEventListener('click', function () { app.classList.remove('nav-open'); menuBtn.setAttribute('aria-expanded', 'false'); });
    new MutationObserver(function () { scrim.hidden = !app.classList.contains('nav-open'); }).observe(app, { attributes: true, attributeFilter: ['class'] });
    var mount = document.getElementById('app') || document.body;
    mount.textContent = '';
    mount.appendChild(app);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (overlay) root.location.hash = lastPage;
        else if (app.classList.contains('nav-open')) app.classList.remove('nav-open');
      }
    });
  }

  function updateCounts() {
    var n = ctx.res.reviewCount;
    var a = navLinks.resenas;
    if (!a) return;
    var c = a.querySelector('.count');
    if (!c) { c = h('span', { class: 'count' }); a.appendChild(c); }
    c.textContent = n ? U.fmtNum(n) : '';
  }

  function boot() {
    buildCtx();
    buildLayout();
    updateCounts();
    route();
    root.addEventListener('hashchange', function () { route(); });
    S.onChange(function () {
      buildCtx();
      updateCounts();
      var r = parseHash();
      if (r.id === 'fortalezas') { renderPage(parseRoute(lastPage)); openWindow(); } else { renderPage(r); }
    });
    S.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
