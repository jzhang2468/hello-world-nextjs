-- Assignment #4. Run in the existing Supabase SQL Editor as postgres, after
-- schema.sql, site-settings.sql and auth-profiles.sql. Safe to rerun: this file
-- never seeds/resets product prices, settings, profiles, images, or votes.
-- Only object paths live in Postgres; image bytes live in private Storage.

begin;

-- Provision this singleton separately with SHA256(CAPTION_PIPELINE_SECRET).
-- Never put the raw server secret in a migration or a client-visible table.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.caption_generation_credentials (
  id text primary key check (id = 'caption_pipeline'),
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$')
);
alter table private.caption_generation_credentials enable row level security;
revoke all on private.caption_generation_credentials from public, anon, authenticated;

create or replace function private.assert_caption_pipeline(p_pipeline_secret text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_pipeline_secret is null or char_length(p_pipeline_secret) not between 32 and 512
    or not exists (
      select 1 from private.caption_generation_credentials
      where id = 'caption_pipeline'
        and secret_sha256 = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_pipeline_secret, 'UTF8')), 'hex')
    ) then
    raise exception 'CAPTION_PIPELINE_FORBIDDEN' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function private.assert_caption_pipeline(text) from public, anon, authenticated;

create table if not exists public.caption_images (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null unique,
  description text null check (char_length(description) between 1 and 2000),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  tone text not null check (tone in ('deadpan', 'chaotic', 'wholesome')),
  model text not null check (char_length(model) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  error_code text null check (error_code ~ '^[A-Z0-9_]{1,60}$'),
  created_at timestamptz not null default now(),
  constraint caption_image_path_matches_owner check (
    image_path = owner_id::text || '/' || id::text || '.webp'
  ),
  constraint caption_image_state_consistent check (
    (status = 'processing' and description is null and error_code is null)
    or (status = 'ready' and description is not null and error_code is null)
    or (status = 'failed' and description is null and error_code is not null)
  )
);

create index if not exists caption_images_owner_created_idx
  on public.caption_images(owner_id, created_at desc);
create index if not exists caption_images_ready_created_idx
  on public.caption_images(created_at desc) where status = 'ready';

create table if not exists public.captions (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.caption_images(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 240),
  position smallint not null check (position between 0 and 2),
  constraint captions_image_position_key unique (image_id, position),
  constraint captions_image_text_key unique (image_id, text)
);

create table if not exists public.caption_votes (
  id uuid primary key default gen_random_uuid(),
  caption_id uuid not null references public.captions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  constraint caption_votes_user_caption_key unique (user_id, caption_id)
);
create index if not exists caption_votes_caption_idx on public.caption_votes(caption_id);

create table if not exists public.caption_generation_steps (
  image_id uuid not null references public.caption_images(id) on delete cascade,
  stage smallint not null check (stage in (1, 2)),
  prompt jsonb not null check (jsonb_typeof(prompt) = 'object' and octet_length(prompt::text) <= 32768),
  created_at timestamptz not null default now(),
  primary key (image_id, stage)
);

-- Known app tables receive explicit policies below. Unknown public tables are
-- denied by default, including when an older permissive policy already exists.
-- Their rows are preserved; intentionally exposing another table requires a
-- reviewed policy and removal of this restrictive guard.
do $$
declare t record;
begin
  for t in select n.nspname, c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', t.nspname, t.relname);
    if t.relname not in ('products', 'site_settings', 'profiles', 'caption_images',
      'captions', 'caption_votes', 'caption_generation_steps') then
      execute format('revoke all on %I.%I from public, anon, authenticated', t.nspname, t.relname);
      execute format('drop policy if exists "Furframe unreviewed public table guard" on %I.%I', t.nspname, t.relname);
      execute format('create policy "Furframe unreviewed public table guard" on %I.%I as restrictive for all to public using (false) with check (false)', t.nspname, t.relname);
    end if;
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
revoke all on public.products, public.site_settings from public, anon, authenticated;
grant select on public.products, public.site_settings to anon, authenticated;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, avatar_path) on public.profiles to authenticated;
drop policy if exists "Furframe profiles remain owner only" on public.profiles;
create policy "Furframe profiles remain owner only" on public.profiles
  as restrictive for all to public
  using ((select auth.uid()) is not null and id = (select auth.uid()))
  with check ((select auth.uid()) is not null and id = (select auth.uid()));

