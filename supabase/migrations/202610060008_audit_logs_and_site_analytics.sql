-- Comprehensive Audit Logging and Daily Traffic Analytics
-- Tracks daily unique visitors, page views, and conversion rates against orders,
-- alongside a detailed operational audit log for admin activities.

-- 1. Daily Site Visits Aggregate Table
create table if not exists public.daily_site_visits (
  visit_date date primary key default (current_date at time zone 'Africa/Lagos'),
  unique_visitors integer not null default 0 check (unique_visitors >= 0),
  page_views integer not null default 0 check (page_views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Daily Visitor Sessions Deduplication Table (Transient, clean session records)
create table if not exists public.site_visitor_sessions (
  session_id text not null,
  visit_date date not null default (current_date at time zone 'Africa/Lagos'),
  first_path text not null default '/',
  created_at timestamptz not null default now(),
  primary key (session_id, visit_date)
);

create index if not exists idx_site_visitor_sessions_date
  on public.site_visitor_sessions (visit_date);

-- 3. Operational Audit Logs Table
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  admin_email text not null default 'admin@prechop.com',
  category text not null check (category in ('meals', 'menus', 'batches', 'orders', 'deliveries', 'refunds', 'settings', 'auth', 'traffic')),
  action text not null,
  entity_id text,
  details text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

create index if not exists idx_admin_audit_logs_category
  on public.admin_audit_logs (category, created_at desc);

-- 4. Enable Row-Level Security
alter table public.daily_site_visits enable row level security;
alter table public.site_visitor_sessions enable row level security;
alter table public.admin_audit_logs enable row level security;

-- Policies:
-- Only admins can read audit logs and daily visits
create policy "Admins can view audit logs"
  on public.admin_audit_logs for select
  to authenticated
  using (public.is_admin_user());

create policy "Admins can view daily site visits"
  on public.daily_site_visits for select
  to authenticated
  using (public.is_admin_user());

-- 5. RPC to record site visits safely
create or replace function public.record_site_visit(
  p_session_id text,
  p_path text default '/'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (current_date at time zone 'Africa/Lagos');
  v_is_new_visitor boolean := false;
begin
  if p_session_id is null or length(trim(p_session_id)) = 0 then
    return;
  end if;

  -- Attempt to insert new session for today
  insert into public.site_visitor_sessions (session_id, visit_date, first_path)
  values (p_session_id, v_today, coalesce(p_path, '/'))
  on conflict (session_id, visit_date) do nothing;

  if found then
    v_is_new_visitor := true;
  end if;

  -- Upsert daily aggregate
  insert into public.daily_site_visits (visit_date, unique_visitors, page_views, updated_at)
  values (v_today, case when v_is_new_visitor then 1 else 0 end, 1, now())
  on conflict (visit_date) do update set
    unique_visitors = public.daily_site_visits.unique_visitors + (case when v_is_new_visitor then 1 else 0 end),
    page_views = public.daily_site_visits.page_views + 1,
    updated_at = now();
end;
$$;

grant execute on function public.record_site_visit(text, text) to anon, authenticated;

-- 6. RPC to log admin action
create or replace function public.log_admin_action(
  p_category text,
  p_action text,
  p_entity_id text default null,
  p_details text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := 'admin@prechop.com';
  v_log_id uuid;
begin
  if v_user_id is not null then
    select coalesce(email, phone_e164, 'admin') into v_email
    from public.profiles
    where id = v_user_id;
  end if;

  insert into public.admin_audit_logs (
    admin_id, admin_email, category, action, entity_id, details, metadata
  ) values (
    v_user_id, coalesce(v_email, 'admin@prechop.com'), p_category, p_action, p_entity_id, p_details, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- 7. RPC to get combined traffic and orders analytics + audit logs
create or replace function public.get_admin_audit_and_traffic(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 60);
  v_start_date date := (current_date at time zone 'Africa/Lagos') - (v_days - 1);
  v_traffic jsonb;
  v_recent_logs jsonb;
  v_today_metrics jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  -- Build daily traffic vs orders breakdown
  with calendar_dates as (
    select (v_start_date + i)::date as day_date
    from generate_series(0, v_days - 1) as i
  ),
  daily_orders as (
    select
      (created_at at time zone 'Africa/Lagos')::date as order_day,
      count(*)::integer as total_orders,
      count(*) filter (where payment_status = 'succeeded' and status <> 'cancelled')::integer as paid_orders,
      coalesce(sum(amount_paid_ngn) filter (where payment_status = 'succeeded' and status <> 'cancelled'), 0)::integer as total_sales_ngn
    from public.orders
    where (created_at at time zone 'Africa/Lagos')::date >= v_start_date
    group by (created_at at time zone 'Africa/Lagos')::date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', c.day_date,
      'unique_visitors', coalesce(v.unique_visitors, 0),
      'page_views', coalesce(v.page_views, 0),
      'total_orders', coalesce(o.total_orders, 0),
      'paid_orders', coalesce(o.paid_orders, 0),
      'total_sales_ngn', coalesce(o.total_sales_ngn, 0),
      'conversion_rate', case
        when coalesce(v.unique_visitors, 0) > 0
        then round(((coalesce(o.paid_orders, 0)::numeric / v.unique_visitors::numeric) * 100), 1)
        else 0
      end
    ) order by c.day_date desc
  ), '[]'::jsonb)
  into v_traffic
  from calendar_dates c
  left join public.daily_site_visits v on v.visit_date = c.day_date
  left join daily_orders o on o.order_day = c.day_date;

  -- Recent Audit Logs
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'admin_email', l.admin_email,
      'category', l.category,
      'action', l.action,
      'entity_id', l.entity_id,
      'details', l.details,
      'metadata', l.metadata,
      'created_at', l.created_at
    ) order by l.created_at desc
  ), '[]'::jsonb)
  into v_recent_logs
  from (
    select * from public.admin_audit_logs
    order by created_at desc
    limit 200
  ) l;

  -- Today KPI Summary
  select jsonb_build_object(
    'today_visitors', coalesce((select unique_visitors from public.daily_site_visits where visit_date = (current_date at time zone 'Africa/Lagos')), 0),
    'today_page_views', coalesce((select page_views from public.daily_site_visits where visit_date = (current_date at time zone 'Africa/Lagos')), 0),
    'today_orders', coalesce((select count(*) from public.orders where (created_at at time zone 'Africa/Lagos')::date = (current_date at time zone 'Africa/Lagos')), 0),
    'today_sales_ngn', coalesce((select sum(amount_paid_ngn) from public.orders where (created_at at time zone 'Africa/Lagos')::date = (current_date at time zone 'Africa/Lagos') and payment_status = 'succeeded'), 0)
  )
  into v_today_metrics;

  return jsonb_build_object(
    'traffic', v_traffic,
    'logs', v_recent_logs,
    'today', v_today_metrics
  );
end;
$$;

grant execute on function public.get_admin_audit_and_traffic(integer) to authenticated;
