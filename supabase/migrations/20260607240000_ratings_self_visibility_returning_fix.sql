-- Fix: a member's FIRST score on an unrevealed (active-month) film failed via the
-- app with "new row violates row-level security policy for table ratings".
--
-- Cause: supabase-js upserts with RETURNING, and PostgreSQL applies the SELECT
-- policy to the returned row. The rolling-reveal SELECT policy only granted a user
-- visibility of their OWN unrevealed row through auth_user_has_scored(movie_id) —
-- a SECURITY DEFINER subquery over `ratings` that does NOT see the row being
-- inserted in the same statement (snapshot), so it returned false and the RETURNING
-- was denied. (Never hit before because the historical scores were all imported via
-- the service role, bypassing this path; the active May month is the first scored
-- live through the app.)
--
-- Fix: add a direct `user_id = auth.uid()` clause — a column comparison, snapshot-
-- safe, no subquery — which also matches the spec ("a user always sees their own
-- score regardless of reveal status"). Other branches (revealed films, admin, and
-- "you've scored it" for OTHERS' rows) are preserved, so no extra exposure.
drop policy if exists "rolling score visibility" on public.ratings;
create policy "rolling score visibility" on public.ratings
  for select using (
    auth.uid() is not null and (
      ratings.user_id = auth.uid()
      or exists (select 1 from movies where movies.id = ratings.movie_id and movies.scores_revealed = true)
      or exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)
      or (score is not null and auth_user_has_scored(movie_id))
    )
  );
