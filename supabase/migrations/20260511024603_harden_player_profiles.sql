create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "Players can read own profile" on public.player_profiles;
create policy "Players can read own profile"
on public.player_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players can create own profile" on public.player_profiles;
create policy "Players can create own profile"
on public.player_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update own profile" on public.player_profiles;
create policy "Players can update own profile"
on public.player_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
