-- Gate scheduled auto-activation on a complete pick slate.
--
-- Problem this fixes (the "July selection issue"): auto-activation fired at 12am PT
-- on the 1st regardless of how many members had submitted a pick. On July 1 only one
-- of five picks was in, so July activated with a single film and the app rolled every
-- member over to picking the NEXT month. A month should not start until everyone's
-- pick is in.
--
-- Model: a month only AUTO-activates (pg_cron job OR the client-soft "due" trigger)
-- once every expected member has a queued pick for it. Admins still bypass the gate
-- via "Activate now" (manual force-start). The self-perpetuating cadence is unchanged
-- otherwise — months still auto-activate on/after their active_date, just not before
-- the slate is complete.

-- ── Pick-completeness check ───────────────────────────────────────────────────
-- True once every expected picker has an upcoming_pick for the month. Expected
-- pickers = active, non-test members who had joined by this month and are not marked
-- absent for it (mirrors the "expected member" rule used elsewhere: Zack excluded
-- pre-April, test account always excluded).
create or replace function public.month_picks_complete(p_month_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_my text;
  v_expected int;
  v_have int;
begin
  select month_year into v_my from months where id = p_month_id;
  if v_my is null then return false; end if;

  select count(*) into v_expected
  from users u
  where u.is_active
    and u.email <> 'i.am.ryan.the.miller@gmail.com'
    and to_char(u.joined_at, 'YYYY-MM') <= v_my
    and not exists (
      select 1 from month_absences ma where ma.month_id = p_month_id and ma.user_id = u.id
    );

  select count(distinct up.user_id) into v_have
  from upcoming_picks up
  join users u on u.id = up.user_id
  where up.month_target = v_my
    and u.is_active
    and u.email <> 'i.am.ryan.the.miller@gmail.com'
    and to_char(u.joined_at, 'YYYY-MM') <= v_my
    and not exists (
      select 1 from month_absences ma where ma.month_id = p_month_id and ma.user_id = u.id
    );

  return v_expected > 0 and v_have >= v_expected;
end $$;

revoke all on function public.month_picks_complete(uuid) from public, anon;
grant execute on function public.month_picks_complete(uuid) to authenticated;

-- ── activate_month: gate every passive/scheduled activation on complete picks ──
-- Only a deliberate admin force (p_force=true from the "Activate now" button)
-- bypasses the gate. EVERY other path — the pg_cron job, the client-soft "due"
-- page-load trigger (INCLUDING when an admin loads the app), and a non-admin call —
-- must find the month genuinely due AND every expected member's pick submitted, else
-- it no-ops and waits. This closes the hole where an admin merely opening the app
-- force-activated an incomplete slate.
--
-- New (uuid, boolean) signature: drop the old single-arg version so one-arg callers
-- (cron, client-soft) resolve to this gated function via the p_force default.
drop function if exists public.activate_month(uuid);
create or replace function public.activate_month(p_month_id uuid, p_force boolean default false)
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
  v_cast text[]; v_writers text[]; v_genre text[];
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  due := m.auto_activate and active_d <= (now() at time zone 'America/Los_Angeles')::date;

  -- A NULL auth.uid() is a scheduled/cron (no-JWT) context; otherwise resolve the
  -- caller's admin status. Only a deliberate admin force ("Activate now") bypasses
  -- the gates below — an admin merely LOADING the app does not.
  if auth.uid() is not null then
    select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
  else
    is_admin := false;
  end if;

  -- Only an admin may force (a non-admin passing p_force is ignored). A forced
  -- activation skips the due + completeness gates; every other path is gated.
  if not (p_force and is_admin) then
    -- Passive/scheduled activations may only fire for a genuinely-due month...
    if not due then
      if auth.uid() is not null then
        raise exception 'not authorized to activate this month';
      end if;
      return; -- cron passed a not-due month: no-op
    end if;
    -- ...and NOT until every expected member's pick for the month is in. Otherwise
    -- the month waits (no-op) rather than activating a half-empty slate; an admin
    -- can still force it via "Activate now".
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
$$;

-- Re-grant EXECUTE on the new signature (the drop above removed the old grant).
grant execute on function public.activate_month(uuid, boolean) to authenticated;

-- ── cron: only pick up months whose slate is complete (defense in depth) ───────
create or replace function public.cron_auto_activate_due_months() returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in
    select id, month_year from months
    where auto_activate = true
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
end $$;

revoke all on function public.cron_auto_activate_due_months() from public, anon, authenticated;
