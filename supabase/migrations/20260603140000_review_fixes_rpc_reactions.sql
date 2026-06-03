-- Session 8 review fixes (post adversarial review of the parallel build).

-- 1) materialize_and_split_month: changing a pick after materialization now UPDATES the
--    existing film row for that picker (was insert-if-not-exists, which left a "zombie"
--    film carrying the OLD pick's title/tmdb/poster). Keeps the auth gating + deadline split.
create or replace function public.materialize_and_split_month(p_month_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; pk record; active_d date; n int; i int := 0; days_in int; step numeric; is_admin boolean;
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
  if not is_admin then
    if not exists (select 1 from upcoming_picks up where up.month_target = m.month_year and up.user_id = auth.uid()) then
      raise exception 'not authorized to materialize this month';
    end if;
    if m.status <> 'active' then raise exception 'month is not active'; end if;
  end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    update movies
      set title = pk.title, tmdb_id = pk.tmdb_id, poster_url = pk.poster_url,
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

-- 2) reactions polymorphic target must be NOT NULL (data integrity). Clean stragglers first.
delete from public.reactions where target_id is null and comment_id is null;
update public.reactions set target_type = 'comment', target_id = comment_id where target_id is null and comment_id is not null;
alter table public.reactions alter column target_type set not null;
alter table public.reactions alter column target_id set not null;
