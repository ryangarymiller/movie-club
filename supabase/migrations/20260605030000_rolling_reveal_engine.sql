-- Rolling reveal engine.
-- ---------------------------------------------------------------------------
-- Model (per Ryan): during the ACTIVE month, score visibility is rolling per
-- viewer — you see a film's club average + others' scores only once you've
-- submitted your own (the `ratings` RLS already enforces this). When the month
-- ENDS (the next month is activated) the whole month flips fully public; the
-- PICKER also reveals when the month ends OR every member has scored every film.
--
-- This migration wires the two reveal triggers that were missing:
--   1. activate_month now FULLY REVEALS the month it demotes (scores + picker).
--   2. a new trigger reveals the picker early once a month is fully scored.
--   3. notify_scores_revealed skips the per-film ping for an end-of-month bulk
--      reveal (the month-level 'revealed' notification covers it) so revealing N
--      films at once doesn't blast N emails/pushes per member.

-- ── 1 + (reveal-on-demote) ──────────────────────────────────────────────────
-- Reproduces the current activate_month verbatim and adds the month-end reveal of
-- the demoted month's films. (Kept in sync with the live definition, incl. the
-- season-readjustment auto-open block.)
create or replace function public.activate_month(p_month_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m record; is_admin boolean; due boolean;
  active_d date; n int; i int := 0; days_in int; step numeric; pk record;
  next_my text; next_season uuid;
  cur_season record; prior_season record; v_len int; v_start timestamptz; v_end timestamptz;
  v_demoted uuid;
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

  -- Capture the month being demoted BEFORE we change its status.
  select id into v_demoted from months where status = 'active' and id <> p_month_id limit 1;

  update months set status = 'revealed' where status = 'active' and id <> p_month_id;
  update months set status = 'active' where id = p_month_id;

  -- Month-end reveal: the demoted month becomes fully public for everyone
  -- (including members who never scored it). notify_scores_revealed skips its
  -- per-film ping because the month is now 'revealed'.
  if v_demoted is not null then
    update movies set scores_revealed = true, picker_revealed = true where month_id = v_demoted;
  end if;

  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    update movies set title = pk.title, tmdb_id = pk.tmdb_id, poster_url = pk.poster_url,
        pick_justification = nullif(pk.metadata->>'justification','')
      where month_id = p_month_id and picked_by_user_id = pk.user_id;
    if not found then
      insert into movies (month_id, title, tmdb_id, poster_url, picked_by_user_id, pick_justification, created_at)
      values (p_month_id, pk.title, pk.tmdb_id, pk.poster_url, pk.user_id, nullif(pk.metadata->>'justification',''), now());
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
      insert into months (season_id, month_year, status, active_date)
      values (next_season, next_my, 'upcoming', (next_my || '-01')::date);
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
$$;

-- ── 2. Picker early-reveal: reveal once a month is fully scored ──────────────
-- "Fully scored" = every member active that month has a score for every film in
-- the month (members are expected from the month they joined; test account
-- excluded). When that holds, flip picker_revealed on the month's films.
create or replace function public.reveal_picker_when_month_complete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_month_id uuid; v_month_year text;
  v_expected int; v_films int; v_pairs int;
begin
  if NEW.score is null then return NEW; end if;

  select mv.month_id, mo.month_year into v_month_id, v_month_year
  from movies mv join months mo on mo.id = mv.month_id
  where mv.id = NEW.movie_id;
  if v_month_id is null then return NEW; end if;

  select count(*) into v_films from movies where month_id = v_month_id;
  if v_films = 0 then return NEW; end if;

  select count(*) into v_expected from users u
   where u.is_active
     and u.email <> 'i.am.ryan.the.miller@gmail.com'
     and date_trunc('month', u.joined_at) <= (v_month_year || '-01')::date;
  if v_expected = 0 then return NEW; end if;

  -- distinct (member, film) scored pairs among the expected members
  select count(*) into v_pairs from (
    select distinct r.user_id, r.movie_id
    from ratings r
    join movies mv on mv.id = r.movie_id and mv.month_id = v_month_id
    join users u on u.id = r.user_id
    where r.score is not null
      and u.is_active
      and u.email <> 'i.am.ryan.the.miller@gmail.com'
      and date_trunc('month', u.joined_at) <= (v_month_year || '-01')::date
  ) s;

  if v_pairs >= v_expected * v_films then
    update movies set picker_revealed = true
      where month_id = v_month_id and picker_revealed = false;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_reveal_picker_complete on public.ratings;
create trigger trg_reveal_picker_complete
  after insert or update of score on public.ratings
  for each row execute function public.reveal_picker_when_month_complete();

-- ── 3. Don't spam per-film "scores revealed" pings at month-end ─────────────
create or replace function public.notify_scores_revealed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.scores_revealed = true and OLD.scores_revealed is distinct from true then
    -- Skip the per-film ping for an end-of-month bulk reveal — by then the month
    -- is already 'revealed' and the month-level notification covers it. Only a
    -- genuine mid-month (still-active) per-film reveal pings.
    if exists (select 1 from months mo where mo.id = NEW.month_id and mo.status = 'revealed') then
      return NEW;
    end if;
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'scores_revealed', 'Scores are in 🎬', NEW.title || ' — scores revealed',
           '/films', jsonb_build_object('movie_id', NEW.id)
    from users u where u.is_active and u.email <> 'i.am.ryan.the.miller@gmail.com';
  end if;
  return NEW;
end $$;
