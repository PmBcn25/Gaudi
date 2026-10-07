import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout, BotonGoogle, Separador } from "~/components/AuthLayout";
import { Aviso } from "~/components/Aviso";
import { entrarConGoogle, traducirErrorAuth } from "~/lib/auth";
import { APP_NAME, siteUrl } from "~/lib/config";
import { supabase } from "~/lib/supabase";

export const Route = createFileRoute("/entrar")({
  head: () => ({ meta: [{ title: `Entrar · ${APP_NAME}` }] }),
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: clave });
    setCargando(false);
    if (error) return setError(traducirErrorAuth(error.message));
    navigate({ to: "/panel" });
  }

  async function recuperar() {
    setError(null);
    if (!email.trim()) return setError("Escribe tu email y vuelve a pulsar «He olvidado mi contraseña».");
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl()}/auth/nueva-clave`,
    });
    if (error) return setError(traducirErrorAuth(error.message));
    setInfo(`Si hay una cuenta con ${email.trim()}, te llegará un enlace para crear una contraseña nueva.`);
  }

  return (
    <AuthLayout titulo="Entrar">
      <BotonGoogle onClick={() => entrarConGoogle().catch((e) => setError(e.message))} cargando={cargando} />
      <Separador />
      <form onSubmit={entrar} className="space-y-4">
        <div>
          <label htmlFor="email" className="etiqueta">Email</label>
          <input id="email" type="email" className="campo" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="clave" className="etiqueta">Contraseña</label>
          <input id="clave" type="password" className="campo" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {info && <Aviso tipo="ok">{info}</Aviso>}
        <button type="submit" className="btn-primario w-full" disabled={cargando || !email || !clave}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
        <button type="button" className="btn-fantasma w-full" onClick={recuperar}>He olvidado mi contraseña</button>
      </form>
      <p className="mt-6 text-center text-base">
        ¿Aún no tienes cuenta? <Link to="/registro" className="font-semibold text-marca underline">Crea tu carta gratis</Link>
      </p>
    </AuthLayout>
  );
}
