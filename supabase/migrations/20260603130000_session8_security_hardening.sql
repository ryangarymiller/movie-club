-- Session 8 security hardening (post-review of the parallel build).

-- 1) Enforce op-only role/op changes at the DB layer (was UI-only). A regular admin can
--    update other user fields (is_active, name, color) but NOT role or is_op. Service/
--    privileged contexts (auth.uid() null) are unaffected.
create or replace function public.enforce_op_for_role_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_op boolean;
begin
  if (new.role is distinct from old.role) or (new.is_op is distinct from old.is_op) then
    if auth.uid() is null then return new; end if; -- service/privileged context
    select is_op into caller_is_op from users where id = auth.uid();
    if not coalesce(caller_is_op, false) then
      raise exception 'Only an op can change a member''s role or op status';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_op_role on public.users;
create trigger trg_enforce_op_role before update on public.users
for each row execute function public.enforce_op_for_role_changes();

-- 2) Lock down materialize_and_split_month: admins anytime; a member only for an ACTIVE
--    month in which they actually have a pick.
create or replace function public.materialize_and_split_month(p_month_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; pk record; active_d date; n int; i int := 0; days_in int; step numeric;
  is_admin boolean;
begin
  select * into m from months where id = p_month_id;
  if m is null then return; end if;

  select exists(select 1 from users u where u.id = auth.uid() and u.role = 'admin') into is_admin;
  if not is_admin then
    if not exists (select 1 from upcoming_picks up where up.month_target = m.month_year and up.user_id = auth.uid()) then
      raise exception 'not authorized to materialize this month';
    end if;
    if m.status <> 'active' then
      raise exception 'month is not active';
    end if;
  end if;

  active_d := coalesce(m.active_date, (m.month_year || '-01')::date);
  for pk in select up.* from upcoming_picks up where up.month_target = m.month_year loop
    if not exists (select 1 from movies mv where mv.month_id = p_month_id and mv.picked_by_user_id = pk.user_id) then
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

-- 3) Reddit-style discussion lets members delete their own comments (admin-only before).
drop policy if exists "comments delete admin only" on public.comments;
create policy "comments delete own or admin" on public.comments for delete
using (auth.uid() = user_id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
