-- TMDB community metrics cached on movies, for award computations:
--   The Underrated = club average vs TMDB average (we rate it higher than the world).
--   The Deep Cut   = genre rarity (vs the club's catalog) + obscurity (low TMDB vote_count).
-- Backfilled for existing films from the TMDB API; new films should populate these the
-- same way genre is fetched.
alter table public.movies
  add column if not exists tmdb_vote_average numeric,
  add column if not exists tmdb_vote_count integer,
  add column if not exists tmdb_popularity numeric;
