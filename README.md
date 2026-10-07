# Gaudí · Carta digital con IA para hostelería

Aplicación web (v1 del PRD) con la que un bar, cafetería o restaurante convierte su carta en papel, PDF o foto
en una carta digital para el móvil, con enlace propio, código QR permanente y alérgenos.

> «Gaudí» es un nombre provisional: cámbialo con `VITE_APP_NAME`.

## Qué incluye

| PRD | Dónde |
| --- | --- |
| F1 · Importar la carta con IA (≤10 fotos o PDF ≤10 páginas, borrador revisable, dudas marcadas, sin alérgenos inventados) | `src/routes/panel.importar.*`, `supabase/functions/import-menu` |
| F2 · Editor móvil (categorías, platos, varios precios con etiqueta, 14 alérgenos en 3 estados, agotado, reordenar) | `src/routes/panel.carta.tsx`, `panel.plato.$id.tsx` |
| F3 · Carta pública con enlace legible + enlace corto `/q/<código>` para el QR, Open Graph por local, QR en PNG/PDF, pie de captación, sin cookies | `src/routes/$slug.tsx`, `q.$codigo.tsx`, `panel.publicar.tsx` |
| F4 · Textos con IA (presentación y descripciones), aceptar / editar / descartar | `supabase/functions/ai-text`, `components/PropuestaIA.tsx` |
| Límites del plan gratuito (3 importaciones y 30 textos al mes, email verificado) | `supabase/functions/_shared/limites.ts`, `mi_cuota_ia()` |
| RLS, almacenamiento privado, desactivación por el administrador, visitas por día | `supabase/migrations/20261007000000_init.sql` |
| Aviso legal, privacidad y condiciones (plantillas a completar) | `src/routes/legal.$pagina.tsx` |

## Pila

- **Frontend**: TanStack Start (React 19, SSR) + Tailwind CSS 4, la misma pila con la que Lovable crea los proyectos.
  Se puede conectar este repositorio a Lovable vía GitHub.
- **Backend**: Supabase propio (Auth, Postgres, Storage, Edge Functions), región UE, plan Pro.
- **IA**: API de Anthropic, solo desde Edge Functions; la clave es un secreto de Supabase.
  - Importación: `claude-sonnet-5-5` con salida estructurada (JSON validado con Zod). Lleva activado
    `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si el modelo rechaza una petición, el servidor la
    reintenta automáticamente con otro modelo. El modelo que responde de verdad queda registrado en `uso_ia`.
  - Textos: `claude-haiku-4-5-20251001`.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en la región UE.
2. Aplica la migración: `supabase link --project-ref <ref>` y `supabase db push`
   (o pega `supabase/migrations/20261007000000_init.sql` en el SQL Editor).
3. **Authentication → Providers**: activa Email (con *Confirm email*) y Google.
4. **Authentication → URL Configuration**: *Site URL* = tu dominio; añade `https://tu-dominio/auth/callback` y
   `https://tu-dominio/auth/nueva-clave` a *Redirect URLs*.
5. Edge Functions:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy import-menu
   supabase functions deploy ai-text
   ```

### 2. Frontend

```bash
cp .env.example .env   # URL y anon key de Supabase, dominio y nombre comercial
npm install
npm run dev            # http://localhost:3000
npm run build
```

## Operación

- **Desactivar una carta** (contenido inapropiado): en el Table Editor de Supabase, pon `locales.estado = 'desactivada'`.
  El dueño no puede revertirlo; la carta y el QR dejan de responder.
- **Coste de IA**: tabla `uso_ia` (tokens por llamada y por local). Las importaciones, en `importaciones` (estado, modelo, tokens).
- **Visitas**: tabla `visitas` (local, día y número de visitas), sin datos del visitante.
- **Ajustar límites**: `LIMITES` en `supabase/functions/_shared/limites.ts` y `limites_plan()` en SQL.

## Flujo de importación

1. El cliente crea la fila en `importaciones` y sube las fotos (reducidas en el móvil a JPEG de 2000 px) o el PDF a
   `importaciones/<local>/<importación>/`, un bucket privado.
2. `import-menu` comprueba la sesión, el email verificado, la propiedad y la cuota, responde 202 y procesa en segundo plano.
3. Claude devuelve un JSON fijo (categorías → platos → precios con etiqueta, más marcas de duda). Se valida, se pasan
   los precios a céntimos y se guarda como borrador. Los alérgenos quedan siempre como «pendiente».
4. El dueño revisa, corrige lo marcado y confirma; `confirmar_importacion()` lo crea todo en una transacción.

## Pendiente antes del lanzamiento

- Completar los datos del titular en las páginas legales y revisarlas con un profesional.
- Elegir nombre comercial y dominio.
