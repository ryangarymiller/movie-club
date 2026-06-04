-- Admin "add member" was blocked: users.id has no default and the only INSERT
-- policy is self-signup (with check auth.uid() = id), so an admin inserting a row
-- for someone else (id omitted → NULL) failed the RLS with-check.
--
-- Fix: give id a default, allow admins to insert member rows, and let a member
-- "claim" their pre-created (invited) row on first login by reconciling its id to
-- their real auth.uid() — otherwise their row id would never match auth.uid() and
-- every own-row RLS check (ratings, picks, requests, profile) would fail.

alter table public.users alter column id set default gen_random_uuid();

drop policy if exists "admins can insert users" on public.users;
create policy "admins can insert users" on public.users
  for insert with check (public.is_admin(auth.uid()));

-- Claim an invited row: set its id to the caller's auth.uid() when the row's email
-- matches the caller's verified email and the id differs. SECURITY DEFINER so it
-- bypasses the own-row RLS the not-yet-reconciled member can't satisfy. Only a
-- freshly-invited row (no dependent data) ever changes id here.
create or replace function public.claim_invited_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare claimed uuid;
begin
  update public.users
    set id = auth.uid()
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and id <> auth.uid()
  returning id into claimed;
  return claimed;
end $$;

grant execute on function public.claim_invited_user() to authenticated;
