import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Aviso, Cargando } from "~/components/Aviso";
import { SelectorAlergenos } from "~/components/Alergenos";
import { EditorPrecios, preciosValidos, type PrecioEditable } from "~/components/EditorPrecios";
import { PropuestaIA } from "~/components/PropuestaIA";
import { borrarPlato, cargarCarta, cargarPlato, guardarPlato } from "~/lib/datos";
import { centimosATexto, leerEuros } from "~/lib/format";
import { invocar, mensajeError } from "~/lib/supabase";
import type { AlergenoId } from "~/lib/alergenos";
import type { EstadoAlergenos } from "~/lib/types";
import { useLocal } from "./panel";

export const Route = createFileRoute("/panel/plato/$id")({
  validateSearch: (s: Record<string, unknown>): { categoria?: string } => ({
    categoria: typeof s.categoria === "string" ? s.categoria : undefined,
  }),
  component: EditarPlato,
});

type Form = {
  categoria_id: string;
  nombre: string;
  descripcion: string;
  agotado: boolean;
  alergenos_estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  precios: PrecioEditable[];
};

function EditarPlato() {
  const { id } = Route.useParams();
  const { categoria } = Route.useSearch();
  const { local } = useLocal();
  const navigate = useNavigate();
  const nuevo = id === "nuevo";

  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pidiendoIA, setPidiendoIA] = useState(false);
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [cambios, setCambios] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const carta = await cargarCarta(local.id);
        setCategorias(carta.map((c) => ({ id: c.id, nombre: c.nombre })));
        if (nuevo) {
          setF({
            categoria_id: categoria ?? carta[0]?.id ?? "",
            nombre: "",
            descripcion: "",
            agotado: false,
            alergenos_estado: "pendiente",
            alergenos: [],
            precios: [{ etiqueta: "", importe: "" }],
          });
        } else {
          const p = await cargarPlato(id);
          if (!p) return setError("Este plato ya no existe.");
          setF({
            categoria_id: p.categoria_id,
            nombre: p.nombre,
            descripcion: p.descripcion ?? "",
            agotado: p.agotado,
            alergenos_estado: p.alergenos_estado,
            alergenos: p.alergenos,
            precios: p.precios.length
              ? p.precios.map((pr) => ({ etiqueta: pr.etiqueta ?? "", importe: centimosATexto(pr.importe_centimos) }))
              : [],
          });
        }
      } catch (e) {
        setError(mensajeError(e));
      }
    })();
  }, [id, nuevo, categoria, local.id]);

  if (!f) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;

  const set = (cambio: Partial<Form>) => {
    setCambios(true);
    setF((prev) => (prev ? { ...prev, ...cambio } : prev));
  };

  function validar(): string | null {
    if (!f!.nombre.trim()) return "Escribe el nombre del plato.";
    if (!f!.categoria_id) return "Elige una categoría.";
    if (f!.precios.length > 0 && !preciosValidos(f!.precios)) return "Revisa los precios: escribe importes como 12,50.";
    if (f!.precios.length > 1 && f!.precios.some((p) => !p.etiqueta.trim())) return "Pon una etiqueta a cada precio (ej. tapa, ración).";
    if (f!.alergenos_estado === "contiene" && f!.alergenos.length === 0) return "Marca qué alérgenos contiene o elige «Ninguno».";
    return null;
  }

  async function guardar(volver = true): Promise<string | null> {
    setError(null);
    const problema = validar();
    if (problema) {
      setError(problema);
      return null;
    }
    setGuardando(true);
    try {
      const platoId = await guardarPlato(nuevo ? null : id, {
        categoria_id: f!.categoria_id,
        nombre: f!.nombre.trim(),
        descripcion: f!.descripcion.trim() || null,
        agotado: f!.agotado,
        alergenos_estado: f!.alergenos_estado,
        alergenos: f!.alergenos,
        precios: f!.precios.map((p) => ({ etiqueta: p.etiqueta.trim() || null, importe_centimos: leerEuros(p.importe)! })),
      });
      setCambios(false);
      if (volver) navigate({ to: "/panel/carta" });
      return platoId;
    } catch (e) {
      setError(mensajeError(e));
      return null;
    } finally {
      setGuardando(false);
    }
  }

  async function pedirDescripcion() {
    setError(null);
    setPidiendoIA(true);
    try {
      // La IA trabaja con lo guardado: guardamos primero si hay cambios o si es nuevo.
      let platoId: string | null = nuevo ? null : id;
      if (nuevo || cambios) {
        platoId = await guardar(false);
        if (!platoId) return;
        if (nuevo) navigate({ to: "/panel/plato/$id", params: { id: platoId }, replace: true });
      }
      const r = await invocar<{ propuesta: string }>("ai-text", { tipo: "descripcion", plato_id: platoId });
      setPropuesta(r.propuesta);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setPidiendoIA(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div className="flex items-center gap-2">
        <button type="button" className="btn-fantasma min-h-11 px-2" onClick={() => navigate({ to: "/panel/carta" })} aria-label="Volver a la carta">←</button>
        <h1 className="text-2xl font-bold">{nuevo ? "Nuevo plato" : "Editar plato"}</h1>
      </div>

      <section className="tarjeta space-y-4">
        <div>
          <label htmlFor="nombre" className="etiqueta">Nombre *</label>
          <input id="nombre" className="campo" maxLength={120} value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} autoFocus={nuevo} />
        </div>
        <EditorPrecios precios={f.precios} onChange={(precios) => set({ precios })} />
        {f.precios.length === 0 && <p className="ayuda">Sin precio: se mostrará solo el nombre (útil para «según mercado»).</p>}
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-linea px-4">
          <span className="text-base font-semibold">Agotado</span>
          <input type="checkbox" className="size-6 accent-[var(--color-marca)]" checked={f.agotado} onChange={(e) => set({ agotado: e.target.checked })} />
        </label>
      </section>

      <section className="tarjeta space-y-3">
        <label htmlFor="desc" className="etiqueta">Descripción (opcional)</label>
        <textarea id="desc" className="campo min-h-24" maxLength={400} value={f.descripcion} onChange={(e) => set({ descripcion: e.target.value })} />
        {!propuesta && (
          <button type="button" className="btn-secundario w-full" onClick={pedirDescripcion} disabled={pidiendoIA || !f.nombre.trim()}>
            {pidiendoIA ? "Redactando…" : f.descripcion.trim() ? "✨ Mejorar descripción con IA" : "✨ Proponer descripción con IA"}
          </button>
        )}
        {propuesta && (
          <PropuestaIA
            propuesta={propuesta}
            maxLength={400}
            onAceptar={(t) => {
              set({ descripcion: t });
              setPropuesta(null);
            }}
            onDescartar={() => setPropuesta(null)}
          />
        )}
      </section>

      <section className="tarjeta">
        <SelectorAlergenos
          estado={f.alergenos_estado}
          alergenos={f.alergenos}
          onChange={(alergenos_estado, alergenos) => set({ alergenos_estado, alergenos })}
        />
      </section>

      {categorias.length > 1 && (
        <section className="tarjeta">
          <label htmlFor="cat" className="etiqueta">Categoría</label>
          <select id="cat" className="campo" value={f.categoria_id} onChange={(e) => set({ categoria_id: e.target.value })}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </section>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="sticky bottom-20 z-10">
        <button type="submit" className="btn-primario w-full text-lg shadow-lg" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {!nuevo && (
        <button
          type="button"
          className="btn-peligro w-full"
          onClick={async () => {
            if (!confirm(`¿Borrar «${f.nombre}»? No se puede deshacer.`)) return;
            try {
              await borrarPlato(id);
              navigate({ to: "/panel/carta" });
            } catch (e) {
              setError(mensajeError(e));
            }
          }}
        >
          Borrar plato
        </button>
      )}
    </form>
  );
}
