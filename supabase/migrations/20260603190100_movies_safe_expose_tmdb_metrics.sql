-- Expose the (public, non-sensitive) TMDB community metrics through movies_safe so award
-- computations can read them. Appended at the END (CREATE OR REPLACE VIEW only allows
-- appending columns), preserving the existing column order + picker-anonymity CASE logic.
create or replace view public.movies_safe as
 select id, month_id, title, tmdb_id, year_released, genre, director, runtime_minutes,
        poster_url, plot_summary, streaming_providers, scores_revealed, picker_revealed,
        scoring_deadline, historical_avg_score, created_at,
        case
            when (picker_revealed = true) then picked_by_user_id
            when (exists ( select 1 from users where ((users.id = auth.uid()) and (users.role = 'admin'::user_role)))) then picked_by_user_id
            else null::uuid
        end as picked_by_user_id,
        case
            when (picker_revealed = true) then pick_justification
            when (exists ( select 1 from users where ((users.id = auth.uid()) and (users.role = 'admin'::user_role)))) then pick_justification
            else null::text
        end as pick_justification,
        tmdb_vote_average, tmdb_vote_count, tmdb_popularity
   from movies m;
