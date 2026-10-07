import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { httpError } from "./supabase.ts";

// Límites del plan gratuito (deben coincidir con public.limites_plan()).
export const LIMITES = { importaciones_mes: 3, textos_mes: 30 } as const;

function inicioDeMesMadrid(): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const y = Number(partes.find((p) => p.type === "year")!.value);
  const m = Number(partes.find((p) => p.type === "month")!.value);
  // Desfase de Madrid respecto a UTC el día 1 (GMT+1 en invierno, GMT+2 en verano).
  const desfase = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(new Date(Date.UTC(y, m - 1, 1, 12)))
    .find((p) => p.type === "timeZoneName")!.value;
  const horas = Number(desfase.replace("GMT", "")) || 0;
  return new Date(Date.UTC(y, m - 1, 1, -horas)).toISOString();
}

export async function comprobarCuota(
  admin: SupabaseClient,
  localId: string,
  tipo: "importacion" | "texto",
): Promise<void> {
  const { count, error } = await admin
    .from("uso_ia")
    .select("id", { count: "exact", head: true })
    .eq("local_id", localId)
    .eq("tipo", tipo)
    .gte("creado_en", inicioDeMesMadrid());
  if (error) throw httpError("No hemos podido comprobar tu cuota de IA.", 500);

  const limite = tipo === "importacion" ? LIMITES.importaciones_mes : LIMITES.textos_mes;
  if ((count ?? 0) >= limite) {
    const que = tipo === "importacion" ? `${limite} importaciones` : `${limite} textos con IA`;
    throw httpError(`Has llegado al límite del plan gratuito: ${que} al mes. Se renueva el día 1.`, 429, "limite_alcanzado");
  }
}

export async function registrarUso(
  admin: SupabaseClient,
  localId: string,
  tipo: "importacion" | "texto",
  modelo: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
): Promise<void> {
  await admin.from("uso_ia").insert({
    local_id: localId,
    tipo,
    modelo,
    tokens_entrada: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    tokens_salida: usage.output_tokens,
  });
}
