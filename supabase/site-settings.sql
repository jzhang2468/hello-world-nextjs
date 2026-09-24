-- Run once in the Supabase SQL Editor to add the display-font setting.
-- Safe to rerun: preserves the saved font and does not touch products.

begin;

create table if not exists public.site_settings (
  id text primary key check (id = 'global'),
  display_font text not null default 'alfa-slab'
    check (display_font in ('alfa-slab', 'georgia', 'dm-sans'))
);

alter table public.site_settings enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on table public.site_settings from anon, authenticated;
grant select on table public.site_settings to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_settings'
      and policyname = 'Anyone can read the site settings'
  ) then
    create policy "Anyone can read the site settings"
      on public.site_settings
      for select
      to anon, authenticated
      using (true);
  end if;
end;
$$;

insert into public.site_settings (id, display_font)
values ('global', 'alfa-slab')
on conflict (id) do nothing;

commit;
