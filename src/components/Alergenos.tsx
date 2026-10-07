import { ALERGENOS, ALERGENO_POR_ID, type AlergenoId } from "~/lib/alergenos";
import type { EstadoAlergenos } from "~/lib/types";

export function IconoAlergeno({ id, tam = 28 }: { id: AlergenoId; tam?: number }) {
  const a = ALERGENO_POR_ID[id];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ background: a.color, width: tam, height: tam, fontSize: tam * 0.4 }}
    >
      {a.corto}
    </span>
  );
}

/** Lista de alérgenos tal como la ve el cliente. */
export function AlergenosPlato({ estado, alergenos }: { estado: EstadoAlergenos; alergenos: AlergenoId[] }) {
  if (estado === "pendiente") {
    return <p className="mt-2 text-base font-medium text-aviso">Consulta los alérgenos al personal</p>;
  }
  if (estado === "ninguno") {
    return <p className="mt-2 text-base text-tinta-suave">Sin alérgenos de declaración obligatoria</p>;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Alérgenos">
      {alergenos.map((id) => (
        <li key={id} className="inline-flex items-center gap-1.5 text-base text-tinta">
          <IconoAlergeno id={id} tam={24} />
          {ALERGENO_POR_ID[id]?.nombre ?? id}
        </li>
      ))}
    </ul>
  );
}

/** Selector de alérgenos para el dueño: tres estados y casillas grandes con icono. */
export function SelectorAlergenos({
  estado,
  alergenos,
  onChange,
}: {
  estado: EstadoAlergenos;
  alergenos: AlergenoId[];
  onChange: (estado: EstadoAlergenos, alergenos: AlergenoId[]) => void;
}) {
  const opciones: { valor: EstadoAlergenos; texto: string }[] = [
    { valor: "contiene", texto: "Contiene" },
    { valor: "ninguno", texto: "Ninguno" },
    { valor: "pendiente", texto: "Pendiente" },
  ];

  return (
    <fieldset>
      <legend className="etiqueta">Alérgenos</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={estado === o.valor}
            onClick={() => onChange(o.valor, o.valor === "contiene" ? alergenos : [])}
            className={`min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${
              estado === o.valor ? "border-marca bg-marca-clara text-marca-osc" : "border-linea bg-white text-tinta"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
      {estado === "pendiente" && (
        <p className="ayuda">En la carta aparecerá «Consulta los alérgenos al personal».</p>
      )}
      {estado === "ninguno" && (
        <p className="ayuda">Confirmas que este plato no contiene ninguno de los 14 alérgenos obligatorios.</p>
      )}
      {estado === "contiene" && (
        <>
          <p className="ayuda mb-2">Marca todos los que contiene.</p>
          <div className="grid grid-cols-2 gap-2">
            {ALERGENOS.map((a) => {
              const marcado = alergenos.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 ${
                    marcado ? "border-marca bg-marca-clara" : "border-linea bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-marca)]"
                    checked={marcado}
                    onChange={() =>
                      onChange(
                        "contiene",
                        marcado ? alergenos.filter((x) => x !== a.id) : ALERGENOS.map((x) => x.id).filter((x) => x === a.id || alergenos.includes(x)),
                      )
                    }
                  />
                  <IconoAlergeno id={a.id} tam={26} />
                  <span className="text-base leading-tight">{a.nombre}</span>
                </label>
              );
            })}
          </div>
          {alergenos.length === 0 && <p className="mt-2 text-sm font-medium text-error">Marca al menos uno o elige «Ninguno».</p>}
        </>
      )}
    </fieldset>
  );
}
