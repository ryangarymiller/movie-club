-- Phase 0 (Movie Club 2.0 foundation) — step 5 of 7
-- The coexistence switch (R1): a mode discriminator on months plus one app-level
-- setting, and a mode='v1' guard on EVERY 1.0 lifecycle object — by redefinition,
-- never by DROP. After this migration prod behaves identically (every month is v1
-- and club_mode is v1); the guards are inert until the first v2 month exists.
-- Also: every lifecycle function that still carried the test-account literal is
-- redefined here through the expected_members() kernel (20260924020000), and a
-- self-check at the end proves no live function or view references the address.

-- ---------------------------------------------------------------------------
-- 1. Discriminators
-- ---------------------------------------------------------------------------

alter table public.months
  add column if not exists mode text not null default 'v1',
  add column if not exists theme text,
  add column if not exists submissions_close_at timestamptz,
  add column if not exists started_at timestamptz;

alter table public.months drop constraint if exists months_mode_check;
alter table public.months add constraint months_mode_check check (mode in ('v1','v2'));

comment on column public.months.mode is
  'Which lifecycle governs this month: v1 = one pick per member, calendar-activated; v2 = themed candidate pool, Borda vote, one film at a time, people-gated. Era marker for stats.';
comment on column public.months.theme is 'v2: free-text theme label for the month''s candidate list.';
comment on column public.months.submissions_close_at is 'v2: when the candidate list locks (rule 5).';
comment on column public.months.started_at is 'v2: actual start (months may start late — D8); drives season assignment instead of the calendar.';

alter table public.app_settings
  add column if not exists club_mode text not null default 'v1';
alter table public.app_settings drop constraint if exists app_settings_club_mode_check;
alter table public.app_settings add constraint app_settings_club_mode_check check (club_mode in ('v1','v2'));

comment on column public.app_settings.club_mode is
  'Which flow the current-round UI serves. Flipping back to v1 is the 2.0 revert.';

-- ---------------------------------------------------------------------------
-- 2. Guards on the 1.0 lifecycle (redefinitions; bodies otherwise unchanged)
-- ---------------------------------------------------------------------------

