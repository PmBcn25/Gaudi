import { useState } from "react";

/**
 * Propuesta de texto de la IA. El dueño decide: aceptar, editar o descartar.
 * Nada cambia hasta que confirma.
 */
export function PropuestaIA({
  propuesta,
  onAceptar,
  onDescartar,
  maxLength,
}: {
  propuesta: string;
  onAceptar: (texto: string) => void;
  onDescartar: () => void;
  maxLength: number;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(propuesta);

  return (
    <div className="mt-3 rounded-2xl border-2 border-dashed border-marca bg-marca-clara p-4" role="region" aria-label="Propuesta de la IA">
      <p className="text-sm font-semibold uppercase tracking-wide text-marca-osc">Propuesta de la IA</p>
      {editando ? (
        <textarea
          className="campo mt-2 min-h-28"
          value={texto}
          maxLength={maxLength}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
      ) : (
        <p className="mt-2 text-base leading-relaxed">{texto}</p>
      )}
      <p className="ayuda">Revisa que no diga nada que no sea cierto de tu local.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" className="btn-primario px-2" onClick={() => onAceptar(texto.trim())} disabled={!texto.trim()}>
          {editando ? "Usar" : "Aceptar"}
        </button>
        <button type="button" className="btn-secundario px-2" onClick={() => setEditando((v) => !v)}>
          {editando ? "Vista" : "Editar"}
        </button>
        <button type="button" className="btn-secundario px-2" onClick={onDescartar}>
          Descartar
        </button>
      </div>
    </div>
  );
}
