alter table public.challenge_participants
  add column if not exists challenge_key text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'challenge_participants'
      and column_name = 'challenge_id'
  ) then
    execute $sql$
      update public.challenge_participants
      set challenge_key = 'legacy:' || challenge_id::text
      where challenge_key is null
    $sql$;
    execute 'alter table public.challenge_participants alter column challenge_id drop not null';
  end if;
end
$$;

update public.challenge_participants
set challenge_key = 'legacy:' || id::text
where challenge_key is null;

alter table public.challenge_participants
  alter column challenge_key set not null;

notify pgrst, 'reload schema';
