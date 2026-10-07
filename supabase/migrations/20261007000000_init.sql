-- Carta digital con IA · esquema inicial (v1)
-- Ejecutar en un proyecto Supabase propio (región UE). Todas las tablas con RLS.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.estado_local as enum ('borrador', 'publicada', 'desactivada');
create type public.estado_alergenos as enum ('contiene', 'ninguno', 'pendiente');
create type public.estado_importacion as enum ('subiendo', 'procesando', 'listo', 'error', 'confirmado');
create type public.tipo_uso_ia as enum ('importacion', 'texto');

-- Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011).
create or replace function public.alergenos_validos()
returns text[] language sql immutable as $$
  select array[
    'gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'lacteos',
    'frutos_de_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
  ]::text[]
$$;

-- Código corto del QR: 8 caracteres sin ambigüedades (sin 0/o, 1/l/i).
create or replace function public.generar_codigo_qr()
returns text language plpgsql volatile as $$
declare
  alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  codigo text;
begin
  loop
    codigo := '';
    for i in 1..8 loop
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.locales where qr_code = codigo);
  end loop;
  return codigo;
end;
$$;

-- Rutas de la app que no pueden usarse como enlace de un local.
create or replace function public.slugs_reservados()
returns text[] language sql immutable as $$
  select array[
    'panel', 'entrar', 'registro', 'auth', 'q', 'legal', 'api', 'admin', 'app',
    'carta', 'cartas', 'ayuda', 'precios', 'blog', 'static', 'assets', 'favicon'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.locales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade, -- 1 local por cuenta
  nombre text not null check (char_length(nombre) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$'),
  qr_code text not null unique,
  tipo_cocina text check (char_length(tipo_cocina) <= 80),
  direccion text check (char_length(direccion) <= 200),
  telefono text check (char_length(telefono) <= 30),
  email_contacto text check (char_length(email_contacto) <= 120),
  web text check (char_length(web) <= 200),
  instagram text check (char_length(instagram) <= 60),
  horario text check (char_length(horario) <= 300),
  logo_path text,
  color text not null default '#b4532a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  presentacion text check (char_length(presentacion) <= 600),
  estado public.estado_local not null default 'borrador',
  publicada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index categorias_local_idx on public.categorias (local_id, orden);

create table public.platos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade, -- se rellena por trigger
  nombre text not null check (char_length(nombre) between 1 and 120),
  descripcion text check (char_length(descripcion) <= 400),
  orden int not null default 0,
  agotado boolean not null default false,
  alergenos_estado public.estado_alergenos not null default 'pendiente',
  alergenos text[] not null default '{}',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint alergenos_validos check (alergenos <@ public.alergenos_validos()),
  constraint alergenos_coherentes check (
    (alergenos_estado = 'contiene' and cardinality(alergenos) > 0)
    or (alergenos_estado <> 'contiene' and cardinality(alergenos) = 0)
  )
);
create index platos_categoria_idx on public.platos (categoria_id, orden);
create index platos_local_idx on public.platos (local_id);

create table public.precios (
  id uuid primary key default gen_random_uuid(),
  plato_id uuid not null references public.platos (id) on delete cascade,
  local_id uuid not null references public.locales (id) on delete cascade, -- se rellena por trigger
  etiqueta text check (char_length(etiqueta) <= 40),
  importe_centimos int not null check (importe_centimos between 0 and 10000000),
  orden int not null default 0
);
create index precios_plato_idx on public.precios (plato_id, orden);

create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locales (id) on delete cascade,
  tipo text not null check (tipo in ('fotos', 'pdf')),
  archivos text[] not null default '{}',
  estado public.estado_importacion not null default 'subiendo',
  resultado jsonb,
  error text,
  modelo text,
  tokens_entrada int,
  tokens_salida int,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint archivos_limite check (cardinality(archivos) <= 10)
);
create index importaciones_local_idx on public.importaciones (local_id, creado_en desc);

-- Consumo de IA por llamada y por local (control de coste y de límites).
create table public.uso_ia (
  id bigint generated always as identity primary key,
  local_id uuid not null references public.locales (id) on delete cascade,
  tipo public.tipo_uso_ia not null,
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  creado_en timestamptz not null default now()
);
create index uso_ia_local_idx on public.uso_ia (local_id, tipo, creado_en);

