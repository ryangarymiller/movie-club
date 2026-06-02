-- Enforce spec: only a film's picker may create/edit predictions for that film.
-- Previously any authenticated user could manage their own prediction rows for any movie.
drop policy if exists "Users manage own predictions" on public.score_predictions;

create policy "picker manages own predictions" on public.score_predictions for all
using (
  auth.uid() = predicting_user_id
  and exists (
    select 1 from public.movies m
    where m.id = score_predictions.movie_id and m.picked_by_user_id = auth.uid()
  )
)
with check (
  auth.uid() = predicting_user_id
  and exists (
    select 1 from public.movies m
    where m.id = score_predictions.movie_id and m.picked_by_user_id = auth.uid()
  )
);
