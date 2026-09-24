-- Appended to 20260924000000_baseline_v1.sql after `pg_dump --schema=public` (see BASELINE.md §2).
-- Re-creates the three things a public-schema dump cannot carry, from their live definitions
-- as of 2026-09-24. All statements are idempotent.

-- ---------------------------------------------------------------------------
-- 1. Auth signup trigger (lives on auth.users, outside the public schema)
--    The function itself, public.handle_auth_user_created(), IS in the dump
--    (and is redefined by 20260924020000).
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();

-- ---------------------------------------------------------------------------
-- 2. RLS auto-enable event trigger (event triggers are cluster-level and are
--    excluded by --schema; the function is in the dump, the trigger is not)
-- ---------------------------------------------------------------------------
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- ---------------------------------------------------------------------------
-- 3. pg_cron jobs (cron.job rows are data, not schema). Bodies are guarded
--    by months.mode from 20260924030000 onward; the schedules never change (R1).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in
    ('auto-activate-due-months','enforce-due-deadlines','notify-due-soon');
  perform cron.schedule('auto-activate-due-months', '5 * * * *',  'select public.cron_auto_activate_due_months();');
  perform cron.schedule('enforce-due-deadlines',    '20 * * * *', 'select public.cron_enforce_due_deadlines();');
  perform cron.schedule('notify-due-soon',          '35 * * * *', 'select public.cron_notify_due_soon();');
end $$;
