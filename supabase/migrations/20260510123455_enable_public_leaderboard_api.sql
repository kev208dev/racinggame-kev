grant select, insert, update on table public.leaderboard_records to anon, authenticated;

create policy "public leaderboard read"
  on public.leaderboard_records
  for select
  to anon, authenticated
  using (true);

create policy "public leaderboard insert"
  on public.leaderboard_records
  for insert
  to anon, authenticated
  with check (
    player_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and car_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and track_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and length(player_name) between 1 and 40
    and length(car_name) between 1 and 40
    and length(track_name) between 1 and 40
    and lap_ms between 1000 and 1800000
    and jsonb_typeof(sectors) = 'array'
  );

create policy "public leaderboard update"
  on public.leaderboard_records
  for update
  to anon, authenticated
  using (true)
  with check (
    player_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and car_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and track_id ~ '^[a-zA-Z0-9_-]{1,48}$'
    and length(player_name) between 1 and 40
    and length(car_name) between 1 and 40
    and length(track_name) between 1 and 40
    and lap_ms between 1000 and 1800000
    and jsonb_typeof(sectors) = 'array'
  );

create or replace function public.keep_best_leaderboard_lap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.created_at := old.created_at;

  if new.lap_ms >= old.lap_ms then
    new.lap_ms := old.lap_ms;
    new.sectors := old.sectors;
    new.car_name := old.car_name;
    new.track_name := old.track_name;
  end if;

  return new;
end;
$$;

drop trigger if exists keep_best_leaderboard_lap on public.leaderboard_records;
create trigger keep_best_leaderboard_lap
  before update on public.leaderboard_records
  for each row
  execute function public.keep_best_leaderboard_lap();
