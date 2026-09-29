# Extractor de reseñas de Amazon

Descarga **todas las reseñas** de un libro de Amazon (buenas y malas) y sus datos —portada, título, subtítulo, nota media, número de valoraciones, precio, formatos, páginas, editorial, ranking de ventas— en un archivo JSON para el panel de análisis KDP.

Por cada libro hace lo mismo que harías a mano: abre la página de reseñas, pulsa «Ver más reseñas» si aparece y después «Mostrar 10 opiniones más» una y otra vez hasta que no quedan más (o recorre las páginas «Página siguiente» si Amazon muestra la lista paginada), y lee cada reseña. Funciona con los enlaces de reseñas de tu lista (`…/portal/customer-reviews/8484788946/…`), con la ficha del libro (`…/dp/8484788946`) y con ASIN de Kindle (`B0…`).

Hay tres formas de usarlo:

| | Cuándo usarla |
|---|---|
| **1. Marcador** (recomendada) | Tu navegador de siempre, con tu sesión de Amazon. Un clic por libro. |
| **2. Consola del navegador** | Si no puedes o no quieres instalar el marcador. |
| **3. Playwright** (`npm run scrape`) | Muchos libros de una vez, de forma automática, desde la lista `data/enlaces.txt`. |

> **Importante:** desde finales de 2024 Amazon solo enseña la lista completa de reseñas si **has iniciado sesión**. Usa tu cuenta normal.

---

## 1. Marcador (recomendado)

### Instalarlo (una sola vez)

1. Abre el archivo `extractor/instalar-marcador.html` con tu navegador (doble clic).
2. Muestra la barra de marcadores: <kbd>Ctrl</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd> (Windows/Linux) o <kbd>⌘</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd> (Mac).
3. **Arrastra** el botón amarillo «📥 Extraer reseñas KDP» hasta la barra de marcadores.

Si no puedes arrastrarlo, en esa misma página está la opción «Créalo a mano»: copias la dirección del marcador (también está en `extractor/bookmarklet.txt`) y la pegas como URL de un marcador nuevo.

| Navegador | Notas |
|---|---|
| Chrome / Edge | Arrastrar funciona. No pegues el código en la barra de direcciones: Chrome borra el `javascript:` inicial. |
| Firefox | Arrastrar funciona. El marcador mide unos 61 000 caracteres, por debajo del límite de 65 536 de Firefox. |
| Safari | Activa la barra de Favoritos (<kbd>⌘</kbd>+<kbd>Mayús</kbd>+<kbd>B</kbd>) y arrastra el botón. Si no lo guarda, usa «Créalo a mano» o la consola (opción 2). |

Si se actualiza el extractor, vuelve a generar el marcador con `npm run bookmarklet` y reinstálalo.

### Usarlo

1. Inicia sesión en Amazon.
2. Abre la **ficha del libro** o directamente su **página de reseñas** (un enlace de `data/enlaces.txt`).
3. Pulsa el marcador. Aparece un panel abajo a la derecha:
   - **Si estás en la ficha**, el panel guarda precio, formatos y ranking, y abre la página de reseñas. **Cuando termine de cargar, pulsa el marcador otra vez.**
   - **En la página de reseñas**, el panel pulsa «Mostrar 10 opiniones más» él solo hasta el final, con pausas de 1 a 3 segundos entre clics para no saturar a Amazon. Verás las reseñas cargadas y los clics.
4. Opcional: marca **«Recorrer también los filtros por estrellas (más completo)»**. Amazon enseña como mucho unas 100 reseñas por lista; recorriendo los filtros de 5, 4, 3, 2 y 1 estrellas (en segundo plano, en la misma pestaña) se recogen muchas más. La casilla se lee al terminar la lista principal y se recuerda para la próxima vez.
5. Al terminar se descarga `resenas-<ASIN>.json` en tu carpeta de descargas. Los botones:
   - **Detener**: para en cuanto termine el paso en curso. Luego puedes descargar lo recogido.
   - **Descargar JSON**: vuelve a descargar (o descarga lo recogido hasta ahora).
   - **Copiar JSON**: lo copia al portapapeles.

Si no empezaste en la ficha, el panel lee igualmente el precio, los formatos y el ranking abriendo la ficha por detrás (una petición a la misma página de Amazon).

## 2. Pegar el código en la consola

