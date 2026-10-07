import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type EstadoSesion = { cargando: boolean; sesion: Session | null };

const Ctx = createContext<EstadoSesion>({ cargando: true, sesion: null });

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ cargando: true, sesion: null });

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setEstado({ cargando: false, sesion: data.session }));
    const { data } = sb.auth.onAuthStateChange((_evento, sesion) => setEstado({ cargando: false, sesion }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={estado}>{children}</Ctx.Provider>;
}

export function useSesion() {
  return useContext(Ctx);
}