-- Visitas agregadas por día (uso interno, sin datos del visitante).
create table public.visitas (
  local_id uuid not null references public.locales (id) on delete cascade,
  dia date not null,
  visitas int not null default 0,
  primary key (local_id, dia)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger locales_actualizado before update on public.locales
  for each row execute function public.tocar_actualizado();
create trigger platos_actualizado before update on public.platos
  for each row execute function public.tocar_actualizado();
create trigger importaciones_actualizado before update on public.importaciones
  for each row execute function public.tocar_actualizado();

-- Reglas de negocio de locales: QR inmutable, slug no reservado y
-- estado «desactivada» reservado al administrador.
create or replace function public.validar_local()
returns trigger language plpgsql as $$
declare
  es_usuario boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.qr_code := public.generar_codigo_qr();
    if es_usuario then
      new.owner_id := auth.uid();
      new.estado := 'borrador';
    end if;
  else
    if new.qr_code is distinct from old.qr_code then
      raise exception 'El código del QR no se puede cambiar';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'El propietario no se puede cambiar';
    end if;
    if es_usuario and (old.estado = 'desactivada' or new.estado = 'desactivada')
       and new.estado is distinct from old.estado then
      raise exception 'Esta carta está desactivada. Contacta con soporte.';
    end if;
  end if;

  if new.slug = any (public.slugs_reservados()) then
    raise exception 'El enlace «%» no está disponible', new.slug;
  end if;

  if new.estado = 'publicada' and (tg_op = 'INSERT' or old.estado <> 'publicada') then
    new.publicada_en := now();
  end if;
  return new;
end;
$$;

create trigger locales_validar before insert or update on public.locales
  for each row execute function public.validar_local();

-- local_id desnormalizado en platos y precios para que las políticas RLS sean simples.
create or replace function public.platos_set_local()
returns trigger language plpgsql as $$
begin
  select local_id into new.local_id from public.categorias where id = new.categoria_id;
  if new.local_id is null then
    raise exception 'Categoría no encontrada';
  end if;
  return new;
end;
$$;
create trigger platos_local before insert or update of categoria_id on public.platos
  for each row execute function public.platos_set_local();

create or replace function public.precios_set_local()
returns trigger language plpgsql as $$
begin
  select local_id into new.local_id from public.platos where id = new.plato_id;
  if new.local_id is null then
    raise exception 'Plato no encontrado';
  end if;
  return new;
end;
$$;
create trigger precios_local before insert or update of plato_id on public.precios
  for each row execute function public.precios_set_local();

-- ---------------------------------------------------------------------------
-- Seguridad a nivel de fila
-- ---------------------------------------------------------------------------
create or replace function public.es_mi_local(p_local_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locales where id = p_local_id and owner_id = auth.uid())
$$;

alter table public.locales enable row level security;
alter table public.categorias enable row level security;
alter table public.platos enable row level security;
alter table public.precios enable row level security;
alter table public.importaciones enable row level security;
alter table public.uso_ia enable row level security;
alter table public.visitas enable row level security;

create policy "locales: el dueño lee" on public.locales for select to authenticated
  using (owner_id = auth.uid());
create policy "locales: el dueño crea" on public.locales for insert to authenticated
  with check (owner_id = auth.uid());
create policy "locales: el dueño edita" on public.locales for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "locales: el dueño borra" on public.locales for delete to authenticated
  using (owner_id = auth.uid());

create policy "categorias: el dueño gestiona" on public.categorias for all to authenticated
  using (public.es_mi_local(local_id)) with check (public.es_mi_local(local_id));
create policy "platos: el dueño gestiona" on public.platos for all to authenticated
  using (public.es_mi_local(local_id)) with check (public.es_mi_local(local_id));
create policy "precios: el dueño gestiona" on public.precios for all to authenticated
  using (public.es_mi_local(local_id)) with check (public.es_mi_local(local_id));

-- Importaciones: el dueño las crea y las consulta; el resultado lo escribe la Edge Function.
create policy "importaciones: el dueño lee" on public.importaciones for select to authenticated
  using (public.es_mi_local(local_id));
create policy "importaciones: el dueño crea" on public.importaciones for insert to authenticated
  with check (public.es_mi_local(local_id) and estado = 'subiendo' and resultado is null);

create policy "uso_ia: el dueño lee" on public.uso_ia for select to authenticated
  using (public.es_mi_local(local_id));
-- visitas: sin políticas, solo accesible desde funciones security definer y el panel de Supabase.

-- La lectura pública NO va contra las tablas: pasa por get_carta_publica(), que solo
-- devuelve cartas publicadas.

-- ---------------------------------------------------------------------------
-- Funciones RPC
-- ---------------------------------------------------------------------------

-- Carta pública completa en una sola llamada (rápida en 4G). Opcionalmente cuenta la visita.
create or replace function public.get_carta_publica(p_slug text, p_contar_visita boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l public.locales;
  carta jsonb;
begin
  select * into l from public.locales where slug = lower(p_slug) and estado = 'publicada';
  if not found then
    return null;
  end if;

  if p_contar_visita then
    insert into public.visitas (local_id, dia, visitas)
    values (l.id, (now() at time zone 'Europe/Madrid')::date, 1)
    on conflict (local_id, dia) do update set visitas = public.visitas.visitas + 1;
  end if;

  select jsonb_build_object(
    'local', jsonb_build_object(
      'nombre', l.nombre, 'slug', l.slug, 'qr_code', l.qr_code, 'tipo_cocina', l.tipo_cocina,
      'direccion', l.direccion, 'telefono', l.telefono, 'email_contacto', l.email_contacto,
      'web', l.web, 'instagram', l.instagram, 'horario', l.horario, 'logo_path', l.logo_path,
      'color', l.color, 'presentacion', l.presentacion, 'actualizado_en', l.actualizado_en
    ),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'nombre', c.nombre,
        'platos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion, 'agotado', p.agotado,
            'alergenos_estado', p.alergenos_estado, 'alergenos', p.alergenos,
            'precios', coalesce((
              select jsonb_agg(jsonb_build_object('etiqueta', pr.etiqueta, 'importe_centimos', pr.importe_centimos)
                               order by pr.orden, pr.id)
              from public.precios pr where pr.plato_id = p.id
            ), '[]'::jsonb)
          ) order by p.orden, p.creado_en)
          from public.platos p where p.categoria_id = c.id
        ), '[]'::jsonb)
      ) order by c.orden, c.creado_en)
      from public.categorias c where c.local_id = l.id
    ), '[]'::jsonb)
  ) into carta;

  return carta;
