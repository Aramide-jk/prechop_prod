-- Safely request a full Paystack refund when a successful payment arrives after
-- its short-lived meal reservation has expired.
alter table public.orders
  add column if not exists paystack_refund_status text not null default 'none'
    check (paystack_refund_status in ('none', 'pending', 'accepted', 'processed', 'failed'));

create or replace function public.prepare_late_paystack_refund(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_expected_kobo bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to prepare a payment refund.';
  end if;
  select * into v_order from public.orders where payment_reference = p_reference for update;
  if not found then raise exception 'No order matches this payment reference.'; end if;
  v_expected_kobo := (v_order.subtotal_ngn + v_order.delivery_total_ngn - v_order.wallet_applied_ngn)::bigint * 100;
  if upper(coalesce(p_currency, '')) <> 'NGN'
     or p_amount_kobo <> v_expected_kobo
     or p_amount_kobo <= 0
     or p_transaction_id is null or p_transaction_id = '' then
    raise exception 'Paystack payment details do not match this order.';
  end if;
  if v_order.payment_status = 'succeeded' then
    return jsonb_build_object('should_refund', false, 'already_confirmed', true, 'refund_status', v_order.paystack_refund_status);
  end if;
  if v_order.paystack_refund_status in ('pending', 'accepted', 'processed') then
    return jsonb_build_object('should_refund', false, 'already_confirmed', false, 'refund_status', v_order.paystack_refund_status);
  end if;
  if v_order.status <> 'pending_payment'
     or v_order.reservation_expires_at is null
     or v_order.reservation_expires_at > now() then
    raise exception 'Payment could not be confirmed and is not eligible for an automatic late refund.';
  end if;

  update public.orders
     set status = 'cancelled', paystack_refund_status = 'pending',
         paystack_transaction_id = p_transaction_id, updated_at = now()
   where id = v_order.id;
  update public.order_deliveries set status = 'cancelled' where order_id = v_order.id;
  return jsonb_build_object('should_refund', true, 'already_confirmed', false, 'refund_status', 'pending');
end;
$$;

create or replace function public.finish_late_paystack_refund(p_reference text, p_result text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to update a payment refund.';
  end if;
  if p_result not in ('accepted', 'processed', 'failed') then raise exception 'Invalid refund result.'; end if;
  update public.orders
     set paystack_refund_status = p_result,
         payment_status = case when p_result = 'processed' then 'refunded'::public.payment_status else payment_status end,
         updated_at = now()
   where payment_reference = p_reference and paystack_refund_status in ('pending', 'accepted', 'failed');
  if not found then raise exception 'No pending refund matches this payment reference.'; end if;
end;
$$;

revoke all on function public.prepare_late_paystack_refund(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.finish_late_paystack_refund(text, text) from public, anon, authenticated;
grant execute on function public.prepare_late_paystack_refund(text, bigint, text, text) to service_role;
grant execute on function public.finish_late_paystack_refund(text, text) to service_role;
