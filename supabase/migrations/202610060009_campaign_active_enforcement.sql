-- Strict Campaign Active State Enforcement
-- Prevents new referral invitations and attribution when campaign is disabled by admin,
-- while safely preserving all existing customer referral records and reward progress.

create or replace function public.attribute_customer_referral(p_referral_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_referrer uuid;
  v_enabled boolean;
begin
  if v_customer is null or p_referral_code is null then
    return false;
  end if;

  -- 1. Strictly verify the referral campaign is active
  select enabled into v_enabled
  from public.referral_campaign_settings
  where id = 1;

  if not coalesce(v_enabled, false) then
    return false;
  end if;

  -- 2. Find matching referrer profile
  select p.id into v_referrer
  from public.profiles as p
  where lower(p.referral_code) = lower(trim(p_referral_code));

  if v_referrer is null or v_referrer = v_customer then
    return false;
  end if;

  -- 3. Attribute referral (on conflict do nothing preserves first attribution)
  insert into public.customer_referrals (referrer_id, referred_customer_id)
  values (v_referrer, v_customer)
  on conflict (referred_customer_id) do nothing;

  return found;
end;
$$;

revoke all on function public.attribute_customer_referral(text) from public, anon;
grant execute on function public.attribute_customer_referral(text) to authenticated;
