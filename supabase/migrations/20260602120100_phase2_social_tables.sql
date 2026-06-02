-- Phase 2 — Social tables: reviews, comments, reactions, veto_votes
-- RLS mirrors the existing model: admins see all; rolling visibility reuses
-- auth_user_has_scored(movie_id); members manage their own rows.

-- ── REVIEWS (one primary review per user per film) ──────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  movie_id    uuid not null references public.movies(id) on delete cascade,
  user_id     uuid not null references public.users(id)  on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (movie_id, user_id)
);
alter table public.reviews enable row level security;

create policy "reviews rolling visibility" on public.reviews for select
using (
  auth.uid() is not null and (
    user_id = auth.uid()
    or exists (select 1 from public.movies m where m.id = reviews.movie_id and m.scores_revealed = true)
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    or (
      auth_user_has_scored(reviews.movie_id)
      and exists (select 1 from public.ratings r where r.movie_id = reviews.movie_id and r.user_id = reviews.user_id and r.score is not null)
    )
  )
);
create policy "reviews insert own" on public.reviews for insert with check (auth.uid() = user_id);
create policy "reviews update own" on public.reviews for update using (auth.uid() = user_id);
create policy "reviews delete own or admin" on public.reviews for delete
using (auth.uid() = user_id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ── COMMENTS (threaded; reaction_counts aggregated at query time) ────────
create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  movie_id          uuid not null references public.movies(id) on delete cascade,
  user_id           uuid not null references public.users(id)  on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body              text not null,
  reaction_counts   jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.comments enable row level security;
create index if not exists comments_movie_id_idx on public.comments(movie_id);
create index if not exists comments_parent_idx on public.comments(parent_comment_id);

create policy "comments rolling visibility" on public.comments for select
using (
  auth.uid() is not null and (
    user_id = auth.uid()
    or exists (select 1 from public.movies m where m.id = comments.movie_id and m.scores_revealed = true)
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    or (
      auth_user_has_scored(comments.movie_id)
      and exists (select 1 from public.ratings r where r.movie_id = comments.movie_id and r.user_id = comments.user_id and r.score is not null)
    )
  )
);
create policy "comments insert own" on public.comments for insert with check (auth.uid() = user_id);
-- Members may edit their own comments (15-min window enforced in UI); no member delete.
create policy "comments update own" on public.comments for update using (auth.uid() = user_id);
create policy "comments delete admin only" on public.comments for delete
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ── REACTIONS (emoji per user per comment) ──────────────────────────────
create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references public.users(id)    on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);
alter table public.reactions enable row level security;
create index if not exists reactions_comment_idx on public.reactions(comment_id);

create policy "reactions readable" on public.reactions for select using (auth.uid() is not null);
create policy "reactions insert own" on public.reactions for insert with check (auth.uid() = user_id);
create policy "reactions delete own" on public.reactions for delete using (auth.uid() = user_id);

-- ── VETO VOTES (3+/5 triggers picker resubmission) ──────────────────────
create table if not exists public.veto_votes (
  id              uuid primary key default gen_random_uuid(),
  movie_id        uuid not null references public.movies(id) on delete cascade,
  voting_user_id  uuid not null references public.users(id)  on delete cascade,
  created_at      timestamptz not null default now(),
  unique (movie_id, voting_user_id)
);
alter table public.veto_votes enable row level security;

create policy "veto readable" on public.veto_votes for select using (auth.uid() is not null);
create policy "veto insert own" on public.veto_votes for insert with check (auth.uid() = voting_user_id);
create policy "veto delete own or admin" on public.veto_votes for delete
using (auth.uid() = voting_user_id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
