-- Read-only post-migration inspection. No private captions, voter identities,
-- photos, profile names, credentials, or tokens are returned.
begin read only;

-- Every public table should have rls_enabled=true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname;

-- Caption data is members-only; image/caption DML is restricted to the RPCs.
select t.table_name,
  has_table_privilege('anon', 'public.' || t.table_name, 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT') as member_select,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT') as member_table_insert,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'UPDATE') as member_table_update,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'DELETE') as member_delete
from (values ('products'), ('site_settings'), ('profiles'), ('caption_images'), ('captions'), ('caption_votes'), ('caption_generation_steps')) t(table_name);

-- Votes permit only the submitted relationship/value and value-only revision.
select column_name,
  has_column_privilege('authenticated', 'public.caption_votes', column_name, 'INSERT') as member_insert,
  has_column_privilege('authenticated', 'public.caption_votes', column_name, 'UPDATE') as member_update
from information_schema.columns where table_schema = 'public' and table_name = 'caption_votes'
order by ordinal_position;

select p.proname, p.prosecdef as security_definer, p.proconfig as settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as member_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('reserve_caption_image', 'record_caption_generation_step', 'complete_caption_image', 'fail_caption_image', 'get_caption_vote_totals', 'get_top_caption_image_ids')
order by p.proname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Expect private, 3145728 bytes, image/webp only for caption-images.
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('caption-images', 'avatars') order by id;

-- Ready images must have exactly three captions; binary column count is zero.
select
  (select count(*) from public.caption_images i where i.status = 'ready'
    and (select count(*) from public.captions c where c.image_id = i.id) <> 3) as invalid_ready_images,
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name in ('caption_images', 'captions', 'caption_votes', 'caption_generation_steps', 'profiles')
    and data_type = 'bytea') as binary_image_columns,
  (select count(*) from public.products) as preserved_catalogue_rows;

-- One-row live verification summary. Safe to share: counts/booleans only.
-- Historical ready rows may have no prompt snapshots; v2 rows must have both.
select
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity) as public_tables_without_rls,
  (select count(*) from public.caption_images) as image_count,
  (select count(*) from public.captions) as caption_count,
  (select count(*) from public.caption_votes) as vote_count,
  (select count(*) from public.caption_generation_steps) as prompt_snapshot_count,
  (select count(*) from public.caption_images i where i.status = 'ready'
    and (select count(*) from public.captions c where c.image_id = i.id) <> 3) as invalid_ready_caption_sets,
  (select count(*) from public.caption_images i where i.status = 'ready'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'caption-images' and o.name = i.image_path)) as ready_images_missing_storage,
  (select count(*) from public.caption_images i where i.status = 'ready' and i.prompt_version = 'furframe-caption-chain-v2'
    and (select count(*) from public.caption_generation_steps s where s.image_id = i.id) <> 2) as v2_ready_images_missing_steps,
  (to_regprocedure('public.reserve_caption_image(uuid,text,text,text)') is null
    and to_regprocedure('public.complete_caption_image(uuid,text,text[])') is null
    and to_regprocedure('public.fail_caption_image(uuid,text)') is null
    and to_regprocedure('public.record_caption_generation_step(uuid,integer,jsonb)') is null) as legacy_pipeline_rpcs_absent,
  (to_regprocedure('public.reserve_caption_image(uuid,text,text,text,text)') is not null
    and to_regprocedure('public.record_caption_generation_step(uuid,integer,jsonb,text)') is not null
    and to_regprocedure('public.complete_caption_image(uuid,text,text[],text)') is not null
    and to_regprocedure('public.fail_caption_image(uuid,text,text)') is not null) as secured_pipeline_rpcs_present,
  exists(select 1 from private.caption_generation_credentials where id = 'caption_pipeline') as pipeline_credential_configured,
  (not has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_table_privilege('anon', 'private.caption_generation_credentials', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'private.caption_generation_credentials', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_function_privilege('anon', 'private.assert_caption_pipeline(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.assert_caption_pipeline(text)', 'EXECUTE')) as private_credential_access_denied,
  (not has_table_privilege('authenticated', 'public.caption_generation_steps', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.caption_generation_steps', 'SELECT,INSERT,UPDATE,DELETE')) as snapshot_client_writes_denied,
  (to_regprocedure('public.get_top_caption_image_ids(integer,integer)') is not null
    and has_function_privilege('authenticated', 'public.get_top_caption_image_ids(integer,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_top_caption_image_ids(integer,integer)', 'EXECUTE')) as top_rpc_members_only,
  (select count(*) from information_schema.columns where table_schema = 'public' and data_type = 'bytea') as public_binary_columns;
commit;
