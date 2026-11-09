alter table public.daily_logs
  add column if not exists high_fives integer not null default 0,
  add column if not exists supports integer not null default 0;

revoke update on public.daily_logs from authenticated;

create table if not exists public.daily_log_reactions (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('high_five', 'support')),
  created_at timestamptz not null default now()
);

create unique index if not exists daily_log_reactions_one_per_user
  on public.daily_log_reactions (daily_log_id, user_id, reaction_type);

alter table public.daily_log_reactions enable row level security;
grant select, insert on public.daily_log_reactions to authenticated;

drop policy if exists "Users can view own Live Wall reactions" on public.daily_log_reactions;
create policy "Users can view own Live Wall reactions"
  on public.daily_log_reactions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can react to Live Wall updates once" on public.daily_log_reactions;
create policy "Users can react to Live Wall updates once"
  on public.daily_log_reactions for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.increment_daily_log_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.reaction_type = 'high_five' then
    update public.daily_logs
    set high_fives = high_fives + 1
    where id = new.daily_log_id;
  else
    update public.daily_logs
    set supports = supports + 1
    where id = new.daily_log_id;
  end if;

  return new;
end;
$$;

revoke all on function public.increment_daily_log_reaction_count() from public;

drop trigger if exists daily_log_reactions_increment_count on public.daily_log_reactions;
create trigger daily_log_reactions_increment_count
  after insert on public.daily_log_reactions
  for each row execute function public.increment_daily_log_reaction_count();

notify pgrst, 'reload schema';
