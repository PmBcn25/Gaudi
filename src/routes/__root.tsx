/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { APP_NAME } from "~/lib/config";
import { ProveedorSesion } from "~/lib/sesion";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#b4532a" },
      { title: `${APP_NAME} · Tu carta digital con QR en minutos` },
      {
        name: "description",
        content: "Haz una foto a tu carta y en minutos la tienes publicada, con QR y alérgenos. Gratis para bares, cafeterías y restaurantes.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ProveedorSesion>
        <Outlet />
      </ProveedorSesion>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
