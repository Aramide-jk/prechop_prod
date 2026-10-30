-- Keep the customer's preferred receipt and delivery email with their account.
alter table public.profiles
  add column if not exists email text;

update public.profiles as p
set email = u.email
from auth.users as u
where u.id = p.id
  and p.email is null
  and u.email is not null;

grant update (email, updated_at) on public.profiles to authenticated;

notify pgrst, 'reload schema';
