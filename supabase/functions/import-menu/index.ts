// Edge Function: importar la carta con IA (fotos o PDF) → borrador revisable.
//
// Flujo:
//  1. El cliente crea una fila en `importaciones` (estado «subiendo») y sube los archivos a
//     storage `importaciones/<local_id>/<importacion_id>/…`.
//  2. Llama a esta función con { importacion_id }. Validamos sesión, email, propiedad y cuota,
//     marcamos «procesando» y respondemos 202 al momento.
//  3. En segundo plano, Claude lee la carta y devuelve un JSON con estructura fija que validamos
//     y guardamos en `importaciones.resultado` (estado «listo») o el motivo del fallo («error»).
//  4. El cliente consulta la fila hasta que cambia de estado y muestra el borrador para revisar.

import Anthropic from "npm:@anthropic-ai/sdk@0.131";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.131/helpers/beta/zod";
import { z } from "npm:zod@4";
import { corsHeaders, errorJson, json } from "../_shared/cors.ts";
import { adminClient, contextoDueno, HttpError } from "../_shared/supabase.ts";
import { comprobarCuota, registrarUso } from "../_shared/limites.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MODELO = "claude-sonnet-5-5";
const MAX_ARCHIVOS = 10;

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// ---------------------------------------------------------------------------
// Estructura fija que devuelve la IA
// ---------------------------------------------------------------------------
const PrecioIA = z.object({
  etiqueta: z.string().nullable().describe(
    "Etiqueta del precio tal como aparece (tapa, media, ración, copa, botella, pequeña, grande…). null si el plato tiene un único precio sin etiqueta.",
  ),
  importe: z.number().nullable().describe("Importe en euros con decimales (12.5 para «12,50 €»). null si no se lee."),
  texto_original: z.string().describe("El precio exactamente como está escrito en la carta."),
  dudoso: z.boolean().describe("true si el importe no se lee con seguridad."),
});

const PlatoIA = z.object({
  nombre: z.string().describe("Nombre del plato o bebida exactamente como aparece, sin traducir ni corregir."),
  descripcion: z.string().nullable().describe("Descripción tal como aparece en la carta. null si no tiene."),
  precios: z.array(PrecioIA),
  dudoso: z.boolean().describe("true si el nombre o el plato en sí no se leen con seguridad."),
  motivo_duda: z.string().nullable().describe("Explicación breve en español de qué revisar. null si no hay dudas."),
});

const CartaIA = z.object({
  legible: z.boolean().describe("false si las imágenes no contienen una carta legible."),
  categorias: z.array(z.object({
    nombre: z.string().describe("Nombre de la sección tal como aparece (Entrantes, Tapas, Bebidas…)."),
    platos: z.array(PlatoIA),
  })),
  avisos: z.array(z.string()).describe("Avisos generales en español para el dueño (por ejemplo, una foto cortada)."),
});

const SISTEMA = `Eres el asistente que digitaliza cartas de bares, cafeterías y restaurantes en España.
Recibes fotos o un PDF de la carta de un local y devuelves su contenido estructurado.

Reglas obligatorias:
- Transcribe solo lo que está escrito. No inventes platos, ingredientes, descripciones ni precios.
- Conserva los nombres, descripciones y precios tal como aparecen, en su idioma original. No traduzcas ni mejores los textos.
- Agrupa los platos en las categorías o secciones de la carta, en el mismo orden. Si la carta no tiene secciones, usa una única categoría llamada «Carta».
- Si un plato tiene varios precios (tapa, media y ración; copa y botella; tamaños), crea un precio por cada uno con su etiqueta.
- Los precios son en euros. Convierte «12,50 €» en 12.5. No calcules ni redondees precios.
- No rellenes alérgenos ni deduzcas ingredientes. Los alérgenos los marca siempre el dueño.
- Si algo no se lee con seguridad (un precio borroso, un nombre cortado, un plato dudoso), márcalo como dudoso y explica brevemente qué revisar. Es mejor marcar de más que acertar a ciegas.
- Si varias fotos se solapan, no dupliques platos.
- Ignora textos que no sean de la carta (dirección, redes sociales, publicidad), salvo que aclaren un precio.`;

