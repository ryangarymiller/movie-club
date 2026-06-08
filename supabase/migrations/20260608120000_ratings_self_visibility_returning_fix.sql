-- Fix: a member's FIRST score on an unrevealed (active-month) film failed via the
-- app with "new row violates row-level security policy for table ratings".
--
-- Root cause: the app upsert returns the row (RETURNING), so PostgreSQL applies the
-- ratings SELECT policy to the just-inserted row. That policy only granted
-- self-visibility through auth_user_has_scored(movie_id) — a subquery on `ratings`
-- that does NOT see the row being inserted in the same statement (snapshot), so it
-- returned false and the RETURNING was denied. (Only surfaced now because all the
-- historical Jan–May scores were imported server-side, bypassing this path;
-- Adaptation was the first score entered live via the app on the active month.)
--
-- Fix: add a direct `user_id = auth.uid()` clause — a column comparison, not a
-- subquery, so it's snapshot-safe and matches the spec ("a user always sees their
-- own score regardless of reveal status"). The other branches (revealed films,
-- admin, and "you've scored it" for OTHERS' rows) are unchanged.

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
