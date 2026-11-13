-- Full-Control Store and Application Operations Settings Migration
-- Gives store operators complete control over store status, ordering rules, customer support channels,
-- marketing announcements, delivery thresholds, referral loyalty, and business identity.

-- 1. Add all configuration columns to referral_campaign_settings
alter table public.referral_campaign_settings
  add column if not exists whatsapp_number text not null default '+2348031234567',
  add column if not exists support_email text not null default 'support@prechop.com',
  add column if not exists dispatch_phone text not null default '+2348031234567',
  add column if not exists support_hours text not null default 'Mon–Sat: 7:00 AM – 8:30 PM',
  add column if not exists announcement_banner text not null default '',
  add column if not exists service_active boolean not null default true,
  add column if not exists service_paused_message text not null default 'Our kitchen is currently closed for orders. Please check back shortly.',
  add column if not exists allow_same_day_ordering boolean not null default true,
  add column if not exists advance_order_days integer not null default 7 check (advance_order_days between 1 and 30),
  add column if not exists min_order_amount_ngn integer not null default 0 check (min_order_amount_ngn >= 0),
  add column if not exists max_plates_per_order integer not null default 20 check (max_plates_per_order between 1 and 100),
  add column if not exists free_delivery_threshold_ngn integer not null default 0 check (free_delivery_threshold_ngn >= 0),
  add column if not exists business_name text not null default 'PreChop',
  add column if not exists service_area_tagline text not null default 'ABU Samaru, Kongo & Sabon Gari, Zaria',
  add column if not exists footer_tagline text not null default 'Good food, planned around you.';

-- 2. Seed or update record id = 1 with complete defaults
insert into public.referral_campaign_settings (
  id, enabled, referrals_required, reward_amount_ngn,
  whatsapp_number, support_email, dispatch_phone, support_hours,
  announcement_banner, service_active, service_paused_message,
  allow_same_day_ordering, advance_order_days, min_order_amount_ngn,
  max_plates_per_order, free_delivery_threshold_ngn, business_name,
  service_area_tagline, footer_tagline
) values (
  1, true, 5, 1500,
  '+2348031234567', 'support@prechop.com', '+2348031234567', 'Mon–Sat: 7:00 AM – 8:30 PM',
  '', true, 'Our kitchen is currently closed for orders. Please check back shortly.',
  true, 7, 0,
  20, 0, 'PreChop',
  'ABU Samaru, Kongo & Sabon Gari, Zaria', 'Good food, planned around you.'
)
on conflict (id) do update set
  whatsapp_number = coalesce(nullif(referral_campaign_settings.whatsapp_number, ''), excluded.whatsapp_number),
  support_email = coalesce(nullif(referral_campaign_settings.support_email, ''), excluded.support_email),
  dispatch_phone = coalesce(nullif(referral_campaign_settings.dispatch_phone, ''), excluded.dispatch_phone),
  support_hours = coalesce(nullif(referral_campaign_settings.support_hours, ''), excluded.support_hours),
  service_active = coalesce(referral_campaign_settings.service_active, excluded.service_active),
  service_paused_message = coalesce(nullif(referral_campaign_settings.service_paused_message, ''), excluded.service_paused_message),
  allow_same_day_ordering = coalesce(referral_campaign_settings.allow_same_day_ordering, excluded.allow_same_day_ordering),
  advance_order_days = coalesce(referral_campaign_settings.advance_order_days, excluded.advance_order_days),
  min_order_amount_ngn = coalesce(referral_campaign_settings.min_order_amount_ngn, excluded.min_order_amount_ngn),
  max_plates_per_order = coalesce(referral_campaign_settings.max_plates_per_order, excluded.max_plates_per_order),
  free_delivery_threshold_ngn = coalesce(referral_campaign_settings.free_delivery_threshold_ngn, excluded.free_delivery_threshold_ngn),
  business_name = coalesce(nullif(referral_campaign_settings.business_name, ''), excluded.business_name),
  service_area_tagline = coalesce(nullif(referral_campaign_settings.service_area_tagline, ''), excluded.service_area_tagline),
  footer_tagline = coalesce(nullif(referral_campaign_settings.footer_tagline, ''), excluded.footer_tagline);

-- 3. RLS Policies: Ensure authenticated admins can read and update all settings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_campaign_settings'
      and policyname = 'Admins can update referral campaign settings'
  ) then
    create policy "Admins can update referral campaign settings"
      on public.referral_campaign_settings for update
      to authenticated
      using (public.is_admin_user())
      with check (public.is_admin_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_campaign_settings'
      and policyname = 'Admins can insert referral campaign settings'
  ) then
    create policy "Admins can insert referral campaign settings"
      on public.referral_campaign_settings for insert
      to authenticated
      with check (public.is_admin_user());
  end if;
end $$;

-- 4. Public Helper RPC: get_public_store_settings
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
      reward_amount_ngn
    from public.referral_campaign_settings
    where id = 1
  ) s;
$$;

grant execute on function public.get_public_store_settings() to anon, authenticated;