const BodySchema = z.object({ importacion_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorJson("Método no permitido", 405);

  const admin = adminClient();
  try {
    const ctx = await contextoDueno(req, admin);
    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return errorJson("Petición no válida", 400);

    const { data: imp } = await admin
      .from("importaciones")
      .select("id, local_id, tipo, estado")
      .eq("id", body.data.importacion_id)
      .maybeSingle();
    if (!imp || imp.local_id !== ctx.local.id) return errorJson("Importación no encontrada", 404);
    if (imp.estado !== "subiendo") return errorJson("Esta importación ya se ha procesado", 409);

    await comprobarCuota(admin, ctx.local.id, "importacion");

    // Archivos subidos por el dueño en su carpeta privada.
    const carpeta = `${ctx.local.id}/${imp.id}`;
    const { data: lista, error: errLista } = await admin.storage.from("importaciones").list(carpeta, {
      sortBy: { column: "name", order: "asc" },
    });
    if (errLista) return errorJson("No hemos podido leer los archivos subidos.", 500);
    const archivos = (lista ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => `${carpeta}/${f.name}`);
    if (archivos.length === 0) return errorJson("No hay archivos que importar. Vuelve a subir la carta.", 400);
    if (archivos.length > MAX_ARCHIVOS) return errorJson(`Puedes subir hasta ${MAX_ARCHIVOS} fotos por importación.`, 400);

    await admin.from("importaciones").update({ estado: "procesando", archivos, modelo: MODELO }).eq("id", imp.id);

    EdgeRuntime.waitUntil(procesar(imp.id, ctx.local.id, imp.tipo as "fotos" | "pdf", archivos));
    return json({ ok: true, importacion_id: imp.id }, 202);
  } catch (e) {
    if (e instanceof HttpError) return errorJson(e.message, e.status, e.codigo);
    console.error(e);
    return errorJson("Algo ha fallado. Inténtalo de nuevo.", 500);
  }
});

async function procesar(importacionId: string, localId: string, tipo: "fotos" | "pdf", archivos: string[]) {
  const admin = adminClient();
  const fallar = (mensaje: string) =>
    admin.from("importaciones").update({ estado: "error", error: mensaje }).eq("id", importacionId);

  try {
    const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const ruta of archivos) {
      const { data, error } = await admin.storage.from("importaciones").download(ruta);
      if (error || !data) {
        await fallar("No hemos podido abrir uno de los archivos. Vuelve a subirlo.");
        return;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (tipo === "pdf" && contarPaginasPdf(bytes) > MAX_ARCHIVOS) {
        await fallar(`El PDF tiene más de ${MAX_ARCHIVOS} páginas. Sube solo las páginas de la carta.`);
        return;
      }
      const base64 = aBase64(bytes);
      if (tipo === "pdf") {
        contenido.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      } else {
        contenido.push({ type: "image", source: { type: "base64", media_type: tipoImagen(ruta), data: base64 } });
      }
    }
    contenido.push({
      type: "text",
      text: tipo === "pdf"
        ? "Este PDF es la carta del local. Extrae todas sus categorías, platos, descripciones y precios."
        : `Estas ${archivos.length} foto(s) son la carta del local, en orden. Extrae todas sus categorías, platos, descripciones y precios.`,
    });

    const respuesta = await anthropic.beta.messages.parse({
      model: MODELO,
      max_tokens: 20000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA,
      messages: [{ role: "user", content: contenido }],
      output_config: { effort: "medium", format: betaZodOutputFormat(CartaIA) },
    });

    await registrarUso(admin, localId, "importacion", respuesta.model, respuesta.usage);
    await admin.from("importaciones").update({
      modelo: respuesta.model,
      tokens_entrada: respuesta.usage.input_tokens,
      tokens_salida: respuesta.usage.output_tokens,
    }).eq("id", importacionId);

    if (respuesta.stop_reason === "refusal") {
      await fallar("No hemos podido procesar estas imágenes. Prueba con otras fotos o crea la carta a mano.");
      return;
    }
    if (respuesta.stop_reason === "max_tokens") {
      await fallar("La carta es demasiado larga para una sola importación. Súbela en dos partes (por ejemplo, comida y bebida).");
      return;
    }

    const carta = respuesta.parsed_output ? CartaIA.safeParse(respuesta.parsed_output) : null;
    if (!carta?.success) {
      await fallar("No hemos podido entender la carta. Repite las fotos con más luz o sigue a mano.");
      return;
    }
    const borrador = aBorrador(carta.data);
    const totalPlatos = borrador.categorias.reduce((n, c) => n + c.platos.length, 0);
    if (!carta.data.legible || totalPlatos === 0) {
      await fallar("No hemos podido leer la carta en estas imágenes. Haz las fotos de frente, con buena luz y sin reflejos, o sigue a mano.");
      return;
    }

    await admin.from("importaciones").update({ estado: "listo", resultado: borrador, error: null }).eq("id", importacionId);
  } catch (e) {
    console.error("import-menu", e);
    const mensaje = e instanceof Anthropic.RateLimitError
      ? "Ahora mismo hay mucha demanda. Espera un minuto y vuelve a intentarlo."
      : e instanceof Anthropic.APIError && e.status === 400
      ? "Alguno de los archivos no se puede leer (formato o tamaño). Prueba con otras fotos o con el PDF."
      : "La importación ha fallado. Vuelve a intentarlo o sigue a mano.";
    await fallar(mensaje);
  }
}

