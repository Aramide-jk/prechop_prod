-- 202610060012_unclaimed_pickup_and_reroute.sql
-- Super Admin controls for uncollected pickup orders: holding grace period, unclaimed policy notice, and delivery reroute support.

-- 1. Add configurable pickup holding and unclaimed policy columns
alter table public.referral_campaign_settings
  add column if not exists pickup_holding_minutes integer not null default 45 check (pickup_holding_minutes between 10 and 240),
  add column if not exists pickup_unclaimed_policy text not null default 'Meals not collected within 45 minutes of window close are forfeited for food safety reasons and cannot be refunded.',
  add column if not exists pickup_delivery_reroute_enabled boolean not null default true;

-- 2. Update default settings record (id = 1)
update public.referral_campaign_settings
set
  pickup_holding_minutes = coalesce(pickup_holding_minutes, 45),
  pickup_unclaimed_policy = coalesce(nullif(pickup_unclaimed_policy, ''), 'Meals not collected within 45 minutes of window close are forfeited for food safety reasons and cannot be refunded.'),
  pickup_delivery_reroute_enabled = coalesce(pickup_delivery_reroute_enabled, true)
where id = 1;

-- 3. Update get_public_store_settings() function to include new controls
create or replace function public.get_public_store_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from (
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
