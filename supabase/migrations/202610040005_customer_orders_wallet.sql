-- Customer wallet, order editing and delivery cancellation operations.
alter table public.order_deliveries
  add column if not exists wallet_applied_ngn integer not null default 0 check (wallet_applied_ngn >= 0);

create table if not exists public.wallet_credit_reservations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  amount_ngn integer not null check (amount_ngn >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.customer_delivery_refunds (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.order_deliveries(id),
  order_id uuid not null references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  method text not null check (method in ('wallet', 'original')),
  total_ngn integer not null check (total_ngn >= 0),
  wallet_refund_ngn integer not null check (wallet_refund_ngn >= 0),
  cash_refund_ngn integer not null check (cash_refund_ngn >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'accepted', 'processed', 'failed')),
  paystack_refund_id bigint unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.wallet_credit_reservations enable row level security;
alter table public.customer_delivery_refunds enable row level security;
create policy "Customers read their wallet reservations" on public.wallet_credit_reservations for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers read their delivery refunds" on public.customer_delivery_refunds for select to authenticated using (customer_id = (select auth.uid()));
revoke all on public.wallet_credit_reservations, public.customer_delivery_refunds from anon, authenticated;
grant select on public.wallet_credit_reservations, public.customer_delivery_refunds to authenticated;

create or replace function public.release_expired_customer_wallet_credits()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_reservation record;
  v_count integer := 0;
begin
  if v_customer is null then raise exception 'Sign in to access wallet credit.'; end if;
  for v_reservation in
    select r.order_id, r.amount_ngn from public.wallet_credit_reservations r
    join public.orders o on o.id = r.order_id
    where r.customer_id = v_customer and r.status = 'reserved'
      and o.status = 'pending_payment' and o.reservation_expires_at <= now()
    for update of r, o
  loop
    if v_reservation.amount_ngn > 0 then
      insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
      values (v_customer, v_reservation.order_id, 'refund', v_reservation.amount_ngn,
        'Wallet credit released after an unpaid reservation expired');
    end if;
    update public.wallet_credit_reservations set status = 'released', updated_at = now() where order_id = v_reservation.order_id;
    update public.orders set wallet_applied_ngn = 0, updated_at = now() where id = v_reservation.order_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.apply_customer_wallet_credit(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := auth.uid(); v_order public.orders%rowtype;
  v_balance integer; v_due integer; v_apply integer;
  v_delivery record; v_remaining integer; v_delivery_credit integer; v_delivery_total integer;
begin
  if v_customer is null then raise exception 'Sign in before using wallet credit.'; end if;
  perform public.release_expired_customer_wallet_credits();
  perform 1 from public.profiles where id = v_customer for update;
  select * into v_order from public.orders where id = p_order_id and customer_id = v_customer for update;
  if not found then raise exception 'We could not find this checkout.'; end if;
  if v_order.status <> 'pending_payment' or v_order.reservation_expires_at <= now() then raise exception 'This reservation has expired. Please return to checkout.'; end if;
  if exists (select 1 from public.wallet_credit_reservations where order_id = p_order_id) then
    return jsonb_build_object('wallet_applied_ngn', v_order.wallet_applied_ngn,
      'total_ngn', v_order.subtotal_ngn + v_order.delivery_total_ngn - v_order.wallet_applied_ngn);
  end if;
  select greatest(0, coalesce(sum(amount_ngn), 0))::integer into v_balance from public.wallet_entries where customer_id = v_customer;
  v_due := v_order.subtotal_ngn + v_order.delivery_total_ngn;
  v_apply := least(v_balance, v_due);
  if v_apply > 0 then
    insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
    values (v_customer, p_order_id, 'order_debit', -v_apply, 'Wallet credit used for this order');
  end if;
  update public.orders set wallet_applied_ngn = v_apply, updated_at = now() where id = p_order_id;
  insert into public.wallet_credit_reservations(order_id, customer_id, amount_ngn, status) values (p_order_id, v_customer, v_apply, 'reserved');
  v_remaining := v_apply;
  for v_delivery in
    select d.id, d.area_fee_ngn,
      coalesce((select sum(i.base_price_ngn + i.protein_price_ngn + coalesce((
        select sum((x ->> 'price_ngn')::integer * (x ->> 'quantity')::integer) from jsonb_array_elements(i.extras_snapshot) x), 0))
        from public.order_items i where i.delivery_id = d.id), 0)::integer as food_total
    from public.order_deliveries d where d.order_id = p_order_id order by d.service_date, d.batch_id, d.id
  loop
    v_delivery_total := v_delivery.food_total + v_delivery.area_fee_ngn;
    v_delivery_credit := least(v_remaining, v_delivery_total);
    update public.order_deliveries set wallet_applied_ngn = v_delivery_credit where id = v_delivery.id;
    v_remaining := v_remaining - v_delivery_credit;
  end loop;
  return jsonb_build_object('wallet_applied_ngn', v_apply, 'total_ngn', v_due - v_apply);
end;
$$;

create or replace function public.complete_customer_wallet_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_customer uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if v_customer is null then raise exception 'Sign in before completing checkout.'; end if;
  select * into v_order from public.orders where id = p_order_id and customer_id = v_customer for update;
  if not found then raise exception 'We could not find this checkout.'; end if;
  if v_order.payment_status = 'succeeded' then return jsonb_build_object('confirmed', true, 'order_id', v_order.id); end if;
  if v_order.status <> 'pending_payment' or v_order.reservation_expires_at <= now()
     or v_order.wallet_applied_ngn < v_order.subtotal_ngn + v_order.delivery_total_ngn then
    raise exception 'Wallet credit does not cover this order or its reservation expired.';
  end if;
  update public.orders set status = 'confirmed', payment_status = 'succeeded', amount_paid_ngn = 0, updated_at = now() where id = p_order_id;
  update public.order_deliveries set status = 'confirmed' where order_id = p_order_id;
  update public.wallet_credit_reservations set status = 'committed', updated_at = now() where order_id = p_order_id;
  return jsonb_build_object('confirmed', true, 'order_id', p_order_id);
end;
$$;

create or replace function public.update_customer_delivery_address(p_delivery_id uuid, p_address text, p_delivery_note text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_customer uuid := auth.uid();
begin
  if v_customer is null then raise exception 'Sign in to update a delivery.'; end if;
  if char_length(trim(coalesce(p_address, ''))) < 8 or char_length(trim(p_address)) > 300 or char_length(coalesce(p_delivery_note, '')) > 200 then
    raise exception 'Enter a valid address and delivery note.';
  end if;
  update public.order_deliveries d set address_text = trim(p_address), delivery_note = trim(coalesce(p_delivery_note, d.delivery_note))
    from public.orders o where d.id = p_delivery_id and d.order_id = o.id and o.customer_id = v_customer
      and o.payment_status = 'succeeded' and o.status = 'confirmed' and d.status = 'confirmed' and d.cutoff_at > now();
  if not found then raise exception 'This delivery can no longer be changed.'; end if;
end;
$$;

create or replace function public.request_customer_delivery_cancellation(p_delivery_id uuid, p_refund_method text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := auth.uid(); v_order public.orders%rowtype; v_delivery public.order_deliveries%rowtype;
  v_refund public.customer_delivery_refunds%rowtype; v_total integer; v_wallet integer; v_cash integer; v_refund_id uuid;
begin
  if v_customer is null then raise exception 'Sign in to cancel a delivery.'; end if;
  if p_refund_method is null or p_refund_method not in ('wallet', 'original') then raise exception 'Choose a refund destination.'; end if;
  perform 1 from public.profiles where id = v_customer for update;
  select o.* into v_order from public.orders o join public.order_deliveries d on d.order_id = o.id
    where d.id = p_delivery_id and o.customer_id = v_customer for update of o;
  if not found then raise exception 'We could not find this delivery.'; end if;
  select * into v_delivery from public.order_deliveries where id = p_delivery_id for update;
  select * into v_refund from public.customer_delivery_refunds where delivery_id = p_delivery_id;
  if found then return jsonb_build_object('refund_id', v_refund.id, 'refund_status', v_refund.status,
      'wallet_refund_ngn', v_refund.wallet_refund_ngn, 'cash_refund_ngn', v_refund.cash_refund_ngn,
      'paystack_transaction_id', v_order.paystack_transaction_id); end if;
  if v_order.payment_status <> 'succeeded' or v_order.status <> 'confirmed' or v_delivery.status <> 'confirmed' or v_delivery.cutoff_at <= now() then
    raise exception 'This delivery is past its cutoff or is no longer cancellable.';
  end if;
  select (coalesce(sum(i.base_price_ngn + i.protein_price_ngn + coalesce((
      select sum((x ->> 'price_ngn')::integer * (x ->> 'quantity')::integer) from jsonb_array_elements(i.extras_snapshot) x), 0)), 0)
      + v_delivery.area_fee_ngn)::integer into v_total from public.order_items i where i.delivery_id = p_delivery_id;
  if v_total <= 0 then raise exception 'We could not calculate this delivery refund.'; end if;
  v_wallet := case when p_refund_method = 'wallet' then v_total else least(v_total, v_delivery.wallet_applied_ngn) end;
  v_cash := v_total - v_wallet;
  if v_cash > 0 and v_order.paystack_transaction_id is null then raise exception 'The original payment cannot be refunded automatically. Choose wallet credit.'; end if;
  insert into public.customer_delivery_refunds(delivery_id, order_id, customer_id, method, total_ngn, wallet_refund_ngn, cash_refund_ngn, status)
    values (p_delivery_id, v_order.id, v_customer, p_refund_method, v_total, v_wallet, v_cash, case when v_cash = 0 then 'processed' else 'pending' end)
    returning id into v_refund_id;
  if v_wallet > 0 then
    insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
      values (v_customer, v_order.id, 'refund', v_wallet, case when p_refund_method = 'wallet' then 'Delivery cancellation refund to wallet' else 'Wallet-paid portion returned after delivery cancellation' end);
  end if;
  update public.order_deliveries set status = 'cancelled' where id = p_delivery_id;
  if not exists (select 1 from public.order_deliveries where order_id = v_order.id and status <> 'cancelled') then
    update public.orders set status = 'cancelled', updated_at = now() where id = v_order.id;
  end if;
  return jsonb_build_object('refund_id', v_refund_id, 'refund_status', case when v_cash = 0 then 'processed' else 'pending' end,
      'wallet_refund_ngn', v_wallet, 'cash_refund_ngn', v_cash, 'paystack_transaction_id', v_order.paystack_transaction_id);
end;
$$;

create or replace function public.claim_customer_delivery_refund(p_refund_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_customer uuid := auth.uid();
begin
  if v_customer is null then raise exception 'Sign in to process this refund.'; end if;
  update public.customer_delivery_refunds set status = 'processing', updated_at = now()
    where id = p_refund_id and customer_id = v_customer and cash_refund_ngn > 0 and status in ('pending', 'failed');
  return found;
end;
$$;

create or replace function public.finish_customer_delivery_refund(p_refund_id uuid, p_provider_id bigint, p_result text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := auth.uid(); v_refund public.customer_delivery_refunds%rowtype;
  v_total_refunded integer; v_amount_paid integer;
begin
  if v_customer is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized.'; end if;
  select * into v_refund from public.customer_delivery_refunds where id = p_refund_id for update;
  if not found or (v_customer is not null and v_refund.customer_id <> v_customer) then raise exception 'Refund not found.'; end if;
  if p_result not in ('accepted', 'processing', 'processed', 'failed') then raise exception 'Invalid refund state.'; end if;
  update public.customer_delivery_refunds set status = p_result, paystack_refund_id = coalesce(p_provider_id, paystack_refund_id), updated_at = now() where id = p_refund_id;
  if p_result = 'processed' then
    select coalesce(sum(cash_refund_ngn), 0)::integer into v_total_refunded from public.customer_delivery_refunds where order_id = v_refund.order_id and status = 'processed';
    select amount_paid_ngn into v_amount_paid from public.orders where id = v_refund.order_id;
    update public.orders set payment_status = case when v_total_refunded >= v_amount_paid then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end, updated_at = now() where id = v_refund.order_id;
  end if;
end;
$$;

revoke all on function public.release_expired_customer_wallet_credits() from public, anon;
revoke all on function public.apply_customer_wallet_credit(uuid) from public, anon;
revoke all on function public.complete_customer_wallet_order(uuid) from public, anon;
revoke all on function public.update_customer_delivery_address(uuid, text, text) from public, anon;
revoke all on function public.request_customer_delivery_cancellation(uuid, text) from public, anon;
revoke all on function public.claim_customer_delivery_refund(uuid) from public, anon;
revoke all on function public.finish_customer_delivery_refund(uuid, bigint, text) from public, anon;
grant execute on function public.release_expired_customer_wallet_credits() to authenticated;
grant execute on function public.apply_customer_wallet_credit(uuid) to authenticated;
grant execute on function public.complete_customer_wallet_order(uuid) to authenticated;
grant execute on function public.update_customer_delivery_address(uuid, text, text) to authenticated;
grant execute on function public.request_customer_delivery_cancellation(uuid, text) to authenticated;
grant execute on function public.claim_customer_delivery_refund(uuid) to authenticated;
grant execute on function public.finish_customer_delivery_refund(uuid, bigint, text) to authenticated, service_role;

-- Include paid deliveries and live payment holds in the public portion count.
-- Cancelled deliveries release their meal portions even if other deliveries remain active.
create or replace function public.get_customer_menu(p_service_date date, p_days integer default 7)
returns table (
  service_date date,
  "window" public.meal_window,
  meal_id uuid,
  slug text,
  name text,
  description text,
  base_price_ngn integer,
  image_url text,
  allergen_note text,
  stock_limit integer,
  stock_remaining integer,
  proteins jsonb,
  extras jsonb,
  batches jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select pool.service_date, w."window", m.id, m.slug, m.name, m.description, m.base_price_ngn,
         m.image_url, m.allergen_note, pool.portion_limit,
         greatest(0, pool.portion_limit - coalesce(sold.portions, 0))::integer,
         coalesce(proteins.items, '[]'::jsonb), coalesce(extras.items, '[]'::jsonb), batches.items
  from public.meal_stock_pools pool
  join public.meals m on m.id = pool.meal_id and m.active
  join (
    select distinct bm.stock_pool_id, b.window_id
    from public.batch_menu_items bm
    join public.delivery_batches b on b.id = bm.batch_id and b.active
    join public.delivery_windows dw on dw.id = b.window_id and dw.active
    where bm.active
  ) available on available.stock_pool_id = pool.id
  join public.delivery_windows w on w.id = available.window_id and w.active
  left join lateral (
    select count(*)::integer as portions
    from public.order_items oi
    join public.order_deliveries od on od.id = oi.delivery_id
    join public.orders o on o.id = od.order_id
    where oi.stock_pool_id = pool.id and od.status <> 'cancelled'
      and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
        or (o.status = 'pending_payment' and o.reservation_expires_at > now()))
  ) sold on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'price_ngn', a.price_ngn, 'stock_limit', a.stock_limit) order by a.name) as items
    from public.meal_proteins mp join public.add_on_catalog a on a.id = mp.addon_id and a.active
    where mp.meal_id = m.id and mp.active
  ) proteins on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'price_ngn', a.price_ngn, 'category', a.category, 'stock_limit', a.stock_limit) order by a.name) as items
    from public.meal_extras me join public.add_on_catalog a on a.id = me.addon_id and a.active
    where me.meal_id = m.id and me.active
  ) extras on true
  join lateral (
    select jsonb_agg(jsonb_build_object('id', batch.id, 'name', batch.name,
      'starts_at', batch.delivery_starts_at, 'ends_at', batch.delivery_ends_at, 'cutoff', batch.cutoff_time)
      order by batch.delivery_starts_at) as items
    from public.batch_menu_items bm
    join public.delivery_batches batch on batch.id = bm.batch_id and batch.active
    where bm.stock_pool_id = pool.id and bm.active and batch.window_id = w.id
  ) batches on batches.items is not null
  where pool.service_date >= p_service_date
    and pool.service_date < p_service_date + least(greatest(p_days, 1), 14)
  order by pool.service_date, w."window", m.name;
