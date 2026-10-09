-- ============================================================================
-- Dunno Clothing · Sistema de ventas e inventario
-- Esquema de base de datos para Supabase (PostgreSQL).
--
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar TODO este archivo > Run.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Perfiles de usuario (dueño / vendedor)
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  nombre    text,
  rol       text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  sucursal  text check (sucursal in ('tarija', 'cochabamba', 'santacruz')),
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- ¿El usuario actual es dueño (admin) activo?
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- Sucursal asignada al usuario actual (null si no tiene o está inactivo)
create or replace function public.mi_sucursal()
returns text
language sql stable security definer
set search_path = public
as $$
  select sucursal from public.perfiles where id = auth.uid() and activo;
$$;

-- Cuando alguien se registra en Supabase Auth se crea su perfil.
-- La PRIMERA persona que se registra queda como dueño (admin).
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.perfiles where rol = 'admin')
         then 'vendedor' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Políticas de perfiles
drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- 2. Documentos (productos, drops, movimientos de stock, ventas, historial)
--    Una sola tabla flexible: coleccion + id + data (JSON).
--      products  → modelos (marca, categoría, precio, fotos…)
--      drops     → lanzamientos
--      entries   → ingresos / transferencias / ajustes de stock
--      sales     → ventas (solo se crean con registrar_venta)
--      hist      → historial de ventas importado (no mueve stock)
-- ---------------------------------------------------------------------------
create table if not exists public.docs (
  coleccion   text not null,
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (coleccion, id)
);

create index if not exists docs_coleccion_idx on public.docs (coleccion, actualizado desc);

alter table public.docs enable row level security;

-- Lectura:
--   * dueño: todo
--   * vendedores: productos y drops (para vender) y SOLO sus propias ventas
drop policy if exists docs_leer on public.docs;
create policy docs_leer on public.docs
  for select to authenticated
  using (
    public.es_admin()
    or (coleccion in ('products', 'drops') and public.mi_sucursal() is not null)
    or (coleccion = 'sales' and data ->> 'by' = auth.uid()::text)
  );

-- Escritura directa: solo el dueño. Las ventas de los vendedores pasan por
-- registrar_venta(), que valida stock, precio y sucursal.
drop policy if exists docs_crear on public.docs;
create policy docs_crear on public.docs
  for insert to authenticated with check (public.es_admin());

drop policy if exists docs_editar on public.docs;
create policy docs_editar on public.docs
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists docs_borrar on public.docs;
create policy docs_borrar on public.docs
  for delete to authenticated using (public.es_admin());

create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists docs_actualizado on public.docs;
create trigger docs_actualizado
  before update on public.docs
  for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------------------------
-- 3. Stock
--    stock = ingresos + transferencias recibidas + ajustes
--            − transferencias enviadas − ventas no anuladas
-- ---------------------------------------------------------------------------

