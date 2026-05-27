create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Driver',
  theme_color text not null default '#2ec4b6' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  coins integer not null default 0 check (coins >= 0),
  owned_car_ids text[] not null default array['apex_gt3','feather_sprint']::text[],
  completed_missions text[] not null default array[]::text[],
  starter_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists player_profiles_set_updated_at on public.player_profiles;
create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function public.set_updated_at();

drop policy if exists "Players can read own profile" on public.player_profiles;
create policy "Players can read own profile"
on public.player_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Players can create own profile" on public.player_profiles;
create policy "Players can create own profile"
on public.player_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Players can update own profile" on public.player_profiles;
create policy "Players can update own profile"
on public.player_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on table public.player_profiles to authenticated;
