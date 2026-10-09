-- ============================================================================
-- Dunno Clothing · Tienda online
-- Agrega pedidos, ajustes de la tienda, códigos de descuento y comprobantes.
--
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar TODO este archivo > Run.
-- Primero debe estar ejecutado supabase/schema.sql. Es seguro repetirlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Datos nuevos dentro de la tabla docs (solo el dueño los lee/escribe directo):
--   settings/tienda  → ajustes de la tienda (WhatsApp, envíos, QR, banco…)
--   promos           → códigos de descuento
--   orders           → pedidos de la tienda online
-- Los clientes nunca tocan estas tablas: usan las funciones de abajo.
-- ---------------------------------------------------------------------------

create or replace function public._ajustes()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce((select data from public.docs where coleccion = 'settings' and id = 'tienda'), '{}'::jsonb);
$$;
revoke all on function public._ajustes() from public, anon, authenticated;

-- Solo dígitos, sin el código de país 591
create or replace function public._tel(p text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^591', '');
$$;

-- ---------------------------------------------------------------------------
-- Ajustes públicos de la tienda
-- ---------------------------------------------------------------------------
create or replace function public.tienda_ajustes()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public._ajustes();
$$;
revoke all on function public.tienda_ajustes() from public;
grant execute on function public.tienda_ajustes() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catálogo de la tienda: lo que se puede comprar hoy en una sucursal
-- (las cantidades se muestran hasta 10 para no revelar el inventario exacto)
-- ---------------------------------------------------------------------------
create or replace function public.tienda_catalogo(p_sucursal text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with disp as (
    select s.p, s.t, s.c, least(s.q, 10) as q
      from public._stock(p_sucursal) s
     where s.q > 0
  ),
  vars as (
    select d.p,
           jsonb_agg(jsonb_build_object('t', d.t, 'c', d.c, 'q', d.q) order by d.t, d.c) as variantes
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
             'precio_antes', (pr.data ->> 'precio_antes')::numeric,
             'descripcion', pr.data ->> 'descripcion',
             'destacado', coalesce((pr.data ->> 'destacado')::boolean, false),
             'nuevo', pr.creado > now() - interval '30 days',
             'creado', pr.creado,
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
revoke all on function public.tienda_catalogo(text) from public;
grant execute on function public.tienda_catalogo(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crear un pedido (compra sin cuenta). Valida todo en el servidor:
-- stock, precios, envío, código de descuento y datos del cliente.
--   p_items  : [{"p":"id-producto","t":"M","c":"Negro","q":1}, ...]
--   p_cliente: {"nombre":"…","telefono":"…","email":"…"}
--   p_entrega: {"tipo":"retiro|delivery|nacional","direccion":"…","ciudad":"…","referencia":"…"}
--   p_metodo : qr | transferencia | contraentrega | tienda
-- ---------------------------------------------------------------------------
create or replace function public.crear_pedido(
  p_sucursal text,
  p_items    jsonb,
  p_cliente  jsonb,
  p_entrega  jsonb,
  p_metodo   text,
  p_promo    text default null,
  p_nota     text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_cfg      jsonb := public._ajustes();
  v_items    jsonb := '[]'::jsonb;
  v_sub      numeric := 0;
  v_desc     numeric := 0;
  v_envio    numeric := 0;
  v_total    numeric;
  v_tel      text := public._tel(p_cliente ->> 'telefono');
  v_nombre   text := btrim(coalesce(p_cliente ->> 'nombre', ''));
  v_tipo     text := p_entrega ->> 'tipo';
  v_dir      text := btrim(coalesce(p_entrega ->> 'direccion', ''));
  v_codigo   text;
  v_id       text := gen_random_uuid()::text;
  v_now      bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_gratis   numeric;
  v_nitems   int;
  r          record;
  v_precio   numeric;
  v_nombre_p text;
  v_disp     int;
  v_pr       record;
  v_metodos  jsonb := coalesce(v_cfg -> 'pagos', '{"qr":true,"transferencia":true,"contraentrega":true,"tienda":true}'::jsonb);
begin
  if p_sucursal not in ('tarija', 'cochabamba', 'santacruz') then
    raise exception 'Sucursal inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Tu carrito está vacío';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Máximo 20 prendas por pedido';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if char_length(v_tel) < 7 or char_length(v_tel) > 11 then
    raise exception 'Escribe un número de celular válido';
  end if;
  if v_tipo not in ('retiro', 'delivery', 'nacional') then
    raise exception 'Elige cómo quieres recibir tu pedido';
  end if;
  if v_tipo in ('delivery', 'nacional') and char_length(v_dir) < 5 then
    raise exception 'Escribe tu dirección de entrega';
  end if;
  if p_metodo not in ('qr', 'transferencia', 'contraentrega', 'tienda')
     or coalesce((v_metodos ->> p_metodo)::boolean, false) = false then
    raise exception 'Ese método de pago no está disponible';
  end if;
  if p_metodo = 'contraentrega' and v_tipo <> 'delivery' then
    raise exception 'El pago contra entrega es solo para delivery en la ciudad';
  end if;
  if p_metodo = 'tienda' and v_tipo <> 'retiro' then
    raise exception 'El pago en tienda es solo para retiro en sucursal';
  end if;

  -- Evita pedidos falsos repetidos
  if (select count(*) from public.docs
       where coleccion = 'orders'
         and public._tel(data -> 'cliente' ->> 'telefono') = v_tel
         and data ->> 'estado' = 'pendiente'
         and (data ->> 'ts')::bigint > v_now - 86400000) >= 3 then
    raise exception 'Ya tienes pedidos pendientes de pago. Págalos o cancélalos antes de hacer otro';
  end if;

  -- Una operación a la vez por sucursal (misma cerradura que las ventas en tienda)
  perform pg_advisory_xact_lock(hashtext('venta:' || p_sucursal));

  v_nitems := 0;
  for r in
    select x.p, upper(btrim(x.t)) as t, btrim(x.c) as c, sum(x.q)::int as q
      from jsonb_to_recordset(p_items) as x(p text, t text, c text, q int)
     group by x.p, upper(btrim(x.t)), btrim(x.c)
  loop
    if r.q is null or r.q < 1 or r.q > 5 then
      raise exception 'Cantidad inválida (máximo 5 por prenda)';
    end if;
    select (data ->> 'precio')::numeric, data ->> 'modelo' into v_precio, v_nombre_p
      from public.docs
     where coleccion = 'products' and id = r.p
       and coalesce((data ->> 'activo')::boolean, true);
    if v_precio is null then
      raise exception 'Una de las prendas ya no está disponible';
    end if;
    select coalesce(sum(s.q), 0) into v_disp
      from public._stock(p_sucursal) s
     where s.p = r.p and s.t = r.t and s.c = r.c;
    if v_disp < r.q then
      raise exception 'Ya no queda suficiente de % (talla %, color %). Quedan %', initcap(v_nombre_p), r.t, r.c, v_disp;
    end if;
    v_sub := v_sub + v_precio * r.q;
    v_nitems := v_nitems + r.q;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'p', r.p, 't', r.t, 'c', r.c, 'q', r.q, 'pr', v_precio, 'nombre', v_nombre_p));
  end loop;

  -- Código de descuento
  if p_promo is not null and btrim(p_promo) <> '' then
    select * into v_pr from public.docs
     where coleccion = 'promos' and upper(data ->> 'codigo') = upper(btrim(p_promo))
       and coalesce((data ->> 'activo')::boolean, true)
     limit 1;
    if not found then
      raise exception 'El código de descuento no es válido';
    end if;
    if coalesce((v_pr.data ->> 'minimo')::numeric, 0) > v_sub then
      raise exception 'Este código aplica desde Bs % de compra', (v_pr.data ->> 'minimo');
    end if;
    if v_pr.data ->> 'vence' is not null and (v_pr.data ->> 'vence')::date < current_date then
      raise exception 'El código de descuento venció';
    end if;
    if v_pr.data ->> 'tipo' = 'pct' then
      v_desc := round(v_sub * least((v_pr.data ->> 'valor')::numeric, 100) / 100);
    else
      v_desc := least((v_pr.data ->> 'valor')::numeric, v_sub);
    end if;
  end if;

  -- Costo de envío
  v_gratis := coalesce((v_cfg -> 'envio' ->> 'gratis_desde')::numeric, 0);
  if v_tipo = 'delivery' then
    v_envio := coalesce((v_cfg -> 'envio' -> 'delivery' ->> p_sucursal)::numeric, 0);
    if v_gratis > 0 and (v_sub - v_desc) >= v_gratis then
      v_envio := 0;
    end if;
  end if;
  v_total := v_sub - v_desc + v_envio;

  -- Código corto fácil de dictar
  loop
    v_codigo := 'DN-' || upper(translate(substr(md5(random()::text || clock_timestamp()::text), 1, 6), '01ilo', '23abc'));
    exit when not exists (select 1 from public.docs where coleccion = 'orders' and data ->> 'codigo' = v_codigo);
  end loop;

  insert into public.docs (coleccion, id, data)
  values ('orders', v_id, jsonb_build_object(
    'codigo', v_codigo,
    'ts', v_now,
    'estado', 'pendiente',
    'sucursal', p_sucursal,
    'items', v_items,
    'subtotal', v_sub,
    'descuento', v_desc,
    'promo', nullif(upper(btrim(coalesce(p_promo, ''))), ''),
    'envio', v_envio,
    'total', v_total,
    'cliente', jsonb_build_object('nombre', v_nombre, 'telefono', v_tel,
                                   'email', nullif(btrim(coalesce(p_cliente ->> 'email', '')), '')),
    'entrega', jsonb_build_object('tipo', v_tipo, 'direccion', v_dir,
                                   'ciudad', nullif(btrim(coalesce(p_entrega ->> 'ciudad', '')), ''),
                                   'referencia', nullif(btrim(coalesce(p_entrega ->> 'referencia', '')), '')),
    'pago', jsonb_build_object('metodo', p_metodo),
    'nota', nullif(left(btrim(coalesce(p_nota, '')), 300), ''),
    'historial', jsonb_build_array(jsonb_build_object('ts', v_now, 'estado', 'pendiente'))
  ));

  return jsonb_build_object('codigo', v_codigo, 'id', v_id, 'subtotal', v_sub, 'descuento', v_desc,
                            'envio', v_envio, 'total', v_total, 'estado', 'pendiente');
end;
$$;
revoke all on function public.crear_pedido(text, jsonb, jsonb, jsonb, text, text, text) from public;
grant execute on function public.crear_pedido(text, jsonb, jsonb, jsonb, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Probar un código de descuento antes de pagar
-- ---------------------------------------------------------------------------
create or replace function public.validar_promo(p_codigo text, p_subtotal numeric)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_pr record; v_desc numeric := 0;
begin
  select * into v_pr from public.docs
   where coleccion = 'promos' and upper(data ->> 'codigo') = upper(btrim(coalesce(p_codigo, '')))
     and coalesce((data ->> 'activo')::boolean, true)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'El código no es válido');
  end if;
  if coalesce((v_pr.data ->> 'minimo')::numeric, 0) > coalesce(p_subtotal, 0) then
    return jsonb_build_object('ok', false, 'mensaje', 'Este código aplica desde Bs ' || (v_pr.data ->> 'minimo') || ' de compra');
  end if;
  if v_pr.data ->> 'vence' is not null and (v_pr.data ->> 'vence')::date < current_date then
    return jsonb_build_object('ok', false, 'mensaje', 'El código venció');
  end if;
  if v_pr.data ->> 'tipo' = 'pct' then
    v_desc := round(p_subtotal * least((v_pr.data ->> 'valor')::numeric, 100) / 100);
  else
    v_desc := least((v_pr.data ->> 'valor')::numeric, p_subtotal);
  end if;
  return jsonb_build_object('ok', true, 'descuento', v_desc, 'mensaje', 'Código aplicado');
end;
$$;
revoke all on function public.validar_promo(text, numeric) from public;
grant execute on function public.validar_promo(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consultar un pedido (código + celular). Devuelve solo lo que ve el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.consultar_pedido(p_codigo text, p_telefono text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
           'codigo', o.data ->> 'codigo',
           'ts', o.data -> 'ts',
           'estado', o.data ->> 'estado',
           'sucursal', o.data ->> 'sucursal',
           'items', o.data -> 'items',
           'subtotal', o.data -> 'subtotal',
           'descuento', o.data -> 'descuento',
           'envio', o.data -> 'envio',
           'total', o.data -> 'total',
           'entrega', o.data -> 'entrega',
           'pago', jsonb_build_object('metodo', o.data -> 'pago' ->> 'metodo',
                                      'comprobante', (o.data -> 'pago' ->> 'comprobante') is not null),
           'historial', o.data -> 'historial',
           'vence', (o.data ->> 'ts')::bigint
                    + coalesce((public._ajustes() ->> 'hold_horas')::numeric, 12) * 3600000
         )
    from public.docs o
   where o.coleccion = 'orders'
     and upper(o.data ->> 'codigo') = upper(btrim(p_codigo))
     and public._tel(o.data -> 'cliente' ->> 'telefono') = public._tel(p_telefono)
   limit 1;
$$;
revoke all on function public.consultar_pedido(text, text) from public;
grant execute on function public.consultar_pedido(text, text) to anon, authenticated;

-- Adjuntar la foto del comprobante de pago
create or replace function public.adjuntar_comprobante(p_codigo text, p_telefono text, p_path text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare v_id text;
begin
  select o.id into v_id from public.docs o
   where o.coleccion = 'orders'
     and upper(o.data ->> 'codigo') = upper(btrim(p_codigo))
     and public._tel(o.data -> 'cliente' ->> 'telefono') = public._tel(p_telefono)
     and o.data ->> 'estado' in ('pendiente', 'pagado')
   limit 1;
  if v_id is null then
    raise exception 'No encontramos ese pedido';
  end if;
  if p_path is null or p_path not like 'orders/' || upper(btrim(p_codigo)) || '/%' then
    raise exception 'Archivo inválido';
  end if;
  update public.docs
     set data = jsonb_set(data, '{pago}', (data -> 'pago') || jsonb_build_object('comprobante', p_path, 'comprobante_ts',
                (extract(epoch from clock_timestamp()) * 1000)::bigint))
   where coleccion = 'orders' and id = v_id;
  return true;
end;
$$;
revoke all on function public.adjuntar_comprobante(text, text, text) from public;
grant execute on function public.adjuntar_comprobante(text, text, text) to anon, authenticated;

-- El cliente cancela su pedido mientras sigue pendiente de pago
create or replace function public.cancelar_pedido_cliente(p_codigo text, p_telefono text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare v_id text; v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select o.id into v_id from public.docs o
   where o.coleccion = 'orders'
     and upper(o.data ->> 'codigo') = upper(btrim(p_codigo))
     and public._tel(o.data -> 'cliente' ->> 'telefono') = public._tel(p_telefono)
     and o.data ->> 'estado' = 'pendiente'
   limit 1;
  if v_id is null then
    raise exception 'Solo se pueden cancelar pedidos pendientes de pago';
  end if;
  update public.docs
     set data = jsonb_set(jsonb_set(data, '{estado}', '"cancelado"'), '{historial}',
                (data -> 'historial') || jsonb_build_array(jsonb_build_object('ts', v_now, 'estado', 'cancelado', 'por', 'cliente')))
   where coleccion = 'orders' and id = v_id;
  return true;
end;
$$;
revoke all on function public.cancelar_pedido_cliente(text, text) from public;
grant execute on function public.cancelar_pedido_cliente(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El dueño cambia el estado de un pedido.
--   pendiente → pagado → preparando → enviado → entregado    (o cancelado)
-- Al pagarse se registra la venta online (para el dashboard) sin descontar
-- stock otra vez, porque el pedido ya lo estaba reservando.
-- ---------------------------------------------------------------------------
create or replace function public.pedido_cambiar_estado(p_id text, p_estado text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  o        public.docs%rowtype;
  v_now    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_met    text;
  v_pago   jsonb;
  v_venta  text;
begin
  if not public.es_admin() then
    raise exception 'Solo el dueño puede cambiar el estado';
  end if;
  if p_estado not in ('pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado') then
    raise exception 'Estado inválido';
  end if;
  select * into o from public.docs where coleccion = 'orders' and id = p_id for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if o.data ->> 'estado' = p_estado then
    return o.data;
  end if;

  v_venta := 'o-' || (o.data ->> 'codigo');
  v_met := o.data -> 'pago' ->> 'metodo';

  if p_estado = 'cancelado' then
    update public.docs set data = jsonb_set(data, '{anulada}', 'true')
     where coleccion = 'sales' and id = v_venta;
  elsif p_estado in ('pagado', 'preparando', 'enviado', 'entregado') then
    -- Si estaba cancelado y se reactiva, verifica que aún haya stock
    if o.data ->> 'estado' = 'cancelado' then
      if exists (
        select 1
          from jsonb_to_recordset(o.data -> 'items') as i(p text, t text, c text, q int)
          left join public._stock(o.data ->> 'sucursal') s on s.p = i.p and s.t = i.t and s.c = i.c
         where coalesce(s.q, 0) < i.q
      ) then
        raise exception 'Ya no hay stock para reactivar este pedido';
      end if;
    end if;
    v_pago := case when v_met in ('contraentrega', 'tienda')
                   then jsonb_build_object('ef', o.data -> 'total', 'qr', 0, 'tj', 0, 'gc', 0)
                   else jsonb_build_object('ef', 0, 'qr', o.data -> 'total', 'tj', 0, 'gc', 0) end;
    insert into public.docs (coleccion, id, data)
    values ('sales', v_venta, jsonb_build_object(
      'ts', v_now,
      'sucursal', o.data ->> 'sucursal',
      'items', o.data -> 'items',
      'bruto', o.data -> 'subtotal',
      'desc', o.data -> 'descuento',
      'total', ((o.data ->> 'total')::numeric - coalesce((o.data ->> 'envio')::numeric, 0)),
      'envio', o.data -> 'envio',
      'pago', v_pago,
      'online', true,
      'pedido', o.data ->> 'codigo',
      'by', null))
    on conflict (coleccion, id) do update
       set data = jsonb_set(public.docs.data, '{anulada}', 'false');
  end if;

  update public.docs
     set data = jsonb_set(jsonb_set(data, '{estado}', to_jsonb(p_estado)), '{historial}',
                (data -> 'historial') || jsonb_build_array(
                  jsonb_build_object('ts', v_now, 'estado', p_estado, 'por', auth.uid()::text)))
   where coleccion = 'orders' and id = p_id
  returning data into o.data;

  return o.data;
end;
$$;
revoke all on function public.pedido_cambiar_estado(text, text) from public, anon;
grant execute on function public.pedido_cambiar_estado(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Comprobantes de pago: carpeta privada. Los clientes pueden subir su foto
-- (hasta 5 MB), solo el dueño puede verlas.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = false, file_size_limit = 5242880,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    drop policy if exists comprobantes_subir on storage.objects;
    create policy comprobantes_subir on storage.objects
      for insert to anon, authenticated
      with check (bucket_id = 'comprobantes' and name like 'orders/%');

    drop policy if exists comprobantes_ver on storage.objects;
    create policy comprobantes_ver on storage.objects
      for select to authenticated
      using (bucket_id = 'comprobantes' and public.es_admin());

    drop policy if exists comprobantes_borrar on storage.objects;
    create policy comprobantes_borrar on storage.objects
      for delete to authenticated
      using (bucket_id = 'comprobantes' and public.es_admin());
  end if;
end $$;
