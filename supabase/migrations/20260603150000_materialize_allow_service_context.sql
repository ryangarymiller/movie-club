-- Allow service / privileged contexts (auth.uid() IS NULL) to materialize a month
-- without the member/admin auth checks. The whole auth gate is now wrapped in an
-- `if auth.uid() is not null` block: interactive callers are still gated (admins
-- anytime; a member only for an ACTIVE month in which they hold a pick), but a
-- server-side / privileged context (Edge Function, admin tooling, scheduled job)
-- can drive materialization directly. Everything else (re-pick UPDATE-in-place,
-- deadline auto-split) is unchanged from 20260603140000.
create or replace function public.materialize_and_split_month(p_month_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; pk record; active_d date; n int; i int := 0; days_in int; step numeric; is_admin boolean;
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  if auth.uid() is not null then
    select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
    if not is_admin then
      if not exists (select 1 from upcoming_picks up where up.month_target = m.month_year and up.user_id = auth.uid()) then
        raise exception 'not authorized to materialize this month';
      end if;
      if m.status <> 'active' then raise exception 'month is not active'; end if;
    end if;
  end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
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
end;
$$;
