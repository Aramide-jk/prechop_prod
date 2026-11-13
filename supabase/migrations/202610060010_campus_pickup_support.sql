-- Campus Pickup & Fulfillment Channels Migration
-- Adds pickup_enabled, delivery_enabled, pickup station settings, and fulfillment_type to order_deliveries.

-- 1. Add fulfillment toggles and pickup station settings to referral_campaign_settings
alter table public.referral_campaign_settings
  add column if not exists delivery_enabled boolean not null default true,
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists pickup_station_name text not null default 'ABU Social Center',
  add column if not exists pickup_station_address text not null default 'Social Center, Samaru Campus, ABU Zaria',
  add column if not exists pickup_instructions text not null default 'Collect your meal at the PreChop desk inside Social Center during your meal window.';

-- Update default settings record (id = 1)
update public.referral_campaign_settings
set
  delivery_enabled = coalesce(delivery_enabled, true),
  pickup_enabled = coalesce(pickup_enabled, true),
  pickup_station_name = coalesce(nullif(pickup_station_name, ''), 'ABU Social Center'),
  pickup_station_address = coalesce(nullif(pickup_station_address, ''), 'Social Center, Samaru Campus, ABU Zaria'),
  pickup_instructions = coalesce(nullif(pickup_instructions, ''), 'Collect your meal at the PreChop desk inside Social Center during your meal window.')
where id = 1;

-- 2. Add fulfillment_type column to order_deliveries
alter table public.order_deliveries
  add column if not exists fulfillment_type text not null default 'delivery'
  check (fulfillment_type in ('delivery', 'pickup'));

