-- Admin-only read model and batch delivery actions for the daily dashboard.

create or replace function public.get_admin_today_dashboard(p_batch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_batch_id uuid;
  v_active_deliveries integer := 0;
  v_plates_to_prepare integer := 0;
  v_refunds_to_review integer := 0;
  v_batches jsonb := '[]'::jsonb;
  v_deliveries jsonb := '[]'::jsonb;
  v_kitchen_totals jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Not authorized to view admin dashboard.' using errcode = '42501';
  end if;

  if p_batch_id is not null then
    select b.id into v_batch_id
      from public.delivery_batches b
      join public.delivery_windows w on w.id = b.window_id and w.active
     where b.id = p_batch_id and b.active;
    if v_batch_id is null then raise exception 'This delivery batch is no longer active.'; end if;
  else
    select b.id into v_batch_id
      from public.delivery_batches b
      join public.delivery_windows w on w.id = b.window_id and w.active
     where b.active
     order by
       case when exists (
         select 1 from public.order_deliveries d join public.orders o on o.id = d.order_id
          where d.batch_id = b.id and d.service_date = v_today
            and d.status = 'confirmed' and o.payment_status = 'succeeded'
       ) then 0 when exists (
         select 1 from public.order_deliveries d join public.orders o on o.id = d.order_id
          where d.batch_id = b.id and d.service_date = v_today
            and d.status in ('preparing', 'out_for_delivery') and o.payment_status = 'succeeded'
       ) then 1 else 2 end,
       b.delivery_starts_at
     limit 1;
  end if;

  select count(distinct d.id)::integer,
         count(oi.id) filter (where d.status = 'confirmed')::integer
    into v_active_deliveries, v_plates_to_prepare
    from public.order_deliveries d
    join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
    left join public.order_items oi on oi.delivery_id = d.id
   where d.service_date = v_today
     and d.status in ('confirmed', 'preparing', 'out_for_delivery');

  select count(*)::integer into v_refunds_to_review
    from public.customer_delivery_refunds r
   where r.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'name', b.name,
           'window', w."window",
           'starts_at', b.delivery_starts_at,
           'ends_at', b.delivery_ends_at,
           'cutoff', b.cutoff_time,
           'deliveries', stats.delivery_count,
           'plates', stats.plate_count,
           'confirmed', stats.confirmed_count,
           'preparing', stats.preparing_count,
           'out_for_delivery', stats.out_count,
           'delivered', stats.delivered_count,
           'status', case
             when stats.delivery_count = 0 and ((v_today + b.cutoff_time) at time zone 'Africa/Lagos') > now() then 'orders_open'
             when stats.delivery_count = 0 then 'no_orders'
             when stats.delivered_count = stats.delivery_count then 'delivered'
             when stats.out_count > 0 then 'out_for_delivery'
             when stats.preparing_count > 0 then 'preparing'
             when stats.confirmed_count > 0 then 'ready_to_prepare'
             else 'delivered'
           end
         ) order by b.delivery_starts_at), '[]'::jsonb)
    into v_batches
    from public.delivery_batches b
    join public.delivery_windows w on w.id = b.window_id and w.active
    cross join lateral (
      select count(*)::integer as delivery_count,
             coalesce(sum((select count(*) from public.order_items oi where oi.delivery_id = d.id)), 0)::integer as plate_count,
             count(*) filter (where d.status = 'confirmed')::integer as confirmed_count,
             count(*) filter (where d.status = 'preparing')::integer as preparing_count,
             count(*) filter (where d.status = 'out_for_delivery')::integer as out_count,
             count(*) filter (where d.status = 'delivered')::integer as delivered_count
        from public.order_deliveries d
        join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
       where d.batch_id = b.id and d.service_date = v_today and d.status <> 'cancelled'
    ) stats
   where b.active;

  if v_batch_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'customer_name', p.full_name,
             'phone', p.phone_e164,
             'address', d.address_text,
             'area', d.area_name,
             'status', d.status,
             'plates', coalesce((
               select jsonb_agg(jsonb_build_object(
                 'sticker_id', ps.sticker_id,
                 'meal', oi.meal_name,
                 'protein', oi.protein_name,
                 'extras', oi.extras_snapshot
               ) order by oi.created_at, oi.id)
                 from public.order_items oi
                 left join public.plate_stickers ps on ps.order_item_id = oi.id
                where oi.delivery_id = d.id
             ), '[]'::jsonb)
           ) order by d.created_at), '[]'::jsonb)
      into v_deliveries
      from public.order_deliveries d
      join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
      join public.profiles p on p.id = o.customer_id
     where d.batch_id = v_batch_id and d.service_date = v_today and d.status <> 'cancelled';

    select coalesce(jsonb_agg(jsonb_build_object('name', totals.item_name, 'kind', totals.kind, 'quantity', totals.quantity)
                              order by case totals.kind when 'Meal' then 0 when 'Protein' then 1 else 2 end, totals.item_name), '[]'::jsonb)
      into v_kitchen_totals
      from (
        select oi.meal_name as item_name, 'Meal'::text as kind, count(*)::integer as quantity
          from public.order_items oi
          join public.order_deliveries d on d.id = oi.delivery_id
          join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
         where d.batch_id = v_batch_id and d.service_date = v_today and d.status <> 'cancelled'
         group by oi.meal_name
        union all
        select oi.protein_name, 'Protein'::text, count(*)::integer
          from public.order_items oi
          join public.order_deliveries d on d.id = oi.delivery_id
          join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
         where d.batch_id = v_batch_id and d.service_date = v_today and d.status <> 'cancelled'
           and oi.protein_name is not null
         group by oi.protein_name
        union all
        select x.value ->> 'name', 'Extra'::text, sum((x.value ->> 'quantity')::integer)::integer
          from public.order_items oi
          join public.order_deliveries d on d.id = oi.delivery_id
          join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
          cross join lateral jsonb_array_elements(oi.extras_snapshot) as x(value)
         where d.batch_id = v_batch_id and d.service_date = v_today and d.status <> 'cancelled'
         group by x.value ->> 'name'
      ) totals;
  end if;

  return jsonb_build_object(
    'service_date', v_today,
    'active_deliveries', v_active_deliveries,
    'plates_to_prepare', v_plates_to_prepare,
    'refunds_to_review', v_refunds_to_review,
    'batches', v_batches,
    'selected_batch_id', v_batch_id,
    'deliveries', v_deliveries,
    'kitchen_totals', v_kitchen_totals
  );
