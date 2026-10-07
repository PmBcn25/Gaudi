import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAME } from "~/lib/config";
import { useSesion } from "~/lib/sesion";
import { PieLegal } from "~/components/PieLegal";
import { IconoAlergeno } from "~/components/Alergenos";

export const Route = createFileRoute("/")({
  component: Inicio,
});

function Inicio() {
  const { sesion } = useSesion();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          {APP_NAME}
        </Link>
        {sesion ? (
          <Link to="/panel" className="btn-secundario min-h-11">Mi panel</Link>
        ) : (
          <Link to="/entrar" className="btn-fantasma min-h-11">Entrar</Link>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-8 md:grid-cols-2 md:pt-16">
          <div>
            <p className="mb-3 inline-block rounded-full bg-marca-clara px-3 py-1 text-sm font-semibold text-marca-osc">
              Gratis para bares, cafeterías y restaurantes
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
              Haz una foto a tu carta y en minutos la tienes publicada, con QR y alérgenos.
            </h1>
            <p className="mt-5 text-lg text-tinta-suave">
              Sin teclear plato a plato. La IA lee tu carta, tú la revisas y la publicas. Después cambias un precio o marcas
              un plato como agotado en segundos, desde el móvil.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={sesion ? "/panel" : "/registro"} className="btn-primario text-lg">
                Crear mi carta gratis
              </Link>
              <a href="#como-funciona" className="btn-secundario">Cómo funciona</a>
            </div>
            <p className="mt-3 text-sm text-tinta-suave">Sin tarjeta. Sin instalar nada.</p>
          </div>
          <MovilEjemplo />
        </section>

        <section id="como-funciona" className="border-y border-linea bg-white">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-3xl font-bold">Tu carta digital en tres pasos</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                ["1", "Haz fotos a tu carta", "Hasta 10 fotos o un PDF. Vale la carta impresa, la pizarra o el PDF que ya tienes."],
                ["2", "Revisa el borrador", "La IA ordena categorías, platos y precios, y te marca lo que no ha leído bien. Tú marcas los alérgenos."],
                ["3", "Publica e imprime el QR", "Tu carta queda en un enlace propio. Descarga el QR para las mesas y compártela por WhatsApp."],
              ].map(([n, titulo, texto]) => (
                <li key={n} className="tarjeta">
                  <span className="flex size-10 items-center justify-center rounded-full bg-marca text-lg font-bold text-white">{n}</span>
                  <h3 className="mt-4 text-xl font-bold">{titulo}</h3>
                  <p className="mt-2 text-base text-tinta-suave">{texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-3xl font-bold">Pensada para el día a día del local</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Ventaja titulo="Cambia precios en segundos">
              Busca el plato, cambia el precio y guarda. El cambio sale al momento en la carta y el QR impreso sigue valiendo.
            </Ventaja>
            <Ventaja titulo="Los 14 alérgenos, claros">
              Marca los alérgenos con iconos. Si un plato está pendiente, la carta indica «Consulta los alérgenos al personal».
            </Ventaja>
            <Ventaja titulo="Un QR que no caduca">
              El QR apunta a un enlace permanente. Aunque cambies el nombre del local, no tienes que volver a imprimirlo.
            </Ventaja>
            <Ventaja titulo="Legible a pleno sol">
              Letra grande y buen contraste para leerla en la terraza. Carga rápido con datos móviles.
            </Ventaja>
            <Ventaja titulo="Textos con ayuda de la IA">
              Pide una presentación del local o descripciones más claras. Tú decides si las aceptas, las editas o las descartas.
            </Ventaja>
            <Ventaja titulo="Sin datos de tus clientes">
              Tus clientes ven la carta sin registrarse y sin descargar nada. Sin cookies de seguimiento.
            </Ventaja>
          </div>
        </section>

        <section className="bg-tinta text-white">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center">
            <h2 className="text-3xl font-bold">Empieza con la carta que ya tienes</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-stone-300">
              Gratis, con 3 importaciones con IA al mes. Si no tienes carta, puedes crearla desde cero.
            </p>
            <Link to={sesion ? "/panel" : "/registro"} className="btn-primario mt-8 text-lg">
              Crear mi carta gratis
            </Link>
          </div>
        </section>
      </main>

      <PieLegal />
    </div>
  );
}

function Ventaja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="tarjeta">
      <h3 className="text-xl font-bold">{titulo}</h3>
      <p className="mt-2 text-base text-tinta-suave">{children}</p>
    </div>
  );
}

function MovilEjemplo() {
  const platos = [
    { n: "Patatas bravas", d: "Con salsa brava y alioli", p: [["Tapa", "3,50 €"], ["Ración", "6,50 €"]], a: ["huevos"] as const },
    { n: "Croquetas de jamón", d: "6 unidades", p: [["", "8,00 €"]], a: ["gluten", "lacteos", "huevos"] as const },
    { n: "Pulpo a la gallega", d: null, p: [["", "16,50 €"]], a: ["moluscos"] as const, agotado: true },
  ];
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.5rem] border-[10px] border-tinta bg-white shadow-2xl" aria-hidden>
      <div className="rounded-t-[1.8rem] bg-marca px-5 pb-4 pt-7 text-white">
        <p className="text-xl font-bold">Bar Ejemplo</p>
        <p className="text-sm opacity-90">Tapas y raciones</p>
      </div>
      <div className="flex gap-2 overflow-hidden border-b border-linea px-4 py-2.5 text-sm font-semibold">
        <span className="rounded-full border-2 border-marca px-3 py-1">Tapas</span>
        <span className="rounded-full border-2 border-linea px-3 py-1">Raciones</span>
        <span className="rounded-full border-2 border-linea px-3 py-1">Bebidas</span>
      </div>
      <ul className="divide-y divide-linea px-4 pb-6">
        {platos.map((p) => (
          <li key={p.n} className={`py-3 ${p.agotado ? "opacity-60" : ""}`}>
            <div className="flex justify-between gap-2">
              <p className="font-semibold">
                {p.n}
                {p.agotado && <span className="ml-1.5 rounded bg-stone-200 px-1.5 text-xs font-bold uppercase">Agotado</span>}
              </p>
              {p.p.length === 1 && <p className="font-bold">{p.p[0][1]}</p>}
            </div>
            {p.d && <p className="text-sm text-tinta-suave">{p.d}</p>}
            {p.p.length > 1 && (
              <p className="mt-1 text-sm">
                {p.p.map(([e, v]) => (
                  <span key={e} className="mr-3">
                    <span className="text-tinta-suave">{e}</span> <strong>{v}</strong>
                  </span>
                ))}
              </p>
            )}
            <div className="mt-1.5 flex gap-1">
              {p.a.map((a) => (
                <IconoAlergeno key={a} id={a} tam={20} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
