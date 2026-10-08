// Gaudí · Visualizador de reformas — lógica de la interfaz.
import { OPCIONES } from "./opciones.js";
import {
  CAMPOS, proyectoPorDefecto, construirPrompt, resumen, codigoProporcion, calidadGemini, calidadOpenAI,
} from "./prompt.js";
import { MOTORES, generar, probarClave, ErrorIA } from "./ia.js";
import {
  leerAjustes, guardarAjustes, leerBorrador, guardarBorrador, guardarRender, borrarRender, leerRender,
  listarRenders, vaciarRenders, guardarFotoActual, leerFotoActual,
} from "./almacen.js";
import { prepararFoto, miniatura, composicion } from "./imagen.js";

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const estado = {
  proyecto: { ...proyectoPorDefecto(), ...(leerBorrador() || {}) },
  foto: null, // { blob, ancho, alto, nombre }
  fotoUrl: null,
  ajustes: leerAjustes(),
  actual: null, // render mostrado en Resultado
  urlsResultado: [],
  urlsGaleria: [],
  cancelar: null,
};

// ================================================================ utilidades

function tostada(texto) {
  const t = $("#tostada");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(tostada.plazo);
  tostada.plazo = setTimeout(() => (t.hidden = true), 2600);
}

function mensaje(titulo, texto, extra) {
  $("#mensaje-titulo").textContent = titulo;
  $("#mensaje-texto").textContent = texto;
  const b = $("#mensaje-extra");
  b.hidden = !extra;
  if (extra) {
    b.textContent = extra.texto;
    b.onclick = () => {
      $("#dlg-mensaje").close();
      extra.accion();
    };
  }
  $("#dlg-mensaje").showModal();
}

const nombreSeguro = (s) =>
  (s || "Reforma").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "Reforma";

const marcaFecha = (d = new Date()) =>
  d.toISOString().slice(0, 16).replace("T", "_").replace(":", "");

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    tostada("Instrucciones copiadas");
  } catch {
    mensaje("Copia manual", "No se pudo copiar automáticamente. Abre «Ver instrucciones para la IA» y copia el texto.");
  }
}

const extension = (blob) => ((blob.type || "").includes("jpeg") ? "jpg" : (blob.type || "image/png").split("/")[1]);

// ================================================================ navegación

function ir(vista) {
  $$(".vista").forEach((v) => v.classList.toggle("activa", v.id === `vista-${vista}`));
  $$(".pestana").forEach((p) => p.classList.toggle("activa", p.dataset.ir === vista));
  if (vista === "historial") pintarHistorial();
  window.scrollTo({ top: 0, behavior: "instant" });
  history.replaceState(null, "", `#${vista}`);
}

document.addEventListener("click", (e) => {
  const destino = e.target.closest("[data-ir]");
  if (destino) ir(destino.dataset.ir);
});

// ================================================================ formulario

function crearCampo(contenedor) {
  const clave = contenedor.dataset.campo;
  const campo = CAMPOS[clave];
  const lista = OPCIONES[campo.lista];
  const id = `c-${clave}`;
  if (contenedor.dataset.tipo === "segmentos") {
    contenedor.innerHTML = `<span id="${id}-t">${campo.etiqueta}</span>
      <div class="segmentos" role="radiogroup" aria-labelledby="${id}-t"></div>`;
    const grupo = $(".segmentos", contenedor);
    for (const o of lista) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.es;
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => cambiar(clave, o.es));
      grupo.append(b);
    }
  } else {
    contenedor.innerHTML = `<label for="${id}">${campo.etiqueta}</label><select id="${id}"></select>`;
    const sel = $("select", contenedor);
    for (const o of lista) sel.add(new Option(o.es, o.es));
    sel.addEventListener("change", () => cambiar(clave, sel.value));
  }
}

function pintarFormulario() {
  const p = estado.proyecto;
  for (const clave of Object.keys(CAMPOS)) {
    const cont = $(`[data-campo="${clave}"]`);
    if (!cont) continue;
    if (cont.dataset.tipo === "segmentos") {
      $$("button", cont).forEach((b) => {
        const activo = b.textContent === p[clave];
        b.classList.toggle("activo", activo);
        b.setAttribute("aria-checked", String(activo));
      });
    } else {
      $("select", cont).value = p[clave];
    }
  }
  $("#c-nombre").value = p.nombre;
  $("#c-notas").value = p.notas;
  $("#c-conservar").value = p.conservar;
  actualizarResumen();
}

function cambiar(clave, valor) {
  estado.proyecto[clave] = valor;
  guardarBorrador(estado.proyecto);
  pintarFormulario();
}

function pintarResumen(dl, filas) {
  dl.replaceChildren(
    ...filas.flatMap(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      return [dt, dd];
    })
  );
}

