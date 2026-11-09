alter table public.opportunity_sources
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_result text
    check (last_test_result in ('passed', 'failed')),
  add column if not exists last_test_message text;

notify pgrst, 'reload schema';
