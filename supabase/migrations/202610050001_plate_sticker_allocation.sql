-- Allocate one pre-printed sticker ID per plate when the delivery enters
-- preparation. The sequence is defined in the customer core migration and
-- starts at 1001.

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
    on conflict (order_item_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.allocate_delivery_plate_stickers() from public, anon, authenticated;

drop trigger if exists allocate_delivery_plate_stickers_on_status_change
  on public.order_deliveries;

create trigger allocate_delivery_plate_stickers_on_status_change
after update of status on public.order_deliveries
for each row
when (old.status is distinct from new.status)
execute function public.allocate_delivery_plate_stickers();

-- Backfill any deliveries already being prepared when this migration runs.
insert into public.plate_stickers (order_item_id)
select oi.id
from public.order_items as oi
join public.order_deliveries as od on od.id = oi.delivery_id
where od.status in ('preparing', 'out_for_delivery', 'delivered')
on conflict (order_item_id) do nothing;

notify pgrst, 'reload schema';
