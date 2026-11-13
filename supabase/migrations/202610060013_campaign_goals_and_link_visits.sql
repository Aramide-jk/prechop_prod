-- Referral campaign goals, availability window, minimum qualifying order,
-- deduplicated referral link visits, and featured meal claims.

-- 1. Ensure pickup policy columns exist (from 202610060012) and extend referral_campaign_settings.
alter table public.referral_campaign_settings
  add column if not exists pickup_holding_minutes integer not null default 45
    check (pickup_holding_minutes between 10 and 240),
  add column if not exists pickup_unclaimed_policy text not null default 'Meals not collected within 45 minutes of window close are forfeited for food safety reasons and cannot be refunded.',
  add column if not exists pickup_delivery_reroute_enabled boolean not null default true,
  add column if not exists campaign_starts_at timestamptz,
  add column if not exists campaign_ends_at timestamptz,
  add column if not exists reward_per_referral_ngn integer not null default 500
    check (reward_per_referral_ngn between 0 and 1000000),
  add column if not exists min_qualifying_order_ngn integer not null default 1500
    check (min_qualifying_order_ngn between 0 and 1000000),
  add column if not exists featured_goal_enabled boolean not null default true,
  add column if not exists featured_meal_slug text not null default 'jollof',
  add column if not exists featured_meal_title text not null default 'Smoky Jollof Rice + Fried Plantain',
  add column if not exists featured_meal_image text not null default '/images/jollof.png',
  add column if not exists featured_unlock_rule text not null default 'both'
    check (featured_unlock_rule in ('referral_count', 'accumulated_credit', 'both')),
  add column if not exists featured_target_referrals integer not null default 4
    check (featured_target_referrals between 1 and 1000),
  add column if not exists featured_target_credit_ngn integer not null default 2000
    check (featured_target_credit_ngn between 0 and 10000000),
  add column if not exists featured_claim_behavior text not null default 'consumes_credit'
    check (featured_claim_behavior in ('consumes_credit', 'bonus_free_claim')),
  add column if not exists featured_claim_expiry_days integer not null default 14
    check (featured_claim_expiry_days between 1 and 365);

-- Re-assert public read policy even when campaign is paused.
drop policy if exists "Anyone can read referral campaign settings" on public.referral_campaign_settings;
create policy "Anyone can read referral campaign settings"
  on public.referral_campaign_settings
  for select
  to anon, authenticated
  using (true);

-- 2. Track exact reward earned on each referral row so historical progress is immutable.
alter table public.customer_referrals
  add column if not exists reward_ngn integer not null default 0 check (reward_ngn >= 0);

-- 3. Deduplicated referral link visits (1 unique visit per referrer/session/Africa/Lagos day).
create table if not exists public.referral_link_visits (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  visitor_session_id text not null,
  visit_date date not null default ((now() at time zone 'Africa/Lagos')::date),
  landing_path text not null default '/',
  created_at timestamptz not null default now(),
  unique (referrer_id, visitor_session_id, visit_date)
);

create index if not exists referral_link_visits_referrer_date
  on public.referral_link_visits (referrer_id, visit_date desc);

alter table public.referral_link_visits enable row level security;

drop policy if exists "Customers read own referral link visits" on public.referral_link_visits;
create policy "Customers read own referral link visits"
  on public.referral_link_visits
  for select
  to authenticated
  using (referrer_id = (select auth.uid()));

drop policy if exists "Admins read all referral link visits" on public.referral_link_visits;
create policy "Admins read all referral link visits"
  on public.referral_link_visits
  for select
  to authenticated
  using (public.is_admin_user());

revoke all on public.referral_link_visits from anon, authenticated;
grant select on public.referral_link_visits to authenticated;

-- 4. Featured meal claims linked to customer orders.
create table if not exists public.referral_meal_claims (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete set null,
  meal_slug text not null,
  meal_title text not null,
  claim_behavior text not null check (claim_behavior in ('consumes_credit', 'bonus_free_claim')),
  credit_applied_ngn integer not null default 0 check (credit_applied_ngn >= 0),
  prize_value_ngn integer not null default 0 check (prize_value_ngn >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'claimed', 'expired', 'cancelled')),
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_meal_claims_customer_idx
  on public.referral_meal_claims (customer_id, created_at desc);

create unique index if not exists referral_meal_claims_one_active_per_customer
  on public.referral_meal_claims (customer_id)
  where status in ('reserved', 'claimed');

alter table public.referral_meal_claims enable row level security;

drop policy if exists "Customers read own meal claims" on public.referral_meal_claims;
create policy "Customers read own meal claims"
  on public.referral_meal_claims
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Admins read all meal claims" on public.referral_meal_claims;
create policy "Admins read all meal claims"
  on public.referral_meal_claims
  for select
  to authenticated
  using (public.is_admin_user());

revoke all on public.referral_meal_claims from anon, authenticated;
grant select on public.referral_meal_claims to authenticated;

