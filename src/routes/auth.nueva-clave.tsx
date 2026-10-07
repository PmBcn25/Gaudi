import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "~/components/AuthLayout";
import { Aviso } from "~/components/Aviso";
import { traducirErrorAuth } from "~/lib/auth";
import { supabase } from "~/lib/supabase";

export const Route = createFileRoute("/auth/nueva-clave")({
  ssr: false,
  component: NuevaClave,
});

function NuevaClave() {
  const navigate = useNavigate();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const { error } = await supabase().auth.updateUser({ password: clave });
    setCargando(false);
    if (error) return setError(traducirErrorAuth(error.message));
    navigate({ to: "/panel" });
  }

  return (
    <AuthLayout titulo="Nueva contraseña">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label htmlFor="clave" className="etiqueta">Contraseña nueva</label>
          <input id="clave" type="password" className="campo" autoComplete="new-password" minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} />
          <p className="ayuda">Mínimo 8 caracteres.</p>
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="btn-primario w-full" disabled={cargando || clave.length < 8}>Guardar contraseña</button>
      </form>
    </AuthLayout>
  );
}