1. En la página de reseñas del libro, abre las herramientas de desarrollo con <kbd>F12</kbd> (Mac: <kbd>⌥</kbd>+<kbd>⌘</kbd>+<kbd>J</kbd> en Chrome, <kbd>⌥</kbd>+<kbd>⌘</kbd>+<kbd>C</kbd> en Safari) y ve a la pestaña **Consola**.
2. En `extractor/instalar-marcador.html` pulsa «Copiar código para la consola», pégalo en la consola y pulsa <kbd>Intro</kbd>. (También vale el contenido completo de `extractor/extractor.js`.)
3. La primera vez el navegador bloquea el pegado y pide escribir **`permitir pegar`** (o **`allow pasting`** si está en inglés). Escríbelo, pulsa <kbd>Intro</kbd> y vuelve a pegar.

Aparece el mismo panel que con el marcador.

## 3. Automático con Playwright (`npm run scrape`)

Abre un Chromium aparte (con su propio perfil) y recorre todos los libros de la lista.

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm run scrape
```

- **Inicio de sesión una sola vez.** La primera vez Amazon pedirá iniciar sesión (o un captcha): hazlo en la ventana de Chromium que se abre. El programa espera hasta 10 minutos y sigue solo. La sesión se guarda en la carpeta `.perfil-amazon/` (ignorada por git), así que las siguientes veces ya no hará falta.
- Lee los enlaces de `data/enlaces.txt`: uno por línea; se ignoran las líneas vacías, las que empiezan por `#` y los **duplicados** (el programa dice cuáles ha saltado). Sirven enlaces de reseñas, de fichas (`/dp/…`) o ASIN sueltos.
- Por cada libro: ficha del producto → «Ver más reseñas» → «Mostrar 10 opiniones más» hasta el final → la misma lista filtrada por 5, 4, 3, 2 y 1 estrellas → guarda `data/raw/<ASIN>.json`. Si el archivo ya existía, **fusiona** las reseñas por id.
- Al final muestra un resumen: ASIN, título, reseñas extraídas, nota, valoraciones y precio.
- Si un libro falla, lo indica y sigue con el siguiente.

Opciones (van después de `--`):

| Opción | Qué hace |
|---|---|
| `--enlaces FICHERO` | Lista de enlaces (por defecto `data/enlaces.txt`). |
| `--salida CARPETA` | Dónde guardar los JSON (por defecto `data/raw`). |
| `--sin-estrellas` | No recorrer los filtros por estrellas (más rápido, menos completo). |
| `--headless` | Sin ventana. Solo cuando ya hayas iniciado sesión antes (sin ventana no se puede iniciar sesión). |
| `--max-clics N` | Límite de clics en «Mostrar más» por lista (por defecto 400). |
| `--base-url URL` | Dominio de Amazon (por defecto `https://www.amazon.com`). |
| `--perfil CARPETA` | Carpeta del perfil del navegador (por defecto `.perfil-amazon`). |
| `--ayuda` | Muestra la ayuda. |

Ejemplos:

```bash
npm run scrape -- --sin-estrellas
npm run scrape -- 8484788946 B01FN37I44
npm run scrape -- --enlaces otra-lista.txt --salida data/raw
```

El programa hace pausas aleatorias entre páginas (2–4 s) y entre libros (4–9 s) a propósito. Déjalo trabajar: con 8 libros y filtros por estrellas puede tardar unos minutos.

## Dónde quedan los datos y cómo llevarlos al panel

- `npm run scrape` guarda directamente en `data/raw/<ASIN>.json`.
- El marcador y la consola descargan `resenas-<ASIN>.json` en tu carpeta de descargas.

Para verlos en el panel:

- abre el panel, ve a la página **«Importar»** y arrastra los archivos `.json` (sirven los dos nombres), o
- copia los archivos a `data/raw/` y ejecuta `npm run build`.

El formato de los archivos está descrito en [`docs/formato-datos.md`](../docs/formato-datos.md).

## Límites y buenas prácticas

- **Amazon suele limitar cada lista** a unas 100 reseñas. Por eso existe el recorrido por estrellas. Aun así, `reviews.length` puede quedar por debajo del número de reseñas que anuncia Amazon (algunas solo se ven en el país de origen).
- **Hace falta haber iniciado sesión** para ver la lista completa.
- **Sé amable con Amazon:** no lances varias extracciones a la vez ni quites las pausas. Si aparece un captcha, resuélvelo y espera unos minutos antes de seguir.
- **Privacidad:** el código solo lee páginas de Amazon del mismo dominio en el que lo ejecutas (reseñas, páginas siguientes, ficha del libro) y la miniatura de la portada desde el servidor de imágenes de Amazon. No envía datos a ningún otro sitio: el resultado se queda en tu ordenador.
- **Amazon cambia su web de vez en cuando.** El extractor busca los elementos de varias formas (atributos `data-hook`, clases y texto), pero un cambio grande puede romper algo. Ver abajo cómo avisar.

