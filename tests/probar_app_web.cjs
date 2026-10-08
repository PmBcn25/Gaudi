// Prueba de extremo a extremo de la app web con Chromium (Playwright) y las APIs de IA simuladas.
// Uso:  node tests/probar_app_web.cjs [carpeta_capturas]
// Requiere playwright (npm i -D playwright) y Python 3 para servir la carpeta app/.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const zlib = require("zlib");

const APP = path.resolve(__dirname, "..", "app");
const CAPTURAS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "gaudi-capturas-"));
const PUERTO = 8765;
const URL_APP = `http://127.0.0.1:${PUERTO}/`;

// PNG sólido mínimo (para simular la imagen que devuelve la IA)
function png(ancho, alto, [r, g, b]) {
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3).map((_, i) => [r, g, b][i % 3])]);
  const datos = zlib.deflateSync(Buffer.concat(Array(alto).fill(fila)));
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const trozo = (tipo, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const t = Buffer.concat([Buffer.from(tipo), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([l, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), trozo("IHDR", ihdr), trozo("IDAT", datos), trozo("IEND", Buffer.alloc(0))]);
}

let fallos = 0;
function comprobar(cond, texto) {
  console.log(`${cond ? "OK   " : "FALLO"} ${texto}`);
  if (!cond) fallos++;
}

(async () => {
  const servidor = spawn("python3", ["-m", "http.server", String(PUERTO), "--bind", "127.0.0.1"], { cwd: APP, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const navegador = await chromium.launch();
  const foto = path.join(CAPTURAS, "salon.png");
  fs.writeFileSync(foto, png(1600, 1200, [196, 170, 140]));
  const errores = [];

  try {
    for (const [nombre, viewport, movil] of [["movil", { width: 390, height: 844 }, true], ["escritorio", { width: 1366, height: 900 }, false]]) {
      console.log(`\n== ${nombre} ==`);
      const ctx = await navegador.newContext({ viewport, isMobile: movil, hasTouch: movil, serviceWorkers: "block", locale: "es-ES" });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errores.push(`${nombre}: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errores.push(`${nombre}: ${m.text()}`));

      // APIs simuladas
      const peticiones = { gemini: null, openai: null };
      await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
        const req = route.request();
        if (req.method() === "GET") return route.fulfill({ status: 200, json: { name: "models/gemini-3.1-flash-image" } });
        peticiones.gemini = { url: req.url(), cabeceras: req.headers(), cuerpo: JSON.parse(req.postData()) };
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ status: 200, json: { candidates: [{ content: { parts: [
          { text: "Aquí tienes la reforma." },
          { inlineData: { mimeType: "image/png", data: png(40, 30, [0, 0, 0]).toString("base64") } },
          { inlineData: { mimeType: "image/png", data: png(1600, 1200, [120, 160, 150]).toString("base64") } },
        ] }, finishReason: "STOP" }] } });
      });
      await page.route("https://api.openai.com/**", async (route) => {
        const req = route.request();
        if (req.method() === "GET") return route.fulfill({ status: 200, json: { id: "gpt-image-1.5" } });
        peticiones.openai = { cabeceras: req.headers(), cuerpo: req.postDataBuffer() };
        return route.fulfill({ status: 200, json: { data: [{ b64_json: png(1536, 1024, [200, 120, 90]).toString("base64") }] } });
      });

      await page.goto(URL_APP);
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-1-inicio.png`), fullPage: true });

      // 1. Foto
      await page.setInputFiles("#entrada-galeria", foto);
      await page.waitForSelector("#foto-previa:not([hidden])");
      comprobar((await page.textContent("#foto-info")).includes("1600×1200"), "foto cargada y medida");

      // 2. Opciones
      await page.selectOption("#c-estancia", "Cocina");
      await page.selectOption("#c-cocina", "Verde salvia");
      await page.selectOption("#c-encimera", "Cuarzo blanco");
      await page.click('[data-campo="calidad"] button:has-text("Máxima")');
      await page.fill("#c-nombre", "Piso Gràcia");
      await page.fill("#c-conservar", "la chimenea");
      const prompt = await page.textContent("#prompt-texto");
      comprobar(prompt.includes("space: kitchen") && prompt.includes("Kitchen cabinets: sage green cabinets"), "prompt actualizado con las opciones");
      comprobar(prompt.includes("STRICT RULE - KEEP THE ORIGINAL ARCHITECTURE") && prompt.includes("la chimenea"), "bloqueo de estructura y elementos a conservar");
      comprobar((await page.textContent("#resumen")).includes("Verde salvia"), "resumen en español");
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-2-proyecto.png`), fullPage: true });

      // 3. Sin clave: aviso
      await page.click("#generar");
      comprobar(await page.isVisible("#dlg-mensaje"), "pide la clave API si falta");
      await page.click("#mensaje-extra");
      comprobar(await page.isVisible("#vista-ajustes"), "lleva a Ajustes");

      // 4. Ajustes
      await page.fill("#a-clave", "AIzaPRUEBA123");
      await page.click("#a-probar");
      await page.waitForSelector("#dlg-mensaje[open]");
      comprobar((await page.textContent("#mensaje-titulo")) === "Conexión correcta", "probar conexión");
      await page.click('#dlg-mensaje button[value="ok"]');
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-3-ajustes.png`), fullPage: true });

      // 5. Generar con Gemini
      await page.click('[data-ir="proyecto"]');
      await page.click("#generar");
      await page.waitForSelector("#generando:not([hidden])");
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-4-generando.png`) });
      await page.waitForSelector("#vista-resultado.activa #resultado-contenido:not([hidden])", { timeout: 15000 });
      const g = peticiones.gemini;
      comprobar(g && g.url.endsWith("/models/gemini-3.1-flash-image:generateContent"), "llama al modelo de Gemini correcto");
      comprobar(g && g.cabeceras["x-goog-api-key"] === "AIzaPRUEBA123", "envía la clave en la cabecera");
      const partes = g?.cuerpo?.contents?.[0]?.parts || [];
      comprobar(partes[0]?.text?.includes("Kitchen cabinets") && partes[1]?.inline_data?.mime_type === "image/jpeg" && partes[1].inline_data.data.length > 1000, "cuerpo con prompt y foto");
      comprobar(JSON.stringify(g?.cuerpo?.generationConfig) === JSON.stringify({ responseModalities: ["TEXT", "IMAGE"], imageConfig: { imageSize: "4K" } }), "configuración de imagen (4K, proporción original)");
      const tamDespues = await page.$eval("#img-despues", (i) => [i.naturalWidth, i.naturalHeight]);
      comprobar(tamDespues[0] === 1600, "muestra la última imagen devuelta");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-5-resultado.png`), fullPage: true });

      // Descargas
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#descargar")]);
      comprobar(/^Piso_Gracia_\d{4}-\d{2}-\d{2}_\d{4}\.png$/.test(descarga.suggestedFilename()), `descarga: ${descarga.suggestedFilename()}`);
      const [comp] = await Promise.all([page.waitForEvent("download"), page.click("#descargar-comp")]);
      const compRuta = path.join(CAPTURAS, `${nombre}-antes-despues.jpg`);
      await comp.saveAs(compRuta);
      comprobar(fs.statSync(compRuta).size > 10000, "descarga antes/después compuesta");

      // 6. OpenAI
      await page.click('[data-ir="ajustes"]');
      await page.click('#a-motor button[data-motor="openai"]');
      comprobar((await page.inputValue("#a-modelo")) === "gpt-image-1.5", "modelo por defecto de OpenAI");
      await page.fill("#a-clave", "sk-prueba");
      await page.click("#a-guardar");
      await page.click('[data-ir="proyecto"]');
      await page.selectOption("#c-proporcion", "Horizontal 16:9");
      await page.click("#generar");
      await page.waitForFunction(() => document.querySelector("#resultado-meta").textContent.includes("OpenAI"), null, { timeout: 15000 });
      const o = peticiones.openai;
      const multipart = o ? o.cuerpo.toString("latin1") : "";
      comprobar(o && o.cabeceras.authorization === "Bearer sk-prueba", "OpenAI: clave en Authorization");
      comprobar(['name="model"\r\n\r\ngpt-image-1.5', 'name="size"\r\n\r\n1536x1024', 'name="quality"\r\n\r\nhigh',
        'name="input_fidelity"\r\n\r\nhigh', 'name="image[]"; filename="foto.jpg"'].every((t) => multipart.includes(t)), "OpenAI: formulario multipart correcto");

      // 7. Historial
      await page.click('[data-ir="historial"]');
      await page.waitForSelector("#galeria li");
      comprobar((await page.$$("#galeria li")).length === 2, "historial con 2 imágenes");
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-6-historial.png`), fullPage: true });
      await page.click("#galeria li:last-child .ficha");
      const abierto = await page.waitForFunction(() => document.querySelector("#resultado-meta").textContent.includes("Gemini"),
        null, { timeout: 5000 }).then(() => true, () => false);
      comprobar(abierto, "abrir un render del historial");

      // 8. Modo asistido + importar
      await page.click('[data-ir="proyecto"]');
      await page.click("#modo-asistido");
      await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-7-asistido.png`) });
      await page.setInputFiles("#importar", foto);
      await page.waitForFunction(() => document.querySelector("#resultado-meta").textContent.includes("Importada"), null, { timeout: 10000 });
      comprobar(true, "importar resultado del modo asistido");

      // 9. Persistencia tras recargar
      await page.reload();
      await page.click('[data-ir="proyecto"]');
      await page.waitForSelector("#foto-previa:not([hidden])");
      comprobar((await page.inputValue("#c-nombre")) === "Piso Gràcia" && (await page.inputValue("#c-estancia")) === "Cocina", "recuerda el proyecto y la foto al recargar");
      await ctx.close();
    }

    // Service worker y manifiesto
    const ctx = await navegador.newContext();
    const page = await ctx.newPage();
    await page.goto(URL_APP);
    const sw = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
    comprobar(sw === "activated" || sw === "activating", `service worker ${sw}`);
    const manifiesto = await (await page.request.get(URL_APP + "manifest.webmanifest")).json();
    comprobar(manifiesto.icons.length === 4 && manifiesto.display === "standalone", "manifiesto instalable");
    await ctx.close();
  } finally {
    await navegador.close();
    servidor.kill();
  }
  comprobar(errores.length === 0, `sin errores en consola${errores.length ? ": " + errores.join(" | ") : ""}`);
  console.log(`\nCapturas en ${CAPTURAS}`);
  process.exit(fallos ? 1 : 0);
})();
