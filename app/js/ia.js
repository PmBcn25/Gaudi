// Llamadas a los motores de IA. La clave API la pone el usuario y se queda en su dispositivo.

export const MOTORES = {
  gemini: {
    nombre: "Google Gemini",
    modelos: ["gemini-3.1-flash-image", "gemini-3-pro-image-preview"],
    urlClave: "https://aistudio.google.com/apikey",
  },
  openai: {
    nombre: "OpenAI",
    modelos: ["gpt-image-1.5", "gpt-image-2"],
    urlClave: "https://platform.openai.com/api-keys",
  },
};

const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const URL_OPENAI = "https://api.openai.com/v1/";
const TIEMPO_MAX_MS = 300_000;

export class ErrorIA extends Error {}

const blobABase64 = (blob) =>
  new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });

function base64ABlob(b64, tipo) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

async function peticion(url, opciones, signal) {
  const control = new AbortController();
  const plazo = setTimeout(() => control.abort(new DOMException("timeout", "TimeoutError")), TIEMPO_MAX_MS);
  signal?.addEventListener("abort", () => control.abort(signal.reason));
  try {
    const resp = await fetch(url, { ...opciones, signal: control.signal });
    let datos = null;
    try {
      datos = await resp.json();
    } catch {
      /* respuesta sin JSON */
    }
    return { estado: resp.status, datos };
  } catch (e) {
    if (e?.name === "TimeoutError" || control.signal.reason?.name === "TimeoutError") {
      throw new ErrorIA("La IA ha tardado más de 5 minutos en responder. Inténtalo de nuevo.");
    }
    if (e?.name === "AbortError") throw new ErrorIA("Generación cancelada.");
    throw new ErrorIA("No se pudo conectar con el servicio de IA. Comprueba tu conexión a Internet.");
  } finally {
    clearTimeout(plazo);
  }
}

function explicarError(motor, estado, datos) {
  const detalle = datos?.error?.message || "";
  const consejos = {
    400: "Petición rechazada. Revisa el modelo en Ajustes o prueba otra proporción.",
    401: "La clave API no es válida. Vuelve a introducirla en Ajustes.",
    403: "La clave API no tiene permiso para este modelo (puede que haya que activar la facturación).",
    404: "El modelo indicado en Ajustes no existe o ya no está disponible. Elige otro.",
    413: "La foto es demasiado pesada.",
    429: "Se ha alcanzado el límite de uso o la cuota de la cuenta. Espera unos minutos o revisa la facturación.",
  };
  const consejo = consejos[estado] || (estado >= 500 ? "El servicio está saturado. Inténtalo en unos minutos." : "");
  return new ErrorIA(`${motor} ha devuelto el error ${estado}. ${consejo}${detalle ? `\n\nDetalle: ${detalle}` : ""}`);
}

export function cuerpoGemini({ prompt, base64, tipo, proporcion, resolucion, modelo }) {
  const imageConfig = {};
  if (proporcion && proporcion !== "auto") imageConfig.aspectRatio = proporcion;
  if (resolucion && !modelo.includes("2.5")) imageConfig.imageSize = resolucion;
  const generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
  if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;
  return {
    contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: tipo, data: base64 } }] }],
    generationConfig,
  };
}

async function generarGemini({ clave, modelo, prompt, foto, proporcion, resolucion, signal }) {
  const cuerpo = cuerpoGemini({
    prompt, base64: await blobABase64(foto), tipo: foto.type || "image/jpeg", proporcion, resolucion, modelo,
  });
  const { estado, datos } = await peticion(
    `${URL_GEMINI}${encodeURIComponent(modelo)}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": clave }, body: JSON.stringify(cuerpo) },
    signal
  );
  if (estado !== 200) throw explicarError("Gemini", estado, datos);
  const partes = (datos?.candidates || []).flatMap((c) => c?.content?.parts || []);
  const imagenes = partes.map((p) => p.inlineData || p.inline_data).filter((d) => d?.data);
  if (!imagenes.length) {
    const texto = partes.map((p) => p.text).filter(Boolean).join(" ").slice(0, 400);
    const motivo = datos?.candidates?.[0]?.finishReason || datos?.promptFeedback?.blockReason || "";
    throw new ErrorIA(
      "Gemini ha respondido pero sin imagen." + (motivo ? ` Motivo: ${motivo}.` : "") +
        (texto ? `\n\nRespuesta: ${texto}` : "") + "\n\nPrueba otra vez o simplifica las notas."
    );
  }
  const ultima = imagenes[imagenes.length - 1]; // la imagen final es la última
  const tipo = ultima.mimeType || ultima.mime_type || "image/png";
  return base64ABlob(ultima.data, tipo);
}

const tamanoOpenAI = (p) =>
  ({ "16:9": "1536x1024", "4:3": "1536x1024", "3:2": "1536x1024", "1:1": "1024x1024",
     "9:16": "1024x1536", "3:4": "1024x1536", "4:5": "1024x1536" })[p] || "auto";

export function formularioOpenAI({ prompt, foto, proporcion, calidad, modelo }) {
  const f = new FormData();
  f.append("model", modelo);
  f.append("prompt", prompt);
  f.append("size", tamanoOpenAI(proporcion));
  if (calidad) f.append("quality", calidad);
  if (modelo === "gpt-image-1" || modelo.startsWith("gpt-image-1.5")) f.append("input_fidelity", "high");
  f.append("n", "1");
  const ext = (foto.type || "image/jpeg").split("/")[1].replace("jpeg", "jpg");
  f.append("image[]", foto, `foto.${ext}`);
  return f;
}

async function generarOpenAI({ clave, modelo, prompt, foto, proporcion, calidad, signal }) {
  const { estado, datos } = await peticion(
    `${URL_OPENAI}images/edits`,
    { method: "POST", headers: { Authorization: `Bearer ${clave}` },
      body: formularioOpenAI({ prompt, foto, proporcion, calidad, modelo }) },
    signal
  );
  if (estado !== 200) throw explicarError("OpenAI", estado, datos);
  const b64 = datos?.data?.[0]?.b64_json;
  if (!b64) throw new ErrorIA("OpenAI ha respondido pero sin imagen.");
  return base64ABlob(b64, "image/png");
}

export function generar(motor, opciones) {
  return motor === "openai" ? generarOpenAI(opciones) : generarGemini(opciones);
}

export async function probarClave(motor, clave, modelo) {
  const { estado, datos } =
    motor === "openai"
      ? await peticion(`${URL_OPENAI}models/${encodeURIComponent(modelo)}`, { headers: { Authorization: `Bearer ${clave}` } })
      : await peticion(`${URL_GEMINI}${encodeURIComponent(modelo)}`, { headers: { "x-goog-api-key": clave } });
  if (estado !== 200) throw explicarError(MOTORES[motor].nombre, estado, datos);
  return `Conexión correcta: la clave funciona y el modelo «${modelo}» está disponible.`;
}
