# Gaudí · Visualizador de reformas con IA (app en Excel)

Sube la foto de un piso o de una estancia, define el formato y las reformas, y obtén una imagen de cómo
quedará. **La estructura original se conserva siempre**: paredes, tabiques, ventanas, puertas, techo y altura,
vigas, pilares, escaleras y la perspectiva exacta de la foto.

## Descargas

| Archivo | Para qué |
|---|---|
| [`dist/Gaudi_Reformas.xlsm`](dist/Gaudi_Reformas.xlsm) | App completa para **Excel de escritorio** (Windows; Mac en pruebas). Genera la imagen automáticamente con IA y la coloca en un ANTES / DESPUÉS. |
| [`dist/Gaudi_Reformas_Movil.xlsx`](dist/Gaudi_Reformas_Movil.xlsx) | Versión **sin macros para móvil y tablet** (Excel para iOS/Android). Prepara el prompt y abre Gemini o ChatGPT. |

## Hojas de la app

- **INICIO**: instrucciones, leyenda y enlaces.
- **PROYECTO**: la pantalla principal. Rellenas de arriba abajo las celdas color crema (desplegables):
  1. Foto original
  2. Proyecto y estancia: estancia, tipo de reforma, estilo e intensidad
  3. Reformas por elemento: suelo, paredes, color, techo, puertas y ventanas, cocina, encimera, baño, iluminación y mobiliario, más notas libres
  4. Formato de la imagen: proporción, calidad/resolución, estilo de imagen (foto realista, render 3D, boceto…) y luz
  5. Estructura: bloqueo fijo + elementos extra que quieras conservar
  6. Resumen en español y estado
  7. Modo móvil: el **prompt** listo para copiar y botones para abrir Gemini y ChatGPT
- **RESULTADO**: ANTES y DESPUÉS lado a lado, con fecha, motor usado y enlace al archivo.
- **HISTORIAL**: registro de cada imagen generada o importada.
- **AJUSTES**: motor de IA (Google Gemini u OpenAI), modelo, carpeta de imágenes y claves API.

## Uso en el ordenador (generación automática)

1. Descarga `Gaudi_Reformas.xlsm`. Si Excel avisa de que las macros están bloqueadas: cierra Excel,
   haz clic derecho en el archivo › **Propiedades** › marca **Desbloquear** › Aceptar. Ábrelo y pulsa
   **Habilitar contenido**.
2. En **AJUSTES** pulsa **GUARDAR CLAVE GEMINI** y pega tu clave (se crea en
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Después pulsa **PROBAR CONEXIÓN**.
   La clave se guarda en tu equipo, no dentro del Excel, así que puedes compartir el archivo sin compartir la clave.
3. En **PROYECTO**: **CARGAR FOTO** › elige las opciones › **GENERAR IMAGEN CON IA**.
   En 1–2 minutos aparece el resultado en **RESULTADO**. La imagen también se guarda en
   `Imágenes\Gaudi Reformas` (o en la carpeta que indiques en AJUSTES).

¿No tienes clave API? Usa **COPIAR PROMPT + GEMINI WEB**. Abre Gemini, adjuntas la foto y pegas el texto.
Luego **IMPORTAR RESULTADO** coloca la imagen descargada en el ANTES / DESPUÉS y la añade al historial.

## Uso en el móvil (modo asistido)

1. Abre `Gaudi_Reformas_Movil.xlsx` con Excel para iOS/Android.
2. En **PROYECTO**, toca cada celda crema y elige en la lista.
3. En la sección 7, mantén pulsada la celda del **PROMPT** y elige **Copiar**.
4. Toca **Abrir Gemini** (o ChatGPT), adjunta la foto, pega el texto y envía.

## Cómo se conserva la estructura

- El prompt siempre incluye un **bloqueo de arquitectura**, que no se puede quitar. Pide mantener la misma
  posición de cámara, perspectiva y encuadre, y no mover, añadir ni quitar paredes, ventanas, puertas, vigas,
  pilares, etc. Solo cambian acabados, colores, sanitarios, lámparas y muebles.
- Se usan modelos de **edición** de imagen: reciben la foto original y la modifican, en lugar de inventar
  una estancia nueva. En Gemini es `gemini-3.1-flash-image` (recomendado) o `gemini-3-pro-image-preview`. En
  OpenAI es `gpt-image-1.5`, que se envía con `input_fidelity=high`, o `gpt-image-2`.
- La proporción recomendada es **«Igual que la foto original»**. Otras proporciones obligan a recortar o
  ampliar los bordes.
- El prompt va en inglés porque los modelos de imagen lo siguen con más precisión. El resumen se muestra en
  español.

## Limitaciones

- Las macros **no funcionan** en Excel para móvil ni en Excel para la web. Ahí se usa el modo asistido.
- En Mac, la generación automática es experimental: usa `curl` y depende de los permisos de Excel. Si falla,
  usa el modo asistido.
- Los nombres de los modelos cambian con el tiempo. Si un proveedor retira uno, escribe el nuevo en AJUSTES.
- Cada imagen generada por API tiene un coste según el proveedor y el modelo.
- La foto y las especificaciones se envían al proveedor elegido (Google u OpenAI) solo al generar.
- Las imágenes son orientativas. No sustituyen a un proyecto técnico ni a un presupuesto.

## Para desarrolladores

El Excel se genera con código, así que no se edita a mano:

```bash
python3 src/build_app.py          # genera dist/*.xlsm y dist/*.xlsx (requiere xlsxwriter, openpyxl y LibreOffice)
python3 src/tests/probar_vba.py   # pruebas de las macros ejecutadas en LibreOffice (modo VBA)
```

- `src/vba/`: código VBA (`modGaudi` botones, `modIA` llamadas a Gemini/OpenAI, `modUtil` utilidades).
- `src/listas.py`: opciones de los desplegables y su traducción para el prompt.
- `src/build_app.py`: hojas, formato, fórmulas del prompt, botones y empaquetado.
- `src/vbaproject.py`: escribe el `vbaProject.bin` (formatos MS-CFB y MS-OVBA) a partir del código fuente.
