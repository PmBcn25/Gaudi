import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { supabase } from "~/lib/supabase";

// Enlace corto permanente del QR: /q/<código> → /<enlace actual del local>.
// El código no cambia nunca, así que un QR impreso sigue funcionando aunque el local cambie de nombre o de enlace.
export const Route = createFileRoute("/q/$codigo")({
  loader: async ({ params }) => {
    const { data: slug } = await supabase().rpc("resolver_qr", { p_codigo: params.codigo });
    if (!slug) throw notFound();
    throw redirect({ to: "/$slug", params: { slug: slug as string }, statusCode: 302 });
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Este código QR no está activo</h1>
      <p className="mt-2 text-lg text-tinta-suave">Pide la carta al personal del local.</p>
    </main>
  ),
});
