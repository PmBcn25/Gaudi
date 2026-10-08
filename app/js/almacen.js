// Persistencia local: ajustes en localStorage, proyectos e imágenes en IndexedDB.

const CLAVE_AJUSTES = "gaudi.ajustes";
const CLAVE_BORRADOR = "gaudi.borrador";

export function leerAjustes() {
  const defecto = {
    motor: "gemini",
    modelo: { gemini: "gemini-3.1-flash-image", openai: "gpt-image-1.5" },
    clave: { gemini: "", openai: "" },
  };
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_AJUSTES) || "{}");
    return {
      ...defecto, ...guardado,
      modelo: { ...defecto.modelo, ...guardado.modelo },
      clave: { ...defecto.clave, ...guardado.clave },
    };
  } catch {
    return defecto;
  }
}

export function guardarAjustes(a) {
  localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(a));
}

export function leerBorrador() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
  } catch {
    return null;
  }
}

export function guardarBorrador(p) {
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(p));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

// ---------------------------------------------------------------- IndexedDB

let conexion;
function bd() {
  conexion ??= new Promise((ok, mal) => {
    const r = indexedDB.open("gaudi", 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("renders", { keyPath: "id", autoIncrement: true });
      s.createIndex("fecha", "fecha");
      r.result.createObjectStore("estado");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return conexion;
}

async function operar(modo, fn, almacen = "renders") {
  const db = await bd();
  return new Promise((ok, mal) => {
    const tx = db.transaction(almacen, modo);
    const resultado = fn(tx.objectStore(almacen));
    tx.oncomplete = () => ok(resultado?.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

// render = { fecha, proyecto, original: Blob, resultado: Blob, motor, modelo, prompt, segundos }
export const guardarRender = (render) => operar("readwrite", (s) => s.add(render));
export const borrarRender = (id) => operar("readwrite", (s) => s.delete(id));
export const leerRender = (id) => operar("readonly", (s) => s.get(id));
export async function listarRenders() {
  const todos = await operar("readonly", (s) => s.getAll());
  return (todos || []).sort((a, b) => b.fecha - a.fecha);
}
export const vaciarRenders = () => operar("readwrite", (s) => s.clear());

// Foto actual del proyecto (sobrevive si el móvil cierra la app al ir a Gemini)
export const guardarFotoActual = (foto) => operar("readwrite", (s) => s.put(foto, "foto"), "estado");
export const leerFotoActual = () => operar("readonly", (s) => s.get("foto"), "estado");
