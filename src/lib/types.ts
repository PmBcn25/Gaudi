import type { AlergenoId } from "./alergenos";

export type EstadoLocal = "borrador" | "publicada" | "desactivada";
export type EstadoAlergenos = "contiene" | "ninguno" | "pendiente";

export type Local = {
  id: string;
  owner_id: string;
  nombre: string;
  slug: string;
  qr_code: string;
  tipo_cocina: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  web: string | null;
  instagram: string | null;
  horario: string | null;
  logo_path: string | null;
  color: string;
  presentacion: string | null;
  estado: EstadoLocal;
  publicada_en: string | null;
  actualizado_en: string;
};

export type Precio = {
  id?: string;
  etiqueta: string | null;
  importe_centimos: number;
  orden?: number;
};

export type Plato = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  agotado: boolean;
  alergenos_estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  precios: Precio[];
};

export type Categoria = {
  id: string;
  nombre: string;
  orden: number;
  platos: Plato[];
};

/** Lo que devuelve get_carta_publica() */
export type CartaPublica = {
  local: Pick<
    Local,
    | "nombre" | "slug" | "qr_code" | "tipo_cocina" | "direccion" | "telefono" | "email_contacto"
    | "web" | "instagram" | "horario" | "logo_path" | "color" | "presentacion" | "actualizado_en"
  >;
  categorias: {
    id: string;
    nombre: string;
    platos: {
      id: string;
      nombre: string;
      descripcion: string | null;
      agotado: boolean;
      alergenos_estado: EstadoAlergenos;
      alergenos: AlergenoId[];
      precios: { etiqueta: string | null; importe_centimos: number }[];
    }[];
  }[];
};

/** Borrador que genera la importación con IA (importaciones.resultado). */
export type BorradorPrecio = {
  etiqueta: string | null;
  importe_centimos: number | null;
  texto_original: string;
  dudoso: boolean;
};
export type BorradorPlato = {
  nombre: string;
  descripcion: string | null;
  dudoso: boolean;
  motivo_duda: string | null;
  alergenos_estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  precios: BorradorPrecio[];
};
export type Borrador = {
  categorias: { nombre: string; platos: BorradorPlato[] }[];
  avisos: string[];
};

export type Importacion = {
  id: string;
  local_id: string;
  tipo: "fotos" | "pdf";
  estado: "subiendo" | "procesando" | "listo" | "error" | "confirmado";
  resultado: Borrador | null;
  error: string | null;
  creado_en: string;
};
