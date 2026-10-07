import { Link } from "@tanstack/react-router";
import { APP_NAME } from "~/lib/config";

export function PieLegal() {
  return (
    <footer className="border-t border-linea">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-tinta-suave sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {APP_NAME}. Datos alojados en la UE.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Información legal">
          <Link to="/legal/$pagina" params={{ pagina: "aviso-legal" }} className="hover:underline">Aviso legal</Link>
          <Link to="/legal/$pagina" params={{ pagina: "privacidad" }} className="hover:underline">Privacidad</Link>
          <Link to="/legal/$pagina" params={{ pagina: "condiciones" }} className="hover:underline">Condiciones de uso</Link>
        </nav>
      </div>
    </footer>
  );
}
