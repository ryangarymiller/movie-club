-- Picker anonymity hardening — STAGE A (safe, additive; no revoke yet).
--
-- Problem: picker masking lived only in the movies_safe view, but base `movies`
-- was column-readable by any authenticated member, so a member could read
-- picked_by_user_id / pick_justification for UNREVEALED films directly. The real
-- fix (Stage C) revokes SELECT on those two columns from anon/authenticated. But
-- two things currently depend on reading that column as the caller:
--   1. the score_predictions "picker manages own predictions" RLS policy
--      (inline EXISTS on movies.picked_by_user_id), and
--   2. client self-pick queries.
-- Both must go through a SECURITY DEFINER helper first, so they keep working once
-- the column grant is revoked. This stage adds the helpers + rewrites the policy
-- (equivalent behavior) — it does NOT revoke anything, so the current client keeps
-- working until the rerouted client ships.

-- Owner-rights check: "did p_user pick this film?" (bypasses the column grant).
create or replace function public.is_movie_picker(p_movie_id uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from movies where id = p_movie_id and picked_by_user_id = p_user)
$$;

-- "Did the CURRENT caller pick this film?" — for the client self-pick check.
create or replace function public.auth_user_picked(p_movie_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_movie_picker(p_movie_id, auth.uid())
$$;

-- The movie ids the CURRENT caller picked — for "my own picks" client reads
-- (the picker can see their own pick even before reveal; the mask hides it from
-- everyone else).
create or replace function public.auth_user_picked_movie_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select id from movies where picked_by_user_id = auth.uid()
$$;

revoke all on function public.is_movie_picker(uuid, uuid) from public, anon;
revoke all on function public.auth_user_picked(uuid) from public, anon;
revoke all on function public.auth_user_picked_movie_ids() from public, anon;
grant execute on function public.is_movie_picker(uuid, uuid) to authenticated;
grant execute on function public.auth_user_picked(uuid) to authenticated;
grant execute on function public.auth_user_picked_movie_ids() to authenticated;

-- Rewrite the score_predictions policy to use the helper instead of inline-reading
-- movies.picked_by_user_id (so it survives the Stage-C column revoke). Same logic.
drop policy if exists "picker manages own predictions" on public.score_predictions;
create policy "picker manages own predictions" on public.score_predictions
  for all
  using (auth.uid() = predicting_user_id and public.is_movie_picker(movie_id, auth.uid()))
  with check (auth.uid() = predicting_user_id and public.is_movie_picker(movie_id, auth.uid()));
