-- Stores the admin-selected image URL for each shared protein, side or drink.
alter table public.add_on_catalog
  add column if not exists image_url text not null default '';
