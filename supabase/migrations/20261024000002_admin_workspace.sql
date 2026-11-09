alter table public.opportunities
  add column if not exists featured boolean not null default false,
  add column if not exists archived_at timestamptz;

grant delete on public.daily_logs to authenticated;

drop policy if exists "Odyssey admins can delete daily logs"
  on public.daily_logs;
create policy "Odyssey admins can delete daily logs"
  on public.daily_logs
  for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
