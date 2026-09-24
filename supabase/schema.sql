-- Furframe Studio assignment demo catalogue.
-- Run in the Supabase SQL Editor. Re-running updates the eight seeded products.
-- Names, descriptions, and prices are demo content based on the Figma prototype.

begin;

create table if not exists public.products (
  id integer primary key,
  slug text not null unique,
  name text not null,
  category text not null check (category in ('Apparel', 'Accessories')),
  color text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  price numeric(10, 2) not null check (price >= 0),
  image_url text not null,
  description text not null,
  featured boolean not null default false,
  display_order integer not null default 0
);

alter table public.products enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;

drop policy if exists "Anyone can read the product catalogue" on public.products;
create policy "Anyone can read the product catalogue"
  on public.products
  for select
  to anon, authenticated
  using (true);

insert into public.products
  (id, slug, name, category, color, color_hex, price, image_url, description, featured, display_order)
values
  (1, 'cotton-vest-pink', 'Cotton Vest', 'Apparel', 'Pink', '#EBC0C3', 89.00,
   '/images/vest-pink.jpg', 'A soft cotton vest for little adventures and everyday comfort.', true, 1),
  (2, 'cotton-vest-off-white', 'Cotton Vest', 'Apparel', 'Off-white', '#EAE5DB', 89.00,
   '/images/vest-off-white.png', 'An easy cotton layer in a warm, everyday neutral.', true, 2),
  (3, 'cotton-vest-blue', 'Cotton Vest', 'Apparel', 'Blue', '#9AB1C4', 89.00,
   '/images/vest-blue.png', 'A comfortable cotton vest in a calm, playful blue.', true, 3),
  (4, 'cotton-vest-green', 'Cotton Vest', 'Apparel', 'Green', '#A6AE93', 89.00,
   '/images/vest-green.png', 'A soft cotton layer made for your companion''s daily walks.', true, 4),
  (5, 'pet-base-t-shirt', 'Pet Base T-shirt', 'Apparel', 'Assorted', '#D6DBD4', 40.00,
   '/images/shirts.jpg', 'A light everyday base layer for your furry friend.', false, 5),
  (6, 'ivory-crossbody-bag', 'Ivory Crossbody Bag', 'Accessories', 'Ivory', '#E8E3D9', 60.00,
   '/images/ivory-crossbody-bag.jpg', 'A compact ivory crossbody bag for keeping everyday walk essentials close.', false, 6),
  (7, 'sandwich-bag-blue', 'Sandwich Bag', 'Accessories', 'Blue', '#B0C1CD', 60.00,
   '/images/bag-blue.png', 'A compact blue companion for everyday outings.', false, 7),
  (8, 'sandwich-bag-pink', 'Sandwich Bag', 'Accessories', 'Pink', '#E5BABF', 60.00,
   '/images/bag-pink.png', 'A playful pink bag for the small things you take along.', false, 8)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  category = excluded.category,
  color = excluded.color,
  color_hex = excluded.color_hex,
  price = excluded.price,
  image_url = excluded.image_url,
  description = excluded.description,
  featured = excluded.featured,
  display_order = excluded.display_order;

commit;
