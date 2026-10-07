import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Aviso, Cargando } from "~/components/Aviso";
import { cargarCarta, marcarAgotado, miCuota, type Cuota } from "~/lib/datos";
import { formatoEuros } from "~/lib/format";
import { enlaceLegible } from "~/lib/qr";
import { mensajeError } from "~/lib/supabase";
import type { Categoria } from "~/lib/types";
import { useLocal } from "./panel";

export const Route = createFileRoute("/panel/")({
  component: Inicio,
});

function Inicio() {
  const { local } = useLocal();
  const [carta, setCarta] = useState<Categoria[] | null>(null);
  const [cuota, setCuota] = useState<Cuota | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarCarta(local.id).then(setCarta).catch((e) => setError(mensajeError(e)));
    miCuota().then(setCuota).catch(() => {});
  }, [local.id]);

  const platos = useMemo(() => carta?.flatMap((c) => c.platos.map((p) => ({ ...p, categoria: c.nombre }))) ?? [], [carta]);
  const pendientes = platos.filter((p) => p.alergenos_estado === "pendiente").length;
  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return [];
    return platos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 20);
  }, [busqueda, platos]);

  async function alternarAgotado(id: string, agotado: boolean) {
    setCarta((c) => c?.map((cat) => ({ ...cat, platos: cat.platos.map((p) => (p.id === id ? { ...p, agotado } : p)) })) ?? null);
    try {
      await marcarAgotado(id, agotado);
    } catch (e) {
      setError(mensajeError(e));
      setCarta((c) => c?.map((cat) => ({ ...cat, platos: cat.platos.map((p) => (p.id === id ? { ...p, agotado: !agotado } : p)) })) ?? null);
    }
  }

  if (!carta) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;

  const publicada = local.estado === "publicada";

  return (
    <div className="space-y-6">
      <section className="tarjeta">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">Estado de la carta</p>
            <p className={`text-xl font-bold ${publicada ? "text-ok" : local.estado === "desactivada" ? "text-error" : "text-aviso"}`}>
              {publicada ? "Publicada" : local.estado === "desactivada" ? "Desactivada" : "Borrador (no visible)"}
            </p>
          </div>
          {publicada ? (
            <a href={enlaceLegible(local.slug)} target="_blank" rel="noopener" className="btn-secundario min-h-11">Ver carta</a>
          ) : (
            <Link to="/panel/publicar" className="btn-primario min-h-11">Publicar</Link>
          )}
        </div>
        {local.estado === "desactivada" && (
          <p className="mt-3 text-base text-error">El administrador ha desactivado esta carta. Escríbenos si crees que es un error.</p>
        )}
      </section>

      {platos.length === 0 ? (
        <section className="tarjeta text-center">
          <h2 className="text-xl font-bold">Tu carta está vacía</h2>
          <p className="mt-1 text-base text-tinta-suave">Haz fotos a tu carta y la IA la pasa a limpio, o empieza desde cero.</p>
          <Link to="/panel/empezar" className="btn-primario mt-4 w-full">Añadir mi carta</Link>
        </section>
      ) : (
        <section>
          <label htmlFor="buscar" className="text-lg font-bold">Cambio rápido</label>
          <p className="text-base text-tinta-suave">Busca un plato para cambiar el precio o marcarlo agotado.</p>
          <input
            id="buscar"
            type="search"
            className="campo mt-3"
            placeholder="Buscar plato…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoComplete="off"
          />
          {busqueda && (
            <ul className="mt-3 divide-y divide-linea rounded-2xl border border-linea bg-white">
              {resultados.length === 0 && <li className="p-4 text-base text-tinta-suave">No hay platos con ese nombre.</li>}
              {resultados.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <Link to="/panel/plato/$id" params={{ id: p.id }} className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{p.nombre}</p>
                    <p className="truncate text-sm text-tinta-suave">
                      {p.categoria} · {p.precios.map((pr) => formatoEuros(pr.importe_centimos)).join(" / ") || "Sin precio"}
                    </p>
                  </Link>
                  <BotonAgotado agotado={p.agotado} onChange={(v) => alternarAgotado(p.id, v)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pendientes > 0 && (
        <Aviso tipo="aviso">
          {pendientes === 1 ? "1 plato tiene" : `${pendientes} platos tienen`} los alérgenos pendientes. En la carta aparecerá «Consulta los alérgenos al personal».{" "}
          <Link to="/panel/carta" search={{ filtro: "pendientes" }} className="font-semibold underline">Revisarlos</Link>
        </Aviso>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link to="/panel/carta" className="tarjeta block hover:border-tinta-suave">
          <p className="text-3xl font-bold">{platos.length}</p>
          <p className="text-base text-tinta-suave">platos en {carta.length} categorías</p>
        </Link>
        <Link to="/panel/publicar" className="tarjeta block hover:border-tinta-suave">
          <p className="text-3xl font-bold">QR</p>
          <p className="text-base text-tinta-suave">Descargar e imprimir</p>
        </Link>
      </section>

      {cuota && (
        <section className="tarjeta">
          <h2 className="text-lg font-bold">IA este mes (plan gratuito)</h2>
          <Medidor texto="Importaciones de carta" usado={cuota.importaciones_usadas} limite={cuota.limites.importaciones_mes} />
          <Medidor texto="Textos con IA" usado={cuota.textos_usados} limite={cuota.limites.textos_mes} />
          <p className="ayuda">Se renueva el día 1 de cada mes.</p>
        </section>
      )}

      <Link to="/panel/empezar" className="btn-fantasma w-full">Importar otra carta con IA</Link>
    </div>
  );
}

export function BotonAgotado({ agotado, onChange }: { agotado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={agotado}
      onClick={() => onChange(!agotado)}
      className={`min-h-11 shrink-0 rounded-xl border-2 px-3 text-sm font-bold ${
        agotado ? "border-tinta bg-tinta text-white" : "border-linea bg-white text-tinta-suave"
      }`}
    >
      {agotado ? "Agotado" : "Disponible"}
    </button>
  );
}

function Medidor({ texto, usado, limite }: { texto: string; usado: number; limite: number }) {
  const pct = Math.min(100, (usado / limite) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-base">
        <span>{texto}</span>
        <span className="font-semibold tabular-nums">{usado} / {limite}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-error" : "bg-marca"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