function actualizarResumen() {
  pintarResumen($("#resumen"), resumen(estado.proyecto));
  $("#prompt-texto").textContent = construirPrompt(estado.proyecto);
}

for (const [id, clave] of [["#c-nombre", "nombre"], ["#c-notas", "notas"], ["#c-conservar", "conservar"]]) {
  $(id).addEventListener("input", (e) => {
    estado.proyecto[clave] = e.target.value;
    guardarBorrador(estado.proyecto);
    actualizarResumen();
  });
}

// ================================================================ foto

function mostrarFoto() {
  const img = $("#foto-previa");
  if (estado.fotoUrl) URL.revokeObjectURL(estado.fotoUrl);
  estado.fotoUrl = estado.foto ? URL.createObjectURL(estado.foto.blob) : null;
  img.hidden = !estado.foto;
  $("#foto-vacia").hidden = !!estado.foto;
  $("#zona-foto").classList.toggle("con-foto", !!estado.foto);
  if (estado.foto) {
    img.src = estado.fotoUrl;
    $("#foto-info").textContent =
      `${estado.foto.nombre || "Foto"} · ${estado.foto.ancho}×${estado.foto.alto} px · ` +
      `${Math.round(estado.foto.blob.size / 1024)} KB`;
  }
}

async function cargarFoto(archivo) {
  if (!archivo) return;
  if (!archivo.type.startsWith("image/") && !/\.(heic|heif)$/i.test(archivo.name)) {
    mensaje("Formato no admitido", "Elige una imagen JPG, PNG o WEBP.");
    return;
  }
  try {
    const { blob, ancho, alto } = await prepararFoto(archivo);
    estado.foto = { blob, ancho, alto, nombre: archivo.name };
    guardarFotoActual(estado.foto).catch(() => {});
    mostrarFoto();
    tostada("Foto cargada");
  } catch (e) {
    mensaje("No se pudo cargar la foto", e.message);
  }
}

for (const id of ["#entrada-camara", "#entrada-galeria"]) {
  $(id).addEventListener("change", (e) => {
    cargarFoto(e.target.files[0]);
    e.target.value = "";
  });
}

const zona = $("#zona-foto");
zona.addEventListener("dragover", (e) => {
  e.preventDefault();
  zona.classList.add("arrastrando");
});
zona.addEventListener("dragleave", () => zona.classList.remove("arrastrando"));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  zona.classList.remove("arrastrando");
  cargarFoto(e.dataTransfer.files[0]);
});
zona.addEventListener("click", () => {
  if (!estado.foto) $("#entrada-galeria").click();
});
document.addEventListener("paste", (e) => {
  const archivo = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (archivo && $("#vista-proyecto").classList.contains("activa")) cargarFoto(archivo);
});

// ================================================================ generar

function mostrarGenerando(visible) {
  const capa = $("#generando");
  capa.hidden = !visible;
  clearInterval(mostrarGenerando.reloj);
  if (visible) {
    const t0 = Date.now();
    $("#generando-tiempo").textContent = "0 s";
    mostrarGenerando.reloj = setInterval(() => {
      $("#generando-tiempo").textContent = `${Math.round((Date.now() - t0) / 1000)} s`;
    }, 500);
  }
}

async function generarImagen() {
  if (!estado.foto) {
    mensaje("Falta la foto", "Primero sube la foto del piso o de la estancia (paso 1).");
    return;
  }
  const a = estado.ajustes;
  const motor = a.motor;
  const clave = a.clave[motor];
  if (!clave) {
    mensaje(
      "Falta la clave API",
      `Para generar automáticamente necesitas una clave de ${MOTORES[motor].nombre}. ` +
        "Configúrala en Ajustes, o genera sin clave con Gemini o ChatGPT.",
      { texto: "Ir a Ajustes", accion: () => ir("ajustes") }
    );
    return;
  }
  const p = structuredClone(estado.proyecto);
  const prompt = construirPrompt(p);
  const modelo = a.modelo[motor];
  const control = new AbortController();
  estado.cancelar = control;
  $("#generando-texto").textContent = `${MOTORES[motor].nombre} · ${modelo}. Suele tardar entre 20 segundos y 2 minutos.`;
  mostrarGenerando(true);
  const t0 = Date.now();
  try {
    const resultado = await generar(motor, {
      clave, modelo, prompt, foto: estado.foto.blob, proporcion: codigoProporcion(p),
      resolucion: calidadGemini(p), calidad: calidadOpenAI(p), signal: control.signal,
    });
    const render = {
      fecha: Date.now(), proyecto: p, original: estado.foto.blob, resultado,
      miniatura: await miniatura(resultado), motor: MOTORES[motor].nombre, modelo, prompt,
      segundos: Math.round((Date.now() - t0) / 1000),
    };
    render.id = await guardarRender(render);
    mostrarResultado(render);
    ir("resultado");
    tostada(`Imagen generada en ${render.segundos} s`);
  } catch (e) {
    if (e instanceof ErrorIA && e.message === "Generación cancelada.") tostada("Generación cancelada");
    else mensaje("No se pudo generar la imagen", e.message || String(e));
  } finally {
    estado.cancelar = null;
    mostrarGenerando(false);
  }
}

