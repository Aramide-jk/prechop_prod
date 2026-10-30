-- Mealhr customer backend foundation. Apply with Supabase CLI after reviewing.
create extension if not exists pgcrypto with schema extensions;

create type public.meal_window as enum ('breakfast', 'lunch', 'dinner');
create type public.order_status as enum ('pending_payment', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type public.wallet_entry_kind as enum ('refund', 'order_debit', 'admin_adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  phone_e164 text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null or new.phone = '' then
    raise exception 'A verified phone number is required';
  end if;
  insert into public.profiles(id, full_name, phone_e164)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New customer'), new.phone)
  on conflict (id) do update set phone_e164 = excluded.phone_e164, updated_at = now();
  return new;
end;
$$;
create trigger on_auth_user_created_profile
  after insert or update of phone on auth.users
  for each row execute function public.create_customer_profile();

create table public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee_ngn integer not null check (fee_ngn >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid not null references public.delivery_areas(id),
  label text not null check (char_length(trim(label)) between 2 and 35),
  address text not null check (char_length(trim(address)) between 8 and 300),
  delivery_note text not null default '' check (char_length(delivery_note) <= 200),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_addresses_one_default on public.customer_addresses(customer_id) where is_default;
create index customer_addresses_customer on public.customer_addresses(customer_id, created_at desc);


create table public.delivery_windows (
  id uuid primary key default gen_random_uuid(),
  "window" public.meal_window not null unique,
  active boolean not null default true
);

create table public.delivery_batches (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references public.delivery_windows(id),
  name text not null,
  delivery_starts_at time not null,
  delivery_ends_at time not null,
  cutoff_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint delivery_batch_time_order check (delivery_starts_at < delivery_ends_at),
  unique(window_id, name)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  base_price_ngn integer not null check (base_price_ngn >= 0),
  image_url text not null default '',
  allergen_note text not null default '' check (char_length(allergen_note) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.add_on_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  category text not null check (category in ('protein', 'side', 'drink')),
  price_ngn integer not null check (price_ngn >= 0),
  stock_limit integer not null check (stock_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_proteins (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  addon_id uuid not null references public.add_on_catalog(id) on delete cascade,
  active boolean not null default true,
  unique(meal_id, addon_id)
);

create table public.meal_extras (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  addon_id uuid not null references public.add_on_catalog(id) on delete cascade,
  active boolean not null default true,
  unique(meal_id, addon_id)
);

create table public.meal_stock_pools (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id),
  service_date date not null,
  portion_limit integer not null check (portion_limit >= 0),
  created_at timestamptz not null default now(),
  unique(meal_id, service_date)
);

create table public.batch_menu_items (
  batch_id uuid not null references public.delivery_batches(id),
  stock_pool_id uuid not null references public.meal_stock_pools(id),
  active boolean not null default true,
  primary key(batch_id, stock_pool_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',
  subtotal_ngn integer not null check (subtotal_ngn >= 0),
  delivery_total_ngn integer not null check (delivery_total_ngn >= 0),
  wallet_applied_ngn integer not null default 0 check (wallet_applied_ngn >= 0),
  amount_paid_ngn integer not null default 0 check (amount_paid_ngn >= 0),
  payment_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  batch_id uuid not null references public.delivery_batches(id),
  service_date date not null,
  area_name text not null,
  area_fee_ngn integer not null check (area_fee_ngn >= 0),
  address_label text not null,
  address_text text not null,
  delivery_note text not null default '',
  cutoff_at timestamptz not null,
  status public.order_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  unique(order_id, batch_id, service_date)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.order_deliveries(id) on delete cascade,
  stock_pool_id uuid not null references public.meal_stock_pools(id),
  meal_name text not null,
  base_price_ngn integer not null check (base_price_ngn >= 0),
  protein_name text,
  protein_price_ngn integer not null default 0 check (protein_price_ngn >= 0),
  extras_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(extras_snapshot) = 'array'),
  created_at timestamptz not null default now()
);
create index order_items_stock_pool on public.order_items(stock_pool_id);

-- Sticker IDs are allocated by trusted server code only after preparation begins.
create sequence public.plate_sticker_ids start with 1001 minvalue 1001;
create table public.plate_stickers (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  sticker_id bigint not null unique default nextval('public.plate_sticker_ids'),
  allocated_at timestamptz not null default now()
);

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  kind public.wallet_entry_kind not null,
  amount_ngn integer not null check (amount_ngn <> 0),
  description text not null check (char_length(description) between 2 and 200),
  created_at timestamptz not null default now()
);
create index wallet_entries_customer_date on public.wallet_entries(customer_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.delivery_windows enable row level security;
alter table public.delivery_batches enable row level security;
alter table public.meals enable row level security;
alter table public.add_on_catalog enable row level security;
alter table public.meal_proteins enable row level security;
alter table public.meal_extras enable row level security;
alter table public.meal_stock_pools enable row level security;
alter table public.batch_menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_deliveries enable row level security;
alter table public.order_items enable row level security;
alter table public.plate_stickers enable row level security;
alter table public.wallet_entries enable row level security;

create policy "Customer can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Customer can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Customer manages own addresses" on public.customer_addresses for all to authenticated using ((select auth.uid()) = customer_id) with check ((select auth.uid()) = customer_id);

create policy "Public can read active areas" on public.delivery_areas for select to anon, authenticated using (active);
create policy "Public can read active windows" on public.delivery_windows for select to anon, authenticated using (active);
create policy "Public can read active batches" on public.delivery_batches for select to anon, authenticated using (active and exists (select 1 from public.delivery_windows w where w.id = window_id and w.active));
create policy "Public can read active meals" on public.meals for select to anon, authenticated using (active);
create policy "Public can read active add-ons" on public.add_on_catalog for select to anon, authenticated using (active);
create policy "Public can read active meal proteins" on public.meal_proteins for select to anon, authenticated using (active and exists (select 1 from public.meals m where m.id = meal_id and m.active));
create policy "Public can read active meal extras" on public.meal_extras for select to anon, authenticated using (active and exists (select 1 from public.meals m where m.id = meal_id and m.active));
create policy "Public can read future stock pools" on public.meal_stock_pools for select to anon, authenticated using (service_date >= (now() at time zone 'Africa/Lagos')::date);
create policy "Public can read active batch menu" on public.batch_menu_items for select to anon, authenticated using (active and exists (select 1 from public.delivery_batches b where b.id = batch_id and b.active));

create function public.get_customer_menu(p_service_date date, p_days integer default 7)
returns table (
  service_date date,
  "window" public.meal_window,
  meal_id uuid,
  slug text,
  name text,
  description text,
  base_price_ngn integer,
  image_url text,
  allergen_note text,
  stock_limit integer,
  stock_remaining integer,
  proteins jsonb,
  extras jsonb,
  batches jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pool.service_date, w."window", m.id, m.slug, m.name, m.description, m.base_price_ngn,
         m.image_url, m.allergen_note, pool.portion_limit,
         greatest(0, pool.portion_limit - coalesce(sold.portions, 0))::integer,
         coalesce(proteins.items, '[]'::jsonb), coalesce(extras.items, '[]'::jsonb),
         batches.items
  from public.meal_stock_pools pool
  join public.meals m on m.id = pool.meal_id and m.active
  join (
    select distinct bm.stock_pool_id, b.window_id
    from public.batch_menu_items bm
    join public.delivery_batches b on b.id = bm.batch_id and b.active
    join public.delivery_windows dw on dw.id = b.window_id and dw.active
    where bm.active
  ) available on available.stock_pool_id = pool.id
  join public.delivery_windows w on w.id = available.window_id and w.active
  left join lateral (
    select count(*)::integer as portions
    from public.order_items oi
    join public.order_deliveries od on od.id = oi.delivery_id
    join public.orders o on o.id = od.order_id
    where oi.stock_pool_id = pool.id and o.payment_status = 'succeeded' and o.status <> 'cancelled'
  ) sold on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'price_ngn', a.price_ngn, 'stock_limit', a.stock_limit) order by a.name) as items
    from public.meal_proteins mp join public.add_on_catalog a on a.id = mp.addon_id and a.active where mp.meal_id = m.id and mp.active
  ) proteins on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'price_ngn', a.price_ngn, 'category', a.category, 'stock_limit', a.stock_limit) order by a.name) as items
    from public.meal_extras me join public.add_on_catalog a on a.id = me.addon_id and a.active where me.meal_id = m.id and me.active
  ) extras on true
  join lateral (
    select jsonb_agg(jsonb_build_object('id', batch.id, 'name', batch.name,
      'starts_at', batch.delivery_starts_at, 'ends_at', batch.delivery_ends_at, 'cutoff', batch.cutoff_time)
      order by batch.delivery_starts_at) as items
    from public.batch_menu_items bm
    join public.delivery_batches batch on batch.id = bm.batch_id and batch.active
    where bm.stock_pool_id = pool.id and bm.active and batch.window_id = w.id
  ) batches on batches.items is not null
  where pool.service_date >= p_service_date
    and pool.service_date < p_service_date + least(greatest(p_days, 1), 14)
  order by pool.service_date, w."window", m.name;