-- Cálculo interno (nadie puede llamarlo directamente desde la web).
-- Descuenta también los pedidos de la tienda online que están reservando
-- prendas: todos menos los cancelados y los pendientes de pago que ya
-- vencieron (por defecto a las 12 horas, configurable en la tienda).
create or replace function public._stock(p_sucursal text default null)
returns table (b text, p text, t text, c text, q integer)
language sql stable security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select (d.data ->> 'hold_horas')::numeric
                       from public.docs d
                      where d.coleccion = 'settings' and d.id = 'tienda'), 12) as hold
  ),
  mov as (
    select e.data ->> 'sucursal' as b, l ->> 'p' as p, l ->> 't' as t, l ->> 'c' as c,
           (l ->> 'q')::int as q
      from public.docs e, jsonb_array_elements(e.data -> 'lines') l
     where e.coleccion = 'entries'
    union all
    select e.data ->> 'origen', l ->> 'p', l ->> 't', l ->> 'c', -(l ->> 'q')::int
      from public.docs e, jsonb_array_elements(e.data -> 'lines') l
     where e.coleccion = 'entries' and e.data ->> 'tipo' = 'transferencia'
    union all
    select s.data ->> 'sucursal', i ->> 'p', i ->> 't', i ->> 'c', -(i ->> 'q')::int
      from public.docs s, jsonb_array_elements(s.data -> 'items') i
     where s.coleccion = 'sales'
       and coalesce((s.data ->> 'anulada')::boolean, false) = false
       and coalesce((s.data ->> 'online')::boolean, false) = false
    union all
    select o.data ->> 'sucursal', i ->> 'p', i ->> 't', i ->> 'c', -(i ->> 'q')::int
      from public.docs o cross join cfg, jsonb_array_elements(o.data -> 'items') i
     where o.coleccion = 'orders'
       and o.data ->> 'estado' <> 'cancelado'
       and not (o.data ->> 'estado' = 'pendiente'
                and (o.data ->> 'ts')::bigint < (extract(epoch from now()) * 1000 - cfg.hold * 3600000))
  )
  select mov.b, mov.p, mov.t, mov.c, sum(mov.q)::int
    from mov
   where mov.b is not null and (p_sucursal is null or mov.b = p_sucursal)
   group by mov.b, mov.p, mov.t, mov.c;
$$;

revoke all on function public._stock(text) from public, anon, authenticated;

-- Stock para la aplicación: el dueño ve todo, el vendedor solo su sucursal.
create or replace function public.stock_actual(p_sucursal text default null)
returns table (b text, p text, t text, c text, q integer)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if public.es_admin() then
    return query select * from public._stock(p_sucursal);
  elsif public.mi_sucursal() is not null then
    return query select * from public._stock(public.mi_sucursal());
  else
    raise exception 'Tu usuario no tiene sucursal asignada';
  end if;
end;
$$;