-- 3. Update create_customer_checkout to handle both 'delivery' and 'pickup' fulfillments
create or replace function public.create_customer_checkout(p_deliveries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_order_id uuid := gen_random_uuid();
  v_delivery_id uuid;
  v_delivery jsonb;
  v_item jsonb;
  v_extra jsonb;
  v_extras jsonb;
  v_items jsonb;
  v_deliveries jsonb := '[]'::jsonb;
  v_normalized_item jsonb;
  v_date date;
  v_cutoff_at timestamptz;
  v_address text;
  v_note text;
  v_batch_id uuid;
  v_area_id uuid;
  v_area_name text;
  v_area_fee integer;
  v_fulfillment_type text;
  v_meal_slug text;
  v_protein_slug text;
  v_extra_slug text;
  v_quantity integer;
  v_line_total integer;
  v_food_total integer := 0;
  v_delivery_total integer := 0;
  v_order_item_count integer := 0;
  v_batch record;
  v_area record;
  v_meal record;
  v_pool record;
  v_addon record;
  v_stock record;
  v_existing integer;
  v_index integer := 0;
begin
  if v_customer_id is null then
    raise exception 'Please sign in before placing your order.';
  end if;
  if jsonb_typeof(p_deliveries) is distinct from 'array'
     or coalesce(jsonb_array_length(p_deliveries), 0) < 1
     or coalesce(jsonb_array_length(p_deliveries), 0) > 21 then
    raise exception 'Your checkout must contain between 1 and 21 deliveries.';
  end if;

  -- Validate each delivery and snapshot the server-owned catalogue values.
  for v_delivery in select value from jsonb_array_elements(p_deliveries)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_delivery -> 'items') is distinct from 'array'
       or jsonb_array_length(v_delivery -> 'items') < 1
       or jsonb_array_length(v_delivery -> 'items') > 50 then
      raise exception 'Delivery % has no meals or too many meals.', v_index;
    end if;

    v_date := (v_delivery ->> 'service_date')::date;
    v_batch_id := (v_delivery ->> 'batch_id')::uuid;
    v_note := trim(coalesce(v_delivery ->> 'delivery_note', ''));
    if char_length(v_note) > 200 then
      raise exception 'Delivery notes must be 200 characters or fewer.';
    end if;

    v_fulfillment_type := coalesce(nullif(trim(v_delivery ->> 'fulfillment_type'), ''), 'delivery');
    if v_fulfillment_type not in ('delivery', 'pickup') then
      v_fulfillment_type := 'delivery';
    end if;

    select b.id, b.name, b.window_id, b.delivery_starts_at, b.delivery_ends_at,
           b.cutoff_time, w."window" as meal_window
      into v_batch
      from public.delivery_batches b
      join public.delivery_windows w on w.id = b.window_id and w.active
     where b.id = v_batch_id and b.active;
    if not found then
      raise exception 'One of the selected delivery times is no longer available.';
    end if;

    if v_fulfillment_type = 'pickup' then
      v_area_name := 'Campus Pickup';
      v_area_fee := 0;
      v_address := coalesce(
        nullif(trim(v_delivery ->> 'address'), ''),
        nullif(trim(v_delivery ->> 'pickup_station_address'), ''),
        'Social Center, Samaru Campus, ABU Zaria'
      );
    else
      v_area_id := (v_delivery ->> 'area_id')::uuid;
      v_address := trim(coalesce(v_delivery ->> 'address', ''));

      if char_length(v_address) < 8 or char_length(v_address) > 300 then
        raise exception 'Enter an address between 8 and 300 characters.';
      end if;

      select a.id, a.name, a.fee_ngn into v_area
        from public.delivery_areas a where a.id = v_area_id and a.active;
      if not found then
        raise exception 'One of the selected delivery areas is no longer available.';
      end if;
      v_area_name := v_area.name;
      v_area_fee := v_area.fee_ngn;
    end if;

    v_cutoff_at := ((v_date + v_batch.cutoff_time) at time zone 'Africa/Lagos');
    if v_cutoff_at <= now() then
      raise exception 'The ordering cutoff has passed for one of your deliveries.';
    end if;

    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_delivery -> 'items')
    loop
      v_meal_slug := trim(coalesce(v_item ->> 'meal_slug', ''));
      select m.id, m.name, m.base_price_ngn into v_meal
        from public.meals m where m.slug = v_meal_slug and m.active;
      if not found then
        raise exception 'A selected meal is no longer available.';
      end if;

      select p.id, p.portion_limit into v_pool
        from public.meal_stock_pools p
        join public.batch_menu_items bm on bm.stock_pool_id = p.id and bm.active
       where p.meal_id = v_meal.id and p.service_date = v_date
         and bm.batch_id = v_batch.id;
      if not found then
        raise exception 'A selected meal is not posted for that date and delivery time.';
      end if;

      v_protein_slug := nullif(trim(coalesce(v_item ->> 'protein_slug', '')), '');
      if v_protein_slug = 'none' then v_protein_slug := null; end if;
      if v_protein_slug is null then
        v_line_total := v_meal.base_price_ngn;
        v_normalized_item := jsonb_build_object(
          'stock_pool_id', v_pool.id, 'meal_name', v_meal.name,
          'base_price_ngn', v_meal.base_price_ngn, 'protein_name', null,
          'protein_addon_id', null, 'protein_price_ngn', 0,
          'extras_snapshot', '[]'::jsonb, 'line_total_ngn', v_line_total
        );
      else
        select a.id, a.name, a.price_ngn into v_addon
          from public.meal_proteins mp
          join public.add_on_catalog a on a.id = mp.addon_id and a.active
         where mp.meal_id = v_meal.id and mp.active and a.slug = v_protein_slug
           and a.category = 'protein';
        if not found then
          raise exception 'A selected protein is not available with that meal.';
        end if;
        v_line_total := v_meal.base_price_ngn + v_addon.price_ngn;
        v_normalized_item := jsonb_build_object(
          'stock_pool_id', v_pool.id, 'meal_name', v_meal.name,
          'base_price_ngn', v_meal.base_price_ngn, 'protein_name', v_addon.name,
          'protein_addon_id', v_addon.id, 'protein_price_ngn', v_addon.price_ngn,
          'extras_snapshot', '[]'::jsonb, 'line_total_ngn', v_line_total
        );
      end if;

      v_extras := '[]'::jsonb;
      if v_item ? 'extras' and jsonb_typeof(v_item -> 'extras') <> 'array' then
        raise exception 'Extras must be provided as a list.';
      end if;
      if v_item ? 'extras' then
        for v_extra in select value from jsonb_array_elements(v_item -> 'extras')
        loop
          v_extra_slug := trim(coalesce(v_extra ->> 'extra_slug', ''));
          v_quantity := coalesce((v_extra ->> 'quantity')::integer, 0);
          if v_quantity < 1 or v_quantity > 10 then
            raise exception 'Extra quantities must be between 1 and 10.';
          end if;
          select a.id, a.name, a.price_ngn into v_addon
            from public.meal_extras me
            join public.add_on_catalog a on a.id = me.addon_id and a.active
           where me.meal_id = v_meal.id and me.active and a.slug = v_extra_slug
             and a.category = 'extra';
          if not found then
            raise exception 'A selected extra is not available with that meal.';
          end if;
          v_line_total := v_line_total + (v_addon.price_ngn * v_quantity);
          v_extras := v_extras || jsonb_build_array(jsonb_build_object(
            'addon_id', v_addon.id, 'name', v_addon.name,
            'price_ngn', v_addon.price_ngn, 'quantity', v_quantity
          ));
        end loop;
      end if;

      v_normalized_item := jsonb_set(v_normalized_item, '{extras_snapshot}', v_extras);
      v_normalized_item := jsonb_set(v_normalized_item, '{line_total_ngn}', to_jsonb(v_line_total));
      v_items := v_items || jsonb_build_array(v_normalized_item);
      v_food_total := v_food_total + v_line_total;
      v_order_item_count := v_order_item_count + 1;
    end loop;

    v_delivery_total := v_delivery_total + v_area_fee;
    v_deliveries := v_deliveries || jsonb_build_array(jsonb_build_object(
      'service_date', v_date, 'batch_id', v_batch.id,
      'window', v_batch.meal_window, 'batch_name', v_batch.name,
      'delivery_starts_at', v_batch.delivery_starts_at,
      'delivery_ends_at', v_batch.delivery_ends_at,
      'cutoff_at', v_cutoff_at, 'area_name', v_area_name,
      'area_fee_ngn', v_area_fee, 'address_text', v_address,
      'delivery_note', v_note, 'fulfillment_type', v_fulfillment_type,
      'items', v_items
    ));
  end loop;

  if v_order_item_count > 100 then
    raise exception 'An order can contain at most 100 plates.';
  end if;

  -- Lock all selected meal pools and add-ons in stable order before checking limits.
  perform p.id
    from public.meal_stock_pools p
   where p.id in (
     select (i ->> 'stock_pool_id')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
   )
   order by p.id for update;

  perform a.id
    from public.add_on_catalog a
   where a.id in (
     select nullif(i ->> 'protein_addon_id', '')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
      where nullif(i ->> 'protein_addon_id', '') is not null
     union
     select (x ->> 'addon_id')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
       cross join lateral jsonb_array_elements(i -> 'extras_snapshot') x
   )
   order by a.id for update;

  for v_stock in
    select p.id, p.portion_limit, count(*)::integer as requested
      from jsonb_array_elements(v_deliveries) d
      cross join lateral jsonb_array_elements(d -> 'items') i
      join public.meal_stock_pools p on p.id = (i ->> 'stock_pool_id')::uuid
     group by p.id, p.portion_limit
  loop
    select count(oi.id)::integer into v_existing
      from public.order_items oi
      join public.order_deliveries od on od.id = oi.delivery_id
      join public.orders o on o.id = od.order_id
     where oi.stock_pool_id = v_stock.id
       and od.status <> 'cancelled'
       and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
            or (o.status = 'pending_payment' and o.reservation_expires_at > now()));
    if v_existing + v_stock.requested > v_stock.portion_limit then
      raise exception 'A selected meal has sold out for that delivery window.';
    end if;
  end loop;

  for v_stock in
    select a.id, a.stock_limit, sum(coalesce(req.qty, 1))::integer as requested
      from (
        select nullif(i ->> 'protein_addon_id', '')::uuid as addon_id, 1::integer as qty
          from jsonb_array_elements(v_deliveries) d
          cross join lateral jsonb_array_elements(d -> 'items') i
         where nullif(i ->> 'protein_addon_id', '') is not null
        union all
        select (x ->> 'addon_id')::uuid as addon_id, (x ->> 'quantity')::integer as qty
          from jsonb_array_elements(v_deliveries) d
          cross join lateral jsonb_array_elements(d -> 'items') i
          cross join lateral jsonb_array_elements(i -> 'extras_snapshot') x
      ) req
      join public.add_on_catalog a on a.id = req.addon_id
     where a.stock_limit is not null
     group by a.id, a.stock_limit
  loop
    select (
      (select count(oi.id)::integer
         from public.order_items oi
         join public.order_deliveries od on od.id = oi.delivery_id
         join public.orders o on o.id = od.order_id
        where oi.protein_addon_id = v_stock.id
          and od.status <> 'cancelled'
          and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
               or (o.status = 'pending_payment' and o.reservation_expires_at > now())))
      +
      (select coalesce(sum((x ->> 'quantity')::integer), 0)::integer
         from public.order_items oi
         join public.order_deliveries od on od.id = oi.delivery_id
         join public.orders o on o.id = od.order_id
         cross join lateral jsonb_array_elements(oi.extras_snapshot) x
        where x ->> 'addon_id' = v_stock.id::text
          and od.status <> 'cancelled'
          and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
               or (o.status = 'pending_payment' and o.reservation_expires_at > now())))
    ) into v_existing;
    if v_existing + v_stock.requested > v_stock.stock_limit then
      raise exception 'One of your selected proteins or extras just sold out.';
    end if;
  end loop;

  insert into public.orders(customer_id, status, payment_status, subtotal_ngn,
                            delivery_total_ngn, reservation_expires_at)
  values (v_customer_id, 'pending_payment', 'pending', v_food_total,
          v_delivery_total, now() + interval '15 minutes')
  returning id into v_order_id;

  for v_delivery in select value from jsonb_array_elements(v_deliveries)
  loop
    insert into public.order_deliveries(
      order_id, batch_id, service_date, area_name, area_fee_ngn,
      address_label, address_text, delivery_note, cutoff_at, status,
      fulfillment_type
    ) values (
      v_order_id, (v_delivery ->> 'batch_id')::uuid,
      (v_delivery ->> 'service_date')::date, v_delivery ->> 'area_name',
      (v_delivery ->> 'area_fee_ngn')::integer,
      case when (v_delivery ->> 'fulfillment_type') = 'pickup' then 'Pickup station' else 'Delivery address' end,
      v_delivery ->> 'address_text', v_delivery ->> 'delivery_note',
      (v_delivery ->> 'cutoff_at')::timestamptz, 'pending_payment',
      coalesce(v_delivery ->> 'fulfillment_type', 'delivery')
    ) returning id into v_delivery_id;

    for v_item in select value from jsonb_array_elements(v_delivery -> 'items')
    loop
      insert into public.order_items(
        delivery_id, stock_pool_id, meal_name, base_price_ngn,
        protein_name, protein_addon_id, protein_price_ngn, extras_snapshot
      ) values (
        v_delivery_id, (v_item ->> 'stock_pool_id')::uuid,
        v_item ->> 'meal_name', (v_item ->> 'base_price_ngn')::integer,
        v_item ->> 'protein_name', nullif(v_item ->> 'protein_addon_id', '')::uuid,
        (v_item ->> 'protein_price_ngn')::integer, v_item -> 'extras_snapshot'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal_ngn', v_food_total,
    'delivery_total_ngn', v_delivery_total,
    'total_ngn', v_food_total + v_delivery_total,
    'reservation_expires_at', now() + interval '15 minutes',
    'status', 'pending_payment'
  );
end;
$$;
