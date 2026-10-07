// Edge Function: textos con IA (presentación del local y descripciones de platos).
// Devuelve una PROPUESTA: no guarda nada. El dueño decide si la acepta, la edita o la descarta.

import Anthropic from "npm:@anthropic-ai/sdk@0.131";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.131/helpers/zod";
import { z } from "npm:zod@4";
import { corsHeaders, errorJson, json } from "../_shared/cors.ts";
import { adminClient, contextoDueno, HttpError } from "../_shared/supabase.ts";
import { comprobarCuota, registrarUso } from "../_shared/limites.ts";

const MODELO = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const Propuesta = z.object({
  propuesta: z.string().describe("El texto propuesto, listo para mostrar en la carta."),
});

const BodySchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("presentacion"),
    // Lo que el dueño quiere contar de su local, con sus palabras (opcional).
    notas: z.string().max(600).optional(),
  }),
  z.object({
    tipo: z.literal("descripcion"),
    plato_id: z.string().uuid(),
  }),
]);

const REGLAS = `Reglas obligatorias:
- Escribe en español de España, con un tono claro y cercano, sin exageraciones ni superlativos vacíos.
- Usa solo la información que te da el dueño. No inventes ingredientes, alérgenos, precios, técnicas ni procedencias.
- No añadas atributos que el dueño no haya indicado, como «casero», «artesano», «ecológico», «de proximidad», «tradicional», «fresco» o «de calidad».
- Si la información es escasa, escribe un texto más corto en lugar de rellenar.
- No uses emojis, comillas, hashtags ni signos de exclamación.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorJson("Método no permitido", 405);

  const admin = adminClient();
  try {
    const ctx = await contextoDueno(req, admin);
    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return errorJson("Petición no válida", 400);

    let sistema: string;
    let peticion: string;
    let maxCaracteres: number;

    if (body.data.tipo === "presentacion") {
      maxCaracteres = 600;
      sistema = `Redactas la presentación breve de un bar o restaurante para la cabecera de su carta digital.
Máximo 3 frases y ${maxCaracteres} caracteres. No incluyas la dirección ni el teléfono: ya aparecen aparte.
${REGLAS}`;
      peticion = [
        `Nombre del local: ${ctx.local.nombre}`,
        ctx.local.tipo_cocina ? `Tipo de cocina: ${ctx.local.tipo_cocina}` : null,
        ctx.local.direccion ? `Zona o dirección (solo como contexto): ${ctx.local.direccion}` : null,
        ctx.local.presentacion ? `Presentación actual escrita por el dueño: ${ctx.local.presentacion}` : null,
        body.data.notas?.trim() ? `Lo que el dueño quiere contar: ${body.data.notas.trim()}` : null,
      ].filter(Boolean).join("\n");
    } else {
      const { data: plato } = await admin
        .from("platos")
        .select("nombre, descripcion, local_id, categorias(nombre)")
        .eq("id", body.data.plato_id)
        .maybeSingle();
      if (!plato || plato.local_id !== ctx.local.id) return errorJson("Plato no encontrado", 404);

      maxCaracteres = 200;
      sistema = `Propones una descripción más clara para un plato de una carta.
Una sola frase, máximo ${maxCaracteres} caracteres. Mantén el idioma del nombre del plato.
Si no hay descripción ni ingredientes indicados, describe solo lo que se deduce del propio nombre sin añadir ingredientes.
${REGLAS}`;
      const categoria = (plato.categorias as unknown as { nombre: string } | null)?.nombre;
      peticion = [
        `Plato: ${plato.nombre}`,
        categoria ? `Sección de la carta: ${categoria}` : null,
        ctx.local.tipo_cocina ? `Tipo de cocina del local: ${ctx.local.tipo_cocina}` : null,
        plato.descripcion ? `Descripción actual escrita por el dueño: ${plato.descripcion}` : "No tiene descripción.",
      ].filter(Boolean).join("\n");
    }

    await comprobarCuota(admin, ctx.local.id, "texto");

    const respuesta = await anthropic.messages.parse({
      model: MODELO,
      max_tokens: 1024,
      system: sistema,
      messages: [{ role: "user", content: peticion }],
      output_config: { format: zodOutputFormat(Propuesta) },
    });

    await registrarUso(admin, ctx.local.id, "texto", MODELO, respuesta.usage);

    const texto = respuesta.parsed_output?.propuesta?.replace(/\s+/g, " ").trim();
    if (respuesta.stop_reason === "refusal" || !texto) {
      return errorJson("No hemos podido generar una propuesta. Inténtalo de nuevo.", 502);
    }
    return json({ propuesta: texto.slice(0, maxCaracteres) });
  } catch (e) {
    if (e instanceof HttpError) return errorJson(e.message, e.status, e.codigo);
    if (e instanceof Anthropic.RateLimitError) {
      return errorJson("Ahora mismo hay mucha demanda. Espera un minuto y vuelve a intentarlo.", 503);
    }
    console.error("ai-text", e);
    return errorJson("Algo ha fallado. Inténtalo de nuevo.", 500);
  }
});
