-- Comprehensive Admin Operations, Order Status Synchronization, and Support Settings

-- 1. Extend Settings with WhatsApp, Support Email, and Operational Notice
alter table public.referral_campaign_settings
  add column if not exists whatsapp_number text not null default '+2348031234567',
  add column if not exists support_email text not null default 'support@prechop.com',
  add column if not exists announcement_banner text not null default '',
  add column if not exists service_active boolean not null default true,
  add column if not exists service_paused_message text not null default '';

-- 2. Automatic Parent Order Status Synchronization
create or replace function public.sync_order_status_from_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_total integer;
  v_delivered integer;
  v_cancelled integer;
  v_out_for_delivery integer;
  v_preparing integer;
  v_confirmed integer;
  v_target_status public.order_status;
  v_current_status public.order_status;
begin
  if v_order_id is null then
    return coalesce(new, old);
  end if;

  select status into v_current_status from public.orders where id = v_order_id;
  if not found or v_current_status = 'pending_payment' then
    return coalesce(new, old);
  end if;

  select count(*),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'out_for_delivery'),
         count(*) filter (where status = 'preparing'),
         count(*) filter (where status = 'confirmed')
    into v_total, v_delivered, v_cancelled, v_out_for_delivery, v_preparing, v_confirmed
    from public.order_deliveries
   where order_id = v_order_id;

  if v_total > 0 then
    if v_cancelled = v_total then
      v_target_status := 'cancelled';
    elsif v_delivered + v_cancelled = v_total and v_delivered > 0 then
      v_target_status := 'delivered';
    elsif v_out_for_delivery > 0 then
      v_target_status := 'out_for_delivery';
    elsif v_preparing > 0 then
      v_target_status := 'preparing';
    else
      v_target_status := 'confirmed';
    end if;

    if v_target_status is distinct from v_current_status then
      update public.orders
         set status = v_target_status, updated_at = now()
       where id = v_order_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_order_delivery_status_sync on public.order_deliveries;
create trigger on_order_delivery_status_sync
after insert or update of status or delete on public.order_deliveries
for each row execute function public.sync_order_status_from_deliveries();

