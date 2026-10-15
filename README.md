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
needed. Cookie-based auth uses `@supabase/ssr`; every profile request and
profile mutation checks the authenticated user on the server.

Run `supabase/verify-auth-profiles.sql` for read-only schema, trigger, permissions,
and bucket checks. Then test in the deployed preview:

- Logged out, `/profile` leads to sign-in, while the catalogue stays public.
- First Google sign-in creates one profile and requires both names. Signing in
  again reuses that profile.
- Saving names and uploading a photo persist after refresh; a different account
  cannot read or edit that profile/photo.
- Signing out protects the profile route again. Confirm the public preview also opens
  in an incognito window.

Review the working preview before submitting its commit-specific URL. Keep
Vercel deployment protection disabled for the public assignment deployment.

References: [Supabase user profiles and triggers](https://supabase.com/docs/guides/auth/managing-user-data),
[Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), and
[Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).

## Assignment #4: Caption Club

`/captions` adds a photo-lab experience to the existing FurFrame app. Members can
upload a pet-related photo, choose a humor style, generate three captions, and rate individual
captions. The public page shows clearly labelled examples; member uploads and
voting require verified Supabase authentication.

Successful sign-in returns to `/captions`. New users first complete their names
on `/profile`; their first successful save then returns them to Caption Club.
Later profile edits stay on the profile page. The old membership landing page
has been removed; `/members` redirects to `/captions` for existing bookmarks.
OAuth still uses exactly `/auth/callback`, without custom redirect parameters.

### Setup and prompt chain

1. Run `supabase/caption-club.sql` in the existing project's SQL Editor. It adds
   `caption_images`, `captions`, `caption_votes`, `caption_generation_steps`, and the private `caption-images`
   Storage bucket. It preserves the existing catalogue, profiles, and font value.
2. Add `OPENAI_API_KEY` to ignored `.env.local`. The optional
   `OPENAI_CAPTION_MODEL` defaults to `gpt-4.1-mini`. Never expose the API key in
   a `NEXT_PUBLIC_` variable or commit it to Git.
3. Run `node scripts/setup-caption-pipeline.mjs`. This generates a server-only
   `CAPTION_PIPELINE_SECRET` in ignored `.env.local` and an ignored
   `.env.caption-pipeline-setup.sql` containing only its SHA-256 verifier. Run that
   SQL in the same project after the migration. Neither value belongs in Git.
4. Run `npm run dev -- --port 3007` and review
   [Caption Club locally](http://localhost:3007/captions).

Generation uses two separate server-side Responses API calls. The first checks
that a pet or clearly pet-related care/items are a main visible subject and describes
the uploaded image. Only an explicit boolean approval proceeds; unrelated photos
receive a pet-only popup and never reach caption generation or the gallery. Missing
or malformed decisions fail closed. Rejected private uploads are removed after the
session is marked failed, while its prompt record and rate-limit accounting remain.
The second call receives only the approved description and the selected
tone, and returns three captions as validated structured output. The app does not
substitute sample captions when generation fails. The model and prompt version
are recorded with each image session. Before each provider call, the exact
instructions, text input, model, output schema, and output-token limit are saved
in `caption_generation_steps`. The first step records the Storage path instead
of image bytes; the second records the actual description sent to the model.
These immutable records are readable only by the image owner. A prompt-save
failure stops that provider call. Older sessions retain their original version
label; missing historical prompts are never invented. API requests use `store: false`.

Caption uploads accept still JPEG, PNG, WebP, HEIC, or HEIF up to 3 MiB.
HEIC/HEIF photos are automatically converted in the browser with the lazily
loaded [heic-to](https://github.com/hoppergee/heic-to) decoder and resized to
1200 pixels before uploading as JPEG. The server still independently decodes
and re-encodes every upload as WebP, strips metadata, and limits dimensions to
1200 pixels. Original HEIC files are never uploaded to Storage or the model.
Only Storage paths and text go into the relational tables. Signed image URLs
expire after 30 minutes; refreshing the page obtains fresh URLs.

### Data permissions

- RLS is enabled on all application tables. Existing products and font settings
  remain publicly readable; profiles and avatars remain private to their owner.
- Signed-in members can see completed caption sessions. Processing and failed
  sessions are visible only to their owner.
- New image sessions and completed caption sets use ownership-checked database
  functions requiring the server-only pipeline secret as well as the member
  session. Browser users cannot directly reserve, fabricate, or complete AI
  results. Completion requires both immutable prompt snapshots and saves all
  three captions and the ready state atomically.
- Each member can insert their own vote and change only its value. A unique
  `(user_id, caption_id)` constraint prevents duplicate votes. Raw voting records
  remain private; an authenticated aggregate function returns counts only.
- The database limits generation reservations to ten per member in a rolling
  24-hour window, with a 30-second interval between starts. Failed attempts count
  toward this limit. No service-role key is used by the app.

### Review before publishing

Run lint, automated tests, and the production build, plus the read-only checks in
`supabase/verify-caption-club.sql`. Test the real upload-to-generation flow, votes
after refresh, vote changes, and signed-out access in the local preview. Verify
that another user cannot change an image session, profile, or vote they do not own.

The user requested a local preview **before deploying to Vercel**. Do not push
this branch or deploy until the preview is approved: the connected GitHub repo
can automatically trigger Vercel deployments. After approval, configure the LLM
`OPENAI_API_KEY` and the same `CAPTION_PIPELINE_SECRET` in Vercel, deploy, add the new exact `/auth/callback` URL to Supabase's redirect
allowlist, and verify public access before submitting the immutable deployment URL.

References: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Deployment and submission

Keep this repository connected to its existing Vercel project. Set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` in the project's Production and Preview
environment variables, then deploy the committed changes. Changes to environment
variables require a new deployment.

Disable Vercel deployment protection for the assignment's public deployment.
Submit the deployment-specific URL from the deployment details, and check that
its source commit matches the pushed GitHub commit. Use that immutable deployment
URL instead of a moving project or branch alias.

### Product hypotheses and member sharing

FurFrame focuses on pet photos from home, everyday companions, and pet-related
moments for Sam, our Columbia junior persona. The upload flow leads directly to
photo selection, with no daily-assignment card. A server-side vision check keeps
new generations relevant to pets. This check uses model judgment and can make
mistakes; unclear photos are rejected with an invitation to choose a clearer one.
Existing photos are preserved; this rule applies to new generation attempts.

The member gallery has Fresh, Top, and My frames views with 24-frame pages.
My frames filters by the authenticated owner in the database before pagination,
so personal history is not limited to the latest club posts. Top ranks ready
photos by the sum of positive minus negative votes across their three captions;
newer photos, then IDs, break ties. The authenticated ranking RPC returns IDs
only, and the normal RLS query loads the content. Rankings can move as votes and
new frames arrive. URLs accept up to page 417, matching the ranking RPC's bounded
offset; a frame's direct link remains independent of the current gallery page.

Each real caption has Copy caption and Share caption controls. Sharing opens the
browser's native share sheet when available, or copies the text and a permanent
`/captions?frame=<uuid>` member link. No expiring Storage URL is copied. A frame
link fetches that ready frame independently of feed mode and page. Signed-out
visitors see a sign-in message, not the member photo. Opening a valid member
link remembers the validated frame ID in session storage, so the existing
`/auth/callback` → `/captions` flow can reopen it after sign-in/onboarding. If
storage is disabled, the user can reopen the same link after signing in.

The intended loop is a pet photo → three captions → club voting → copy or
share a favorite → return to personal results. Whether Sam returns more often,
whether captions are worth sharing, and whether this improves on Crackd are
hypotheses to test. No comparative performance or PM approval is claimed.

## Week 5 iteration

The app keeps the existing Next.js repository, Supabase project, Google login,
and per-caption voting flow. Changes requested by the project owner are:

- Keep navigation consistent between the collection and Caption Club, remove
  unused menu entries, and return to Caption Club after sign-in.
- Accept HEIC/HEIF camera photos through browser conversion.
- Remove the daily-assignment card and keep the upload flow focused on pets.
- Reject unrelated photos on the server before caption generation, explain the
  restriction in a dialog, and let members choose a replacement.
- Make upload guidance, voting buttons, and saved-vote feedback easier to read
  and use on narrow screens. A replacement photo clears the old pet warning.

Fresh, Top, and My frames, plus copy/share actions, support finding captions and
returning to past results. Whether these improve repeat use should be validated
with the Feedback Group. These notes record owner feedback; they do not claim
that an assigned PM has reviewed or approved the release.

Release verification includes the automated suite, production build, isolated
PostgreSQL permission scenarios, and an authenticated browser check of real
generation, a persisted vote, unrelated-photo rejection, and replacement-photo
recovery. Run `supabase/verify-caption-club.sql` against the live project as well;
the isolated permission test does not prove the current live policy settings.
For each new deployment, verify its exact `/auth/callback` allowlist entry,
public access without Vercel protection, and authentication before submitting
the commit-specific `/captions` URL under Week 5.
