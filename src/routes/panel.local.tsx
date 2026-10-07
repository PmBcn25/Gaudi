import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Aviso } from "~/components/Aviso";
import { PropuestaIA } from "~/components/PropuestaIA";
import { colorTextoSobre } from "~/components/CartaVista";
import { actualizarLocal, borrarArchivoLogo, crearLocal, slugDisponible, subirLogo, type DatosLocal } from "~/lib/datos";
import { SLUG_VALIDO, slugificar } from "~/lib/format";
import { prepararLogo } from "~/lib/imagen";
import { siteUrl } from "~/lib/config";
import { invocar, mensajeError, urlLogo } from "~/lib/supabase";
import { usePanel } from "./panel";

export const Route = createFileRoute("/panel/local")({
  component: FichaLocal,
});

const TIPOS = ["Bar", "Bar de tapas", "Cafetería", "Restaurante", "Hamburguesería", "Pizzería", "Comida para llevar", "Food truck", "Cervecería", "Marisquería", "Asador", "Brunch"];
const COLORES = ["#b4532a", "#9f1239", "#1d4ed8", "#047857", "#7c3aed", "#0f766e", "#a16207", "#1c1917"];

function FichaLocal() {
  const { user, local, setLocal } = usePanel();
  const navigate = useNavigate();
  const nuevo = !local;

  const [f, setF] = useState<DatosLocal>({
    nombre: local?.nombre ?? "",
    slug: local?.slug ?? "",
    tipo_cocina: local?.tipo_cocina ?? "",
    direccion: local?.direccion ?? "",
    telefono: local?.telefono ?? "",
    email_contacto: local?.email_contacto ?? "",
    web: local?.web ?? "",
    instagram: local?.instagram ?? "",
    horario: local?.horario ?? "",
    color: local?.color ?? COLORES[0],
    presentacion: local?.presentacion ?? "",
  });
  const [slugTocado, setSlugTocado] = useState(!nuevo);
  const [slugLibre, setSlugLibre] = useState<boolean | null>(null);
  const [logoArchivo, setLogoArchivo] = useState<Blob | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(urlLogo(local?.logo_path));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // IA: presentación
  const [notasIA, setNotasIA] = useState("");
  const [pidiendoIA, setPidiendoIA] = useState(false);
  const [propuesta, setPropuesta] = useState<string | null>(null);

  const set = <K extends keyof DatosLocal>(k: K, v: DatosLocal[K]) => {
    setOk(false);
    setF((prev) => ({ ...prev, [k]: v }));
  };

  // Enlace automático a partir del nombre mientras el dueño no lo toque.
  useEffect(() => {
    if (!slugTocado) setF((prev) => ({ ...prev, slug: slugificar(prev.nombre) }));
  }, [f.nombre, slugTocado]);

  // Comprobar si el enlace está libre.
  const ultimo = useRef(0);
  useEffect(() => {
    setSlugLibre(null);
    if (!SLUG_VALIDO.test(f.slug) || f.slug === local?.slug) return;
    const id = ++ultimo.current;
    const t = setTimeout(async () => {
      const libre = await slugDisponible(f.slug).catch(() => null);
      if (id === ultimo.current) setSlugLibre(libre);
    }, 400);
    return () => clearTimeout(t);
  }, [f.slug, local?.slug]);

  async function elegirLogo(archivo: File | undefined) {
    if (!archivo) return;
    try {
      const blob = await prepararLogo(archivo);
      setLogoArchivo(blob);
      setLogoPreview(URL.createObjectURL(blob));
      setOk(false);
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function pedirPresentacion() {
    setPidiendoIA(true);
    setError(null);
    try {
      // La IA usa los datos guardados del local: guardamos antes los cambios pendientes.
      if (local) await actualizarLocal(local.id, limpiar(f));
      const r = await invocar<{ propuesta: string }>("ai-text", { tipo: "presentacion", notas: notasIA || undefined });
      setPropuesta(r.propuesta);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setPidiendoIA(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.nombre.trim()) return setError("Escribe el nombre del local.");
    if (!SLUG_VALIDO.test(f.slug.replace(/-+$/, ""))) return setError("El enlace debe tener entre 3 y 60 letras minúsculas, números o guiones.");
    if (slugLibre === false) return setError("Ese enlace ya está en uso. Prueba con otro.");

    setGuardando(true);
    try {
      let guardado = local ? await actualizarLocal(local.id, limpiar(f)) : await crearLocal(limpiar(f), user.id);
      if (logoArchivo) {
        const anterior = guardado.logo_path;
        const ruta = await subirLogo(guardado.id, logoArchivo);
        guardado = await actualizarLocal(guardado.id, { logo_path: ruta });
        if (anterior) borrarArchivoLogo(anterior);
        setLogoArchivo(null);
      }
      setLocal(guardado);
      if (nuevo) navigate({ to: "/panel/empezar" });
      else setOk(true);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function quitarLogo() {
    if (local?.logo_path) {
      const actualizado = await actualizarLocal(local.id, { logo_path: null });
      borrarArchivoLogo(local.logo_path);
      setLocal(actualizado);
    }
    setLogoArchivo(null);
    setLogoPreview(null);
  }

  const dominio = siteUrl().replace(/^https?:\/\//, "");

  return (
    <form onSubmit={guardar} className="space-y-6" noValidate>
      <div>
        <h1 className="text-2xl font-bold">{nuevo ? "Datos de tu local" : "Tu local"}</h1>
        {nuevo && <p className="mt-1 text-base text-tinta-suave">Paso 1 de 3. Solo el nombre es obligatorio; el resto lo puedes completar después.</p>}
      </div>

      <section className="tarjeta space-y-4">
        <div>
          <label htmlFor="nombre" className="etiqueta">Nombre del local *</label>
          <input id="nombre" className="campo" maxLength={120} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} autoFocus={nuevo} required />
        </div>

        <div>
          <label htmlFor="slug" className="etiqueta">Enlace de tu carta</label>
          <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-linea bg-white focus-within:border-marca">
            <span className="flex items-center bg-stone-50 px-3 text-sm text-tinta-suave">{dominio}/</span>
            <input
              id="slug"
              className="min-h-12 w-full min-w-0 px-2 text-base focus:outline-none"
              value={f.slug}
              maxLength={60}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => {
                setSlugTocado(true);
                set("slug", slugificar(e.target.value) + (e.target.value.endsWith("-") ? "-" : ""));
              }}
            />
          </div>
          {slugLibre === false && <p className="mt-1 text-sm font-medium text-error">Ese enlace ya está en uso.</p>}
          {slugLibre === true && <p className="mt-1 text-sm font-medium text-ok">Disponible</p>}
          {!nuevo && f.slug !== local?.slug && (
            <p className="ayuda text-aviso">Tu QR impreso seguirá funcionando, pero el enlace antiguo dejará de abrir la carta.</p>
          )}
        </div>

        <div>
          <label htmlFor="tipo" className="etiqueta">Tipo de local o de cocina</label>
          <input id="tipo" className="campo" list="tipos" maxLength={80} value={f.tipo_cocina ?? ""} onChange={(e) => set("tipo_cocina", e.target.value)} placeholder="Bar de tapas, pizzería…" />
          <datalist id="tipos">{TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </section>

      <section className="tarjeta space-y-4">
        <h2 className="text-lg font-bold">Contacto</h2>
        <div>
          <label htmlFor="direccion" className="etiqueta">Dirección</label>
          <input id="direccion" className="campo" maxLength={200} autoComplete="street-address" value={f.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} />
        </div>
        <div>
          <label htmlFor="telefono" className="etiqueta">Teléfono</label>
          <input id="telefono" className="campo" type="tel" maxLength={30} autoComplete="tel" value={f.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div>
          <label htmlFor="horario" className="etiqueta">Horario</label>
          <textarea id="horario" className="campo min-h-20" maxLength={300} value={f.horario ?? ""} onChange={(e) => set("horario", e.target.value)} placeholder="L-V 8:00-23:00 · S-D 10:00-01:00" />
        </div>
        <details className="group">
          <summary className="cursor-pointer text-base font-semibold text-marca">Más datos (Instagram, web, email)</summary>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="instagram" className="etiqueta">Instagram</label>
              <input id="instagram" className="campo" maxLength={60} autoCapitalize="none" value={f.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@milocal" />
            </div>
            <div>
              <label htmlFor="web" className="etiqueta">Web</label>
              <input id="web" className="campo" type="url" maxLength={200} value={f.web ?? ""} onChange={(e) => set("web", e.target.value)} />
            </div>
            <div>
              <label htmlFor="emailc" className="etiqueta">Email de contacto</label>
              <input id="emailc" className="campo" type="email" maxLength={120} value={f.email_contacto ?? ""} onChange={(e) => set("email_contacto", e.target.value)} />
            </div>
          </div>
        </details>
      </section>

      <section className="tarjeta space-y-4">
        <h2 className="text-lg font-bold">Imagen</h2>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-linea bg-white">
            {logoPreview ? <img src={logoPreview} alt="Logo" className="size-full object-contain" /> : <span className="text-sm text-tinta-suave">Logo</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label className="btn-secundario min-h-11 cursor-pointer">
              {logoPreview ? "Cambiar logo" : "Subir logo"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => elegirLogo(e.target.files?.[0])} />
            </label>
            {logoPreview && <button type="button" className="btn-fantasma min-h-10 text-sm" onClick={quitarLogo}>Quitar logo</button>}
          </div>
        </div>
        <p className="ayuda">Aparece en la carta y al compartir el enlace por WhatsApp.</p>

        <fieldset>
          <legend className="etiqueta">Color principal</legend>
          <div className="flex flex-wrap items-center gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={f.color === c}
                className={`size-11 rounded-full border-4 ${f.color === c ? "border-tinta" : "border-white shadow"}`}
                style={{ background: c }}
                onClick={() => set("color", c)}
              />
            ))}
            <label className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-linea bg-white text-xs" title="Otro color">
              <input type="color" className="sr-only" value={f.color} onChange={(e) => set("color", e.target.value)} />
              Otro
            </label>
          </div>
          <div className="mt-3 rounded-xl px-4 py-3 text-base font-bold" style={{ background: f.color, color: colorTextoSobre(f.color) }}>
            {f.nombre || "Nombre del local"}
          </div>
        </fieldset>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="text-lg font-bold">Presentación</h2>
        <p className="text-base text-tinta-suave">Un par de frases que aparecen arriba de la carta.</p>
        <textarea className="campo min-h-28" maxLength={600} value={f.presentacion ?? ""} onChange={(e) => set("presentacion", e.target.value)} aria-label="Presentación del local" />
        {!nuevo && !propuesta && (
          <div className="rounded-xl bg-stone-50 p-4">
            <label htmlFor="notas" className="etiqueta">¿Qué quieres destacar? (opcional)</label>
            <textarea
              id="notas"
              className="campo min-h-20"
              maxLength={600}
              value={notasIA}
              onChange={(e) => setNotasIA(e.target.value)}
              placeholder="Ej.: Bar de barrio desde 1985, especialidad en tortilla y vermut los domingos."
            />
            <p className="ayuda">La IA solo usa lo que escribas aquí y los datos de tu local. No inventa nada.</p>
            <button type="button" className="btn-secundario mt-3 w-full" onClick={pedirPresentacion} disabled={pidiendoIA}>
              {pidiendoIA ? "Redactando…" : "✨ Redactar con IA"}
            </button>
          </div>
        )}
        {propuesta && (
          <PropuestaIA
            propuesta={propuesta}
            maxLength={600}
            onAceptar={(t) => {
              set("presentacion", t);
              setPropuesta(null);
            }}
            onDescartar={() => setPropuesta(null)}
          />
        )}
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">Cambios guardados. Ya se ven en tu carta.</Aviso>}

      <div className="sticky bottom-20 z-10">
        <button type="submit" className="btn-primario w-full shadow-lg" disabled={guardando}>
          {guardando ? "Guardando…" : nuevo ? "Continuar" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function limpiar(f: DatosLocal): DatosLocal {
  const t = (v: string | null) => (v ?? "").trim() || null;
  return {
    nombre: f.nombre.trim(),
    slug: f.slug.replace(/-+$/, ""),
    tipo_cocina: t(f.tipo_cocina),
    direccion: t(f.direccion),
    telefono: t(f.telefono),
    email_contacto: t(f.email_contacto),
    web: t(f.web),
    instagram: t(f.instagram),
    horario: t(f.horario),
    color: f.color.toLowerCase(),
    presentacion: t(f.presentacion),
  };
}
