// Genera las páginas HTML de prueba (datos 100 % inventados) que imitan el DOM de Amazon.
// Uso: node tests/fixtures/generar-fixtures.mjs   (reescribe los .html de esta carpeta)
//
// Fixtures:
//   resenas-portal-es.html      (a) /-/es/portal/customer-reviews/TESTASIN01 — «Mostrar 10 opiniones más»
//   resenas-paginadas-en-p1..3  (b) /product-reviews/TESTASIN02?pageNumber=N — paginación clásica (EN)
//   ficha-producto-es.html      (c) /-/es/dp/TESTASIN01 — ficha de producto (ES)
//   inicio-sesion.html          (d) /ap/signin — página de inicio de sesión
//   captcha.html, no-encontrado.html
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STAR_CLASS = { 5: 'a-star-5', 4: 'a-star-4', 3: 'a-star-3', 2: 'a-star-2', 1: 'a-star-1' };

const BASE_CSS = `
  body{font-family:Arial,sans-serif;margin:0;color:#0f1111}
  .aok-hidden,.a-hidden{display:none!important}
  .a-section{margin-bottom:12px}
  .a-button{display:inline-block;position:relative;border:1px solid #d5d9d9;border-radius:8px;background:#fff}
  .a-button-inner{display:block;position:relative;padding:0 12px;line-height:29px}
  .a-button-input{position:absolute;top:0;left:0;width:100%;height:100%;margin:0;opacity:.01;cursor:pointer;z-index:9}
  .a-button-disabled{opacity:.5}
  .a-icon-alt{position:absolute;left:-10000px}
  .review{border-bottom:1px solid #eee;padding:8px 0}
  #a-page{max-width:1000px;margin:0 auto;padding:16px}
`;

