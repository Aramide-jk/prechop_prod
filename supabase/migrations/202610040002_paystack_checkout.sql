-- Paystack initialization and payment confirmation are always server-verified.
alter table public.orders
  add column if not exists payment_email text,
  add column if not exists paystack_authorization_url text,
  add column if not exists paystack_transaction_id text;

create or replace function public.start_customer_payment(
  p_order_id uuid,
  p_email text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Please sign in before paying.';
  end if;
  if v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$' then
    raise exception 'Enter a valid email address for your payment receipt.';
  end if;
  if p_reference !~ '^[A-Za-z0-9.=:-]{8,100}$' then
    raise exception 'Invalid payment reference.';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and customer_id = auth.uid()
   for update;
  if not found then raise exception 'We could not find this order.'; end if;
  if v_order.payment_status = 'succeeded' then
    raise exception 'This order has already been paid.';
  end if;
  if v_order.status <> 'pending_payment'
     or v_order.reservation_expires_at is null
     or v_order.reservation_expires_at <= now() then
    raise exception 'This reservation has expired. Please return to checkout and try again.';
  end if;

  if v_order.paystack_authorization_url is not null then
    return jsonb_build_object(
      'reference', v_order.payment_reference,
      'authorization_url', v_order.paystack_authorization_url,
      'total_ngn', v_order.subtotal_ngn + v_order.delivery_total_ngn - v_order.wallet_applied_ngn
    );
  end if;

  update public.orders
     set payment_reference = p_reference,
         payment_email = v_email,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'reference', p_reference,
    'authorization_url', null,
    'total_ngn', v_order.subtotal_ngn + v_order.delivery_total_ngn - v_order.wallet_applied_ngn
  );
end;
$$;

create or replace function public.save_customer_payment_url(
  p_order_id uuid,
  p_reference text,
  p_authorization_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Please sign in before paying.'; end if;
  if p_authorization_url !~ '^https://checkout\.paystack\.com/' then
    raise exception 'Invalid Paystack checkout link.';
  end if;
  update public.orders
     set paystack_authorization_url = p_authorization_url,
         updated_at = now()
   where id = p_order_id
     and customer_id = auth.uid()
     and payment_reference = p_reference
     and status = 'pending_payment'
     and payment_status = 'pending'
     and reservation_expires_at > now();
  if not found then raise exception 'This reservation expired before payment could start.'; end if;
end;
$$;

create or replace function public.confirm_paystack_payment(
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
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to confirm this payment.';
  end if;
  select * into v_order from public.orders
   where payment_reference = p_reference
   for update;
  if not found then raise exception 'No order matches this payment reference.'; end if;
  if auth.uid() is not null and v_order.customer_id <> auth.uid() then
    raise exception 'Not authorized to confirm this payment.';
  end if;

  v_expected_kobo := (v_order.subtotal_ngn + v_order.delivery_total_ngn - v_order.wallet_applied_ngn)::bigint * 100;
  if upper(coalesce(p_currency, '')) <> 'NGN'
     or p_amount_kobo <> v_expected_kobo
     or p_amount_kobo <= 0
     or p_transaction_id is null
     or p_transaction_id = '' then
    raise exception 'Paystack payment details do not match this order.';
  end if;

  if v_order.payment_status = 'succeeded' then
    return jsonb_build_object('confirmed', true, 'already_confirmed', true, 'order_id', v_order.id);
  end if;
  if v_order.status <> 'pending_payment'
     or v_order.reservation_expires_at is null
     or v_order.reservation_expires_at <= now() then
    raise exception 'Payment arrived after the meal reservation expired.';
  end if;

  update public.orders
     set status = 'confirmed', payment_status = 'succeeded',
         amount_paid_ngn = (p_amount_kobo / 100)::integer,
         paystack_transaction_id = p_transaction_id,
         updated_at = now()
   where id = v_order.id;
  update public.order_deliveries set status = 'confirmed' where order_id = v_order.id;

  return jsonb_build_object('confirmed', true, 'already_confirmed', false, 'order_id', v_order.id);
end;
$$;

revoke all on function public.start_customer_payment(uuid, text, text) from public, anon;
revoke all on function public.save_customer_payment_url(uuid, text, text) from public, anon;
revoke all on function public.confirm_paystack_payment(text, bigint, text, text) from public, anon;
grant execute on function public.start_customer_payment(uuid, text, text) to authenticated;
grant execute on function public.save_customer_payment_url(uuid, text, text) to authenticated;
grant execute on function public.confirm_paystack_payment(text, bigint, text, text) to authenticated, service_role;