-- 5. Shared availability & unlock helpers.
create or replace function public.is_referral_campaign_live(
  p_settings public.referral_campaign_settings,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_settings.enabled, false)
    and (p_settings.campaign_starts_at is null or p_at >= p_settings.campaign_starts_at)
    and (p_settings.campaign_ends_at is null or p_at <= p_settings.campaign_ends_at);
$$;

create or replace function public.compute_campaign_unlock_state(
  p_customer_id uuid,
  p_settings public.referral_campaign_settings
)
returns table (
  qualified_count integer,
  accumulated_credit_ngn integer,
  is_unlocked boolean,
  unlocked_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_credit integer := 0;
  v_count_at timestamptz := null;
  v_credit_at timestamptz := null;
  v_target_count integer := greatest(coalesce(p_settings.featured_target_referrals, p_settings.referrals_required, 4), 1);
  v_target_credit integer := greatest(coalesce(p_settings.featured_target_credit_ngn, 0), 0);
  v_rule text := coalesce(p_settings.featured_unlock_rule, 'both');
  v_behavior text := coalesce(p_settings.featured_claim_behavior, 'consumes_credit');
  v_expiry_days integer := greatest(coalesce(p_settings.featured_claim_expiry_days, 14), 1);
begin
  for v_row in
    select coalesce(cr.qualified_at, cr.created_at) as event_at,
           greatest(coalesce(cr.reward_ngn, 0), 0) as reward_ngn
      from public.customer_referrals cr
     where cr.referrer_id = p_customer_id
       and cr.status = 'qualified'
     order by coalesce(cr.qualified_at, cr.created_at) asc, cr.id asc
  loop
    v_count := v_count + 1;
    v_credit := v_credit + v_row.reward_ngn;

    if v_count_at is null and v_count >= v_target_count then
      v_count_at := v_row.event_at;
    end if;

    if v_credit_at is null and v_credit >= v_target_credit then
      v_credit_at := v_row.event_at;
    end if;
  end loop;

  if v_target_credit = 0 and v_count > 0 and v_credit_at is null then
    v_credit_at := v_count_at;
  end if;

  if not coalesce(p_settings.featured_goal_enabled, true) then
    return query select v_count, v_credit, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_rule = 'referral_count' then
    is_unlocked := v_count >= v_target_count;
    unlocked_at := case when is_unlocked then v_count_at else null end;
  elsif v_rule = 'accumulated_credit' then
    is_unlocked := v_credit >= v_target_credit and v_count > 0;
    unlocked_at := case when is_unlocked then v_credit_at else null end;
  else
    is_unlocked := v_count >= v_target_count and v_credit >= v_target_credit;
    unlocked_at := case
      when is_unlocked then greatest(coalesce(v_count_at, v_credit_at), coalesce(v_credit_at, v_count_at))
      else null
    end;
  end if;

  if is_unlocked and v_behavior = 'bonus_free_claim' and unlocked_at is not null then
    expires_at := unlocked_at + make_interval(days => v_expiry_days);
  else
    expires_at := null;
  end if;

  qualified_count := v_count;
  accumulated_credit_ngn := v_credit;
  return next;
end;
$$;

revoke all on function public.compute_campaign_unlock_state(uuid, public.referral_campaign_settings)
  from public, anon, authenticated;

-- 6. Deduplicated link visit tracker RPC.
create or replace function public.record_referral_link_visit(
  p_referral_code text,
  p_session_id text,
  p_path text default '/'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.referral_campaign_settings%rowtype;
  v_referrer uuid;
  v_code text;
  v_session text;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  v_code := lower(trim(coalesce(p_referral_code, '')));
  v_session := trim(coalesce(p_session_id, ''));
  if v_code !~ '^[a-f0-9]{12}$' or length(v_session) < 4 or length(v_session) > 120 then
    return false;
  end if;

  select * into v_settings from public.referral_campaign_settings where id = 1;
  if not found or not public.is_referral_campaign_live(v_settings, now()) then
    return false;
  end if;

  select p.id into v_referrer
    from public.profiles p
   where lower(p.referral_code) = v_code;

  if v_referrer is null or v_referrer = auth.uid() then
    return false;
  end if;

  insert into public.referral_link_visits (
    referrer_id, referral_code, visitor_session_id, visit_date, landing_path
  ) values (
    v_referrer, v_code, v_session, v_today, left(coalesce(nullif(trim(p_path), ''), '/'), 200)
  )
  on conflict (referrer_id, visitor_session_id, visit_date) do nothing;

  return found;
end;
$$;

revoke all on function public.record_referral_link_visit(text, text, text) from public;
grant execute on function public.record_referral_link_visit(text, text, text) to anon, authenticated;

-- 7. Enforce active campaign window during referral attribution.
create or replace function public.attribute_customer_referral(p_referral_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_referrer uuid;
  v_settings public.referral_campaign_settings%rowtype;
begin
  if v_customer is null or p_referral_code is null then return false; end if;

  select * into v_settings
    from public.referral_campaign_settings
   where id = 1;

  if not found or not public.is_referral_campaign_live(v_settings, now()) then
    return false;
  end if;

  select p.id into v_referrer
    from public.profiles as p
   where lower(p.referral_code) = lower(trim(p_referral_code));

  if v_referrer is null or v_referrer = v_customer then return false; end if;

  insert into public.customer_referrals (referrer_id, referred_customer_id)
  values (v_referrer, v_customer)
  on conflict (referred_customer_id) do nothing;

  return found;
end;
$$;

revoke all on function public.attribute_customer_referral(text) from public, anon;
grant execute on function public.attribute_customer_referral(text) to authenticated;

-- 8. Order confirmation & cancellation trigger:
--    a) deposits reward_per_referral_ngn into referrer's wallet for every qualifying friend order
--    b) promotes/releases reserved referral_meal_claims cleanly
create or replace function public.reward_referral_campaign_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral record;
  v_settings public.referral_campaign_settings%rowtype;
  v_qualified_count integer;
  v_wallet_entry uuid;
  v_reward integer;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.referral_meal_claims
       set status = 'cancelled',
           updated_at = now()
     where order_id = new.id
       and status in ('reserved', 'claimed');
    return new;
  end if;

  if new.status <> 'confirmed' or new.payment_status <> 'succeeded'
     or (old.status = new.status and old.payment_status = new.payment_status) then
    return new;
  end if;

  -- Mark any featured meal claim reserved on this order as claimed.
  update public.referral_meal_claims
     set status = 'claimed',
         credit_applied_ngn = case
           when claim_behavior = 'consumes_credit' then greatest(coalesce(new.wallet_applied_ngn, 0), credit_applied_ngn)
           else 0
         end,
         claimed_at = coalesce(claimed_at, now()),
         updated_at = now()
   where order_id = new.id
     and status = 'reserved';

  select * into v_settings
    from public.referral_campaign_settings where id = 1 for update;
  if not found or not public.is_referral_campaign_live(v_settings, now()) then
    return new;
  end if;

  -- Guardrail: friend's food subtotal must meet min_qualifying_order_ngn (and exclude ₦0 bonus claims).
  if new.subtotal_ngn < greatest(coalesce(v_settings.min_qualifying_order_ngn, 0), 0)
     or (new.subtotal_ngn + new.wallet_applied_ngn + new.amount_paid_ngn) <= 0 then
    return new;
  end if;

  v_reward := greatest(coalesce(v_settings.reward_per_referral_ngn, 0), 0);

  for v_referral in
    update public.customer_referrals
       set status = 'qualified',
           qualifying_order_id = new.id,
           qualified_at = now(),
           reward_ngn = v_reward
     where referred_customer_id = new.customer_id
       and status = 'pending'
     returning referrer_id
  loop
    v_wallet_entry := null;
    if v_reward > 0 then
      insert into public.wallet_entries (customer_id, order_id, kind, amount_ngn, description)
      values (
        v_referral.referrer_id,
        new.id,
        'admin_adjustment',
        v_reward,
        'PreChop referral reward for a qualified friend order'
      ) returning id into v_wallet_entry;
    end if;

    select count(*)::integer into v_qualified_count
      from public.customer_referrals
     where referrer_id = v_referral.referrer_id and status = 'qualified';

    if v_wallet_entry is not null
       and v_qualified_count >= greatest(coalesce(v_settings.referrals_required, 1), 1)
       and not exists (
         select 1 from public.referral_campaign_rewards
          where referrer_id = v_referral.referrer_id
       ) then
      insert into public.referral_campaign_rewards
        (referrer_id, wallet_entry_id, referrals_required, reward_amount_ngn)
      values
        (v_referral.referrer_id, v_wallet_entry, v_settings.referrals_required, v_settings.reward_amount_ngn)
      on conflict (referrer_id) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.reward_referral_campaign_order() from public, anon, authenticated;

drop trigger if exists reward_referral_campaign_after_order_confirmation on public.orders;
create trigger reward_referral_campaign_after_order_confirmation
  after update of status, payment_status on public.orders
  for each row execute function public.reward_referral_campaign_order();

-- 9. Update create_customer_checkout to support claiming featured meal goals safely.
drop function if exists public.create_customer_checkout(jsonb);
drop function if exists public.create_customer_checkout(jsonb, boolean);

create or replace function public.create_customer_checkout(
  p_deliveries jsonb,
  p_claim_featured_meal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_order_id uuid := gen_random_uuid();
  v_delivery_id uuid;
  v_delivery jsonb;
  v_item jsonb;
  v_extra jsonb;
  v_extras jsonb;
  v_items jsonb;
  v_deliveries jsonb := '[]'::jsonb;
  v_normalized_item jsonb;
  v_date date;
  v_cutoff_at timestamptz;
  v_address text;
  v_note text;
  v_batch_id uuid;
  v_area_id uuid;
  v_area_name text;
  v_area_fee integer;
  v_fulfillment_type text;
  v_meal_slug text;
  v_protein_slug text;
  v_extra_slug text;
  v_quantity integer;
  v_line_total integer;
  v_item_base_price integer;
  v_item_meal_name text;
  v_food_total integer := 0;
  v_delivery_total integer := 0;
  v_order_item_count integer := 0;
  v_batch record;
  v_area record;
  v_meal record;
  v_pool record;
  v_addon record;
  v_stock record;
  v_existing integer;
  v_index integer := 0;
  v_settings public.referral_campaign_settings%rowtype;
  v_unlock record;
  v_claim_featured boolean := coalesce(p_claim_featured_meal, false);
  v_apply_bonus_claim boolean := false;
  v_featured_plate_matched boolean := false;
  v_bonus_prize_value integer := 0;
begin
  if v_customer_id is null then
    raise exception 'Please sign in before placing your order.';
  end if;
  if jsonb_typeof(p_deliveries) is distinct from 'array'
     or coalesce(jsonb_array_length(p_deliveries), 0) < 1
     or coalesce(jsonb_array_length(p_deliveries), 0) > 21 then
    raise exception 'Your checkout must contain between 1 and 21 deliveries.';
  end if;

  if v_claim_featured then
    perform 1 from public.profiles where id = v_customer_id for update;

    -- Release any stale unpaid claim reservation whose 15-min checkout hold expired.
    update public.referral_meal_claims rmc
       set status = 'cancelled',
           updated_at = now()
      from public.orders o
     where rmc.customer_id = v_customer_id
       and rmc.status = 'reserved'
       and rmc.order_id = o.id
       and o.status = 'pending_payment'
       and o.reservation_expires_at <= now();

    select * into v_settings from public.referral_campaign_settings where id = 1;
    if not found
       or not public.is_referral_campaign_live(v_settings, now())
       or not coalesce(v_settings.featured_goal_enabled, true) then
      raise exception 'The featured campaign meal goal is currently unavailable.';
    end if;

    select * into v_unlock from public.compute_campaign_unlock_state(v_customer_id, v_settings);
    if not coalesce(v_unlock.is_unlocked, false) then
      raise exception 'Complete your referral goal before claiming this meal.';
    end if;
    if v_unlock.expires_at is not null and v_unlock.expires_at <= now() then
      raise exception 'Your campaign meal prize window has expired.';
    end if;

    if exists (
      select 1 from public.referral_meal_claims
       where customer_id = v_customer_id
         and status in ('reserved', 'claimed')
    ) then
      raise exception 'You have already claimed or reserved your campaign meal reward.';
    end if;

    v_apply_bonus_claim := v_settings.featured_claim_behavior = 'bonus_free_claim';
  end if;

  for v_delivery in select value from jsonb_array_elements(p_deliveries)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_delivery -> 'items') is distinct from 'array'
       or jsonb_array_length(v_delivery -> 'items') < 1
       or jsonb_array_length(v_delivery -> 'items') > 50 then
      raise exception 'Delivery % has no meals or too many meals.', v_index;
    end if;

    v_date := (v_delivery ->> 'service_date')::date;
    v_batch_id := (v_delivery ->> 'batch_id')::uuid;
    v_note := trim(coalesce(v_delivery ->> 'delivery_note', ''));
    if char_length(v_note) > 200 then
      raise exception 'Delivery notes must be 200 characters or fewer.';
    end if;

    v_fulfillment_type := coalesce(nullif(trim(v_delivery ->> 'fulfillment_type'), ''), 'delivery');
    if v_fulfillment_type not in ('delivery', 'pickup') then
      v_fulfillment_type := 'delivery';
    end if;

    select b.id, b.name, b.window_id, b.delivery_starts_at, b.delivery_ends_at,
           b.cutoff_time, w."window" as meal_window
      into v_batch
      from public.delivery_batches b
      join public.delivery_windows w on w.id = b.window_id and w.active
     where b.id = v_batch_id and b.active;
    if not found then
      raise exception 'One of the selected delivery times is no longer available.';
    end if;

    if v_fulfillment_type = 'pickup' then
      v_area_name := 'Campus Pickup';
      v_area_fee := 0;
      v_address := coalesce(
        nullif(trim(v_delivery ->> 'address'), ''),
        nullif(trim(v_delivery ->> 'pickup_station_address'), ''),
        'Social Center, Samaru Campus, ABU Zaria'
      );
    else
      v_area_id := (v_delivery ->> 'area_id')::uuid;
      v_address := trim(coalesce(v_delivery ->> 'address', ''));

      if char_length(v_address) < 8 or char_length(v_address) > 300 then
        raise exception 'Enter an address between 8 and 300 characters.';
      end if;

      select a.id, a.name, a.fee_ngn into v_area
        from public.delivery_areas a where a.id = v_area_id and a.active;
      if not found then
        raise exception 'One of the selected delivery areas is no longer available.';
      end if;
      v_area_name := v_area.name;
      v_area_fee := v_area.fee_ngn;
    end if;

    v_cutoff_at := ((v_date + v_batch.cutoff_time) at time zone 'Africa/Lagos');
    if v_cutoff_at <= now() then
      raise exception 'The ordering cutoff has passed for one of your deliveries.';
    end if;

    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_delivery -> 'items')
    loop
      v_meal_slug := trim(coalesce(v_item ->> 'meal_slug', ''));
      select m.id, m.slug, m.name, m.base_price_ngn into v_meal
        from public.meals m where m.slug = v_meal_slug and m.active;
      if not found then
        raise exception 'A selected meal is no longer available.';
      end if;

      select p.id, p.portion_limit into v_pool
        from public.meal_stock_pools p
        join public.batch_menu_items bm on bm.stock_pool_id = p.id and bm.active
       where p.meal_id = v_meal.id and p.service_date = v_date
         and bm.batch_id = v_batch.id;
      if not found then
        raise exception 'A selected meal is not posted for that date and delivery time.';
      end if;

      v_item_base_price := v_meal.base_price_ngn;
      v_item_meal_name := v_meal.name;

      if v_claim_featured and not v_featured_plate_matched and v_meal.slug = v_settings.featured_meal_slug then
        v_featured_plate_matched := true;
        if v_apply_bonus_claim then
          v_bonus_prize_value := v_meal.base_price_ngn;
          v_item_base_price := 0;
          v_item_meal_name := v_meal.name || ' (Campaign Prize)';
        else
          v_bonus_prize_value := v_meal.base_price_ngn;
        end if;
      end if;

      v_protein_slug := nullif(trim(coalesce(v_item ->> 'protein_slug', '')), '');
      if v_protein_slug = 'none' then v_protein_slug := null; end if;
      if v_protein_slug is null then
        v_line_total := v_item_base_price;
        v_normalized_item := jsonb_build_object(
          'stock_pool_id', v_pool.id, 'meal_name', v_item_meal_name,
          'base_price_ngn', v_item_base_price, 'protein_name', null,
          'protein_addon_id', null, 'protein_price_ngn', 0,
          'extras_snapshot', '[]'::jsonb, 'line_total_ngn', v_line_total
        );
      else
        select a.id, a.name, a.price_ngn into v_addon
          from public.meal_proteins mp
          join public.add_on_catalog a on a.id = mp.addon_id and a.active
         where mp.meal_id = v_meal.id and mp.active and a.slug = v_protein_slug
           and a.category = 'protein';
        if not found then
          raise exception 'A selected protein is not available with that meal.';
        end if;
        v_line_total := v_item_base_price + v_addon.price_ngn;
        v_normalized_item := jsonb_build_object(
          'stock_pool_id', v_pool.id, 'meal_name', v_item_meal_name,
          'base_price_ngn', v_item_base_price, 'protein_name', v_addon.name,
          'protein_addon_id', v_addon.id, 'protein_price_ngn', v_addon.price_ngn,
          'extras_snapshot', '[]'::jsonb, 'line_total_ngn', v_line_total
        );
      end if;

      v_extras := '[]'::jsonb;
      if v_item ? 'extras' and jsonb_typeof(v_item -> 'extras') <> 'array' then
        raise exception 'Extras must be provided as a list.';
      end if;
      if v_item ? 'extras' then
        for v_extra in select value from jsonb_array_elements(v_item -> 'extras')
        loop
          v_extra_slug := trim(coalesce(nullif(v_extra ->> 'extra_slug', ''), v_extra ->> 'slug', ''));
          v_quantity := coalesce((v_extra ->> 'quantity')::integer, 0);
          if v_quantity < 1 or v_quantity > 10 then
            raise exception 'Extra quantities must be between 1 and 10.';
          end if;
          select a.id, a.name, a.price_ngn into v_addon
            from public.meal_extras me
            join public.add_on_catalog a on a.id = me.addon_id and a.active
           where me.meal_id = v_meal.id and me.active and a.slug = v_extra_slug;
          if not found then
            raise exception 'A selected extra is not available with that meal.';
          end if;
          v_line_total := v_line_total + (v_addon.price_ngn * v_quantity);
          v_extras := v_extras || jsonb_build_array(jsonb_build_object(
            'addon_id', v_addon.id, 'name', v_addon.name,
            'price_ngn', v_addon.price_ngn, 'quantity', v_quantity
          ));
        end loop;
      end if;

      v_normalized_item := jsonb_set(v_normalized_item, '{extras_snapshot}', v_extras);
      v_normalized_item := jsonb_set(v_normalized_item, '{line_total_ngn}', to_jsonb(v_line_total));
      v_items := v_items || jsonb_build_array(v_normalized_item);
      v_food_total := v_food_total + v_line_total;
      v_order_item_count := v_order_item_count + 1;
    end loop;

    v_delivery_total := v_delivery_total + v_area_fee;
    v_deliveries := v_deliveries || jsonb_build_array(jsonb_build_object(
      'service_date', v_date, 'batch_id', v_batch.id,
      'window', v_batch.meal_window, 'batch_name', v_batch.name,
      'delivery_starts_at', v_batch.delivery_starts_at,
      'delivery_ends_at', v_batch.delivery_ends_at,
      'cutoff_at', v_cutoff_at, 'area_name', v_area_name,
      'area_fee_ngn', v_area_fee, 'address_text', v_address,
      'delivery_note', v_note, 'fulfillment_type', v_fulfillment_type,
      'items', v_items
    ));
  end loop;

  if v_claim_featured and not v_featured_plate_matched then
    raise exception 'Add the featured campaign meal to your basket to claim this reward.';
  end if;

  if v_order_item_count > 100 then
    raise exception 'An order can contain at most 100 plates.';
  end if;

  perform p.id
    from public.meal_stock_pools p
   where p.id in (
     select (i ->> 'stock_pool_id')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
   )
   order by p.id for update;

  perform a.id
    from public.add_on_catalog a
   where a.id in (
     select nullif(i ->> 'protein_addon_id', '')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
      where nullif(i ->> 'protein_addon_id', '') is not null
     union
     select (x ->> 'addon_id')::uuid
       from jsonb_array_elements(v_deliveries) d
       cross join lateral jsonb_array_elements(d -> 'items') i
       cross join lateral jsonb_array_elements(i -> 'extras_snapshot') x
   )
   order by a.id for update;

  for v_stock in
    select p.id, p.portion_limit, count(*)::integer as requested
      from jsonb_array_elements(v_deliveries) d
      cross join lateral jsonb_array_elements(d -> 'items') i
      join public.meal_stock_pools p on p.id = (i ->> 'stock_pool_id')::uuid
     group by p.id, p.portion_limit
  loop
    select count(oi.id)::integer into v_existing
      from public.order_items oi
      join public.order_deliveries od on od.id = oi.delivery_id
      join public.orders o on o.id = od.order_id
     where oi.stock_pool_id = v_stock.id
       and od.status <> 'cancelled'
       and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
            or (o.status = 'pending_payment' and o.reservation_expires_at > now()));
    if v_existing + v_stock.requested > v_stock.portion_limit then
      raise exception 'A selected meal has sold out for that delivery window.';
    end if;
  end loop;

  for v_stock in
    select a.id, a.stock_limit, sum(coalesce(req.qty, 1))::integer as requested
      from (
        select nullif(i ->> 'protein_addon_id', '')::uuid as addon_id, 1::integer as qty
          from jsonb_array_elements(v_deliveries) d
          cross join lateral jsonb_array_elements(d -> 'items') i
         where nullif(i ->> 'protein_addon_id', '') is not null
        union all
        select (x ->> 'addon_id')::uuid as addon_id, (x ->> 'quantity')::integer as qty
          from jsonb_array_elements(v_deliveries) d
          cross join lateral jsonb_array_elements(d -> 'items') i
          cross join lateral jsonb_array_elements(i -> 'extras_snapshot') x
      ) req
      join public.add_on_catalog a on a.id = req.addon_id
     where a.stock_limit is not null
     group by a.id, a.stock_limit
  loop
    select (
      (select count(oi.id)::integer
         from public.order_items oi
         join public.order_deliveries od on od.id = oi.delivery_id
         join public.orders o on o.id = od.order_id
        where oi.protein_addon_id = v_stock.id
          and od.status <> 'cancelled'
          and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
               or (o.status = 'pending_payment' and o.reservation_expires_at > now())))
      +
      (select coalesce(sum((x ->> 'quantity')::integer), 0)::integer
         from public.order_items oi
         join public.order_deliveries od on od.id = oi.delivery_id
         join public.orders o on o.id = od.order_id
         cross join lateral jsonb_array_elements(oi.extras_snapshot) x
        where x ->> 'addon_id' = v_stock.id::text
          and od.status <> 'cancelled'
          and ((o.payment_status = 'succeeded' and o.status <> 'cancelled')
               or (o.status = 'pending_payment' and o.reservation_expires_at > now())))
    ) into v_existing;
    if v_existing + v_stock.requested > v_stock.stock_limit then
      raise exception 'One of your selected proteins or extras just sold out.';
    end if;
  end loop;

  insert into public.orders(customer_id, status, payment_status, subtotal_ngn,
                            delivery_total_ngn, reservation_expires_at)
  values (v_customer_id, 'pending_payment', 'pending', v_food_total,
          v_delivery_total, now() + interval '15 minutes')
  returning id into v_order_id;

  for v_delivery in select value from jsonb_array_elements(v_deliveries)
  loop
    insert into public.order_deliveries(
      order_id, batch_id, service_date, area_name, area_fee_ngn,
      address_label, address_text, delivery_note, cutoff_at, status,
      fulfillment_type
    ) values (
      v_order_id, (v_delivery ->> 'batch_id')::uuid,
      (v_delivery ->> 'service_date')::date, v_delivery ->> 'area_name',
      (v_delivery ->> 'area_fee_ngn')::integer,
      case when (v_delivery ->> 'fulfillment_type') = 'pickup' then 'Pickup station' else 'Delivery address' end,
      v_delivery ->> 'address_text', v_delivery ->> 'delivery_note',
      (v_delivery ->> 'cutoff_at')::timestamptz, 'pending_payment',
      coalesce(v_delivery ->> 'fulfillment_type', 'delivery')
    ) returning id into v_delivery_id;

    for v_item in select value from jsonb_array_elements(v_delivery -> 'items')
    loop
      insert into public.order_items(
        delivery_id, stock_pool_id, meal_name, base_price_ngn,
        protein_name, protein_addon_id, protein_price_ngn, extras_snapshot
      ) values (
        v_delivery_id, (v_item ->> 'stock_pool_id')::uuid,
        v_item ->> 'meal_name', (v_item ->> 'base_price_ngn')::integer,
        v_item ->> 'protein_name', nullif(v_item ->> 'protein_addon_id', '')::uuid,
        (v_item ->> 'protein_price_ngn')::integer, v_item -> 'extras_snapshot'
      );
    end loop;
  end loop;

  if v_claim_featured then
    insert into public.referral_meal_claims(
      customer_id, order_id, meal_slug, meal_title, claim_behavior,
      credit_applied_ngn, prize_value_ngn, status, unlocked_at, expires_at
    ) values (
      v_customer_id,
      v_order_id,
      v_settings.featured_meal_slug,
      v_settings.featured_meal_title,
      v_settings.featured_claim_behavior,
      0,
      v_bonus_prize_value,
      'reserved',
      coalesce(v_unlock.unlocked_at, now()),
      v_unlock.expires_at
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal_ngn', v_food_total,
    'delivery_total_ngn', v_delivery_total,
    'total_ngn', v_food_total + v_delivery_total,
    'reservation_expires_at', now() + interval '15 minutes',
    'status', 'pending_payment',
    'featured_claim_applied', v_claim_featured
  );
