# Formato de datos de las reseñas (`kdp-reviews/1`)

Cada libro extraído de Amazon se guarda en **un archivo JSON** (UTF-8, sangría de 2 espacios) con el esquema `kdp-reviews/1`. Lo generan dos herramientas con exactamente el mismo formato:

| Herramienta | Nombre del archivo | Dónde queda |
|---|---|---|
| Marcador o consola (`extractor/extractor.js`) | `resenas-<ASIN>.json` | Carpeta de descargas del navegador |
| Playwright (`npm run scrape`) | `<ASIN>.json` | `data/raw/` (o la carpeta de `--salida`) |

El nombre del archivo es orientativo: lo que identifica el formato es el campo `schema`, y el libro, `book.asin`.

Reglas generales:

- Todas las claves están **siempre presentes**. Un dato desconocido vale `null`; una lista sin elementos vale `[]`.
- Las fechas van en formato `AAAA-MM-DD` (ISO 8601) cuando se pueden interpretar; el texto original se conserva aparte.
- Los números son números JSON (no texto): `1234`, `4.6`, `25`.
- Quien lea estos archivos debe **ignorar las claves que no conozca**: se podrán añadir campos nuevos sin cambiar de versión. Un cambio incompatible usaría `kdp-reviews/2`.

## Ejemplo

```json
{
  "schema": "kdp-reviews/1",
  "exportedAt": "2026-09-29T10:43:57.255Z",
  "tool": "marcador/1.0.0",
  "pageUrl": "https://www.amazon.com/-/es/portal/customer-reviews/8484788946/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews",
  "marketplace": "www.amazon.com",
  "complete": true,
  "clicks": 12,
  "book": {
    "asin": "8484788946",
    "title": "Título del libro",
    "subtitle": "Subtítulo del libro",
    "authors": ["Nombre Autor"],
    "cover": "https://m.media-amazon.com/images/I/51abcdef._SY466_.jpg",
    "coverData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ…",
    "rating": 4.6,
    "ratingsTotal": 1234,
    "reviewsWithText": 456,
    "histogram": { "5": 74, "4": 14, "3": 6, "2": 3, "1": 3 },
    "price": { "text": "US$25.00", "amount": 25, "currency": "USD", "format": "Tapa dura" },
    "formats": [
      { "format": "Versión Kindle", "price": { "text": "US$9.99", "amount": 9.99, "currency": "USD" } },
      { "format": "Tapa dura", "price": { "text": "US$25.00", "amount": 25, "currency": "USD" } }
    ],
    "formatLine": "Tapa dura – 15 marzo 2019",
    "pages": 192,
    "publisher": "Editorial",
    "publicationDate": "2019-03-15",
    "language": "Español",
    "isbn10": "8484788946",
    "isbn13": "9788484788942",
    "bestSellersRank": [
      { "rank": 123456, "category": "Libros" },
      { "rank": 12, "category": "Arquitectura religiosa" }
    ],
    "customersSay": "Los clientes destacan la calidad de las fotografías…",
    "aspects": [
      { "name": "Calidad de las fotografías", "sentiment": "positive", "positive": 45, "negative": 3 }
    ]
  },
  "reviews": [
    {
      "id": "R2ZVDXXXXXXXXX",
      "author": "Nombre del cliente",
      "rating": 5,
      "title": "Título de la reseña",
      "body": "Primer párrafo.\nSegundo párrafo.",
      "date": "2023-03-03",
      "dateText": "Revisado en Estados Unidos el 3 de marzo de 2023",
      "country": "Estados Unidos",
      "verified": true,
      "vine": false,
      "format": "Tapa dura",
      "helpful": 12,
      "images": 2,
      "section": "main"
    }
  ]
}
```

## Campos de primer nivel

