-- Late-score notification: when a member submits or changes a final score on an
-- ACTIVE month's film that has ALREADY revealed (its soft deadline passed), notify
-- every other member — the club average they see just changed. Gating on
-- status='active' + scores_revealed keeps this to genuine live late scores:
-- historical/backfill entries (revealed months) and readjustment re-scores never
-- fire it. Mirrors notify_scores_revealed; email/push delivery is handled by the
-- existing notifications-INSERT triggers (per-user channel/mute/quiet-hours).
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
    where id = NEW.user_id and email <> 'i.am.ryan.the.miller@gmail.com';
  if not found then return NEW; end if;  -- skip the test account as the actor

  insert into notifications (user_id, type, title, body, link, payload)
  select u.id, 'late_score',
         'Late score: ' || mv.title,
         scorer_name || ' scored ' || mv.title || ' after the deadline — the club average updated.',
         '/films?film=' || mv.id,
         jsonb_build_object('movie_id', mv.id, 'scorer_id', NEW.user_id)
  from users u
  where u.is_active
    and u.email <> 'i.am.ryan.the.miller@gmail.com'
    and u.id <> NEW.user_id;

  return NEW;
end
$function$;

drop trigger if exists trg_notify_late_score on public.ratings;
create trigger trg_notify_late_score
  after insert or update of score on public.ratings
  for each row execute function public.notify_late_score();

revoke execute on function public.notify_late_score() from anon, authenticated;
