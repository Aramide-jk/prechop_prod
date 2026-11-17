-- 202610060016_admin_team_manager.sql
-- Admin Team Manager: allows admins to manage admin phone numbers, delegate roles,
-- pre-approve new staff phone numbers, and switch login numbers with zero risk of lockout.

-- 1. Ensure id column exists and is primary key
alter table public.admin_users add column if not exists id uuid default gen_random_uuid();

do $$
begin
  -- Drop old primary key on user_id if present
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'admin_users' and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'admin_users_pkey'
  ) then
    alter table public.admin_users drop constraint admin_users_pkey;
  end if;
exception when others then
  null;
end $$;

-- Set ids for existing records and establish primary key on id
update public.admin_users set id = gen_random_uuid() where id is null;
alter table public.admin_users alter column id set not null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'admin_users' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table public.admin_users add primary key (id);
  end if;
exception when others then
  null;
end $$;

-- 2. Allow user_id to be nullable for pre-approved phone numbers before first sign-in
alter table public.admin_users alter column user_id drop not null;

-- 3. Add phone_e164, full_name, role, and timestamps
alter table public.admin_users
  add column if not exists phone_e164 text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'super_admin',
  add column if not exists updated_at timestamptz not null default now();

-- Unique index on phone_e164
create unique index if not exists idx_admin_users_phone_e164
  on public.admin_users (phone_e164) where phone_e164 is not null;

-- Backfill phone_e164 and full_name for existing admins from profiles
update public.admin_users au
set phone_e164 = p.phone_e164,
    full_name = coalesce(au.full_name, p.full_name)
from public.profiles p
where au.user_id = p.id and (au.phone_e164 is null or au.phone_e164 = '');

-- 4. Update is_admin_user() to check both user_id and phone_e164
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
    or exists (
      select 1 from public.admin_users au
      join public.profiles p on p.id = auth.uid()
      where au.phone_e164 = p.phone_e164
    )
  );
$$;

revoke all on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated;

-- 5. Auto-link user_id when a pre-approved admin phone signs in
create or replace function public.link_admin_user_on_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_users
  set user_id = new.id,
      full_name = coalesce(nullif(public.admin_users.full_name, ''), new.full_name),
      updated_at = now()
  where phone_e164 = new.phone_e164 and (user_id is null or user_id <> new.id);
  return new;
end;
$$;

drop trigger if exists trg_link_admin_user on public.profiles;
create trigger trg_link_admin_user
after insert or update of phone_e164 on public.profiles
for each row execute function public.link_admin_user_on_login();
