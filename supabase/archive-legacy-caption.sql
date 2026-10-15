-- Run as postgres in the existing project. This archives only the verified v1
-- frame that predates prompt snapshots. No captions, votes, descriptions, image
-- objects, timestamps, or ownership records are deleted or rewritten.
-- Historical prompts are not reconstructed or presented as original requests.
begin;

alter table public.caption_images drop constraint if exists caption_images_status_check;
alter table public.caption_images add constraint caption_images_status_check
  check (status in ('processing', 'ready', 'failed', 'archived'));
alter table public.caption_images drop constraint if exists caption_image_state_consistent;
alter table public.caption_images add constraint caption_image_state_consistent check (
  (status = 'processing' and description is null and error_code is null)
  or (status = 'ready' and description is not null and error_code is null)
  or (status = 'failed' and description is null and error_code is not null)
  or (status = 'archived' and description is not null and error_code is not null
    and error_code = 'MISSING_PROMPT_PROVENANCE')
);

do $$
declare v_image public.caption_images%rowtype;
begin
  select * into v_image from public.caption_images
    where id = '66fd5765-0fa9-4dd4-a414-b6e767175163' for update;
  if not found then
    raise exception 'LEGACY_ARCHIVE_TARGET_MISSING';
  end if;
  if v_image.prompt_version <> 'furframe-caption-chain-v1'
    or v_image.status not in ('ready', 'archived')
    or exists (select 1 from public.caption_generation_steps where image_id = v_image.id) then
    raise exception 'LEGACY_ARCHIVE_TARGET_CHANGED';
  end if;
  update public.caption_images
    set status = 'archived', error_code = 'MISSING_PROMPT_PROVENANCE'
    where id = v_image.id and status = 'ready'
      and prompt_version = 'furframe-caption-chain-v1'
      and not exists (select 1 from public.caption_generation_steps where image_id = v_image.id);
end;
$$;

-- Reversible by an administrator: restore this row to status='ready' and
-- error_code=NULL only if authentic prompt provenance becomes available.
select id, status, error_code, prompt_version from public.caption_images
where id = '66fd5765-0fa9-4dd4-a414-b6e767175163';

commit;
