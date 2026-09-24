-- Phase 0 (Movie Club 2.0 foundation) — steps 3 + 4 of 7
--
-- (1) expected_members(): THE membership kernel. "Who counts as a member for this
--     month" was re-implemented six times (2 SQL, 4 client) with three different
--     date comparisons, two Zack-by-name hacks, and only one of the six consulted
--     month_absences. Everything now asks this one function. The 1.0 lifecycle
--     objects switch to it in 20260924030000; the client follows in code.
--     A per-film overload for 2.0 cycles (cycle_absences) arrives in Phase 1.
--
-- (2) handle_auth_user_created(): the reconcile branch (admin pre-created a row,
--     member signs in with a different auth id) was broken twice — it UPDATEd two
--     tables that do not exist (auteur_votes, season_rankings), and it re-pointed
--     child rows to NEW.id BEFORE a users row with that id existed, which every
--     ON UPDATE NO ACTION foreign key rejects. Fixed by creating the new users row
--     first, moving children over every FK dynamically (so Phase 1 tables are
--     covered without editing this again), then deleting the placeholder.
--     The no-row branch (insert inactive, admin approves) is unchanged.

-- ---------------------------------------------------------------------------
-- 1. Membership kernel
-- ---------------------------------------------------------------------------

create or replace function public.expected_members(p_month_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id
  from public.users u
  join public.months mo on mo.id = p_month_id
  where u.is_active
    and not u.is_test
    -- joined in or before that month (month-granular, matching every existing site)
    and date_trunc('month', u.joined_at)::date <= (mo.month_year || '-01')::date
    and not exists (
      select 1 from public.month_absences ma
      where ma.month_id = p_month_id and ma.user_id = u.id);
$function$;

comment on function public.expected_members(uuid) is
  'The one answer to "who counts as a member for this month": active, not test, joined by that month, not marked absent. Used by every gate, reveal and roster.';

revoke all on function public.expected_members(uuid) from public;
grant execute on function public.expected_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Onboarding trigger fix
-- ---------------------------------------------------------------------------

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  existing_id uuid;
  fk record;
begin
  select id into existing_id
  from public.users
  where email = NEW.email
  limit 1;

  if existing_id is not null and existing_id <> NEW.id then
    -- Free the unique email on the placeholder, then create the real row under
    -- the auth id (auth.users(NEW.id) already exists: this is an AFTER INSERT).
    update public.users set email = email || '#migrating' where id = existing_id;

    insert into public.users (id, name, email, avatar_id, user_color, role, is_op, timezone,
                              joined_at, is_active, show_last_online, admin_mode_enabled,
                              has_completed_onboarding, theme_mode, theme_accent,
                              default_film_sort, is_test)
    select NEW.id, p.name, NEW.email, p.avatar_id, p.user_color, p.role, p.is_op, p.timezone,
           p.joined_at, p.is_active, p.show_last_online, p.admin_mode_enabled,
           p.has_completed_onboarding, p.theme_mode, p.theme_accent,
           p.default_film_sort, p.is_test
    from public.users p where p.id = existing_id
    on conflict (id) do nothing;

    -- Move every child row over every foreign key that points at users(id).
    for fk in
      select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.confrelid = 'public.users'::regclass
        and c.connamespace = 'public'::regnamespace
    loop
      execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
        using NEW.id, existing_id;
    end loop;

    delete from public.users where id = existing_id;

  elsif existing_id is null then
    insert into public.users (id, name, email, role, is_active, joined_at)
    values (
      NEW.id,
      coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email,
      'member',
      false,
      now()
    )
    on conflict (id) do nothing;
  end if;

  return NEW;
end;
$function$;
