-- Reddit-style discussion: reviews are thread roots (multiple per user), comments nest
-- under a review (and under each other), reactions are polymorphic, plus up/down votes.

-- 1) Allow multiple reviews per user per film (each review = its own thread).
alter table public.reviews drop constraint if exists reviews_movie_id_user_id_key;

-- 2) A comment belongs to a review thread (nullable = general film-level comment),
--    and may nest under a parent comment (already supported via parent_comment_id).
alter table public.comments add column if not exists review_id uuid references public.reviews(id) on delete cascade;
create index if not exists comments_review_id_idx on public.comments(review_id);

-- 3) Make reactions polymorphic so they can target a review OR a comment.
alter table public.reactions add column if not exists target_type text;
alter table public.reactions add column if not exists target_id uuid;
update public.reactions set target_type = 'comment', target_id = comment_id where target_id is null and comment_id is not null;
alter table public.reactions alter column comment_id drop not null;
create index if not exists reactions_target_idx on public.reactions(target_type, target_id);
create unique index if not exists reactions_target_user_emoji_key on public.reactions(target_type, target_id, user_id, emoji) where target_id is not null;

-- 4) Up/down votes on reviews and comments.
create table if not exists public.votes (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('review','comment')),
  target_id   uuid not null,
  user_id     uuid not null references public.users(id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);
alter table public.votes enable row level security;
create index if not exists votes_target_idx on public.votes(target_type, target_id);

create policy "votes readable" on public.votes for select using (auth.uid() is not null);
create policy "votes insert own" on public.votes for insert with check (auth.uid() = user_id);
create policy "votes update own" on public.votes for update using (auth.uid() = user_id);
create policy "votes delete own" on public.votes for delete using (auth.uid() = user_id);