end;
$$;

create or replace function public.admin_start_delivery_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to update deliveries.' using errcode = '42501';
  end if;
  update public.order_deliveries d
     set status = 'preparing'
    from public.orders o
   where d.order_id = o.id and o.payment_status = 'succeeded'
     and d.batch_id = p_batch_id and d.service_date = v_today and d.status = 'confirmed';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'There are no confirmed deliveries in this batch to prepare.'; end if;
  return v_count;
end;
$$;

create or replace function public.admin_dispatch_delivery_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to update deliveries.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.order_deliveries d join public.orders o on o.id = d.order_id
     where d.batch_id = p_batch_id and d.service_date = v_today
       and o.payment_status = 'succeeded' and d.status = 'confirmed'
  ) then
    raise exception 'Start preparing every confirmed delivery before dispatching the batch.';
  end if;
  update public.order_deliveries d
     set status = 'out_for_delivery'
    from public.orders o
   where d.order_id = o.id and o.payment_status = 'succeeded'
     and d.batch_id = p_batch_id and d.service_date = v_today and d.status = 'preparing';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'There are no prepared deliveries ready for dispatch.'; end if;
  return v_count;
end;
$$;

create or replace function public.admin_mark_delivery_delivered(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to update deliveries.' using errcode = '42501';
  end if;
  update public.order_deliveries d
     set status = 'delivered'
    from public.orders o
   where d.order_id = o.id and o.payment_status = 'succeeded'
     and d.id = p_delivery_id and d.status = 'out_for_delivery';
  if not found then raise exception 'This delivery is not marked out for delivery.'; end if;
end;
$$;

revoke all on function public.get_admin_today_dashboard(uuid) from public, anon;
revoke all on function public.admin_start_delivery_batch(uuid) from public, anon;
revoke all on function public.admin_dispatch_delivery_batch(uuid) from public, anon;
revoke all on function public.admin_mark_delivery_delivered(uuid) from public, anon;
grant execute on function public.get_admin_today_dashboard(uuid) to authenticated;
grant execute on function public.admin_start_delivery_batch(uuid) to authenticated;
grant execute on function public.admin_dispatch_delivery_batch(uuid) to authenticated;
grant execute on function public.admin_mark_delivery_delivered(uuid) to authenticated;

notify pgrst, 'reload schema';