## Solución de problemas

| Problema | Causa probable | Qué hacer |
|---|---|---|
| Al pulsar el marcador no pasa nada | La página no había terminado de cargar o el marcador se guardó incompleto | Espera a que cargue y repite. Si sigue igual, reinstálalo desde `instalar-marcador.html` o usa la consola. |
| «Amazon te pide iniciar sesión» | Sin sesión, Amazon no muestra la lista completa | Inicia sesión en esa misma pestaña, vuelve a la página de reseñas y pulsa el marcador. |
| «Comprobación de seguridad (captcha)» | Demasiadas páginas en poco tiempo | Resuélvelo, espera unos minutos y sigue. No uses varias pestañas o navegadores a la vez. |
| Salen unas 100 reseñas aunque el libro tiene más | Límite de Amazon por lista | Marca «Recorrer también los filtros por estrellas». Recuerda que `ratingsTotal` incluye valoraciones sin texto (compáralo con `reviewsWithText`). |
| «Terminado con avisos: Amazon dejó de cargar más reseñas» | El botón no respondió en 10 s (3 intentos) | Vuelve a intentarlo más tarde. Con `npm run scrape` las reseñas se fusionan por id, no se duplican. |
| El JSON no se descarga | El navegador bloquea descargas automáticas en amazon.com | Permite las descargas para ese sitio, o usa «Descargar JSON» / «Copiar JSON». |
| Faltan precio, formatos o ranking | Salen de la ficha del producto y no se pudo leer | Empieza desde la ficha del libro y pulsa el marcador allí; luego otra vez en la página de reseñas. |
| `coverData` vacío (`null`) | No se pudo descargar la miniatura de la portada | No afecta a nada más; el panel usará `cover` (la URL). |
| `npm run scrape`: «No encuentro el navegador Chromium de Playwright» | Falta el navegador de Playwright | `npx playwright install chromium` |
| `npm run scrape`: «El perfil … está en uso» | Otra ventana del extractor sigue abierta | Ciérrala y vuelve a lanzar el comando. |
| `npm run scrape --headless` falla con «pide iniciar sesión» | Sin ventana no se puede iniciar sesión | Ejecútalo una vez sin `--headless` e inicia sesión. |
| El panel no encuentra reseñas o el botón | Amazon ha cambiado su página | Avisa como se explica abajo. |

### Cómo avisar de un cambio en Amazon

1. En la página donde falla, pulsa <kbd>Ctrl</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>S</kbd> en Mac) y guárdala como «Página web, completa». Si no quieres compartir la página entera, haz clic derecho sobre una reseña → **Inspeccionar** → clic derecho en el elemento resaltado → **Copiar → Copiar outerHTML** y pégalo en un archivo de texto.
2. Anota la URL, el navegador y el mensaje del panel (o la salida de `npm run scrape`).
3. Pásaselo a quien mantenga el proyecto. Con eso se añade una página de prueba en `tests/fixtures/` que imita el nuevo formato y se ajusta el extractor.

## Para desarrolladores

| Archivo | Qué es |
|---|---|
| `extractor/extractor.js` | Script para la página (ES2019, un único IIFE, sin dependencias). Expone `window.KDPExtractor` (`parseReviews`, `parseBookMeta`, `parseProductPage`, `findLoadMore`, `expandAll`, `collect`, `toExport`, `run`…). Con `window.KDPX_NO_AUTORUN = true` no se ejecuta solo. |
| `extractor/scrape.mjs` | Programa de Playwright; inyecta `extractor.js` en cada página. |
| `tools/build-bookmarklet.mjs` | Genera `extractor/bookmarklet.txt` e `extractor/instalar-marcador.html` (`npm run bookmarklet`). Compacta el código sin dependencias externas (renombra funciones internas, quita comentarios y espacios) y comprueba que compila. |
| `tests/extractor.test.mjs` | Pruebas con Chromium de Playwright contra páginas locales que imitan Amazon (`tests/fixtures/`). |
| `tests/fixtures/` | Páginas de prueba con datos inventados (`generar-fixtures.mjs` las regenera) y `server.mjs`, un servidor local con las mismas rutas que Amazon. |

```bash
node --test tests/extractor.test.mjs      # pruebas (no hace falta conexión a Amazon)
node tests/fixtures/server.mjs            # sirve las páginas de prueba en http://127.0.0.1:8765
npm run bookmarklet                       # regenerar el marcador tras cambiar extractor.js
```

Tras modificar `extractor.js`, ejecuta `npm run bookmarklet`: hay una prueba que avisa si `bookmarklet.txt` está desactualizado.
