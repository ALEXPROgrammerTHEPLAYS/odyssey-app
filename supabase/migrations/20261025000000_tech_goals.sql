alter table public.profiles
  add column if not exists tech_goals jsonb not null default '[]'::jsonb;
