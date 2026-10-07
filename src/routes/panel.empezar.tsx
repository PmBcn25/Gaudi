import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/panel/empezar")({
  component: Empezar,
});

function Empezar() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">¿Cómo quieres empezar?</h1>
        <p className="mt-1 text-base text-tinta-suave">Paso 2 de 3. Después revisas todo antes de publicar.</p>
      </div>

      <Link to="/panel/importar" className="tarjeta block border-2 border-marca hover:bg-marca-clara">
        <p className="text-sm font-bold uppercase tracking-wide text-marca">Recomendado · 2 minutos</p>
        <h2 className="mt-1 text-xl font-bold">📷 Importar mi carta</h2>
        <p className="mt-1 text-base text-tinta-suave">
          Haz fotos a tu carta (hasta 10) o sube el PDF. La IA la pasa a limpio y tú la revisas.
        </p>
      </Link>

      <Link to="/panel/carta" className="tarjeta block hover:border-tinta-suave">
        <h2 className="text-xl font-bold">✏️ Empezar desde cero</h2>
        <p className="mt-1 text-base text-tinta-suave">Si no tienes carta, crea las categorías y los platos tú mismo.</p>
      </Link>
    </div>
  );
}
