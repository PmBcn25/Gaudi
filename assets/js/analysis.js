/*
 * Motor de análisis de reseñas y de mercado.
 *
 * Funciona igual en el navegador (window.KDPAnalysis) y en Node (tests y
 * tools/build-data.mjs). Necesita que antes se haya cargado lexicon.js.
 * No inventa datos: todo lo que devuelve sale de los libros y reseñas que
 * recibe; si falta información, el resultado lo indica con null.
 */
(function (root, factory) {
  var api = factory(root.KDP_LEXICON);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KDPAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LEX) {
  'use strict';
  if (!LEX) throw new Error('Falta lexicon.js: cárgalo antes que analysis.js');

  var DAY = 86400000;

  // ---------------------------------------------------------------- texto

  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'")
      .replace(/[^a-z0-9'\s-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function compileWords(words) {
    var parts = words.map(function (w) {
      var n = normalize(w.replace(/\*$/, ''));
      var star = /\*$/.test(w);
      var body = n.split(' ').map(escapeRe).join('\\s+');
      return body + (star ? "[a-z0-9']*" : '');
    });
    return new RegExp('\\b(?:' + parts.join('|') + ')(?![a-z0-9])', 'g');
  }

  var THEMES = LEX.themes.map(function (t) {
    return { id: t.id, label: t.label, short: t.short || t.label, re: compileWords(t.words) };
  });
  var THEME_BY_ID = {};
  THEMES.forEach(function (t) { THEME_BY_ID[t.id] = t; });
  var NEG_RE = compileWords(LEX.negativeCues);
  var WISH_RE = compileWords(LEX.wishCues);
  var CONTRAST_RE = compileWords(LEX.contrastMarkers);
  var POS_RE = compileWords(LEX.positiveCues || []);
  var STOP = {};
  LEX.stopwords.forEach(function (w) { STOP[normalize(w)] = true; });

  function test(re, text) { re.lastIndex = 0; return re.test(text); }

  function themesIn(normText) {
    var out = [];
    for (var i = 0; i < THEMES.length; i++) if (test(THEMES[i].re, normText)) out.push(THEMES[i].id);
    return out;
  }

  function splitSentences(text) {
    return String(text || '')
      .replace(/\s*\n+\s*/g, '. ')
      .split(/(?<=[.!?¡¿;:])\s+(?=[^a-z])|(?<=[.!?])\s+/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length >= 12; });
  }

  var ES_HINTS = /\b(el|la|los|las|que|de|del|es|muy|pero|libro|con|para|una|por|como|mas)\b/g;
  var EN_HINTS = /\b(the|and|is|very|but|book|with|for|this|was|of|it|to|as|more)\b/g;

  function detectLang(text) {
    var n = normalize(text);
    if (!n) return null;
    var es = (n.match(ES_HINTS) || []).length;
    var en = (n.match(EN_HINTS) || []).length;
    if (es === 0 && en === 0) return 'otro';
    if (es >= en * 1.3) return 'es';
    if (en >= es * 1.3) return 'en';
    return es > en ? 'es' : 'en';
  }

  function polarity(rating) {
    if (rating == null || isNaN(rating)) return null;
    if (rating >= 4) return 'pos';
    if (rating <= 2) return 'neg';
    return 'neu';
  }

  // Clasifica una frase: 'praise' (elogio), 'complaint' (queja), 'wish' (deseo/carencia) o 'neutral'.
  function sentenceKind(normSentence, rating) {
    if (test(WISH_RE, normSentence)) return 'wish';
    var neg = test(NEG_RE, normSentence);
    if (rating == null) return neg ? 'complaint' : 'neutral';
    if (rating <= 2) return 'complaint';
    if (rating < 4) {
      return neg || test(CONTRAST_RE, normSentence) ? 'complaint' : 'neutral';
    }
    if (neg) return 'complaint';
    CONTRAST_RE.lastIndex = 0;
    var m = CONTRAST_RE.exec(normSentence);
    if (m && test(NEG_RE, normSentence.slice(m.index))) return 'complaint';
    return 'praise';
  }

  // ------------------------------------------------------------- reseñas

  function toInt(v) {
    if (v == null || v === '') return 0;
    var n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function toRating(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return null;
    n = Math.round(n);
    return n >= 1 && n <= 5 ? n : null;
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'h' + (h >>> 0).toString(36);
  }

  function normalizeReview(r, asin) {
    r = r || {};
    var body = String(r.body || r.text || r.content || '').replace(/\r/g, '').trim();
    var title = r.title == null ? null : String(r.title).trim() || null;
    var date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
    var out = {
      id: r.id ? String(r.id) : hashString([r.author, r.dateText || r.date, title, body.slice(0, 80)].join('|')),
      asin: asin || r.asin || null,
      author: r.author ? String(r.author).trim() : null,
      rating: toRating(r.rating),
      title: title,
      body: body,
      date: date,
      dateText: r.dateText || null,
      country: r.country || null,
      verified: !!r.verified,
      vine: !!r.vine,
      format: r.format || null,
      helpful: toInt(r.helpful),
      images: toInt(r.images),
      section: r.section || null
    };
    return out;
  }

  // Divide una frase en "antes" y "después" del primer conector de contraste
  // ("las fotos son preciosas, pero el libro es pequeño"), para atribuir el
  // elogio y la queja al tema correcto.
  function clauses(normSentence) {
    CONTRAST_RE.lastIndex = 0;
    var m = CONTRAST_RE.exec(normSentence);
    if (m && m.index > 0) return [normSentence.slice(0, m.index), normSentence.slice(m.index)];
    return [normSentence];
  }

  var RANK = { neutral: 0, praise: 1, complaint: 2, wish: 3 };

  // Analiza una reseña: temas, frases clasificadas, idioma y polaridad.
  function analyzeReview(r) {
    var rating = r.rating;
    var sentences = [];
    var themeSet = {};
    var parts = [];
    if (r.title) parts.push(r.title.replace(/[.!?]*$/, '.'));
    splitSentences(r.body).forEach(function (s) { parts.push(s); });
    parts.forEach(function (s, idx) {
      var segs = clauses(normalize(s)).map(function (c, i) {
        var kind = sentenceKind(c, rating);
        if (i > 0) {
          // Lo que sigue a un "pero" suele ser la pega: en 3★ siempre; en 4-5★
          // cuando es breve ("pero pequeño") y no contiene un elogio claro.
          if (rating === 3 && kind === 'neutral') kind = 'complaint';
          if (kind === 'praise' && c.split(' ').length <= 6 && !test(POS_RE, c)) kind = 'complaint';
        }
        return { themes: themesIn(c), kind: kind };
      });
      var th = [], kind = 'neutral';
      segs.forEach(function (g) {
        g.themes.forEach(function (id) { themeSet[id] = true; if (th.indexOf(id) < 0) th.push(id); });
        if (RANK[g.kind] > RANK[kind]) kind = g.kind;
      });
      sentences.push({ text: s, themes: th, kind: kind, segs: segs, isTitle: idx === 0 && !!r.title });
    });
    var themes = Object.keys(themeSet);
    return {
      review: r,
      themes: themes,
      sentences: sentences,
      polarity: polarity(rating),
      lang: detectLang((r.title || '') + ' ' + r.body),
      length: r.body.length,
      hasWish: sentences.some(function (s) { return s.kind === 'wish'; }),
      hasComplaint: sentences.some(function (s) { return s.kind === 'complaint'; })
    };
  }

  // ------------------------------------------------------------ utilidades

  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function round(x, d) { if (x == null || isNaN(x)) return null; var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
  function parseDate(s) { if (!s) return null; var t = Date.parse(s); return isNaN(t) ? null : t; }
  function yearsBetween(a, b) { return (b - a) / (365.25 * DAY); }

  // ------------------------------------------------------------ por libro

  function bookStats(book, reviews, opts) {
    opts = opts || {};
    var now = opts.now ? parseDate(opts.now) : Date.now();
    var analyzed = (reviews || []).map(function (r) { return r.__a || analyzeReview(r); });
    var n = analyzed.length;
    var dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var rated = 0, sum = 0, verified = 0, withImages = 0, helpfulTotal = 0, lens = [];
    var years = {}, langs = {}, countries = {}, dates = [];
    analyzed.forEach(function (a) {
      var r = a.review;
      if (r.rating) { dist[r.rating]++; rated++; sum += r.rating; }
      if (r.verified) verified++;
      if (r.images) withImages++;
      helpfulTotal += r.helpful || 0;
      lens.push(a.length);
      if (r.date) { var y = r.date.slice(0, 4); years[y] = (years[y] || 0) + 1; dates.push(r.date); }
      if (a.lang) langs[a.lang] = (langs[a.lang] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });
    dates.sort();
    var last12 = dates.filter(function (d) { return now - parseDate(d) <= 365 * DAY; }).length;
    var pos = dist[4] + dist[5], neg = dist[1] + dist[2], neu = dist[3];
    var sortHelpful = function (x, y) {
      return (y.review.helpful - x.review.helpful) || (y.length - x.length);
    };
    var positives = analyzed.filter(function (a) { return a.polarity === 'pos'; }).sort(sortHelpful);
    var negatives = analyzed.filter(function (a) { return a.polarity === 'neg'; }).sort(sortHelpful);
    var themeStatsForBook = themeStats(analyzed, { examples: 2 });
    return {
      asin: book && book.asin,
      extracted: n,
      rated: rated,
      avg: rated ? round(sum / rated, 2) : null,
      dist: dist,
      pctPos: rated ? round(pos / rated * 100, 1) : null,
      pctNeu: rated ? round(neu / rated * 100, 1) : null,
      pctNeg: rated ? round(neg / rated * 100, 1) : null,
      pctCritical: rated ? round((neg + neu) / rated * 100, 1) : null,
      verifiedPct: n ? round(verified / n * 100, 1) : null,
      withImages: withImages,
      helpfulTotal: helpfulTotal,
      avgLength: n ? Math.round(mean(lens)) : null,
      medianLength: n ? Math.round(median(lens)) : null,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      last12m: last12,
      perYear: years,
      langs: langs,
      countries: countries,
      wishes: analyzed.filter(function (a) { return a.hasWish; }).length,
      topPositive: positives.slice(0, 3).map(function (a) { return a.review; }),
      topNegative: negatives.slice(0, 3).map(function (a) { return a.review; }),
      themes: themeStatsForBook
    };
  }

  // ------------------------------------------------------------ por tema

  function clip(s, max) {
    s = String(s || '').trim();
    return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
  }

  function themeStats(analyzed, opts) {
    opts = opts || {};
    var maxEx = opts.examples == null ? 4 : opts.examples;
    var total = analyzed.length;
    var acc = {};
    THEMES.forEach(function (t) {
      acc[t.id] = { id: t.id, label: t.label, short: t.short, mentions: 0, pos: 0, neu: 0, neg: 0, ratingSum: 0,
        rated: 0, praise: 0, complaint: 0, wish: 0, byBook: {},
        ex: { praise: [], complaint: [], wish: [] } };
    });
    analyzed.forEach(function (a) {
      var r = a.review;
      a.themes.forEach(function (id) {
        var t = acc[id];
        t.mentions++;
        if (a.polarity) t[a.polarity]++;
        if (r.rating) { t.ratingSum += r.rating; t.rated++; }
        if (r.asin) t.byBook[r.asin] = (t.byBook[r.asin] || 0) + 1;
      });
      var seen = {};
      a.sentences.forEach(function (s) {
        (s.segs || [{ themes: s.themes, kind: s.kind }]).forEach(function (g) {
          if (g.kind === 'neutral') return;
          g.themes.forEach(function (id) {
            var key = id + ':' + g.kind;
            if (seen[key]) return; // una vez por reseña y tipo
            seen[key] = true;
            var t = acc[id];
            t[g.kind]++;
            t.ex[g.kind].push({ text: clip(s.text, 240), rating: r.rating, helpful: r.helpful || 0,
              asin: r.asin, reviewId: r.id, author: r.author });
          });
        });
      });
    });
    var list = Object.keys(acc).map(function (id) {
      var t = acc[id];
      ['praise', 'complaint', 'wish'].forEach(function (k) {
        t.ex[k].sort(function (x, y) {
          return (y.helpful - x.helpful) || (Math.abs(x.text.length - 140) - Math.abs(y.text.length - 140));
        });
        var uniq = {};
        t.ex[k] = t.ex[k].filter(function (e) {
          var key = normalize(e.text).slice(0, 60);
          if (uniq[key]) return false;
          uniq[key] = true;
          return true;
        }).slice(0, maxEx);
      });
      return {
        id: t.id, label: t.label, short: t.short,
        mentions: t.mentions,
        share: total ? round(t.mentions / total * 100, 1) : 0,
        pos: t.pos, neu: t.neu, neg: t.neg,
        avgRating: t.rated ? round(t.ratingSum / t.rated, 2) : null,
        praise: t.praise, complaint: t.complaint, wish: t.wish,
        pain: t.complaint + t.wish,
        net: t.mentions ? round((t.praise - t.complaint - t.wish) / t.mentions, 2) : null,
        byBook: t.byBook,
        examples: t.ex
      };
    });
    return list.sort(function (x, y) { return y.mentions - x.mentions; });
  }

  // ------------------------------------------- términos distintivos (log-odds)

  function tokens(normText) {
    return normText.split(/[\s'-]+/).filter(function (w) {
      return w.length >= 3 && !STOP[w] && !/^\d+$/.test(w);
    });
  }

  function distinctiveTerms(analyzed, opts) {
    opts = opts || {};
    var top = opts.top || 15;
    var cA = {}, cB = {}, nA = 0, nB = 0, all = {}, nAll = 0;
    analyzed.forEach(function (a) {
      if (!a.polarity) return;
      var critical = a.polarity !== 'pos';
      var toks = tokens(normalize((a.review.title || '') + ' ' + a.review.body));
      var grams = toks.slice();
      for (var i = 0; i + 1 < toks.length; i++) grams.push(toks[i] + ' ' + toks[i + 1]);
      var seen = {};
      grams.forEach(function (g) {
        if (seen[g]) return; // frecuencia documental: una vez por reseña
        seen[g] = true;
        all[g] = (all[g] || 0) + 1; nAll++;
        if (critical) { cA[g] = (cA[g] || 0) + 1; nA++; } else { cB[g] = (cB[g] || 0) + 1; nB++; }
      });
    });
    if (!nA || !nB) return { critical: [], positive: [] };
    var a0 = 200;
    var scored = Object.keys(all).map(function (g) {
      var yA = cA[g] || 0, yB = cB[g] || 0;
      var aw = a0 * all[g] / nAll;
      var d = Math.log((yA + aw) / (nA + a0 - yA - aw)) - Math.log((yB + aw) / (nB + a0 - yB - aw));
      var v = 1 / (yA + aw) + 1 / (yB + aw);
      return { term: g, z: d / Math.sqrt(v), critical: yA, positive: yB };
    });
    var minCount = opts.minCount || 2;
    return {
      critical: scored.filter(function (s) { return s.critical >= minCount && s.z > 0; })
        .sort(function (x, y) { return y.z - x.z; }).slice(0, top),
      positive: scored.filter(function (s) { return s.positive >= minCount && s.z < 0; })
        .sort(function (x, y) { return x.z - y.z; }).slice(0, top)
    };
  }

  // ------------------------------------------------------------- mercado

  function priceOf(book, kind) {
    var list = book.prices || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var isKindle = /kindle|digital|ebook/i.test(p.format || '');
      if (kind === 'kindle' ? isKindle : !isKindle) if (p.amount != null) return p.amount;
    }
    if (book.price && book.price.amount != null) {
      var k = /kindle|digital|ebook/i.test(book.price.format || book.format || '');
      if (kind === 'kindle' ? k : !k) return book.price.amount;
    }
    return null;
  }

  function marketStats(books, reviewsByAsin, opts) {
    opts = opts || {};
    var now = opts.now ? parseDate(opts.now) : Date.now();
    var withRatings = books.filter(function (b) { return b.ratingsTotal != null; });
    var totalRatings = withRatings.reduce(function (s, b) { return s + b.ratingsTotal; }, 0);
    var weighted = withRatings.filter(function (b) { return b.rating != null; });
    var wSum = weighted.reduce(function (s, b) { return s + b.ratingsTotal; }, 0);
    var wAvg = wSum ? weighted.reduce(function (s, b) { return s + b.rating * b.ratingsTotal; }, 0) / wSum : null;
    var maxBook = withRatings.slice().sort(function (x, y) { return y.ratingsTotal - x.ratingsTotal; })[0] || null;
    var printPrices = books.map(function (b) { return priceOf(b, 'print'); }).filter(function (p) { return p != null; });
    var kindlePrices = books.map(function (b) { return priceOf(b, 'kindle'); }).filter(function (p) { return p != null; });
    var ages = books.map(function (b) {
      var t = parseDate(b.publicationDate);
      return t == null ? null : yearsBetween(t, now);
    }).filter(function (x) { return x != null; });
    var allReviews = [];
    books.forEach(function (b) { (reviewsByAsin[b.asin] || []).forEach(function (r) { allReviews.push(r); }); });
    var rated = allReviews.filter(function (r) { return r.rating; });
    var crit = rated.filter(function (r) { return r.rating <= 3; }).length;
    var byType = {};
    books.forEach(function (b) { var k = b.publisherType || 'desconocido'; byType[k] = (byType[k] || 0) + 1; });
    var langs = {};
    books.forEach(function (b) { var k = b.language || 'desconocido'; langs[k] = (langs[k] || 0) + 1; });
    // % de valoraciones críticas (1-3★) a partir de los histogramas de Amazon
    var histW = 0, histCrit = 0;
    books.forEach(function (b) {
      if (b.histogram && b.ratingsTotal) {
        var c = (b.histogram['1'] || 0) + (b.histogram['2'] || 0) + (b.histogram['3'] || 0);
        histCrit += c / 100 * b.ratingsTotal; histW += b.ratingsTotal;
      }
    });
    return {
      books: books.length,
      booksWithRatings: withRatings.length,
      totalRatings: totalRatings,
      avgRatingWeighted: round(wAvg, 2),
      topBook: maxBook ? { asin: maxBook.asin, title: maxBook.title, ratings: maxBook.ratingsTotal,
        share: totalRatings ? round(maxBook.ratingsTotal / totalRatings * 100, 1) : null } : null,
      printPrice: { min: printPrices.length ? Math.min.apply(null, printPrices) : null,
        median: round(median(printPrices), 2), max: printPrices.length ? Math.max.apply(null, printPrices) : null,
        n: printPrices.length },
      kindlePrice: { min: kindlePrices.length ? Math.min.apply(null, kindlePrices) : null,
        median: round(median(kindlePrices), 2), max: kindlePrices.length ? Math.max.apply(null, kindlePrices) : null,
        n: kindlePrices.length },
      ageYears: { median: round(median(ages), 1), older5: ages.filter(function (a) { return a >= 5; }).length,
        newer1: ages.filter(function (a) { return a < 1; }).length, n: ages.length },
      publisherTypes: byType,
      languages: langs,
      reviewsExtracted: allReviews.length,
      pctCriticalReviews: rated.length ? round(crit / rated.length * 100, 1) : null,
      pctCriticalRatings: histW ? round(histCrit / histW * 100, 1) : null
    };
  }

  // --------------------------------------------------- puntuación del nicho

  var WEIGHTS = { demanda: 0.30, competencia: 0.20, hueco: 0.20, actualidad: 0.15, precio: 0.10, indie: 0.05 };

  function nicheScore(books, market, analyzed, opts) {
    opts = opts || {};
    var now = opts.now ? parseDate(opts.now) : Date.now();
    var parts = [];
    var fromAmazon = books.filter(function (b) { return b.ratingsTotal != null && b.metaSource === 'amazon'; }).length;
    var confRatings = fromAmazon >= Math.min(5, books.length) ? 'alta'
      : market.booksWithRatings >= 3 ? 'media' : 'baja';
    var fmt = function (n) { return n == null ? '—' : Number(n).toLocaleString('es-ES'); };

    // 1. Demanda
    if (market.booksWithRatings) {
      var T = market.totalRatings;
      var s = clamp01((Math.log10(T + 1) - 1.5) / (3.7 - 1.5));
      var detail = fmt(T) + ' valoraciones sumadas en ' + market.booksWithRatings + ' libros con dato.';
      var dated = analyzed.filter(function (a) { return a.review.date; });
      if (dated.length >= 10) {
        var recent = dated.filter(function (a) { return now - parseDate(a.review.date) <= 730 * DAY; }).length;
        var rate = recent / dated.length;
        s = clamp01(s * 0.8 + rate * 0.4);
        detail += ' El ' + Math.round(rate * 100) + ' % de las reseñas con fecha son de los últimos 2 años.';
      }
      parts.push({ id: 'demanda', label: 'Demanda', score: Math.round(s * 100), weight: WEIGHTS.demanda,
        confidence: confRatings, detail: detail,
        help: 'Más valoraciones y reseñas recientes indican lectores comprando ahora.' });
    } else {
      parts.push({ id: 'demanda', label: 'Demanda', score: null, weight: WEIGHTS.demanda, confidence: 'sin datos',
        detail: 'Faltan las valoraciones totales de Amazon.', help: '' });
    }

    // 2. Competencia (más alto = más fácil entrar)
    if (market.topBook) {
      // Editoriales grandes cuentan entero; las especializadas (venden en la tienda del templo), al 60 %.
      var big = ((market.publisherTypes.grande || 0) + 0.6 * (market.publisherTypes.especializada || 0)) /
        Math.max(1, market.books);
      var strength = 0.45 * clamp01((Math.log10(market.topBook.ratings + 1) - 1.5) / (3.7 - 1.5)) +
        0.35 * big + 0.20 * clamp01(((market.avgRatingWeighted || 4.4) - 4.0) / 0.8);
      parts.push({ id: 'competencia', label: 'Competencia', score: Math.round((1 - strength) * 100),
        weight: WEIGHTS.competencia, confidence: confRatings,
        detail: 'Líder con ' + fmt(market.topBook.ratings) + ' valoraciones; ' + Math.round(big * 100) +
          ' % de peso de editoriales grandes o especializadas; nota media ponderada ' + (market.avgRatingWeighted || '—') + '.',
        help: 'Puntuación alta = competencia más débil o más fácil de superar.' });
    } else {
      parts.push({ id: 'competencia', label: 'Competencia', score: null, weight: WEIGHTS.competencia,
        confidence: 'sin datos', detail: 'Faltan valoraciones para medir a los líderes.', help: '' });
    }

    // 3. Hueco / insatisfacción
    var rated = analyzed.filter(function (a) { return a.review.rating; });
    if (rated.length >= 15) {
      var crit = rated.filter(function (a) { return a.review.rating <= 3; }).length / rated.length;
      var pos = rated.filter(function (a) { return a.review.rating >= 4; });
      var wishRate = pos.length ? pos.filter(function (a) { return a.hasWish || a.hasComplaint; }).length / pos.length : 0;
      var g = clamp01(crit / 0.30) * 0.6 + clamp01(wishRate / 0.35) * 0.4;
      parts.push({ id: 'hueco', label: 'Hueco por cubrir', score: Math.round(g * 100), weight: WEIGHTS.hueco,
        confidence: rated.length >= 100 ? 'alta' : 'media',
        detail: Math.round(crit * 100) + ' % de reseñas de 1-3★ y ' + Math.round(wishRate * 100) +
          ' % de reseñas positivas con alguna pega o deseo (' + rated.length + ' reseñas).',
        help: 'Insatisfacción y deseos no cubiertos = espacio para un libro mejor.' });
    } else if (market.pctCriticalRatings != null) {
      var c2 = market.pctCriticalRatings / 100;
      parts.push({ id: 'hueco', label: 'Hueco por cubrir', score: Math.round(clamp01(c2 / 0.30) * 100),
        weight: WEIGHTS.hueco, confidence: 'media',
        detail: market.pctCriticalRatings + ' % de valoraciones de 1-3★ según los histogramas de Amazon.',
        help: 'Con las reseñas importadas se afina con las quejas concretas.' });
    } else {
      parts.push({ id: 'hueco', label: 'Hueco por cubrir', score: null, weight: WEIGHTS.hueco,
        confidence: 'sin datos', detail: 'Pendiente de importar reseñas.', help: '' });
    }

    // 4. Actualidad
    if (market.ageYears.n) {
      var old = market.ageYears.older5 / market.ageYears.n;
      var fresh = market.ageYears.newer1 / market.ageYears.n;
      var a = clamp01(0.75 * old + 0.25 * (1 - fresh));
      parts.push({ id: 'actualidad', label: 'Oportunidad de actualidad', score: Math.round(a * 100),
        weight: WEIGHTS.actualidad, confidence: 'alta',
        detail: market.ageYears.older5 + ' de ' + market.ageYears.n + ' libros tienen 5 años o más; ' +
          market.ageYears.newer1 + ' se publicaron en el último año.',
        help: 'Mucho libro antiguo = hueco para una edición al día.' });
    }

    // 5. Precio
    if (market.printPrice.n) {
      var p = clamp01((market.printPrice.median - 10) / (35 - 10));
      parts.push({ id: 'precio', label: 'Margen de precio', score: Math.round(p * 100), weight: WEIGHTS.precio,
        confidence: market.printPrice.n >= 4 ? 'media' : 'baja',
        detail: 'Precio mediano en papel: ' + market.printPrice.median + ' US$ (' + market.printPrice.n + ' libros).',
        help: 'Precios altos de la competencia dejan sitio a una alternativa más económica.' });
    } else {
      parts.push({ id: 'precio', label: 'Margen de precio', score: null, weight: WEIGHTS.precio,
        confidence: 'sin datos', detail: 'Faltan precios.', help: '' });
    }

    // 6. Viabilidad independiente
    var indie = books.filter(function (b) { return b.publisherType === 'independiente'; });
    var indieWithTraction = indie.filter(function (b) { return (b.ratingsTotal || 0) >= 20; });
    var iScore = indieWithTraction.length ? 80 : indie.length ? 45 : 30;
    parts.push({ id: 'indie', label: 'Espacio para autoedición', score: iScore, weight: WEIGHTS.indie,
      confidence: indie.length ? 'media' : 'baja',
      detail: indie.length ? indie.length + ' título(s) autoeditado(s); ' + indieWithTraction.length +
        ' con 20 o más valoraciones.' : 'No hay títulos autoeditados en la muestra.',
      help: 'Si ya hay autoeditores con ventas, el nicho admite a recién llegados.' });

    var wSum = 0, sSum = 0;
    parts.forEach(function (pt) { if (pt.score != null) { wSum += pt.weight; sSum += pt.weight * pt.score; } });
    var total = wSum ? Math.round(sSum / wSum) : null;
    var verdict = total == null ? { level: 'sin-datos', label: 'Sin datos suficientes' }
      : total >= 65 ? { level: 'bueno', label: 'Buen nicho: merece la pena entrar' }
        : total >= 50 ? { level: 'viable', label: 'Nicho viable con un enfoque diferenciado' }
          : total >= 35 ? { level: 'dificil', label: 'Nicho difícil: solo con un ángulo muy concreto' }
            : { level: 'malo', label: 'Nicho poco recomendable' };
    var coverage = wSum / Object.keys(WEIGHTS).reduce(function (s, k) { return s + WEIGHTS[k]; }, 0);
    return { total: total, verdict: verdict, parts: parts, coverage: round(coverage * 100, 0) };
  }

  // ----------------------------------------------------- importación y mezcla

  function parseImport(json) {
    var list = Array.isArray(json) ? json : [json];
    var out = [];
    list.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var book = item.book || {};
      var asin = book.asin || item.asin;
      if (!asin) {
        var m = String(item.pageUrl || '').match(/\/(?:dp|product-reviews|customer-reviews|gp\/product)\/([A-Z0-9]{10})/i);
        if (m) asin = m[1];
      }
      if (!asin) throw new Error('El archivo no indica el ASIN del libro.');
      asin = String(asin).toUpperCase();
      var reviews = Array.isArray(item.reviews) ? item.reviews : [];
      out.push({
        asin: asin,
        book: book,
        reviews: reviews.map(function (r) { return normalizeReview(r, asin); }),
        exportedAt: item.exportedAt || null,
        complete: item.complete == null ? null : !!item.complete,
        tool: item.tool || null,
        pageUrl: item.pageUrl || null
      });
    });
    if (!out.length) throw new Error('El archivo no contiene reseñas en el formato esperado (kdp-reviews/1).');
    return out;
  }

  var META_FIELDS = ['title', 'subtitle', 'authors', 'cover', 'rating', 'ratingsTotal', 'reviewsWithText',
    'histogram', 'price', 'formats', 'formatLine', 'pages', 'publisher', 'publicationDate', 'language',
    'isbn10', 'isbn13', 'bestSellersRank', 'customersSay', 'aspects'];

  function isEmpty(v) {
    return v == null || v === '' || (Array.isArray(v) && !v.length) ||
      (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  }

  function dedupeReviews(list) {
    var seen = {}, out = [];
    list.forEach(function (r) {
      if (seen[r.id]) return;
      seen[r.id] = true;
      out.push(r);
    });
    return out;
  }

  // Combina los datos base (investigación) con lo importado desde Amazon.
  function mergeData(baseBooks, baseReviews, imports) {
    var books = baseBooks.map(function (b) { return Object.assign({}, b); });
    var byAsin = {};
    books.forEach(function (b) { byAsin[b.asin] = b; });
    var reviews = {};
    Object.keys(baseReviews || {}).forEach(function (k) {
      reviews[k] = (baseReviews[k] || []).map(function (r) { return normalizeReview(r, k); });
    });
    (imports || []).forEach(function (imp) {
      var b = byAsin[imp.asin];
      if (!b) { b = { asin: imp.asin, added: true }; books.push(b); byAsin[imp.asin] = b; }
      var src = imp.book || {};
      var touched = false;
      META_FIELDS.forEach(function (f) {
        if (!isEmpty(src[f])) {
          if (f === 'subtitle' && !isEmpty(b.subtitle) && isEmpty(src.title)) return;
          b[f] = src[f];
          touched = true;
        }
      });
      if (!isEmpty(src.price)) b.prices = [src.price].concat((src.formats || []).map(function (f) {
        return { format: f.format, text: f.price, amount: parsePrice(f.price), currency: 'USD' };
      }));
      if (touched) { b.metaSource = 'amazon'; b.metaDate = imp.exportedAt; }
      b.importInfo = { exportedAt: imp.exportedAt, complete: imp.complete, tool: imp.tool, count: imp.reviews.length };
      reviews[imp.asin] = dedupeReviews((reviews[imp.asin] || []).concat(imp.reviews));
    });
    return { books: books, reviews: reviews };
  }

  function parsePrice(text) {
    if (text == null) return null;
    var s = String(text).replace(/[^\d.,]/g, '');
    if (!s) return null;
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // ------------------------------------------------------------- todo junto

  function analyzeAll(books, reviewsByAsin, opts) {
    opts = opts || {};
    var analyzed = [];
    var perBook = {};
    books.forEach(function (b) {
      var list = (reviewsByAsin[b.asin] || []).map(function (r) {
        var a = analyzeReview(r);
        Object.defineProperty(r, '__a', { value: a, enumerable: false, configurable: true });
        analyzed.push(a);
        return r;
      });
      perBook[b.asin] = bookStats(b, list, opts);
    });
    var market = marketStats(books, reviewsByAsin, opts);
    return {
      perBook: perBook,
      market: market,
      themes: themeStats(analyzed, { examples: opts.examples || 4 }),
      terms: distinctiveTerms(analyzed, opts),
      score: nicheScore(books, market, analyzed, opts),
      reviewCount: analyzed.length
    };
  }

  return {
    version: 1,
    themes: THEMES.map(function (t) { return { id: t.id, label: t.label, short: t.short }; }),
    themeById: function (id) { var t = THEME_BY_ID[id]; return t ? { id: t.id, label: t.label, short: t.short } : null; },
    normalize: normalize,
    themesIn: function (text) { return themesIn(normalize(text)); },
    splitSentences: splitSentences,
    sentenceKind: function (text, rating) { return sentenceKind(normalize(text), rating); },
    detectLang: detectLang,
    polarity: polarity,
    normalizeReview: normalizeReview,
    analyzeReview: analyzeReview,
    bookStats: bookStats,
    themeStats: themeStats,
    distinctiveTerms: distinctiveTerms,
    marketStats: marketStats,
    nicheScore: nicheScore,
    parseImport: parseImport,
    mergeData: mergeData,
    parsePrice: parsePrice,
    analyzeAll: analyzeAll,
    weights: WEIGHTS,
    util: { mean: mean, median: median, round: round, clamp01: clamp01 }
  };
});