| Campo | Tipo | Descripción |
|---|---|---|
| `schema` | texto | Siempre `"kdp-reviews/1"`. |
| `exportedAt` | texto | Momento de la exportación, ISO 8601 en UTC. |
| `tool` | texto | `"marcador/<versión>"` (marcador o consola) o `"playwright/<versión>"` (`npm run scrape`). |
| `pageUrl` | texto | Página de reseñas desde la que se extrajo (sin filtros por estrellas). |
| `marketplace` | texto | Dominio de Amazon (`location.host`), p. ej. `"www.amazon.com"`. |
| `complete` | booleano | `true` si la lista se recorrió hasta el final: ya no quedaba botón «Mostrar 10 opiniones más» ni «Página siguiente». `false` si se pulsó *Detener*, se alcanzó el límite de clics, Amazon dejó de responder o pidió iniciar sesión a mitad de camino. |
| `clicks` | número | Clics en «Mostrar más» más páginas siguientes cargadas, incluidos los recorridos por estrellas. |
| `book` | objeto | Datos del libro (ver abajo). |
| `reviews` | lista | Reseñas, sin duplicados (ver abajo). |

## `book`: datos del libro

Los datos comerciales (precio, formatos, páginas, editorial, ISBN, ranking) salen de la **ficha del producto** (`/dp/ASIN`). Nota, número de valoraciones, histograma y «Los clientes dicen» salen de la ficha o de la página de reseñas.

| Campo | Tipo | Descripción |
|---|---|---|
| `asin` | texto | ASIN de Amazon (ISBN-10 en libros impresos, `B0…` en Kindle). |
| `title` | texto | Título sin subtítulo: lo que va antes del primer `": "` del título de Amazon. |
| `subtitle` | texto \| null | Lo que va después del primer `": "` (Amazon escribe así los subtítulos). |
| `authors` | lista de textos | Autores y demás colaboradores de la ficha (ilustrador, traductor…). |
| `cover` | texto \| null | URL de la portada: la más grande disponible en la ficha, o la miniatura de la página de reseñas. |
| `coverData` | texto \| null | Miniatura de la portada incrustada como `data:image/…;base64,…` (unos 240 px de alto, 60 KB como máximo) para que el panel la muestre aunque las imágenes externas estén bloqueadas. `null` si no se pudo descargar (sin conexión, bloqueo, no es una imagen, pesa más de 60 KB o tardó más de 5 s). |
| `rating` | número \| null | Nota media, de 1 a 5 (p. ej. `4.6`). |
| `ratingsTotal` | número \| null | Total de valoraciones globales (con y sin texto). |
| `reviewsWithText` | número \| null | Cuántas de esas valoraciones tienen reseña escrita («… con reseñas»). |
| `histogram` | objeto \| null | Porcentaje de valoraciones de cada estrella: `{"5": 74, "4": 14, "3": 6, "2": 3, "1": 3}` (enteros de 0 a 100). Al ser claves numéricas, algunos programas las muestran en orden 1→5; el orden no importa. |
| `price` | objeto \| null | Precio del formato seleccionado en la ficha: `{ "text", "amount", "currency", "format" }` — texto tal cual (`"US$25.00"`), importe numérico, moneda ISO (`"USD"`, `"EUR"`, `"MXN"`…) y formato (`"Tapa dura"`). |
| `formats` | lista | Todos los formatos de la ficha: `[{ "format": "Tapa blanda", "price": { "text", "amount", "currency" } \| null }]`. |
| `formatLine` | texto \| null | Línea bajo el título de la ficha, p. ej. `"Tapa dura – 15 marzo 2019"`. |
| `pages` | número \| null | Número de páginas («Tapa dura: 192 páginas», «Longitud de impresión»). |
| `publisher` | texto \| null | Editorial, sin la edición ni la fecha entre paréntesis. |
| `publicationDate` | texto \| null | `AAAA-MM-DD`; si Amazon usa un formato que no se reconoce, el texto tal cual. |
| `language` | texto \| null | Idioma tal como aparece (`"Español"`, `"English"`…). |
| `isbn10` | texto \| null | 10 caracteres (dígitos y quizá una `X` final), sin guiones. |
| `isbn13` | texto \| null | 13 dígitos, sin guiones. |
| `bestSellersRank` | lista | Ranking de ventas: `[{ "rank": 123456, "category": "Libros" }, { "rank": 12, "category": "Arquitectura religiosa" }]`. La primera entrada suele ser la categoría general. |
| `customersSay` | texto \| null | Resumen «Los clientes dicen» / «Customers say» (sin la nota «Generado por IA…»). |
| `aspects` | lista | Etiquetas del resumen: `[{ "name", "sentiment", "positive", "negative" }]`; `sentiment` es `"positive"`, `"negative"`, `"mixed"` o `null`; `positive` y `negative` son el número de menciones o `null`. |

