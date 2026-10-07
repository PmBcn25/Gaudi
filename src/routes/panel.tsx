import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { Aviso, Cargando } from "~/components/Aviso";
import { APP_NAME } from "~/lib/config";
import { miLocal } from "~/lib/datos";
import { useSesion } from "~/lib/sesion";
import { mensajeError, supabase } from "~/lib/supabase";
import type { Local } from "~/lib/types";

export const Route = createFileRoute("/panel")({
  ssr: false,
  head: () => ({ meta: [{ title: `Mi carta · ${APP_NAME}` }, { name: "robots", content: "noindex" }] }),
  component: PanelLayout,
});

type CtxPanel = {
  user: User;
  local: Local | null;
  setLocal: (l: Local) => void;
  recargarLocal: () => Promise<void>;
};

const PanelCtx = createContext<CtxPanel | null>(null);

export function usePanel(): CtxPanel {
  const ctx = useContext(PanelCtx);
  if (!ctx) throw new Error("usePanel fuera del panel");
  return ctx;
}

/** Igual que usePanel, pero garantiza que el local existe (rutas que lo necesitan). */
export function useLocal(): CtxPanel & { local: Local } {
  const ctx = usePanel();
  if (!ctx.local) throw new Error("Sin local");
  return ctx as CtxPanel & { local: Local };
}

function PanelLayout() {
  const { cargando, sesion } = useSesion();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [local, setLocal] = useState<Local | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const recargarLocal = useCallback(async () => {
    try {
      setLocal(await miLocal());
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => {
    if (cargando) return;
    if (!sesion) {
      navigate({ to: "/entrar", replace: true });
      return;
    }
    recargarLocal();
  }, [cargando, sesion, navigate, recargarLocal]);

  // Sin ficha del local: el primer paso es crearla.
  useEffect(() => {
    if (local === null && pathname !== "/panel/local") navigate({ to: "/panel/local", replace: true });
  }, [local, pathname, navigate]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Aviso tipo="error">{error}</Aviso>
        <button className="btn-primario mt-4 w-full" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }
  if (cargando || !sesion || local === undefined) return <Cargando />;

  const ctx: CtxPanel = { user: sesion.user, local, setLocal, recargarLocal };

  return (
    <PanelCtx.Provider value={ctx}>
      <div className="min-h-dvh pb-24">
        <header className="sticky top-0 z-20 border-b border-linea bg-papel/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link to="/panel" className="flex min-w-0 items-center gap-2 font-bold">
              <img src="/favicon.svg" alt="" width={28} height={28} />
              <span className="truncate">{local?.nombre ?? APP_NAME}</span>
            </Link>
            <button
              className="btn-fantasma min-h-11 text-sm"
              onClick={async () => {
                await supabase().auth.signOut();
                navigate({ to: "/" });
              }}
            >
              Salir
            </button>
          </div>
        </header>

        {!sesion.user.email_confirmed_at && (
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <Aviso tipo="aviso">Confirma tu email para poder usar la IA. Te hemos enviado un enlace.</Aviso>
          </div>
        )}

        <div className="mx-auto max-w-2xl px-4 py-5">
          <Outlet />
        </div>

        {local && <NavInferior />}
      </div>
    </PanelCtx.Provider>
  );
}

function NavInferior() {
  const items = [
    { to: "/panel", texto: "Inicio", icono: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", exacto: true },
    { to: "/panel/carta", texto: "Carta", icono: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 9h6M9 13h6M9 17h3" },
    { to: "/panel/local", texto: "Local", icono: "M4 10h16l-1.5-5h-13zM5 10v10h14V10M10 20v-5h4v5" },
    { to: "/panel/publicar", texto: "QR", icono: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" },
  ] as const;

  return (
    <nav aria-label="Panel" className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map((it) => (
          <li key={it.to}>
            <Link
              to={it.to}
              activeOptions={{ exact: "exacto" in it }}
              className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-medium text-tinta-suave"
              activeProps={{ className: "!text-marca" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={it.icono} />
              </svg>
              {it.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
