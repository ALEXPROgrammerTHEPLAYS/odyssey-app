alter table public.profiles
  add column if not exists is_profile_public boolean not null default true,
  add column if not exists goals_public boolean not null default false,
  add column if not exists activity_public boolean not null default true,
  add column if not exists reminder_settings jsonb not null default '{"enabled": false, "daily": false, "weekly": false, "hour": 18}'::jsonb;

create table if not exists public.user_private_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_settings jsonb not null default '{"enabled": false, "daily": false, "weekly": false, "hour": 18}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.user_private_preferences (user_id, reminder_settings)
select id, reminder_settings
from public.profiles
on conflict (user_id) do nothing;

alter table public.profiles drop column if exists reminder_settings;
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

create table if not exists public.user_tech_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_tech_goals_array check (jsonb_typeof(goals) = 'array')
);

insert into public.user_tech_goals (user_id, goals)
select id, tech_goals
from public.profiles
where jsonb_typeof(tech_goals) = 'array'
  and tech_goals <> '[]'::jsonb
on conflict (user_id) do nothing;

alter table public.profiles drop column if exists tech_goals;

alter table public.user_tech_goals enable row level security;
grant select, insert, update, delete on public.user_tech_goals to authenticated;

drop policy if exists "Users can view permitted goals" on public.user_tech_goals;
create policy "Users can view permitted goals"
  on public.user_tech_goals as permissive for select to authenticated
  using (
    user_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.profiles p
      where p.id = user_tech_goals.user_id
        and p.is_profile_public
        and p.goals_public
    )
  );

drop policy if exists "Users can insert own goals" on public.user_tech_goals;
create policy "Users can insert own goals"
  on public.user_tech_goals for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own goals" on public.user_tech_goals;
create policy "Users can update own goals"
  on public.user_tech_goals for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own goals" on public.user_tech_goals;
create policy "Users can delete own goals"
  on public.user_tech_goals for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Profiles are visible according to privacy settings" on public.profiles;
create policy "Profiles are visible according to privacy settings"
  on public.profiles as restrictive for select to authenticated
  using (
    id = auth.uid()
    or is_profile_public
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Live Wall activity follows profile privacy" on public.daily_logs;
create policy "Live Wall activity follows profile privacy"
  on public.daily_logs as restrictive for select to authenticated
  using (
    user_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.profiles p
      where p.id = daily_logs.user_id
        and p.is_profile_public
        and p.activity_public
    )
  );

create table if not exists public.opportunity_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'saved'
    check (status in ('saved', 'interested', 'applied')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table public.opportunity_bookmarks enable row level security;
grant select, insert, update, delete on public.opportunity_bookmarks to authenticated;

drop policy if exists "Users can view own opportunity bookmarks" on public.opportunity_bookmarks;
create policy "Users can view own opportunity bookmarks"
  on public.opportunity_bookmarks for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add own opportunity bookmarks" on public.opportunity_bookmarks;
create policy "Users can add own opportunity bookmarks"
  on public.opportunity_bookmarks for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own opportunity bookmarks" on public.opportunity_bookmarks;
create policy "Users can update own opportunity bookmarks"
  on public.opportunity_bookmarks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own opportunity bookmarks" on public.opportunity_bookmarks;
create policy "Users can delete own opportunity bookmarks"
  on public.opportunity_bookmarks for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_key text not null,
  joined_at timestamptz not null default now(),
  unique (user_id, challenge_key)
);

alter table public.challenge_participants enable row level security;
grant select, insert, delete on public.challenge_participants to authenticated;

drop policy if exists "Users can view own challenge participation" on public.challenge_participants;
create policy "Users can view own challenge participation"
  on public.challenge_participants for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can join challenges" on public.challenge_participants;
create policy "Users can join challenges"
  on public.challenge_participants for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can leave own challenges" on public.challenge_participants;
create policy "Users can leave own challenges"
  on public.challenge_participants for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  focus text not null default '',
  reflection text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reviews enable row level security;
grant select, insert, update, delete on public.weekly_reviews to authenticated;

drop policy if exists "Users can manage own weekly reviews" on public.weekly_reviews;
create policy "Users can manage own weekly reviews"
  on public.weekly_reviews for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
