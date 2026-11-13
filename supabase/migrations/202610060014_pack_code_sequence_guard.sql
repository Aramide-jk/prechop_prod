-- Prevent duplicate sequence burn on plate_sticker_ids when preparation begins,
-- and allocate sequential pack codes (1001, 1002, 1003...) deterministically
-- per individual plate in order of delivery/item creation.

create or replace function public.allocate_delivery_plate_stickers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('preparing', 'out_for_delivery', 'delivered')
     and old.status is distinct from new.status then
    insert into public.plate_stickers (order_item_id)
    select oi.id
    from public.order_items as oi
    where oi.delivery_id = new.id
      and not exists (
        select 1 from public.plate_stickers as ps where ps.order_item_id = oi.id
      )
    order by oi.created_at asc, oi.id asc
    on conflict (order_item_id) do nothing;
  end if;

  return new;
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
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Not authorized to update deliveries.' using errcode = '42501';
  end if;

  update public.order_deliveries d
     set status = 'preparing'
    from public.orders o
   where d.order_id = o.id
     and o.payment_status = 'succeeded'
     and d.batch_id = p_batch_id
     and d.service_date = v_today
     and d.status = 'confirmed';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'There are no confirmed deliveries in this batch to prepare.';
  end if;

  -- Trigger allocate_delivery_plate_stickers already handles new inserts when
  -- status moves to 'preparing'; guard with NOT EXISTS so no sequence values
  -- are burned by duplicate ON CONFLICT checks.
  insert into public.plate_stickers (order_item_id)
  select oi.id
    from public.order_items oi
    join public.order_deliveries d on d.id = oi.delivery_id
    join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
   where d.batch_id = p_batch_id
     and d.service_date = v_today
     and d.status = 'preparing'
     and not exists (
       select 1 from public.plate_stickers ps where ps.order_item_id = oi.id
     )
   order by d.created_at asc, oi.created_at asc, oi.id asc
  on conflict (order_item_id) do nothing;

  return v_count;
end;
$$;

revoke all on function public.allocate_delivery_plate_stickers() from public, anon, authenticated;
revoke all on function public.admin_start_delivery_batch(uuid) from public, anon;
grant execute on function public.admin_start_delivery_batch(uuid) to authenticated;

notify pgrst, 'reload schema';
