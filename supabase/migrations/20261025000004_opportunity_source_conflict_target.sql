drop index if exists public.opportunities_source_item_unique;

create unique index opportunities_source_item_unique
  on public.opportunities (source_id, source_item_id);
