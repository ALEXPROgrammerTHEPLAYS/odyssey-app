create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_no_self check (requester_id <> recipient_id)
);

create unique index if not exists friend_requests_one_active_per_pair
  on public.friend_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  )
  where status in ('pending', 'accepted');
create index if not exists friend_requests_recipient_pending
  on public.friend_requests (recipient_id, created_at desc)
  where status = 'pending';
create index if not exists friend_requests_requester_pending
  on public.friend_requests (requester_id, created_at desc)
  where status = 'pending';

alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from public, anon;
grant select, insert on public.friend_requests to authenticated;
grant update (status, updated_at) on public.friend_requests to authenticated;

drop policy if exists "Users can view their friend requests" on public.friend_requests;
create policy "Users can view their friend requests"
  on public.friend_requests for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists "Recipients can respond to friend requests" on public.friend_requests;
create policy "Recipients can respond to friend requests"
  on public.friend_requests for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending')
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined'));

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_no_self check (sender_id <> recipient_id)
);

create index if not exists direct_messages_conversation_order
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_recipient_order
  on public.direct_messages (recipient_id, sender_id, created_at desc);

alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon;
grant select, insert on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;

drop policy if exists "Friends can view direct messages" on public.direct_messages;
create policy "Friends can view direct messages"
  on public.direct_messages for select to authenticated
  using (
    (sender_id = auth.uid() or recipient_id = auth.uid())
    and exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = direct_messages.sender_id and fr.recipient_id = direct_messages.recipient_id)
          or (fr.requester_id = direct_messages.recipient_id and fr.recipient_id = direct_messages.sender_id)
        )
    )
  );

drop policy if exists "Friends can send direct messages" on public.direct_messages;
create policy "Friends can send direct messages"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
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
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists "Profiles are visible according to privacy settings" on public.profiles;
create policy "Profiles are visible according to privacy settings"
  on public.profiles as restrictive for select to authenticated
  using (
    id = auth.uid()
    or is_profile_public
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = auth.uid() and fr.recipient_id = profiles.id)
          or (fr.recipient_id = auth.uid() and fr.requester_id = profiles.id)
        )
    )
  );

notify pgrst, 'reload schema';