$$;
-- This read-only function needs to count paid orders that anonymous menu visitors
-- cannot select directly. Its output contains only public catalogue and stock data.
alter function public.get_customer_menu(date, integer) security definer;
alter function public.get_customer_menu(date, integer) set search_path = '';
grant execute on function public.get_customer_menu(date, integer) to anon, authenticated;

-- Seed the initial delivery windows and service areas. Owner can edit these in Supabase.
insert into public.delivery_windows("window") values ('breakfast'), ('lunch'), ('dinner') on conflict ("window") do nothing;
insert into public.delivery_batches(window_id, name, delivery_starts_at, delivery_ends_at, cutoff_time)
select w.id, b.name, b.starts_at, b.ends_at, b.cutoff
from public.delivery_windows w
join (values
  ('breakfast'::public.meal_window, 'Morning', time '08:00', time '10:00', time '06:00'),
  ('breakfast'::public.meal_window, 'Late morning', time '10:00', time '12:00', time '08:00'),
  ('lunch'::public.meal_window, 'Afternoon', time '12:00', time '14:00', time '10:00'),
  ('dinner'::public.meal_window, 'Evening', time '18:00', time '20:00', time '15:00')
) as b("window", name, starts_at, ends_at, cutoff) on b."window" = w."window"
on conflict (window_id, name) do nothing;