revoke all on public.caption_images, public.captions, public.caption_votes, public.caption_generation_steps
  from public, anon, authenticated;
grant select on public.caption_images, public.captions, public.caption_votes, public.caption_generation_steps to authenticated;
grant insert (caption_id, user_id, value) on public.caption_votes to authenticated;
grant update (value) on public.caption_votes to authenticated;

drop policy if exists "Members read ready images and their own attempts" on public.caption_images;
create policy "Members read ready images and their own attempts" on public.caption_images
  for select to authenticated
  using (status = 'ready' or owner_id = (select auth.uid()));
drop policy if exists "Caption image visibility guard" on public.caption_images;
create policy "Caption image visibility guard" on public.caption_images
  as restrictive for select to public
  using ((select auth.uid()) is not null and (status = 'ready' or owner_id = (select auth.uid())));

drop policy if exists "Members read ready captions" on public.captions;
create policy "Members read ready captions" on public.captions
  for select to authenticated
  using (exists (select 1 from public.caption_images i where i.id = image_id and i.status = 'ready'));
drop policy if exists "Caption visibility guard" on public.captions;
create policy "Caption visibility guard" on public.captions
  as restrictive for select to public
  using ((select auth.uid()) is not null and exists (
    select 1 from public.caption_images i where i.id = image_id and i.status = 'ready'
  ));

drop policy if exists "Members read their own caption votes" on public.caption_votes;
create policy "Members read their own caption votes" on public.caption_votes
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members insert their own caption votes" on public.caption_votes;
create policy "Members insert their own caption votes" on public.caption_votes
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.captions c join public.caption_images i on i.id = c.image_id
      where c.id = caption_id and i.status = 'ready'
    )
  );
drop policy if exists "Members revise their own caption votes" on public.caption_votes;
create policy "Members revise their own caption votes" on public.caption_votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.captions c join public.caption_images i on i.id = c.image_id
    where c.id = caption_id and i.status = 'ready'
  ));
drop policy if exists "Caption votes stay private and target ready captions" on public.caption_votes;
create policy "Caption votes stay private and target ready captions" on public.caption_votes
  as restrictive for all to public
  using ((select auth.uid()) is not null and user_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and user_id = (select auth.uid()) and exists (
    select 1 from public.captions c join public.caption_images i on i.id = c.image_id
    where c.id = caption_id and i.status = 'ready'
  ));

drop policy if exists "Members read their own generation steps" on public.caption_generation_steps;
create policy "Members read their own generation steps" on public.caption_generation_steps
  for select to authenticated using (exists (
    select 1 from public.caption_images i where i.id = image_id and i.owner_id = (select auth.uid())
  ));
drop policy if exists "Generation steps remain owner only" on public.caption_generation_steps;
create policy "Generation steps remain owner only" on public.caption_generation_steps
  as restrictive for all to public
  using ((select auth.uid()) is not null and exists (
    select 1 from public.caption_images i where i.id = image_id and i.owner_id = (select auth.uid())
  )) with check (false);
drop policy if exists "Generation snapshots cannot be deleted by clients" on public.caption_generation_steps;
create policy "Generation snapshots cannot be deleted by clients" on public.caption_generation_steps
  as restrictive for delete to public using (false);

-- Drop former user-callable overloads rather than leaving an insecure route
-- alongside the new server-secret signatures. No DROP CASCADE is used.
drop function if exists public.reserve_caption_image(uuid, text, text, text);
drop function if exists public.complete_caption_image(uuid, text, text[]);
drop function if exists public.fail_caption_image(uuid, text);
drop function if exists public.record_caption_generation_step(uuid, integer, jsonb);

