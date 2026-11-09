alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists category text not null default 'Tech',
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text,
  add column if not exists location text not null default '',
  add column if not exists website_url text not null default '',
  add column if not exists github text not null default '',
  add column if not exists linkedin text not null default '',
  add column if not exists portfolio text not null default '',
  add column if not exists target_orgs text[] not null default '{}',
  add column if not exists daily_goal_hours integer not null default 4,
  add column if not exists is_profile_public boolean not null default true,
  add column if not exists goals_public boolean not null default false,
  add column if not exists activity_public boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_private_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_settings jsonb not null default '{"enabled": false, "daily": false, "weekly": false, "hour": 18}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_private_preferences enable row level security;
grant select, insert, update, delete on public.user_private_preferences to authenticated;

drop policy if exists "Users can view own private preferences" on public.user_private_preferences;
create policy "Users can view own private preferences"
  on public.user_private_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own private preferences" on public.user_private_preferences;
create policy "Users can insert own private preferences"
  on public.user_private_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own private preferences" on public.user_private_preferences;
create policy "Users can update own private preferences"
  on public.user_private_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own private preferences" on public.user_private_preferences;
create policy "Users can delete own private preferences"
  on public.user_private_preferences for delete to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