function page({ title, lang = 'es-us', body, css = '' }) {
  return `<!doctype html>
<html lang="${lang}" class="a-no-js">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body class="a-m-us a-aui_72554-c">
<div id="a-page">
<header id="navbar" class="nav-sprite-v1"><a id="nav-logo-sprites" href="/ref=nav_logo" class="nav-logo-link">Amazon.com (página de prueba)</a></header>
${body}
</div>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- reviews */

function esDate(y, m, d, country = 'Estados Unidos', verb = 'Revisado') {
  return `${verb} en ${country} el ${d} de ${ES_MONTHS[m - 1]} de ${y}`;
}
function enDateUS(y, m, d, country = 'the United States') {
  return `Reviewed in ${country} on ${EN_MONTHS[m - 1]} ${d}, ${y}`;
}

// Renders one review with the markup Amazon uses on review pages / product pages.
function reviewHtml(r, o) {
  const lang = o.lang || 'es';
  const asin = o.asin;
  const foreign = !!r.foreignPrefix;
  const tag = o.tag || 'div';
  const starHook = r.intl ? 'cmps-review-star-rating' : 'review-star-rating';
  const alt = lang === 'es' ? `${r.rating},0 de 5 estrellas` : `${r.rating}.0 out of 5 stars`;
  const star = `<i data-hook="${starHook}" class="a-icon a-icon-star ${STAR_CLASS[r.rating]} review-rating"><span class="a-icon-alt">${alt}</span></i>`;
  const link = r.noId ? '' : `${lang === 'es' ? '/-/es' : ''}/gp/customer-reviews/${r.id}/ref=cm_cr_arp_d_rvw_ttl?ie=UTF8&amp;ASIN=${asin}`;
  const outerId = r.noId ? '' : ` id="${r.id}"`;
  const innerId = r.noId ? '' : ` id="${foreign ? 'customer_review_foreign-' : 'customer_review-'}${r.id}"`;
  const extraAttr = r.stars != null ? ` data-fixture-estrellas="${r.stars}"` : ` data-fixture-estrellas="${r.rating}"`;
  const onlyFiltered = r.onlyFiltered ? ' data-fixture-solo-filtro="1"' : '';

  let titleRow;
  if (r.noTitle) {
    titleRow = `<div class="a-row">${star}</div>`;
  } else if (r.intl) {
    titleRow = `<div class="a-row">${star}<span class="a-letter-space"></span><span data-hook="review-title" class="a-size-base review-title a-color-base review-title-content a-text-bold"><span class="cr-original-review-content">${esc(r.title)}</span>${r.titleTranslated ? `<span class="cr-translated-review-content aok-hidden">${esc(r.titleTranslated)}</span>` : ''}</span></div>`;
  } else if (r.style === 'old') {
    titleRow = `<div class="a-row"><a class="a-link-normal" title="${alt}" href="${link}">${star}</a><span class="a-letter-space"></span><a data-hook="review-title" class="a-size-base a-link-normal review-title a-color-base review-title-content a-text-bold" href="${link}"><span>${esc(r.title)}</span></a></div>`;
  } else {
    titleRow = `<div class="a-row"><a data-hook="review-title" class="a-size-base a-link-normal review-title a-color-base review-title-content a-text-bold" href="${link}">${star}<span class="a-letter-space"></span><span>${esc(r.title)}</span></a></div>`;
  }

  const verified = lang === 'es' ? 'Compra verificada' : 'Verified Purchase';
  let strip = '';
  if (r.formatLinkless) {
    strip = `<div data-hook="format-strip-linkless" class="a-row a-spacing-mini review-data review-format-strip"><span class="a-color-secondary">${esc(r.format)}</span>${r.verified ? `<i class="a-icon a-icon-text-separator" role="img" aria-label="|"></i><span data-hook="avp-badge-linkless" class="a-size-mini a-color-state a-text-bold">${verified}</span>` : ''}</div>`;
  } else if (r.format || r.verified || r.vine) {
    strip = `<div class="a-row a-spacing-mini review-data review-format-strip">${r.format ? `<a data-hook="format-strip" class="a-size-mini a-link-normal a-color-secondary" href="/product-reviews/${asin}/ref=cm_cr_arp_d_rvw_fmt?ie=UTF8&amp;formatType=current_format">${esc(r.format)}</a>` : ''}${r.format && r.verified ? '<i class="a-icon a-icon-text-separator" role="img" aria-label="|"></i>' : ''}${r.verified ? `<a href="/gp/help/customer/display.html?nodeId=G3UA5WC5S5UUKB5G"><span data-hook="avp-badge" class="a-size-mini a-color-state a-text-bold">${verified}</span></a>` : ''}${r.vine ? `<span class="a-size-mini a-color-success a-text-bold">${lang === 'es' ? 'Reseña de Vine de un producto gratuito' : 'Vine Customer Review of Free Product'}</span><span class="a-letter-space"></span><a class="a-link-normal a-size-mini" href="/vine/about">( ${lang === 'es' ? '¿Qué es esto?' : "What's this?"} )</a>` : ''}</div>`;
  }

  const paragraphs = r.body.map(esc).join('<br><br>');
  let body;
  if (r.intl) {
    body = `<span data-hook="review-body" class="a-size-base review-text review-text-content"><span class="cr-original-review-content">${paragraphs}</span>${r.bodyTranslated ? `<span class="cr-translated-review-content aok-hidden">${esc(r.bodyTranslated)}</span>` : ''}</span>`;
  } else if (o.productPage || r.readMore) {
    body = `<div data-hook="review-body" class="a-expander-collapsed-height a-row a-overflow-hidden a-expander-partial-collapse-container"><div data-hook="review-collapsed" aria-expanded="false" class="a-expander-content reviewText review-text-content a-expander-partial-collapse-content"><span>${paragraphs}</span></div><div class="a-expander-header a-expander-partial-collapse-header"><a href="javascript:void(0)" data-action="a-expander-toggle" class="a-declarative"><i class="a-icon a-icon-extender-expand"></i><span class="a-expander-prompt">${lang === 'es' ? 'Leer más' : 'Read more'}</span></a></div></div>`;
  } else {
    body = `<span data-hook="review-body" class="a-size-base review-text review-text-content"><span>${paragraphs}</span></span>`;
  }
  if (r.video) {
    body = body.replace('<span>', `<span><div class="video-block"><div class="cr-video-desktop"><span>${lang === 'es' ? 'El contenido multimedia no se pudo cargar.' : 'The media could not be loaded.'}</span></div></div>`);
  }

  const images = r.images
    ? `<div class="a-row a-spacing-medium review-image-container"><div class="review-image-tile-section">${Array.from({ length: r.images }, (_, i) => `<img alt="Imagen del cliente" src="/images/I/71TESTIMG${i}._SY88.jpg" data-hook="review-image-tile" class="review-image-tile" height="88" width="100%">`).join('')}</div></div>`
    : '';

  const vineBadge = r.vine ? `<div class="a-row"><span class="a-size-mini a-color-link c7yBadgeAUI c7yTopDownDashedStrike c7y-badge-text a-text-bold">VINE VOICE</span></div>` : '';
  const helpful = r.helpful ? `<span data-hook="helpful-vote-statement" class="a-size-base a-color-tertiary cr-vote-text">${esc(r.helpful)}</span>` : '';
  const translate = r.intl ? `<div class="a-row a-spacing-small"><span class="cr-translate-this-review-section"><a class="a-link-normal cr-translate-review-link" href="javascript:void(0)">${lang === 'es' ? 'Traducir reseña al Español' : 'Translate review to English'}</a></span></div>` : '';
  const useful = lang === 'es' ? 'Útil' : 'Helpful';
  const report = lang === 'es' ? 'Informar' : 'Report';

  return `<${tag}${outerId} data-hook="review" class="a-section review aok-relative"${extraAttr}${onlyFiltered}>
  <div${innerId} class="a-section celwidget">
    <div data-hook="genome-widget" class="a-row a-spacing-mini"><a href="/gp/profile/amzn1.account.FAKE${String(r.n || 0).padStart(4, '0')}/ref=cm_cr_arp_d_gw_btm?ie=UTF8" class="a-profile" data-a-size="small"><div aria-hidden="true" class="a-profile-avatar-wrapper"><div class="a-profile-avatar"><img src="/images/S/amazon-avatars-global/default.png" class="" alt=""></div></div><div class="a-profile-content"><span class="a-profile-name">${esc(r.author)}</span></div></a></div>
    ${vineBadge}
    ${titleRow}
    <span data-hook="review-date" class="a-size-base a-color-secondary review-date">${esc(r.date)}</span>
    ${strip}
    <div class="a-row a-spacing-small review-data">${body}</div>
    ${images}
    ${translate}
    <div class="a-row review-comments">
      <div class="a-row a-expander-container a-expander-inline-container">${helpful}
        <div class="a-row a-spacing-small"><span class="a-button a-button-base"><span class="a-button-inner"><a href="javascript:void(0)" class="a-button-text" role="button">${useful}</a></span></span><span class="a-letter-space"></span><a class="a-size-base a-link-normal a-color-secondary report-abuse-link" href="/hz/reviews-render/report-abuse?ie=UTF8">${report}</a></div>
      </div>
    </div>
  </div>
</${tag}>`;
}

/* ---------------------------------------------------------------- data (a) ES portal, TESTASIN01 */

const A_ASIN = 'TESTASIN01';
const PATTERN = [5, 4, 5, 3, 5, 2, 4, 5, 1, 5];
const ES_TITLES = ['Muy recomendable', 'Buen libro de consulta', 'Me esperaba más', 'Fotografías espectaculares', 'Correcto', 'Regalo perfecto', 'Algo caro para lo que es', 'Imprescindible', 'Decepcionante', 'Lo volvería a comprar'];
const ES_BODIES = [
  'Texto de prueba: el libro llegó bien embalado y las ilustraciones son claras.',
  'Texto de prueba: la encuadernación es buena, aunque el papel podría ser más grueso.',
  'Texto de prueba: faltan planos detallados de algunas partes del edificio.',
  'Texto de prueba: muy útil para preparar la visita con los niños.',
  'Texto de prueba: la traducción tiene algunas erratas, pero se entiende bien.'
];

function aMainReviews() {
  const out = [];
  for (let n = 1; n <= 37; n++) {
    const id = `R1TESTREVIEW${String(n).padStart(2, '0')}`;
    const rating = PATTERN[(n - 1) % PATTERN.length];
    const base = {
      n, id, rating,
      author: `Lector de prueba ${n}`,
      title: ES_TITLES[(n - 1) % ES_TITLES.length],
      date: esDate(2019 + (n % 5), ((n * 5) % 12) + 1, ((n * 7) % 27) + 1),
      format: n % 3 === 0 ? 'Formato: Versión Kindle' : (n % 3 === 1 ? 'Formato: Tapa dura' : 'Formato: Tapa blanda'),
      verified: n % 4 !== 0,
      helpful: n % 5 === 0 ? `A ${n} personas les resultó útil` : '',
      body: [ES_BODIES[(n - 1) % ES_BODIES.length]],
      style: n % 2 ? 'new' : 'old'
    };
    out.push(base);
  }
  Object.assign(out[0], {
    author: 'Lector de prueba 1', rating: 5, style: 'old', title: 'Una guía preciosa y muy completa',
    date: 'Revisado en Estados Unidos el 3 de marzo de 2023', format: 'Formato: Tapa dura', verified: true,
    helpful: 'A 12 personas les resultó útil', images: 2,
    body: ['Primer párrafo de prueba: las fotografías del templo son magníficas.', 'Segundo párrafo de prueba: el texto explica bien la simbología de las fachadas.']
  });
  Object.assign(out[1], {
    author: 'Lectora de prueba 2', rating: 4, style: 'new', title: 'Buen libro, pero la letra es pequeña',
    date: 'Calificado en México el 12 de enero de 2024', format: 'Formato: Tapa blanda', verified: true,
    helpful: 'Una persona encontró esto útil', body: ['Texto de prueba: contenido interesante; la letra es demasiado pequeña.']
  });
  Object.assign(out[2], {
    author: 'Lector Vine de prueba 3', rating: 5, style: 'new', title: 'Recibido gratis para reseñar',
    date: 'Revisado en Estados Unidos el 20 de junio de 2023', format: 'Formato: Tapa dura', verified: false, vine: true,
    helpful: 'A una persona le resultó útil', body: ['Texto de prueba: ejemplar recibido gratis a cambio de una opinión sincera.']
  });
  Object.assign(out[3], {
    noId: true, noTitle: true, author: 'Lector de prueba 4', rating: 3, format: null, verified: false, helpful: '',
    date: 'Revisado en Estados Unidos el 7 de julio de 2021', body: ['Correcto, sin más.']
  });
  Object.assign(out[4], {
    author: 'Lector de prueba 5', rating: 1, style: 'old', title: 'No es lo que esperaba',
    date: 'Revisado en Estados Unidos el 30 de noviembre de 2022', format: 'Formato: Versión Kindle', formatLinkless: true,
    verified: true, helpful: '12 personas encontraron esto útil', readMore: true,
    body: ['Texto de prueba: la versión Kindle no muestra bien los planos.', 'Además, el índice no enlaza con los capítulos.']
  });
  Object.assign(out[5], {
    author: 'Lector de prueba 6', rating: 2, style: 'new', title: 'Llegó dañado',
    date: 'Revisado en Estados Unidos 🇺🇸 el 15 de agosto de 2022', format: 'Formato: Tapa dura', verified: true,
    helpful: 'A 1.234 personas les resultó útil', body: ['Texto de prueba: la cubierta llegó doblada.']
  });
  Object.assign(out[6], {
    author: 'Lector de prueba 7', rating: 4, style: 'old', title: 'Incluye vídeo',
    date: 'Revisado en Estados Unidos el 9 de febrero de 2024', video: true,
    body: ['Texto de prueba: en el vídeo se ve el tamaño real del libro.']
  });
  return out;
}

function aIntlReviews() {
  return [
    {
      n: 101, id: 'R3TESTINTL001', intl: true, rating: 5, author: 'Lectora internacional de prueba 1',
      title: 'Magnífico', date: 'Revisado en España el 5 de abril de 2022', format: 'Formato: Tapa dura', verified: true,
      helpful: 'A 3 personas les resultó útil', body: ['Texto de prueba desde España: edición cuidada.']
    },
    {
      n: 102, id: 'R3TESTINTL002', intl: true, rating: 4, author: 'Test reader 2 (UK)',
      title: 'Beautiful photographs', titleTranslated: 'Fotografías preciosas',
      date: 'Revisado en Reino Unido el 21 de noviembre de 2021', format: 'Formato: Tapa blanda', verified: true,
      helpful: '', body: ['Test text: beautiful photographs, slightly thin paper.'],
      bodyTranslated: 'Texto de prueba: fotografías preciosas, papel algo fino.'
    },
    {
      n: 103, id: 'R3TESTINTL003', intl: true, rating: 2, author: 'Testleser 3',
      title: 'Enttäuschend', titleTranslated: 'Decepcionante',
      date: 'Revisado en Alemania el 1 de julio de 2020', format: null, verified: false,
      helpful: 'Una persona encontró esto útil', body: ['Testtext: zu wenige Pläne.'], bodyTranslated: 'Texto de prueba: pocos planos.'
    }
  ];
}

function aHiddenReviews() {
  return [1, 2, 3].map((k) => ({
    n: 200 + k, id: `R9TESTHIDDEN0${k}`, rating: 1, onlyFiltered: true, author: `Lector oculto de prueba ${k}`,
    title: `Solo visible con el filtro de 1 estrella (${k})`, date: esDate(2018, k, 10 + k), format: 'Formato: Tapa blanda',
    verified: true, helpful: '', style: 'new', body: [`Texto de prueba oculto ${k}: Amazon limita la lista sin filtrar.`]
  }));
}

function insightsEs() {
  return `<div data-hook="cr-insights-widget" class="a-section a-spacing-large">
  <h3 class="a-spacing-small">Los clientes dicen</h3>
  <div data-hook="cr-insights-widget-summary" class="a-section a-spacing-small">
    <p class="a-spacing-small"><span>Los lectores de prueba destacan la calidad de las fotografías y la claridad de las explicaciones, aunque algunos consideran que el precio es elevado.</span></p>
    <p class="a-spacing-mini"><i class="a-icon a-icon-text-generative-ai"></i><span class="a-size-base a-color-secondary">Generado por IA a partir del texto de las reseñas de clientes</span></p>
  </div>
  <div data-hook="cr-insights-widget-aspects" class="a-section a-spacing-medium">
    <span class="a-declarative" data-action="cr-insights-popover"><span class="a-button a-button-base cr-aspect-button" data-sentiment="POSITIVE"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Calidad de las fotografías: 45 menciones positivas, 3 menciones negativas"><i class="a-icon a-icon-checkmark a-icon-mini"></i><span>Calidad de las fotografías</span></button></span></span></span>
    <span class="a-declarative" data-action="cr-insights-popover"><span class="a-button a-button-base cr-aspect-button" data-sentiment="MIXED"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Relación calidad-precio: 12 menciones positivas, 11 menciones negativas"><i class="a-icon a-icon-mixed a-icon-mini"></i><span>Relación calidad-precio</span></button></span></span></span>
    <span class="a-declarative" data-action="cr-insights-popover"><span class="a-button a-button-base cr-aspect-button" data-sentiment="NEGATIVE"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Tamaño de letra: 2 menciones positivas, 9 menciones negativas"><i class="a-icon a-icon-close a-icon-mini"></i><span>Tamaño de letra</span></button></span></span></span>
  </div>
</div>`;
}

function buildReviewsPortalEs() {
  const main = aMainReviews();
  const intl = aIntlReviews();
  const hidden = aHiddenReviews();
  const o = { lang: 'es', asin: A_ASIN };
  const first = main.slice(0, 10).map((r) => reviewHtml(r, o)).join('\n');
  const pending = [...main.slice(10), ...hidden].map((r) => reviewHtml(r, o)).join('\n');
  const hist = [[5, 74], [4, 14], [3, 6], [2, 3], [1, 3]].map(([s, p]) => `<tr class="a-histogram-row a-align-center">
      <td class="aok-nowrap"><span class="a-size-base"><a class="a-link-normal ${s}star" href="/-/es/product-reviews/${A_ASIN}/ref=cm_cr_arp_d_hist_${s}?ie=UTF8&amp;filterByStar=${['', 'one', 'two', 'three', 'four', 'five'][s]}_star&amp;reviewerType=all_reviews">${s} ${s === 1 ? 'estrella' : 'estrellas'}</a></span></td>
      <td class="a-span10"><div class="a-meter" role="progressbar" aria-valuenow="${p}%"><div class="a-meter-bar a-meter-filled" style="width: ${p}%;"></div></div></td>
      <td class="a-text-right a-nowrap"><span class="a-size-base">${p}%</span></td></tr>`).join('\n');

  const body = `
<div id="cm_cr-product_info" class="a-section a-spacing-none">
  <div class="a-fixed-left-grid"><div class="a-fixed-left-grid-inner">
    <div class="a-fixed-left-grid-col a-col-left">
      <div data-hook="cr-product-image" class="a-section a-spacing-none"><a class="a-link-normal" href="/-/es/dp/${A_ASIN}/ref=cm_cr_arp_d_product_top?ie=UTF8"><img alt="Libro de Prueba" src="/images/I/41TESTCOVER01._SY88.jpg" height="88"></a></div>
    </div>
    <div class="a-fixed-left-grid-col a-col-right">
      <div class="a-row product-title"><h1 class="a-size-large a-text-ellipsis"><a data-hook="product-link" class="a-link-normal" href="/-/es/dp/${A_ASIN}/ref=cm_cr_arp_d_product_top?ie=UTF8">Libro de Prueba: Subtítulo de prueba</a></h1></div>
      <div class="a-row product-by-line"><a class="a-size-base a-link-normal" href="/-/es/s?i=stripbooks&amp;field-author=Autora+Ficticia">Autora Ficticia</a></div>
    </div>
  </div></div>
  <div class="a-row averageStarRatingIconAndCount"><i data-hook="average-star-rating" class="a-icon a-icon-star a-star-4-5 averageStarRating"><span class="a-icon-alt">4,6 de 5 estrellas</span></i><span class="a-letter-space"></span><span data-hook="rating-out-of-text" class="a-size-medium a-color-base">4,6 de 5</span></div>
  <div class="a-row a-spacing-medium averageStarRatingNumerical"><span data-hook="total-review-count" class="a-size-base a-color-secondary">1.234 calificaciones globales</span></div>
  <table id="histogramTable" class="a-normal a-align-center a-spacing-base">
    ${hist}
  </table>
</div>
${insightsEs()}
<div id="cm_cr-review_list" class="a-section a-spacing-none review-views celwidget">
  <div data-hook="cr-filter-info-review-rating-count" class="a-row a-spacing-base a-size-base">1.234 calificaciones totales, 456 con reseñas</div>
  <h3 data-hook="dp-local-reviews-header" class="a-spacing-medium">Reseñas principales de Estados Unidos</h3>
${first}
</div>
<div class="a-section cr-list-loading reviews-loading aok-hidden" id="kdpx-fixture-cargando"><span class="a-spinner a-spinner-medium"></span></div>
<div id="cm_cr-show-more-bar" class="a-section a-spacing-large a-text-center">
  <span class="a-button a-button-base" id="a-autoid-7" data-hook="show-more-button"><span class="a-button-inner"><input class="a-button-input" type="submit" aria-labelledby="a-autoid-7-announce"><span class="a-button-text" aria-hidden="true" id="a-autoid-7-announce">Mostrar 10 opiniones más</span></span></span>
</div>
<div id="kdpx-intl" class="a-section a-spacing-top-large">
  <h3 class="a-spacing-base">Reseñas principales de otros países</h3>
  <div class="a-section review-views">
${intl.map((r) => reviewHtml(r, o)).join('\n')}
  </div>
</div>
<template id="kdpx-fixture-pendientes">
${pending}
</template>
<script>
/* Simulación (solo pruebas) del JavaScript de Amazon: filtro por estrellas y «Mostrar 10 opiniones más». */
(function () {
  var STARS = { five_star: 5, four_star: 4, three_star: 3, two_star: 2, one_star: 1 };
  var params = new URLSearchParams(location.search);
  var want = STARS[params.get('filterByStar')] || 0;
  var list = document.getElementById('cm_cr-review_list');
  var bar = document.getElementById('cm_cr-show-more-bar');
  var btn = bar.querySelector('[data-hook="show-more-button"]');
  var input = btn.querySelector('input');
  var label = btn.querySelector('.a-button-text');
  var spinner = document.getElementById('kdpx-fixture-cargando');
  var pending = Array.prototype.slice.call(document.getElementById('kdpx-fixture-pendientes').content.children);
  function stars(n) { return +n.getAttribute('data-fixture-estrellas'); }
  function reviews(root) { return Array.prototype.slice.call(root.querySelectorAll('[data-hook="review"]')); }
  if (want) {
    reviews(list).forEach(function (n) { if (stars(n) !== want) n.parentNode.removeChild(n); });
    reviews(document.getElementById('kdpx-intl')).forEach(function (n) { if (stars(n) !== want) n.parentNode.removeChild(n); });
    pending = pending.filter(function (n) { return stars(n) === want; });
    while (reviews(list).length < 10 && pending.length) list.appendChild(document.importNode(pending.shift(), true));
    var total = reviews(list).length + pending.length;
    list.querySelector('[data-hook="cr-filter-info-review-rating-count"]').textContent = (total * 3) + ' calificaciones totales, ' + total + ' con reseñas';
  } else {
    pending = pending.filter(function (n) { return n.getAttribute('data-fixture-solo-filtro') !== '1'; });
  }
  if (params.get('variante') === 'ver-mas') label.textContent = 'Ver más reseñas';
  var loading = false;
  function render() { bar.style.display = pending.length ? '' : 'none'; }
  document.addEventListener('click', function (e) {
    var hit = e.target && e.target.closest && e.target.closest('[data-hook="show-more-button"]');
    if (!hit) return;
    e.preventDefault();
    if (loading) return;
    loading = true;
    btn.classList.add('a-button-disabled');
    input.disabled = true;
    spinner.classList.remove('aok-hidden');
    setTimeout(function () {
      for (var i = 0; i < 10 && pending.length; i++) list.appendChild(document.importNode(pending.shift(), true));
      loading = false;
      btn.classList.remove('a-button-disabled');
      input.disabled = false;
      spinner.classList.add('aok-hidden');
      label.textContent = 'Mostrar 10 opiniones más';
      render();
    }, 350);
  });
  render();
})();
</script>`;
  return page({ title: 'Amazon.com: Opiniones de clientes: Libro de Prueba: Subtítulo de prueba', body });
}

/* ---------------------------------------------------------------- data (b) EN paginated, TESTASIN02 */

const B_ASIN = 'TESTASIN02';
const EN_TITLES = ['Great reference', 'Nice pictures', 'Not worth the price', 'Good gift', 'Too short', 'Excellent', 'Average', 'Loved it', 'Poor binding', 'Solid book'];

function bReviews() {
  const out = [];
  for (let n = 1; n <= 25; n++) {
    out.push({
      n: 300 + n,
      id: `R2TESTENREV${String(n).padStart(2, '0')}`,
      rating: PATTERN[(n + 3) % PATTERN.length],
      author: `Test reader ${n}`,
      title: EN_TITLES[(n - 1) % EN_TITLES.length],
      date: enDateUS(2020 + (n % 4), ((n * 3) % 12) + 1, ((n * 11) % 27) + 1),
      format: n % 2 ? 'Format: Paperback' : 'Format: Kindle Edition',
      verified: n % 3 !== 0,
      helpful: n % 4 === 0 ? `${n} people found this helpful` : '',
      body: [`Test text ${n}: invented review used only by the automated tests.`],
      style: n > 10 && n <= 20 ? 'old' : 'new'
    });
  }
  Object.assign(out[0], {
    rating: 5, title: 'A lovely invented book', date: 'Reviewed in the United States on March 3, 2023',
    format: 'Format: Paperback', verified: true, helpful: '12 people found this helpful',
    body: ['First test paragraph.', 'Second test paragraph.']
  });
  Object.assign(out[1], {
    rating: 4, style: 'old', title: 'Good but small print', date: 'Reviewed in the United Kingdom on 3 March 2023',
    format: 'Format: Kindle Edition', verified: true, helpful: 'One person found this helpful'
  });
  Object.assign(out[2], {
    rating: 1, title: 'Arrived damaged', date: 'Reviewed in Canada on January 12, 2024',
    format: 'Format: Paperback', verified: false, helpful: '1,234 people found this helpful'
  });
  return out;
}

function buildPaginatedEn(pageNo) {
  const all = bReviews();
  const slice = all.slice((pageNo - 1) * 10, pageNo * 10);
  const o = { lang: 'en', asin: B_ASIN };
  const hist = [[5, 61], [4, 20], [3, 10], [2, 5], [1, 4]].map(([s, p]) => `<li><span class="a-list-item"><a aria-disabled="false" aria-label="${p} percent of reviews have ${s} stars" class="a-link-normal ${s}star" title="${p} percent of reviews have ${s} stars" href="/product-reviews/${B_ASIN}/ref=acr_dp_hist_${s}?ie=UTF8&amp;filterByStar=${['', 'one', 'two', 'three', 'four', 'five'][s]}_star&amp;reviewerType=all_reviews"><div class="a-section a-spacing-none a-text-left aok-nowrap">${s} star</div><div class="a-section a-spacing-none a-inline-block"><div class="a-meter" role="progressbar" aria-valuenow="${p}"><div class="a-meter-bar a-meter-filled" style="width: ${p}%;"></div></div></div><div class="a-section a-spacing-none a-text-right aok-nowrap">${p}%</div></a></span></li>`).join('\n');
  const prev = pageNo > 1
    ? `<li class="a-normal"><a href="/product-reviews/${B_ASIN}/ref=cm_cr_arp_d_paging_btm_prev_${pageNo - 1}?ie=UTF8&amp;reviewerType=all_reviews&amp;pageNumber=${pageNo - 1}">←<span class="a-letter-space"></span><span class="a-letter-space"></span>Previous page</a></li>`
    : '<li class="a-disabled">←<span class="a-letter-space"></span><span class="a-letter-space"></span>Previous page</li>';
  const next = pageNo < 3
    ? `<li class="a-last"><a href="/product-reviews/${B_ASIN}/ref=cm_cr_arp_d_paging_btm_next_${pageNo + 1}?ie=UTF8&amp;reviewerType=all_reviews&amp;pageNumber=${pageNo + 1}">Next page<span class="a-letter-space"></span><span class="a-letter-space"></span>→</a></li>`
    : '<li class="a-disabled a-last">Next page<span class="a-letter-space"></span><span class="a-letter-space"></span>→</li>';

  const body = `
<div id="cm_cr-product_info" class="a-section a-spacing-none">
  <div class="a-fixed-left-grid"><div class="a-fixed-left-grid-inner">
    <div class="a-fixed-left-grid-col a-col-left"><div class="a-section"><a class="a-link-normal" href="/dp/${B_ASIN}/ref=cm_cr_arp_d_product_top?ie=UTF8"><img alt="An Invented Test Book" src="/images/I/51TESTCOVER02._SY88.jpg" data-hook="cr-product-image" height="88"></a></div></div>
    <div class="a-fixed-left-grid-col a-col-right">
      <div class="a-row product-title"><h1 class="a-size-large a-text-ellipsis"><a data-hook="product-link" class="a-link-normal" href="/dp/${B_ASIN}/ref=cm_cr_arp_d_product_top?ie=UTF8">An Invented Test Book: A Subtitle for Testing</a></h1></div>
      <div class="a-row product-by-line"><a class="a-size-base a-link-normal" href="/s?i=stripbooks&amp;field-author=Fictional+Author">Fictional Author</a></div>
    </div>
  </div></div>
  <div class="a-row averageStarRatingIconAndCount"><i data-hook="average-star-rating" class="a-icon a-icon-star a-star-4-5"><span class="a-icon-alt">4.3 out of 5 stars</span></i><span data-hook="rating-out-of-text" class="a-size-medium a-color-base">4.3 out of 5</span></div>
  <div class="a-row a-spacing-medium"><span data-hook="total-review-count" class="a-size-base a-color-secondary">2,345 global ratings</span></div>
  <ul id="histogramTable" class="a-unordered-list a-nostyle a-vertical a-spacing-none histogram">
${hist}
  </ul>
</div>
<div class="a-section a-spacing-large">
  <h3 class="a-spacing-small">Customers say</h3>
  <div class="a-section"><p>Test readers say this invented book is clear and well illustrated, but some mention the small print.</p><p class="a-color-secondary">AI-generated from the text of customer reviews</p></div>
</div>
<div id="cm_cr-review_list" class="a-section a-spacing-none review-views celwidget">
  <div data-hook="cr-filter-info-review-rating-count" class="a-row a-spacing-base a-size-base">2,345 total ratings, 612 with reviews</div>
  <h3 class="a-spacing-medium">Top reviews from the United States</h3>
${slice.map((r) => reviewHtml(r, o)).join('\n')}
  <div id="cm_cr-pagination_bar" class="a-text-center celwidget a-text-base">
    <ul class="a-pagination">
      ${prev}
      ${next}
    </ul>
  </div>
</div>`;
  return page({ title: `Amazon.com: Customer reviews: An Invented Test Book (page ${pageNo})`, lang: 'en-us', body });
}

/* ---------------------------------------------------------------- (c) ES product page, TESTASIN01 */

function buildProductEs() {
  const main = aMainReviews().slice(0, 3);
  const intl = aIntlReviews().slice(0, 1).map((r) => ({ ...r, foreignPrefix: true }));
  const o = { lang: 'es', asin: A_ASIN, productPage: true, tag: 'li' };
  const dyn = esc(JSON.stringify({
    'https://m.media-amazon.com/images/I/51TESTCOVER01._SY445_.jpg': [445, 300],
    'https://m.media-amazon.com/images/I/51TESTCOVER01._SY466_.jpg': [466, 314],
    'https://m.media-amazon.com/images/I/51TESTCOVER01._SY291_.jpg': [291, 196]
  }));
  const bullet = (label, value) => `<li><span class="a-list-item"><span class="a-text-bold">${label} &rlm; : &lrm;</span><span>${value}</span></span></li>`;
  const swatch = (id, name, price, selected) => `<div id="tmm-grid-swatch-${id}" class="a-column a-span3 a-spacing-micro swatchElement ${selected ? 'selected' : 'unselected'}"><span class="a-button ${selected ? 'a-button-selected' : 'a-button-unselected'} a-button-toggle format"><span class="a-button-inner"><a href="${selected ? 'javascript:void(0)' : `/-/es/dp/${A_ASIN}X/ref=tmm_${id.toLowerCase()}_swatch_0`}" class="a-button-text a-text-left" role="button"><span class="slot-title"><span aria-label="${name} Formato:" class="a-size-base a-color-base">${name}</span></span><br><span class="slot-price"><span aria-label="${price}" class="a-size-base a-color-price a-color-price">${price}</span></span><span class="slot-extraMessage"></span></a></span></span></div>`;
  const hist = [[5, 74], [4, 14], [3, 6], [2, 3], [1, 3]].map(([s, p]) => `<tr class="a-histogram-row a-align-center" aria-label="El ${p} por ciento de las reseñas tienen ${s} ${s === 1 ? 'estrella' : 'estrellas'}"><td class="aok-nowrap"><a class="a-link-normal ${s}star" href="/-/es/product-reviews/${A_ASIN}/ref=acr_dp_hist_${s}?ie=UTF8&amp;reviewerType=all_reviews">${s} ${s === 1 ? 'estrella' : 'estrellas'}</a></td><td class="a-span10"><div class="a-meter" role="progressbar" aria-valuenow="${p}%"><div class="a-meter-bar" style="width:${p}%"></div></div></td><td class="a-text-right"><a class="a-link-normal" href="#">${p}%</a></td></tr>`).join('\n');

  const body = `
<div id="dp-container" class="a-container">
<div id="dp" class="book es_US">
  <div id="leftCol">
    <div id="imageBlock"><div id="img-canvas" class="a-section"><img alt="Libro de Prueba: Subtítulo de prueba" src="/images/I/51TESTCOVER01._SY291_.jpg" data-a-dynamic-image="${dyn}" id="imgBlkFront" class="a-dynamic-image image-stretch-vertical frontImage" style="max-width:300px"></div></div>
  </div>
  <div id="centerCol">
    <div id="booksTitle" class="feature">
      <h1 id="title" class="a-size-large a-spacing-none"><span id="productTitle" class="a-size-extra-large celwidget">Libro de Prueba: Subtítulo de prueba</span>
        <span id="productSubtitle" class="a-size-large a-color-secondary">Tapa dura – 15 marzo 2019</span></h1>
      <div id="bylineInfo" class="a-section a-spacing-micro bylineHidden feature">
        <span class="author notFaded" data-width=""><a class="a-link-normal" href="/-/es/Autora-Ficticia/e/B000FAKE01">Autora Ficticia</a><span class="contribution" spacing="none"><span class="a-color-secondary">(Autor)</span><span class="a-color-secondary">,</span></span></span>
        <span class="author notFaded" data-width=""><a class="a-link-normal" href="/-/es/s?i=stripbooks&amp;field-author=Ilustrador+Inventado">Ilustrador Inventado</a><span class="contribution" spacing="none"><span class="a-color-secondary">(Ilustrador)</span></span></span>
      </div>
      <div id="averageCustomerReviews" class="a-spacing-none" data-asin="${A_ASIN}">
        <span id="acrPopover" class="reviewCountTextLinkedHistogram noUnderline" title="4,6 de 5 estrellas"><span class="a-declarative"><a href="javascript:void(0)" class="a-popover-trigger a-declarative"><span class="a-size-base a-color-base">4,6</span><i class="a-icon a-icon-star a-star-4-5 cm-cr-review-stars-spacing-big"><span class="a-icon-alt">4,6 de 5 estrellas</span></i></a></span></span>
        <span class="a-letter-space"></span>
        <a id="acrCustomerReviewLink" class="a-link-normal" href="#customerReviews"><span id="acrCustomerReviewText" class="a-size-base">1.234 calificaciones</span></a>
      </div>
    </div>
    <div id="tmmSwatches" class="a-section a-spacing-none">
      <div class="a-row">
        ${swatch('KINDLE', 'Versión Kindle', 'US$9.99', false)}
        ${swatch('HARDCOVER', 'Tapa dura', 'US$25.00', true)}
        ${swatch('PAPERBACK', 'Tapa blanda', 'US$18.50', false)}
      </div>
    </div>
    <div id="bookDescription_feature_div" class="a-section"><div class="a-expander-content"><span>Descripción de prueba de un libro inventado sobre un templo inventado.</span></div></div>
    <div id="rpi-attribute-book_details-fiona_pages" class="a-section a-spacing-none a-text-center rpi-attribute-content"><div class="a-section a-spacing-small a-text-center rpi-attribute-label"><span>Longitud de impresión</span></div><div class="a-section a-spacing-none a-text-center rpi-attribute-value"><span>192 páginas</span></div></div>
    <div id="rpi-attribute-language" class="a-section a-spacing-none a-text-center rpi-attribute-content"><div class="a-section a-spacing-small a-text-center rpi-attribute-label"><span>Idioma</span></div><div class="a-section a-spacing-none a-text-center rpi-attribute-value"><span>Español</span></div></div>
    <div id="rpi-attribute-book_details-publisher" class="a-section a-spacing-none a-text-center rpi-attribute-content"><div class="a-section a-spacing-small a-text-center rpi-attribute-label"><span>Editorial</span></div><div class="a-section a-spacing-none a-text-center rpi-attribute-value"><span>Editorial Inventada</span></div></div>
  </div>
  <div id="rightCol">
    <div id="buybox"><div class="a-section"><span id="price" class="a-size-medium a-color-price header-price a-text-normal">US$25.00</span></div></div>
  </div>
  <div id="detailBulletsWrapper_feature_div">
    <div id="detailBullets_feature_div">
      <ul class="a-unordered-list a-nostyle a-vertical a-spacing-none detail-bullet-list">
        ${bullet('Editorial', 'Editorial Inventada; 1ª edición (15 marzo 2019)')}
        ${bullet('Fecha de publicación', '15 marzo 2019')}
        ${bullet('Idioma', 'Español')}
        ${bullet('Tapa dura', '192 páginas')}
        ${bullet('ISBN-10', '8400000019')}
        ${bullet('ISBN-13', '978-8400000017')}
        ${bullet('Peso del producto', '1.2 kg')}
        ${bullet('Dimensiones', '24 x 2 x 30 cm')}
      </ul>
    </div>
    <ul class="a-unordered-list a-nostyle a-vertical a-spacing-none detail-bullet-list">
      <li><span class="a-list-item"><span class="a-text-bold">Clasificación en los más vendidos de Amazon:</span> nº 123,456 en Libros (<a href="/-/es/gp/bestsellers/books/ref=pd_zg_ts_books">Ver el Top 100 en Libros</a>)
        <ul class="a-unordered-list a-nostyle a-vertical zg_hrsr">
          <li><span class="a-list-item">nº 12 en <a href="/-/es/gp/bestsellers/books/1234/ref=pd_zg_hrsr_books">Arquitectura religiosa</a></span></li>
          <li><span class="a-list-item">nº 345 en <a href="/-/es/gp/bestsellers/books/5678/ref=pd_zg_hrsr_books">Historia de la arquitectura (Libros)</a></span></li>
        </ul></span></li>
      <li><span class="a-list-item"><span class="a-text-bold">Opiniones de clientes:</span> 4,6 de 5 estrellas 1.234 calificaciones</span></li>
    </ul>
  </div>
  <div id="reviewsMedley" class="a-section">
    <div id="cm_cr_dp_d_rating_histogram_wrapper">
      <h2>Opiniones de clientes</h2>
      <span data-hook="rating-out-of-text" class="a-size-medium a-color-base">4,6 de 5</span>
      <div data-hook="total-review-count" class="a-row a-spacing-medium"><span class="a-size-base a-color-secondary">1.234 calificaciones globales</span></div>
      <table id="histogramTable" class="a-normal a-align-center a-spacing-base">
${hist}
      </table>
    </div>
    <div id="cr-product-insights-cards" class="a-section">
      <h3 class="a-spacing-small">Los clientes dicen</h3>
      <div id="product-summary" class="a-section a-spacing-small a-spacing-top-small">
        <p class="a-spacing-small"><span>Los lectores de prueba destacan la calidad de las fotografías y la claridad de las explicaciones, aunque algunos consideran que el precio es elevado.</span></p>
        <p class="a-spacing-medium"><span class="a-size-base a-color-secondary">Generado por IA a partir del texto de las reseñas de clientes</span></p>
      </div>
      <div data-hook="cr-insights-widget-aspects" class="a-section a-spacing-medium">
        <span class="a-declarative"><span class="a-button a-button-base" data-sentiment="POSITIVE"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Calidad de las fotografías: 45 menciones positivas, 3 menciones negativas"><i class="a-icon a-icon-checkmark a-icon-mini"></i><span>Calidad de las fotografías</span></button></span></span></span>
        <span class="a-declarative"><span class="a-button a-button-base" data-sentiment="MIXED"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Relación calidad-precio: 12 menciones positivas, 11 menciones negativas"><i class="a-icon a-icon-mixed a-icon-mini"></i><span>Relación calidad-precio</span></button></span></span></span>
        <span class="a-declarative"><span class="a-button a-button-base" data-sentiment="NEGATIVE"><span class="a-button-inner"><button class="a-button-text" type="button" data-hook="cr-insights-aspect-link" aria-label="Tamaño de letra: 2 menciones positivas, 9 menciones negativas"><i class="a-icon a-icon-close a-icon-mini"></i><span>Tamaño de letra</span></button></span></span></span>
      </div>
    </div>
    <div id="cm-cr-dp-review-list" class="a-section review-views celwidget">
      <h3 data-hook="dp-local-reviews-header" class="a-spacing-medium a-spacing-top-large">Reseñas principales de Estados Unidos</h3>
      <ul class="a-unordered-list a-nostyle a-vertical">
${main.map((r) => reviewHtml(r, o)).join('\n')}
      </ul>
    </div>
    <div id="cm-cr-global-review-list" class="a-section review-views global-reviews-content celwidget">
      <h3 data-hook="dp-global-reviews-header" class="a-spacing-medium a-spacing-top-large">Reseñas principales de otros países</h3>
      <ul class="a-unordered-list a-nostyle a-vertical">
${intl.map((r) => reviewHtml(r, o)).join('\n')}
      </ul>
    </div>
    <div class="a-row a-spacing-large"><a data-hook="see-all-reviews-link-foot" class="a-link-emphasis a-text-bold" href="/-/es/portal/customer-reviews/${A_ASIN}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&amp;reviewerType=all_reviews">Ver más reseñas</a></div>
  </div>
</div>
</div>`;
  return page({ title: 'Libro de Prueba: Subtítulo de prueba: Autora Ficticia: Amazon.com: Libros', body });
}

/* ---------------------------------------------------------------- (d) sign-in, captcha, 404 */

function buildSignIn() {
  const body = `
<div class="a-section a-spacing-medium a-text-center"><a class="a-link-nav-icon" href="/ref=ap_frn_logo"><i class="a-icon a-icon-logo" role="img" aria-label="Amazon"></i></a></div>
<div id="authportal-main-section" class="a-section">
  <div class="a-box"><div class="a-box-inner a-padding-extra-large">
    <h1 class="a-spacing-small">Iniciar sesión</h1>
    <form name="signIn" method="post" novalidate action="/ap/signin" class="auth-validate-form auth-real-time-validation a-spacing-none">
      <input type="hidden" name="appActionToken" value="FAKE-TOKEN-FOR-TESTS">
      <label for="ap_email" class="a-form-label">Correo electrónico o número de teléfono móvil</label>
      <input type="email" maxlength="128" id="ap_email" name="email" tabindex="1" class="a-input-text a-span12 auth-autofocus auth-required-field">
      <span id="continue" class="a-button a-button-span12 a-button-primary"><span class="a-button-inner"><input id="continue-input" tabindex="5" class="a-button-input" type="submit"><span class="a-button-text" aria-hidden="true">Continuar</span></span></span>
    </form>
  </div></div>
</div>`;
  return page({ title: 'Iniciar sesión en Amazon', body });
}

function buildCaptcha() {
  const body = `
<div class="a-container a-padding-double-large">
  <h4>Introduce los caracteres que ves a continuación</h4>
  <p class="a-last">Lo sentimos, necesitamos asegurarnos de que no eres un robot. Para obtener los mejores resultados, asegúrate de que tu navegador acepta cookies.</p>
  <form method="get" action="/errors/validateCaptcha" name="">
    <input type="hidden" name="amzn" value="FAKE">
    <div class="a-row a-text-center"><img src="/images/G/01/captcha/fake.jpg" alt="captcha"></div>
    <input autocomplete="off" spellcheck="false" placeholder="Escribe los caracteres" id="captchacharacters" name="field-keywords" class="a-span12" autocapitalize="off" autocorrect="off" type="text">
    <span class="a-button a-button-primary a-span12"><span class="a-button-inner"><button type="submit" class="a-button-text">Continuar comprando</button></span></span>
  </form>
</div>`;
  return page({ title: 'Amazon.com', body });
}

function buildNotFound() {
  const body = `<div class="a-section a-text-center"><h1>Lo sentimos. No pudimos encontrar esa página</h1><p>Intenta buscar o ve a la <a href="/ref=cs_404_link">página de inicio de Amazon</a>.</p></div>`;
  return page({ title: 'Página no encontrada', body });
}

/* ---------------------------------------------------------------- write */

export const FIXTURE_FILES = {
  'resenas-portal-es.html': buildReviewsPortalEs,
  'resenas-paginadas-en-p1.html': () => buildPaginatedEn(1),
  'resenas-paginadas-en-p2.html': () => buildPaginatedEn(2),
  'resenas-paginadas-en-p3.html': () => buildPaginatedEn(3),
  'ficha-producto-es.html': buildProductEs,
  'inicio-sesion.html': buildSignIn,
  'captcha.html': buildCaptcha,
  'no-encontrado.html': buildNotFound
};

export function writeFixtures(dir = HERE) {
  for (const [name, build] of Object.entries(FIXTURE_FILES)) {
    writeFileSync(join(dir, name), build());
  }
  return Object.keys(FIXTURE_FILES);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = writeFixtures();
  console.log(`Fixtures generadas en tests/fixtures/: ${files.join(', ')}`);
}
