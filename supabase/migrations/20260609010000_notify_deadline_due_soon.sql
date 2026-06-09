-- Day-before deadline reminder: for each film in the ACTIVE month whose scoring
-- deadline is within the next 24h and which is still unrevealed, notify every
-- active member who hasn't scored it yet ("get your score in"). Deduped per
-- (member, film) via the notifications table, so the hourly cron sends it once.
-- Email/push delivery is handled by the existing notifications-INSERT triggers
-- (per-user channel/mute/quiet-hours).
create or replace function public.cron_notify_due_soon()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into notifications (user_id, type, title, body, link, payload)
  select u.id, 'deadline_soon',
         'Due tomorrow: ' || mv.title,
         mv.title || ' is due tomorrow — submit your score before the deadline.',
         '/films?film=' || mv.id,
         jsonb_build_object('movie_id', mv.id)
  from movies mv
  join months mo on mo.id = mv.month_id
  cross join users u
  where mo.status = 'active'
    and mv.scores_revealed = false
    and mv.scoring_deadline is not null
    and mv.scoring_deadline > now()
    and mv.scoring_deadline <= now() + interval '24 hours'
    and u.is_active
    and u.email <> 'i.am.ryan.the.miller@gmail.com'
    and not exists (
      select 1 from ratings r
      where r.movie_id = mv.id and r.user_id = u.id and r.score is not null)
    and not exists (
      select 1 from notifications n
      where n.user_id = u.id and n.type = 'deadline_soon'
        and n.payload->>'movie_id' = mv.id::text);
end
$function$;

revoke execute on function public.cron_notify_due_soon() from anon, authenticated;

-- hourly, offset from the other jobs (:05 activate, :20 enforce)
select cron.schedule('notify-due-soon', '35 * * * *', $cron$select public.cron_notify_due_soon();$cron$);