end;
$$;

-- Enlace corto permanente /q/<código> → slug actual del local.
create or replace function public.resolver_qr(p_codigo text)
returns text language sql stable security definer set search_path = public as $$
  select slug from public.locales where qr_code = lower(p_codigo) and estado <> 'desactivada'
$$;

-- ¿Está libre este enlace? (para el formulario de alta)
create or replace function public.slug_disponible(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not (lower(p_slug) = any (public.slugs_reservados()))
     and not exists (
       select 1 from public.locales
       where slug = lower(p_slug) and owner_id is distinct from auth.uid()
     )
$$;

-- Límites del plan gratuito (valores iniciales, ajustables).
create or replace function public.limites_plan()
returns jsonb language sql immutable as $$
  select jsonb_build_object('importaciones_mes', 3, 'textos_mes', 30)
$$;

create or replace function public.mi_cuota_ia()
returns jsonb language sql stable security definer set search_path = public as $$
  with l as (select id from public.locales where owner_id = auth.uid())
  select jsonb_build_object(
    'importaciones_usadas', (select count(*) from public.uso_ia u, l
      where u.local_id = l.id and u.tipo = 'importacion'
        and u.creado_en >= date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'),
    'textos_usados', (select count(*) from public.uso_ia u, l
      where u.local_id = l.id and u.tipo = 'texto'
        and u.creado_en >= date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'),
    'limites', public.limites_plan()
  )
$$;

-- Confirma un borrador de importación: crea categorías, platos y precios en una transacción.
-- El borrador llega ya revisado por el dueño desde el cliente.
create or replace function public.confirmar_importacion(p_importacion_id uuid, p_borrador jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  imp public.importaciones;
  cat jsonb;
  pla jsonb;
  pre jsonb;
  v_cat_id uuid;
  v_plato_id uuid;
  orden_base int;
  i int := 0;
  j int;
  k int;
  v_alergenos text[];
  v_estado public.estado_alergenos;
begin
  select * into imp from public.importaciones where id = p_importacion_id for update;
  if not found or not public.es_mi_local(imp.local_id) then
    raise exception 'Importación no encontrada';
  end if;
  if imp.estado <> 'listo' then
    raise exception 'Esta importación no está lista para confirmar';
  end if;
  if jsonb_typeof(p_borrador -> 'categorias') <> 'array' then
    raise exception 'Borrador no válido';
  end if;

  select coalesce(max(orden) + 1, 0) into orden_base from public.categorias where local_id = imp.local_id;

  for cat in select * from jsonb_array_elements(p_borrador -> 'categorias') loop
    insert into public.categorias (local_id, nombre, orden)
    values (imp.local_id, left(trim(cat ->> 'nombre'), 80), orden_base + i)
    returning id into v_cat_id;
    i := i + 1;
    j := 0;
    for pla in select * from jsonb_array_elements(coalesce(cat -> 'platos', '[]'::jsonb)) loop
      v_estado := coalesce((pla ->> 'alergenos_estado')::public.estado_alergenos, 'pendiente');
      v_alergenos := case when v_estado = 'contiene'
        then array(select jsonb_array_elements_text(coalesce(pla -> 'alergenos', '[]'::jsonb)))
        else '{}'::text[] end;
      insert into public.platos (categoria_id, local_id, nombre, descripcion, orden, alergenos_estado, alergenos)
      values (v_cat_id, imp.local_id, left(trim(pla ->> 'nombre'), 120),
              nullif(left(trim(coalesce(pla ->> 'descripcion', '')), 400), ''), j, v_estado, v_alergenos)
      returning id into v_plato_id;
      j := j + 1;
      k := 0;
      for pre in select * from jsonb_array_elements(coalesce(pla -> 'precios', '[]'::jsonb)) loop
        if pre ->> 'importe_centimos' is not null then
          insert into public.precios (plato_id, local_id, etiqueta, importe_centimos, orden)
          values (v_plato_id, imp.local_id, nullif(left(trim(coalesce(pre ->> 'etiqueta', '')), 40), ''),
                  (pre ->> 'importe_centimos')::int, k);
          k := k + 1;
        end if;
      end loop;
    end loop;
  end loop;

  update public.importaciones set estado = 'confirmado' where id = imp.id;
end;
$$;

-- Guarda un plato con sus precios en una sola transacción (con los permisos del dueño: aplica RLS).
create or replace function public.guardar_plato(p_id uuid, p_datos jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_id;
  v_estado public.estado_alergenos := (p_datos ->> 'alergenos_estado')::public.estado_alergenos;
  v_alergenos text[] := case when (p_datos ->> 'alergenos_estado') = 'contiene'
    then array(select jsonb_array_elements_text(coalesce(p_datos -> 'alergenos', '[]'::jsonb)))
    else '{}'::text[] end;
  pre jsonb;
  k int := 0;
begin
  if v_id is null then
    insert into public.platos (categoria_id, local_id, nombre, descripcion, agotado, alergenos_estado, alergenos, orden)
    values (
      (p_datos ->> 'categoria_id')::uuid,
      (select local_id from public.categorias where id = (p_datos ->> 'categoria_id')::uuid),
      trim(p_datos ->> 'nombre'),
      nullif(trim(coalesce(p_datos ->> 'descripcion', '')), ''),
      coalesce((p_datos ->> 'agotado')::boolean, false),
      v_estado, v_alergenos,
      coalesce((select max(orden) + 1 from public.platos where categoria_id = (p_datos ->> 'categoria_id')::uuid), 0)
    )
    returning id into v_id;
  else
    update public.platos set
      categoria_id = (p_datos ->> 'categoria_id')::uuid,
      nombre = trim(p_datos ->> 'nombre'),
      descripcion = nullif(trim(coalesce(p_datos ->> 'descripcion', '')), ''),
      agotado = coalesce((p_datos ->> 'agotado')::boolean, false),
      alergenos_estado = v_estado,
      alergenos = v_alergenos
    where id = v_id;
    if not found then
      raise exception 'Plato no encontrado';
    end if;
    delete from public.precios where plato_id = v_id;
  end if;

  for pre in select * from jsonb_array_elements(coalesce(p_datos -> 'precios', '[]'::jsonb)) loop
    insert into public.precios (plato_id, local_id, etiqueta, importe_centimos, orden)
    values (v_id, (select local_id from public.platos where id = v_id),
            nullif(trim(coalesce(pre ->> 'etiqueta', '')), ''), (pre ->> 'importe_centimos')::int, k);
    k := k + 1;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.confirmar_importacion(uuid, jsonb) from public, anon;
revoke all on function public.mi_cuota_ia() from public, anon;
revoke all on function public.guardar_plato(uuid, jsonb) from public, anon;
grant execute on function public.confirmar_importacion(uuid, jsonb) to authenticated;
grant execute on function public.mi_cuota_ia() to authenticated;
grant execute on function public.guardar_plato(uuid, jsonb) to authenticated;
grant execute on function public.get_carta_publica(text, boolean) to anon, authenticated;
grant execute on function public.resolver_qr(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Almacenamiento
-- ---------------------------------------------------------------------------
-- logos: público (se muestra en la carta y en la vista previa de WhatsApp).
-- importaciones: privado (fotos y PDF de la carta original).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('importaciones', 'importaciones', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Ruta de los objetos: <local_id>/<archivo>
create policy "logos: el dueño sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.es_mi_local(((storage.foldername(name))[1])::uuid));
create policy "logos: el dueño reemplaza" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.es_mi_local(((storage.foldername(name))[1])::uuid));
create policy "logos: el dueño borra" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.es_mi_local(((storage.foldername(name))[1])::uuid));

create policy "importaciones: el dueño sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'importaciones' and public.es_mi_local(((storage.foldername(name))[1])::uuid));
create policy "importaciones: el dueño lee" on storage.objects for select to authenticated
  using (bucket_id = 'importaciones' and public.es_mi_local(((storage.foldername(name))[1])::uuid));
