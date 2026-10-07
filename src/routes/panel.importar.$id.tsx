import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Aviso, Cargando } from "~/components/Aviso";
import { AlergenosPlato, SelectorAlergenos } from "~/components/Alergenos";
import { EditorPrecios, type PrecioEditable } from "~/components/EditorPrecios";
import { centimosATexto, formatoEuros, leerEuros } from "~/lib/format";
import { mensajeError, supabase } from "~/lib/supabase";
import type { AlergenoId } from "~/lib/alergenos";
import type { Borrador, EstadoAlergenos, Importacion } from "~/lib/types";
import { useLocal } from "./panel";

export const Route = createFileRoute("/panel/importar/$id")({
  component: Revisar,
});

type PlatoRev = {
  clave: string;
  nombre: string;
  descripcion: string;
  precios: PrecioEditable[];
  alergenos_estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  dudoso: boolean;
  motivo: string | null;
};
type CategoriaRev = { clave: string; nombre: string; platos: PlatoRev[] };

let contador = 0;
const clave = () => `k${++contador}`;

function aEditable(b: Borrador): CategoriaRev[] {
  return b.categorias.map((c) => ({
    clave: clave(),
    nombre: c.nombre,
    platos: c.platos.map((p) => ({
      clave: clave(),
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      precios: p.precios.map((pr) => ({
        etiqueta: pr.etiqueta ?? "",
        importe: centimosATexto(pr.importe_centimos),
        dudoso: pr.dudoso,
        original: pr.texto_original,
      })),
      alergenos_estado: "pendiente",
      alergenos: [],
      dudoso: p.dudoso,
      motivo: p.motivo_duda,
    })),
  }));
}

function problemas(p: PlatoRev): string | null {
  if (!p.nombre.trim()) return "Falta el nombre.";
  if (p.precios.some((pr) => leerEuros(pr.importe) === null)) return "Hay un precio sin importe válido.";
  if (p.precios.length > 1 && p.precios.some((pr) => !pr.etiqueta.trim())) return "Pon etiqueta a cada precio (ej. tapa, ración).";
  if (p.alergenos_estado === "contiene" && p.alergenos.length === 0) return "Marca qué alérgenos contiene.";
  if (p.dudoso) return p.motivo ?? "Revisa este plato.";
  return null;
}

