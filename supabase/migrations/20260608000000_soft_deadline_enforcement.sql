-- ── Soft deadline enforcement ────────────────────────────────────────────────
-- When a film's scoring_deadline (+ a configurable grace) has passed, auto-reveal
-- its SCORES. "Soft": non-scorers are simply absent (excluded from the average,
-- never zeroed), late scores are still accepted and recalculate, and there is no
-- submission lock. The PICKER stays hidden (guess-the-picker is a month-end game);
-- only scores_revealed flips here. Scoped to the active month.

-- 1. configurable grace (days after the visible deadline before scores reveal)
alter table public.app_settings
  add column if not exists deadline_grace_days int not null default 1;

-- 2. the enforcement routine (server-scheduled; mirrors cron_auto_activate_due_months)
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
        and exists (select 1 from months mo where mo.id = mv.month_id and mo.status = 'active')
      returning mv.id
  )
  select count(*) into v_count from due;
  if v_count > 0 then
    raise notice 'cron_enforce_due_deadlines: revealed % film(s)', v_count;
  end if;
end
$function$;

revoke execute on function public.cron_enforce_due_deadlines() from anon, authenticated;

-- 3. schedule it hourly (offset from the :05 auto-activate job so a month activates first)
select cron.schedule('enforce-due-deadlines', '20 * * * *', $cron$select public.cron_enforce_due_deadlines();$cron$);

-- ── Self-perpetuating monthly activation ─────────────────────────────────────
-- Make every next month that activate_month auto-creates default to auto_activate
-- = true, so the cadence runs itself on the 1st (12am PT) after the first manual
-- kickoff. Only the next-month INSERT changes (adds auto_activate => true);
-- everything else in activate_month is unchanged.
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