$("#generar").addEventListener("click", generarImagen);
$("#otra-version").addEventListener("click", () => {
  if (estado.actual && !estado.foto) {
    estado.foto = { blob: estado.actual.original, ancho: 0, alto: 0, nombre: "Foto original" };
  }
  generarImagen();
});
$("#cancelar").addEventListener("click", () => estado.cancelar?.abort());
$("#copiar-prompt").addEventListener("click", () => copiar(construirPrompt(estado.proyecto)));

// ================================================================ modo asistido

$("#modo-asistido").addEventListener("click", () => $("#dlg-asistido").showModal());
$("#asistido-copiar").addEventListener("click", () => copiar(construirPrompt(estado.proyecto)));
$("#importar").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  $("#dlg-asistido").close();
  try {
    const { blob } = await prepararFoto(archivo);
    const p = structuredClone(estado.proyecto);
    const render = {
      fecha: Date.now(), proyecto: p, original: estado.foto?.blob || null, resultado: blob,
      miniatura: await miniatura(blob), motor: "Importada", modelo: "Gemini / ChatGPT web",
      prompt: construirPrompt(p), segundos: 0,
    };
    render.id = await guardarRender(render);
    mostrarResultado(render);
    ir("resultado");
  } catch (err) {
    mensaje("No se pudo importar la imagen", err.message || String(err));
  }
});

// ================================================================ resultado

function mostrarResultado(render) {
  estado.actual = render;
  estado.urlsResultado.forEach(URL.revokeObjectURL);
  const urlDespues = URL.createObjectURL(render.resultado);
  const urlAntes = render.original ? URL.createObjectURL(render.original) : "";
  estado.urlsResultado = [urlDespues, urlAntes].filter(Boolean);
  $("#img-despues").src = urlDespues;
  $("#img-antes").src = urlAntes;
  $("#comparador").classList.toggle("sin-antes", !render.original);
  $("#resultado-vacio").hidden = true;
  $("#resultado-contenido").hidden = false;
  const fecha = new Date(render.fecha).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  $("#resultado-meta").textContent =
    `${render.proyecto.nombre} · ${fecha} · ${render.motor} (${render.modelo})` +
    (render.segundos ? ` · ${render.segundos} s` : "");
  pintarResumen($("#resultado-resumen"), resumen(render.proyecto));
  $("#descargar-comp").hidden = !render.original;
  $("#deslizador").value = 50;
  moverDivisor();
  modoVista("comparar");
}

function moverDivisor() {
  const v = $("#deslizador").value;
  $("#capa-antes").style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  $("#divisor").style.left = `${v}%`;
}
$("#deslizador").addEventListener("input", moverDivisor);

function modoVista(modo) {
  $("#comparador").dataset.modo = modo;
  $$("#modo-vista button").forEach((b) => b.classList.toggle("activo", b.dataset.modo === modo));
}
$$("#modo-vista button").forEach((b) => b.addEventListener("click", () => modoVista(b.dataset.modo)));

$("#descargar").addEventListener("click", () => {
  const r = estado.actual;
  descargarBlob(r.resultado, `${nombreSeguro(r.proyecto.nombre)}_${marcaFecha(new Date(r.fecha))}.${extension(r.resultado)}`);
});

$("#descargar-comp").addEventListener("click", async () => {
  const r = estado.actual;
  const blob = await composicion(r.original, r.resultado, r.proyecto.nombre);
  descargarBlob(blob, `${nombreSeguro(r.proyecto.nombre)}_antes_despues.jpg`);
});

$("#compartir").hidden = !navigator.canShare;
$("#compartir").addEventListener("click", async () => {
  const r = estado.actual;
  const archivo = new File([r.resultado], `${nombreSeguro(r.proyecto.nombre)}.${extension(r.resultado)}`,
    { type: r.resultado.type });
  try {
    if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: r.proyecto.nombre });
    else tostada("Este dispositivo no permite compartir archivos");
  } catch {
    /* el usuario canceló */
  }
});

// ================================================================ historial