-- 3. Admin Delivery Cancellation
create or replace function public.admin_cancel_delivery(
  p_delivery_id uuid,
  p_refund_method text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.order_deliveries%rowtype;
  v_order public.orders%rowtype;
  v_refund_id uuid;
  v_total_due integer;
  v_wallet_refund integer := 0;
  v_cash_refund integer := 0;
  v_plate_total integer := 0;
  v_refund_status text := 'pending';
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to cancel deliveries.' using errcode = '42501';
  end if;

  if p_refund_method not in ('wallet', 'original') then
    raise exception 'Invalid refund method.';
  end if;

  select * into v_delivery from public.order_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found.'; end if;
  if v_delivery.status in ('delivered', 'cancelled') then
    raise exception 'This delivery is already %.', v_delivery.status;
  end if;

  select * into v_order from public.orders where id = v_delivery.order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  select coalesce(sum(oi.base_price_ngn + oi.protein_price_ngn +
         coalesce((select sum((extra->>'price_ngn')::integer * (extra->>'quantity')::integer)
           from jsonb_array_elements(oi.extras_snapshot) as extra), 0)), 0)
    into v_plate_total
    from public.order_items oi
   where oi.delivery_id = v_delivery.id;

  v_total_due := v_plate_total + v_delivery.area_fee_ngn;

  if p_refund_method = 'wallet' then
    v_wallet_refund := v_total_due;
    v_cash_refund := 0;
    v_refund_status := 'processed';

    insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
    values (v_order.customer_id, v_order.id, 'refund', v_wallet_refund,
      case when p_reason <> '' then 'Admin cancelled delivery refund: ' || p_reason
           else 'Refund for cancelled delivery on ' || v_delivery.service_date::text end);
  else
    if v_delivery.wallet_applied_ngn > 0 then
      v_wallet_refund := least(v_delivery.wallet_applied_ngn, v_total_due);
      v_cash_refund := v_total_due - v_wallet_refund;
      if v_wallet_refund > 0 then
        insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
        values (v_order.customer_id, v_order.id, 'refund', v_wallet_refund,
          'Wallet credit returned for cancelled delivery on ' || v_delivery.service_date::text);
      end if;
    else
      v_cash_refund := v_total_due;
    end if;
    v_refund_status := case when v_cash_refund > 0 then 'pending' else 'processed' end;
  end if;

  update public.order_deliveries
     set status = 'cancelled'
   where id = v_delivery.id;

  insert into public.customer_delivery_refunds (
    delivery_id, order_id, customer_id, method, total_ngn, wallet_refund_ngn, cash_refund_ngn, status
  ) values (
    v_delivery.id, v_order.id, v_order.customer_id, p_refund_method, v_total_due, v_wallet_refund, v_cash_refund, v_refund_status
  )
  on conflict (delivery_id) do update set
    status = excluded.status,
    total_ngn = excluded.total_ngn,
    wallet_refund_ngn = excluded.wallet_refund_ngn,
    cash_refund_ngn = excluded.cash_refund_ngn,
    updated_at = now()
  returning id into v_refund_id;

  return jsonb_build_object(
    'cancelled', true,
    'refund_id', v_refund_id,
    'status', v_refund_status,
    'total_ngn', v_total_due,
    'wallet_refund_ngn', v_wallet_refund,
    'cash_refund_ngn', v_cash_refund
  );
end;
$$;

-- 4. Admin Refund Resolution
create or replace function public.admin_resolve_delivery_refund(
  p_refund_id uuid,
  p_resolution text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.customer_delivery_refunds%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to resolve refunds.' using errcode = '42501';
  end if;

  select * into v_refund from public.customer_delivery_refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund request not found.'; end if;

  if p_resolution = 'wallet' then
    if v_refund.cash_refund_ngn > 0 and v_refund.status <> 'processed' then
      insert into public.wallet_entries(customer_id, order_id, kind, amount_ngn, description)
      values (v_refund.customer_id, v_refund.order_id, 'refund', v_refund.cash_refund_ngn,
        case when p_notes <> '' then 'Refund resolved to wallet credit: ' || p_notes
             else 'Delivery refund resolved to wallet credit' end);
      
      update public.customer_delivery_refunds
         set status = 'processed',
             wallet_refund_ngn = wallet_refund_ngn + cash_refund_ngn,
             cash_refund_ngn = 0,
             updated_at = now()
       where id = p_refund_id;
    else
      update public.customer_delivery_refunds
         set status = 'processed',
             updated_at = now()
       where id = p_refund_id;
    end if;
  elsif p_resolution = 'offline_paid' then
    update public.customer_delivery_refunds
       set status = 'processed',
           updated_at = now()
     where id = p_refund_id;
  elsif p_resolution = 'failed' then
    update public.customer_delivery_refunds
       set status = 'failed',
           updated_at = now()
     where id = p_refund_id;
  else
    raise exception 'Invalid refund resolution.';
  end if;

  return jsonb_build_object('resolved', true, 'status', 'processed');
end;
$$;

-- 5. Admin Menu Unposting
create or replace function public.admin_unpost_menu_meal(
  p_stock_pool_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'Not authorized to unpost meals.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.order_items oi
    join public.order_deliveries od on od.id = oi.delivery_id
    join public.orders o on o.id = od.order_id
    where oi.stock_pool_id = p_stock_pool_id
      and o.payment_status = 'succeeded'
      and od.status <> 'cancelled'
  ) then
    raise exception 'Cannot remove this meal because active paid orders exist for this date.';
  end if;

  delete from public.batch_menu_items where stock_pool_id = p_stock_pool_id;
  delete from public.meal_stock_pools where id = p_stock_pool_id;
  return true;
end;
$$;

revoke all on function public.admin_cancel_delivery(uuid, text, text) from public, anon;
revoke all on function public.admin_resolve_delivery_refund(uuid, text, text) from public, anon;
revoke all on function public.admin_unpost_menu_meal(uuid) from public, anon;
grant execute on function public.admin_cancel_delivery(uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_delivery_refund(uuid, text, text) to authenticated;
grant execute on function public.admin_unpost_menu_meal(uuid) to authenticated;

notify pgrst, 'reload schema';
