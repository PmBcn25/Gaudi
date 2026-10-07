import type { ReactNode } from "react";

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok" | "aviso"; children: ReactNode }) {
  const estilos = {
    info: "border-linea bg-white text-tinta",
    error: "border-red-200 bg-red-50 text-error",
    ok: "border-green-200 bg-green-50 text-ok",
    aviso: "border-amber-200 bg-aviso-fondo text-aviso",
  }[tipo];
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`rounded-xl border-2 px-4 py-3 text-base ${estilos}`}>
      {children}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-tinta-suave" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-linea border-t-marca" aria-hidden />
      {texto}
    </div>
  );
}
