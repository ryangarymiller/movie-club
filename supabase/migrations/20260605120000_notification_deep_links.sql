-- Film notifications (scores revealed, replies, @mentions, score-change decisions)
-- linked to the generic /films grid even though their payload carries movie_id, so
-- the notification "Open" button dumped you on the grid (or did nothing if you were
-- already there) instead of opening the film + its discussion. Deep-link them to
-- /films?film=<movie_id> (Films opens that film's overlay from the param) and
-- backfill the rows already created.

-- scores_revealed — keep the end-of-month bulk-reveal guard; only change the link.
create or replace function public.notify_scores_revealed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.scores_revealed = true and OLD.scores_revealed is distinct from true then
    if exists (select 1 from months mo where mo.id = NEW.month_id and mo.status = 'revealed') then
      return NEW;
    end if;
    insert into notifications (user_id, type, title, body, link, payload)
    select u.id, 'scores_revealed', 'Scores are in 🎬', NEW.title || ' — scores revealed',
           '/films?film=' || NEW.id, jsonb_build_object('movie_id', NEW.id)
    from users u where u.is_active and u.email <> 'i.am.ryan.the.miller@gmail.com';
  end if;
  return NEW;
end $$;

-- reply + @mention on a comment
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
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
            '/films?film=' || NEW.movie_id, jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
  end if;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' and m.id is distinct from target then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id, jsonb_build_object('movie_id', NEW.movie_id, 'comment_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;

-- @mention on a review
create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text; m record;
begin
  select name into actor from users where id = NEW.user_id;
  for m in select id, name from users where is_active and email <> 'i.am.ryan.the.miller@gmail.com' and id <> NEW.user_id loop
    if NEW.body ilike '%@' || regexp_replace(m.name,'\s+','','g') || '%' then
      insert into notifications (user_id, type, title, body, link, payload)
      values (m.id, 'mention', coalesce(actor,'Someone') || ' mentioned you 💬', left(NEW.body,140),
              '/films?film=' || NEW.movie_id, jsonb_build_object('movie_id', NEW.movie_id, 'review_id', NEW.id));
    end if;
  end loop;
  return NEW;
end $$;

-- score-change decision — look up the film via the rating so we can deep-link.
create or replace function public.notify_score_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_movie_id uuid;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','denied') then
    select r.movie_id into v_movie_id from ratings r where r.id = NEW.rating_id;
    insert into notifications (user_id, type, title, body, link, payload)
    values (NEW.user_id, 'score_change',
            case when NEW.status='approved' then 'Score change approved ✅' else 'Score change denied' end,
            'Your score change request was ' || NEW.status,
            case when v_movie_id is not null then '/films?film=' || v_movie_id else '/films' end,
            jsonb_build_object('request_id', NEW.id, 'movie_id', v_movie_id));
  end if;
  return NEW;
end $$;

-- ── Backfill existing rows ────────────────────────────────────────────────────
-- Rows whose payload already carries movie_id.
update notifications
set link = '/films?film=' || (payload->>'movie_id')
where link = '/films'
  and payload ? 'movie_id'
  and coalesce(payload->>'movie_id','') <> '';

-- score_change rows (movie_id only reachable via the rating).
update notifications n
set link = '/films?film=' || r.movie_id,
    payload = n.payload || jsonb_build_object('movie_id', r.movie_id)
from score_change_requests scr
join ratings r on r.id = scr.rating_id
where n.type = 'score_change'
  and n.link = '/films'
  and (n.payload->>'request_id')::uuid = scr.id;
