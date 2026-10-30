-- Make the admin preparation action assign preprinted plate sticker codes
-- itself, and repair any deliveries that were already being prepared.

insert into public.plate_stickers (order_item_id)
select oi.id
  from public.order_items oi
  join public.order_deliveries d on d.id = oi.delivery_id
  join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
 where d.status in ('preparing', 'out_for_delivery', 'delivered')
on conflict (order_item_id) do nothing;

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

  -- The trigger also attempts this insert when installed. The unique
  -- order_item_id and ON CONFLICT make the explicit insert safe either way.
  insert into public.plate_stickers (order_item_id)
  select oi.id
    from public.order_items oi
    join public.order_deliveries d on d.id = oi.delivery_id
    join public.orders o on o.id = d.order_id and o.payment_status = 'succeeded'
   where d.batch_id = p_batch_id
     and d.service_date = v_today
     and d.status = 'preparing'
  on conflict (order_item_id) do nothing;

  return v_count;
end;
$$;

revoke all on function public.admin_start_delivery_batch(uuid) from public, anon;
grant execute on function public.admin_start_delivery_batch(uuid) to authenticated;

notify pgrst, 'reload schema';
