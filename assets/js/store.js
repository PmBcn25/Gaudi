/*
 * Dónde se guardan las reseñas importadas desde el panel.
 *
 *  - 'artefacto': publicado en claude.ai con la capacidad db. Los datos se
 *    comparten entre dispositivos y Claude puede leerlos para afinar el
 *    análisis. Estructura: imports/<ASIN> y imports/<ASIN>/chunks/<n>.
 *  - 'navegador': abierto en local o en GitHub Pages. IndexedDB de este
 *    navegador.
 *  - 'memoria': si nada de lo anterior está disponible (modo privado...).
 */
(function (root) {
  'use strict';
  var CHUNK_BYTES = 180000; // documentos de db: máximo 256 KiB

  var state = { backend: null, imports: [], listeners: [], db: null, idb: null, ready: null, unsub: null };

  function emit() { state.listeners.forEach(function (fn) { try { fn(state.imports); } catch (e) { console.error(e); } }); }

  // ------------------------------------------------------------ IndexedDB
  function openIdb() {
    return new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var req = root.indexedDB.open('catenaria', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('imports', { keyPath: 'asin' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbAll(db) {
    return new Promise(function (resolve) {
      try {
        var out = [];
        var tx = db.transaction('imports', 'readonly');
        var cur = tx.objectStore('imports').openCursor();
        cur.onsuccess = function () { var c = cur.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
        cur.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }
  function idbPut(db, value) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('imports', 'readwrite');
        tx.objectStore('imports').put(value);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      } catch (e) { reject(e); }
    });
  }
  function idbDelete(db, asin) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('imports', 'readwrite');
        if (asin) tx.objectStore('imports').delete(asin); else tx.objectStore('imports').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  // ------------------------------------------------------ db del artefacto
  function chunkReviews(reviews) {
    var chunks = [], cur = [], size = 2;
    reviews.forEach(function (r) {
      var s = JSON.stringify(r).length + 1;
      if (cur.length && size + s > CHUNK_BYTES) { chunks.push(cur); cur = []; size = 2; }
      cur.push(r); size += s;
    });
    if (cur.length || !chunks.length) chunks.push(cur);
    return chunks;
  }

  function dbLoadAll(db) {
    return db.collection('imports').get().then(function (snap) {
      return Promise.all(snap.docs.filter(function (d) { return d.exists; }).map(function (d) {
        var meta = d.data();
        return db.collection('imports/' + d.id + '/chunks').get().then(function (cs) {
          var parts = cs.docs.filter(function (c) { return c.exists; }).map(function (c) { return c.data(); })
            .filter(function (c) { return c.i < (meta.chunks || Infinity); })
            .sort(function (a, b) { return a.i - b.i; });
          var reviews = [];
          parts.forEach(function (p) { (p.reviews || []).forEach(function (r) { reviews.push(r); }); });
          return Object.assign({}, meta, { reviews: reviews });
        });
      }));
    });
  }

  function dbSave(db, imp) {
    var asin = imp.asin;
    var chunks = chunkReviews(imp.reviews);
    var meta = { asin: asin, book: imp.book || {}, exportedAt: imp.exportedAt || null, importedAt: imp.importedAt,
      complete: imp.complete, tool: imp.tool || null, pageUrl: imp.pageUrl || null, count: imp.reviews.length, chunks: chunks.length };
    // Primero los trozos, después el índice: quien lea a medias ve la versión anterior completa.
    var seq = Promise.resolve();
    chunks.forEach(function (list, i) {
      seq = seq.then(function () { return db.doc('imports/' + asin + '/chunks/' + i).set({ i: i, reviews: list }); });
    });
    return seq.then(function () { return db.doc('imports/' + asin).set(meta); }).then(function () {
      // Borra trozos sobrantes de una importación anterior más larga.
      return db.collection('imports/' + asin + '/chunks').get().then(function (cs) {
        return cs.docs.reduce(function (p, c) {
          var d = c.data();
          return d && d.i >= chunks.length ? p.then(function () { return db.doc('imports/' + asin + '/chunks/' + c.id).delete(); }) : p;
        }, Promise.resolve());
      });
    });
  }

  function dbDelete(db, asin) {
    return db.collection('imports/' + asin + '/chunks').get().then(function (cs) {
      return cs.docs.reduce(function (p, c) {
        return p.then(function () { return db.doc('imports/' + asin + '/chunks/' + c.id).delete(); });
      }, Promise.resolve());
    }).then(function () { return db.doc('imports/' + asin).delete(); });
  }

  // ----------------------------------------------------------------- API
  function init() {
    if (state.ready) return state.ready;
    state.ready = new Promise(function (resolve) {
      var hasViewer = root.claude && typeof root.claude.use === 'function';
      var viaDb = hasViewer ? root.claude.use('db').catch(function () { return null; }) : Promise.resolve(null);
      viaDb.then(function (db) {
        if (db) {
          state.db = db;
          state.backend = 'artefacto';
          return dbLoadAll(db).then(function (list) {
            state.imports = list;
            try {
              var timer = null;
              state.unsub = db.collection('imports').onSnapshot(function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                  dbLoadAll(db).then(function (l) { state.imports = l; emit(); }, function () { /* se mantiene lo cargado */ });
                }, 600);
              }, function () { /* suscripción terminada: se queda con lo cargado */ });
            } catch (e) { /* sin tiempo real */ }
          }, function () { state.imports = []; });
        }
        return openIdb().then(function (idb) {
          if (idb) { state.idb = idb; state.backend = 'navegador'; return idbAll(idb).then(function (l) { state.imports = l; }); }
          state.backend = 'memoria';
        });
      }).then(function () { emit(); resolve(state.backend); }, function () { state.backend = 'memoria'; emit(); resolve(state.backend); });
    });
    return state.ready;
  }

  function mergeInto(existing, imp) {
    if (!existing) return imp;
    var seen = {}, reviews = [];
    imp.reviews.concat(existing.reviews || []).forEach(function (r) { if (!seen[r.id]) { seen[r.id] = true; reviews.push(r); } });
    var book = Object.assign({}, existing.book || {});
    Object.keys(imp.book || {}).forEach(function (k) {
      var v = imp.book[k];
      if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) book[k] = v;
    });
    return Object.assign({}, existing, imp, { book: book, reviews: reviews, complete: imp.complete || existing.complete });
  }

  // Guarda una o varias importaciones, de una en una (mezcla con lo que ya hubiera del mismo libro).
  function save(imports) {
    var results = [];
    return init().then(function () {
      var now = new Date().toISOString();
      return imports.reduce(function (seq, imp) {
        return seq.then(function () {
          var existing = state.imports.filter(function (x) { return x.asin === imp.asin; })[0];
          var merged = mergeInto(existing, Object.assign({}, imp, { importedAt: now }));
          merged.count = merged.reviews.length;
          var write = state.backend === 'artefacto' ? dbSave(state.db, merged)
            : state.backend === 'navegador' ? idbPut(state.idb, merged) : Promise.resolve();
          return write.then(function () {
            state.imports = state.imports.filter(function (x) { return x.asin !== imp.asin; }).concat([merged]);
            results.push({ asin: imp.asin, total: merged.reviews.length,
              added: merged.reviews.length - (existing ? (existing.reviews || []).length : 0) });
          });
        });
      }, Promise.resolve());
    }).then(function () { emit(); return results; });
  }

  function remove(asin) {
    return init().then(function () {
      var p = state.backend === 'artefacto' ? dbDelete(state.db, asin)
        : state.backend === 'navegador' ? idbDelete(state.idb, asin) : Promise.resolve();
      return p.then(function () {
        state.imports = state.imports.filter(function (x) { return x.asin !== asin; });
        emit();
      });
    });
  }

  root.KDPStore = {
    init: init,
    save: save,
    remove: remove,
    onChange: function (fn) { state.listeners.push(fn); },
    get imports() { return state.imports; },
    get backend() { return state.backend; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
