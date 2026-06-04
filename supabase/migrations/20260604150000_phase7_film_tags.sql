-- Phase 7 — film tags.
--   Members tag a film (descriptive labels like "slow burn", "rewatchable") at
--   rating time; tags are aggregated with counts on the film page.
-- Tags are attributed to the applying member (one row per member+tag+film) but
-- displayed in aggregate. Any member can read all tags; you may only add/remove
-- your own. Tag text is normalized client-side (trim + lowercase + collapse).

create table if not exists public.film_tags (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (movie_id, user_id, tag)
);

alter table public.film_tags enable row level security;

-- Read: any authenticated member (tags are shown in aggregate on the film page).
create policy "film_tags readable" on public.film_tags
  for select using (auth.uid() is not null);
-- Write: you may only add/remove your own tags.
create policy "film_tags insert own" on public.film_tags
  for insert with check (auth.uid() = user_id);
create policy "film_tags delete own" on public.film_tags
  for delete using (auth.uid() = user_id);

create index if not exists film_tags_movie_idx on public.film_tags(movie_id);
