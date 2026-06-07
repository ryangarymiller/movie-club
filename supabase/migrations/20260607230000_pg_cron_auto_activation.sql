-- Phase 4c (auto-activation half only) — server-side scheduled month activation.
--
-- Makes the EXISTING opt-in auto-activation reliable: a month with auto_activate=true
-- activates at the start of its active_date in US Pacific even if nobody loads the
-- app (today it only fires "client-soft" when someone opens This Month). This is the
-- SAFE half of Phase 4c — it's inert until an admin toggles auto_activate on a month
-- (all months currently auto_activate=false). Deadline enforcement / auto-reveal is
-- intentionally NOT enabled here (it would force-reveal the current active month).

create extension if not exists pg_cron;

-- Activate every month that is genuinely due: opted-in, still upcoming, and its
-- active_date has arrived in US Pacific. Runs as definer; activate_month skips its
-- caller-auth check when there's no JWT (cron context), and its own logic enforces
-- the single-active invariant + materialize + next-upcoming + readjustment.
create or replace function public.cron_auto_activate_due_months() returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in
    select id, month_year from months
    where auto_activate = true
      and status = 'upcoming'
      and coalesce(active_date, (month_year || '-01')::date) <= (now() at time zone 'America/Los_Angeles')::date
    order by month_year
  loop
    begin
      perform public.activate_month(m.id);
      raise notice 'cron_auto_activate: activated %', m.month_year;
    exception when others then
      -- never let one failure abort the batch
      raise warning 'cron_auto_activate: activate_month(% / %) failed: %', m.id, m.month_year, sqlerrm;
    end;
  end loop;
end $$;

revoke all on function public.cron_auto_activate_due_months() from public, anon, authenticated;

-- Check hourly (DST-safe — the due-check is evaluated in US Pacific). activate_month
-- only actually fires when a month is genuinely due, so the hourly run is just a cheap
-- guard query the rest of the time. Re-scheduling by the same name upserts the job.
select cron.schedule('auto-activate-due-months', '5 * * * *', $$ select public.cron_auto_activate_due_months(); $$);
