-- Live reveal propagation. movies can't go in the supabase_realtime publication
-- (postgres_changes payloads ignore column-level grants and would leak
-- picked_by_user_id pre-reveal), so reveal-ish transitions broadcast a MINIMAL
-- payload (table + id only) on the public 'reveals' topic. Clients listening on
-- that topic simply refetch through the normal RLS/movies_safe path.
create or replace function public.broadcast_reveal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform realtime.send(
    jsonb_build_object('table', TG_TABLE_NAME, 'id', NEW.id),
    'reveal',
    'reveals',
    false  -- public topic; payload contains nothing sensitive
  );
  return NEW;
exception when others then
  -- Never let a broadcast failure block the underlying write (e.g. a cron reveal).
  return NEW;
end
$function$;

revoke execute on function public.broadcast_reveal() from anon, authenticated;

drop trigger if exists trg_broadcast_movie_reveal on public.movies;
create trigger trg_broadcast_movie_reveal
  after update of scores_revealed, picker_revealed, veto_resubmit_required on public.movies
  for each row
  when (OLD.scores_revealed is distinct from NEW.scores_revealed
     or OLD.picker_revealed is distinct from NEW.picker_revealed
     or OLD.veto_resubmit_required is distinct from NEW.veto_resubmit_required)
  execute function public.broadcast_reveal();

drop trigger if exists trg_broadcast_month_status on public.months;
create trigger trg_broadcast_month_status
  after update of status on public.months
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public.broadcast_reveal();
