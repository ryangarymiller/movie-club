-- Movie Club 2.0 — Phase 1: the engine.
-- Additive only (R1). Nothing in 1.0 is dropped or altered destructively; every object here is
-- new, or a redefinition that appends (movies_safe gains two trailing columns).
--
-- Model (MOVIE_CLUB_2.0_PLAN.md §2): a v2 month moves
--   upcoming (collecting submissions) ──close──▶ active (elections + watching) ──close──▶ revealed
-- Inside `active`: an election opens → every expected member ballots (top-3, Borda 3/2/1) → the
-- winner is materialized into `movies` → everyone scores it → the last score reveals the film
-- (scores + submitter + ballots together) → the next election may open. Progression is gated on
-- people, never on dates; an admin can mark a member absent for one film to unblock it.

-- =====================================================================================
-- 1. Tables
-- =====================================================================================

create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  month_id      uuid not null references public.months(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  tmdb_id       integer not null,
  title         text not null,
  poster_url    text,
  metadata      jsonb not null default '{}'::jsonb,   -- same shape as upcoming_picks.metadata
  justification text,
  submitted_at  timestamptz not null default now(),
  withdrawn_at  timestamptz
);
comment on table public.submissions is '2.0 candidate pool: 0–2 live films per member per month (rule 2); one submitter per film per month (H3); anonymous until the film reveals (C6/C6b).';
-- one submitter per film per round (H3)
create unique index if not exists submissions_one_per_film_per_month
  on public.submissions (month_id, tmdb_id) where withdrawn_at is null;
create index if not exists submissions_month_user on public.submissions (month_id, user_id);

create table if not exists public.elections (
  id                   uuid primary key default gen_random_uuid(),
  month_id             uuid not null references public.months(id) on delete cascade,
  sequence             integer not null,
  status               text not null default 'open' check (status in ('open','closed')),
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  winner_submission_id uuid references public.submissions(id),
  movie_id             uuid references public.movies(id),
  tie_broken_randomly  boolean not null default false,
  tally                jsonb,                           -- frozen at close: [{submission_id, points, firsts, title}]
  unique (month_id, sequence)
);
comment on table public.elections is '2.0: one Borda election per film watched. tally is frozen at close and hidden until then (Q3).';
create unique index if not exists elections_one_open_per_month
  on public.elections (month_id) where status = 'open';

