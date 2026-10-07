import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Aviso, Cargando } from "~/components/Aviso";
import { CartaVista } from "~/components/CartaVista";
import { actualizarLocal, cargarCarta } from "~/lib/datos";
import { descargarQrPdf, descargarQrPng, enlaceCorto, enlaceLegible, qrDataUrl } from "~/lib/qr";
import { mensajeError } from "~/lib/supabase";
import type { CartaPublica, Categoria, Local } from "~/lib/types";
import { useLocal } from "./panel";

export const Route = createFileRoute("/panel/publicar")({
  component: Publicar,
});

function aCartaPublica(local: Local, categorias: Categoria[]): CartaPublica {
  return {
    local,
    categorias: categorias
      .filter((c) => c.platos.length > 0)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        platos: c.platos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          agotado: p.agotado,
          alergenos_estado: p.alergenos_estado,
          alergenos: p.alergenos,
          precios: p.precios.map((pr) => ({ etiqueta: pr.etiqueta, importe_centimos: pr.importe_centimos })),
        })),
      })),
  };
}

function Publicar() {
  const { local, setLocal } = useLocal();
  const [carta, setCarta] = useState<Categoria[] | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [vista, setVista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    cargarCarta(local.id).then(setCarta).catch((e) => setError(mensajeError(e)));
    qrDataUrl(enlaceCorto(local.qr_code), 600).then(setQr);
  }, [local.id, local.qr_code]);

  if (!carta) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;

  const platos = carta.flatMap((c) => c.platos);
  const pendientes = platos.filter((p) => p.alergenos_estado === "pendiente").length;
  const publicada = local.estado === "publicada";
  const enlace = enlaceLegible(local.slug);

  async function cambiarEstado(estado: "publicada" | "borrador") {
    if (estado === "borrador" && !confirm("Tu carta dejará de verse en el enlace y en el QR. ¿Seguro?")) return;
    setTrabajando(true);
    setError(null);
    try {
      setLocal(await actualizarLocal(local.id, { estado }));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function compartir() {
    const datos = { title: local.nombre, text: `Nuestra carta: ${local.nombre}`, url: enlace };
    if (navigator.share) {
      await navigator.share(datos).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${datos.text} ${enlace}`)}`, "_blank", "noopener");
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(enlace);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (vista) {
    return (
      <div className="fixed inset-0 z-30 overflow-y-auto bg-white">
        <div className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-tinta px-4 py-2 text-white">
          <span className="text-sm font-semibold">Vista previa: así la verán tus clientes</span>
          <button className="min-h-11 rounded-lg bg-white px-4 text-base font-semibold text-tinta" onClick={() => setVista(false)}>Cerrar</button>
        </div>
        <CartaVista carta={aCartaPublica(local, carta)} vistaPrevia />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{publicada ? "Tu carta está publicada" : "Publicar tu carta"}</h1>
        {!publicada && <p className="mt-1 text-base text-tinta-suave">Paso 3 de 3. Revisa la vista previa y publica.</p>}
      </div>

      {platos.length === 0 && (
        <Aviso tipo="aviso">
          Tu carta no tiene platos todavía. <Link to="/panel/empezar" className="font-semibold underline">Añádelos</Link> antes de publicar.
        </Aviso>
      )}
      {pendientes > 0 && (
        <Aviso tipo="aviso">
          {pendientes} platos con alérgenos pendientes: en la carta pondrá «Consulta los alérgenos al personal».{" "}
          <Link to="/panel/carta" search={{ filtro: "pendientes" }} className="font-semibold underline">Completarlos</Link>
        </Aviso>
      )}
      {local.estado === "desactivada" && <Aviso tipo="error">Esta carta está desactivada por el administrador.</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <button className="btn-secundario w-full" onClick={() => setVista(true)} disabled={platos.length === 0}>
        👀 Ver vista previa
      </button>

      {!publicada && local.estado !== "desactivada" && (
        <button className="btn-primario w-full text-lg" onClick={() => cambiarEstado("publicada")} disabled={trabajando || platos.length === 0}>
          {trabajando ? "Publicando…" : "Publicar"}
        </button>
      )}

      {publicada && (
        <>
          <section className="tarjeta space-y-3">
            <h2 className="text-lg font-bold">Enlace de tu carta</h2>
            <a href={enlace} target="_blank" rel="noopener" className="block break-all text-lg font-semibold text-marca underline">
              {enlace.replace(/^https?:\/\//, "")}
            </a>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secundario" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar enlace"}</button>
              <button className="btn-secundario" onClick={compartir}>Compartir</button>
            </div>
            <p className="ayuda">Ponlo en tu perfil de Google, Instagram y WhatsApp Business.</p>
          </section>
        </>
      )}

      <section className="tarjeta space-y-3 text-center">
        <h2 className="text-lg font-bold">Código QR para las mesas</h2>
        {qr && <img src={qr} alt={`Código QR de la carta de ${local.nombre}`} width={240} height={240} className="mx-auto size-60" />}
        <p className="text-base text-tinta-suave">
          Este QR no cambia nunca, aunque cambies el nombre o el enlace del local.
          {!publicada && " Funcionará en cuanto publiques la carta."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primario" onClick={() => descargarQrPdf(local.qr_code, local.slug, local.nombre).catch((e) => setError(mensajeError(e)))}>
            PDF para imprimir
          </button>
          <button className="btn-secundario" onClick={() => descargarQrPng(local.qr_code, local.slug).catch((e) => setError(mensajeError(e)))}>
            Imagen PNG
          </button>
        </div>
      </section>

      {publicada && (
        <button className="btn-fantasma w-full" onClick={() => cambiarEstado("borrador")} disabled={trabajando}>
          Despublicar (ocultar la carta)
        </button>
      )}
    </div>
  );
}
