alter table public.opportunities
  add column if not exists publishing_status text not null default 'published'
    check (publishing_status in ('pending', 'published', 'rejected')),
  add column if not exists source_id uuid references public.opportunity_sources(id) on delete set null,
  add column if not exists source_item_id text;

create unique index if not exists opportunities_source_item_unique
  on public.opportunities (source_id, source_item_id);

drop policy if exists "Authenticated users can view opportunities"
  on public.opportunities;
create policy "Authenticated users can view opportunities"
  on public.opportunities
  for select
  to authenticated
  using (
    publishing_status = 'published'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
