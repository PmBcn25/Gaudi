export const APP_NAME: string = import.meta.env.VITE_APP_NAME || "Gaudí";
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** URL pública de la app (sin barra final). Se usa para el QR y los enlaces que se comparten. */
export function siteUrl(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export const LIMITES_PLAN = { importaciones_mes: 3, textos_mes: 30, fotos_por_importacion: 10, paginas_pdf: 10 };