end;
$$;

revoke all on function public.create_customer_checkout(jsonb, boolean) from public, anon;
grant execute on function public.create_customer_checkout(jsonb, boolean) to authenticated;

-- 10. Customer campaign summary RPC for /campaign and /checkout.
create or replace function public.get_customer_campaign_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_profile record;
  v_settings public.referral_campaign_settings%rowtype;
  v_unlock record;
  v_claim public.referral_meal_claims%rowtype;
  v_wallet_balance integer := 0;
  v_link_visits integer := 0;
  v_pending_count integer := 0;
  v_referrals jsonb := '[]'::jsonb;
  v_claim_status text := 'locked';
begin
  if v_customer is null then
    raise exception 'Sign in to view your campaign progress.';
  end if;

  -- Clean up any abandoned pending_payment claim reservations for this customer.
  update public.referral_meal_claims rmc
     set status = 'cancelled',
         updated_at = now()
    from public.orders o
   where rmc.customer_id = v_customer
     and rmc.status = 'reserved'
     and rmc.order_id = o.id
     and o.status = 'pending_payment'
     and o.reservation_expires_at <= now();

  select p.id, p.full_name, p.referral_code
    into v_profile
    from public.profiles p
   where p.id = v_customer;

  select * into v_settings from public.referral_campaign_settings where id = 1;
  select * into v_unlock from public.compute_campaign_unlock_state(v_customer, v_settings);

  select greatest(0, coalesce(sum(w.amount_ngn), 0))::integer
    into v_wallet_balance
    from public.wallet_entries w
   where w.customer_id = v_customer;

  select count(*)::integer
    into v_link_visits
    from public.referral_link_visits v
   where v.referrer_id = v_customer;

  select count(*)::integer
    into v_pending_count
    from public.customer_referrals cr
   where cr.referrer_id = v_customer
     and cr.status = 'pending';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cr.id,
      'status', cr.status,
      'reward_ngn', cr.reward_ngn,
      'qualified_at', cr.qualified_at,
      'created_at', cr.created_at,
      'friend_name', coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Campus Friend')
    ) order by coalesce(cr.qualified_at, cr.created_at) desc
  ), '[]'::jsonb)
    into v_referrals
    from public.customer_referrals cr
    left join public.profiles p on p.id = cr.referred_customer_id
   where cr.referrer_id = v_customer;

  select * into v_claim
    from public.referral_meal_claims
   where customer_id = v_customer
     and status in ('reserved', 'claimed')
   order by created_at desc
   limit 1;

  if not coalesce(v_settings.featured_goal_enabled, true) then
    v_claim_status := 'disabled';
  elsif v_claim.id is not null and v_claim.status = 'claimed' then
    v_claim_status := 'claimed';
  elsif coalesce(v_unlock.is_unlocked, false) then
    if v_unlock.expires_at is not null and v_unlock.expires_at <= now() then
      v_claim_status := 'expired';
    else
      v_claim_status := 'unlocked';
    end if;
  else
    v_claim_status := 'locked';
  end if;

  return jsonb_build_object(
    'referral_code', v_profile.referral_code,
    'full_name', v_profile.full_name,
    'wallet_balance_ngn', v_wallet_balance,
    'link_visits', v_link_visits,
    'pending_referrals', v_pending_count,
    'qualified_referrals', coalesce(v_unlock.qualified_count, 0),
    'accumulated_campaign_credit_ngn', coalesce(v_unlock.accumulated_credit_ngn, 0),
    'referrals', v_referrals,
    'is_unlocked', coalesce(v_unlock.is_unlocked, false),
    'unlocked_at', v_unlock.unlocked_at,
    'expires_at', v_unlock.expires_at,
    'claim_status', v_claim_status,
    'claimed_at', v_claim.claimed_at,
    'claimed_order_id', v_claim.order_id,
    'campaign_live', public.is_referral_campaign_live(v_settings, now())
  );
