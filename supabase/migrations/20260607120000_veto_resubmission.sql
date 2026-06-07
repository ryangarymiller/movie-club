-- Veto resubmission flow (Phase 7).
-- The veto UI (VetoControl) already lets members vote to veto an active-month pick
-- before any scores are in. This wires the consequence: when a pick reaches the
-- veto threshold (3 of 5) while it still has zero scores, the picker is forced to
-- choose a replacement.
--
-- Pieces:
--   1. movies.veto_resubmit_required — a one-way flag set when the threshold trips.
--   2. movies_safe exposes the flag (non-sensitive; it leaks no picker identity).
--   3. trg_notify_veto_threshold — counts votes after each insert; on first reaching
--      the threshold (film unscored, not already flagged) it flags the film and
--      notifies the picker.
--   4. resubmit_vetoed_pick(...) — SECURITY DEFINER RPC the picker calls to swap the
--      vetoed film for a replacement (the picker has no direct UPDATE on movies).
--      Guarded: caller must be the picker (or admin), the film must be flagged, and
--      it must still have zero scores. Clears the flag + the veto votes on success.

-- ── 1. flag column ───────────────────────────────────────────────────────────
alter table public.movies
  add column if not exists veto_resubmit_required boolean not null default false;

-- ── 2. expose the flag in movies_safe (append at the end; keeps existing order) ─
create or replace view public.movies_safe as
  select
    id, month_id, title, tmdb_id, year_released, genre, director, runtime_minutes,
    poster_url, plot_summary, streaming_providers, scores_revealed, picker_revealed,
    scoring_deadline, historical_avg_score, created_at,
    case
      when picker_revealed = true then picked_by_user_id
      when (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)) then picked_by_user_id
      else null::uuid
    end as picked_by_user_id,
    case
      when picker_revealed = true then pick_justification
      when (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)) then pick_justification
      else null::text
    end as pick_justification,
    tmdb_vote_average, tmdb_vote_count, tmdb_popularity, tmdb_cast, tmdb_writers,
    veto_resubmit_required
  from movies m;

-- ── 3. threshold trigger: flag + notify the picker ─────────────────────────────
create or replace function public.notify_veto_threshold() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_threshold constant integer := 3;  -- 3 of 5 (mirrors VetoControl's default)
  v_count     integer;
  v_picker    uuid;
  v_title     text;
  v_flagged   boolean;
  v_scores    integer;
begin
  select count(*) into v_count from veto_votes where movie_id = NEW.movie_id;
  if v_count < v_threshold then
    return NEW;
  end if;

  select picked_by_user_id, title, veto_resubmit_required
    into v_picker, v_title, v_flagged
    from movies where id = NEW.movie_id;

  -- Already flagged (and notified) for this film — don't re-fire.
  if coalesce(v_flagged, false) then
    return NEW;
  end if;

  -- Can't veto a film people have already scored.
  select count(*) into v_scores from ratings where movie_id = NEW.movie_id and score is not null;
  if v_scores > 0 then
    return NEW;
  end if;

  update movies set veto_resubmit_required = true where id = NEW.movie_id;

  if v_picker is not null then
    insert into notifications (user_id, type, title, body, link, payload)
    values (
      v_picker, 'veto', 'Your pick was vetoed 🚫',
      '"' || coalesce(v_title, 'Your pick') || '" reached the veto threshold (' || v_threshold
        || ' members). Please choose a replacement.',
      '/films?film=' || NEW.movie_id::text,
      jsonb_build_object('movie_id', NEW.movie_id, 'votes', v_count)
    );
  end if;

  return NEW;
end $$;

drop trigger if exists trg_notify_veto_threshold on public.veto_votes;
create trigger trg_notify_veto_threshold
  after insert on public.veto_votes
  for each row execute function public.notify_veto_threshold();

-- ── 4. picker resubmits the vetoed pick (privileged swap) ──────────────────────
create or replace function public.resubmit_vetoed_pick(
  p_movie_id      uuid,
  p_tmdb_id       integer,
  p_title         text,
  p_poster_url    text default null,
  p_year          integer default null,
  p_director      text default null,
  p_runtime       integer default null,
  p_genre         text default null,
  p_plot          text default null,
  p_streaming     jsonb default null,
  p_cast          text[] default null,
  p_writers       text[] default null,
  p_vote_average  numeric default null,
  p_vote_count    integer default null,
  p_popularity    numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_picker  uuid;
  v_flagged boolean;
  v_scores  integer;
begin
  if p_movie_id is null or p_tmdb_id is null or coalesce(btrim(p_title), '') = '' then
    raise exception 'A replacement film (id, tmdb_id, title) is required';
  end if;

  select picked_by_user_id, veto_resubmit_required
    into v_picker, v_flagged
    from movies where id = p_movie_id;

  if v_picker is null and not exists (select 1 from movies where id = p_movie_id) then
    raise exception 'Film not found';
  end if;

  -- Only the picker (or an admin) may resubmit.
  if auth.uid() is distinct from v_picker and not public.is_admin(auth.uid()) then
    raise exception 'Only the picker can resubmit a vetoed pick';
  end if;

  -- Must actually be awaiting resubmission.
  if not coalesce(v_flagged, false) then
    raise exception 'This pick is not awaiting resubmission';
  end if;

  -- Never swap a film once it has scores.
  select count(*) into v_scores from ratings where movie_id = p_movie_id and score is not null;
  if v_scores > 0 then
    raise exception 'Film already has scores and cannot be changed';
  end if;

  update movies set
    title               = p_title,
    tmdb_id             = p_tmdb_id,
    poster_url          = p_poster_url,
    year_released       = p_year,
    director            = p_director,
    runtime_minutes     = p_runtime,
    genre               = p_genre,
    plot_summary        = p_plot,
    streaming_providers = p_streaming,
    tmdb_cast           = p_cast,
    tmdb_writers        = p_writers,
    tmdb_vote_average   = p_vote_average,
    tmdb_vote_count     = p_vote_count,
    tmdb_popularity     = p_popularity,
    pick_justification  = null,
    veto_resubmit_required = false
  where id = p_movie_id;

  -- Reset the veto tally for the (now replaced) pick.
  delete from veto_votes where movie_id = p_movie_id;
end $$;

revoke all on function public.resubmit_vetoed_pick(uuid, integer, text, text, integer, text, integer, text, text, jsonb, text[], text[], numeric, integer, numeric) from public;
grant execute on function public.resubmit_vetoed_pick(uuid, integer, text, text, integer, text, integer, text, text, jsonb, text[], text[], numeric, integer, numeric) to authenticated;
