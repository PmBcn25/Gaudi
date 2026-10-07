import { supabase } from "./supabase";
import type { Categoria, EstadoAlergenos, Local, Plato, Precio } from "./types";
import type { AlergenoId } from "./alergenos";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(traducirError(res.error.message));
  return res.data;
}

function traducirError(msg: string): string {
  if (/duplicate key.*slug/i.test(msg)) return "Ese enlace ya lo usa otro local. Elige otro.";
  if (/duplicate key.*owner_id/i.test(msg)) return "Tu cuenta ya tiene un local.";
  if (/violates check constraint "locales_slug_check"/i.test(msg)) {
    return "El enlace solo puede tener letras minúsculas, números y guiones (de 3 a 60 caracteres).";
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión. Revisa tu cobertura y vuelve a intentarlo.";
  return msg;
}

// ---------------------------------------------------------------------------
// Local
// ---------------------------------------------------------------------------
export async function miLocal(): Promise<Local | null> {
  return check(await supabase().from("locales").select("*").maybeSingle()) as Local | null;
}

export type DatosLocal = Pick<
  Local,
  "nombre" | "slug" | "tipo_cocina" | "direccion" | "telefono" | "email_contacto" | "web" | "instagram" | "horario" | "color" | "presentacion"
>;

export async function crearLocal(datos: DatosLocal, ownerId: string): Promise<Local> {
  return check(
    await supabase().from("locales").insert({ ...datos, owner_id: ownerId }).select("*").single(),
  ) as Local;
}

export async function actualizarLocal(id: string, cambios: Partial<Local>): Promise<Local> {
  return check(await supabase().from("locales").update(cambios).eq("id", id).select("*").single()) as Local;
}

export async function slugDisponible(slug: string): Promise<boolean> {
  return check(await supabase().rpc("slug_disponible", { p_slug: slug })) as boolean;
}

export async function subirLogo(localId: string, blob: Blob): Promise<string> {
  const ruta = `${localId}/logo-${Date.now()}.png`;
  const { error } = await supabase().storage.from("logos").upload(ruta, blob, { contentType: "image/png", upsert: true });
  if (error) throw new Error("No hemos podido subir el logo.");
  return ruta;
}

export async function borrarArchivoLogo(ruta: string) {
  await supabase().storage.from("logos").remove([ruta]);
}

export type Cuota = {
  importaciones_usadas: number;
  textos_usados: number;
  limites: { importaciones_mes: number; textos_mes: number };
};

export async function miCuota(): Promise<Cuota> {
  return check(await supabase().rpc("mi_cuota_ia")) as Cuota;
}

// ---------------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------------
export async function cargarCarta(localId: string): Promise<Categoria[]> {
  const data = check(
    await supabase()
      .from("categorias")
      .select("id, nombre, orden, creado_en, platos(id, categoria_id, nombre, descripcion, orden, agotado, alergenos_estado, alergenos, creado_en, precios(id, etiqueta, importe_centimos, orden))")
      .eq("local_id", localId)
      .order("orden")
      .order("creado_en"),
  ) as (Categoria & { platos: (Plato & { creado_en: string })[] })[];

  return data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    orden: c.orden,
    platos: [...c.platos]
      .sort((a, b) => a.orden - b.orden || a.creado_en.localeCompare(b.creado_en))
      .map((p) => ({ ...p, precios: [...p.precios].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) })),
  }));
}

export async function crearCategoria(localId: string, nombre: string, orden: number) {
  return check(
    await supabase().from("categorias").insert({ local_id: localId, nombre, orden }).select("id").single(),
  ) as { id: string };
}

export async function renombrarCategoria(id: string, nombre: string) {
  check(await supabase().from("categorias").update({ nombre }).eq("id", id));
}

export async function borrarCategoria(id: string) {
  check(await supabase().from("categorias").delete().eq("id", id));
}

/** Guarda el orden de una lista (categorías o platos) en una sola ronda de peticiones. */
export async function guardarOrden(tabla: "categorias" | "platos", ids: string[]) {
  await Promise.all(ids.map((id, i) => supabase().from(tabla).update({ orden: i }).eq("id", id).then(check)));
}

export async function cargarPlato(id: string): Promise<Plato | null> {
  const data = check(
    await supabase()
      .from("platos")
      .select("id, categoria_id, nombre, descripcion, orden, agotado, alergenos_estado, alergenos, precios(id, etiqueta, importe_centimos, orden)")
      .eq("id", id)
      .maybeSingle(),
  ) as Plato | null;
  if (data) data.precios = [...data.precios].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return data;
}

export type DatosPlato = {
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  agotado: boolean;
  alergenos_estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  precios: Precio[];
};

/** Crea o actualiza un plato con sus precios en una sola transacción (RPC guardar_plato). */
export async function guardarPlato(id: string | null, datos: DatosPlato): Promise<string> {
  const p_datos = {
    ...datos,
    alergenos: datos.alergenos_estado === "contiene" ? datos.alergenos : [],
    precios: datos.precios.map((p) => ({ etiqueta: p.etiqueta?.trim() || null, importe_centimos: p.importe_centimos })),
  };
  return check(await supabase().rpc("guardar_plato", { p_id: id, p_datos })) as string;
}

export async function marcarAgotado(id: string, agotado: boolean) {
  check(await supabase().from("platos").update({ agotado }).eq("id", id));
}

export async function borrarPlato(id: string) {
  check(await supabase().from("platos").delete().eq("id", id));
}
