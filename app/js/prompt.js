// Construye el prompt para la IA y el resumen en español a partir de las elecciones del proyecto.
import { OPCIONES } from "./opciones.js";

// Campos del formulario: clave -> lista de opciones y valor por defecto (proyecto de ejemplo)
export const CAMPOS = {
  estancia: { lista: "estancia", etiqueta: "Estancia", defecto: "Salón-comedor" },
  tipo: { lista: "tipo", etiqueta: "Tipo de reforma", defecto: "Reforma integral" },
  estilo: { lista: "estilo", etiqueta: "Estilo decorativo", defecto: "Nórdico" },
  intensidad: { lista: "intensidad", etiqueta: "Intensidad del cambio", defecto: "Media" },
  suelo: { lista: "suelo", etiqueta: "Suelo", defecto: "Parquet de roble natural" },
  paredes: { lista: "paredes", etiqueta: "Paredes · acabado", defecto: "Pintura lisa" },
  color: { lista: "color", etiqueta: "Paredes · color", defecto: "Blanco roto" },
  techo: { lista: "techo", etiqueta: "Techo", defecto: "Liso blanco" },
  carpinteria: { lista: "carpinteria", etiqueta: "Puertas y ventanas", defecto: "Puertas lacadas en blanco" },
  cocina: { lista: "cocina", etiqueta: "Cocina · muebles", defecto: "Mantener / no aplica" },
  encimera: { lista: "encimera", etiqueta: "Cocina · encimera", defecto: "Mantener / no aplica" },
  bano: { lista: "bano", etiqueta: "Baño", defecto: "Mantener / no aplica" },
  iluminacion: { lista: "iluminacion", etiqueta: "Iluminación", defecto: "Lámparas colgantes de diseño" },
  mobiliario: { lista: "mobiliario", etiqueta: "Mobiliario y decoración", defecto: "Amueblar según el estilo" },
  proporcion: { lista: "proporcion", etiqueta: "Proporción", defecto: "Igual que la foto original" },
  calidad: { lista: "calidad", etiqueta: "Calidad", defecto: "Alta (2K)" },
  estiloImagen: { lista: "estiloImagen", etiqueta: "Estilo de imagen", defecto: "Foto realista" },
  luz: { lista: "luz", etiqueta: "Luz de la escena", defecto: "Luz natural de día" },
};

export function proyectoPorDefecto() {
  const p = { nombre: "Nuevo proyecto", notas: "", conservar: "" };
  for (const [clave, campo] of Object.entries(CAMPOS)) p[clave] = campo.defecto;
  return p;
}

export function opcion(clave, valor) {
  const lista = OPCIONES[CAMPOS[clave].lista];
  return lista.find((o) => o.es === valor) || lista.find((o) => o.es === CAMPOS[clave].defecto);
}

const en = (p, clave) => opcion(clave, p[clave]).en;

const ESTRUCTURA =
  "STRICT RULE - KEEP THE ORIGINAL ARCHITECTURE: this is the same real space after the renovation. " +
  "Keep exactly the same camera position, viewpoint, height, angle, lens, perspective, framing and " +
  "vanishing lines as in the original photo. Do not move, add, remove, resize or reshape any wall, " +
  "partition, window, door, opening, column, beam, arch, staircase, radiator or built-in element. " +
  "Keep the room dimensions, ceiling height, layout and proportions identical, so the new image " +
  "overlays perfectly on the original one. Only surfaces, finishes, colors, fixtures, light fittings " +
  "and furniture may change, as specified below.";

export function construirPrompt(p) {
  const conservar = (p.conservar || "").trim();
  const notas = (p.notas || "").trim();
  const partes = [
    `Interior renovation visualization. Edit the attached photo (space: ${en(p, "estancia")}) to show how it ` +
      `will look after this renovation: ${en(p, "tipo")}.`,
    ESTRUCTURA + (conservar ? ` Also keep exactly as they are: ${conservar}.` : ""),
    `Interior design style: ${en(p, "estilo")}. ${en(p, "intensidad")}`,
    `Changes: floor: ${en(p, "suelo")}. Wall finish: ${en(p, "paredes")}. Wall color: ${en(p, "color")}. ` +
      `Ceiling: ${en(p, "techo")}. Doors and windows: ${en(p, "carpinteria")}.` +
      (en(p, "cocina") === "-" ? "" : ` Kitchen cabinets: ${en(p, "cocina")}.`) +
      (en(p, "encimera") === "-" ? "" : ` Countertop: ${en(p, "encimera")}.`) +
      (en(p, "bano") === "-" ? "" : ` Bathroom: ${en(p, "bano")}.`) +
      ` Light fittings: ${en(p, "iluminacion")}. Furniture and decor: ${en(p, "mobiliario")}.`,
  ];
  if (notas) {
    partes.push(
      "Additional client requests (written in Spanish; follow them as long as they do not change the " +
        `architecture): ${notas}.`
    );
  }
  partes.push(
    `Output: ${en(p, "estiloImagen")}. Lighting: ${en(p, "luz")}. ${en(p, "proporcion")} Realistic materials ` +
      "and textures, correct real-world scale, coherent shadows and reflections. No text, labels, watermarks or people."
  );
  return partes.join(" ");
}

// Resumen legible en español: lista de [etiqueta, valor]
export function resumen(p) {
  const filas = [
    ["Estancia", `${p.estancia} · ${p.tipo}`],
    ["Estilo", `${p.estilo} (intensidad ${p.intensidad.toLowerCase()})`],
    ["Suelo", p.suelo],
    ["Paredes", `${p.paredes} · ${p.color}`],
    ["Techo", p.techo],
    ["Carpintería", p.carpinteria],
  ];
  if (en(p, "cocina") !== "-" || en(p, "encimera") !== "-") {
    filas.push(["Cocina", `${p.cocina} · encimera: ${p.encimera}`]);
  }
  if (en(p, "bano") !== "-") filas.push(["Baño", p.bano]);
  filas.push(["Iluminación", p.iluminacion], ["Mobiliario", p.mobiliario]);
  filas.push(["Imagen", `${p.proporcion} · ${p.calidad} · ${p.estiloImagen} · ${p.luz}`]);
  if ((p.notas || "").trim()) filas.push(["Notas", p.notas.trim()]);
  if ((p.conservar || "").trim()) filas.push(["Conservar", p.conservar.trim()]);
  return filas;
}

export const codigoProporcion = (p) => opcion("proporcion", p.proporcion).codigo;
export const calidadGemini = (p) => opcion("calidad", p.calidad).gemini;
export const calidadOpenAI = (p) => opcion("calidad", p.calidad).openai;
