alter table public.leaderboard_records
  add column if not exists player_theme_color text not null default '#2ec4b6'
  check (player_theme_color ~ '^#[0-9A-Fa-f]{6}$');
