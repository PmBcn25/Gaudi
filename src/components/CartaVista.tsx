import { APP_NAME } from "~/lib/config";
import { formatoEuros } from "~/lib/format";
import { urlLogo } from "~/lib/supabase";
import type { CartaPublica } from "~/lib/types";
import { AlergenosPlato } from "./Alergenos";

/** Texto blanco o negro según el color de fondo, para mantener el contraste. */
export function colorTextoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.4 ? "#111111" : "#ffffff";
}

export function CartaVista({ carta, vistaPrevia = false }: { carta: CartaPublica; vistaPrevia?: boolean }) {
  const { local, categorias } = carta;
  const logo = urlLogo(local.logo_path);
  const textoCabecera = colorTextoSobre(local.color);
  const telefonoHref = local.telefono ? `tel:${local.telefono.replace(/[^\d+]/g, "")}` : null;
  const mapaHref = local.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${local.nombre}, ${local.direccion}`)}`
    : null;

  return (
    <div className="min-h-dvh bg-white text-[17px] text-tinta" style={{ ["--color-local" as string]: local.color }}>
      <header style={{ background: local.color, color: textoCabecera }}>
        <div className="mx-auto max-w-2xl px-4 pb-6 pt-8">
          <div className="flex items-center gap-4">
            {logo && (
              <img
                src={logo}
                alt={`Logo de ${local.nombre}`}
                width={72}
                height={72}
                className="size-[72px] shrink-0 rounded-2xl bg-white object-contain p-1"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-[28px] font-bold leading-tight">{local.nombre}</h1>
              {local.tipo_cocina && <p className="text-lg opacity-90">{local.tipo_cocina}</p>}
            </div>
          </div>
          {local.presentacion && <p className="mt-4 text-[17px] leading-relaxed opacity-95">{local.presentacion}</p>}
        </div>
      </header>

      {categorias.length > 1 && (
        <nav
          aria-label="Categorías de la carta"
          className="sticky top-0 z-10 border-b border-linea bg-white/95 backdrop-blur"
        >
          <ul className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {categorias.map((c) => (
              <li key={c.id} className="shrink-0">
                <a
                  href={`#cat-${c.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border-2 border-linea px-4 text-base font-semibold text-tinta hover:border-[var(--color-local)]"
                >
                  {c.nombre}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-4 pb-10">
        {categorias.length === 0 && (
          <p className="py-16 text-center text-lg text-tinta-suave">Esta carta todavía no tiene platos.</p>
        )}
        {categorias.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-20 pt-8">
            <h2 className="border-b-[3px] pb-2 text-2xl font-bold" style={{ borderColor: local.color }}>
              {c.nombre}
            </h2>
            <ul className="divide-y divide-linea">
              {c.platos.map((p) => (
                <li key={p.id} className={`py-4 ${p.agotado ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-lg font-semibold leading-snug">
                      {p.nombre}
                      {p.agotado && (
                        <span className="ml-2 inline-block rounded-md bg-stone-200 px-2 py-0.5 align-middle text-sm font-bold uppercase tracking-wide text-tinta">
                          Agotado
                        </span>
                      )}
                    </h3>
                    {p.precios.length === 1 && !p.precios[0].etiqueta && (
                      <p className="shrink-0 text-lg font-bold tabular-nums">{formatoEuros(p.precios[0].importe_centimos)}</p>
                    )}
                  </div>
                  {p.descripcion && <p className="mt-1 text-[17px] leading-relaxed text-tinta-suave">{p.descripcion}</p>}
                  {(p.precios.length > 1 || (p.precios.length === 1 && p.precios[0].etiqueta)) && (
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                      {p.precios.map((pr, i) => (
                        <div key={i} className="flex items-baseline gap-1.5">
                          <dt className="text-base text-tinta-suave">{pr.etiqueta ?? "Precio"}</dt>
                          <dd className="text-lg font-bold tabular-nums">{formatoEuros(pr.importe_centimos)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <AlergenosPlato estado={p.alergenos_estado} alergenos={p.alergenos} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {(local.telefono || local.direccion || local.horario || local.instagram || local.web || local.email_contacto) && (
          <section className="mt-10 rounded-2xl bg-papel p-5">
            <h2 className="text-xl font-bold">Información del local</h2>
            <ul className="mt-3 space-y-2 text-[17px]">
              {local.direccion && (
                <li>
                  <span className="font-semibold">Dirección: </span>
                  {mapaHref ? <a className="underline" href={mapaHref} target="_blank" rel="noopener noreferrer">{local.direccion}</a> : local.direccion}
                </li>
              )}
              {local.telefono && (
                <li>
                  <span className="font-semibold">Teléfono: </span>
                  <a className="underline" href={telefonoHref!}>{local.telefono}</a>
                </li>
              )}
              {local.horario && (
                <li className="whitespace-pre-line">
                  <span className="font-semibold">Horario: </span>
                  {local.horario}
                </li>
              )}
              {local.email_contacto && (
                <li>
                  <span className="font-semibold">Email: </span>
                  <a className="underline" href={`mailto:${local.email_contacto}`}>{local.email_contacto}</a>
                </li>
              )}
              {local.instagram && (
                <li>
                  <span className="font-semibold">Instagram: </span>
                  <a className="underline" href={`https://instagram.com/${local.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                    @{local.instagram.replace(/^@/, "")}
                  </a>
                </li>
              )}
              {local.web && (
                <li>
                  <span className="font-semibold">Web: </span>
                  <a className="underline" href={/^https?:\/\//.test(local.web) ? local.web : `https://${local.web}`} target="_blank" rel="noopener noreferrer">
                    {local.web.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}

        <p className="mt-8 text-base text-tinta-suave">
          Precios finales en euros, IVA incluido. La información de la carta, incluidos precios y alérgenos, es responsabilidad del local.
        </p>
      </main>

      <footer className="border-t border-linea py-6 text-center text-base text-tinta-suave">
        {vistaPrevia ? (
          <span>Carta creada con {APP_NAME}</span>
        ) : (
          <a href={`/registro?ref=${encodeURIComponent(local.slug)}`} className="underline-offset-2 hover:underline">
            Carta creada con <strong className="font-semibold">{APP_NAME}</strong>
          </a>
        )}
      </footer>
    </div>
  );
}
