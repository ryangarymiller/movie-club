-- Enforce spec rolling-access at the DB layer: you may only post a comment/review
-- on a film you have actually scored (admins exempt). Mirrors the UI's canParticipate gate.

drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own (scored)" on public.comments for insert
with check (
  auth.uid() = user_id
  and (
    auth_user_has_scored(movie_id)
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
);

drop policy if exists "reviews insert own" on public.reviews;
create policy "reviews insert own (scored)" on public.reviews for insert
with check (
  auth.uid() = user_id
  and (
    auth_user_has_scored(movie_id)
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
);