insert into public.add_on_catalog(slug, name, category, price_ngn, stock_limit) values
  ('chicken', 'Chicken', 'protein', 800, 25), ('beef', 'Beef', 'protein', 500, 18),
  ('fish', 'Fish', 'protein', 700, 12), ('egg', 'Egg', 'protein', 300, 18),
  ('coleslaw', 'Coleslaw', 'side', 400, 10), ('plantain', 'Plantain', 'side', 500, 12),
  ('water', 'Bottled water', 'drink', 300, 24)
on conflict (slug) do nothing;

insert into public.meals(slug, name, description, base_price_ngn, image_url, allergen_note) values
  ('jollof', 'Smoky jollof rice', 'Slow-cooked in a rich tomato sauce. A little smoky, a lot to love.', 1500, '/images/jollof.png', 'Ask about seasoning allergens before ordering.'),
  ('beans', 'Beans & plantain', 'Soft honey beans with sweet, golden plantain. Comfort on a plate.', 1800, '/images/beans.png', 'No declared allergens. Cross-contact may occur.'),
  ('yam', 'Yam & egg sauce', 'Tender yam, fresh tomatoes and a generous spoonful of egg sauce.', 2200, '/images/yam.png', 'Contains egg.')
on conflict (slug) do nothing;

insert into public.meal_proteins(meal_id, addon_id)
select m.id, a.id from public.meals m cross join public.add_on_catalog a
where (m.slug = 'jollof' and a.slug in ('chicken', 'beef', 'fish', 'egg'))
   or (m.slug = 'beans' and a.slug in ('chicken', 'fish', 'egg'))
   or (m.slug = 'yam' and a.slug in ('chicken', 'beef', 'fish'))
