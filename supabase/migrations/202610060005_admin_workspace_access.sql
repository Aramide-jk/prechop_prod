-- Admin workspace access. Customer roles remain read-only for catalogue and
-- operational data; approved admins receive only the access needed by the UI.

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated;

create policy "Admins manage delivery areas" on public.delivery_areas
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage delivery windows" on public.delivery_windows
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage delivery batches" on public.delivery_batches
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage meals" on public.meals
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage add-on catalogue" on public.add_on_catalog
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage meal proteins" on public.meal_proteins
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage meal extras" on public.meal_extras
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage meal stock pools" on public.meal_stock_pools
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins manage batch menu items" on public.batch_menu_items
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins read customer profiles" on public.profiles
  for select to authenticated using (public.is_admin_user());
create policy "Admins read orders" on public.orders
  for select to authenticated using (public.is_admin_user());
create policy "Admins read order deliveries" on public.order_deliveries
  for select to authenticated using (public.is_admin_user());
create policy "Admins read order items" on public.order_items
  for select to authenticated using (public.is_admin_user());
create policy "Admins read plate stickers" on public.plate_stickers
  for select to authenticated using (public.is_admin_user());
create policy "Admins read wallet entries" on public.wallet_entries
  for select to authenticated using (public.is_admin_user());
create policy "Admins read delivery refunds" on public.customer_delivery_refunds
  for select to authenticated using (public.is_admin_user());
create policy "Admins read wallet reservations" on public.wallet_credit_reservations
  for select to authenticated using (public.is_admin_user());
create policy "Admins manage referral campaign settings" on public.referral_campaign_settings
  for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "Admins read referrals" on public.customer_referrals
  for select to authenticated using (public.is_admin_user());
create policy "Admins read referral rewards" on public.referral_campaign_rewards
  for select to authenticated using (public.is_admin_user());

grant select, insert, update, delete on public.delivery_areas, public.delivery_windows,
  public.delivery_batches, public.meals, public.add_on_catalog, public.meal_proteins,
  public.meal_extras, public.meal_stock_pools, public.batch_menu_items,
  public.referral_campaign_settings to authenticated;
grant select on public.profiles, public.orders, public.order_deliveries,
  public.order_items, public.plate_stickers, public.wallet_entries,
  public.customer_delivery_refunds, public.wallet_credit_reservations,
  public.customer_referrals, public.referral_campaign_rewards to authenticated;

notify pgrst, 'reload schema';
