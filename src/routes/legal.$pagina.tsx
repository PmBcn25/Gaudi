import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { APP_NAME } from "~/lib/config";
import { PieLegal } from "~/components/PieLegal";

// IMPORTANTE: textos base para el lanzamiento. Completa los datos entre [corchetes] y haz que
// los revise un profesional antes de abrir el registro.
const TITULAR = "[Razón social o nombre del titular]";
const NIF = "[NIF]";
const DOMICILIO = "[Domicilio]";
const EMAIL = "[email de contacto]";

type Pagina = { titulo: string; secciones: [string, string[]][] };

const PAGINAS: Record<string, Pagina> = {
  "aviso-legal": {
    titulo: "Aviso legal",
    secciones: [
      ["Titular", [
        `En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), se informa de que este sitio web es titularidad de ${TITULAR}, con NIF ${NIF} y domicilio en ${DOMICILIO}. Contacto: ${EMAIL}.`,
      ]],
      ["Objeto", [
        `${APP_NAME} es una aplicación web que permite a locales de hostelería crear, publicar y mantener su carta digital, con enlace propio y código QR.`,
      ]],
      ["Responsabilidad sobre el contenido de las cartas", [
        "El contenido de cada carta publicada (platos, descripciones, precios, alérgenos e información del local) lo introduce y lo revisa el propio local, que es el único responsable de su veracidad y de cumplir la normativa aplicable, incluida la información sobre alérgenos (Reglamento UE 1169/2011).",
        "Las propuestas generadas con inteligencia artificial son una ayuda: el local debe revisarlas y confirmarlas antes de publicarlas.",
      ]],
      ["Propiedad intelectual", [
        `El diseño y el software de ${APP_NAME} pertenecen a su titular. Los logos, nombres y textos de cada local pertenecen a sus respectivos titulares.`,
      ]],
    ],
  },
  privacidad: {
    titulo: "Política de privacidad",
    secciones: [
      ["Responsable del tratamiento", [`${TITULAR}, NIF ${NIF}, ${DOMICILIO}. Contacto: ${EMAIL}.`]],
      ["Qué datos tratamos y para qué", [
        "Dueños y encargados de locales: email, contraseña cifrada (o identificador de Google) y los datos del local que introduces. Los usamos para darte acceso a tu cuenta y prestarte el servicio (base legal: ejecución del contrato).",
        "Archivos de importación: las fotos o el PDF de tu carta se guardan en almacenamiento privado y se usan solo para generar el borrador de tu carta.",
        "Clientes que consultan una carta: no les pedimos datos ni usamos cookies de seguimiento. Solo contamos de forma agregada el número de visitas diarias de cada carta, sin identificar a nadie.",
      ]],
      ["Inteligencia artificial", [
        "Para leer tu carta y proponer textos enviamos a nuestro proveedor de IA (Anthropic) únicamente el contenido de la carta y los textos del local. Nunca enviamos tus datos personales ni los de tus clientes.",
      ]],
      ["Dónde se guardan los datos", [
        "Los datos se alojan en servidores de la Unión Europea (Supabase, región UE). Los proveedores que intervienen actúan como encargados del tratamiento con las garantías exigidas por el RGPD.",
      ]],
      ["Conservación", [
        "Conservamos los datos mientras tengas la cuenta activa. Si la eliminas, borramos tu local, tu carta y los archivos asociados, salvo obligación legal de conservarlos.",
      ]],
      ["Tus derechos", [
        `Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${EMAIL}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`,
      ]],
      ["Cookies", [
        "Solo usamos almacenamiento técnico imprescindible para mantener la sesión del dueño en el panel. La carta pública no usa cookies.",
      ]],
    ],
  },
  condiciones: {
    titulo: "Condiciones de uso",
    secciones: [
      ["El servicio", [
        `${APP_NAME} permite a locales de hostelería en España crear y publicar su carta digital. En esta versión el servicio es gratuito, con límites de uso de la IA (3 importaciones y 30 textos al mes por local), que podemos ajustar.`,
      ]],
      ["Cuenta", [
        "Cada cuenta puede gestionar un local. Debes facilitar un email válido y verificarlo para usar las funciones de IA. Eres responsable de mantener la confidencialidad de tu acceso.",
      ]],
      ["Responsabilidad del local", [
        "El contenido de cada carta, incluidos precios y alérgenos, es responsabilidad exclusiva del local. La IA puede cometer errores: revisa siempre el borrador y las propuestas antes de publicarlas.",
        "Los precios deben mostrarse como precio final, con IVA incluido.",
      ]],
      ["Uso adecuado", [
        "No está permitido publicar contenido ilegal, engañoso, ofensivo o que infrinja derechos de terceros. Podemos desactivar una carta que incumpla estas condiciones.",
      ]],
      ["Cambios y baja", [
        "Podemos modificar estas condiciones avisando con antelación razonable. Puedes dejar de usar el servicio y solicitar la baja en cualquier momento.",
      ]],
    ],
  },
};

export const Route = createFileRoute("/legal/$pagina")({
  loader: ({ params }) => {
    const pagina = PAGINAS[params.pagina];
    if (!pagina) throw notFound();
    return pagina;
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.titulo ?? "Legal"} · ${APP_NAME}` }] }),
  component: PaginaLegal,
});

function PaginaLegal() {
  const pagina = Route.useLoaderData();
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/" className="text-base text-tinta-suave hover:underline">← {APP_NAME}</Link>
        <h1 className="mt-4 text-3xl font-bold">{pagina.titulo}</h1>
        {pagina.secciones.map(([titulo, parrafos]) => (
          <section key={titulo} className="mt-8">
            <h2 className="text-xl font-bold">{titulo}</h2>
            {parrafos.map((p, i) => (
              <p key={i} className="mt-3 text-base leading-relaxed text-tinta">{p}</p>
            ))}
          </section>
        ))}
      </main>
      <PieLegal />
    </div>
  );
}
