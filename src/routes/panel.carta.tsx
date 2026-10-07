import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Aviso, Cargando } from "~/components/Aviso";
import { borrarCategoria, cargarCarta, crearCategoria, guardarOrden, marcarAgotado, renombrarCategoria } from "~/lib/datos";
import { formatoEuros } from "~/lib/format";
import { mensajeError } from "~/lib/supabase";
import type { Categoria, Plato } from "~/lib/types";
import { useLocal } from "./panel";
import { BotonAgotado, normalizar } from "./panel.index";

type Busqueda = { filtro?: "pendientes"; importado?: boolean };

export const Route = createFileRoute("/panel/carta")({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    filtro: s.filtro === "pendientes" ? "pendientes" : undefined,
    importado: s.importado === true || s.importado === "true" ? true : undefined,
  }),
  component: Editor,
});

function Editor() {
  const { local } = useLocal();
  const { filtro, importado } = Route.useSearch();
  const [carta, setCarta] = useState<Categoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(filtro === "pendientes");
  const [nuevaCat, setNuevaCat] = useState("");
  const [editandoCat, setEditandoCat] = useState<string | null>(null);

  const recargar = () => cargarCarta(local.id).then(setCarta).catch((e) => setError(mensajeError(e)));
  useEffect(() => {
    recargar();
  }, [local.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = normalizar(busqueda);
  const filtrada = useMemo(
    () =>
      carta
        ?.map((c) => ({
          ...c,
          platos: c.platos.filter(
            (p) => (!q || normalizar(p.nombre).includes(q)) && (!soloPendientes || p.alergenos_estado === "pendiente"),
          ),
        }))
        .filter((c) => (!q && !soloPendientes) || c.platos.length > 0),
    [carta, q, soloPendientes],
  );
  const filtrando = !!q || soloPendientes;

  async function accion(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(mensajeError(e));
      recargar();
    }
  }

  function moverCategoria(i: number, delta: number) {
    if (!carta) return;
    const nueva = [...carta];
    const [c] = nueva.splice(i, 1);
    nueva.splice(i + delta, 0, c);
    setCarta(nueva);
    accion(() => guardarOrden("categorias", nueva.map((x) => x.id)));
  }

  function moverPlato(catId: string, i: number, delta: number) {
    if (!carta) return;
    const nueva = carta.map((c) => {
      if (c.id !== catId) return c;
      const platos = [...c.platos];
      const [p] = platos.splice(i, 1);
      platos.splice(i + delta, 0, p);
      accion(() => guardarOrden("platos", platos.map((x) => x.id)));
      return { ...c, platos };
    });
    setCarta(nueva);
  }

  function agotado(p: Plato, valor: boolean) {
    setCarta((cs) => cs?.map((c) => ({ ...c, platos: c.platos.map((x) => (x.id === p.id ? { ...x, agotado: valor } : x)) })) ?? null);
    accion(() => marcarAgotado(p.id, valor));
  }

  async function añadirCategoria(e: React.FormEvent) {
    e.preventDefault();
    const nombre = nuevaCat.trim();
    if (!nombre || !carta) return;
    await accion(async () => {
      await crearCategoria(local.id, nombre, carta.length);
      setNuevaCat("");
      await recargar();
    });
  }

  if (!carta || !filtrada) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;

  const total = carta.reduce((n, c) => n + c.platos.length, 0);
  const pendientes = carta.reduce((n, c) => n + c.platos.filter((p) => p.alergenos_estado === "pendiente").length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mi carta</h1>
          <p className="text-base text-tinta-suave">{total} platos · los cambios se ven al guardar</p>
        </div>
        <Link to="/panel/publicar" className="btn-secundario min-h-11 text-sm">Vista previa</Link>
      </div>

      {importado && <Aviso tipo="ok">¡Carta importada! Revisa los alérgenos y, cuando esté lista, publícala.</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {total > 0 && (
        <div className="space-y-2">
          <input type="search" className="campo" placeholder="Buscar plato…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar plato" />
          {pendientes > 0 && (
            <label className="flex min-h-11 items-center gap-3 text-base">
              <input type="checkbox" className="size-5 accent-[var(--color-marca)]" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
              Ver solo los {pendientes} con alérgenos pendientes
            </label>
          )}
        </div>
      )}

      {filtrada.map((c) => {
        const indice = carta.findIndex((x) => x.id === c.id);
        return (
          <section key={c.id} className="tarjeta p-0">
            <div className="flex items-center gap-1 border-b border-linea p-3">
              {editandoCat === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const nombre = new FormData(e.currentTarget).get("nombre")?.toString().trim();
                    setEditandoCat(null);
                    if (nombre && nombre !== c.nombre) {
                      setCarta((cs) => cs?.map((x) => (x.id === c.id ? { ...x, nombre } : x)) ?? null);
                      accion(() => renombrarCategoria(c.id, nombre));
                    }
                  }}
                >
                  <input name="nombre" className="campo min-h-11 flex-1" defaultValue={c.nombre} maxLength={80} autoFocus aria-label="Nombre de la categoría" />
                  <button className="btn-primario min-h-11 px-4">OK</button>
                </form>
              ) : (
                <>
                  <button className="min-h-11 flex-1 text-left text-lg font-bold" onClick={() => setEditandoCat(c.id)} title="Cambiar nombre">
                    {c.nombre} <span className="text-sm font-normal text-tinta-suave">✎</span>
                  </button>
                  {!filtrando && (
                    <>
                      <BotonOrden etiqueta="Subir categoría" icono="▲" disabled={indice === 0} onClick={() => moverCategoria(indice, -1)} />
                      <BotonOrden etiqueta="Bajar categoría" icono="▼" disabled={indice === carta.length - 1} onClick={() => moverCategoria(indice, 1)} />
                    </>
                  )}
                  <button
                    className="btn-fantasma min-h-11 min-w-11 px-2 text-error"
                    aria-label={`Borrar categoría ${c.nombre}`}
                    onClick={() => {
                      const msg = c.platos.length
                        ? `¿Borrar «${c.nombre}» y sus ${c.platos.length} platos? No se puede deshacer.`
                        : `¿Borrar la categoría «${c.nombre}»?`;
                      if (!confirm(msg)) return;
                      setCarta((cs) => cs?.filter((x) => x.id !== c.id) ?? null);
                      accion(() => borrarCategoria(c.id));
                    }}
                  >
                    🗑
                  </button>
                </>
              )}
            </div>

            <ul className="divide-y divide-linea">
              {c.platos.length === 0 && <li className="p-4 text-base text-tinta-suave">Sin platos todavía.</li>}
              {c.platos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 p-3">
                  {!filtrando && (
                    <div className="flex flex-col">
                      <BotonOrden etiqueta={`Subir ${p.nombre}`} icono="▲" disabled={i === 0} onClick={() => moverPlato(c.id, i, -1)} compacto />
                      <BotonOrden etiqueta={`Bajar ${p.nombre}`} icono="▼" disabled={i === c.platos.length - 1} onClick={() => moverPlato(c.id, i, 1)} compacto />
                    </div>
                  )}
                  <Link to="/panel/plato/$id" params={{ id: p.id }} className="min-w-0 flex-1 py-1">
                    <p className={`truncate text-base font-semibold ${p.agotado ? "text-tinta-suave line-through" : ""}`}>{p.nombre}</p>
                    <p className="truncate text-sm text-tinta-suave">
                      {p.precios.map((pr) => `${pr.etiqueta ? pr.etiqueta + " " : ""}${formatoEuros(pr.importe_centimos)}`).join(" · ") || "Sin precio"}
                    </p>
                    {p.alergenos_estado === "pendiente" && <p className="text-sm font-medium text-aviso">Alérgenos pendientes</p>}
                  </Link>
                  <BotonAgotado agotado={p.agotado} onChange={(v) => agotado(p, v)} />
                </li>
              ))}
            </ul>
            <Link
              to="/panel/plato/$id"
              params={{ id: "nuevo" }}
              search={{ categoria: c.id }}
              className="btn-fantasma w-full rounded-t-none border-t border-linea"
            >
              + Añadir plato
            </Link>
          </section>
        );
      })}

      {filtrando && filtrada.length === 0 && <p className="py-6 text-center text-base text-tinta-suave">No hay platos que coincidan.</p>}

      {!filtrando && (
        <form onSubmit={añadirCategoria} className="tarjeta space-y-3">
          <label htmlFor="nuevacat" className="etiqueta">{carta.length === 0 ? "Crea tu primera categoría" : "Nueva categoría"}</label>
          <input
            id="nuevacat"
            className="campo"
            placeholder="Entrantes, Tapas, Bebidas…"
            maxLength={80}
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
          />
          <button className="btn-secundario w-full" disabled={!nuevaCat.trim()}>+ Añadir categoría</button>
        </form>
      )}
    </div>
  );
}

function BotonOrden({ etiqueta, icono, disabled, onClick, compacto }: { etiqueta: string; icono: string; disabled: boolean; onClick: () => void; compacto?: boolean }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center rounded-lg text-tinta-suave hover:bg-stone-100 disabled:opacity-25 ${compacto ? "h-9 w-10 text-xs" : "size-11 text-sm"}`}
    >
      {icono}
    </button>
  );
}