on conflict (meal_id, addon_id) do nothing;
insert into public.meal_extras(meal_id, addon_id)
select m.id, a.id from public.meals m cross join public.add_on_catalog a
where (m.slug = 'jollof' and a.slug in ('chicken', 'beef', 'egg', 'coleslaw', 'plantain', 'water'))
   or (m.slug = 'beans' and a.slug in ('chicken', 'egg', 'coleslaw', 'plantain', 'water'))
   or (m.slug = 'yam' and a.slug in ('chicken', 'beef', 'coleslaw', 'plantain', 'water'))
on conflict (meal_id, addon_id) do nothing;
insert into public.meal_stock_pools(meal_id, service_date, portion_limit)
select m.id, ((now() at time zone 'Africa/Lagos')::date + days.day_offset)::date,
       case m.slug when 'jollof' then 30 when 'beans' then 20 else 12 end
from public.meals m cross join generate_series(0, 13) as days(day_offset)
on conflict (meal_id, service_date) do nothing;
insert into public.batch_menu_items(batch_id, stock_pool_id)
select b.id, p.id from public.delivery_batches b cross join public.meal_stock_pools p
where p.service_date between (now() at time zone 'Africa/Lagos')::date
  and (now() at time zone 'Africa/Lagos')::date + 13
on conflict (batch_id, stock_pool_id) do nothing;

insert into public.delivery_areas(name, fee_ngn) values
  ('ABU · Samaru campus', 500), ('Samaru', 700), ('Sabon Gari', 1000)
on conflict (name) do nothing;

create policy "Customer reads own orders" on public.orders for select to authenticated using ((select auth.uid()) = customer_id);
create policy "Customer reads own delivery details" on public.order_deliveries for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));
create policy "Customer reads own order items" on public.order_items for select to authenticated using (exists (select 1 from public.order_deliveries d join public.orders o on o.id = d.order_id where d.id = delivery_id and o.customer_id = (select auth.uid())));
create policy "Customer reads stickers after preparation" on public.plate_stickers for select to authenticated using (exists (select 1 from public.order_items i join public.order_deliveries d on d.id = i.delivery_id join public.orders o on o.id = d.order_id where i.id = order_item_id and o.customer_id = (select auth.uid()) and d.status in ('preparing', 'out_for_delivery', 'delivered')));
create policy "Customer reads own wallet" on public.wallet_entries for select to authenticated using ((select auth.uid()) = customer_id);

-- Browser clients cannot create paid orders, set payment state, allocate plate codes,
-- write wallet balances or administer catalogue data. Trusted server functions and
-- service-role code must validate payment webhooks before changing those records.
revoke insert, update, delete on public.orders, public.order_deliveries, public.order_items, public.plate_stickers, public.wallet_entries from anon, authenticated;
revoke insert, update, delete on public.meals, public.add_on_catalog, public.meal_proteins, public.meal_extras, public.meal_stock_pools, public.batch_menu_items, public.delivery_batches, public.delivery_windows, public.delivery_areas from anon, authenticated;
grant select on public.delivery_areas, public.delivery_windows, public.delivery_batches, public.meals, public.add_on_catalog, public.meal_proteins, public.meal_extras, public.meal_stock_pools, public.batch_menu_items to anon, authenticated;
grant select on public.profiles, public.customer_addresses, public.orders, public.order_deliveries, public.order_items, public.plate_stickers, public.wallet_entries to authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;
grant insert, update, delete on public.customer_addresses to authenticated;
