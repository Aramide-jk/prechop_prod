-- Customer referral campaign. Campaign values are managed by the operator in
-- Supabase (or through a future admin dashboard); browser clients are read-only.

alter table public.profiles
  add column if not exists referral_code text not null
    default lower(encode(extensions.gen_random_bytes(6), 'hex'));

create unique index if not exists profiles_referral_code_unique
  on public.profiles (referral_code);

create table if not exists public.referral_campaign_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  referrals_required integer not null default 5 check (referrals_required between 1 and 1000),
  reward_amount_ngn integer not null default 1500 check (reward_amount_ngn between 1 and 100000000),
  updated_at timestamptz not null default now()
);

insert into public.referral_campaign_settings (id, enabled, referrals_required, reward_amount_ngn)
values (1, true, 5, 1500)
on conflict (id) do nothing;

create table if not exists public.customer_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_customer_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  qualifying_order_id uuid unique references public.orders(id),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint customer_referrals_no_self_referral check (referrer_id <> referred_customer_id)
);

create index if not exists customer_referrals_referrer_status
  on public.customer_referrals (referrer_id, status, created_at desc);

create table if not exists public.referral_campaign_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null unique references public.profiles(id) on delete cascade,
  wallet_entry_id uuid not null unique references public.wallet_entries(id),
  referrals_required integer not null,
  reward_amount_ngn integer not null,
  awarded_at timestamptz not null default now()
);

alter table public.referral_campaign_settings enable row level security;
alter table public.customer_referrals enable row level security;
alter table public.referral_campaign_rewards enable row level security;

create policy "Anyone can read referral campaign settings"
  on public.referral_campaign_settings for select to anon, authenticated using (enabled);
create policy "Customers can read their referrals"
  on public.customer_referrals for select to authenticated using (referrer_id = (select auth.uid()));
create policy "Customers can read their referral rewards"
  on public.referral_campaign_rewards for select to authenticated using (referrer_id = (select auth.uid()));

revoke all on public.referral_campaign_settings, public.customer_referrals, public.referral_campaign_rewards from anon, authenticated;
grant select on public.referral_campaign_settings to anon, authenticated;
grant select on public.customer_referrals, public.referral_campaign_rewards to authenticated;
create or replace function public.attribute_customer_referral(p_referral_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_referrer uuid;
begin
  if v_customer is null or p_referral_code is null then return false; end if;
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
begin
  if new.status <> 'confirmed' or new.payment_status <> 'succeeded'
     or (old.status = new.status and old.payment_status = new.payment_status) then
    return new;
  end if;

  select * into v_settings
    from public.referral_campaign_settings where id = 1 for update;
  if not found or not v_settings.enabled then return new; end if;

  for v_referral in
    update public.customer_referrals
      set status = 'qualified', qualifying_order_id = new.id, qualified_at = now()
      where referred_customer_id = new.customer_id and status = 'pending'
      returning referrer_id
  loop
    select count(*)::integer into v_qualified_count
      from public.customer_referrals
      where referrer_id = v_referral.referrer_id and status = 'qualified';

    if v_qualified_count >= v_settings.referrals_required
       and not exists (
         select 1 from public.referral_campaign_rewards
         where referrer_id = v_referral.referrer_id
       ) then
      insert into public.wallet_entries (customer_id, order_id, kind, amount_ngn, description)
      values (
        v_referral.referrer_id,
        null,
        'admin_adjustment',
        v_settings.reward_amount_ngn,
        'PreChop referral campaign reward'
      ) returning id into v_wallet_entry;

      insert into public.referral_campaign_rewards
        (referrer_id, wallet_entry_id, referrals_required, reward_amount_ngn)
      values
        (v_referral.referrer_id, v_wallet_entry, v_settings.referrals_required, v_settings.reward_amount_ngn);
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.attribute_customer_referral(text) from public, anon;
grant execute on function public.attribute_customer_referral(text) to authenticated;
revoke all on function public.reward_referral_campaign_order() from public, anon, authenticated;

drop trigger if exists reward_referral_campaign_after_order_confirmation on public.orders;
create trigger reward_referral_campaign_after_order_confirmation
  after update of status, payment_status on public.orders
  for each row execute function public.reward_referral_campaign_order();

comment on table public.referral_campaign_settings is
  'Operator-managed campaign settings. Change referrals_required and reward_amount_ngn in Supabase; never grant browser update access.';

notify pgrst, 'reload schema';