async function pintarHistorial() {
  const renders = await listarRenders();
  estado.urlsGaleria.forEach(URL.revokeObjectURL);
  estado.urlsGaleria = [];
  $("#historial-vacio").hidden = renders.length > 0;
  const galeria = $("#galeria");
  galeria.replaceChildren(
    ...renders.map((r) => {
      const li = document.createElement("li");
      const url = URL.createObjectURL(r.miniatura || r.resultado);
      estado.urlsGaleria.push(url);
      const fecha = new Date(r.fecha).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
      li.innerHTML = `<button class="ficha" type="button"><img alt=""><span class="ficha-txt"><strong></strong><span></span></span></button>
        <button class="borrar" type="button" aria-label="Borrar">×</button>`;
      $("img", li).src = url;
      $("strong", li).textContent = r.proyecto.nombre;
      $(".ficha-txt span", li).textContent = `${r.proyecto.estancia} · ${r.proyecto.estilo} · ${fecha}`;
      $(".ficha", li).addEventListener("click", async () => {
        mostrarResultado(await leerRender(r.id));
        ir("resultado");
      });
      $(".borrar", li).addEventListener("click", async () => {
        if (!confirm(`¿Borrar «${r.proyecto.nombre}» del historial?`)) return;
        await borrarRender(r.id);
        if (estado.actual?.id === r.id) {
          estado.actual = null;
          $("#resultado-vacio").hidden = false;
          $("#resultado-contenido").hidden = true;
        }
        pintarHistorial();
      });
      return li;
    })
  );
}

// ================================================================ ajustes

function pintarAjustes() {
  const a = estado.ajustes;
  $$("#a-motor button").forEach((b) => b.classList.toggle("activo", b.dataset.motor === a.motor));
  $("#a-modelo").value = a.modelo[a.motor];
  $("#a-modelos").replaceChildren(...MOTORES[a.motor].modelos.map((m) => new Option(m, m)));
  $("#a-clave").value = a.clave[a.motor];
  $("#a-clave").placeholder = a.motor === "gemini" ? "AIza…" : "sk-…";
  $("#a-enlace-clave").href = MOTORES[a.motor].urlClave;
}

function leerFormularioAjustes() {
  const a = estado.ajustes;
  a.modelo[a.motor] = $("#a-modelo").value.trim() || MOTORES[a.motor].modelos[0];
  a.clave[a.motor] = $("#a-clave").value.trim();
}

$$("#a-motor button").forEach((b) =>
  b.addEventListener("click", () => {
    leerFormularioAjustes();
    estado.ajustes.motor = b.dataset.motor;
    guardarAjustes(estado.ajustes);
    pintarAjustes();
  })
);
$("#a-ver-clave").addEventListener("click", () => {
  const c = $("#a-clave");
  c.type = c.type === "password" ? "text" : "password";
  $("#a-ver-clave").textContent = c.type === "password" ? "Ver" : "Ocultar";
});
$("#a-guardar").addEventListener("click", () => {
  leerFormularioAjustes();
  guardarAjustes(estado.ajustes);
  pintarAjustes();
  tostada("Ajustes guardados");
});
$("#a-probar").addEventListener("click", async () => {
  leerFormularioAjustes();
  guardarAjustes(estado.ajustes);
  const a = estado.ajustes;
  if (!a.clave[a.motor]) {
    mensaje("Falta la clave", "Pega tu clave API y pulsa Probar conexión.");
    return;
  }
  const b = $("#a-probar");
  b.disabled = true;
  b.textContent = "Probando…";
  try {
    mensaje("Conexión correcta", await probarClave(a.motor, a.clave[a.motor], a.modelo[a.motor]));
  } catch (e) {
    mensaje("La conexión ha fallado", e.message || String(e));
  } finally {
    b.disabled = false;
    b.textContent = "Probar conexión";
  }
});
$("#a-borrar").addEventListener("click", () => {
  estado.ajustes.clave[estado.ajustes.motor] = "";
  guardarAjustes(estado.ajustes);
  pintarAjustes();
  tostada("Clave borrada de este dispositivo");
});
$("#a-borrar-todo").addEventListener("click", async () => {
  if (!confirm("¿Borrar todo el historial de este dispositivo? No se puede deshacer.")) return;
  await vaciarRenders();
  tostada("Historial borrado");
});

// ================================================================ instalación (PWA)

let avisoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  avisoInstalar = e;
  $("#instalar").hidden = false;
});
$("#instalar").addEventListener("click", async () => {
  if (!avisoInstalar) return;
  avisoInstalar.prompt();
  await avisoInstalar.userChoice;
  avisoInstalar = null;
  $("#instalar").hidden = true;
});
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ================================================================ inicio

$$("[data-campo]").forEach(crearCampo);
pintarFormulario();
pintarAjustes();
leerFotoActual()
  .then((foto) => {
    if (foto?.blob && !estado.foto) {
      estado.foto = foto;
      mostrarFoto();
    }
  })
  .catch(() => {});
listarRenders()
  .then((r) => r[0] && leerRender(r[0].id))
  .then((r) => r && mostrarResultado(r))
  .catch(() => {});
const inicial = location.hash.slice(1);
if (["proyecto", "resultado", "historial", "ajustes"].includes(inicial)) ir(inicial);
