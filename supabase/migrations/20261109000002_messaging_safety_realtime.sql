create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocked_by uuid not null references auth.users(id) on delete cascade,
  blocked_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self check (blocked_by <> blocked_user),
  unique (blocked_by, blocked_user)
);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks"
  on public.user_blocks for select to authenticated
  using (blocked_by = auth.uid());

drop policy if exists "Users can block other accounts" on public.user_blocks;
create policy "Users can block other accounts"
  on public.user_blocks for insert to authenticated
  with check (blocked_by = auth.uid() and blocked_by <> blocked_user);

drop policy if exists "Users can unblock accounts" on public.user_blocks;
create policy "Users can unblock accounts"
  on public.user_blocks for delete to authenticated
  using (blocked_by = auth.uid());

create or replace function public.are_users_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when auth.uid() is null
      or (first_user <> auth.uid() and second_user <> auth.uid())
      then false
    else exists (
      select 1
      from public.user_blocks b
      where (b.blocked_by = first_user and b.blocked_user = second_user)
         or (b.blocked_by = second_user and b.blocked_user = first_user)
    )
  end;
$$;

revoke all on function public.are_users_blocked(uuid, uuid) from public;
grant execute on function public.are_users_blocked(uuid, uuid) to authenticated;

create or replace function public.enforce_friend_request_safety()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  daily_request_count integer;
begin
  if exists (
    select 1
    from public.user_blocks b
    where (b.blocked_by = new.requester_id and b.blocked_user = new.recipient_id)
       or (b.blocked_by = new.recipient_id and b.blocked_user = new.requester_id)
  ) then
    raise exception 'Friend requests are unavailable for this account.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.requester_id::text, 0));
  select count(*) into daily_request_count
  from public.friend_requests fr
  where fr.requester_id = new.requester_id
    and fr.created_at >= now() - interval '24 hours';

  if daily_request_count >= 20 then
    raise exception 'You have reached the daily friend request limit. Try again later.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_friend_request_safety() from public;
drop trigger if exists friend_requests_enforce_safety on public.friend_requests;
create trigger friend_requests_enforce_safety
  before insert on public.friend_requests
  for each row execute function public.enforce_friend_request_safety();

alter table public.friend_requests
  drop constraint if exists friend_requests_status_check;
alter table public.friend_requests
  add constraint friend_requests_status_check
  check (status in ('pending', 'accepted', 'declined'));

grant delete on public.friend_requests to authenticated;

drop policy if exists "Users can view their friend requests" on public.friend_requests;
create policy "Users can view their friend requests"
  on public.friend_requests for select to authenticated
  using (
    (requester_id = auth.uid() or recipient_id = auth.uid())
    and not public.are_users_blocked(requester_id, recipient_id)
  );

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and not public.are_users_blocked(requester_id, recipient_id)
  );

drop policy if exists "Recipients can respond to friend requests" on public.friend_requests;
create policy "Recipients can respond to friend requests"
  on public.friend_requests for update to authenticated
  using (
    recipient_id = auth.uid()
    and status = 'pending'
    and not public.are_users_blocked(requester_id, recipient_id)
  )
  with check (
    recipient_id = auth.uid()
    and status in ('accepted', 'declined')
    and not public.are_users_blocked(requester_id, recipient_id)
  );

drop policy if exists "Friends can remove their connection" on public.friend_requests;
create policy "Friends can remove their connection"
  on public.friend_requests for delete to authenticated
  using (
    status = 'accepted'
    and (requester_id = auth.uid() or recipient_id = auth.uid())
  );

create or replace function public.remove_friendship_when_blocked()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.friend_requests fr
  where (fr.requester_id = new.blocked_by and fr.recipient_id = new.blocked_user)
     or (fr.requester_id = new.blocked_user and fr.recipient_id = new.blocked_by);
  return new;
end;
$$;

revoke all on function public.remove_friendship_when_blocked() from public;
drop trigger if exists user_blocks_remove_friendship on public.user_blocks;
create trigger user_blocks_remove_friendship
  after insert on public.user_blocks
  for each row execute function public.remove_friendship_when_blocked();

drop policy if exists "Friends can view direct messages" on public.direct_messages;
drop policy if exists "Admins and friends can view direct messages" on public.direct_messages;
create policy "Admins and friends can view direct messages"
  on public.direct_messages for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      (sender_id = auth.uid() or recipient_id = auth.uid())
      and not public.are_users_blocked(sender_id, recipient_id)
      and exists (
        select 1
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (
            (fr.requester_id = direct_messages.sender_id and fr.recipient_id = direct_messages.recipient_id)
            or (fr.requester_id = direct_messages.recipient_id and fr.recipient_id = direct_messages.sender_id)
          )
      )
    )
  );

drop policy if exists "Friends can send direct messages" on public.direct_messages;
create policy "Friends can send direct messages"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and not public.are_users_blocked(sender_id, recipient_id)
    and exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = sender_id and fr.recipient_id = direct_messages.recipient_id)
          or (fr.requester_id = direct_messages.recipient_id and fr.recipient_id = sender_id)
        )
    )
  );

drop policy if exists "Recipients can mark direct messages read" on public.direct_messages;
create policy "Recipients can mark direct messages read"
  on public.direct_messages for update to authenticated
  using (
    recipient_id = auth.uid()
    and read_at is null
    and not public.are_users_blocked(sender_id, recipient_id)
  )
  with check (
    recipient_id = auth.uid()
    and read_at is not null
    and not public.are_users_blocked(sender_id, recipient_id)
  );

alter table public.community_reports
  drop constraint if exists community_reports_target_type_check;
alter table public.community_reports
  add constraint community_reports_target_type_check
  check (target_type in ('daily_log', 'opportunity', 'member'));

alter table public.community_reports
  drop constraint if exists community_reports_reason_check;
alter table public.community_reports
  add constraint community_reports_reason_check
  check (reason in (
    'harassment',
    'spam',
    'personal_information',
    'broken_link',
    'incorrect_deadline',
    'closed_opportunity',
    'other',
    'message_safety'
  ));

drop policy if exists "Profiles are visible according to privacy settings" on public.profiles;
create policy "Profiles are visible according to privacy settings"
  on public.profiles as restrictive for select to authenticated
  using (
    id = auth.uid()
    or (
      not public.are_users_blocked(auth.uid(), id)
      or exists (
        select 1 from public.user_blocks b
        where b.blocked_by = auth.uid() and b.blocked_user = profiles.id
      )
    )
    and (
        id = auth.uid()
        or is_profile_public
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or exists (
          select 1
          from public.user_blocks b
          where b.blocked_by = auth.uid() and b.blocked_user = profiles.id
        )
        or exists (
          select 1
          from public.friend_requests fr
          where fr.status = 'accepted'
            and (
              (fr.requester_id = auth.uid() and fr.recipient_id = profiles.id)
              or (fr.recipient_id = auth.uid() and fr.requester_id = profiles.id)
            )
          )
    )
  );

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['friend_requests', 'direct_messages', 'user_blocks']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';
