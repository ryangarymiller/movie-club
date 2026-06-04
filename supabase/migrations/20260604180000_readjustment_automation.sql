-- Seasonal readjustment automation.
--   * Global default window length (app_settings.readjustment_length_days, default 7).
--   * Per-season auto-open toggle (seasons.readjustment_auto, default on).
--   * activate_month auto-opens the PRIOR season's readjustment window when the
--     first month of a NEW season is activated (whether manual or scheduled),
--     with the window ending `length` days after the prior season's end, anchored
--     to 12am US Pacific.

create table if not exists public.app_settings (
  id boolean primary key default true,
  readjustment_length_days int not null default 7,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "app_settings readable" on public.app_settings;
create policy "app_settings readable" on public.app_settings
  for select using (auth.uid() is not null);
drop policy if exists "app_settings admin write" on public.app_settings;
create policy "app_settings admin write" on public.app_settings
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

alter table public.seasons add column if not exists readjustment_auto boolean not null default true;

-- activate_month v2: same as before + auto-open prior season's readjustment.
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

  update months set status = 'revealed' where status = 'active' and id <> p_month_id;
  update months set status = 'active' where id = p_month_id;

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

  -- Ensure a next 'upcoming' month exists for picks.
  next_my := to_char((to_date(m.month_year || '-01','YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');
  if not exists (select 1 from months where month_year = next_my) then
    select s.id into next_season from seasons s
      where (next_my || '-01')::date between s.start_date and s.end_date limit 1;
    if next_season is not null then
      insert into months (season_id, month_year, status, active_date)
      values (next_season, next_my, 'upcoming', (next_my || '-01')::date);
    end if;
  end if;

  -- Auto-open the PRIOR season's readjustment window when this is the FIRST month
  -- of a new season and the prior season hasn't had a window yet.
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
      -- Start = the season boundary (day after the prior season's end) at 12am Pacific.
      v_start := ((prior_season.end_date + 1)::timestamp at time zone 'America/Los_Angeles');
      v_end := v_start + make_interval(days => v_len);
      update seasons set readjustment_open = true, readjustment_ends_at = v_end where id = prior_season.id;
    end if;
  end if;
end;
$$;

grant execute on function public.activate_month(uuid) to authenticated;