// ---------------------------------------------------------------------------
// Validación y normalización del resultado antes de guardarlo
// ---------------------------------------------------------------------------
type Borrador = {
  categorias: {
    nombre: string;
    platos: {
      nombre: string;
      descripcion: string | null;
      dudoso: boolean;
      motivo_duda: string | null;
      alergenos_estado: "pendiente";
      alergenos: string[];
      precios: { etiqueta: string | null; importe_centimos: number | null; texto_original: string; dudoso: boolean }[];
    }[];
  }[];
  avisos: string[];
};

const recortar = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

function aBorrador(carta: z.infer<typeof CartaIA>): Borrador {
  return {
    avisos: carta.avisos.map((a) => recortar(a, 300)).filter((a): a is string => !!a).slice(0, 10),
    categorias: carta.categorias
      .map((c) => ({
        nombre: recortar(c.nombre, 80) ?? "Carta",
        platos: c.platos
          .map((p) => {
            const precios = p.precios.slice(0, 6).map((pr) => {
              const valido = pr.importe !== null && Number.isFinite(pr.importe) && pr.importe >= 0 && pr.importe < 100000;
              return {
                etiqueta: recortar(pr.etiqueta, 40),
                importe_centimos: valido ? Math.round(pr.importe! * 100) : null,
                texto_original: recortar(pr.texto_original, 40) ?? "",
                dudoso: pr.dudoso || !valido,
              };
            });
            const nombre = recortar(p.nombre, 120);
            const precioDudoso = precios.some((pr) => pr.dudoso);
            return {
              nombre: nombre ?? "",
              descripcion: recortar(p.descripcion, 400),
              dudoso: p.dudoso || precioDudoso || !nombre,
              motivo_duda: recortar(p.motivo_duda, 200) ?? (precioDudoso ? "Revisa el precio." : null),
              alergenos_estado: "pendiente" as const, // nunca los rellena la IA
              alergenos: [],
              precios,
            };
          })
          .filter((p) => p.nombre),
      }))
      .filter((c) => c.platos.length > 0),
  };
}

function tipoImagen(ruta: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = ruta.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Cuenta aproximada de páginas de un PDF (objetos /Type /Page). */
function contarPaginasPdf(bytes: Uint8Array): number {
  const texto = new TextDecoder("latin1").decode(bytes);
  return (texto.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}
