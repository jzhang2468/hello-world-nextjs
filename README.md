# Furframe Studio

Jennifer Zhang's Furframe Studio catalogue, extending the original Hello World
Next.js app from Assignment #1. The interface follows the
[Furframe Studio Figma prototype](https://www.figma.com/design/MkDjTEVbU3up5MAB6TZc8X/Furframe-Studio-Prototype?node-id=0-1).

The product list reads rows from Supabase at request time. Product names, prices,
descriptions, and images are a demo catalogue for the assignment; this app does
not process purchases.

## Local setup

1. Run `npm install`.
2. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
   It creates `public.products`, eight demo products, and a public read-only
   access policy. Running it again updates the same eight demo rows.
   Then run `supabase/site-settings.sql` to add the display-font setting. This
   separate migration preserves existing products and any saved font choice.
3. Copy `.env.example` to `.env.local` and set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` using the project's URL and anon key. Do not use a
   `service_role` key. `.env.local` is excluded from Git.
4. Run `npm run dev` and open [localhost:3000](http://localhost:3000).

The environment variables and Supabase client stay in the server-only data
module. The list has separate empty and error states; a failed query never
silently substitutes static products.

## Database access

Row Level Security is enabled on `public.products`. The `anon` and
`authenticated` roles have only `SELECT` permission; neither role can insert,
update, or delete products. The application uses the low-privilege anon key for
all catalogue queries and selects explicit columns in display order.

## Change the display font

In Supabase, open **Table Editor → site_settings** and edit `display_font` on
the row whose `id` is `global`. Choose one of these exact values:

| Value | Display font |
| --- | --- |
| `alfa-slab` | Alfa Slab One (original design) |
| `georgia` | Georgia |
| `dm-sans` | DM Sans |

Save the row, then refresh the same deployed page URL. The app reads this setting
on every request without caching it, so changing the font requires no code commit
or redeployment. If the setting is unavailable, the original Alfa Slab One font
is used. Do not rerun the product seed SQL just to change a font.

The website has no public settings editor or admin route. The `site_settings`
table also uses Row Level Security and grants visitors only `SELECT` permission;
changes are made through the authorized Supabase dashboard.

## Validation

Run `npm run lint` and `npm run build`. The build does not require a database
query: `connection()` delays catalogue loading until a request arrives.

After configuring Supabase, verify that the live list shows all eight seeded
products. Updating a product in Supabase should appear on the next page load.
Check a private/incognito window as well.

## Deployment and submission

Keep this repository connected to its existing Vercel project. Set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in the project's Production and Preview
environment variables, then deploy the committed changes. Changes to environment
variables require a new deployment.

Disable Vercel deployment protection for the assignment's public deployment.
Submit the deployment-specific URL from the deployment details, and check that
its source commit matches the pushed GitHub commit. Use that immutable deployment
URL instead of a moving project or branch alias.
