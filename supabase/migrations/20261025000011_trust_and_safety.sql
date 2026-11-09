alter table public.opportunities
  add column if not exists last_verified_at timestamptz;

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('daily_log', 'opportunity')),
  target_id uuid not null,
  reason text not null check (reason in (
    'harassment',
    'spam',
    'personal_information',
    'broken_link',
    'incorrect_deadline',
    'closed_opportunity',
    'other'
  )),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (reporter_id, target_type, target_id)
);

create index if not exists community_reports_open_queue
  on public.community_reports (created_at desc)
  where status = 'open';

alter table public.community_reports enable row level security;
grant select, insert, update on public.community_reports to authenticated;

drop policy if exists "Users can view own community reports" on public.community_reports;
create policy "Users can view own community reports"
  on public.community_reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Users can create own community reports" on public.community_reports;
create policy "Users can create own community reports"
  on public.community_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Admins can view community reports" on public.community_reports;
create policy "Admins can view community reports"
  on public.community_reports for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can review community reports" on public.community_reports;
create policy "Admins can review community reports"
  on public.community_reports for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

notify pgrst, 'reload schema';
