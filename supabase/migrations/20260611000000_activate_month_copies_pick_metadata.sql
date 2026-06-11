-- Materialization now copies the FULL TMDB enrichment captured at pick time
-- (upcoming_picks.metadata) into the movies row: director, year, runtime, genre,
-- plot, streaming providers, full cast, writers, and TMDB vote stats. Previously
-- only title/tmdb_id/poster/justification were copied, so every new month's films
-- started with empty metadata (no Cast & Crew, no Connection Web edges, no recap
-- plot context) until someone backfilled by hand. coalesce() keeps any existing
-- value when a pick's metadata lacks a field (e.g. picks made before this change).
CREATE OR REPLACE FUNCTION public.activate_month(p_month_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m record; is_admin boolean; due boolean;
  active_d date; n int; i int := 0; days_in int; step numeric; pk record;
  next_my text; next_season uuid;
  cur_season record; prior_season record; v_len int; v_start timestamptz; v_end timestamptz;
  v_demoted uuid;
  v_cast text[]; v_writers text[]; v_genre text[];
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  due := m.auto_activate and active_d <= (now() at time zone 'America/Los_Angeles')::date;

  if auth.uid() is not null then
    select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
    if not is_admin and not due then
      raise exception 'not authorized to activate this month';
    end if;
  end if;

  select id into v_demoted from months where status = 'active' and id <> p_month_id limit 1;

  update months set status = 'revealed' where status = 'active' and id <> p_month_id;
  update months set status = 'active' where id = p_month_id;

  if v_demoted is not null then
    update movies set scores_revealed = true, picker_revealed = true where month_id = v_demoted;
  end if;

  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    -- Enrichment from the pick's metadata (null-safe: absent keys yield NULL).
    v_cast := (select array_agg(value) from jsonb_array_elements_text(pk.metadata->'tmdb_cast'));
    v_writers := (select array_agg(value) from jsonb_array_elements_text(pk.metadata->'tmdb_writers'));
    v_genre := case
      when nullif(trim(pk.metadata->>'genre'), '') is not null
        then string_to_array(pk.metadata->>'genre', ', ')
      else null end;

    update movies set
        title = pk.title, tmdb_id = pk.tmdb_id, poster_url = pk.poster_url,
        pick_justification = nullif(pk.metadata->>'justification',''),
        director = coalesce(nullif(pk.metadata->>'director',''), director),
        year_released = coalesce(nullif(pk.metadata->>'year','')::int, year_released),
        runtime_minutes = coalesce((pk.metadata->>'runtime_minutes')::int, runtime_minutes),
        genre = coalesce(v_genre, genre),
        plot_summary = coalesce(nullif(pk.metadata->>'plot_summary',''), plot_summary),
        streaming_providers = coalesce(pk.metadata->'streaming_providers', streaming_providers),
        tmdb_cast = coalesce(v_cast, tmdb_cast),
        tmdb_writers = coalesce(v_writers, tmdb_writers),
        tmdb_vote_average = coalesce((pk.metadata->>'tmdb_vote_average')::numeric, tmdb_vote_average),
        tmdb_vote_count = coalesce((pk.metadata->>'tmdb_vote_count')::int, tmdb_vote_count),
        tmdb_popularity = coalesce((pk.metadata->>'tmdb_popularity')::numeric, tmdb_popularity)
      where month_id = p_month_id and picked_by_user_id = pk.user_id;
    if not found then
      insert into movies (month_id, title, tmdb_id, poster_url, picked_by_user_id, pick_justification,
                          director, year_released, runtime_minutes, genre, plot_summary,
                          streaming_providers, tmdb_cast, tmdb_writers,
                          tmdb_vote_average, tmdb_vote_count, tmdb_popularity, created_at)
      values (p_month_id, pk.title, pk.tmdb_id, pk.poster_url, pk.user_id, nullif(pk.metadata->>'justification',''),
              nullif(pk.metadata->>'director',''),
              nullif(pk.metadata->>'year','')::int,
              (pk.metadata->>'runtime_minutes')::int,
              v_genre,
              nullif(pk.metadata->>'plot_summary',''),
              pk.metadata->'streaming_providers',
              v_cast, v_writers,
              (pk.metadata->>'tmdb_vote_average')::numeric,
              (pk.metadata->>'tmdb_vote_count')::int,
              (pk.metadata->>'tmdb_popularity')::numeric,
              now());
    end if;
  end loop;

  select count(*) into n from movies where month_id = p_month_id;
  if n > 0 then
    days_in := extract(day from (date_trunc('month', active_d) + interval '1 month' - interval '1 day'))::int;
    step := days_in::numeric / n;
    for pk in select id from movies where month_id = p_month_id order by created_at, id loop
      i := i + 1;
      update movies set scoring_deadline = (active_d + (round(step * i))::int * interval '1 day')::timestamptz where id = pk.id;
    end loop;
  end if;

  next_my := to_char((to_date(m.month_year || '-01','YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');
  if not exists (select 1 from months where month_year = next_my) then
    select s.id into next_season from seasons s
      where (next_my || '-01')::date between s.start_date and s.end_date limit 1;
    if next_season is not null then
      insert into months (season_id, month_year, status, active_date, auto_activate)
      values (next_season, next_my, 'upcoming', (next_my || '-01')::date, true);
    end if;
  end if;

  select * into cur_season from seasons where id = m.season_id;
  if cur_season is not null
     and to_date(m.month_year || '-01','YYYY-MM-DD') = date_trunc('month', cur_season.start_date)::date then
    select * into prior_season from seasons
      where end_date < cur_season.start_date order by end_date desc limit 1;
    if prior_season is not null
       and coalesce(prior_season.readjustment_auto, true)
       and not prior_season.readjustment_open
       and prior_season.readjustment_ends_at is null then
      select readjustment_length_days into v_len from app_settings limit 1;
      v_len := coalesce(v_len, 7);
      v_start := ((prior_season.end_date + 1)::timestamp at time zone 'America/Los_Angeles');
      v_end := v_start + make_interval(days => v_len);
      update seasons set readjustment_open = true, readjustment_ends_at = v_end where id = prior_season.id;
    end if;
  end if;
end;
$function$;