create table if not exists public.ballots (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references public.elections(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (election_id, user_id)
);
create table if not exists public.ballot_ranks (
  ballot_id     uuid not null references public.ballots(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  rank          smallint not null check (rank between 1 and 3),
  primary key (ballot_id, rank),
  unique (ballot_id, submission_id)
);
comment on table public.ballots is '2.0: one ranked top-3 ballot per member per election; anonymous until the elected film reveals (C7b).';

create table if not exists public.cycle_absences (
  id                 uuid primary key default gen_random_uuid(),
  movie_id           uuid not null references public.movies(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  marked_by_admin_id uuid references public.users(id),
  reason             text,
  created_at         timestamptz not null default now(),
  unique (movie_id, user_id)
);
comment on table public.cycle_absences is '2.0 escape hatch (B5): admin excuses a member from one film so the club can advance.';

alter table public.movies
  add column if not exists election_id   uuid references public.elections(id),
  add column if not exists submission_id uuid references public.submissions(id);

-- New movies columns must be readable by members (column-level grant model).
grant select (election_id, submission_id) on table public.movies to authenticated;

-- =====================================================================================
-- 2. Membership kernel, film-scoped
-- =====================================================================================

create or replace function public.expected_members_for_film(p_movie_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id
  from public.movies mv
  join public.months mo on mo.id = mv.month_id
  join public.users u on u.is_active and not u.is_test
       and date_trunc('month', u.joined_at)::date
           <= coalesce(mo.started_at::date, (mo.month_year || '-01')::date)
  where mv.id = p_movie_id
    and not exists (select 1 from public.month_absences ma where ma.month_id = mo.id and ma.user_id = u.id)
    and not exists (select 1 from public.cycle_absences ca where ca.movie_id = mv.id and ca.user_id = u.id);
$function$;
revoke all on function public.expected_members_for_film(uuid) from public;
grant execute on function public.expected_members_for_film(uuid) to authenticated;

-- =====================================================================================
-- 3. Internal helpers (no EXECUTE for API roles)
-- =====================================================================================

create or replace function public.v2_is_system_or_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select auth.uid() is null or public.is_admin(auth.uid()) $$;
revoke all on function public.v2_is_system_or_admin() from public;

create or replace function public.v2_notify_all(p_month_id uuid, p_type text, p_title text, p_body text, p_link text, p_payload jsonb, p_exclude uuid default null)
returns void language sql security definer set search_path to 'public'
as $$
  insert into notifications (user_id, type, title, body, link, payload)
  select m, p_type, p_title, p_body, p_link, p_payload
  from public.expected_members(p_month_id) m
  where p_exclude is null or m <> p_exclude;
$$;
revoke all on function public.v2_notify_all(uuid,text,text,text,text,jsonb,uuid) from public;

-- Borda tally. Pure; testable. firsts = #1 ranks (informational).
-- Rank weights live in app_settings.vote_points (default {6,4,3} — what the club used for
-- October 2026's hand-run vote; Borda 3/2/1 was the plan's A1 default, changeable by an admin).
alter table public.app_settings add column if not exists vote_points integer[] not null default '{6,4,3}';
comment on column public.app_settings.vote_points is '2.0: points for 1st/2nd/3rd on a ballot. Club practice is 6/4/3.';

create or replace function public.v2_tally(p_election_id uuid)
returns table (submission_id uuid, points integer, firsts integer)
language sql stable security definer set search_path to 'public'
as $$
  with w as (select coalesce((select vote_points from public.app_settings limit 1), '{6,4,3}'::int[]) as pts)
  select s.id,
         coalesce(sum(coalesce((select pts[br.rank] from w), 0)), 0)::int,
         coalesce(sum(case when br.rank = 1 then 1 else 0 end), 0)::int
  from public.elections e
  join public.submissions s on s.month_id = e.month_id and s.withdrawn_at is null
   and not exists (select 1 from public.elections e2 where e2.month_id = e.month_id and e2.winner_submission_id = s.id and e2.id <> e.id)
  left join public.ballots b on b.election_id = e.id
  left join public.ballot_ranks br on br.ballot_id = b.id and br.submission_id = s.id
  where e.id = p_election_id
  group by s.id
  order by 2 desc, 3 desc;
$$;
revoke all on function public.v2_tally(uuid) from public;

-- Candidates of an election = live submissions of the month not yet elected.
create or replace function public.v2_candidates(p_election_id uuid)
returns setof uuid language sql stable security definer set search_path to 'public'
as $$
  select s.id from public.elections e
  join public.submissions s on s.month_id = e.month_id and s.withdrawn_at is null
  where e.id = p_election_id
    and not exists (select 1 from public.elections w where w.month_id = e.month_id and w.winner_submission_id = s.id);
$$;
revoke all on function public.v2_candidates(uuid) from public;
grant execute on function public.v2_candidates(uuid) to authenticated;

-- Materialize a winning submission into movies (same metadata mapping as activate_month).
create or replace function public.v2_materialize_submission(p_submission_id uuid, p_election_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare s record; v_cast text[]; v_writers text[]; v_genre text[]; v_movie uuid;
begin
  select * into s from submissions where id = p_submission_id;
  v_cast := (select array_agg(value) from jsonb_array_elements_text(s.metadata->'tmdb_cast'));
  v_writers := (select array_agg(value) from jsonb_array_elements_text(s.metadata->'tmdb_writers'));
  v_genre := case when nullif(trim(s.metadata->>'genre'), '') is not null
                  then string_to_array(s.metadata->>'genre', ', ') else null end;
  insert into movies (month_id, title, tmdb_id, poster_url, picked_by_user_id, pick_justification,
                      director, year_released, runtime_minutes, genre, plot_summary,
                      streaming_providers, tmdb_cast, tmdb_writers,
                      tmdb_vote_average, tmdb_vote_count, tmdb_popularity,
                      election_id, submission_id, scoring_deadline, created_at)
  values (s.month_id, s.title, s.tmdb_id, s.poster_url, s.user_id, nullif(s.justification,''),
          nullif(s.metadata->>'director',''),
          nullif(s.metadata->>'year','')::int,
          (s.metadata->>'runtime_minutes')::int,
          v_genre,
          nullif(s.metadata->>'plot_summary',''),
          s.metadata->'streaming_providers',
          v_cast, v_writers,
          (s.metadata->>'tmdb_vote_average')::numeric,
          (s.metadata->>'tmdb_vote_count')::int,
          (s.metadata->>'tmdb_popularity')::numeric,
          p_election_id, p_submission_id, null, now())
  returning id into v_movie;
  return v_movie;
end $function$;
revoke all on function public.v2_materialize_submission(uuid,uuid) from public;

-- Reveal a v2 film once every expected member has scored it (B7/C6b/C7b).
create or replace function public.v2_check_film_complete(p_movie_id uuid)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_mode text; v_revealed boolean; v_missing int;
begin
  select mo.mode, mv.scores_revealed into v_mode, v_revealed
  from movies mv join months mo on mo.id = mv.month_id where mv.id = p_movie_id;
  if v_mode is distinct from 'v2' or v_revealed then return false; end if;
  select count(*) into v_missing
  from public.expected_members_for_film(p_movie_id) m
  where not exists (select 1 from ratings r where r.movie_id = p_movie_id and r.user_id = m and r.score is not null);
  if v_missing > 0 then return false; end if;
  update movies set scores_revealed = true, picker_revealed = true where id = p_movie_id;
  return true;
end $function$;
revoke all on function public.v2_check_film_complete(uuid) from public;

-- =====================================================================================
-- 4. Member RPCs
-- =====================================================================================

create or replace function public.v2_submit(p_month_id uuid, p_tmdb_id integer, p_title text,
  p_poster_url text default null, p_metadata jsonb default '{}'::jsonb, p_justification text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m record; v_uid uuid := auth.uid(); v_live int; v_id uuid; v_other uuid;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  select * into m from months where id = p_month_id;
  if m is null or m.mode <> 'v2' then raise exception 'not a 2.0 month'; end if;
  if m.status <> 'upcoming' then raise exception 'submissions are closed for this month'; end if;
  if m.submissions_close_at is not null and m.submissions_close_at <= now() then
    raise exception 'the submission deadline has passed';
  end if;
  if v_uid not in (select * from public.expected_members(p_month_id)) then
    raise exception 'you are not an expected member for this month';
  end if;
  if coalesce(btrim(p_title), '') = '' or p_tmdb_id is null then raise exception 'a film is required'; end if;

  -- H3: one submitter per film per round
  select user_id into v_other from submissions
   where month_id = p_month_id and tmdb_id = p_tmdb_id and withdrawn_at is null;
  if v_other is not null and v_other <> v_uid then raise exception 'already on the list'; end if;
  if v_other = v_uid then
    update submissions set title = p_title, poster_url = p_poster_url, metadata = coalesce(p_metadata, metadata),
           justification = p_justification
     where month_id = p_month_id and tmdb_id = p_tmdb_id and user_id = v_uid and withdrawn_at is null
     returning id into v_id;
    return v_id;
  end if;

  select count(*) into v_live from submissions where month_id = p_month_id and user_id = v_uid and withdrawn_at is null;
  if v_live >= 2 then raise exception 'you already have 2 films on the list (rule 2)'; end if;

  insert into submissions (month_id, user_id, tmdb_id, title, poster_url, metadata, justification)
  values (p_month_id, v_uid, p_tmdb_id, p_title, p_poster_url, coalesce(p_metadata,'{}'::jsonb), p_justification)
  returning id into v_id;
  return v_id;
end $function$;
grant execute on function public.v2_submit(uuid,integer,text,text,jsonb,text) to authenticated;

create or replace function public.v2_withdraw(p_submission_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare s record; m record;
begin
  select * into s from submissions where id = p_submission_id;
  if s is null then raise exception 'not found'; end if;
  if s.user_id is distinct from auth.uid() and not public.is_admin(auth.uid()) then raise exception 'not yours'; end if;
  select * into m from months where id = s.month_id;
  if m.status <> 'upcoming' then raise exception 'the list is locked'; end if;
  update submissions set withdrawn_at = now() where id = p_submission_id and withdrawn_at is null;
end $function$;
grant execute on function public.v2_withdraw(uuid) to authenticated;

create or replace function public.v2_cast_ballot(p_election_id uuid, p_submission_ids uuid[])
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare e record; v_uid uuid := auth.uid(); v_n int; v_ballot uuid; i int; v_expected int; v_cast int;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  select * into e from elections where id = p_election_id;
  if e is null or e.status <> 'open' then raise exception 'voting is not open'; end if;
  if v_uid not in (select * from public.expected_members(e.month_id)) then raise exception 'you are not an expected voter'; end if;
  v_n := coalesce(array_length(p_submission_ids, 1), 0);
  if v_n < 1 or v_n > 3 then raise exception 'rank between 1 and 3 films'; end if;
  if (select count(distinct x) from unnest(p_submission_ids) x) <> v_n then raise exception 'duplicate film on ballot'; end if;
  if exists (select 1 from unnest(p_submission_ids) x where x not in (select * from public.v2_candidates(p_election_id))) then
    raise exception 'ballot contains a film that is not a candidate';
  end if;

  insert into ballots (election_id, user_id) values (p_election_id, v_uid)
  on conflict (election_id, user_id) do update set submitted_at = now()
  returning id into v_ballot;
  delete from ballot_ranks where ballot_id = v_ballot;
  for i in 1..v_n loop
    insert into ballot_ranks (ballot_id, submission_id, rank) values (v_ballot, p_submission_ids[i], i);
  end loop;

  -- A2: voting closes itself the moment the last expected member has balloted.
  select count(*) into v_expected from public.expected_members(e.month_id);
  select count(*) into v_cast from ballots b where b.election_id = p_election_id
    and b.user_id in (select * from public.expected_members(e.month_id));
  if v_cast >= v_expected then perform public.v2_finalize_election(p_election_id); end if;
end $function$;
grant execute on function public.v2_cast_ballot(uuid,uuid[]) to authenticated;

-- =====================================================================================
-- 5. Admin / system RPCs
-- =====================================================================================

create or replace function public.v2_open_election(p_month_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m record; v_seq int; v_id uuid; v_cands int; v_only uuid;
begin
  if not public.v2_is_system_or_admin() then raise exception 'admin only'; end if;
  select * into m from months where id = p_month_id;
  if m is null or m.mode <> 'v2' or m.status <> 'active' then raise exception 'month is not in play'; end if;
  if exists (select 1 from elections where month_id = p_month_id and status = 'open') then raise exception 'an election is already open'; end if;
  -- Rule 1: nothing opens while a film of this month is still being watched.
  if exists (select 1 from movies where month_id = p_month_id and scores_revealed = false) then
    raise exception 'the current film is not finished yet';
  end if;
  select coalesce(max(sequence),0)+1 into v_seq from elections where month_id = p_month_id;
  insert into elections (month_id, sequence) values (p_month_id, v_seq) returning id into v_id;
  select count(*) into v_cands from public.v2_candidates(v_id);
  if v_cands = 0 then
    delete from elections where id = v_id;
    raise exception 'no candidates left on the list';
  end if;
  if v_cands = 1 then
    -- Q2: a single candidate is elected without a vote.
    perform public.v2_finalize_election(v_id);
    return v_id;
  end if;
  perform public.v2_notify_all(p_month_id, 'vote_open', 'Vote is open 🗳️',
    'Rank your top 3 for film ' || v_seq || ' of ' || to_char(to_date(m.month_year||'-01','YYYY-MM-DD'),'FMMonth') || '.',
    '/this-month', jsonb_build_object('election_id', v_id, 'month_id', p_month_id));
  return v_id;
end $function$;
grant execute on function public.v2_open_election(uuid) to authenticated;

-- Internal: tally + materialize. Called by the system paths (last ballot cast, single candidate)
-- and by the admin wrapper below. No API role may call it directly.
create or replace function public.v2_finalize_election(p_election_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare e record; v_top int; v_winner uuid; v_tie boolean := false; v_movie uuid; v_tally jsonb; v_title text; v_cnt int;
begin
  select * into e from elections where id = p_election_id for update;
  if not found then raise exception 'election not found'; end if;
  if e.status = 'closed' then return e.movie_id; end if;

  select max(points) into v_top from public.v2_tally(p_election_id);
  select count(*) into v_cnt from public.v2_tally(p_election_id) t where t.points = v_top;
  if v_cnt > 1 then
    v_tie := true;                                           -- rule 9: random
    select t.submission_id into v_winner from public.v2_tally(p_election_id) t
     where t.points = v_top order by random() limit 1;
  else
    select t.submission_id into v_winner from public.v2_tally(p_election_id) t where t.points = v_top limit 1;
  end if;

  select jsonb_agg(jsonb_build_object('submission_id', t.submission_id, 'points', t.points, 'firsts', t.firsts, 'title', s.title)
                   order by t.points desc, t.firsts desc)
    into v_tally
  from public.v2_tally(p_election_id) t join submissions s on s.id = t.submission_id;

  v_movie := public.v2_materialize_submission(v_winner, p_election_id);
  update elections set status = 'closed', closed_at = now(), winner_submission_id = v_winner,
         movie_id = v_movie, tie_broken_randomly = v_tie, tally = v_tally
   where id = p_election_id;

  select title into v_title from submissions where id = v_winner;
  perform public.v2_notify_all(e.month_id, 'film_elected', 'Next up: ' || v_title || ' 🍿',
    'The club picked ' || v_title || case when v_tie then ' (tie broken at random)' else '' end || '. Watch it and score it.',
    '/films?film=' || v_movie, jsonb_build_object('movie_id', v_movie, 'election_id', p_election_id));
  return v_movie;
end $function$;

-- Admin: close the open vote early (non-voters simply don't count). p_force is accepted for
-- signature compatibility but never bypasses the admin check.
create or replace function public.v2_close_election(p_election_id uuid, p_force boolean default false)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.v2_is_system_or_admin() then raise exception 'admin only'; end if;
  return public.v2_finalize_election(p_election_id);
end $function$;
grant execute on function public.v2_close_election(uuid,boolean) to authenticated;

create or replace function public.v2_close_submissions(p_month_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m record; v_live int;
begin
  if not public.v2_is_system_or_admin() then raise exception 'admin only'; end if;
  select * into m from months where id = p_month_id for update;
  if m is null or m.mode <> 'v2' then raise exception 'not a 2.0 month'; end if;
  if m.status <> 'upcoming' then raise exception 'submissions already closed'; end if;
  select count(*) into v_live from submissions where month_id = p_month_id and withdrawn_at is null;
  if v_live = 0 then raise exception 'no submissions yet'; end if;
  -- A v2 month going active must not coexist with a v1 active month.
  if exists (select 1 from months where status = 'active' and mode = 'v1') then
    raise exception 'a 1.0 month is still active; close it first';
  end if;
  update months set status = 'active', started_at = coalesce(started_at, now()) where id = p_month_id;
  return public.v2_open_election(p_month_id);
end $function$;
grant execute on function public.v2_close_submissions(uuid) to authenticated;

create or replace function public.v2_mark_absent(p_movie_id uuid, p_user_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.v2_is_system_or_admin() then raise exception 'admin only'; end if;
  insert into cycle_absences (movie_id, user_id, marked_by_admin_id, reason)
  values (p_movie_id, p_user_id, auth.uid(), p_reason)
  on conflict (movie_id, user_id) do nothing;
  return public.v2_check_film_complete(p_movie_id);
end $function$;
grant execute on function public.v2_mark_absent(uuid,uuid,text) to authenticated;

-- Creates (if needed) the quarterly season covering a date. Fixes the gap that silently
-- dropped September 2026: activate_month skipped next-month creation when no season existed.
create or replace function public.ensure_season_for(p_date date)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; q int; y int; s date; e date; nm text;
begin
  select id into v_id from seasons where p_date between start_date and end_date limit 1;
  if v_id is not null then return v_id; end if;
  y := extract(year from p_date)::int;
  case extract(month from p_date)::int
    when 12,1,2 then nm := 'Winter';
      if extract(month from p_date)::int = 12 then s := make_date(y,12,1); e := make_date(y+1,2,1) + interval '1 month' - interval '1 day';
      else s := make_date(y-1,12,1); e := make_date(y,2,1) + interval '1 month' - interval '1 day'; end if;
      nm := nm || ' ' || extract(year from e)::int;
    when 3,4,5   then nm := 'Spring ' || y; s := make_date(y,3,1);  e := make_date(y,5,31);
    when 6,7,8   then nm := 'Summer ' || y; s := make_date(y,6,1);  e := make_date(y,8,31);
    else              nm := 'Autumn ' || y; s := make_date(y,9,1);  e := make_date(y,11,30);
  end case;
  insert into seasons (name, start_date, end_date) values (nm, s, e) returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.ensure_season_for(date) from public;

create or replace function public.v2_close_month(p_month_id uuid, p_force boolean default false)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m record; next_my text; v_next uuid; v_season uuid; cur_season record; prior_season record; v_len int; v_end timestamptz;
begin
  if not public.v2_is_system_or_admin() then raise exception 'admin only'; end if;
  select * into m from months where id = p_month_id for update;
  if m is null or m.mode <> 'v2' or m.status <> 'active' then raise exception 'month is not in play'; end if;
  if not p_force then
    if exists (select 1 from elections where month_id = p_month_id and status = 'open') then raise exception 'an election is open'; end if;
    if exists (select 1 from movies where month_id = p_month_id and scores_revealed = false) then raise exception 'a film is still being watched'; end if;
  end if;
  -- D9: leftovers are discarded (members may resubmit them next month, rule 3)
  update submissions set withdrawn_at = now() where month_id = p_month_id and withdrawn_at is null
    and id not in (select winner_submission_id from elections where month_id = p_month_id and winner_submission_id is not null);
  update movies set scores_revealed = true, picker_revealed = true where month_id = p_month_id;
  update months set status = 'revealed' where id = p_month_id;

  -- next v2 month (people-gated: no dates, no auto_activate)
  next_my := to_char(to_date(m.month_year||'-01','YYYY-MM-DD') + interval '1 month', 'YYYY-MM');
  select id into v_next from months where month_year = next_my;
  if v_next is null then
    v_season := public.ensure_season_for((next_my||'-01')::date);
    insert into months (season_id, month_year, status, auto_activate, mode)
    values (v_season, next_my, 'upcoming', false, 'v2') returning id into v_next;
  end if;
  perform public.v2_notify_all(v_next, 'submissions_open', 'Submissions are open 🎬',
    'Add up to 2 films to the list for ' || to_char(to_date(next_my||'-01','YYYY-MM-DD'),'FMMonth YYYY') || '.',
    '/this-month', jsonb_build_object('month_id', v_next));

  -- readjustment auto-open on a season boundary (same rule as activate_month)
  select * into cur_season from seasons where id = m.season_id;
  if cur_season is not null and to_date(m.month_year||'-01','YYYY-MM-DD') = date_trunc('month', cur_season.start_date)::date then
    select * into prior_season from seasons where end_date < cur_season.start_date order by end_date desc limit 1;
    if prior_season is not null and coalesce(prior_season.readjustment_auto, true)
       and not prior_season.readjustment_open and prior_season.readjustment_ends_at is null then
      select readjustment_length_days into v_len from app_settings limit 1;
      v_end := ((prior_season.end_date + 1)::timestamp at time zone 'America/Los_Angeles') + make_interval(days => coalesce(v_len,7));
      update seasons set readjustment_open = true, readjustment_ends_at = v_end where id = prior_season.id;
    end if;
  end if;
  return v_next;
end $function$;
grant execute on function public.v2_close_month(uuid,boolean) to authenticated;

-- Q1: the submission window hard-closes at submissions_close_at (cron).
create or replace function public.v2_cron_close_due_submissions()
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare m record;
begin
  for m in select id, month_year from months
            where mode = 'v2' and status = 'upcoming'
              and submissions_close_at is not null and submissions_close_at <= now()
              and exists (select 1 from submissions s where s.month_id = months.id and s.withdrawn_at is null)
  loop
    begin
      perform public.v2_close_submissions(m.id);
    exception when others then
      raise warning 'v2_cron_close_due_submissions(%): %', m.month_year, sqlerrm;
    end;
  end loop;
end $function$;
revoke all on function public.v2_cron_close_due_submissions() from public;
select cron.schedule('v2-close-due-submissions', '50 * * * *', 'select public.v2_cron_close_due_submissions();')
 where not exists (select 1 from cron.job where jobname = 'v2-close-due-submissions');

-- =====================================================================================
-- 6. Triggers
-- =====================================================================================

create or replace function public.v2_on_score()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if NEW.score is null then return NEW; end if;
  perform public.v2_check_film_complete(NEW.movie_id);
  return NEW;
end $function$;
revoke all on function public.v2_on_score() from public;
drop trigger if exists trg_v2_on_score on public.ratings;
create trigger trg_v2_on_score after insert or update of score on public.ratings
  for each row execute function public.v2_on_score();

-- rule 2 at the DB layer too
create or replace function public.v2_enforce_submission_cap()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if NEW.withdrawn_at is null and (select count(*) from submissions
      where month_id = NEW.month_id and user_id = NEW.user_id and withdrawn_at is null and id <> NEW.id) >= 2 then
    raise exception 'no more than 2 live submissions per member per month';
  end if;
  return NEW;
end $function$;
revoke all on function public.v2_enforce_submission_cap() from public;
drop trigger if exists trg_v2_submission_cap on public.submissions;
create trigger trg_v2_submission_cap before insert or update on public.submissions
  for each row execute function public.v2_enforce_submission_cap();

-- live repaint for round transitions (RevealBus already listens on 'reveals')
drop trigger if exists trg_broadcast_election on public.elections;
create trigger trg_broadcast_election after insert or update of status on public.elections
  for each row execute function public.broadcast_reveal();

-- =====================================================================================
-- 7. Anonymity: RLS + safe views
-- =====================================================================================

alter table public.submissions    enable row level security;
alter table public.elections      enable row level security;
alter table public.ballots        enable row level security;
alter table public.ballot_ranks   enable row level security;
alter table public.cycle_absences enable row level security;

drop policy if exists "submissions own or admin" on public.submissions;
create policy "submissions own or admin" on public.submissions for select
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "elections readable" on public.elections;
create policy "elections readable" on public.elections for select using (auth.uid() is not null);
drop policy if exists "ballots own or admin" on public.ballots;
create policy "ballots own or admin" on public.ballots for select
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "ballot_ranks own or admin" on public.ballot_ranks;
create policy "ballot_ranks own or admin" on public.ballot_ranks for select
  using (exists (select 1 from ballots b where b.id = ballot_id and (b.user_id = auth.uid() or public.is_admin(auth.uid()))));
drop policy if exists "absences readable" on public.cycle_absences;
create policy "absences readable" on public.cycle_absences for select using (auth.uid() is not null);
drop policy if exists "absences admin write" on public.cycle_absences;
create policy "absences admin write" on public.cycle_absences for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- All writes go through the definer RPCs: no direct INSERT/UPDATE/DELETE for API roles.
revoke all on table public.submissions, public.elections, public.ballots, public.ballot_ranks from anon, authenticated;
grant select on table public.submissions, public.elections, public.ballots, public.ballot_ranks, public.cycle_absences to authenticated;
grant insert, update, delete on table public.cycle_absences to authenticated;  -- RLS admin-only

-- The list everyone votes on: film identity always; submitter only after reveal / month close (C6b, N5).
create or replace view public.submissions_safe
with (security_invoker = false) as
select s.id, s.month_id, s.tmdb_id, s.title, s.poster_url, s.submitted_at, s.withdrawn_at,
       (s.metadata - 'justification') as metadata,
       exists (select 1 from elections e where e.winner_submission_id = s.id) as elected,
       case when s.user_id = auth.uid() or public.is_admin(auth.uid())
              or exists (select 1 from movies mv where mv.submission_id = s.id and mv.picker_revealed)
              or exists (select 1 from months mo where mo.id = s.month_id and mo.status = 'revealed')
            then s.user_id end as user_id,
       case when s.user_id = auth.uid() or public.is_admin(auth.uid())
              or exists (select 1 from movies mv where mv.submission_id = s.id and mv.picker_revealed)
            then s.justification end as justification
from submissions s;
grant select on public.submissions_safe to authenticated;

-- Ballots: who ranked what, visible only after the elected film reveals (C7b).
create or replace view public.ballots_safe
with (security_invoker = false) as
select b.id, b.election_id, b.submitted_at, br.submission_id, br.rank,
       case when b.user_id = auth.uid() or public.is_admin(auth.uid())
              or exists (select 1 from elections e join movies mv on mv.id = e.movie_id
                          where e.id = b.election_id and mv.picker_revealed)
            then b.user_id end as user_id
from ballots b join ballot_ranks br on br.ballot_id = b.id;
grant select on public.ballots_safe to authenticated;

-- Elections: tally hidden until closed (Q3) — it is only written at close, so plain read is safe.
create or replace view public.elections_safe
with (security_invoker = false) as
select e.id, e.month_id, e.sequence, e.status, e.opened_at, e.closed_at, e.movie_id, e.tie_broken_randomly,
       case when e.status = 'closed' then e.winner_submission_id end as winner_submission_id,
       case when e.status = 'closed' then e.tally end as tally,
       (select count(*) from ballots b where b.election_id = e.id)::int as ballots_cast,
       (select count(*) from public.expected_members(e.month_id))::int as ballots_expected,
       exists (select 1 from ballots b where b.election_id = e.id and b.user_id = auth.uid()) as i_voted
from elections e;
grant select on public.elections_safe to authenticated;

-- movies_safe: append the two new columns (trailing — CREATE OR REPLACE VIEW allows it).
create or replace view public.movies_safe as
 select id, month_id, title, tmdb_id, year_released, genre, director, runtime_minutes, poster_url,
    plot_summary, streaming_providers, scores_revealed, picker_revealed, scoring_deadline,
    historical_avg_score, created_at,
    case when picker_revealed = true then picked_by_user_id
         when (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)) then picked_by_user_id
         else null::uuid end as picked_by_user_id,
    case when picker_revealed = true then pick_justification
         when (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)) then pick_justification
         else null::text end as pick_justification,
    tmdb_vote_average, tmdb_vote_count, tmdb_popularity, tmdb_cast, tmdb_writers, veto_resubmit_required,
    election_id, submission_id
   from movies m;

-- =====================================================================================
-- 8. Progress RPCs — "waiting on…" (A2: social pressure is the gate's enforcement)
--    Expose WHO has acted, never WHAT they voted or scored, so anonymity holds.
-- =====================================================================================

create or replace function public.v2_vote_progress(p_election_id uuid)
returns table (user_id uuid, name text, has_voted boolean)
language sql stable security definer set search_path to 'public'
as $$
  select u.id, u.name,
         exists (select 1 from public.ballots b where b.election_id = p_election_id and b.user_id = u.id)
  from public.elections e
  join public.users u on u.id in (select * from public.expected_members(e.month_id))
  where e.id = p_election_id
  order by u.name;
$$;
revoke all on function public.v2_vote_progress(uuid) from public;
grant execute on function public.v2_vote_progress(uuid) to authenticated;

create or replace function public.v2_film_progress(p_movie_id uuid)
returns table (user_id uuid, name text, has_scored boolean, absent boolean)
language sql stable security definer set search_path to 'public'
as $$
  select u.id, u.name,
         exists (select 1 from public.ratings r where r.movie_id = p_movie_id and r.user_id = u.id and r.score is not null),
         exists (select 1 from public.cycle_absences ca where ca.movie_id = p_movie_id and ca.user_id = u.id)
  from public.movies mv
  join public.months mo on mo.id = mv.month_id
  join public.users u on u.is_active and not u.is_test
       and date_trunc('month', u.joined_at)::date <= coalesce(mo.started_at::date, (mo.month_year || '-01')::date)
  where mv.id = p_movie_id
    and not exists (select 1 from public.month_absences ma where ma.month_id = mo.id and ma.user_id = u.id)
  order by u.name;
$$;
revoke all on function public.v2_film_progress(uuid) from public;
grant execute on function public.v2_film_progress(uuid) to authenticated;

-- Members read club_mode to pick a flow; only admins may flip it (existing app_settings RLS).

-- =====================================================================================
-- 9. Grant hygiene. Supabase grants EXECUTE on new public functions to anon and
--    authenticated by default, so `revoke ... from public` alone protects nothing.
--    Internal helpers: callable only by other definer functions (and the owner).
--    Member/admin RPCs: authenticated only (each re-checks its own authorization).
-- =====================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.v2_is_system_or_admin()',
    'public.v2_notify_all(uuid,text,text,text,text,jsonb,uuid)',
    'public.v2_tally(uuid)',
    'public.v2_materialize_submission(uuid,uuid)',
    'public.v2_check_film_complete(uuid)',
    'public.v2_finalize_election(uuid)',
    'public.ensure_season_for(date)',
    'public.v2_cron_close_due_submissions()',
    'public.v2_on_score()',
    'public.v2_enforce_submission_cap()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.expected_members_for_film(uuid)',
    'public.v2_candidates(uuid)',
    'public.v2_submit(uuid,integer,text,text,jsonb,text)',
    'public.v2_withdraw(uuid)',
    'public.v2_cast_ballot(uuid,uuid[])',
    'public.v2_open_election(uuid)',
    'public.v2_close_election(uuid,boolean)',
    'public.v2_close_submissions(uuid)',
    'public.v2_mark_absent(uuid,uuid,text)',
    'public.v2_close_month(uuid,boolean)',
    'public.v2_vote_progress(uuid)',
    'public.v2_film_progress(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on public.submissions_safe, public.ballots_safe, public.elections_safe from anon;
revoke insert, update, delete, truncate, references, trigger on public.submissions_safe, public.ballots_safe, public.elections_safe from authenticated;
revoke all on table public.submissions, public.elections, public.ballots, public.ballot_ranks, public.cycle_absences from anon;

-- Self-check: fail the migration if any internal helper is executable by an API role.
do $$
declare v_bad text;
begin
  select string_agg(p.oid::regprocedure::text || ' -> ' || r.rolname, ', ') into v_bad
  from pg_proc p cross join pg_roles r
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('v2_is_system_or_admin','v2_notify_all','v2_tally','v2_materialize_submission',
                      'v2_check_film_complete','v2_finalize_election','ensure_season_for',
                      'v2_cron_close_due_submissions','v2_on_score','v2_enforce_submission_cap')
    and r.rolname in ('anon','authenticated')
    and has_function_privilege(r.oid, p.oid, 'EXECUTE');
  if v_bad is not null then raise exception 'internal v2 helpers are API-callable: %', v_bad; end if;
end $$;