$$;
grant execute on function public.get_customer_menu(date, integer) to anon, authenticated;


-- Re-check stock without counting deliveries already cancelled before cutoff.
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
  v_normalized_delivery jsonb;
  v_date date;
  v_cutoff_at timestamptz;
  v_address text;
  v_note text;
  v_batch_id uuid;
  v_area_id uuid;
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
  v_requested integer;
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
    v_area_id := (v_delivery ->> 'area_id')::uuid;
    v_address := trim(coalesce(v_delivery ->> 'address', ''));
    v_note := trim(coalesce(v_delivery ->> 'delivery_note', ''));

    if char_length(v_address) < 8 or char_length(v_address) > 300 then
      raise exception 'Enter an address between 8 and 300 characters.';
    end if;
    if char_length(v_note) > 200 then
      raise exception 'Delivery notes must be 200 characters or fewer.';
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

    select a.id, a.name, a.fee_ngn into v_area
      from public.delivery_areas a where a.id = v_area_id and a.active;
    if not found then
      raise exception 'One of the selected delivery areas is no longer available.';
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
        raise exception 'Meal extras were not sent in the expected format.';
      end if;
      for v_extra in select value from jsonb_array_elements(coalesce(v_item -> 'extras', '[]'::jsonb))
      loop
        v_extra_slug := trim(coalesce(v_extra ->> 'slug', ''));
        v_quantity := (v_extra ->> 'quantity')::integer;
        if v_quantity is null or v_quantity < 1 or v_quantity > 20 then
          raise exception 'Choose between 1 and 20 of each extra.';
        end if;
        select a.id, a.slug, a.name, a.price_ngn into v_addon
          from public.meal_extras me
          join public.add_on_catalog a on a.id = me.addon_id and a.active
         where me.meal_id = v_meal.id and me.active and a.slug = v_extra_slug;
        if not found then
          raise exception 'A selected extra is not available with that meal.';
        end if;
        v_extras := v_extras || jsonb_build_array(jsonb_build_object(
          'addon_id', v_addon.id, 'slug', v_addon.slug, 'name', v_addon.name,
          'price_ngn', v_addon.price_ngn, 'quantity', v_quantity
        ));
        v_line_total := v_line_total + (v_addon.price_ngn * v_quantity);
      end loop;

      v_normalized_item := jsonb_set(v_normalized_item, '{extras_snapshot}', v_extras);
      v_normalized_item := jsonb_set(v_normalized_item, '{line_total_ngn}', to_jsonb(v_line_total));
      v_items := v_items || jsonb_build_array(v_normalized_item);
      v_food_total := v_food_total + v_line_total;
      v_order_item_count := v_order_item_count + 1;
    end loop;

    v_delivery_total := v_delivery_total + v_area.fee_ngn;
    v_deliveries := v_deliveries || jsonb_build_array(jsonb_build_object(
      'service_date', v_date, 'batch_id', v_batch.id,
      'window', v_batch.meal_window, 'batch_name', v_batch.name,
      'delivery_starts_at', v_batch.delivery_starts_at,
      'delivery_ends_at', v_batch.delivery_ends_at,
      'cutoff_at', v_cutoff_at, 'area_name', v_area.name,
      'area_fee_ngn', v_area.fee_ngn, 'address_text', v_address,
      'delivery_note', v_note, 'items', v_items
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
    select count(*)::integer into v_existing
      from public.order_items oi
      join public.order_deliveries od on od.id = oi.delivery_id
      join public.orders o on o.id = od.order_id
     where oi.stock_pool_id = v_stock.id
       and od.status <> 'cancelled'
       and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
            or (o.status = 'pending_payment' and o.reservation_expires_at > now()));
    if v_existing + v_stock.requested > v_stock.portion_limit then
      raise exception 'A meal just sold out. Please update your basket and try again.';
    end if;
  end loop;

  for v_stock in
    with requested as (
      select (i ->> 'protein_addon_id')::uuid as addon_id, count(*)::integer as quantity
        from jsonb_array_elements(v_deliveries) d
        cross join lateral jsonb_array_elements(d -> 'items') i
       where nullif(i ->> 'protein_addon_id', '') is not null
       group by (i ->> 'protein_addon_id')::uuid
      union all
      select (x ->> 'addon_id')::uuid, sum((x ->> 'quantity')::integer)::integer
        from jsonb_array_elements(v_deliveries) d
        cross join lateral jsonb_array_elements(d -> 'items') i
        cross join lateral jsonb_array_elements(i -> 'extras_snapshot') x
       group by (x ->> 'addon_id')::uuid
    )
    select a.id, a.stock_limit, sum(r.quantity)::integer as requested
      from requested r join public.add_on_catalog a on a.id = r.addon_id
     group by a.id, a.stock_limit
  loop
    select (
      (select count(*)::integer
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
      address_label, address_text, delivery_note, cutoff_at, status
    ) values (
      v_order_id, (v_delivery ->> 'batch_id')::uuid,
      (v_delivery ->> 'service_date')::date, v_delivery ->> 'area_name',
      (v_delivery ->> 'area_fee_ngn')::integer, 'Delivery address',
      v_delivery ->> 'address_text', v_delivery ->> 'delivery_note',
      (v_delivery ->> 'cutoff_at')::timestamptz, 'pending_payment'
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
revoke all on function public.create_customer_checkout(jsonb) from public, anon;
grant execute on function public.create_customer_checkout(jsonb) to authenticated;
