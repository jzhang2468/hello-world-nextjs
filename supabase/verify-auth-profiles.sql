-- Read-only checks after auth-profiles.sql. Run in the same SQL Editor.
-- No names, emails, image bytes, credentials, or tokens are returned.

begin read only;

-- Both name fields should say YES. There should be no bytea/image data column.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- profiles_without_auth_user and auth_users_without_profile should both be 0.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users u left join public.profiles p on p.id = u.id
    where p.id is null) as auth_users_without_profile,
  (select count(*) from public.profiles p left join auth.users u on u.id = p.id
    where u.id is null) as profiles_without_auth_user;

-- The auth trigger must be enabled and call the SECURITY DEFINER function.
select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition,
  p.prosecdef as security_definer, p.proconfig as function_settings,
  pg_get_userbyid(p.proowner) as function_owner
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgname in ('furframe_auth_user_created', 'furframe_profile_updated')
  and not t.tgisinternal;

select relrowsecurity as profiles_rls_enabled
from pg_class
where oid = 'public.profiles'::regclass;

-- Expect own-row SELECT/UPDATE; authenticated has no INSERT/DELETE or id UPDATE.
select
  has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_can_select,
  has_table_privilege('authenticated', 'public.profiles', 'INSERT') as member_can_insert,
  has_table_privilege('authenticated', 'public.profiles', 'DELETE') as member_can_delete,
  has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') as member_can_change_id,
  has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE') as member_can_change_name;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = 'profiles')
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Expect public=false, 3145728 bytes, JPEG/PNG/WebP only.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'avatars';

commit;
