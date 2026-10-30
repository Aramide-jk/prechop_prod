-- Allow explicitly approved admin accounts to review unpaid Paystack checkouts.
-- Customer order records stay unchanged; an order is considered abandoned when
-- it reached Paystack and its 15-minute reservation expired without payment.

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;

create or replace function public.get_admin_abandoned_payments()
returns table (
  order_id uuid,
  customer_name text,
  customer_phone text,
  payment_email text,
  payment_reference text,
  total_ngn integer,
  created_at timestamptz,
  reservation_expires_at timestamptz,
  plate_count bigint,
  delivery_summary jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Not authorized to view admin payment reports.' using errcode = '42501';
  end if;

  return query
  select o.id,
         p.full_name,
         p.phone_e164,
         o.payment_email,
         o.payment_reference,
         (o.subtotal_ngn + o.delivery_total_ngn - o.wallet_applied_ngn)::integer,
         o.created_at,
         o.reservation_expires_at,
         coalesce((
           select count(*)::bigint
             from public.order_deliveries od
             join public.order_items oi on oi.delivery_id = od.id
            where od.order_id = o.id
         ), 0),
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'service_date', od.service_date,
               'window', dw."window",
               'batch', db.name,
               'area', od.area_name,
               'meals', coalesce((
                 select jsonb_agg(oi.meal_name order by oi.created_at)
                   from public.order_items oi
                  where oi.delivery_id = od.id
               ), '[]'::jsonb)
             ) order by od.service_date, db.delivery_starts_at
           )
             from public.order_deliveries od
             join public.delivery_batches db on db.id = od.batch_id
             join public.delivery_windows dw on dw.id = db.window_id
            where od.order_id = o.id
         ), '[]'::jsonb)
    from public.orders o
    join public.profiles p on p.id = o.customer_id
   where o.status = 'pending_payment'
     and o.payment_status = 'pending'
     and o.reservation_expires_at <= now()
     and o.paystack_authorization_url is not null
     and o.payment_reference is not null
     and o.created_at >= now() - interval '90 days'
   order by o.created_at desc
   limit 100;
end;
$$;

revoke all on function public.get_admin_abandoned_payments() from public, anon;
grant execute on function public.get_admin_abandoned_payments() to authenticated;

comment on table public.admin_users is
  'Explicit allowlist for PreChop admin-only reports. Add administrators through the Supabase SQL Editor.';
comment on function public.get_admin_abandoned_payments() is
  'Returns up to 100 recent Paystack checkouts that expired unpaid, for allowlisted administrators only.';

