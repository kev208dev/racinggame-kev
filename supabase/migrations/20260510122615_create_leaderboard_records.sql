create table if not exists public.leaderboard_records (
  player_id text not null,
  car_id text not null,
  track_id text not null,
  player_name text not null,
  car_name text not null,
  track_name text not null,
  lap_ms integer not null check (lap_ms between 1000 and 1800000),
  sectors jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (player_id, car_id, track_id)
);

create index if not exists leaderboard_track_car_lap_idx
  on public.leaderboard_records (track_id, car_id, lap_ms, created_at);

create index if not exists leaderboard_global_lap_idx
  on public.leaderboard_records (lap_ms, created_at);

alter table public.leaderboard_records enable row level security;

revoke all on table public.leaderboard_records from anon, authenticated;
