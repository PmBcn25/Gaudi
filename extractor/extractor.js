/*!
 * Extractor de reseñas KDP · v1.0.0
 *
 * Script autónomo (sin dependencias) para páginas de Amazon. Amplía la lista de reseñas
 * («Ver más reseñas», «Mostrar 10 opiniones más» o la paginación clásica), extrae todas las
 * reseñas y los datos del libro y descarga un JSON con el esquema «kdp-reviews/1»
 * (ver docs/formato-datos.md).
 *
 * Se usa como marcador (bookmarklet), pegado en la consola del navegador o inyectado por
 * extractor/scrape.mjs (Playwright). Solo hace peticiones a páginas del MISMO dominio de Amazon
 * en el que se ejecuta y nunca envía datos a ningún otro sitio.
 *
 * Code notes: ES2019, a single IIFE, no build step. The only global it defines is
 * window.KDPExtractor. Set window.KDPX_NO_AUTORUN = true before loading it to skip the
 * automatic run (Playwright/tests). Optional window.KDPX_OPTIONS = {...} tweaks the auto-run.
 */
;(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var VERSION = '1.0.0';
  var SCHEMA = 'kdp-reviews/1';
  var PANEL_ID = 'kdpx-panel';
  var META_PREFIX = 'kdpx:meta:';
  var PREF_STARS = 'kdpx-estrellas';
  var STARS = ['five_star', 'four_star', 'three_star', 'two_star', 'one_star'];
  var STAR_NAMES = {
    five_star: '5 estrellas', four_star: '4 estrellas', three_star: '3 estrellas',
    two_star: '2 estrellas', one_star: '1 estrella'
  };

  // A second click on the bookmark while a run is in progress just shows the panel again.
  var previous = window.KDPExtractor;
  if (previous && previous._state && previous._state.running) {
    try { previous.showPanel(); } catch (e) { /* ignore */ }
    return;
  }

  /* ------------------------------------------------------------------ text utils */

  var MARKS_RE = /[\u200b\u200e\u200f\u202a-\u202e\u2060\ufeff]/g; // zero-width + bidi marks
  var FLAG_RE = /\ud83c[\udde6-\uddff]/g; // regional-indicator (flag) halves
  var ASTRAL_RE = /[\ud800-\udfff]/g;
  var docUrls = new WeakMap(); // DOMParser documents -> the URL they were fetched from

  function str(v) { return v == null ? '' : String(v); }
  function clean(s) { return str(s).replace(MARKS_RE, '').replace(/\s+/g, ' ').trim(); }
  function fold(s) {
    var t = clean(s);
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t.toLowerCase();
  }
  function textOf(el) { return el ? clean(el.textContent) : ''; }
  function uniq(list) {
    var out = [];
    list.forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms || 0)); }); }
  function rand(a, b) { return Math.round(a + Math.random() * Math.max(0, b - a)); }

  /* ------------------------------------------------------------------ DOM utils */

  function q(root, sel) {
    if (!root || !root.querySelector) return null;
    try { return root.querySelector(sel); } catch (e) { return null; }
  }
  function qa(root, sel) {
    if (!root || !root.querySelectorAll) return [];
    try { return Array.prototype.slice.call(root.querySelectorAll(sel)); } catch (e) { return []; }
  }
  // querySelector('a, b') returns the first match in DOCUMENT order; these helpers try the
  // selectors in PRIORITY order instead.
  function pick(root, sels) {
    for (var i = 0; i < sels.length; i++) {
      var el = q(root, sels[i]);
      if (el) return el;
    }
    return null;
  }
  function pickText(root, sels) {
    for (var i = 0; i < sels.length; i++) {
      var t = textOf(q(root, sels[i]));
      if (t) return t;
    }
    return '';
  }
  function matches(el, sel) {
    try { return !!(el && el.matches && el.matches(sel)); } catch (e) { return false; }
  }
  function closest(el, sel) {
    try { return el && el.closest ? el.closest(sel) : null; } catch (e) { return null; }
  }
  function attr(el, name) { return el && el.getAttribute ? el.getAttribute(name) : null; }
  function classOf(el) { return str(attr(el, 'class')); }
  function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
  function docOf(node) {
    if (!node) return document;
    return node.nodeType === 9 ? node : (node.ownerDocument || document);
  }
  function docUrl(node) {
    var doc = docOf(node);
    if (docUrls.has(doc)) return docUrls.get(doc);
    try { if (doc.location && doc.location.href) return doc.location.href; } catch (e) { /* cross-origin */ }
    return location.href;
  }
  function absUrl(u, base) {
    if (!u) return null;
    try { return new URL(u, base || location.href).href; } catch (e) { return u; }
  }
  function stripHash(u) { var s = str(u), i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); }
  function sameOrigin(u) {
    try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; }
  }
  // Keep only elements that are not inside another element of the same list.
  function outermost(list) {
    return list.filter(function (el) {
      return !list.some(function (o) { return o !== el && o.contains(el); });
    });
  }

  var BLOCK_TAGS = {
    P: 1, DIV: 1, LI: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1,
    SECTION: 1, ARTICLE: 1, TR: 1, TABLE: 1, PRE: 1, HR: 1, DL: 1, DT: 1, DD: 1
  };
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, VIDEO: 1,
    AUDIO: 1, SVG: 1, IFRAME: 1, CANVAS: 1
  };

  // Text of an element keeping line breaks (<br>, block elements). Separator icons become " | ".
  function richText(el, skipSel) {
    if (!el) return '';
    var parts = [];
    (function walk(node) {
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 3) { parts.push(k.nodeValue); continue; }
        if (k.nodeType !== 1) continue;
        var tag = str(k.tagName).toUpperCase();
        if (SKIP_TAGS[tag]) continue;
        if (skipSel && matches(k, skipSel)) continue;
        if (tag === 'BR') { parts.push('\n'); continue; }
        if (tag === 'I' && /a-icon-text-separator/.test(classOf(k))) { parts.push(' | '); continue; }
        var block = BLOCK_TAGS[tag];
        if (block) parts.push('\n');
        walk(k);
        if (block) parts.push('\n');
      }
    })(el);
    return parts.join('').split('\n').map(function (line) {
      return line.replace(MARKS_RE, '').replace(/[ \t\r\f\v\u00a0\u2000-\u200a\u202f\u205f\u3000]+/g, ' ').trim();
    }).filter(Boolean).join('\n');
  }

  /* ------------------------------------------------------------------ numbers, prices */

  // Integer with optional thousands separators: "1.234", "1,234", "1 234" -> 1234.
  function toInt(s) {
    var m = str(s).replace(MARKS_RE, '').match(/\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+(?!\d)|\d+/);
    return m ? parseInt(m[0].replace(/\D/g, ''), 10) : null;
  }
  function toDecimal(s) {
    var m = str(s).match(/\d+(?:[.,]\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0].replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  // "4,5 de 5 estrellas", "4.5 out of 5 stars" -> 4.5
  function toRating(s) {
    var n = toDecimal(s);
    return n != null && n > 0 && n <= 5 ? n : null;
  }
  // "US$1,234.56", "25,00 US$", "1.234,56 €", "$9.99" -> number
  function toAmount(s) {
    var t = str(s).replace(/[\u00a0\u202f]/g, ' ');
    var m = t.match(/(?:[A-Z]{0,3}\$|€|£|¥|₹|EUR|USD|GBP)\s?(\d[\d.,' ]*\d|\d)/) || t.match(/(\d[\d.,' ]*\d|\d)/);
    if (!m) return null;
    var raw = m[1].replace(/[' ]/g, '');
    var dot = raw.lastIndexOf('.'), comma = raw.lastIndexOf(',');
    var dec = -1;
    if (dot >= 0 && comma >= 0) {
      dec = Math.max(dot, comma);
    } else if (dot >= 0 || comma >= 0) {
      var p = Math.max(dot, comma);
      var sep = raw.charAt(p);
      var count = raw.split(sep).length - 1;
      if (count === 1 && raw.length - p - 1 !== 3) dec = p; // "25,00" / "25.5" but not "1,234"
    }
    var intPart = dec >= 0 ? raw.slice(0, dec) : raw;
    var frac = dec >= 0 ? raw.slice(dec + 1) : '';
    var n = parseFloat(intPart.replace(/[.,]/g, '') + (frac ? '.' + frac : ''));
    return isFinite(n) ? n : null;
  }
  function detectCurrency(s, host) {
    var t = str(s);
    if (/US\$|USD/.test(t)) return 'USD';
    if (/MX\$|MXN/.test(t)) return 'MXN';
    if (/C(?:A|DN)\$|CAD/.test(t)) return 'CAD';
    if (/AU?\$|AUD/.test(t)) return 'AUD';
    if (/R\$|BRL/.test(t)) return 'BRL';
    if (/€|EUR/.test(t)) return 'EUR';
    if (/£|GBP/.test(t)) return 'GBP';
    if (/[¥￥]|JPY/.test(t)) return 'JPY';
    if (/₹|INR/.test(t)) return 'INR';
    if (/\$/.test(t)) {
      var hname = str(host || location.host);
      if (/\.com\.mx$/.test(hname)) return 'MXN';
      if (/\.ca$/.test(hname)) return 'CAD';
      if (/\.com\.au$/.test(hname)) return 'AUD';
      if (/\.com\.br$/.test(hname)) return 'BRL';
      return 'USD';
    }
    return null;
  }
  function priceObj(textValue, host) {
    var t = clean(textValue);
    if (!t || !/\d/.test(t)) return null;
    return { text: t, amount: toAmount(t), currency: detectCurrency(t, host) };
  }

  /* ------------------------------------------------------------------ dates, countries */

  var MONTHS = {
    enero: 1, ene: 1, january: 1, jan: 1, janvier: 1, janv: 1, januar: 1, janner: 1, gennaio: 1, gen: 1, janeiro: 1, januari: 1,
    febrero: 2, feb: 2, february: 2, fevrier: 2, fevr: 2, fev: 2, februar: 2, febbraio: 2, fevereiro: 2, februari: 2,
    marzo: 3, mar: 3, march: 3, mars: 3, marz: 3, marco: 3, maart: 3, mrt: 3,
    abril: 4, abr: 4, april: 4, apr: 4, avril: 4, avr: 4, aprile: 4,
    mayo: 5, may: 5, mai: 5, maggio: 5, mag: 5, maio: 5, mei: 5,
    junio: 6, jun: 6, june: 6, juin: 6, juni: 6, giugno: 6, giu: 6, junho: 6,
    julio: 7, jul: 7, july: 7, juillet: 7, juil: 7, juli: 7, luglio: 7, lug: 7, julho: 7,
    agosto: 8, ago: 8, august: 8, aug: 8, aout: 8, augustus: 8,
    septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, september: 9, septembre: 9, settembre: 9, setembro: 9,
    octubre: 10, oct: 10, october: 10, octobre: 10, oktober: 10, okt: 10, ottobre: 10, ott: 10, outubro: 10, out: 10,
    noviembre: 11, nov: 11, november: 11, novembre: 11, novembro: 11,
    diciembre: 12, dic: 12, december: 12, dec: 12, decembre: 12, dezember: 12, dez: 12, dicembre: 12, dezembro: 12
  };

  function isoDate(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // Any Amazon date wording (ES/EN/FR/DE/IT/PT/NL) -> "YYYY-MM-DD".
  function parseDate(s) {
    var t = fold(str(s).replace(ASTRAL_RE, ' '));
    if (!t) return null;
    var m, mo, r;
    var dmy = /(\d{1,2})(?:er|re|o|º|°)?\.?\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+)?(\d{4})/g;
    while ((m = dmy.exec(t))) {
      mo = MONTHS[m[2]];
      if (mo && (r = isoDate(m[3], mo, m[1]))) return r;
    }
    var mdy = /([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/g;
    while ((m = mdy.exec(t))) {
      mo = MONTHS[m[1]];
      if (mo && (r = isoDate(m[3], mo, m[2]))) return r;
    }
    m = t.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    return m ? isoDate(m[1], m[2], m[3]) : null;
  }

  var COUNTRY_RES = [
    /(?:^|\s)(?:en|in)\s+(.+?)\s+(?:el|on)\s+\S/, // ES "Revisado en X el …", EN "Reviewed in X on …"
    /(?:^|\s)(?:en|au|aux)\s+(.+?)\s+le\s+\d/, // FR "Commenté en X le …"
    /(?:^|\s)(?:in|negli|nel|nella|nei)\s+(.+?)\s+il\s+\d/, // IT "Recensito in X il …"
    /(?:^|\s)aus\s+(.+?)\s+vom\s+\d/, // DE "Rezension aus X vom …"
    /(?:^|\s)in\s+(.+?)\s+(?:am|op)\s+\d/, // DE "Bewertet in X am …", NL "… in X op …"
    /(?:^|\s)(?:no|na|nos|nas|em)\s+(.+?)\s+em\s+\d/ // PT "Avaliado no X em …"
  ];
  function parseCountry(s) {
    var t = clean(str(s).replace(FLAG_RE, ' ').replace(ASTRAL_RE, ' '));
    for (var i = 0; i < COUNTRY_RES.length; i++) {
      var m = t.match(COUNTRY_RES[i]);
      if (m) {
        var c = clean(m[1]).replace(/^(?:the|los|las)\s+/i, '');
        if (c && c.length <= 60) return c;
      }
    }
    return null;
  }

  // "A 12 personas les resultó útil", "Una persona encontró esto útil", "1,234 people found this helpful"
  function parseHelpful(s) {
    var t = clean(s);
    if (!t) return 0;
    var n = toInt(t);
    if (n != null) return n;
    if (/(?:^|\s)(?:una|un|one|une|eine|uma|a)\s+(?:persona|person|personne|pessoa)\b/.test(fold(t))) return 1;
    return 0;
  }

  // Stable id for reviews without an Amazon id (FNV-1a + djb2, 64 bits in hex).
  function hashId(s) {
    var h1 = 0x811c9dc5, h2 = 5381;
    s = str(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    return 'h' + ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
  }

  function splitTitle(full) {
    var t = clean(full);
    if (!t) return { title: null, subtitle: null };
    var i = t.indexOf(': ');
    if (i > 0) {
      var a = clean(t.slice(0, i)), b = clean(t.slice(i + 2));
      if (a && b) return { title: a, subtitle: b };
    }
    return { title: t, subtitle: null };
  }

  /* ------------------------------------------------------------------ ASIN, page type, blocks */

  var ASIN_RE = /\/(?:dp|product-reviews|customer-reviews|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[\/?#&]|$)/i;
  function asinFromUrl(u) {
    var m = str(u).match(ASIN_RE);
    return m ? m[1].toUpperCase() : null;
  }
  function asinFromDoc(root, url) {
    var doc = docOf(root);
    var a = asinFromUrl(url || docUrl(doc));
    if (a) return a;
    var hrefs = [
      attr(q(doc, 'link[rel="canonical"]'), 'href'),
      attr(q(doc, '[data-hook="product-link"]'), 'href'),
      attr(q(doc, '#cm_cr-product_info a[href*="/dp/"]'), 'href')
    ];
    for (var i = 0; i < hrefs.length; i++) { a = asinFromUrl(hrefs[i]); if (a) return a; }
    var inp = q(doc, 'input#ASIN, input[name="ASIN"], input[name="asin"], input[name="ASIN.0"]');
    if (inp && /^[A-Z0-9]{10}$/i.test(str(inp.value))) return inp.value.toUpperCase();
    var da = attr(q(doc, '#averageCustomerReviews[data-asin], #cm_cr-product_info [data-asin], [data-hook="cr-product-image"][data-asin]'), 'data-asin');
    if (/^[A-Z0-9]{10}$/i.test(str(da))) return da.toUpperCase();
    return null;
  }

  var BLOCK_MSG = {
    login: 'Amazon te pide iniciar sesión. Inicia sesión con tu cuenta en esta misma pestaña, vuelve a la página de reseñas del libro y pulsa otra vez el marcador.',
    captcha: 'Amazon muestra una comprobación de seguridad (captcha). Resuélvela, espera a que cargue la página del libro y pulsa otra vez el marcador. Si se repite, espera unos minutos antes de seguir.'
  };
  // 'login' | 'captcha' | null
  function detectBlock(root, url) {
    var doc = docOf(root);
    var u = str(url || docUrl(doc));
    if (/\/ap\/(?:signin|cvf|mfa|challenge)|\/ax\/claim/i.test(u) ||
        q(doc, 'form[name="signIn"], #ap_login_form, #ap_email, #ap_password, #ap_email_login, input[name="claimspicker"]')) return 'login';
    if (/validateCaptcha/i.test(u) || q(doc, 'form[action*="validateCaptcha"], #captchacharacters')) return 'captcha';
    return null;
  }
  function isReviewsUrl(u) { return /\/(?:product-reviews|customer-reviews)\//i.test(str(u)); }
  // 'login' | 'captcha' | 'reviews' | 'product' | 'other'
  function pageType(root) {
    var doc = docOf(root);
    var block = detectBlock(doc);
    if (block) return block;
    var path = '';
    try { path = new URL(docUrl(doc)).pathname; } catch (e) { /* ignore */ }
    if (isReviewsUrl(path)) return 'reviews';
    if (q(doc, '#productTitle, #ebooksProductTitle, #dp-container') || /\/(?:dp|gp\/product)\//i.test(path)) return 'product';
    if (q(doc, REVIEW_SEL)) return 'reviews';
    return 'other';
  }

  /* ------------------------------------------------------------------ reviews */

  var REVIEW_SEL = '[data-hook="review"], [id^="customer_review-"], [id^="customer_review_foreign-"], div.review, li[data-hook="review"]';
  var INTL_RE = /otros paises|other countries|autres pays|anderen landern|altri paesi|outros paises|andere landen/;
  var SECTION_RANK = { main: 0, international: 1, 'product-page': 2 };
  var BODY_SKIP = 'script, style, noscript, template, .a-expander-header, .a-expander-prompt, [data-action="a-expander-toggle"], .video-block, [data-hook="video-block"], .cr-video-desktop, .aok-hidden, .a-hidden, .cr-translated-review-content';
  var JUNK_LINES = [
    'leer mas', 'leer menos', 'read more', 'read less', 'ver mas', 'ver menos', 'mostrar mas', 'mostrar menos',
    'see more', 'see less', 'informar', 'report', 'informar de un abuso', 'report abuse', 'traducir resena al espanol',
    'translate review to english', 'ver original', 'see original', 'el contenido multimedia no se pudo cargar',
    'no se ha podido cargar el contenido multimedia', 'the media could not be loaded', 'lire la suite', 'mehr lesen', 'leggi di piu'
  ];

  function countReviewNodes(root) { return qa(root, REVIEW_SEL).length; }

  // One element per review: drops containers holding 2+ reviews and inner duplicates.
  function reviewNodes(root) {
    var all = qa(root, REVIEW_SEL);
    if (!all.length) return all;
    var set = new Set(all);
    var parent = new Map(), kids = new Map();
    all.forEach(function (el) {
      var p = el.parentElement, depth = 0;
      while (p && depth < 40) {
        if (set.has(p)) { parent.set(el, p); kids.set(p, (kids.get(p) || 0) + 1); break; }
        p = p.parentElement; depth++;
      }
    });
    return all.filter(function (el) {
      if ((kids.get(el) || 0) >= 2) return false; // a list wrapper, not a review
      var p = parent.get(el);
      return !p || (kids.get(p) || 0) >= 2; // keep the outermost element of each review
    });
  }

  function hasReviewAfter(container, heading) {
    var nodes = qa(container, REVIEW_SEL);
    for (var i = 0; i < nodes.length; i++) {
      if (heading.compareDocumentPosition(nodes[i]) & 4) return true;
    }
    return false;
  }
  // Blocks introduced by a heading such as "Reseñas principales de otros países".
  function sectionContext(root) {
    var zones = [];
    qa(root, 'h1, h2, h3, h4, h5, h6, [data-hook*="global"]').forEach(function (h) {
      var t = fold(h.textContent);
      if (!t || t.length > 90 || !INTL_RE.test(t)) return;
      var c = h.parentElement, depth = 0;
      while (c && depth < 6) {
        if (hasReviewAfter(c, h)) { zones.push({ c: c, h: h }); return; }
        c = c.parentElement; depth++;
      }
    });
    return zones;
  }
  function isInternational(node, zones) {
    if (/^customer_review_foreign-/.test(str(node.id)) || q(node, '[id^="customer_review_foreign-"]')) return true;
    if (closest(node, '#cm-cr-global-review-list, [data-hook="global-reviews-content"], [data-hook="cr-global-review-list"]')) return true;
    for (var i = 0; zones && i < zones.length; i++) {
      if (zones[i].c.contains(node) && (zones[i].h.compareDocumentPosition(node) & 4)) return true;
    }
    return false;
  }

  function reviewId(node) {
    var inner = q(node, '[id^="customer_review-"], [id^="customer_review_foreign-"]');
    var ids = [node.id, inner && inner.id, attr(node, 'data-review-id')];
    for (var i = 0; i < ids.length; i++) {
      var id = str(ids[i]).replace(/^customer_review(?:_foreign)?-/, '');
      if (/^[A-Z0-9]{8,}$/i.test(id)) return id;
    }
    var links = qa(node, 'a[href*="customer-reviews/"]');
    for (var j = 0; j < links.length; j++) {
      var m = str(attr(links[j], 'href')).match(/customer-reviews\/(R[A-Z0-9]{6,})/i);
      if (m) return m[1];
    }
    return null;
  }

  function ratingFromClass(c) {
    var m = str(c).match(/a-star-(?:[a-z]+-)?(\d)(?:-(\d))?(?!\d)/);
    if (!m) return null;
    var n = parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 10 : 0);
    return n > 0 && n <= 5 ? n : null;
  }
  function reviewRating(node) {
    var el = pick(node, ['[data-hook="review-star-rating"]', '[data-hook="cmps-review-star-rating"]', 'i.review-rating', '.review-rating']);
    var n = null;
    if (el) {
      n = toRating(textOf(q(el, '.a-icon-alt'))) || toRating(attr(el, 'title')) || toRating(textOf(el)) || ratingFromClass(classOf(el));
    }
    if (n == null) {
      var a = q(node, 'a[title*=" 5 "], a[title*=" 5,"], a[title*="/5"]');
      if (a) n = toRating(attr(a, 'title'));
    }
    if (n == null) {
      var icon = q(node, 'i[class*="a-star-"]');
      if (icon) n = ratingFromClass(classOf(icon));
    }
    return n;
  }

  // New DOM nests the star icon inside the title link: take the last real span.
  function reviewTitle(el) {
    if (!el) return null;
    var orig = q(el, '.cr-original-review-content');
    if (orig && textOf(orig)) return textOf(orig);
    var spans = qa(el, 'span').filter(function (s) {
      if (/(?:^|\s)(?:a-icon-alt|a-letter-space|cr-translated-review-content)(?:\s|$)/.test(classOf(s))) return false;
      var icon = closest(s, 'i, .a-icon, [data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]');
      if (icon && el.contains(icon)) return false;
      return !!textOf(s);
    });
    if (spans.length) return textOf(spans[spans.length - 1]);
    var t = textOf(el);
    var star = q(el, '.a-icon-alt');
    if (star && textOf(star)) t = clean(t.replace(textOf(star), ''));
    return t || null;
  }

  function stripJunk(t) {
    var lines = str(t).split('\n').map(function (line) {
      return line.replace(/\s*(?:Leer m[aá]s|Read more|Ver m[aá]s)\s*$/i, '').trim();
    }).filter(function (line) {
      var f = fold(line).replace(/[.…:!]+$/, '');
      return f && JUNK_LINES.indexOf(f) < 0;
    });
    return lines.join('\n');
  }
  function reviewBody(el) {
    if (!el) return null;
    var orig = q(el, '.cr-original-review-content');
    var t = stripJunk(richText(orig && textOf(orig) ? orig : el, BODY_SKIP));
    if (!t) t = stripJunk(richText(el, 'script, style, .a-expander-header, .a-expander-prompt'));
    return t || null;
  }

  var VERIFIED_RE = /compra verificada|verified purchase|achat verifie|verifizierter kauf|acquisto verificato/;
  // "Formato: Tapa dura" -> "Tapa dura". The strip may also hold separators, the verified badge
  // or the Vine label, so it is split into segments (child elements, "|" separators).
  function reviewFormat(el) {
    if (!el) return null;
    var segs = [];
    Array.prototype.forEach.call(el.childNodes || [], function (k) {
      var t = k.nodeType === 3 ? k.nodeValue : (k.nodeType === 1 ? richText(k) : '');
      str(t).split(/[|\n]/).forEach(function (s) { s = clean(s); if (s) segs.push(s); });
    });
    var seg = segs.filter(function (s) { return /(?:formato|format|formaat)\s*:/i.test(s); })[0] ||
      segs.filter(function (s) { var f = fold(s); return !VERIFIED_RE.test(f) && !/vine/.test(f); })[0] || '';
    var m = seg.match(/(?:formato|format|formaat)\s*:\s*(.+)$/i);
    var v = (m ? m[1] : seg.replace(/^[^:]{1,25}:\s*/, ''))
      .replace(/(?:Compra verificada|Verified Purchase|Achat vérifié|Verifizierter Kauf|Acquisto verificato).*$/i, '');
    return clean(v) || null;
  }

  function countImages(node) {
    return outermost(qa(node, '[data-hook="review-image-tile"], img.review-image-tile')).length;
  }

  function metaText(node, exclude) {
    var c = node.cloneNode(true);
    qa(c, exclude).forEach(removeEl);
    return fold(c.textContent);
  }

  function parseReviewNode(node, section, zones) {
    var titleEl = pick(node, ['[data-hook="review-title"]', '.review-title']);
    var bodyEl = pick(node, ['[data-hook="review-body"]', '.review-text-content', '.review-text']);
    var dateEl = pick(node, ['[data-hook="review-date"]', '.review-date']);
    var meta = metaText(node, '[data-hook="review-title"], .review-title, [data-hook="review-body"], .review-text-content, .review-text, [data-hook="review-collapsed"]');
    var r = {
      id: null,
      author: textOf(q(node, '.a-profile-name')) || textOf(q(node, '[data-hook="review-author"]')) || null,
      rating: reviewRating(node),
      title: reviewTitle(titleEl),
      body: reviewBody(bodyEl),
      date: null,
      dateText: textOf(dateEl) || null,
      country: null,
      verified: !!q(node, '[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]') || VERIFIED_RE.test(meta),
      vine: !!q(node, '[data-hook*="vine"]') || /(?:^|[^a-z])vine(?:[^a-z]|$)/.test(meta),
      format: reviewFormat(pick(node, ['[data-hook="format-strip"]', '[data-hook="format-strip-linkless"]', '.review-format-strip'])),
      helpful: parseHelpful(pickText(node, ['[data-hook="helpful-vote-statement"]', '.cr-vote-text'])),
      images: countImages(node),
      section: isInternational(node, zones) ? 'international' : (section || 'main')
    };
    if (r.dateText) {
      r.date = parseDate(r.dateText);
      r.country = parseCountry(r.dateText);
    }
    r.id = reviewId(node) || hashId([r.author, r.dateText, r.title, str(r.body).slice(0, 80)].join('|'));
    return r;
  }
  // Never lets one malformed node abort the whole extraction.
  function safeParse(node, section, zones) {
    try {
      var r = parseReviewNode(node, section, zones);
      if (!r || (r.rating == null && !r.body && !r.title)) return null; // empty template/placeholder
      return r;
    } catch (e) {
      return null;
    }
  }

  function parseReviews(root, section) {
    root = root || document;
    var zones = sectionContext(root);
    var store = createStore();
    reviewNodes(root).forEach(function (n) { store.add(safeParse(n, section || 'main', zones)); });
    return store.list();
  }

  /* ------------------------------------------------------------------ review store / merge */

  function rankOf(s) { return Object.prototype.hasOwnProperty.call(SECTION_RANK, s) ? SECTION_RANK[s] : 9; }
  function mergeReview(a, b) {
    var out = Object.assign({}, a);
    Object.keys(b).forEach(function (k) { if (out[k] == null || out[k] === '') out[k] = b[k]; });
    if (str(b.body).length > str(a.body).length) out.body = b.body;
    if (rankOf(b.section) < rankOf(a.section)) out.section = b.section;
    out.verified = !!(a.verified || b.verified);
    out.vine = !!(a.vine || b.vine);
    out.helpful = Math.max(+a.helpful || 0, +b.helpful || 0);
    out.images = Math.max(+a.images || 0, +b.images || 0);
    return out;
  }
  function createStore() {
    var map = new Map();
    return {
      add: function (r) {
        if (!r || r.id == null) return false;
        var old = map.get(r.id);
        if (!old) { map.set(r.id, r); return true; }
        map.set(r.id, mergeReview(old, r));
        return false;
      },
      addAll: function (list) {
        var self = this, n = 0;
        (list || []).forEach(function (r) { if (self.add(r)) n++; });
        return n;
      },
      size: function () { return map.size; },
      list: function () { return Array.from(map.values()); }
    };
  }
  function dedupeReviews(list) {
    var s = createStore();
    s.addAll((list || []).map(function (r) {
      if (r && r.id == null) r = Object.assign({}, r, { id: hashId([r.author, r.dateText, r.title, str(r.body).slice(0, 80)].join('|')) });
      return r;
    }));
    return s.list();
  }

  /* ------------------------------------------------------------------ book metadata */

  var BOOK_KEYS = ['asin', 'title', 'subtitle', 'authors', 'cover', 'coverData', 'rating', 'ratingsTotal', 'reviewsWithText',
    'histogram', 'price', 'formats', 'formatLine', 'pages', 'publisher', 'publicationDate', 'language', 'isbn10',
    'isbn13', 'bestSellersRank', 'customersSay', 'aspects'];
  var ARRAY_KEYS = { authors: 1, formats: 1, bestSellersRank: 1, aspects: 1 };
  var REVIEW_KEYS = ['id', 'author', 'rating', 'title', 'body', 'date', 'dateText', 'country', 'verified', 'vine',
    'format', 'helpful', 'images', 'section'];

  function emptyBook() {
    var b = {};
    BOOK_KEYS.forEach(function (k) { b[k] = ARRAY_KEYS[k] ? [] : null; });
    return b;
  }
  function normalizeBook(src) {
    var out = emptyBook();
    if (!src) return out;
    BOOK_KEYS.forEach(function (k) {
      var v = src[k];
      if (ARRAY_KEYS[k]) out[k] = Array.isArray(v) ? v.slice() : [];
      else out[k] = v === undefined || v === '' ? null : v;
    });
    return out;
  }
  function isEmptyValue(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  // Fields of `primary` win; empty ones are filled from `secondary`.
  function mergeBook(primary, secondary) {
    var a = normalizeBook(primary), b = normalizeBook(secondary);
    BOOK_KEYS.forEach(function (k) { if (isEmptyValue(a[k]) && !isEmptyValue(b[k])) a[k] = b[k]; });
    return a;
  }

  function isPersonName(t) {
    return !!t && t.length <= 80 && !/^(?:seguir|follow|ver |see |visita|visit|m[aá]s |more |y \d|and \d|\(|formato|format)/i.test(t);
  }
  function imageUrl(img, base) {
    if (!img) return null;
    var dyn = attr(img, 'data-a-dynamic-image');
    if (dyn) {
      try {
        var o = JSON.parse(dyn), best = null, area = -1;
        Object.keys(o).forEach(function (u) {
          var s = o[u] || [], a = (+s[0] || 0) * (+s[1] || 0);
          if (a > area) { area = a; best = u; }
        });
        if (best) return absUrl(best, base);
      } catch (e) { /* ignore bad JSON */ }
    }
    var cands = [attr(img, 'data-old-hires'), attr(img, 'src'), attr(img, 'data-src')];
    for (var i = 0; i < cands.length; i++) {
      if (cands[i] && !/^data:/i.test(cands[i])) return absUrl(cands[i], base);
    }
    return null;
  }

  // Amazon image URLs: /images/I/<id>.<modifiers>.<ext>, e.g. "51abc._SY466_.jpg" or
  // "51abc._SY88.jpg". Returns the same image with the "_SY240_" size (240 px high).
  function thumbUrl(u) {
    if (!u) return null;
    try {
      var url = new URL(u, location.href);
      if (!/\/images\//.test(url.pathname)) return url.href;
      var parts = url.pathname.split('/');
      var bits = parts.pop().split('.');
      if (bits.length < 2 || !/^(?:jpe?g|png|gif|webp)$/i.test(bits[bits.length - 1])) return url.href;
      var ext = bits.pop();
      var id = bits.shift();
      if (!id || (bits.length && !/^_/.test(bits[0]))) return url.href;
      parts.push(id + '._SY240_.' + ext);
      url.pathname = parts.join('/');
      return url.href;
    } catch (e) {
      return u;
    }
  }
  function readAsDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('FileReader')); };
      fr.readAsDataURL(blob);
    });
  }
  var COVER_MAX_BYTES = 60 * 1024;
  // Small cover thumbnail as a data: URI (so the dashboard can show it where external images are
  // blocked). Any error, non-image answer, image over 60 KB or timeout -> null. Never throws.
  async function fetchCoverData(url, timeoutMs) {
    if (!url || /^data:/i.test(str(url)) || typeof fetch !== 'function' || typeof FileReader !== 'function') return null;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var timeout = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* ignore */ } }
        reject(new Error('timeout'));
      }, typeof timeoutMs === 'number' ? timeoutMs : 5000);
    });
    try {
      var init = { mode: 'cors', credentials: 'omit' };
      if (ctrl) init.signal = ctrl.signal;
      var res = await Promise.race([fetch(thumbUrl(url), init), timeout]);
      if (!res || !res.ok) return null;
      var blob = await Promise.race([res.blob(), timeout]);
      if (!blob || !blob.size || blob.size > COVER_MAX_BYTES || !/^image\//i.test(blob.type)) return null;
      var data = await Promise.race([readAsDataURL(blob), timeout]);
      return /^data:image\//i.test(data) ? data : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseHistLabel(t) {
    var f = fold(t);
    var p = f.match(/(\d{1,3})\s*(?:%|percent|por\s*ciento|pour\s*cent|prozent|per\s*cento|por\s*cento|procent)/);
    var s = f.match(/(\d)\s*(?:star|estrella|etoile|stern|stell|estrela|ster)/);
    if (!p || !s) return null;
    var star = +s[1], pct = +p[1];
    return star >= 1 && star <= 5 && pct <= 100 ? { star: star, pct: pct } : null;
  }
  function parseHistogram(root) {
    var table = pick(root, ['#histogramTable', '[data-hook="histogram-table"]', '#cm_cr_dp_d_rating_histogram', '.cr-widget-Histogram']);
    if (!table) return null;
    var h = {}, found = 0;
    function put(star, pct) { if (h[star] == null) { h[star] = pct; found++; } }
    qa(table, '[aria-label], [title]').forEach(function (el) {
      var r = parseHistLabel(attr(el, 'aria-label')) || parseHistLabel(attr(el, 'title'));
      if (r) put(r.star, r.pct);
    });
    if (found < 5) {
      var rows = qa(table, 'tr, li');
      if (!rows.length) rows = Array.prototype.slice.call(table.children || []);
      rows.forEach(function (row, i) {
        var t = fold(row.textContent);
        var sm = t.match(/(\d)\s*(?:star|estrella|etoile|stern|stell|estrela|ster)/);
        var star = sm ? +sm[1] : null;
        if (!star) {
          var cm = classOf(q(row, '[class*="star"]')).match(/(?:^|\s)([1-5])star(?:\s|$)/);
          if (cm) star = +cm[1];
        }
        if (!star && rows.length === 5) star = 5 - i;
        var meter = q(row, '.a-meter[aria-valuenow], [role="progressbar"][aria-valuenow]');
        var pct = meter ? toInt(attr(meter, 'aria-valuenow')) : null;
        if (pct == null) { var pm = t.match(/(\d{1,3})\s*%/); if (pm) pct = +pm[1]; }
        if (star >= 1 && star <= 5 && pct != null && pct <= 100) put(star, pct);
      });
    }
    if (!found) return null;
    var out = {};
    ['5', '4', '3', '2', '1'].forEach(function (k) { out[k] = h[k] != null ? h[k] : 0; });
    return out;
  }

  var SAY_HEADING_RE = /^(?:los clientes dicen|lo que dicen los clientes|customers say|les clients disent|kunden sagen|i clienti dicono|os clientes dizem)$/;
  var AI_NOTE_RE = /generado por ia|generado con ia|ai-generated|ai generated|genere par l.?ia|ki-generiert|generato dall.?ia|gerado por ia/;
  function parseCustomersSay(root) {
    var el = pick(root, ['[data-hook="cr-insights-widget-summary"]', '#product-summary']);
    var t = el ? richText(el) : '';
    if (!t) {
      var heading = qa(root, 'h2, h3, h4, h5, span.a-text-bold, span.a-size-large').filter(function (x) {
        return SAY_HEADING_RE.test(fold(x.textContent));
      })[0];
      var sib = heading ? (heading.nextElementSibling || (heading.parentElement && heading.parentElement.nextElementSibling)) : null;
      while (sib && !textOf(sib)) sib = sib.nextElementSibling;
      if (sib) t = richText(sib);
    }
    t = str(t).split('\n').filter(function (line) { return !AI_NOTE_RE.test(fold(line)); }).join('\n');
    return clean(t) ? t : null;
  }

  function sentimentOf(el, pos, neg) {
    var marks = [classOf(el), attr(el, 'data-sentiment'), attr(el, 'data-aspect-sentiment')];
    qa(el, 'i, [class*="icon"], [data-sentiment]').forEach(function (x) { marks.push(classOf(x), attr(x, 'data-sentiment')); });
    var m = fold(marks.join(' '));
    if (/mixed|mixto|neutral/.test(m)) return 'mixed';
    if (/negativ|a-icon-close|x-mark|a-icon-remove/.test(m)) return 'negative';
    if (/positiv|checkmark/.test(m)) return 'positive';
    if (pos != null && neg != null) {
      if (pos >= 2 * neg) return 'positive';
      if (neg >= 2 * pos) return 'negative';
      return 'mixed';
    }
    return null;
  }
  function parseAspects(root) {
    var box = pick(root, ['[data-hook="cr-insights-widget-aspects"]', '#aspect-button-list', '[data-hook="cr-insights-aspects"]']);
    var chips = box
      ? qa(box, '[data-hook*="aspect"], button, [role="button"], a')
      : qa(root, '[data-hook="cr-insights-aspect-link"], [data-hook*="insights-aspect-button"]');
    chips = outermost(chips);
    var out = [], seen = {};
    chips.forEach(function (chip) {
      try {
        var nameEl = qa(chip, 'span').filter(function (s) {
          return textOf(s) && !/a-icon-alt|a-letter-space/.test(classOf(s)) && !q(s, 'span');
        })[0];
        var name = textOf(nameEl) || clean(str(richText(chip)).split('\n')[0]);
        if (!name || name.length > 60) return;
        var info = fold([attr(chip, 'aria-label'), attr(chip, 'title'), chip.textContent].join(' '));
        var pm = info.match(/(\d[\d.,]*)\s*(?:menciones\s+|mentions\s+|comentarios\s+)?(?:positiv|positive)/);
        var nm = info.match(/(\d[\d.,]*)\s*(?:menciones\s+|mentions\s+|comentarios\s+)?(?:negativ|negative)/);
        var pos = pm ? toInt(pm[1]) : null, neg = nm ? toInt(nm[1]) : null;
        var key = fold(name);
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ name: name, sentiment: sentimentOf(chip, pos, neg), positive: pos, negative: neg });
      } catch (e) { /* skip malformed chip */ }
    });
    return out;
  }

  function parseRatingsInfo(t) {
    var out = { total: null, withText: null };
    var f = fold(t);
    if (!f) return out;
    var m = f.match(/(\d[\d.,\u00a0\u202f ]*)\s+(?:con\s+resena|con\s+opinion|with\s+review|avec\s+(?:un\s+)?commentaire|avec\s+avis|mit\s+rezension|con\s+recension|com\s+avalia|com\s+resenha)/);
    if (m) out.withText = toInt(m[1]);
    if (out.withText == null) {
      var m2 = f.match(/(?:de|of|sur|von|di)\s+(\d[\d.,\u00a0\u202f ]*)\s+(?:resena|opinion|review|commentaire|rezension|recension)/);
      if (m2) out.withText = toInt(m2[1]);
    }
    var m3 = f.match(/^(\d[\d.,\u00a0\u202f ]*)\s+(?:total(?:es)?\s+|global(?:es)?\s+)?(?:calificacion|valoracion|rating|evaluation|bewertung|valutazion|avaliac)/);
    if (m3) out.total = toInt(m3[1]);
    return out;
  }

  // Book data shown on a reviews page (product-reviews / portal/customer-reviews).
  function parseBookMeta(root, url) {
    root = root || document;
    var base = url || docUrl(root);
    var b = emptyBook();
    b.asin = asinFromDoc(root, url);
    var st = splitTitle(pickText(root, ['[data-hook="product-link"]', '[data-hook="cr-product-title"]', '#cm_cr-product_info .product-title']));
    b.title = st.title;
    b.subtitle = st.subtitle;
    b.authors = uniq(qa(root, '#cm_cr-product_info .product-by-line a, [data-hook="cr-product-byline"] a, [data-hook="product-author"]').map(textOf).filter(isPersonName));
    b.cover = imageUrl(pick(root, ['img[data-hook="cr-product-image"]', '[data-hook="cr-product-image"] img', '#cm_cr-product_info img']), base);
    b.rating = toRating(textOf(q(root, '[data-hook="rating-out-of-text"]'))) ||
      toRating(textOf(q(root, '[data-hook="average-star-rating"] .a-icon-alt')));
    var info = parseRatingsInfo(pickText(root, ['[data-hook="cr-filter-info-review-rating-count"]', '[data-hook="cr-filter-info-section"]']));
    b.ratingsTotal = toInt(textOf(q(root, '[data-hook="total-review-count"]')));
    if (b.ratingsTotal == null) b.ratingsTotal = info.total;
    b.reviewsWithText = info.withText;
    b.histogram = parseHistogram(root);
    b.customersSay = parseCustomersSay(root);
    b.aspects = parseAspects(root);
    return b;
  }

  // --- product page (/dp/) ---

  var PRICE_SELECTORS = [
    '#tmmSwatches .a-button-selected .slot-price', '#tmmSwatches .swatchElement.selected .a-color-price',
    '#corePrice_feature_div .a-offscreen', '#price', '#kindle-price', '#newBuyBoxPrice', '.a-price .a-offscreen'
  ];
  function swatchInfo(sw, host) {
    var name = pickText(sw, ['.slot-title span[aria-label]', '.slot-title', '.a-button-text > span:first-child', 'a > span:first-child']);
    if (!name) name = str(richText(sw)).split('\n')[0] || '';
    name = clean(name.replace(/\s*(?:Formato|Format)\s*:?\s*$/i, ''));
    var pt = pickText(sw, ['.slot-price', '.a-color-price', '.a-price .a-offscreen']);
    if (!/\d/.test(pt)) {
      var m = textOf(sw).match(/(?:[A-Z]{0,3}\$|€|£)\s?\d[\d.,]*|\d[\d.,]*\s?(?:[A-Z]{0,3}\$|€|£)/);
      pt = m ? m[0] : '';
    }
    return { format: name || null, price: pt ? priceObj(pt, host) : null };
  }
  function parseFormats(root, host) {
    var out = [], selected = null, seen = {};
    outermost(qa(root, '#tmmSwatches .swatchElement, #tmmSwatches li, #tmmSwatches [id^="tmm-grid-swatch"]')).forEach(function (sw) {
      try {
        var info = swatchInfo(sw, host);
        if (!info.format) return;
        var key = fold(info.format);
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ format: info.format, price: info.price });
        if (!selected && (matches(sw, '.selected, .a-button-selected') || q(sw, '.a-button-selected'))) selected = info;
      } catch (e) { /* skip */ }
    });
    return { formats: out, selected: selected };
  }

  function detailEntries(root) {
    var out = [];
    function push(label, value, key) {
      var l = fold(label).replace(/[\s:]+$/, '').trim();
      if (l || key) out.push({ label: l, value: str(value), key: key || '' });
    }
    var lis = uniq(qa(root, '#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #detailBullets li, #productDetailsTable .content li, #detail-bullets .content li'));
    lis.forEach(function (li) {
      if (closest(li.parentElement, 'li')) return; // nested BSR sub-list: read with its parent
      var clone = li.cloneNode(true);
      var labelEl = q(clone, '.a-text-bold, b');
      var label = '';
      var value;
      if (labelEl) {
        label = textOf(labelEl);
        removeEl(labelEl);
        value = richText(clone);
      } else {
        value = richText(clone);
        var i = value.indexOf(':');
        if (i < 0) return;
        label = value.slice(0, i);
        value = value.slice(i + 1);
      }
      push(label, value.replace(/^[\s:]+/, ''));
    });
    qa(root, '#productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr, #productDetails_db_sections tr').forEach(function (tr) {
      var th = q(tr, 'th'), td = q(tr, 'td');
      if (th && td) push(textOf(th), richText(td));
    });
    qa(root, '[id^="rpi-attribute-"]').forEach(function (card) {
      var val = q(card, '.rpi-attribute-value');
      if (val) push(textOf(q(card, '.rpi-attribute-label')), textOf(val), card.id);
    });
    return out;
  }

  var LABEL_RES = {
    publisher: /^(?:editorial|publisher|editeur|verlag|editore|editora|uitgever)$/,
    date: /^(?:fecha de publicacion|publication date|date de publication|erscheinungstermin|data di pubblicazione|data de publicacao|publicatiedatum)$/,
    language: /^(?:idioma|language|langue|sprache|lingua|taal)$/,
    pages: /^(?:tapa dura|tapa blanda|pasta dura|pasta blanda|libro de bolsillo|encuadernacion en espiral|longitud de impresion|numero de paginas|paginas|print length|hardcover|paperback|mass market paperback|board book|spiral-bound|flexibound|library binding|pages|broche|relie|poche|nombre de pages|longueur d.impression|gebundene ausgabe|taschenbuch|broschiert|seitenzahl der print-ausgabe|copertina rigida|copertina flessibile|lunghezza stampa|capa dura|capa comum|brochura)$/,
    isbn10: /^isbn-?10$/,
    isbn13: /^isbn-?13$/,
    asin: /^asin$/,
    bsr: /mas vendidos|best ?sellers? rank|bestseller-rang|meilleures ventes|classifica bestseller|mais vendidos/
  };

  function parsePublisher(v) {
    var t = clean(v), date = null;
    var m = t.match(/\(([^()]*)\)\s*$/);
    if (m) { date = parseDate(m[1]); t = clean(t.slice(0, m.index)); }
    t = clean(t.split(';')[0]);
    return { name: t || null, date: date };
  }
  function parseBSR(v) {
    var out = [];
    var t = str(v).replace(/\([^()]*\)/g, ' ');
    t = t.replace(/(^|\s)(?:#|n\.?\s?º|nº|n°|nr\.|n\.)\s*(?=\d)/gi, '\n');
    t.split('\n').forEach(function (seg) {
      var m = clean(seg).match(/^(\d[\d.,\u00a0\u202f ]*?)\s+(?:en|in|dans|em)\s+(.+)$/i);
      if (!m) return;
      var rank = parseInt(m[1].replace(/\D/g, ''), 10);
      var cat = clean(m[2]).replace(/[.;,:]+$/, '');
      if (rank > 0 && cat) out.push({ rank: rank, category: cat });
    });
    return out;
  }
  function parseDetails(root) {
    var d = { pages: null, publisher: null, publicationDate: null, language: null, isbn10: null, isbn13: null, asin: null, bsr: [] };
    var pubDate = null;
    detailEntries(root).forEach(function (e) {
      try {
        var l = e.label, v = clean(e.value), fv = fold(v);
        if (!v) return;
        if (LABEL_RES.bsr.test(l)) { if (!d.bsr.length) d.bsr = parseBSR(e.value); return; }
        if (LABEL_RES.publisher.test(l) || /publisher$/.test(e.key)) {
          if (!d.publisher) { var p = parsePublisher(v); d.publisher = p.name; pubDate = pubDate || p.date; }
          return;
        }
        if (LABEL_RES.date.test(l) || /publication_date$/.test(e.key)) { if (!d.publicationDate) d.publicationDate = parseDate(v) || v; return; }
        if (LABEL_RES.language.test(l) || /language$/.test(e.key)) { if (!d.language) d.language = v; return; }
        if (LABEL_RES.isbn10.test(l) || /isbn10$/.test(e.key)) { if (!d.isbn10) d.isbn10 = (v.replace(/[^0-9Xx]/g, '').toUpperCase() || null); return; }
        if (LABEL_RES.isbn13.test(l) || /isbn13$/.test(e.key)) { if (!d.isbn13) d.isbn13 = (v.replace(/\D/g, '') || null); return; }
        if (LABEL_RES.asin.test(l)) { if (!d.asin && /^[A-Z0-9]{10}$/i.test(v)) d.asin = v.toUpperCase(); return; }
        if (LABEL_RES.pages.test(l) || /pages$/.test(e.key)) {
          if (!d.pages && /pagina|page|seite|pagine/.test(fv)) d.pages = toInt(v);
        }
      } catch (err) { /* skip entry */ }
    });
    if (!d.publicationDate && pubDate) d.publicationDate = pubDate;
    return d;
  }

  function parseProductPage(root, url) {
    root = root || document;
    var base = url || docUrl(root);
    var host = '';
    try { host = new URL(base).host; } catch (e) { host = location.host; }
    var b = emptyBook();
    b.asin = asinFromDoc(root, url);
    var st = splitTitle(pickText(root, ['#productTitle', '#ebooksProductTitle', '#title']));
    b.title = st.title;
    b.subtitle = st.subtitle;
    b.formatLine = pickText(root, ['#productSubtitle', '#ebooksProductSubtitle']) || null;
    b.authors = uniq(qa(root, '#bylineInfo .author a, #bylineInfo a.contributorNameID').map(textOf).filter(isPersonName));
    b.rating = toRating(attr(q(root, '#acrPopover'), 'title')) ||
      toRating(pickText(root, ['#acrPopover .a-icon-alt', '#averageCustomerReviews .a-icon-alt'])) ||
      toRating(textOf(q(root, '[data-hook="rating-out-of-text"]')));
    b.ratingsTotal = toInt(textOf(q(root, '#acrCustomerReviewText'))) || toInt(textOf(q(root, '[data-hook="total-review-count"]')));
    b.cover = imageUrl(pick(root, ['#imgBlkFront', '#ebooksImgBlkFront', '#landingImage', '#main-image', '#imgTagWrapperId img']), base);
    var fm = parseFormats(root, host);
    b.formats = fm.formats;
    var priceText = '';
    for (var i = 0; i < PRICE_SELECTORS.length && !priceText; i++) {
      var v = textOf(q(root, PRICE_SELECTORS[i]));
      if (/\d/.test(v)) priceText = v;
    }
    var p = priceObj(priceText, host);
    if (p) {
      p.format = (fm.selected && fm.selected.format) || (b.formatLine ? clean(b.formatLine.split(/\s[–—-]\s/)[0]) : null) || null;
      b.price = p;
    }
    var det = parseDetails(root);
    b.pages = det.pages;
    b.publisher = det.publisher;
    b.publicationDate = det.publicationDate || (b.formatLine ? parseDate(b.formatLine) : null);
    b.language = det.language;
    b.isbn10 = det.isbn10;
    b.isbn13 = det.isbn13;
    b.bestSellersRank = det.bsr;
    if (!b.asin) b.asin = det.asin || det.isbn10 || null;
    b.histogram = parseHistogram(root);
    b.customersSay = parseCustomersSay(root);
    b.aspects = parseAspects(root);
    return b;
  }

  /* ------------------------------------------------------------------ load more / clicking */

  var LOAD_MORE_SEL = 'button, a, input[type="submit"], input[type="button"], [role="button"], span.a-button, [data-hook*="show-more"], [data-hook*="load-more"]';
  // In-page "load more" controls.
  var LOAD_MORE_RES = [
    /mostrar\s+(?:\d+\s+)?(?:opiniones|resenas|comentarios|valoraciones)\s+mas/,
    /mostrar\s+mas\s+(?:opiniones|resenas|comentarios)/,
    /cargar\s+mas/,
    /show\s+(?:\d+\s+)?more\s+reviews/,
    /load\s+more/
  ];
  // "See more reviews": only when it does not navigate away (a real link is handled by run()).
  var SEE_MORE_RES = [/ver\s+mas\s+(?:opiniones|resenas)/, /see\s+more\s+reviews/];

  function controlText(el) {
    var raw = str(el.tagName).toUpperCase() === 'INPUT' ? (el.value || '') : (el.textContent || '');
    if (raw.length > 300) return '';
    if (!clean(raw)) {
      raw = attr(el, 'aria-label') || attr(el, 'title') || '';
      var ids = str(attr(el, 'aria-labelledby')).split(/\s+/).filter(Boolean);
      var d = docOf(el);
      if (!clean(raw) && ids.length && d.getElementById) {
        raw = ids.map(function (id) { return textOf(d.getElementById(id)); }).join(' ');
      }
    }
    return fold(raw);
  }
  function isVisible(el) {
    var win = docOf(el).defaultView;
    if (!win) return true; // DOMParser documents have no layout
    try {
      if (!el.getClientRects().length) return false;
      var cs = win.getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    } catch (e) {
      return true;
    }
  }
  function isDisabled(el) {
    if (el.disabled || attr(el, 'aria-disabled') === 'true') return true;
    if (closest(el, '.a-button-disabled, .a-disabled, [aria-disabled="true"]')) return true;
    return matches(el, '.a-button') && !!q(el, 'input[disabled], button[disabled]');
  }
  function navigatingHref(a, doc) {
    var raw = clean(attr(a, 'href'));
    if (!raw || raw.charAt(0) === '#' || /^javascript:/i.test(raw)) return null;
    var base = docUrl(doc || a);
    var abs;
    try { abs = new URL(raw, base).href; } catch (e) { return null; }
    return stripHash(abs) === stripHash(base) ? null : abs;
  }
  function clickTarget(el) {
    if (matches(el, '.a-button')) {
      var inner = q(el, 'input.a-button-input, a.a-button-text, button, a[href], input[type="submit"], [role="button"]');
      if (inner) return inner;
    }
    return el;
  }

  function findLoadMore(root) {
    root = root || document;
    var doc = docOf(root);
    var found = [];
    qa(root, LOAD_MORE_SEL).forEach(function (el) {
      var t = controlText(el);
      if (!t || t.length > 70) return;
      var strong = LOAD_MORE_RES.some(function (re) { return re.test(t); });
      var weak = !strong && SEE_MORE_RES.some(function (re) { return re.test(t); });
      if (!strong && !weak) return;
      if (!isVisible(el) || isDisabled(el)) return;
      if (weak) {
        var a = closest(clickTarget(el), 'a[href]');
        if (a && navigatingHref(a, doc)) return;
      }
      found.push(el);
    });
    if (!found.length) return null;
    var inner = found.filter(function (el) {
      return !found.some(function (o) { return o !== el && el.contains(o); });
    });
    var hooked = inner.filter(function (el) { return /show-more|load-more/.test(str(attr(el, 'data-hook'))) || !!closest(el, '[data-hook*="show-more"], [data-hook*="load-more"]'); });
    return hooked[0] || inner[0];
  }

  // Clicks without ever letting the page navigate away (a plain link is reported instead).
  function activate(el) {
    var target = clickTarget(el);
    var doc = docOf(target);
    var win = doc.defaultView;
    var anchor = closest(target, 'a[href]');
    var href = anchor ? navigatingHref(anchor, doc) : null;
    var st = { blockedHref: null, blockedSubmit: false };
    function onClick(e) { if (href && !e.defaultPrevented) { e.preventDefault(); st.blockedHref = href; } }
    function onSubmit(e) { if (!e.defaultPrevented) { e.preventDefault(); st.blockedSubmit = true; } }
    if (win) { win.addEventListener('click', onClick, false); win.addEventListener('submit', onSubmit, false); }
    try {
      if (typeof target.click === 'function') target.click();
      else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (e) { /* ignore */ }
    if (win) { win.removeEventListener('click', onClick, false); win.removeEventListener('submit', onSubmit, false); }
    return st;
  }

  function timing(opts) {
    opts = opts || {};
    var fast = !!opts.fast;
    function pick(name, normal, quick) {
      var v = opts[name];
      return typeof v === 'number' && v >= 0 ? v : (fast ? quick : normal);
    }
    return {
      minDelay: pick('minDelay', 1200, 20),
      maxDelay: pick('maxDelay', 2800, 60),
      timeout: pick('timeout', 10000, 4000),
      retries: pick('retries', 2, 2),
      confirm: pick('confirmDelay', 1500, 150),
      settle: pick('settle', 400, 60),
      maxClicks: pick('maxClicks', 400, 400),
      frameTimeout: pick('frameTimeout', 30000, 15000),
      navigateDelay: pick('navigateDelay', 2500, 0),
      coverTimeout: pick('coverTimeout', 5000, 5000)
    };
  }
  function stopper(opts) {
    return opts && typeof opts.shouldStop === 'function' ? opts.shouldStop : function () { return false; };
  }
  function snapshot(root) {
    var nodes = qa(root, REVIEW_SEL);
    var last = nodes[nodes.length - 1];
    return { count: nodes.length, last: last ? (last.id || textOf(last).slice(0, 80)) : '' };
  }
  async function waitForChange(root, before, timeout, stop, settle) {
    var t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(200);
      if (stop()) return false;
      var now = snapshot(root);
      if (now.count > before.count || (now.count > 0 && now.last !== before.last)) {
        await sleep(settle);
        return true;
      }
    }
    return false;
  }

  // Clicks the load-more control until it disappears. Waits for new review nodes after each
  // click (timeout + retries) and pauses politely between clicks.
  async function expandAll(opts) {
    opts = opts || {};
    var root = opts.doc || document;
    var T = timing(opts);
    var stop = stopper(opts);
    var clicks = 0, complete = false, reason = '', nextUrl = null;
    for (;;) {
      if (stop()) { reason = 'stopped'; break; }
      var btn = findLoadMore(root);
      if (!btn) {
        await sleep(T.confirm); // the button may be hidden for a moment while loading
        btn = findLoadMore(root);
        if (!btn) { complete = true; reason = 'no-more'; break; }
      }
      if (clicks >= T.maxClicks) { reason = 'max-clicks'; break; }
      var before = snapshot(root);
      var changed = false, blocked = null;
      for (var attempt = 0; attempt <= T.retries; attempt++) {
        if (attempt > 0) { btn = findLoadMore(root); if (!btn) break; }
        var act = activate(btn);
        if (act.blockedHref) { blocked = act.blockedHref; break; }
        changed = await waitForChange(root, before, T.timeout, stop, T.settle);
        if (changed || stop()) break;
      }
      if (blocked) { nextUrl = blocked; reason = 'link'; break; }
      if (!changed) {
        if (stop()) { reason = 'stopped'; break; }
        if (!findLoadMore(root)) { complete = true; reason = 'no-more'; } else { reason = 'no-growth'; }
        break;
      }
      clicks++;
      if (typeof opts.onStep === 'function') {
        try { opts.onStep({ clicks: clicks, count: countReviewNodes(root) }); } catch (e) { /* ignore */ }
      }
      await sleep(rand(T.minDelay, T.maxDelay));
    }
    return { clicks: clicks, complete: complete, reason: reason, nextUrl: nextUrl, count: reviewNodes(root).length };
  }

  /* ------------------------------------------------------------------ pagination (fetch) */

  var NEXT_RE = /^(?:pagina siguiente|siguiente pagina|siguiente|next page|next|page suivante|nachste seite|weiter|pagina successiva|successiva|proxima pagina|proxima)(?:[^a-z]|$)/;
  function findNextPageUrl(root, baseUrl) {
    var doc = docOf(root);
    var a = q(root, 'ul.a-pagination li.a-last:not(.a-disabled) a[href], #cm_cr-pagination_bar li.a-last:not(.a-disabled) a[href]');
    if (!a) {
      a = qa(root, '.a-pagination a[href], #cm_cr-pagination_bar a[href], a[href*="pageNumber="]').filter(function (x) {
        return NEXT_RE.test(fold(x.textContent));
      })[0];
    }
    if (!a) return null;
    var href = clean(attr(a, 'href'));
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return null;
    return absUrl(href, baseUrl || docUrl(doc));
  }
  function loadMoreLinkUrl(root, baseUrl) {
    var el = findLoadMore(root);
    var a = el ? closest(clickTarget(el), 'a[href]') : null;
    if (!a) return null;
    var href = clean(attr(a, 'href'));
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return null;
    return absUrl(href, baseUrl || docUrl(root));
  }

  var ttPolicy;
  function parseHTML(html) {
    var parser = new DOMParser();
    try {
      return parser.parseFromString(html, 'text/html');
    } catch (e) {
      // Pages enforcing Trusted Types need a policy to parse HTML (never executed).
      if (ttPolicy === undefined) {
        ttPolicy = null;
        try {
          if (window.trustedTypes) ttPolicy = window.trustedTypes.createPolicy('kdpx-extractor', { createHTML: function (s) { return s; } });
        } catch (e2) { ttPolicy = null; }
      }
      if (ttPolicy) return parser.parseFromString(ttPolicy.createHTML(html), 'text/html');
      throw e;
    }
  }
  // Same-origin fetch + DOMParser. Never requests anything outside the current Amazon domain.
  async function fetchDoc(url) {
    if (!sameOrigin(url)) throw new Error('URL de otro dominio');
    var res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var html = await res.text();
    var d = parseHTML(html);
    docUrls.set(d, res.url || url);
    return d;
  }

  async function followPages(startUrl, opts, onDoc) {
    opts = opts || {};
    var T = timing(opts);
    var stop = stopper(opts);
    var url = startUrl, pages = 0, complete = false, reason = '', idle = 0, seen = {};
    while (url) {
      if (stop()) { reason = 'stopped'; break; }
      if (pages >= T.maxClicks) { reason = 'max-clicks'; break; }
      if (seen[url]) { complete = true; reason = 'loop'; break; }
      seen[url] = 1;
      if (!sameOrigin(url)) { reason = 'cross-origin'; break; }
      await sleep(rand(T.minDelay, T.maxDelay));
      var d;
      try { d = await fetchDoc(url); } catch (e) { reason = 'fetch-error'; break; }
      var block = detectBlock(d, docUrl(d));
      if (block) { reason = block; break; }
      pages++;
      var added = 0;
      try { added = onDoc(d, url) || 0; } catch (e) { added = 0; }
      if (typeof opts.onStep === 'function') { try { opts.onStep({ pages: pages }); } catch (e) { /* ignore */ } }
      idle = added ? 0 : idle + 1;
      if (idle >= 2) { complete = true; reason = 'no-new'; break; }
      url = findNextPageUrl(d, docUrl(d)) || loadMoreLinkUrl(d, docUrl(d));
      if (!url) { complete = true; reason = 'no-more'; }
    }
    return { pages: pages, complete: complete, reason: reason };
  }

  /* ------------------------------------------------------------------ star filters (iframe) */

  function withStarFilter(url, star) {
    var u = new URL(url, location.href);
    u.hash = '';
    u.searchParams.set('filterByStar', star);
    u.searchParams.set('sortBy', 'recent');
    u.searchParams.delete('pageNumber');
    if (!u.searchParams.get('reviewerType')) u.searchParams.set('reviewerType', 'all_reviews');
    return u.href;
  }
  function waitFrame(frame, timeout) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) { if (!done) { done = true; resolve(ok); } }
      frame.addEventListener('load', function () {
        var href = '';
        try { href = frame.contentWindow.location.href; } catch (e) { finish(true); return; }
        if (href && href !== 'about:blank') finish(true);
      });
      setTimeout(function () { finish(false); }, timeout);
    });
  }
  async function waitUntil(fn, timeout) {
    var t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (fn()) return true; } catch (e) { /* ignore */ }
      await sleep(200);
    }
    return false;
  }
  // Loads the reviews page filtered by stars in a hidden same-origin iframe and expands it there.
  async function starPass(star, baseUrl, opts, onDoc) {
    var T = timing(opts);
    var url = withStarFilter(baseUrl, star);
    var frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('style', 'position:fixed;left:-13000px;top:0;width:1280px;height:1000px;border:0;opacity:0;pointer-events:none;');
    var loaded = waitFrame(frame, T.frameTimeout);
    frame.src = url;
    (document.body || document.documentElement).appendChild(frame);
    var result = { star: star, ok: false, clicks: 0, error: null };
    try {
      if (!(await loaded)) throw new Error('tiempo de espera agotado');
      var d = null;
      try { d = frame.contentDocument; } catch (e) { d = null; }
      if (!d || !d.body) throw new Error('Amazon no permite cargar la página en segundo plano');
      var block = detectBlock(d);
      if (block) throw new Error(block === 'login' ? 'pide iniciar sesión' : 'captcha');
      await waitUntil(function () { return countReviewNodes(d) > 0; }, Math.min(5000, T.timeout));
      onDoc(d);
      var ex = await expandAll(Object.assign({}, opts, { doc: d, onStep: function () { onDoc(d); } }));
      onDoc(d);
      result.clicks = ex.clicks;
      var next = ex.nextUrl || findNextPageUrl(d, docUrl(d));
      if (next && !stopper(opts)()) {
        var pg = await followPages(next, opts, function (pd) { return onDoc(pd); });
        result.clicks += pg.pages;
      }
      result.ok = true;
    } catch (e) {
      result.error = str(e && e.message ? e.message : e);
    } finally {
      removeEl(frame);
    }
    return result;
  }

  /* ------------------------------------------------------------------ collect */

  // Expands the list (clicks or pagination), parses every review (incrementally) and,
  // optionally, repeats the process for each star filter.
  async function collect(opts) {
    opts = opts || {};
    var root = opts.doc || document;
    var pageUrl = opts.pageUrl || docUrl(root);
    var section = opts.section || 'main';
    var store = opts.store || createStore();
    var stop = stopper(opts);
    var seen = new WeakSet();
    var res = { clicks: 0, complete: false, pages: 0, reason: '', starPasses: [] };

    function progress(phase, extra) {
      if (typeof opts.onProgress !== 'function') return;
      try { opts.onProgress(Object.assign({ phase: phase, count: store.size(), clicks: res.clicks, pages: res.pages }, extra || {})); } catch (e) { /* ignore */ }
    }
    function harvest(d, sec) {
      var added = 0;
      var zones = sectionContext(d);
      reviewNodes(d).forEach(function (n) {
        if (seen.has(n)) return;
        var r = safeParse(n, sec, zones);
        if (!r) return; // retried on the next harvest (placeholder nodes may fill in later)
        seen.add(n);
        if (store.add(r)) added++;
      });
      return added;
    }

    harvest(root, section);
    progress('inicio');
    if (opts.expand !== false) {
      var ex = await expandAll(Object.assign({}, opts, {
        doc: root,
        onStep: function (s) { res.clicks = s.clicks; harvest(root, section); progress('clics'); }
      }));
      harvest(root, section);
      res.clicks = ex.clicks;
      res.complete = ex.complete;
      res.reason = ex.reason;
      var next = ex.nextUrl || (ex.complete ? findNextPageUrl(root, pageUrl) : null);
      if (next && !stop()) {
        progress('paginas');
        var pg = await followPages(next, Object.assign({}, opts, {
          onStep: function (s) { res.pages = s.pages; progress('paginas'); }
        }), function (d) { return harvest(d, section); });
        res.pages = pg.pages;
        res.clicks += pg.pages;
        res.complete = pg.complete;
        res.reason = pg.reason || res.reason;
      }
    } else {
      res.complete = !findLoadMore(root) && !findNextPageUrl(root, pageUrl);
      res.reason = res.complete ? 'no-more' : 'not-expanded';
    }

    var wantStars = typeof opts.stars === 'function' ? opts.stars() : !!opts.stars;
    if (wantStars && !stop() && isReviewsUrl(pageUrl)) {
      for (var i = 0; i < STARS.length && !stop(); i++) {
        progress('estrellas', { star: STARS[i], starName: STAR_NAMES[STARS[i]] });
        var before = store.size();
        var sp = await starPass(STARS[i], pageUrl, opts, function (d) { return harvest(d, 'main'); });
        sp.added = store.size() - before;
        res.starPasses.push(sp);
        res.clicks += sp.clicks || 0;
        progress('estrellas-fin', { star: STARS[i], starName: STAR_NAMES[STARS[i]], ok: sp.ok, added: sp.added, error: sp.error });
      }
    }

    var book = null;
    if (opts.meta !== false) {
      book = pageType(root) === 'product'
        ? mergeBook(parseProductPage(root, pageUrl), parseBookMeta(root, pageUrl))
        : parseBookMeta(root, pageUrl);
    }
    progress('fin');
    return {
      reviews: store.list(), book: book, clicks: res.clicks, complete: res.complete, pages: res.pages,
      reason: res.reason, starPasses: res.starPasses, pageUrl: pageUrl
    };
  }

  /* ------------------------------------------------------------------ export */

  function normalizeReview(r) {
    var out = {};
    REVIEW_KEYS.forEach(function (k) {
      var v = r ? r[k] : undefined;
      out[k] = v === undefined || v === '' ? null : v;
    });
    if (out.id == null) out.id = hashId([out.author, out.dateText, out.title, str(out.body).slice(0, 80)].join('|'));
    out.id = String(out.id);
    out.verified = !!out.verified;
    out.vine = !!out.vine;
    out.helpful = Math.max(0, parseInt(out.helpful, 10) || 0);
    out.images = Math.max(0, parseInt(out.images, 10) || 0);
    out.section = out.section || 'main';
    return out;
  }
  function toExport(data) {
    data = data || {};
    var book = normalizeBook(data.book);
    if (!book.asin && data.asin) book.asin = data.asin;
    return {
      schema: SCHEMA,
      exportedAt: data.exportedAt || new Date().toISOString(),
      tool: data.tool || ('marcador/' + VERSION),
      pageUrl: data.pageUrl || location.href,
      marketplace: data.marketplace || location.host,
      complete: !!data.complete,
      clicks: Math.max(0, parseInt(data.clicks, 10) || 0),
      book: book,
      reviews: dedupeReviews((data.reviews || []).map(normalizeReview)).map(normalizeReview)
    };
  }
  function fileNameFor(exp) {
    var a = exp && exp.book && exp.book.asin;
    return 'resenas-' + (a ? String(a).replace(/[^A-Za-z0-9_-]/g, '') : 'sin-asin') + '.json';
  }
  function downloadJSON(exp, name) {
    var fname = name || fileNameFor(exp);
    var blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = fname;
    a.rel = 'noopener';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) { /* ignore */ } removeEl(a); }, 5000);
    return fname;
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.setAttribute('style', 'position:fixed;left:-9999px;top:0;opacity:0;');
          (document.body || document.documentElement).appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          removeEl(ta);
          resolve(!!ok);
        } catch (e) {
          resolve(false);
        }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
        } else {
          fallback();
        }
      } catch (e) {
        fallback();
      }
    });
  }

  /* ------------------------------------------------------------------ sessionStorage cache */

  function saveMeta(asin, book) {
    if (!asin || !book) return;
    try { sessionStorage.setItem(META_PREFIX + asin, JSON.stringify({ savedAt: Date.now(), book: book })); } catch (e) { /* ignore */ }
  }
  function loadMeta(asin) {
    if (!asin) return null;
    try {
      var raw = sessionStorage.getItem(META_PREFIX + asin);
      var o = raw ? JSON.parse(raw) : null;
      return o && o.book ? o.book : null;
    } catch (e) {
      return null;
    }
  }
  function langPrefix() {
    var m = location.pathname.match(/^\/-\/[a-z]{2}(?:[_-][a-z]{2})?(?=\/)/i);
    return m ? m[0] : '';
  }
  // Fills price / formats / BSR from the product page (same-origin fetch), ignoring failures.
  async function enrichBook(book, opts) {
    var b = normalizeBook(book);
    if (!b.asin || (b.price && b.formats.length && b.bestSellersRank.length)) return b;
    try {
      var url = location.origin + langPrefix() + '/dp/' + b.asin;
      var d = await fetchDoc(url);
      if (detectBlock(d, docUrl(d))) return b;
      var meta = parseProductPage(d, docUrl(d));
      if (!meta.asin) meta.asin = b.asin;
      saveMeta(b.asin, meta);
      return mergeBook(meta, b);
    } catch (e) {
      return b;
    }
  }

  /* ------------------------------------------------------------------ UI panel */

  var PANEL_CSS = [
    ':host{all:initial}',
    '.box{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f1111;background:#fff;border:1px solid #d5d9d9;border-radius:12px;box-shadow:0 8px 28px rgba(15,17,17,.25);width:340px;max-width:calc(100vw - 32px);padding:12px 14px;box-sizing:border-box}',
    '.hd{display:flex;align-items:center;gap:8px;margin-bottom:6px}',
    '.tt{font-weight:700;font-size:14px;flex:1}',
    '.ver{color:#565959;font-size:11px}',
    '.x{border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#565959;padding:2px 6px}',
    '.st{margin:6px 0;padding:8px 10px;border-radius:8px;background:#eef6ff}',
    '.st.warn{background:#fff6e0}.st.error{background:#fdecea}.st.ok{background:#e9f7ee}',
    '.ct{font-variant-numeric:tabular-nums;margin:6px 0}',
    '.ct b{font-size:15px}',
    'label{display:flex;gap:6px;align-items:flex-start;margin:8px 0;cursor:pointer}',
    '.bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    'button.b{font:inherit;border:1px solid #d5d9d9;background:#fff;color:#0f1111;border-radius:8px;padding:6px 10px;cursor:pointer}',
    'button.b.pri{background:#ffd814;border-color:#fcd200}',
    'button.b:disabled{opacity:.45;cursor:default}',
    'ul{list-style:none;margin:8px 0 0;padding:0;max-height:120px;overflow:auto;font-size:12px;color:#565959}',
    'li{padding:2px 0;border-top:1px dashed #e3e6e6}',
    '@media (prefers-color-scheme: dark){.box{background:#1f2326;color:#eef1f3;border-color:#3a4046}',
    '.st{background:#1e3246}.st.warn{background:#3d3218}.st.error{background:#4a2020}.st.ok{background:#1d3a28}',
    'button.b{background:#2b3035;color:#eef1f3;border-color:#4a5056}button.b.pri{background:#f0c14b;color:#111;border-color:#f0c14b}',
    'ul,.ver,.x{color:#b8c0c6}li{border-color:#3a4046}}'
  ].join('');

  function h(tag, props, kids) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') el.textContent = props[k];
      else if (k === 'className') el.className = props[k];
      else el.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function silentUI() {
    var noop = function () {};
    var stars = false;
    return {
      status: noop, counts: noop, log: noop, running: noop, canExport: noop, onStop: noop, onDownload: noop,
      onCopy: noop, show: noop, remove: noop,
      starsChecked: function () { return stars; }, setStars: function (v) { stars = !!v; }
    };
  }
  function createPanel() {
    removeEl(document.getElementById(PANEL_ID));
    var host = document.createElement('div');
    host.id = PANEL_ID;
    host.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;');
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = PANEL_CSS;
    var status = h('div', { className: 'st', role: 'status', 'aria-live': 'polite', text: 'Preparando…' });
    var nRev = h('b', { text: '0' });
    var nClk = h('b', { text: '0' });
    var chk = h('input', { type: 'checkbox' });
    var bStop = h('button', { className: 'b', type: 'button', text: 'Detener' });
    var bDown = h('button', { className: 'b pri', type: 'button', text: 'Descargar JSON' });
    var bCopy = h('button', { className: 'b', type: 'button', text: 'Copiar JSON' });
    var bClose = h('button', { className: 'x', type: 'button', 'aria-label': 'Cerrar', title: 'Cerrar (la extracción sigue)', text: '×' });
    var list = h('ul');
    var box = h('div', { className: 'box', role: 'dialog', 'aria-label': 'Extractor de reseñas KDP' }, [
      h('div', { className: 'hd' }, [h('span', { className: 'tt', text: '📥 Extractor de reseñas KDP' }), h('span', { className: 'ver', text: 'v' + VERSION }), bClose]),
      status,
      h('div', { className: 'ct' }, ['Reseñas cargadas: ', nRev, ' · Clics: ', nClk]),
      h('label', null, [chk, h('span', { text: 'Recorrer también los filtros por estrellas (más completo)' })]),
      h('div', { className: 'bt' }, [bStop, bDown, bCopy]),
      list
    ]);
    root.appendChild(style);
    root.appendChild(box);
    (document.body || document.documentElement).appendChild(host);
    bClose.addEventListener('click', function () { host.style.display = 'none'; });
    chk.addEventListener('change', function () {
      try { localStorage.setItem(PREF_STARS, chk.checked ? '1' : '0'); } catch (e) { /* ignore */ }
    });
    bDown.disabled = true;
    bCopy.disabled = true;
    return {
      status: function (msg, kind) { status.textContent = msg; status.className = 'st' + (kind ? ' ' + kind : ''); },
      counts: function (n, c) { if (n != null) nRev.textContent = String(n); if (c != null) nClk.textContent = String(c); },
      log: function (msg) {
        list.insertBefore(h('li', { text: msg }), list.firstChild);
        while (list.children.length > 8) list.removeChild(list.lastChild);
      },
      running: function (on) { bStop.disabled = !on; },
      canExport: function (on) { bDown.disabled = !on; bCopy.disabled = !on; },
      onStop: function (fn) { bStop.addEventListener('click', fn); },
      onDownload: function (fn) { bDown.addEventListener('click', fn); },
      onCopy: function (fn) { bCopy.addEventListener('click', fn); },
      starsChecked: function () { return !!chk.checked; },
      setStars: function (v) { chk.checked = !!v; },
      show: function () { host.style.display = ''; },
      remove: function () { removeEl(host); }
    };
  }

  /* ------------------------------------------------------------------ run (bookmarklet flow) */

  var state = { running: false, stop: false, store: null, clicks: 0, asin: null, panel: null, lastExport: null };

  function readStarsPref() {
    try { return localStorage.getItem(PREF_STARS) === '1'; } catch (e) { return false; }
  }
  function globalOptions() {
    var o = window.KDPX_OPTIONS;
    return o && typeof o === 'object' ? o : {};
  }
  function reasonText(reason) {
    switch (reason) {
      case 'no-growth': return 'Amazon dejó de cargar más reseñas (el botón no respondió). Puede faltar alguna: vuelve a pulsar el marcador más tarde.';
      case 'max-clicks': return 'Se alcanzó el límite de seguridad de clics; puede haber más reseñas.';
      case 'fetch-error': return 'No se pudo leer alguna página siguiente de reseñas.';
      case 'login': return 'Amazon pidió iniciar sesión a mitad de camino.';
      case 'captcha': return 'Amazon mostró un captcha a mitad de camino.';
      default: return 'No se pudo confirmar que se cargaron todas las reseñas.';
    }
  }
  function snapshotExport() {
    if (!state.store || !state.store.size()) return state.lastExport;
    var asin = state.asin || asinFromDoc(document);
    var page = pageType(document) === 'product' ? parseProductPage(document) : parseBookMeta(document);
    return toExport({ book: mergeBook(loadMeta(asin), page), reviews: state.store.list(), clicks: state.clicks, complete: false });
  }

  async function run(opts) {
    opts = Object.assign({}, globalOptions(), opts || {});
    if (state.running) {
      if (state.panel) state.panel.show();
      return { status: 'busy' };
    }
    state.running = true;
    state.stop = false;
    state.store = null;
    state.clicks = 0;
    state.lastExport = null;
    var T = timing(opts);
    var ui = opts.ui === false ? silentUI() : createPanel();
    state.panel = ui;
    ui.setStars(typeof opts.stars === 'boolean' ? opts.stars : readStarsPref());
    ui.running(true);
    ui.onStop(function () {
      state.stop = true;
      ui.status('Deteniendo… (termina el paso en curso)', 'warn');
    });
    ui.onDownload(function () {
      var exp = state.lastExport || snapshotExport();
      if (exp) ui.log('Descargado: ' + downloadJSON(exp));
    });
    ui.onCopy(function () {
      var exp = state.lastExport || snapshotExport();
      if (!exp) return;
      copyText(JSON.stringify(exp, null, 2)).then(function (ok) {
        ui.log(ok ? 'JSON copiado al portapapeles.' : 'No se pudo copiar; usa «Descargar JSON».');
      });
    });
    var shouldStop = function () { return state.stop; };
    try {
      ui.status('Analizando la página…');
      var type = pageType(document);
      if (type === 'login' || type === 'captcha') {
        ui.status(BLOCK_MSG[type], 'warn');
        return { status: type };
      }
      if (type === 'other') {
        ui.status('Esta página no parece la ficha de un libro ni su página de reseñas en Amazon. Abre el libro en Amazon y vuelve a pulsar el marcador.', 'warn');
        return { status: 'unsupported' };
      }
      var asin = asinFromDoc(document);
      var section = 'main';
      if (type === 'product') {
        var meta = parseProductPage(document);
        asin = meta.asin || asin;
        saveMeta(asin, meta);
        var see = findSeeAllReviews(document);
        if (see && see.href) {
          ui.status('He guardado los datos del libro (precio, formatos, ranking). Abro ahora la página con todas las reseñas: cuando termine de cargar, pulsa otra vez el marcador «Extraer reseñas KDP».', 'ok');
          ui.running(false);
          setTimeout(function () { location.assign(see.href); }, T.navigateDelay);
          return { status: 'navigating', url: see.href, book: meta };
        }
        section = 'product-page';
        if (see && see.el) {
          ui.log('Pulsando «Ver más reseñas»…');
          activate(see.el);
          await sleep(T.settle * 3);
        }
      } else {
        // A reviews page that only offers a link to the full list: go there first.
        var link = findSeeAllReviews(document);
        if (link && link.href && !findLoadMore(document) && stripHash(link.href) !== stripHash(location.href) && isReviewsUrl(link.href)) {
          ui.status('Abro la lista completa de reseñas: cuando termine de cargar, pulsa otra vez el marcador «Extraer reseñas KDP».', 'ok');
          ui.running(false);
          setTimeout(function () { location.assign(link.href); }, T.navigateDelay);
          return { status: 'navigating', url: link.href };
        }
      }
      state.asin = asin;
      state.store = createStore();
      ui.status('Cargando reseñas… (pulsando «Mostrar más» hasta que no quede ninguna)');
      var result = await collect(Object.assign({}, opts, {
        doc: document,
        store: state.store,
        section: section,
        shouldStop: shouldStop,
        stars: function () { return ui.starsChecked(); },
        onProgress: function (p) {
          state.clicks = p.clicks;
          ui.counts(p.count, p.clicks);
          if (p.count) ui.canExport(true);
          if (p.phase === 'paginas') ui.status('Leyendo las páginas siguientes de reseñas… (' + p.pages + ')');
          if (p.phase === 'estrellas') ui.status('Recorriendo el filtro «' + p.starName + '»…');
          if (p.phase === 'estrellas-fin') ui.log(p.ok ? ('Filtro ' + p.starName + ': +' + p.added + ' reseñas nuevas') : ('Filtro ' + p.starName + ' omitido: ' + p.error));
        }
      }));
      var book = mergeBook(loadMeta(asin || (result.book && result.book.asin)), result.book);
      if (!book.asin) book.asin = asin;
      if (!state.stop && opts.enrich !== false) {
        ui.status('Completando datos del libro (precio, formatos, ranking)…');
        book = await enrichBook(book, opts);
      }
      if (!state.stop && opts.coverData !== false && book.cover && !book.coverData) {
        ui.status('Guardando una miniatura de la portada…');
        book.coverData = await fetchCoverData(book.cover, T.coverTimeout);
      }
      var exp = toExport({ book: book, reviews: result.reviews, clicks: result.clicks, complete: result.complete && !state.stop });
      state.lastExport = exp;
      api.lastExport = exp;
      ui.counts(exp.reviews.length, exp.clicks);
      ui.canExport(true);
      if (state.stop) {
        ui.status('Detenido. Tienes ' + exp.reviews.length + ' reseñas: pulsa «Descargar JSON» o «Copiar JSON» para guardarlas.', 'warn');
        return { status: 'stopped', data: exp };
      }
      var fname = fileNameFor(exp);
      if (opts.download !== false) downloadJSON(exp, fname);
      if (exp.complete) {
        ui.status('¡Listo! ' + exp.reviews.length + ' reseñas extraídas' + (opts.download !== false ? '. Se ha descargado «' + fname + '».' : '.'), 'ok');
      } else {
        ui.status('Terminado con avisos: ' + reasonText(result.reason) + ' Se han guardado ' + exp.reviews.length + ' reseñas' + (opts.download !== false ? ' en «' + fname + '».' : '.'), 'warn');
      }
      return { status: 'done', data: exp };
    } catch (err) {
      ui.status('Error inesperado: ' + str(err && err.message ? err.message : err) + '. Puedes volver a intentarlo o usar «Copiar JSON» con lo recogido.', 'error');
      return { status: 'error', error: str(err && err.message ? err.message : err) };
    } finally {
      state.running = false;
      ui.running(false);
    }
  }

  // "Ver más reseñas" / "See more reviews" on a product page. href is null for in-page expanders.
  function findSeeAllReviews(root) {
    root = root || document;
    var doc = docOf(root);
    var el = pick(root, ['a[data-hook="see-all-reviews-link-foot"]', 'a[data-hook="see-all-reviews-link"]', 'a[data-hook="cr-see-all-reviews-link"]']);
    if (!el) {
      el = qa(root, 'a, button, [role="button"], span.a-button').filter(function (x) {
        var t = controlText(x);
        return t && t.length < 60 && /^(?:ver|mostrar) (?:todas las |mas )?(?:resenas|opiniones)|^see (?:all|more) (?:customer )?reviews/.test(t) && isVisible(x);
      })[0];
    }
    if (!el) return null;
    var a = closest(clickTarget(el), 'a[href]');
    return { el: el, href: a ? navigatingHref(a, doc) : null };
  }

  /* ------------------------------------------------------------------ public API */

  var api = {
    version: VERSION,
    schema: SCHEMA,
    parseReviews: parseReviews,
    parseBookMeta: parseBookMeta,
    parseProductPage: parseProductPage,
    findLoadMore: findLoadMore,
    expandAll: expandAll,
    collect: collect,
    toExport: toExport,
    run: run,
    // helpers used by extractor/scrape.mjs and the tests
    detectBlock: detectBlock,
    pageType: pageType,
    findSeeAllReviews: findSeeAllReviews,
    findNextPageUrl: findNextPageUrl,
    mergeBook: mergeBook,
    dedupeReviews: dedupeReviews,
    asinFromUrl: asinFromUrl,
    download: downloadJSON,
    coverData: fetchCoverData,
    stop: function () { state.stop = true; },
    showPanel: function () { if (state.panel) state.panel.show(); },
    lastExport: null,
    utils: {
      parseDate: parseDate, parseCountry: parseCountry, parseHelpful: parseHelpful, toAmount: toAmount,
      detectCurrency: detectCurrency, parseBSR: parseBSR, splitTitle: splitTitle, hashId: hashId,
      toInt: toInt, toRating: toRating, withStarFilter: withStarFilter, thumbUrl: thumbUrl
    },
    _state: state
  };

  window.KDPExtractor = api;

  if (window.KDPX_NO_AUTORUN !== true) {
    run().catch(function () { /* errors are shown in the panel */ });
  }
})();
void 0;
