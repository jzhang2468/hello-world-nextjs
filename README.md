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
