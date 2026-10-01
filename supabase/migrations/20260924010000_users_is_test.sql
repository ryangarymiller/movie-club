-- Phase 0 (Movie Club 2.0 foundation) — step 2 of 7
-- users.is_test replaces the test-account email literal that was inlined across
-- 9 live functions, 3 guest views, 18 client sites and the ai-recap edge function.
-- This migration: the column, the one data update, and the five pure-filter
-- functions + three views whose only change is the predicate.
-- The remaining live functions that carried the literal (reveal_picker_when_month_complete,
-- month_picks_complete, cron_notify_due_soon) are redefined once, with their other
-- Phase 0 concerns, in 20260924020000 and 20260924030000.
-- Additive only (R1): no object is dropped except the orphaned handle_new_auth_user()
-- (attached to no trigger since the auth flow moved to handle_auth_user_created; it
-- carried a stale approved-email allowlist and is needed by nothing).

alter table public.users
  add column if not exists is_test boolean not null default false;

comment on column public.users.is_test is
  'Hidden test account: excluded from every member list, stat, award, notification fan-out and gate. Replaces the hardcoded email filter.';

-- The last time the address appears in SQL: as data, not as a predicate.
update public.users set is_test = true
 where email = 'i.am.ryan.the.miller@gmail.com';

-- ---------------------------------------------------------------------------
-- Notification fan-outs
-- ---------------------------------------------------------------------------

create or replace function public.notify_month_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare lbl text;
begin
  lbl := to_char(to_date(NEW.month_year || '-01','YYYY-MM-DD'), 'FMMonth YYYY');
  if NEW.status = 'revealed' and OLD.status is distinct from 'revealed' then
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'month_reveal', 'The reveal is live 🎭', lbl || ' — scores + pickers revealed',
           '/this-month', jsonb_build_object('month_id', NEW.id)
    from users u where u.is_active and not u.is_test;
  elsif NEW.status = 'active' and OLD.status is distinct from 'active' then
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'month_active', lbl || ' is live 🍿', 'New films to watch this month',
           '/this-month', jsonb_build_object('month_id', NEW.id)
    from users u where u.is_active and not u.is_test;
  end if;
  return NEW;
end $function$;

create or replace function public.notify_scores_revealed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.scores_revealed = true and OLD.scores_revealed is distinct from true then
    if exists (select 1 from months mo where mo.id = NEW.month_id and mo.status = 'revealed') then
      return NEW;
    end if;
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'scores_revealed', 'Scores are in 🎬', NEW.title || ' — scores revealed',
           '/films?film=' || NEW.id, jsonb_build_object('movie_id', NEW.id)
    from users u where u.is_active and not u.is_test;
  end if;
  return NEW;
end $function$;

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare target uuid; actor text; m record;
begin
  if NEW.parent_comment_id is not null then
    select user_id into target from comments where id = NEW.parent_comment_id;
  elsif NEW.review_id is not null then
    select user_id into target from reviews where id = NEW.review_id;
  end if;
  select name into actor from users where id = NEW.user_id;
  if target is not null and target <> NEW.user_id then
    insert into notifications (user_id, type, title, body, link, payload)
    values (target, 'reply', coalesce(actor,'Someone') || ' replied 💬', left(NEW.body,140),
            '/films?film=' || NEW.movie_id || '&comment=' || NEW.id,
            jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
  end if;
  for m in select id, name from users where is_active and not is_test and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' and m.id is distinct from target then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id || '&comment=' || NEW.id,
              jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $function$;

create or replace function public.notify_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare actor text; m record;
begin
  select name into actor from users where id = NEW.user_id;
  for m in select id, name from users where is_active and not is_test and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id || '&review=' || NEW.id,
              jsonb_build_object('movie_id', NEW.movie_id, 'review_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $function$;

create or replace function public.notify_late_score()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare mv record; scorer_name text;
begin
  if NEW.score is null then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.score is not distinct from OLD.score then return NEW; end if;

  select m.id, m.title, m.scores_revealed, mo.status
    into mv
    from movies m join months mo on mo.id = m.month_id
    where m.id = NEW.movie_id;
  if not found then return NEW; end if;
  if mv.status <> 'active' or mv.scores_revealed is not true then return NEW; end if;

  select name into scorer_name from users
    where id = NEW.user_id and not is_test;
  if not found then return NEW; end if;  -- skip the test account as the actor

  insert into notifications (user_id, type, title, body, link, payload)
  select u.id, 'late_score',
         'Late score: ' || mv.title,
         scorer_name || ' scored ' || mv.title || ' after the deadline — the club average updated.',
         '/films?film=' || mv.id,
         jsonb_build_object('movie_id', mv.id, 'scorer_id', NEW.user_id)
  from users u
  where u.is_active
    and not u.is_test
    and u.id <> NEW.user_id;

  return NEW;
end
$function$;

-- ---------------------------------------------------------------------------
-- Guest views (anon-safe definer views). Same columns, same order, same options;
-- only the predicate changes. security_invoker stated explicitly so the
-- definer behaviour cannot silently flip on replace.
-- ---------------------------------------------------------------------------

create or replace view public.guest_films
with (security_invoker = false) as
 select m.id,
    m.month_id,
    mo.month_year,
    m.title,
    m.poster_url,
    m.year_released,
    m.director,
    m.genre,
    m.runtime_minutes,
    m.plot_summary,
    m.tmdb_vote_average,
    case when m.picker_revealed then abbrev_name(pu.name) else null::text end as picker_label,
    case when m.picker_revealed then m.pick_justification else null::text end as pick_justification,
    coalesce(m.historical_avg_score, ( select round(avg(r.score), 2)
           from ratings r
             join users u on u.id = r.user_id
          where r.movie_id = m.id and r.score is not null and not u.is_test)) as club_avg
   from movies m
     join months mo on mo.id = m.month_id
     left join users pu on pu.id = m.picked_by_user_id
  where m.scores_revealed = true;

create or replace view public.guest_scores
with (security_invoker = false) as
 select r.movie_id,
    abbrev_name(u.name) as member_label,
    r.score
   from ratings r
     join users u on u.id = r.user_id
     join movies m on m.id = r.movie_id
  where m.scores_revealed = true and r.score is not null and not u.is_test;

create or replace view public.guest_reviews
with (security_invoker = false) as
 select rv.id,
    rv.movie_id,
    abbrev_name(u.name) as author_label,
    rv.body,
    rv.created_at
   from reviews rv
     join users u on u.id = rv.user_id
     join movies m on m.id = rv.movie_id
  where m.scores_revealed = true and not u.is_test and rv.body is not null and btrim(rv.body) <> ''::text;

-- ---------------------------------------------------------------------------
-- Dead code carrying a stale email allowlist. Not a lifecycle object; nothing
-- references it (verified: no trigger, no caller).
-- ---------------------------------------------------------------------------
drop function if exists public.handle_new_auth_user();
