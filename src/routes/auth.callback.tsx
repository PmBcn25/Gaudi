import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "~/components/AuthLayout";
import { Aviso, Cargando } from "~/components/Aviso";
import { supabase } from "~/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: Callback,
});

/** Vuelta desde el email de confirmación o desde Google. El cliente canjea el código (PKCE). */
function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, "&"));
    const descripcion = params.get("error_description");
    if (descripcion) {
      setError(/expired|invalid/i.test(descripcion) ? "El enlace ha caducado o ya se ha usado. Entra de nuevo." : descripcion);
      return;
    }
    const sb = supabase();
    const { data } = sb.auth.onAuthStateChange((_e, sesion) => {
      if (sesion) navigate({ to: "/panel", replace: true });
    });
    sb.auth.getSession().then(({ data: d }) => {
      if (d.session) navigate({ to: "/panel", replace: true });
    });
    const t = setTimeout(() => setError("No hemos podido iniciar la sesión. Vuelve a entrar."), 10000);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <AuthLayout titulo={error ? "Algo no ha ido bien" : "Un momento…"}>
      {error ? (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Link to="/entrar" className="btn-primario mt-6 w-full">Ir a entrar</Link>
        </>
      ) : (
        <Cargando texto="Iniciando sesión…" />
      )}
    </AuthLayout>
  );
}
