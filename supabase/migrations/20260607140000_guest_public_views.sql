-- Guest mode (Phase 7) — a PUBLIC, read-only window for unauthenticated visitors.
--
-- SECURITY MODEL: the repo is public and anon is an untrusted role, so we do NOT
-- open table-level RLS. Instead we expose a tiny, hardcoded surface: three
-- SECURITY DEFINER views (security_invoker = false → they run as the owner and
-- bypass base-table RLS) that bake in EVERY safety filter:
--   • only films with scores_revealed = true (no unrevealed picks ever leak),
--   • the picker label only when picker_revealed,
--   • member names abbreviated to "First L." (no full names / emails / ids),
--   • the test account excluded everywhere.
-- anon is granted SELECT on these views ONLY — never the base tables (whose RLS
-- still requires auth.uid()). Nothing else (profiles, watchlists, draft queues,
-- predictions, guesses, notifications, upcoming picks) is reachable by a guest.

-- "Ryan M." style abbreviation (single-word names pass through).
create or replace function public.abbrev_name(full_name text) returns text
language sql immutable as $$
  select case
    when full_name is null or btrim(full_name) = '' then 'Member'
    when position(' ' in btrim(full_name)) = 0 then btrim(full_name)
    else split_part(btrim(full_name), ' ', 1) || ' '
         || left(split_part(btrim(full_name), ' ', 2), 1) || '.'
  end
$$;

-- ── Revealed films (poster wall + film pages) ────────────────────────────────
create or replace view public.guest_films
with (security_invoker = false) as
select
  m.id,
  m.month_id,
  mo.month_year,
  m.title,
  m.poster_url,
  m.year_released,
  m.director,
  m.genre,
  m.runtime_minutes,
  m.plot_summary,
  m.tmdb_vote_average,
  case when m.picker_revealed then public.abbrev_name(pu.name) end as picker_label,
  case when m.picker_revealed then m.pick_justification end as pick_justification,
  coalesce(
    m.historical_avg_score,
    (select round(avg(r.score)::numeric, 2)
       from ratings r join users u on u.id = r.user_id
      where r.movie_id = m.id and r.score is not null
        and u.email <> 'i.am.ryan.the.miller@gmail.com')
  ) as club_avg
from movies m
join months mo on mo.id = m.month_id
left join users pu on pu.id = m.picked_by_user_id
where m.scores_revealed = true;

-- ── Per-member scores on revealed films (abbreviated, test excluded) ─────────
create or replace view public.guest_scores
with (security_invoker = false) as
select
  r.movie_id,
  public.abbrev_name(u.name) as member_label,
  r.score
from ratings r
join users u on u.id = r.user_id
join movies m on m.id = r.movie_id
where m.scores_revealed = true
  and r.score is not null
  and u.email <> 'i.am.ryan.the.miller@gmail.com';

-- ── Reviews on revealed films (abbreviated, test excluded) ───────────────────
create or replace view public.guest_reviews
with (security_invoker = false) as
select
  rv.id,
  rv.movie_id,
  public.abbrev_name(u.name) as author_label,
  rv.body,
  rv.created_at
from reviews rv
join users u on u.id = rv.user_id
join movies m on m.id = rv.movie_id
where m.scores_revealed = true
  and u.email <> 'i.am.ryan.the.miller@gmail.com'
  and rv.body is not null and btrim(rv.body) <> '';

-- anon may read ONLY these three views (not the base tables).
grant select on public.guest_films, public.guest_scores, public.guest_reviews to anon;
-- authenticated members can read them too (harmless; same public data).
grant select on public.guest_films, public.guest_scores, public.guest_reviews to authenticated;
