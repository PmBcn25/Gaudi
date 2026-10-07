import { createFileRoute, notFound } from "@tanstack/react-router";
import { CartaVista } from "~/components/CartaVista";
import { APP_NAME, siteUrl } from "~/lib/config";
import { supabase, urlLogo } from "~/lib/supabase";
import type { CartaPublica } from "~/lib/types";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const slug = params.slug.toLowerCase();
    // Cuenta la visita solo en la carga inicial servida por el servidor (una por apertura de enlace o QR).
    const contar = typeof window === "undefined";
    const { data, error } = await supabase().rpc("get_carta_publica", { p_slug: slug, p_contar_visita: contar });
    if (error) throw new Error("No hemos podido cargar la carta. Inténtalo de nuevo.");
    if (!data) throw notFound();
    return data as CartaPublica;
  },
  staleTime: 30_000,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: `Carta no encontrada · ${APP_NAME}` }] };
    const { local } = loaderData;
    const titulo = `${local.nombre} · Carta`;
    const descripcion =
      local.presentacion?.slice(0, 160) ||
      `Consulta la carta de ${local.nombre}${local.tipo_cocina ? ` (${local.tipo_cocina})` : ""}: platos, precios y alérgenos.`;
    const logo = urlLogo(local.logo_path);
    const url = `${siteUrl()}/${local.slug}`;
    return {
      meta: [
        { title: titulo },
        { name: "description", content: descripcion },
        { name: "theme-color", content: local.color },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: APP_NAME },
        { property: "og:locale", content: "es_ES" },
        { property: "og:title", content: titulo },
        { property: "og:description", content: descripcion },
        { property: "og:url", content: url },
        ...(logo
          ? [
              { property: "og:image", content: logo },
              { property: "og:image:width", content: "512" },
              { property: "og:image:height", content: "512" },
              { property: "og:image:alt", content: `Logo de ${local.nombre}` },
            ]
          : []),
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: titulo },
        { name: "twitter:description", content: descripcion },
        ...(logo ? [{ name: "twitter:image", content: logo }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PaginaCarta,
  notFoundComponent: CartaNoEncontrada,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">No se ha podido cargar la carta</h1>
      <p className="mt-2 text-lg text-tinta-suave">{error instanceof Error ? error.message : "Inténtalo de nuevo."}</p>
      <button className="btn-primario mt-6" onClick={() => window.location.reload()}>Reintentar</button>
    </main>
  ),
});

function PaginaCarta() {
  const carta = Route.useLoaderData();
  return <CartaVista carta={carta} />;
}

function CartaNoEncontrada() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Esta carta no está disponible</h1>
      <p className="mt-2 text-lg text-tinta-suave">Puede que el enlace no sea correcto o que el local aún no la haya publicado.</p>
      <a href="/" className="btn-secundario mt-6">Ir a {APP_NAME}</a>
    </main>
  );
}
