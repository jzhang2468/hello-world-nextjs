-- Assignment #3: run in the existing project's SQL Editor as postgres.
-- Safe to rerun: preserves profiles, product values, settings, and stored photos.
-- Images live in Storage; profiles.avatar_path contains only the object path.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text null check (char_length(first_name) <= 80),
  last_name text null check (char_length(last_name) <= 80),
  avatar_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_avatar_path_owner check (
    avatar_path is null
    or avatar_path ~ (
      '^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg|jpeg)$'
    )
  )
);

alter table public.profiles enable row level security;
grant usage on schema public to authenticated;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (first_name, last_name, avatar_path) on public.profiles to authenticated;

drop policy if exists "Members read their own profile" on public.profiles;
create policy "Members read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Members update their own profile" on public.profiles;
create policy "Members update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A new Google signup intentionally starts with empty names. The app asks the
-- member to supply both names instead of trusting provider metadata.
create or replace function public.create_furframe_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_furframe_profile() from public, anon, authenticated;

drop trigger if exists furframe_auth_user_created on auth.users;
create trigger furframe_auth_user_created
  after insert on auth.users
  for each row execute function public.create_furframe_profile();

create or replace function public.update_furframe_profile_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.update_furframe_profile_timestamp() from public, anon, authenticated;

drop trigger if exists furframe_profile_updated on public.profiles;
create trigger furframe_profile_updated
  before update on public.profiles
  for each row execute function public.update_furframe_profile_timestamp();

-- Existing Auth users also receive a profile, without overwriting saved data.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- 3 MiB keeps the app's multipart upload below Vercel's request-size limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object keys are user-id/random-uuid.ext. RLS applies to reading, uploading,
-- replacing, and deleting; signed photo URLs can only be created by the owner.
drop policy if exists "Members manage their own avatars" on storage.objects;
create policy "Members manage their own avatars"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg|jpeg)$')
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg|jpeg)$')
  );

-- Other buckets retain their own policies. This guard prevents a pre-existing
-- broad Storage policy from also granting access to another member's avatar.
drop policy if exists "Furframe avatars remain owner only" on storage.objects;
create policy "Furframe avatars remain owner only"
  on storage.objects as restrictive for all to public
  using (
    bucket_id <> 'avatars'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id <> 'avatars'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
