import { leerEuros } from "~/lib/format";

export type PrecioEditable = { etiqueta: string; importe: string; dudoso?: boolean; original?: string };

const SUGERENCIAS = [
  ["Tapa", "Media", "Ración"],
  ["Copa", "Botella"],
  ["Pequeña", "Mediana", "Grande"],
];

export function preciosValidos(precios: PrecioEditable[]): boolean {
  return precios.length > 0 && precios.every((p) => leerEuros(p.importe) !== null);
}

export function EditorPrecios({ precios, onChange }: { precios: PrecioEditable[]; onChange: (p: PrecioEditable[]) => void }) {
  const varios = precios.length > 1;
  const actualizar = (i: number, cambios: Partial<PrecioEditable>) =>
    onChange(precios.map((p, j) => (j === i ? { ...p, ...cambios, dudoso: false } : p)));

  return (
    <fieldset>
      <legend className="etiqueta">Precio{varios ? "s" : ""} (IVA incluido)</legend>
      <div className="space-y-2">
        {precios.map((p, i) => {
          const invalido = p.importe.trim() !== "" && leerEuros(p.importe) === null;
          return (
            <div key={i}>
              <div className="flex items-center gap-2">
                {varios && (
                  <input
                    className="campo flex-1"
                    placeholder="Etiqueta (ej. Ración)"
                    aria-label={`Etiqueta del precio ${i + 1}`}
                    value={p.etiqueta}
                    maxLength={40}
                    onChange={(e) => actualizar(i, { etiqueta: e.target.value })}
                  />
                )}
                <div className={`relative ${varios ? "w-32" : "flex-1"}`}>
                  <input
                    className={`campo pr-9 text-right tabular-nums ${invalido ? "border-error" : ""} ${p.dudoso ? "border-amber-500 bg-aviso-fondo" : ""}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label={`Importe del precio ${i + 1} en euros`}
                    aria-invalid={invalido}
                    value={p.importe}
                    onChange={(e) => actualizar(i, { importe: e.target.value })}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-tinta-suave">€</span>
                </div>
                {varios && (
                  <button
                    type="button"
                    className="btn-fantasma min-w-12 px-0"
                    aria-label={`Quitar precio ${i + 1}`}
                    onClick={() => onChange(precios.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
              {p.dudoso && p.original && <p className="ayuda text-aviso">En la carta pone: «{p.original}». Compruébalo.</p>}
              {invalido && <p className="mt-1 text-sm text-error">Escribe un importe como 12,50</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-fantasma min-h-11 text-base" onClick={() => onChange([...precios, { etiqueta: "", importe: "" }])}>
          + Añadir otro precio
        </button>
        {precios.length <= 1 &&
          SUGERENCIAS.map((grupo) => (
            <button
              key={grupo.join()}
              type="button"
              className="min-h-11 rounded-full border-2 border-linea px-3 text-sm font-medium text-tinta-suave"
              onClick={() =>
                onChange(grupo.map((etiqueta, i) => ({ etiqueta, importe: i === 0 ? precios[0]?.importe ?? "" : "" })))
              }
            >
              {grupo.join(" / ")}
            </button>
          ))}
      </div>
    </fieldset>
  );
}
