create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_club_id text not null,
  guest_club_id text,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  created_at timestamptz not null default now()
);

grant select, insert, update on public.game_rooms to anon;
grant select, insert, update on public.game_rooms to authenticated;
grant all on public.game_rooms to service_role;

alter table public.game_rooms enable row level security;

create policy "anyone can create a room" on public.game_rooms
  for insert with check (true);

create policy "anyone can read rooms" on public.game_rooms
  for select using (true);

create policy "anyone can update rooms" on public.game_rooms
  for update using (true);