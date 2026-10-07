import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Aviso } from "~/components/Aviso";
import { LIMITES_PLAN } from "~/lib/config";
import { miCuota, type Cuota } from "~/lib/datos";
import { prepararFoto } from "~/lib/imagen";
import { invocar, mensajeError, supabase } from "~/lib/supabase";
import type { Importacion } from "~/lib/types";
import { useLocal } from "./panel";

export const Route = createFileRoute("/panel/importar/")({
  component: Importar,
});

type Fase = "elegir" | "subiendo" | "leyendo" | "error";

const MENSAJES_LECTURA = [
  "Leyendo la carta…",
  "Buscando categorías y platos…",
  "Copiando los precios tal como aparecen…",
  "Marcando lo que conviene revisar…",
  "Casi listo…",
];

function Importar() {
  const { local, user } = useLocal();
  const navigate = useNavigate();
  const [modo, setModo] = useState<"fotos" | "pdf">("fotos");
  const [fotos, setFotos] = useState<File[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [fase, setFase] = useState<Fase>("elegir");
  const [progreso, setProgreso] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cuota, setCuota] = useState<Cuota | null>(null);
  const cancelado = useRef(false);

  useEffect(() => {
    miCuota().then(setCuota).catch(() => {});
    return () => {
      cancelado.current = true;
    };
  }, []);

  useEffect(() => {
    if (fase !== "leyendo") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [fase]);

  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const sinCuota = cuota ? cuota.importaciones_usadas >= cuota.limites.importaciones_mes : false;
  const sinVerificar = !user.email_confirmed_at;
  const listo = modo === "fotos" ? fotos.length > 0 : !!pdf;

  function añadirFotos(lista: FileList | null) {
    if (!lista) return;
    setError(null);
    const nuevas = [...fotos, ...Array.from(lista)];
    if (nuevas.length > LIMITES_PLAN.fotos_por_importacion) {
      setError(`Puedes subir hasta ${LIMITES_PLAN.fotos_por_importacion} fotos por importación.`);
    }
    setFotos(nuevas.slice(0, LIMITES_PLAN.fotos_por_importacion));
  }

  async function empezar() {
    setError(null);
    setFase("subiendo");
    setProgreso(0);
    setSegundos(0);
    const sb = supabase();
    try {
      const { data: imp, error: e1 } = await sb
        .from("importaciones")
        .insert({ local_id: local.id, tipo: modo })
        .select("id")
        .single();
      if (e1 || !imp) throw new Error("No hemos podido empezar la importación.");

      const carpeta = `${local.id}/${imp.id}`;
      if (modo === "pdf" && pdf) {
        if (pdf.size > 15 * 1024 * 1024) throw new Error("El PDF pesa demasiado (máximo 15 MB).");
        const { error } = await sb.storage.from("importaciones").upload(`${carpeta}/carta.pdf`, pdf, { contentType: "application/pdf" });
        if (error) throw new Error("No hemos podido subir el PDF. Revisa tu conexión.");
        setProgreso(100);
      } else {
        for (let i = 0; i < fotos.length; i++) {
          const blob = await prepararFoto(fotos[i]);
          const nombre = `${String(i + 1).padStart(2, "0")}.jpg`;
          const { error } = await sb.storage.from("importaciones").upload(`${carpeta}/${nombre}`, blob, { contentType: "image/jpeg" });
          if (error) throw new Error(`No hemos podido subir la foto ${i + 1}. Revisa tu conexión.`);
          setProgreso(Math.round(((i + 1) / fotos.length) * 100));
        }
      }

      setFase("leyendo");
      await invocar("import-menu", { importacion_id: imp.id });
      const resultado = await esperarResultado(imp.id);
      if (cancelado.current) return;
      if (resultado.estado === "listo") {
        navigate({ to: "/panel/importar/$id", params: { id: imp.id } });
      } else {
        setError(resultado.error ?? "La importación ha fallado.");
        setFase("error");
      }
    } catch (e) {
      setError(mensajeError(e));
      setFase("error");
    }
  }

  async function esperarResultado(id: string): Promise<Pick<Importacion, "estado" | "error">> {
    const limite = Date.now() + 6 * 60 * 1000;
    while (Date.now() < limite && !cancelado.current) {
      await new Promise((r) => setTimeout(r, 2500));
      const { data } = await supabase().from("importaciones").select("estado, error").eq("id", id).single();
      if (data && data.estado !== "procesando" && data.estado !== "subiendo") return data as Pick<Importacion, "estado" | "error">;
    }
    return { estado: "error", error: "La lectura está tardando demasiado. Vuelve a intentarlo en unos minutos." };
  }

  if (fase === "subiendo" || fase === "leyendo") {
    const mensaje = fase === "subiendo" ? `Subiendo… ${progreso}%` : MENSAJES_LECTURA[Math.min(MENSAJES_LECTURA.length - 1, Math.floor(segundos / 12))];
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center" aria-live="polite">
        <span className="size-14 animate-spin rounded-full border-4 border-linea border-t-marca" aria-hidden />
        <p className="mt-6 text-xl font-bold">{mensaje}</p>
        <div className="mt-4 h-2.5 w-full max-w-xs overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-marca transition-all duration-1000"
            style={{ width: fase === "subiendo" ? `${progreso * 0.2}%` : `${Math.min(95, 20 + segundos * 0.75)}%` }}
          />
        </div>
        <p className="mt-4 max-w-xs text-base text-tinta-suave">Suele tardar menos de 2 minutos. No cierres esta pantalla.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Importar mi carta</h1>
        <p className="mt-1 text-base text-tinta-suave">La IA copia categorías, platos, descripciones y precios. Los alérgenos los marcas tú después.</p>
      </div>

      {sinVerificar && <Aviso tipo="aviso">Confirma tu email para usar la IA. Mientras tanto puedes crear la carta a mano.</Aviso>}
      {sinCuota && (
        <Aviso tipo="aviso">
          Has usado las {cuota!.limites.importaciones_mes} importaciones de este mes. Se renuevan el día 1. Puedes seguir editando tu carta a mano.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(["fotos", "pdf"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`min-h-12 rounded-xl border-2 text-base font-semibold ${modo === m ? "border-marca bg-marca-clara text-marca-osc" : "border-linea bg-white"}`}
          >
            {m === "fotos" ? "📷 Fotos" : "📄 PDF"}
          </button>
        ))}
      </div>

      {modo === "fotos" ? (
        <section className="tarjeta space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-base text-tinta-suave">
            <li>Una foto por página, de frente y con buena luz.</li>
            <li>Que se lean bien los precios. Evita reflejos y sombras.</li>
            <li>Hasta {LIMITES_PLAN.fotos_por_importacion} fotos.</li>
          </ul>
          {fotos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {fotos.map((f, i) => (
                <li key={i} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-linea bg-stone-100">
                  <img src={previews[i]} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-tinta/80 text-white"
                    aria-label={`Quitar foto ${i + 1}`}
                    onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                  <span className="absolute bottom-1 left-1 rounded bg-tinta/80 px-1.5 text-sm text-white">{i + 1}</span>
                </li>
              ))}
            </ul>
          )}
          {fotos.length < LIMITES_PLAN.fotos_por_importacion && (
            <div className="grid grid-cols-2 gap-2">
              <label className="btn-secundario cursor-pointer">
                Hacer foto
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { añadirFotos(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="btn-secundario cursor-pointer">
                Elegir de galería
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { añadirFotos(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          )}
        </section>
      ) : (
        <section className="tarjeta space-y-4">
          <p className="text-base text-tinta-suave">Un PDF de hasta {LIMITES_PLAN.paginas_pdf} páginas y 15 MB.</p>
          {pdf && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
              <span className="truncate text-base">📄 {pdf.name}</span>
              <button className="btn-fantasma min-h-10" onClick={() => setPdf(null)}>Quitar</button>
            </div>
          )}
          <label className="btn-secundario w-full cursor-pointer">
            {pdf ? "Elegir otro PDF" : "Elegir PDF"}
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => { setPdf(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </section>
      )}

      {error && (
        <Aviso tipo="error">
          <p>{error}</p>
          {fase === "error" && (
            <p className="mt-2">
              Puedes repetir las fotos o{" "}
              <Link to="/panel/carta" className="font-semibold underline">seguir a mano</Link>.
            </p>
          )}
        </Aviso>
      )}

      <button className="btn-primario w-full text-lg" disabled={!listo || sinCuota || sinVerificar} onClick={empezar}>
        {fase === "error" ? "Volver a intentarlo" : "Leer mi carta"}
      </button>
      {cuota && !sinCuota && (
        <p className="text-center text-sm text-tinta-suave">
          Te quedan {cuota.limites.importaciones_mes - cuota.importaciones_usadas} de {cuota.limites.importaciones_mes} importaciones este mes.
        </p>
      )}
      <Link to="/panel/carta" className="btn-fantasma w-full">Prefiero hacerla a mano</Link>
    </div>
  );
}
