alter table public.opportunity_bookmarks
  add column if not exists status text not null default 'saved';

alter table public.opportunity_bookmarks
  drop constraint if exists opportunity_bookmarks_status_check;

alter table public.opportunity_bookmarks
  add constraint opportunity_bookmarks_status_check
  check (status in ('saved', 'interested', 'applied'));

notify pgrst, 'reload schema';
