import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let navegador: SupabaseClient | undefined;

/**
 * Cliente de Supabase. En el navegador mantiene la sesión del dueño (PKCE);
 * en el servidor se usa sin sesión, solo para leer cartas publicadas.
 */
export function supabase(): SupabaseClient {
  if (typeof window === "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  navegador ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return navegador;
}

export function urlLogo(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/logos/${logoPath}`;
}

/** Llama a una Edge Function y devuelve el JSON o un error con el mensaje para el dueño. */
export async function invocar<T>(nombre: string, body: unknown): Promise<T> {
  const { data: sesion } = await supabase().auth.getSession();
  const token = sesion.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorApp(json.error ?? "Algo ha fallado. Inténtalo de nuevo.", json.codigo);
  return json as T;
}

export class ErrorApp extends Error {
  constructor(message: string, public codigo?: string) {
    super(message);
  }
}

export function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Algo ha fallado. Inténtalo de nuevo.";
}
