-- Materialize a month's upcoming_picks into movies and split the month's scoring deadlines
-- evenly by film count. SECURITY DEFINER so a member's own pick can become a film (movies
-- INSERT/UPDATE is otherwise admin-only). Non-destructive: only inserts missing films and
-- (re)sets deadlines.
create or replace function public.materialize_and_split_month(p_month_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m         record;
  pk        record;
  active_d  date;
  n         int;
  i         int := 0;
  days_in   int;
  step      numeric;
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;
  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);

  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    if not exists (
      select 1 from movies mv where mv.month_id = p_month_id and mv.picked_by_user_id = pk.user_id
    ) then
      insert into movies (month_id, title, tmdb_id, poster_url, picked_by_user_id, pick_justification, created_at)
      values (
        p_month_id, pk.title, pk.tmdb_id, pk.poster_url, pk.user_id,
        nullif(pk.metadata->>'justification',''), now()
      );
    end if;
  end loop;

  select count(*) into n from movies where month_id = p_month_id;
  if n > 0 then
    days_in := extract(day from (date_trunc('month', active_d) + interval '1 month' - interval '1 day'))::int;
    step := days_in::numeric / n;
    for pk in select id from movies where month_id = p_month_id order by created_at, id loop
      i := i + 1;
      update movies
        set scoring_deadline = (active_d + (round(step * i))::int * interval '1 day')::timestamptz
        where id = pk.id;
    end loop;
  end if;
end;
$$;

grant execute on function public.materialize_and_split_month(uuid) to authenticated;
