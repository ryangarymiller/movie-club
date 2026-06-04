-- Writers per film (from TMDB credits crew, Writing department) so the Connection
-- Web · 6 Degrees can bridge films by a shared screenwriter as well as actor /
-- director (e.g. Charlie Kaufman links Adaptation, Being John Malkovich, and
-- Eternal Sunshine). Backfilled from /movie/{id}/credits; exposed via movies_safe.
alter table public.movies add column if not exists tmdb_writers text[];

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
        tmdb_vote_average, tmdb_vote_count, tmdb_popularity, tmdb_cast, tmdb_writers
   from movies m;
