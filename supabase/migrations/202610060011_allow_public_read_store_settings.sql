-- 202610060011_allow_public_read_store_settings.sql
-- Fixes RLS on referral_campaign_settings so store operational and fulfillment settings
-- are always readable by anon and authenticated customers regardless of whether referral campaign is enabled.

-- 1. Update SELECT policy on referral_campaign_settings
drop policy if exists "Anyone can read referral campaign settings" on public.referral_campaign_settings;

create policy "Anyone can read referral campaign settings"
  on public.referral_campaign_settings
  for select
  to anon, authenticated
  using (true);

-- 2. Update get_public_store_settings() helper function to include fulfillment settings
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
      pickup_instructions
    from public.referral_campaign_settings
    where id = 1
  ) s;
$$;

grant execute on function public.get_public_store_settings() to anon, authenticated;
