-- Allow customers to cleanly cancel unpaid / pending_payment reservations without error
create or replace function public.request_customer_delivery_cancellation(p_delivery_id uuid, p_refund_method text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_order public.orders%rowtype;
  v_delivery public.order_deliveries%rowtype;
  v_refund public.customer_delivery_refunds%rowtype;
  v_total integer;
  v_wallet integer;
  v_cash integer;
  v_refund_id uuid;
begin
  if v_customer is null then
    raise exception 'Sign in to cancel a delivery.';
  end if;
  if p_refund_method is null or p_refund_method not in ('wallet', 'original') then
    raise exception 'Choose a refund destination.';
  end if;

  perform 1 from public.profiles where id = v_customer for update;
  select o.* into v_order
    from public.orders o
    join public.order_deliveries d on d.order_id = o.id
   where d.id = p_delivery_id and o.customer_id = v_customer
     for update of o;
  if not found then
    raise exception 'We could not find this delivery.';
  end if;

  select * into v_delivery
    from public.order_deliveries
   where id = p_delivery_id
     for update;

  select * into v_refund
    from public.customer_delivery_refunds
   where delivery_id = p_delivery_id;
  if found then
    return jsonb_build_object(
      'refund_id', v_refund.id,
      'refund_status', v_refund.status,
      'wallet_refund_ngn', v_refund.wallet_refund_ngn,
      'cash_refund_ngn', v_refund.cash_refund_ngn,
      'paystack_transaction_id', v_order.paystack_transaction_id
    );
  end if;

  -- If the order is pending payment, cancel it cleanly without refund logic
  if v_order.status = 'pending_payment' or v_delivery.status = 'pending_payment' then
    update public.order_deliveries set status = 'cancelled' where id = p_delivery_id;
    if not exists (select 1 from public.order_deliveries where order_id = v_order.id and status <> 'cancelled') then
      update public.orders set status = 'cancelled', updated_at = now() where id = v_order.id;
    end if;
    return jsonb_build_object(
      'refund_id', null,
      'refund_status', 'none',
      'wallet_refund_ngn', 0,
      'cash_refund_ngn', 0,
      'paystack_transaction_id', null
    );
  end if;

  if v_order.payment_status <> 'succeeded' or v_order.status <> 'confirmed' or v_delivery.status <> 'confirmed' or v_delivery.cutoff_at <= now() then
    raise exception 'This delivery is past its cutoff or is no longer cancellable.';
  end if;

  select (coalesce(sum(i.base_price_ngn + i.protein_price_ngn + coalesce((
      select sum((x ->> 'price_ngn')::integer * (x ->> 'quantity')::integer) from jsonb_array_elements(i.extras_snapshot) x), 0)), 0)
      + v_delivery.area_fee_ngn)::integer into v_total
    from public.order_items i
   where i.delivery_id = p_delivery_id;
  if v_total <= 0 then
    raise exception 'We could not calculate this delivery refund.';
  end if;

  v_wallet := case when p_refund_method = 'wallet' then v_total else least(v_total, v_delivery.wallet_applied_ngn) end;
  v_cash := v_total - v_wallet;
  if v_cash > 0 and v_order.paystack_transaction_id is null then
    raise exception 'The original payment cannot be refunded automatically. Choose wallet credit.';
  end if;

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

  return jsonb_build_object(
    'refund_id', v_refund_id,
    'refund_status', case when v_cash = 0 then 'processed' else 'pending' end,
    'wallet_refund_ngn', v_wallet,
    'cash_refund_ngn', v_cash,
    'paystack_transaction_id', v_order.paystack_transaction_id
  );
end;
$$;

revoke all on function public.request_customer_delivery_cancellation(uuid, text) from public, anon;
grant execute on function public.request_customer_delivery_cancellation(uuid, text) to authenticated;
