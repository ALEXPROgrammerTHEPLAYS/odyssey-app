create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text not null,
  category text not null default 'Tech',
  deadline date,
  grant_amount text,
  description text not null default '',
  requirements text,
  location text not null default 'Virtual',
  format text not null default 'virtual'
    check (format in ('virtual', 'in_person', 'hybrid')),
  apply_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.opportunities enable row level security;

grant select on public.opportunities to authenticated;
grant insert, update, delete on public.opportunities to authenticated;

drop policy if exists "Authenticated users can view opportunities"
  on public.opportunities;
create policy "Authenticated users can view opportunities"
  on public.opportunities
  for select
  to authenticated
  using (true);

drop policy if exists "Odyssey admins can insert opportunities"
  on public.opportunities;
create policy "Odyssey admins can insert opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Odyssey admins can update opportunities"
  on public.opportunities;
create policy "Odyssey admins can update opportunities"
  on public.opportunities
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Odyssey admins can delete opportunities"
  on public.opportunities;
create policy "Odyssey admins can delete opportunities"
  on public.opportunities
  for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
