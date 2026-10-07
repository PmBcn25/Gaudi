import { siteUrl } from "./config";
import { supabase } from "./supabase";

export async function entrarConGoogle() {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) throw new Error("No hemos podido conectar con Google. Inténtalo de nuevo.");
}

export function traducirErrorAuth(mensaje: string): string {
  if (/Invalid login credentials/i.test(mensaje)) return "Email o contraseña incorrectos.";
  if (/Email not confirmed/i.test(mensaje)) return "Confirma tu email antes de entrar. Revisa tu bandeja de entrada.";
  if (/User already registered/i.test(mensaje)) return "Ya hay una cuenta con ese email. Entra o recupera tu contraseña.";
  if (/Password should be/i.test(mensaje)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit/i.test(mensaje)) return "Demasiados intentos. Espera unos minutos.";
  return mensaje;
}