end;
$$;

revoke all on function public.get_customer_campaign_summary() from public, anon;
grant execute on function public.get_customer_campaign_summary() to authenticated;

-- 11. Admin campaign funnel & top referrers report RPC.
create or replace function public.get_admin_campaign_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_visits integer := 0;
  v_unique_referrers integer := 0;
  v_pending_signups integer := 0;
  v_qualified_referrals integer := 0;
  v_credit_disbursed integer := 0;
  v_claimed_meals integer := 0;
  v_bonus_prize_cost integer := 0;
  v_top_referrers jsonb := '[]'::jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select count(*)::integer, count(distinct referrer_id)::integer
    into v_total_visits, v_unique_referrers
    from public.referral_link_visits;

  select
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'qualified')::integer,
    coalesce(sum(reward_ngn) filter (where status = 'qualified'), 0)::integer
    into v_pending_signups, v_qualified_referrals, v_credit_disbursed
    from public.customer_referrals;

  select
    count(*) filter (where status = 'claimed')::integer,
    coalesce(sum(prize_value_ngn) filter (where status = 'claimed' and claim_behavior = 'bonus_free_claim'), 0)::integer
    into v_claimed_meals, v_bonus_prize_cost
    from public.referral_meal_claims;

  with ref_agg as (
    select
      p.id as referrer_id,
      p.full_name,
      p.phone_e164,
      p.referral_code,
      coalesce(v.visit_count, 0)::integer as link_visits,
      coalesce(r.pending_count, 0)::integer as pending_count,
      coalesce(r.qualified_count, 0)::integer as qualified_count,
      coalesce(r.earned_credit_ngn, 0)::integer as earned_credit_ngn,
      coalesce(c.claim_status, 'not_claimed') as claim_status
    from public.profiles p
    left join (
      select referrer_id, count(*)::integer as visit_count
      from public.referral_link_visits
      group by referrer_id
    ) v on v.referrer_id = p.id
    left join (
      select
        referrer_id,
        count(*) filter (where status = 'pending')::integer as pending_count,
        count(*) filter (where status = 'qualified')::integer as qualified_count,
        coalesce(sum(reward_ngn) filter (where status = 'qualified'), 0)::integer as earned_credit_ngn
      from public.customer_referrals
      group by referrer_id
    ) r on r.referrer_id = p.id
    left join (
      select distinct on (customer_id) customer_id, status as claim_status
      from public.referral_meal_claims
      order by customer_id, created_at desc
    ) c on c.customer_id = p.id
    where coalesce(v.visit_count, 0) > 0
       or coalesce(r.pending_count, 0) > 0
       or coalesce(r.qualified_count, 0) > 0
    order by coalesce(r.qualified_count, 0) desc, coalesce(v.visit_count, 0) desc
    limit 25
  )
  select coalesce(jsonb_agg(to_jsonb(ref_agg)), '[]'::jsonb)
    into v_top_referrers
    from ref_agg;

  return jsonb_build_object(
    'total_link_visits', v_total_visits,
    'unique_referrers_with_visits', v_unique_referrers,
    'pending_signups', v_pending_signups,
    'qualified_referrals', v_qualified_referrals,
    'total_wallet_credit_disbursed_ngn', v_credit_disbursed,
    'claimed_meals_count', v_claimed_meals,
    'bonus_prizes_cost_ngn', v_bonus_prize_cost,
    'top_referrers', v_top_referrers
  );
