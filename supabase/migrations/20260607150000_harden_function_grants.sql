-- Security hardening for the Wave 2–4 functions (advisor follow-up).
--
-- 1. abbrev_name only uses pg_catalog built-ins (split_part/left/position/btrim).
--    Pin its search_path so it can't be hijacked when called inside the guest
--    SECURITY DEFINER views (fixes 0011_function_search_path_mutable).
alter function public.abbrev_name(text) set search_path = pg_catalog;

-- 2. resubmit_vetoed_pick is the picker's privileged swap. Supabase's default
--    privileges hand anon EXECUTE on every new public function; revoke it so an
--    anonymous visitor can't even reach it (it is internally guarded too, but
--    least privilege). Authenticated members keep it (the function re-checks the
--    caller is the picker/admin).
revoke execute on function public.resubmit_vetoed_pick(
  uuid, integer, text, text, integer, text, integer, text, text, jsonb, text[], text[], numeric, integer, numeric
) from anon;

-- 3. notify_veto_threshold is a trigger function — it must never be invoked
--    directly via /rest/v1/rpc. Triggers fire regardless of these grants, so
--    revoking direct EXECUTE is safe.
revoke execute on function public.notify_veto_threshold() from anon, authenticated, public;