-- 2a. The completeness gate: v1-only, and now reads the shared kernel.
create or replace function public.month_picks_complete(p_month_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_my text; v_mode text;
  v_expected int; v_have int;
begin
  select month_year, mode into v_my, v_mode from months where id = p_month_id;
  if v_my is null or v_mode <> 'v1' then return false; end if;

  select count(*) into v_expected from public.expected_members(p_month_id);

  select count(distinct up.user_id) into v_have
  from upcoming_picks up
  where up.month_target = v_my
    and up.user_id in (select * from public.expected_members(p_month_id));

  return v_expected > 0 and v_have >= v_expected;
end $function$;

-- 2b. The orchestrator: refuses v2 targets, and refuses to demote a live v2 month.
create or replace function public.activate_month(p_month_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- 2.0 guard (R1): this is a 1.0 operation. A v2 month is never activated here,
  -- and a live v2 month is never demoted by it.
  if m.mode <> 'v1' then
    if auth.uid() is not null then
      raise exception 'activate_month is a 1.0 operation; month % is mode %', m.month_year, m.mode;
    end if;
    return;
  end if;
  if exists (select 1 from months where status = 'active' and mode = 'v2') then
    if auth.uid() is not null then
      raise exception 'a 2.0 month is active; 1.0 activation is disabled';
    end if;
    return;
  end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  due := m.auto_activate and active_d <= (now() at time zone 'America/Los_Angeles')::date;

  if auth.uid() is not null then
    select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
  else
    is_admin := false;
  end if;

  -- Only an admin may force (a non-admin passing p_force is ignored). A forced
  -- activation skips the due + completeness gates; every other path is gated.
  if not (p_force and is_admin) then
    if not due then
      if auth.uid() is not null then
        raise exception 'not authorized to activate this month';
      end if;
      return;
    end if;
    if not public.month_picks_complete(p_month_id) then
      return;
    end if;
  end if;

  select id into v_demoted from months where status = 'active' and id <> p_month_id limit 1;

  update months set status = 'revealed' where status = 'active' and id <> p_month_id;
  update months set status = 'active' where id = p_month_id;

  if v_demoted is not null then
    update movies set scores_revealed = true, picker_revealed = true where month_id = v_demoted;
  end if;

  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
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
      insert into months (season_id, month_year, status, active_date, auto_activate, mode)
      values (next_season, next_my, 'upcoming', (next_my || '-01')::date, true, 'v1');
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

-- 2c. The three pg_cron bodies. The jobs themselves are untouched (R1).
create or replace function public.cron_auto_activate_due_months()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m record;
begin
  if exists (select 1 from months where status = 'active' and mode = 'v2') then
    return;  -- 2.0 is live; the 1.0 cadence is dormant
  end if;
  for m in
    select id, month_year from months
    where mode = 'v1'
      and auto_activate = true
      and status = 'upcoming'
      and coalesce(active_date, (month_year || '-01')::date) <= (now() at time zone 'America/Los_Angeles')::date
      and public.month_picks_complete(id)
    order by month_year
  loop
    begin
      perform public.activate_month(m.id);
      raise notice 'cron_auto_activate: activated %', m.month_year;
    exception when others then
      raise warning 'cron_auto_activate: activate_month(% / %) failed: %', m.id, m.month_year, sqlerrm;
    end;
  end loop;
end $function$;

create or replace function public.cron_enforce_due_deadlines()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_grace int; v_count int;
begin
  select coalesce(deadline_grace_days, 1) into v_grace from app_settings limit 1;
  v_grace := coalesce(v_grace, 1);

  with due as (
    update movies mv
      set scores_revealed = true
      where mv.scores_revealed = false
        and mv.scoring_deadline is not null
        and mv.scoring_deadline + make_interval(days => v_grace) < now()
        and exists (select 1 from months mo where mo.id = mv.month_id and mo.status = 'active' and mo.mode = 'v1')
      returning mv.id
  )
  select count(*) into v_count from due;
  if v_count > 0 then
    raise notice 'cron_enforce_due_deadlines: revealed % film(s)', v_count;
  end if;
end
$function$;

create or replace function public.cron_notify_due_soon()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into notifications (user_id, type, title, body, link, payload)
  select u.id, 'deadline_soon',
         'Due tomorrow: ' || mv.title,
         mv.title || ' is due tomorrow — submit your score before the deadline.',
         '/films?film=' || mv.id,
         jsonb_build_object('movie_id', mv.id)
  from movies mv
  join months mo on mo.id = mv.month_id
  cross join users u
  where mo.status = 'active'
    and mo.mode = 'v1'
    and mv.scores_revealed = false
    and mv.scoring_deadline is not null
    and mv.scoring_deadline > now()
    and mv.scoring_deadline <= now() + interval '24 hours'
    and u.is_active
    and not u.is_test
    and not exists (
      select 1 from ratings r
      where r.movie_id = mv.id and r.user_id = u.id and r.score is not null)
    and not exists (
      select 1 from notifications n
      where n.user_id = u.id and n.type = 'deadline_soon'
        and n.payload->>'movie_id' = mv.id::text);
end
$function$;

-- 2d. Month-wide picker reveal: v1-only, and now absence-aware via the kernel
--     (it previously ignored month_absences, so an absent member blocked the reveal).
create or replace function public.reveal_picker_when_month_complete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month_id uuid; v_mode text;
  v_expected int; v_films int; v_pairs int;
begin
  if NEW.score is null then return NEW; end if;

  select mv.month_id, mo.mode into v_month_id, v_mode
  from movies mv join months mo on mo.id = mv.month_id
  where mv.id = NEW.movie_id;
  if v_month_id is null or v_mode <> 'v1' then return NEW; end if;

  select count(*) into v_films from movies where month_id = v_month_id;
  if v_films = 0 then return NEW; end if;

  select count(*) into v_expected from public.expected_members(v_month_id);
  if v_expected = 0 then return NEW; end if;

  select count(*) into v_pairs from (
    select distinct r.user_id, r.movie_id
    from ratings r
    join movies mv on mv.id = r.movie_id and mv.month_id = v_month_id
    where r.score is not null
      and r.user_id in (select * from public.expected_members(v_month_id))
  ) s;

  if v_pairs >= v_expected * v_films then
    update movies set picker_revealed = true
      where month_id = v_month_id and picker_revealed = false;
  end if;

  return NEW;
end;
$function$;

-- 2e. Veto: incoherent against a vote-elected film. Inert for v2 films.
create or replace function public.notify_veto_threshold()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_threshold integer;
  v_count     integer;
  v_picker    uuid;
  v_title     text;
  v_flagged   boolean;
  v_scores    integer;
begin
  if exists (select 1 from movies mv join months mo on mo.id = mv.month_id
             where mv.id = NEW.movie_id and mo.mode = 'v2') then
    return NEW;
  end if;

  select coalesce(veto_threshold, 3) into v_threshold from app_settings where id = true;
  if v_threshold is null then v_threshold := 3; end if;

  select count(*) into v_count from veto_votes where movie_id = NEW.movie_id;
  if v_count < v_threshold then
    return NEW;
  end if;

  select picked_by_user_id, title, veto_resubmit_required
    into v_picker, v_title, v_flagged
    from movies where id = NEW.movie_id;

  if coalesce(v_flagged, false) then
    return NEW;
  end if;

  select count(*) into v_scores from ratings where movie_id = NEW.movie_id and score is not null;
  if v_scores > 0 then
    return NEW;
  end if;

  update movies set veto_resubmit_required = true where id = NEW.movie_id;

  if v_picker is not null then
    insert into notifications (user_id, type, title, body, link, payload)
    values (
      v_picker, 'veto', 'Your pick was vetoed 🚫',
      '"' || coalesce(v_title, 'Your pick') || '" reached the veto threshold (' || v_threshold
        || ' members). Please choose a replacement.',
      '/films?film=' || NEW.movie_id::text,
      jsonb_build_object('movie_id', NEW.movie_id, 'votes', v_count)
    );
  end if;

  return NEW;
end $function$;

-- Same guard on the resubmission RPC. Also fixes a latent 1.0 bug found while
-- redefining: p_genre is text but movies.genre is text[]; the assignment would
-- have failed at runtime for any caller passing a genre.
create or replace function public.resubmit_vetoed_pick(
  p_movie_id uuid, p_tmdb_id integer, p_title text, p_poster_url text default null,
  p_year integer default null, p_director text default null, p_runtime integer default null,
  p_genre text default null, p_plot text default null, p_streaming jsonb default null,
  p_cast text[] default null, p_writers text[] default null,
  p_vote_average numeric default null, p_vote_count integer default null, p_popularity numeric default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_picker  uuid;
  v_flagged boolean;
  v_scores  integer;
begin
  if p_movie_id is null or p_tmdb_id is null or coalesce(btrim(p_title), '') = '' then
    raise exception 'A replacement film (id, tmdb_id, title) is required';
  end if;

  if not exists (select 1 from movies where id = p_movie_id) then
    raise exception 'Film not found';
  end if;

  if exists (select 1 from movies mv join months mo on mo.id = mv.month_id
             where mv.id = p_movie_id and mo.mode = 'v2') then
    raise exception 'Veto resubmission is a 1.0 operation';
  end if;

  select picked_by_user_id, veto_resubmit_required
    into v_picker, v_flagged
    from movies where id = p_movie_id;

  if auth.uid() is distinct from v_picker and not public.is_admin(auth.uid()) then
    raise exception 'Only the picker can resubmit a vetoed pick';
  end if;

  if not coalesce(v_flagged, false) then
    raise exception 'This pick is not awaiting resubmission';
  end if;

  select count(*) into v_scores from ratings where movie_id = p_movie_id and score is not null;
  if v_scores > 0 then
    raise exception 'Film already has scores and cannot be changed';
  end if;

  update movies set
    title               = p_title,
    tmdb_id             = p_tmdb_id,
    poster_url          = p_poster_url,
    year_released       = p_year,
    director            = p_director,
    runtime_minutes     = p_runtime,
    genre               = case when nullif(btrim(p_genre), '') is not null
                               then string_to_array(p_genre, ', ') else null end,
    plot_summary        = p_plot,
    streaming_providers = p_streaming,
    tmdb_cast           = p_cast,
    tmdb_writers        = p_writers,
    tmdb_vote_average   = p_vote_average,
    tmdb_vote_count     = p_vote_count,
    tmdb_popularity     = p_popularity,
    pick_justification  = null,
    veto_resubmit_required = false
  where id = p_movie_id;

  delete from veto_votes where movie_id = p_movie_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. Grant hygiene (found during the inventory; additive-safe)
--    anon held every privilege on movies/movies_safe/guest views; RLS blocked
--    the writes, but nothing should rely on that. anon keeps SELECT on the three
--    guest views only. Column-level grants must be revoked explicitly.
-- ---------------------------------------------------------------------------
revoke all on table public.movies_safe from anon;
revoke all on table public.movies from anon;
revoke all (created_at, director, genre, historical_avg_score, id, month_id, pick_justification,
            picked_by_user_id, picker_revealed, plot_summary, poster_url, runtime_minutes,
            scores_revealed, scoring_deadline, streaming_providers, title, tmdb_cast, tmdb_id,
            tmdb_popularity, tmdb_vote_average, tmdb_vote_count, tmdb_writers,
            veto_resubmit_required, year_released)
  on table public.movies from anon;
revoke insert, update, delete, truncate, references, trigger on table public.guest_films   from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.guest_scores  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.guest_reviews from anon, authenticated;
revoke truncate, trigger on table public.movies from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.movies_safe from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check: no live function or view in public still carries the address.
-- ---------------------------------------------------------------------------
do $$
declare v_offenders text;
begin
  select string_agg(name, ', ') into v_offenders from (
    select p.proname as name from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and pg_get_functiondef(p.oid) ilike '%i.am.ryan.the.miller%'
    union all
    select v.viewname from pg_views v
     where v.schemaname = 'public'
       and pg_get_viewdef(('public.'||v.viewname)::regclass) ilike '%i.am.ryan.the.miller%'
  ) o;
  if v_offenders is not null then
    raise exception 'test-account literal still present in: %', v_offenders;
  end if;
end $$;
