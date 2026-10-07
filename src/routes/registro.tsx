import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout, BotonGoogle, Separador } from "~/components/AuthLayout";
import { Aviso } from "~/components/Aviso";
import { entrarConGoogle, traducirErrorAuth } from "~/lib/auth";
import { APP_NAME, siteUrl } from "~/lib/config";
import { supabase } from "~/lib/supabase";

export const Route = createFileRoute("/registro")({
  head: () => ({ meta: [{ title: `Crear mi carta gratis · ${APP_NAME}` }] }),
  component: Registro,
});

function Registro() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acepta) return setError("Acepta las condiciones de uso y la política de privacidad para continuar.");
    setCargando(true);
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password: clave,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    setCargando(false);
    if (error) return setError(traducirErrorAuth(error.message));
    if (data.session) window.location.assign("/panel");
    else setEnviado(true);
  }

  if (enviado) {
    return (
      <AuthLayout titulo="Revisa tu email">
        <Aviso tipo="ok">
          Te hemos enviado un enlace a <strong>{email}</strong>. Púlsalo para confirmar tu cuenta y seguir con tu carta.
        </Aviso>
        <p className="mt-4 text-base text-tinta-suave">¿No lo ves? Mira en la carpeta de spam o promociones.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo="Crea tu carta gratis">
      <BotonGoogle
        cargando={cargando}
        onClick={() => {
          if (!acepta) return setError("Acepta las condiciones de uso y la política de privacidad para continuar.");
          entrarConGoogle().catch((e) => setError(e.message));
        }}
      />
      <Separador />
      <form onSubmit={registrar} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="etiqueta">Email</label>
          <input id="email" type="email" className="campo" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="clave" className="etiqueta">Contraseña</label>
          <input
            id="clave"
            type="password"
            className="campo"
            autoComplete="new-password"
            minLength={8}
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <p className="ayuda">Mínimo 8 caracteres.</p>
        </div>
        <label className="flex items-start gap-3 text-base">
          <input type="checkbox" className="mt-1 size-5 accent-[var(--color-marca)]" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>
            Acepto las{" "}
            <Link to="/legal/$pagina" params={{ pagina: "condiciones" }} className="underline" target="_blank">condiciones de uso</Link> y la{" "}
            <Link to="/legal/$pagina" params={{ pagina: "privacidad" }} className="underline" target="_blank">política de privacidad</Link>.
          </span>
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button type="submit" className="btn-primario w-full" disabled={cargando || !email || clave.length < 8}>
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-6 text-center text-base">
        ¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-marca underline">Entrar</Link>
      </p>
    </AuthLayout>
  );
}