## `reviews[]`: cada reseña

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | ID de Amazon (p. ej. `"R2ZVDXXXXXXXXX"`). Si una reseña no lo muestra, `"h"` + 16 caracteres hexadecimales calculados a partir de autor, fecha, título y el inicio del texto (estable entre ejecuciones). |
| `author` | texto \| null | Nombre público del cliente. |
| `rating` | número \| null | Estrellas de la reseña (1–5). |
| `title` | texto \| null | Título de la reseña (sin el texto «5,0 de 5 estrellas»). En reseñas de otros países, el título original, no la traducción. |
| `body` | texto \| null | Texto completo; los párrafos se separan con `\n`. Sin «Leer más», «Informar» ni avisos de vídeo. En reseñas de otros países, el texto original. |
| `date` | texto \| null | Fecha de la reseña, `AAAA-MM-DD`. |
| `dateText` | texto \| null | Línea original, p. ej. `"Revisado en Estados Unidos el 3 de marzo de 2023"`. |
| `country` | texto \| null | País tal como lo escribe Amazon: `"Estados Unidos"`, `"México"`, `"United Kingdom"`… |
| `verified` | booleano | «Compra verificada» / «Verified Purchase». |
| `vine` | booleano | Reseña del programa Amazon Vine (producto gratuito). |
| `format` | texto \| null | Formato comprado: `"Tapa dura"`, `"Versión Kindle"`, `"Paperback"`… |
| `helpful` | número | Votos «útil» (`0` si no hay). |
| `images` | número | Fotos adjuntas por el cliente. |
| `section` | texto | Dónde apareció: `"main"` (lista principal de reseñas), `"international"` («Reseñas principales de otros países») o `"product-page"` (solo vista en la ficha del producto). |

## Duplicados y fusión

- En un mismo archivo **cada `id` aparece una sola vez**. Si una reseña se ve en varias listas (lista principal, filtros por estrellas, ficha del producto), se fusiona: se queda la sección más relevante (`main` > `international` > `product-page`), el texto más largo y los valores no vacíos.
- `npm run scrape` **fusiona** con el `data/raw/<ASIN>.json` que ya exista: reseñas unidas por `id` (la versión nueva gana) y datos del libro nuevos; los campos que ahora falten se conservan del archivo anterior. Así se pueden acumular reseñas en varias ejecuciones.
- Quien importe varios archivos del mismo `asin` (por ejemplo, uno del marcador y otro de Playwright) debe unirlos igual: reseñas por `id`, y para `book` los datos del archivo con `exportedAt` más reciente, completando los `null` con los del otro.

## Qué significan los totales

- `ratingsTotal` cuenta todas las valoraciones (también las que solo tienen estrellas); `reviewsWithText` las que tienen texto. `reviews.length` puede ser menor que `reviewsWithText`: Amazon muestra como máximo unas 100 reseñas por lista y algunas no se muestran en el país del mercado consultado. Recorrer los filtros por estrellas ayuda a acercarse al total.
- `complete: true` indica que la lista **que Amazon ofrecía** se recorrió entera, no que se tengan todas las reseñas existentes.
