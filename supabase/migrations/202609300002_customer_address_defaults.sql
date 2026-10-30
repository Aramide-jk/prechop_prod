-- Keep customer address default changes atomic and limited to the signed-in customer.
create or replace function public.set_default_customer_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;
  update public.customer_addresses
    set is_default = false, updated_at = pg_catalog.now()
    where customer_id = (select auth.uid()) and is_default;
  update public.customer_addresses
    set is_default = true, updated_at = pg_catalog.now()
    where id = p_address_id and customer_id = (select auth.uid());
  if not found then
    raise exception 'Saved address not found';
  end if;
end;
$$;
revoke all on function public.set_default_customer_address(uuid) from public, anon;
grant execute on function public.set_default_customer_address(uuid) to authenticated;
