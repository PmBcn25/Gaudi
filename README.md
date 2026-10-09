# Gaudí · Visualizador de reformas con IA

App web profesional para móvil y ordenador. Funciona así:
1. Haces o subes la foto de un piso o de una estancia.
2. Eliges las reformas y el formato.
3. La IA genera una imagen de cómo quedará, con un **antes y después** interactivo.

**La estructura original se conserva siempre**: paredes, tabiques, ventanas, puertas, techo y altura, vigas,
pilares, escaleras y la perspectiva exacta de la foto.

**Dirección de la app** (una vez publicada): https://pmbcn25.github.io/Gaudi/

## Qué incluye

- **Proyecto**: en esta pantalla se configura la reforma.
  - Foto: desde la cámara o la galería, o arrastrándola en el ordenador.
  - Estancia, tipo de reforma, estilo e intensidad.
  - Suelo, paredes, color, techo, puertas y ventanas, iluminación, cocina, encimera, baño y mobiliario, más notas libres.
  - Formato de la imagen: proporción, calidad hasta 4K, estilo de imagen y luz.
  - Elementos extra que quieras conservar y un resumen en español.
- **Resultado**: comparador antes/después con deslizador. Permite descargar la imagen, descargar el antes y
  después en una sola imagen para enviar a clientes, compartir y generar otra versión.
- **Historial**: todas las imágenes generadas, guardadas en el dispositivo.
- **Ajustes**: motor de IA (Google Gemini u OpenAI), modelo, clave API y prueba de conexión.
- **Sin clave API**: copia las instrucciones y abre Gemini o ChatGPT. Después puedes importar el resultado
  para verlo en el antes y después.
- **Instalable**: se añade a la pantalla de inicio del móvil como una app más y abre aunque no haya conexión.
  Para generar imágenes sí hace falta Internet.

## Cómo se conserva la estructura

- Las instrucciones para la IA siempre llevan un **bloqueo de arquitectura** que no se puede quitar. Pide
  mantener la misma cámara, perspectiva y encuadre, y no mover, añadir ni quitar paredes, ventanas, puertas,
  vigas ni pilares. Solo cambian acabados, colores, sanitarios, lámparas y muebles.
- Se usan modelos de **edición** de imagen, que modifican la foto original en lugar de inventar una estancia
  nueva:
  - Gemini: `gemini-3.1-flash-image` (recomendado) y `gemini-3-pro-image-preview`.
  - OpenAI: `gpt-image-1.5` (con `input_fidelity=high`) y `gpt-image-2`.

## Publicarla (una sola vez)

1. Pasa los cambios de esta rama a `main` (con una pull request o un merge).
2. En GitHub, ve a **Settings › Pages** y en «Source» elige **GitHub Actions**.
3. El flujo `.github/workflows/publicar-app.yml` publica la carpeta `app/` en
   `https://pmbcn25.github.io/Gaudi/` cada vez que cambie algo en `main`. También se puede lanzar a mano
   desde **Actions › Publicar app › Run workflow**.

## Usarla

1. Abre la dirección de la app en el móvil y añádela a la pantalla de inicio:
   - **iPhone (Safari)**: botón Compartir › «Añadir a pantalla de inicio».
   - **Android (Chrome)**: menú ⋮ › «Instalar aplicación».
2. En **Ajustes**, pega tu clave de Google Gemini y pulsa **Probar conexión**. La clave se crea en
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. En **Proyecto**: foto › opciones › **Generar imagen**.

## Privacidad y costes

- La app no tiene servidor propio. La foto y las instrucciones van directamente del dispositivo al proveedor
  de IA elegido, solo al pulsar Generar.
- La clave API y el historial se guardan únicamente en el dispositivo.
- Cada imagen generada por API tiene un coste según el proveedor y el modelo. El modo sin clave usa tu cuenta
  de Gemini o ChatGPT.
- Las imágenes son orientativas. No sustituyen a un proyecto técnico ni a un presupuesto.

## Para desarrolladores

App estática sin dependencias ni paso de compilación: HTML, CSS y JavaScript (módulos ES) en `app/`.

```bash
cd app && python3 -m http.server 8000                         # probar en local: http://localhost:8000
python3 src/exportar_opciones_web.py                         # regenerar app/js/opciones.js desde src/listas.py
NODE_PATH=$(npm root -g) node tests/probar_app_web.cjs       # pruebas en Chromium con la IA simulada (requiere playwright)
```

| Archivo | Contenido |
|---|---|
| `app/js/prompt.js` | Construcción de las instrucciones para la IA y del resumen |
| `app/js/ia.js` | Llamadas a Gemini (`generateContent`) y OpenAI (`images/edits`) |
| `app/js/almacen.js` | Ajustes (localStorage) e historial (IndexedDB) |
| `app/js/imagen.js` | Preparación de la foto y composición antes/después |
| `app/js/app.js` | Interfaz |
| `app/sw.js`, `app/manifest.webmanifest` | Instalación y funcionamiento sin conexión |

Para cambiar el nombre de la app, edita «Gaudí» en `app/index.html` y en `app/manifest.webmanifest`.

### Versión anterior en Excel

La primera versión en Excel sigue en `dist/` y su generador en `src/` (`build_app.py`, `vba/`).
Ya no es la versión principal.
