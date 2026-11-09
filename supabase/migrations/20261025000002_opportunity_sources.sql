create table if not exists public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  source_type text not null
    check (source_type in ('api', 'feed', 'csv', 'manual')),
  url text,
  status text not null default 'pending'
    check (status in ('verified', 'pending', 'disabled')),
  publish_policy text not null default 'admin_review'
    check (publish_policy in ('auto', 'admin_review')),
  last_synced_at timestamptz,
  last_tested_at timestamptz,
  last_test_result text
    check (last_test_result in ('passed', 'failed')),
  last_test_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type = 'manual' or (url is not null and btrim(url) <> '')),
  check (
    publish_policy <> 'auto'
    or (
      source_type <> 'manual'
      and status = 'verified'
      and last_test_result = 'passed'
    )
  )
);

alter table public.opportunity_sources enable row level security;

grant select, insert, update, delete on public.opportunity_sources to authenticated;

drop policy if exists "Odyssey admins can view opportunity sources"
  on public.opportunity_sources;
create policy "Odyssey admins can view opportunity sources"
  on public.opportunity_sources
  for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Odyssey admins can insert opportunity sources"
  on public.opportunity_sources;
create policy "Odyssey admins can insert opportunity sources"
  on public.opportunity_sources
  for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Odyssey admins can update opportunity sources"
  on public.opportunity_sources;
create policy "Odyssey admins can update opportunity sources"
  on public.opportunity_sources
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Odyssey admins can delete opportunity sources"
  on public.opportunity_sources;
create policy "Odyssey admins can delete opportunity sources"
  on public.opportunity_sources
  for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
