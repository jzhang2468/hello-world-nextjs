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

## Assignment #3: Google sign-in and profiles

Use the existing Supabase project **Assignment 2** (`uveuzmuimairrazeskhk`), GitHub
repository, and Vercel project. Run `supabase/auth-profiles.sql` in that project's
SQL Editor as `postgres`. It is safe to rerun and does not change products or the
display font. Do not rerun the original product seed for this assignment.

The migration creates `public.profiles` with nullable `first_name` and `last_name`
fields. An `AFTER INSERT` trigger on `auth.users` creates the user's profile with
empty names; existing users are backfilled without overwriting profiles. The app
asks members to complete both names after sign-in. Row Level Security allows each
member to read their own profile and update only their names and avatar path.

Photos go into the private Supabase Storage bucket `avatars`, under
`<user-id>/<random-uuid>.webp`. The app accepts JPEG, PNG, or WebP up to 3 MiB and
re-encodes the image. Only the path is stored in `profiles.avatar_path`; image
bytes are never stored in a database column. Members access their own photos
through expiring signed URLs. Storage policies also restrict uploads and removal
to the member's own folder.

### Google OAuth setup

1. In your own [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   configure the app's branding, audience, and basic `openid`, email, and profile
   scopes. Create an OAuth client with application type **Web application**. If
   the audience remains in Testing, add every account that needs to test sign-in.
2. Add your app origins under **Authorized JavaScript origins**. Under
   **Authorized redirect URIs**, add the Supabase provider callback exactly:
   `https://uveuzmuimairrazeskhk.supabase.co/auth/v1/callback`.
3. In Supabase **Authentication → Sign In / Providers → Google**, enable Google
   and save that client's ID and secret. The Google client secret belongs in
   Supabase's provider settings, never in Git or browser code.
4. In Supabase **Authentication → URL Configuration**, set the Site URL to your
   production callback (`https://hello-world-nextjs-gray.vercel.app/auth/callback`)
   and add the application's callbacks to Redirect URLs:
   `http://localhost:3007/auth/callback` (or the actual local port),
   `https://hello-world-nextjs-gray.vercel.app/auth/callback`, and
   `https://<exact-vercel-deployment-host>/auth/callback` for the preview/submission.
   Add each new immutable deployment's callback before testing sign-in there.

These are two distinct redirects: Google returns to Supabase's
`/auth/v1/callback`; Supabase then returns to this app's **`/auth/callback`**. The
app passes that exact callback URL, with no `next` or other custom query
parameters. The OAuth provider adds its authorization code during the response.

Keep the existing server-only `SUPABASE_URL` and `SUPABASE_ANON_KEY` variables in
`.env.local` and Vercel's Production/Preview settings. No service-role key is
needed. Cookie-based auth uses `@supabase/ssr`; every profile/member request and
profile mutation checks the authenticated user on the server.

Run `supabase/verify-auth-profiles.sql` for read-only schema, trigger, permissions,
and bucket checks. Then test in the deployed preview:

- Logged out, `/profile` and `/members` lead to sign-in, while the catalogue stays
  public.
- First Google sign-in creates one profile and requires both names. Signing in
  again reuses that profile.
- Saving names and uploading a photo persist after refresh; a different account
  cannot read or edit that profile/photo.
- Signing out protects both routes again. Confirm the public preview also opens
  in an incognito window.

Review the working preview before submitting its commit-specific URL. Keep
Vercel deployment protection disabled for the public assignment deployment.

References: [Supabase user profiles and triggers](https://supabase.com/docs/guides/auth/managing-user-data),
[Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), and
[Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).

## Deployment and submission

Keep this repository connected to its existing Vercel project. Set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in the project's Production and Preview
environment variables, then deploy the committed changes. Changes to environment
variables require a new deployment.

Disable Vercel deployment protection for the assignment's public deployment.
Submit the deployment-specific URL from the deployment details, and check that
its source commit matches the pushed GitHub commit. Use that immutable deployment
URL instead of a moving project or branch alias.