revoke all on function public.stock_actual(text) from public, anon;
grant execute on function public.stock_actual(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Registrar una venta (valida stock, precio y sucursal; evita vender de más)
--    p_items: [{"p":"id-producto","t":"M","c":"Negro","q":1}, ...]
--    p_pago : {"ef":0,"qr":0,"tj":0,"gc":0}  (debe sumar el total)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_sucursal text,
  p_items    jsonb,
  p_desc     numeric,
  p_pago     jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_items  jsonb := '[]'::jsonb;
  v_bruto  numeric := 0;
  v_total  numeric;
  v_desc   numeric := coalesce(p_desc, 0);
  v_pagado numeric;
  v_id     text;
  r        record;
  v_disp   integer;
  v_precio numeric;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_sucursal not in ('tarija', 'cochabamba', 'santacruz') then
    raise exception 'Sucursal inválida';
  end if;
  if not public.es_admin() then
    if public.mi_sucursal() is distinct from p_sucursal then
      raise exception 'No puedes vender en esa sucursal';
    end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene prendas';
  end if;
  if v_desc < 0 then
    raise exception 'Descuento inválido';
  end if;

  -- Una venta a la vez por sucursal: evita vender dos veces la última unidad
  perform pg_advisory_xact_lock(hashtext('venta:' || p_sucursal));

  for r in
    select x.p, upper(trim(x.t)) as t, x.c, sum(x.q)::int as q
      from jsonb_to_recordset(p_items) as x(p text, t text, c text, q int)
     group by x.p, upper(trim(x.t)), x.c
  loop
    if r.q is null or r.q <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    select (data ->> 'precio')::numeric into v_precio
      from public.docs
     where coleccion = 'products' and id = r.p
       and coalesce((data ->> 'activo')::boolean, true);
    if v_precio is null then
      raise exception 'Producto no disponible: %', r.p;
    end if;
    select coalesce(sum(s.q), 0) into v_disp
      from public._stock(p_sucursal) s
     where s.p = r.p and s.t = r.t and s.c = r.c;
    if v_disp < r.q then
      raise exception 'Sin stock suficiente de % % % (quedan %)', r.p, r.t, r.c, v_disp;
    end if;
    v_bruto := v_bruto + v_precio * r.q;
    v_items := v_items || jsonb_build_array(
      jsonb_build_object('p', r.p, 't', r.t, 'c', r.c, 'q', r.q, 'pr', v_precio));
  end loop;

  if v_desc > v_bruto then
    raise exception 'El descuento no puede superar el subtotal';
  end if;
  v_total := v_bruto - v_desc;

  v_pagado := coalesce((p_pago ->> 'ef')::numeric, 0) + coalesce((p_pago ->> 'qr')::numeric, 0)
            + coalesce((p_pago ->> 'tj')::numeric, 0) + coalesce((p_pago ->> 'gc')::numeric, 0);
  if abs(v_pagado - v_total) > 0.5 then
    raise exception 'El pago (%) no coincide con el total (%)', v_pagado, v_total;
  end if;

  v_id := gen_random_uuid()::text;
  insert into public.docs (coleccion, id, data)
  values ('sales', v_id, jsonb_build_object(
    'ts', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'sucursal', p_sucursal,
    'items', v_items,
    'bruto', v_bruto,
    'desc', v_desc,
    'total', v_total,
    'pago', jsonb_build_object(
      'ef', coalesce((p_pago ->> 'ef')::numeric, 0), 'qr', coalesce((p_pago ->> 'qr')::numeric, 0),
      'tj', coalesce((p_pago ->> 'tj')::numeric, 0), 'gc', coalesce((p_pago ->> 'gc')::numeric, 0)),
    'by', v_uid::text
  ));

  return jsonb_build_object('id', v_id, 'total', v_total, 'bruto', v_bruto);
end;
$$;

revoke all on function public.registrar_venta(text, jsonb, numeric, jsonb) from public, anon;
grant execute on function public.registrar_venta(text, jsonb, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Catálogo público (lo puede ver cualquier cliente, sin iniciar sesión)
--    Solo devuelve datos seguros: nunca cantidades exactas ni costos.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_publico(p_sucursal text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with disp as (
    select s.p, s.t, s.c, s.q
      from public._stock(p_sucursal) s
     where s.q > 0
  ),
  vars as (
    select d.p,
           jsonb_agg(jsonb_build_object('t', d.t, 'c', d.c, 'bajo', d.q <= 2)
                     order by d.t, d.c) as variantes
      from disp d group by d.p
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pr.id,
             'modelo', pr.data ->> 'modelo',
             'marca', pr.data ->> 'marca',
             'categoria', pr.data ->> 'categoria',
             'corte', pr.data ->> 'corte',
             'precio', (pr.data ->> 'precio')::numeric,
             'fotos', coalesce(pr.data -> 'fotos', '[]'::jsonb),
             'fc', coalesce(pr.data -> 'fc', '[]'::jsonb),
             'variantes', v.variantes
           ) order by pr.data ->> 'categoria', pr.data ->> 'marca', pr.data ->> 'modelo'
         ), '[]'::jsonb)
    from public.docs pr
    join vars v on v.p = pr.id
   where pr.coleccion = 'products'
     and coalesce((pr.data ->> 'activo')::boolean, true)
     and p_sucursal in ('tarija', 'cochabamba', 'santacruz');
$$;

revoke all on function public.catalogo_publico(text) from public;
grant execute on function public.catalogo_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tiempo real y almacenamiento de fotos (solo existen dentro de Supabase)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.docs;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.perfiles;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('fotos', 'fotos', true)
    on conflict (id) do update set public = true;

    drop policy if exists fotos_subir on storage.objects;
    create policy fotos_subir on storage.objects
      for insert to authenticated
      with check (bucket_id = 'fotos' and public.es_admin());

    drop policy if exists fotos_cambiar on storage.objects;
    create policy fotos_cambiar on storage.objects
      for update to authenticated
      using (bucket_id = 'fotos' and public.es_admin());

    drop policy if exists fotos_borrar on storage.objects;
    create policy fotos_borrar on storage.objects
      for delete to authenticated
      using (bucket_id = 'fotos' and public.es_admin());
  end if;
end $$;
