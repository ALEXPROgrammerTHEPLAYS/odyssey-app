alter table public.challenge_participants
  add column if not exists completed_at timestamptz;

revoke update on public.challenge_participants from authenticated;
grant update (completed_at) on public.challenge_participants to authenticated;

drop policy if exists "Users can complete own challenges" on public.challenge_participants;
create policy "Users can complete own challenges"
  on public.challenge_participants for update to authenticated
  using (user_id = auth.uid() and completed_at is null)
  with check (user_id = auth.uid() and completed_at is not null);

notify pgrst, 'reload schema';