-- The session supplies user identity; the server-only secret attests that the
-- write came through the application pipeline. Both are required on every RPC.
create or replace function public.reserve_caption_image(
  p_image_id uuid, p_tone text, p_model text, p_prompt_version text, p_pipeline_secret text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_caption_pipeline(p_pipeline_secret);
  v_now timestamptz;
begin
  if v_user is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_image_id is null or p_tone is null or p_tone not in ('deadpan', 'chaotic', 'wholesome')
    or p_model is null or char_length(btrim(p_model)) not between 1 and 80
    or p_prompt_version is null or char_length(btrim(p_prompt_version)) not between 1 and 80 then
    raise exception 'CAPTION_INVALID_INPUT' using errcode = '22023';
  end if;
  -- Serialize reservations for this user so simultaneous requests cannot race
  -- the limits. Failed attempts count too, preventing repeated paid API abuse.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 4242));
  v_now := pg_catalog.clock_timestamp();
  if exists (select 1 from public.caption_images where owner_id = v_user
      and created_at > v_now - interval '30 seconds') then
    raise exception 'CAPTION_RATE_LIMIT';
  end if;
  if (select count(*) from public.caption_images where owner_id = v_user
      and created_at > v_now - interval '24 hours') >= 10 then
    raise exception 'CAPTION_DAILY_LIMIT';
  end if;
  insert into public.caption_images (id, owner_id, image_path, tone, model, prompt_version, created_at)
  values (p_image_id, v_user, v_user::text || '/' || p_image_id::text || '.webp',
    p_tone, btrim(p_model), btrim(p_prompt_version), v_now);
  return p_image_id;
end;
$$;