end;
$$;

revoke all on function public.get_admin_campaign_report() from public, anon;
grant execute on function public.get_admin_campaign_report() to authenticated;

-- 12. Update get_public_store_settings() to expose all campaign fields.
create or replace function public.get_public_store_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s)
  from (
    select
      service_active,
      service_paused_message,
      allow_same_day_ordering,
      advance_order_days,
      min_order_amount_ngn,
      max_plates_per_order,
      free_delivery_threshold_ngn,
      whatsapp_number,
      support_email,
      dispatch_phone,
      support_hours,
      announcement_banner,
      business_name,
      service_area_tagline,
      footer_tagline,
      enabled as referral_campaign_enabled,
      referrals_required,
      reward_amount_ngn,
      campaign_starts_at,
      campaign_ends_at,
      reward_per_referral_ngn,
      min_qualifying_order_ngn,
      featured_goal_enabled,
      featured_meal_slug,
      featured_meal_title,
      featured_meal_image,
      featured_unlock_rule,
      featured_target_referrals,
      featured_target_credit_ngn,
      featured_claim_behavior,
      featured_claim_expiry_days,
      delivery_enabled,
      pickup_enabled,
      pickup_station_name,
      pickup_station_address,
      pickup_instructions,
      pickup_holding_minutes,
      pickup_unclaimed_policy,
      pickup_delivery_reroute_enabled
    from public.referral_campaign_settings
    where id = 1
  ) s;
$$;

grant execute on function public.get_public_store_settings() to anon, authenticated;

notify pgrst, 'reload schema';
