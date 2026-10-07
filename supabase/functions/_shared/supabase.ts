import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Cliente con privilegios de servicio: solo dentro de las Edge Functions. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Contexto = {
  user: User;
  local: { id: string; nombre: string; tipo_cocina: string | null; direccion: string | null; presentacion: string | null };
};

/**
 * Valida el JWT del dueño, exige email verificado y devuelve su local.
 * Lanza un Response listo para devolver si algo falla.
 */
export async function contextoDueno(req: Request, admin: SupabaseClient): Promise<Contexto> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw httpError("Sesión no válida. Vuelve a entrar.", 401);

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("Sesión no válida. Vuelve a entrar.", 401);
  if (!data.user.email_confirmed_at) {
    throw httpError("Confirma tu email para usar la IA. Revisa tu bandeja de entrada.", 403, "email_no_verificado");
  }

  const { data: local } = await admin
    .from("locales")
    .select("id, nombre, tipo_cocina, direccion, presentacion, estado")
    .eq("owner_id", data.user.id)
    .maybeSingle();
  if (!local) throw httpError("Primero crea la ficha de tu local.", 400, "sin_local");
  if (local.estado === "desactivada") throw httpError("Esta carta está desactivada.", 403, "desactivada");

  return { user: data.user, local };
}

export class HttpError extends Error {
  constructor(message: string, public status: number, public codigo?: string) {
    super(message);
  }
}

export function httpError(message: string, status: number, codigo?: string): HttpError {
  return new HttpError(message, status, codigo);
}
