-- Month lifecycle redesign.
--   * Always exactly one 'active' month; always one 'upcoming' month for picks.
--   * Picks target the upcoming month (never the active one) — enforced client-side;
--     activation is the only path that materializes upcoming_picks into films.
--   * Admin-toggleable scheduled auto-activation (months.auto_activate + active_date,
--     anchored to 12am US Pacific). Default off (manual activation).

alter table public.months add column if not exists auto_activate boolean not null default false;

-- activate_month: the single orchestration point for activating a month (manual
-- admin trigger OR the soft scheduled auto-activation). Enforces invariants:
--   1. demotes any other active month to 'revealed' (single active),
--   2. activates the target + materializes its picks into films + splits deadlines,
--   3. guarantees a next 'upcoming' month exists for picking.
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
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  -- A month is "due" for auto-activation once an admin has scheduled it
  -- (auto_activate) and its date has arrived in Pacific time.
  due := m.auto_activate and active_d <= (now() at time zone 'America/Los_Angeles')::date;

  -- Authorization: admins always. A non-admin caller (the soft auto-activation
  -- path, which any signed-in client may trigger) may ONLY activate a month an
  -- admin already scheduled (auto_activate) whose date has arrived — so members
  -- can't force-activate arbitrary months.
  if auth.uid() is not null then
    select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
    if not is_admin and not due then
      raise exception 'not authorized to activate this month';
    end if;
  end if;

  -- 1. Single-active invariant: demote any other currently-active month.
  update months set status = 'revealed' where status = 'active' and id <> p_month_id;
  -- 2a. Activate the target.
  update months set status = 'active' where id = p_month_id;

  -- 2b. Materialize this month's upcoming_picks into films (idempotent per picker:
  -- updates the existing row so ratings stay attached; inserts if new).
  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    update movies set title = pk.title, tmdb_id = pk.tmdb_id, poster_url = pk.poster_url,
        pick_justification = nullif(pk.metadata->>'justification','')
      where month_id = p_month_id and picked_by_user_id = pk.user_id;
    if not found then
      insert into movies (month_id, title, tmdb_id, poster_url, picked_by_user_id, pick_justification, created_at)
      values (p_month_id, pk.title, pk.tmdb_id, pk.poster_url, pk.user_id, nullif(pk.metadata->>'justification',''), now());
    end if;
  end loop;

  -- 2c. Split scoring deadlines evenly across the month by film count.
  select count(*) into n from movies where month_id = p_month_id;
  if n > 0 then
    days_in := extract(day from (date_trunc('month', active_d) + interval '1 month' - interval '1 day'))::int;
    step := days_in::numeric / n;
    for pk in select id from movies where month_id = p_month_id order by created_at, id loop
      i := i + 1;
      update movies set scoring_deadline = (active_d + (round(step * i))::int * interval '1 day')::timestamptz where id = pk.id;
    end loop;
  end if;

  -- 3. Ensure a next 'upcoming' month exists for picks (always one upcoming-for-picks).
  next_my := to_char((to_date(m.month_year || '-01','YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');
  if not exists (select 1 from months where month_year = next_my) then
    select s.id into next_season from seasons s
      where (next_my || '-01')::date between s.start_date and s.end_date limit 1;
    if next_season is not null then
      insert into months (season_id, month_year, status, active_date)
      values (next_season, next_my, 'upcoming', (next_my || '-01')::date);
    end if;
  end if;
end;
$$;

grant execute on function public.activate_month(uuid) to authenticated;