function Revisar() {
  const { id } = Route.useParams();
  const { local } = useLocal();
  const navigate = useNavigate();
  const [imp, setImp] = useState<Importacion | null>(null);
  const [cats, setCats] = useState<CategoriaRev[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    supabase()
      .from("importaciones")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return setError("No encontramos esta importación.");
        setImp(data as Importacion);
        if (data.resultado) setCats(aEditable(data.resultado as Borrador));
      });
  }, [id]);

  if (error && !imp) return <Aviso tipo="error">{error}</Aviso>;
  if (!imp) return <Cargando />;
  if (imp.estado === "confirmado") {
    return (
      <div className="space-y-4">
        <Aviso tipo="ok">Esta importación ya está en tu carta.</Aviso>
        <Link to="/panel/carta" className="btn-primario w-full">Ir a mi carta</Link>
      </div>
    );
  }
  if (imp.estado !== "listo") {
    return (
      <div className="space-y-4">
        <Aviso tipo="error">{imp.error ?? "Esta importación no se ha completado."}</Aviso>
        <Link to="/panel/importar" className="btn-primario w-full">Repetir la importación</Link>
        <Link to="/panel/carta" className="btn-secundario w-full">Seguir a mano</Link>
      </div>
    );
  }

  const todos = cats.flatMap((c) => c.platos);
  const pendientes = todos.filter((p) => problemas(p) !== null);
  const sinAlergenos = todos.filter((p) => p.alergenos_estado === "pendiente").length;

  const actualizarPlato = (cClave: string, pClave: string, cambios: Partial<PlatoRev>) =>
    setCats((cs) => cs.map((c) => (c.clave !== cClave ? c : { ...c, platos: c.platos.map((p) => (p.clave === pClave ? { ...p, ...cambios } : p)) })));

  async function confirmar() {
    setError(null);
    if (pendientes.length > 0) {
      setError(`Quedan ${pendientes.length} platos por revisar.`);
      const primero = pendientes[0];
      setAbierto(primero.clave);
      document.getElementById(primero.clave)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setGuardando(true);
    const borrador = {
      categorias: cats
        .filter((c) => c.platos.length > 0)
        .map((c) => ({
          nombre: c.nombre.trim() || "Carta",
          platos: c.platos.map((p) => ({
            nombre: p.nombre.trim(),
            descripcion: p.descripcion.trim() || null,
            alergenos_estado: p.alergenos_estado,
            alergenos: p.alergenos_estado === "contiene" ? p.alergenos : [],
            precios: p.precios.map((pr) => ({ etiqueta: pr.etiqueta.trim() || null, importe_centimos: leerEuros(pr.importe) })),
          })),
        })),
    };
    const { error } = await supabase().rpc("confirmar_importacion", { p_importacion_id: id, p_borrador: borrador });
    setGuardando(false);
    if (error) return setError(mensajeError(error));
    navigate({ to: "/panel/carta", search: { importado: true } });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Revisa tu carta</h1>
        <p className="mt-1 text-base text-tinta-suave">
          {todos.length} platos en {cats.length} categorías. Toca un plato para corregirlo. Nada se publica hasta que confirmes.
        </p>
      </div>

      {imp.resultado?.avisos?.map((a, i) => <Aviso key={i} tipo="aviso">{a}</Aviso>)}

      {pendientes.length > 0 ? (
        <Aviso tipo="aviso">
          <strong>{pendientes.length} {pendientes.length === 1 ? "plato marcado" : "platos marcados"} para revisar.</strong> La IA no lo ha leído con seguridad.
        </Aviso>
      ) : (
        <Aviso tipo="ok">Todo revisado.</Aviso>
      )}

      {cats.map((c) => (
        <section key={c.clave} className="tarjeta p-0">
          <div className="flex items-center gap-2 border-b border-linea p-3">
            <input
              className="campo min-h-11 flex-1 font-bold"
              value={c.nombre}
              aria-label="Nombre de la categoría"
              onChange={(e) => setCats((cs) => cs.map((x) => (x.clave === c.clave ? { ...x, nombre: e.target.value } : x)))}
            />
            <button
              className="btn-fantasma min-h-11 text-sm"
              onClick={() => confirm(`¿Quitar la categoría «${c.nombre}» y sus ${c.platos.length} platos?`) && setCats((cs) => cs.filter((x) => x.clave !== c.clave))}
            >
              Quitar
            </button>
          </div>
          <ul className="divide-y divide-linea">
            {c.platos.map((p) => {
              const problema = problemas(p);
              const abiertoAqui = abierto === p.clave;
              return (
                <li key={p.clave} id={p.clave} className={problema ? "bg-aviso-fondo/60" : ""}>
                  <button
                    className="flex w-full items-start gap-3 p-3 text-left"
                    aria-expanded={abiertoAqui}
                    onClick={() => setAbierto(abiertoAqui ? null : p.clave)}
                  >
                    <span className="mt-0.5 text-lg" aria-hidden>{problema ? "⚠️" : "✅"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{p.nombre || "(sin nombre)"}</span>
                      <span className="block text-sm text-tinta-suave">
                        {p.precios.map((pr) => `${pr.etiqueta ? pr.etiqueta + " " : ""}${leerEuros(pr.importe) !== null ? formatoEuros(leerEuros(pr.importe)!) : "?"}`).join(" · ") || "Sin precio"}
                      </span>
                      {problema && <span className="mt-1 block text-sm font-medium text-aviso">{problema}</span>}
                    </span>
                    <span className="text-tinta-suave" aria-hidden>{abiertoAqui ? "▲" : "▼"}</span>
                  </button>
                  {abiertoAqui && (
                    <div className="space-y-4 border-t border-linea bg-white p-4">
                      <div>
                        <label className="etiqueta" htmlFor={`n-${p.clave}`}>Nombre</label>
                        <input id={`n-${p.clave}`} className="campo" maxLength={120} value={p.nombre} onChange={(e) => actualizarPlato(c.clave, p.clave, { nombre: e.target.value })} />
                      </div>
                      <div>
                        <label className="etiqueta" htmlFor={`d-${p.clave}`}>Descripción (opcional)</label>
                        <textarea id={`d-${p.clave}`} className="campo min-h-20" maxLength={400} value={p.descripcion} onChange={(e) => actualizarPlato(c.clave, p.clave, { descripcion: e.target.value })} />
                      </div>
                      <EditorPrecios precios={p.precios} onChange={(precios) => actualizarPlato(c.clave, p.clave, { precios })} />
                      <SelectorAlergenos
                        estado={p.alergenos_estado}
                        alergenos={p.alergenos}
                        onChange={(alergenos_estado, alergenos) => actualizarPlato(c.clave, p.clave, { alergenos_estado, alergenos })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className="btn-primario"
                          onClick={() => {
                            actualizarPlato(c.clave, p.clave, { dudoso: false, precios: p.precios.map((pr) => ({ ...pr, dudoso: false })) });
                            setAbierto(null);
                          }}
                        >
                          {p.dudoso ? "Está bien" : "Hecho"}
                        </button>
                        <button
                          className="btn-peligro"
                          onClick={() => setCats((cs) => cs.map((x) => (x.clave === c.clave ? { ...x, platos: x.platos.filter((y) => y.clave !== p.clave) } : x)))}
                        >
                          Quitar plato
                        </button>
                      </div>
                    </div>
                  )}
                  {!abiertoAqui && p.alergenos_estado !== "pendiente" && (
                    <div className="px-3 pb-3 pl-11"><AlergenosPlato estado={p.alergenos_estado} alergenos={p.alergenos} /></div>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            className="btn-fantasma w-full rounded-t-none border-t border-linea"
            onClick={() => {
              const nuevo: PlatoRev = { clave: clave(), nombre: "", descripcion: "", precios: [{ etiqueta: "", importe: "" }], alergenos_estado: "pendiente", alergenos: [], dudoso: false, motivo: null };
              setCats((cs) => cs.map((x) => (x.clave === c.clave ? { ...x, platos: [...x.platos, nuevo] } : x)));
              setAbierto(nuevo.clave);
            }}
          >
            + Añadir plato que falta
          </button>
        </section>
      ))}

      {sinAlergenos > 0 && (
        <p className="text-base text-tinta-suave">
          {sinAlergenos} platos con alérgenos pendientes. Puedes marcarlos ahora o más tarde desde el editor.
        </p>
      )}
      {local.estado === "publicada" && (
        <Aviso tipo="info">Tu carta ya está publicada: estos platos se añadirán a la carta pública al confirmar.</Aviso>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="sticky bottom-20 z-10 space-y-2">
        <button className="btn-primario w-full text-lg shadow-lg" onClick={confirmar} disabled={guardando || todos.length === 0}>
          {guardando ? "Guardando…" : pendientes.length > 0 ? `Confirmar (${pendientes.length} por revisar)` : "Confirmar borrador"}
        </button>
      </div>
      <Link to="/panel" className="btn-fantasma w-full">Descartar esta importación</Link>
    </div>
  );
}
