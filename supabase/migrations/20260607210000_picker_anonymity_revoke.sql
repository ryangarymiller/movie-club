-- Picker anonymity hardening — STAGE C (the actual enforcement).
--
-- Stop members reading picked_by_user_id / pick_justification for UNREVEALED films
-- directly from base `movies`. A bare column-level REVOKE is a no-op while a
-- TABLE-level SELECT grant exists (it covers all columns), so we instead:
--   1. revoke the table-level SELECT, then
--   2. re-grant column-level SELECT on every column EXCEPT the two sensitive ones.
-- The only read path to the picker columns is now movies_safe (masks until
-- picker_revealed; exposes to admins via its CASE).
--
-- Safe because (stages A+B, live): score_predictions' policy uses the SECURITY
-- DEFINER is_movie_picker() helper, every client read of those columns was rerouted
-- to the RPC helpers / movies_safe, and the ratings SELECT policy only references
-- movies.scores_revealed/id (still granted). movies_safe runs as owner (full access).

revoke select on public.movies from anon, authenticated;

grant select (
  id, month_id, title, tmdb_id, year_released, genre, director, runtime_minutes,
  poster_url, plot_summary, streaming_providers, scores_revealed, picker_revealed,
  scoring_deadline, historical_avg_score, created_at, tmdb_vote_average,
  tmdb_vote_count, tmdb_popularity, tmdb_cast, tmdb_writers, veto_resubmit_required
) on public.movies to authenticated;
-- anon gets no movies grant (RLS already returns 0 rows to anon; guest data is
-- served only through the definer guest_* views).
