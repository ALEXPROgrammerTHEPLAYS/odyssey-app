alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text,
  add column if not exists location text not null default '',
  add column if not exists website_url text not null default '',
  add column if not exists github text not null default '',
  add column if not exists linkedin text not null default '',
  add column if not exists portfolio text not null default '',
  add column if not exists target_orgs text[] not null default '{}',
  add column if not exists daily_goal_hours integer not null default 4;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile avatars" on storage.objects;
create policy "Public can view profile avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-avatars');

drop policy if exists "Users can upload their own profile avatar" on storage.objects;
create policy "Users can upload their own profile avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own profile avatar" on storage.objects;
create policy "Users can update their own profile avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own profile avatar" on storage.objects;
create policy "Users can delete their own profile avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