create or replace function public.record_caption_generation_step(
  p_image_id uuid, p_stage integer, p_prompt jsonb, p_pipeline_secret text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_caption_pipeline(p_pipeline_secret);
  v_image public.caption_images%rowtype;
  v_input jsonb;
begin
  select * into v_image from public.caption_images where id = p_image_id for update;
  if not found or v_image.owner_id <> v_user then
    raise exception 'CAPTION_FORBIDDEN' using errcode = '42501';
  end if;
  if v_image.status <> 'processing' then
    raise exception 'CAPTION_NOT_PROCESSING';
  end if;
  if p_stage is null or p_stage not in (1, 2)
    or jsonb_typeof(p_prompt) is distinct from 'object'
    or octet_length(p_prompt::text) > 32768 then
    raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
  end if;
  if not (p_prompt ?& array['instructions', 'input_text', 'model', 'max_output_tokens', 'response_format'])
    or (p_prompt - array['instructions', 'input_text', 'model', 'max_output_tokens', 'response_format', 'image_path']) <> '{}'::jsonb
    or jsonb_typeof(p_prompt->'instructions') is distinct from 'string'
    or char_length(btrim(p_prompt->>'instructions')) not between 1 and 12000
    or jsonb_typeof(p_prompt->'input_text') is distinct from 'string'
    or char_length(btrim(p_prompt->>'input_text')) not between 1 and 12000
    or jsonb_typeof(p_prompt->'model') is distinct from 'string'
    or (p_prompt->>'model') is distinct from v_image.model
    or jsonb_typeof(p_prompt->'max_output_tokens') is distinct from 'number'
    or (p_prompt->>'max_output_tokens') !~ '^[0-9]{1,4}$'
    or jsonb_typeof(p_prompt->'response_format') is distinct from 'object' then
    raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
  end if;
  if (p_prompt->>'max_output_tokens')::integer not between 1 and 8192
    or not ((p_prompt->'response_format') ?& array['type', 'name', 'strict', 'schema'])
    or ((p_prompt->'response_format') - array['type', 'name', 'strict', 'schema']) <> '{}'::jsonb
    or (p_prompt#>>'{response_format,type}') is distinct from 'json_schema'
    or jsonb_typeof(p_prompt#>'{response_format,name}') is distinct from 'string'
    or (p_prompt#>>'{response_format,name}') !~ '^[a-zA-Z0-9_-]{1,80}$'
    or (p_prompt#>'{response_format,strict}') is distinct from 'true'::jsonb
    or jsonb_typeof(p_prompt#>'{response_format,schema}') is distinct from 'object'
    or position(p_pipeline_secret in p_prompt::text) > 0
    or p_prompt::text ~* '"(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|pipeline[_-]?secret|p_pipeline_secret)"[[:space:]]*:'
    or p_prompt::text ~* '(data:[^"[:space:]]*;base64,|bearer[[:space:]]+[a-z0-9._-]{16,}|sk-[a-z0-9_-]{16,})' then
    raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
  end if;
  if p_stage = 1 then
    if jsonb_typeof(p_prompt->'image_path') is distinct from 'string'
      or (p_prompt->>'image_path') is distinct from v_image.image_path then
      raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
    end if;
  else
    if p_prompt ? 'image_path' then
      raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
    end if;
    begin
      v_input := (p_prompt->>'input_text')::jsonb;
    exception when invalid_text_representation then
      raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
    end;
    if jsonb_typeof(v_input) is distinct from 'object'
      or jsonb_typeof(v_input->'description') is distinct from 'string'
      or (v_input - 'description') <> '{}'::jsonb
      or char_length(btrim(v_input->>'description')) not between 1 and 2000 then
      raise exception 'CAPTION_INVALID_PROMPT' using errcode = '22023';
    end if;
    if not exists (select 1 from public.caption_generation_steps where image_id = p_image_id and stage = 1) then
      raise exception 'CAPTION_STEP_ORDER';
    end if;
  end if;
  insert into public.caption_generation_steps(image_id, stage, prompt)
  values (p_image_id, p_stage, p_prompt);
end;
$$;

create or replace function public.complete_caption_image(
  p_image_id uuid, p_description text, p_captions text[], p_pipeline_secret text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_caption_pipeline(p_pipeline_secret);
  v_image public.caption_images%rowtype;
begin
  if v_user is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_image from public.caption_images where id = p_image_id for update;
  if not found or v_image.owner_id <> v_user then
    raise exception 'CAPTION_FORBIDDEN' using errcode = '42501';
  end if;
  if v_image.status <> 'processing' then
    raise exception 'CAPTION_NOT_PROCESSING';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 2000
    or p_captions is null or array_ndims(p_captions) <> 1 or cardinality(p_captions) <> 3
    or exists (select 1 from unnest(p_captions) c where c is null or char_length(btrim(c)) not between 1 and 240)
    or (select count(distinct btrim(c)) from unnest(p_captions) c) <> 3 then
    raise exception 'CAPTION_INVALID_INPUT' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'caption-images' and name = v_image.image_path) then
    raise exception 'CAPTION_IMAGE_MISSING';
  end if;
  if (select count(*) from public.caption_generation_steps where image_id = p_image_id) <> 2 then
    raise exception 'CAPTION_STEPS_MISSING';
  end if;
  if not exists (
    select 1 from public.caption_generation_steps where image_id = p_image_id and stage = 2
      and ((prompt->>'input_text')::jsonb->>'description') = p_description
  ) then
    raise exception 'CAPTION_DESCRIPTION_MISMATCH' using errcode = '22023';
  end if;
  insert into public.captions(image_id, text, position)
  select p_image_id, btrim(c.caption), (c.ordinality - 1)::smallint
  from unnest(p_captions) with ordinality as c(caption, ordinality);
  update public.caption_images set description = btrim(p_description), status = 'ready', error_code = null
  where id = p_image_id;
end;
$$;

create or replace function public.fail_caption_image(p_image_id uuid, p_error_code text, p_pipeline_secret text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.assert_caption_pipeline(p_pipeline_secret);
  v_image public.caption_images%rowtype;
begin
  if v_user is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_image from public.caption_images where id = p_image_id for update;
  if not found or v_image.owner_id <> v_user then
    raise exception 'CAPTION_FORBIDDEN' using errcode = '42501';
  end if;
  if v_image.status <> 'processing' then
    raise exception 'CAPTION_NOT_PROCESSING';
  end if;
  if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,60}$' then
    raise exception 'CAPTION_INVALID_INPUT' using errcode = '22023';
  end if;
  update public.caption_images set status = 'failed', error_code = p_error_code where id = p_image_id;
end;
$$;

-- Returns totals, never user IDs or individual votes. Bounded to the gallery's
-- page size and ready captions; anonymous callers have no EXECUTE privilege.
create or replace function public.get_caption_vote_totals(p_caption_ids uuid[])
returns table(caption_id uuid, upvotes bigint, downvotes bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_caption_ids is null or cardinality(p_caption_ids) > 150 then
    raise exception 'CAPTION_INVALID_INPUT' using errcode = '22023';
  end if;
  return query
  select c.id,
    count(v.id) filter (where v.value = 1),
    count(v.id) filter (where v.value = -1)
  from public.captions c
  join public.caption_images i on i.id = c.image_id and i.status = 'ready'
  left join public.caption_votes v on v.caption_id = c.id
  where c.id = any(p_caption_ids)
  group by c.id;
end;
$$;

-- Order images by the net votes across their captions, with stable tie-breaks.
-- This exposes no voter identity or individual vote records.
create or replace function public.get_top_caption_image_ids(p_limit integer, p_offset integer)
returns table(image_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'CAPTION_UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 25
    or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'CAPTION_INVALID_INPUT' using errcode = '22023';
  end if;
  return query
  select i.id
  from public.caption_images i
  left join public.captions c on c.image_id = i.id
  left join public.caption_votes v on v.caption_id = c.id
  where i.status = 'ready'
  group by i.id, i.created_at
  order by coalesce(sum(v.value), 0) desc, i.created_at desc, i.id desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.reserve_caption_image(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_caption_generation_step(uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.complete_caption_image(uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.fail_caption_image(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_caption_vote_totals(uuid[]) from public, anon, authenticated;
revoke all on function public.get_top_caption_image_ids(integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_caption_image(uuid, text, text, text, text) to authenticated;
grant execute on function public.record_caption_generation_step(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.complete_caption_image(uuid, text, text[], text) to authenticated;
grant execute on function public.fail_caption_image(uuid, text, text) to authenticated;
grant execute on function public.get_caption_vote_totals(uuid[]) to authenticated;
grant execute on function public.get_top_caption_image_ids(integer, integer) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('caption-images', 'caption-images', false, 3145728, array['image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members upload reserved caption images" on storage.objects;
create policy "Members upload reserved caption images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'caption-images' and exists (select 1 from public.caption_images i
      where i.image_path = name and i.owner_id = (select auth.uid()) and i.status = 'processing')
  );
drop policy if exists "Members read shared or own caption images" on storage.objects;
create policy "Members read shared or own caption images" on storage.objects
  for select to authenticated using (
    bucket_id = 'caption-images' and exists (select 1 from public.caption_images i
      where i.image_path = name and (i.status = 'ready' or i.owner_id = (select auth.uid())))
  );
drop policy if exists "Members clean up their unfinished caption images" on storage.objects;
create policy "Members clean up their unfinished caption images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'caption-images' and exists (select 1 from public.caption_images i
      where i.image_path = name and i.owner_id = (select auth.uid()) and i.status = 'failed')
  );

-- Restrictive policies are ANDed with every permissive policy. Even an older
-- bucket-wide policy cannot reveal or replace these images. Other buckets keep
-- their existing behavior. Cleanup must first mark the row failed (which locks
-- the same row as completion). A delete of a processing image could otherwise
-- race completion and leave a ready caption set without its photo.
drop policy if exists "Caption storage read guard" on storage.objects;
create policy "Caption storage read guard" on storage.objects as restrictive for select to public
  using (bucket_id <> 'caption-images' or ((select auth.uid()) is not null and exists (
    select 1 from public.caption_images i where i.image_path = name
      and (i.status = 'ready' or i.owner_id = (select auth.uid()))
  )));
drop policy if exists "Caption storage insert guard" on storage.objects;
create policy "Caption storage insert guard" on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'caption-images' or ((select auth.uid()) is not null and exists (
    select 1 from public.caption_images i where i.image_path = name
      and i.owner_id = (select auth.uid()) and i.status = 'processing'
  )));
drop policy if exists "Caption storage delete guard" on storage.objects;
create policy "Caption storage delete guard" on storage.objects as restrictive for delete to public
  using (bucket_id <> 'caption-images' or ((select auth.uid()) is not null and exists (
    select 1 from public.caption_images i where i.image_path = name
      and i.owner_id = (select auth.uid()) and i.status = 'failed'
  )));
drop policy if exists "Caption storage cannot be overwritten" on storage.objects;
create policy "Caption storage cannot be overwritten" on storage.objects as restrictive for update to public
  using (bucket_id <> 'caption-images') with check (bucket_id <> 'caption-images');

-- Tighten the prior avatar guard as well, without changing valid saved paths.
drop policy if exists "Furframe avatar paths stay valid" on storage.objects;
create policy "Furframe avatar paths stay valid" on storage.objects as restrictive for all to public
  using (bucket_id <> 'avatars' or ((select auth.uid()) is not null and name ~ (
    '^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg|jpeg)$'
  )))
  with check (bucket_id <> 'avatars' or ((select auth.uid()) is not null and name ~ (
    '^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg|jpeg)$'
  )));

notify pgrst, 'reload schema';
commit;
