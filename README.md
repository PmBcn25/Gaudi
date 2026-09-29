# Catenaria · Radar de nichos KDP

Panel para decidir si un nicho de Amazon KDP merece la pena y cómo enfocar un libro en él, a partir de las reseñas de los libros que ya se venden. Viene preparado con el nicho **Gaudí y la Sagrada Família** (8 libros únicos de los 15 enlaces recibidos; los repetidos se descartan solos).

> *Catenaria*: Gaudí colgaba cadenas con pesos para que la gravedad le dibujara la forma exacta de sus arcos. El panel hace lo mismo con el mercado: cuelga cientos de reseñas y deja que marquen la forma de tu libro.

## Qué incluye

| Sección | Qué verás |
|---|---|
| **Inicio** | Puntuación del nicho (0-100) con su veredicto, cifras clave, gráficas (demanda por libro, antigüedad del mercado, elogios frente a quejas, Amazon frente a Goodreads, estrellas, reseñas por año), el porqué de ahora y accesos a todo |
| **Libros** | Cada libro con su portada, título, subtítulo, valoraciones, estrellas y precio; su ficha con lo que hace bien, dónde superarlo y qué tiene desfasado |
| **Reseñas** | Una página por libro con **las buenas y las malas**, filtros por estrellas y temas, búsqueda y orden |
| **Comparativa · Temas · Competencia ampliada · Contexto 2026** | Tabla comparativa, explorador de temas con ejemplos, otros libros del nicho y lo que ha pasado en 2025-2026 |
| **Nichos · Avatares · Enfoques** | Subnichos recomendados y a evitar, perfiles de lector y cinco enfoques con formato y precio |
| **Cómo entrar · Cómo no entrar** | Recomendaciones y lo que no debes poner nunca (si una lista queda vacía, el panel lo dice) |
| **Título y posicionamiento · Plan de acción** | Títulos, palabras clave, categorías, descripción, calculadora de regalías y pasos a seguir |
| **Importar reseñas · Metodología · Propuestas** | Cómo extraer las reseñas, cómo se calcula todo y qué más se puede añadir |
| **Puntos fuertes y débiles** (al final) | Se abre en su propia ventana: lo que gusta de todos los libros (el listón que no debes copiar) y las quejas (tu oportunidad) |

## Cómo abrirlo

- **En tu ordenador:** abre `index.html` con doble clic. No necesita servidor.
- **En GitHub Pages:** activa Pages sobre esta rama y abre la URL del repositorio.
- **En claude.ai:** la versión publicada (`npm run bundle` genera `dist/catenaria.html`) guarda las reseñas importadas en el propio panel, así que Claude puede leerlas para afinar el análisis.

## Las reseñas de Amazon

El panel no puede entrar en Amazon por sí mismo: Amazon pide iniciar sesión para ver todas las reseñas. Por eso las reseñas se extraen **en tu navegador, con tu sesión**, y se importan después. El extractor hace exactamente lo que harías a mano: abre «Ver más reseñas» y pulsa «Mostrar 10 opiniones más» hasta que no quedan, y luego guarda cada reseña con su nota, fecha, país, compra verificada, votos de utilidad y texto, junto con los datos del libro (portada, título, subtítulo, valoraciones, nota, precio, ranking de ventas).

1. **Marcador (recomendado):** abre `extractor/instalar-marcador.html`, arrastra el botón a la barra de marcadores y púlsalo en la página de reseñas de cada libro. Descarga `resenas-ASIN.json`.
2. **Consola:** en la página de reseñas, F12 → Consola → pega el contenido de `extractor/extractor.js` (también lo puedes copiar desde la página *Importar reseñas* del panel).
3. **Automático:** `npm install`, `npx playwright install chromium` y `npm run scrape`. Se abre un navegador, inicias sesión una vez y recorre los enlaces de `data/enlaces.txt` (quita duplicados).

Después, en el panel, **Importar reseñas** → arrastra los `.json`. O cópialos en `data/raw/` y ejecuta `npm run build` para dejarlos en el repositorio.

Más detalles y solución de problemas en [`extractor/README.md`](extractor/README.md). Formato de los archivos: [`docs/formato-datos.md`](docs/formato-datos.md).

## De dónde salen los datos de partida

Mientras no importes las reseñas, el panel usa datos públicos recopilados el 29 de septiembre de 2026 con un buscador web, marcados con «≈» y con su fuente:

- `data/libros-base.json`: ficha de los 8 libros (valoraciones y precios aproximados).
- `data/senales-publicas.json`: 45 citas y paráfrasis de lectores y crítica, y 19 competidores más.
- `data/mercado.json`: contexto de 2026 (centenario, torre de Jesucristo, visitantes, beatificación, novedades editoriales).
- `data/insights.js`: la estrategia (nichos, avatares, enfoques, cómo entrar y cómo no entrar, posicionamiento, plan).

Al importar las reseñas, los datos exactos de Amazon sustituyen a los aproximados y todas las gráficas, temas y puntuaciones se recalculan.

## Estructura

```
index.html                 panel (abre este archivo)
assets/css/app.css         estilos (tema claro y oscuro)
assets/js/lexicon.js       diccionario de temas en español e inglés
assets/js/analysis.js      motor de análisis: temas, elogios/quejas/deseos, estadísticas, puntuación del nicho
assets/js/charts.js        gráficas SVG sin dependencias
assets/js/{ui,store,views,app}.js   interfaz, almacenamiento de importaciones, vistas y enrutado
data/                      datos de partida, enlaces, reseñas extraídas (data/raw/) y dataset generado
extractor/                 extractor de reseñas (marcador, consola y Playwright)
tools/                     build-data (genera data/dataset.js), bundle-artifact y build-bookmarklet
tests/                     pruebas (node --test)
```

## Comandos

```bash
npm install          # instala Playwright (solo para el extractor automático y las pruebas)
npm run build        # data/*.json + data/raw/*.json → data/dataset.js
npm run scrape       # extractor automático con Playwright
npm run bookmarklet  # regenera el marcador a partir de extractor/extractor.js
npm run bundle       # panel en un solo HTML para publicarlo (dist/catenaria.html)
npm test             # pruebas
```

## Usarlo con otro nicho

1. Cambia los enlaces de `data/enlaces.txt`.
2. Extrae e importa las reseñas.
3. Ajusta `data/libros-base.json` (opcional) y, si el tema es muy distinto, el diccionario `assets/js/lexicon.js`.
4. Reescribe `data/insights.js` con la estrategia del nuevo nicho.

## Límites

- Las valoraciones son una pista de la demanda, no ventas reales; el ranking de ventas (BSR) que captura el extractor es mejor indicador.
- Amazon limita cuántas reseñas lista por filtro; el extractor recorre también los filtros por estrellas.
- El clasificador de temas es un diccionario: acierta en lo frecuente y falla con la ironía. Revisa siempre los ejemplos.
- Usa el extractor con calma y solo para tu investigación personal.
