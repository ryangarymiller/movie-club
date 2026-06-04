-- Phase 7 — private per-member lists.
--   watchlist   : films a member wants to watch (saved, unordered).
--   draft_queue : films a member plans to PICK next, ranked (drag/reorder via `position`).
-- Both are strictly private — RLS scopes every operation to the owning member.

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tmdb_id integer not null,
  title text not null,
  poster_url text,
  year_released integer,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);

create table if not exists public.draft_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tmdb_id integer not null,
  title text not null,
  poster_url text,
  year_released integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);

alter table public.watchlist enable row level security;
alter table public.draft_queue enable row level security;

create policy "own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own draft_queue" on public.draft_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists watchlist_user_idx on public.watchlist(user_id);
create index if not exists draft_queue_user_pos_idx on public.draft_queue(user_id, position);
