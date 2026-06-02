-- Session 7 data corrections — applied to the live project on 2026-06-02.
-- These repair records that were imported/configured incompletely. All statements
-- are idempotent (matched by stable keys), so re-running is safe.

-- 1) Ryan Bey is an admin per PRIVATE.md (was stored as 'member').
update public.users
set role = 'admin'
where email = 'ryan.bey1234@gmail.com';

-- 2) Ryan Bey's five picks were imported with a NULL picked_by_user_id.
--    Re-attribute them (only where still unattributed).
update public.movies
set picked_by_user_id = (select id from public.users where email = 'ryan.bey1234@gmail.com')
where title in (
  'Princess Mononoke',
  'Where the Wild Things Are',
  'Oldboy',
  'Eternal Sunshine of the Spotless Mind',
  'Being John Malkovich'
)
and picked_by_user_id is null;

-- 3) May 2026 is fully revealed; mark the month 'revealed' so it surfaces in the
--    Films › History tab (which only lists revealed months).
update public.months
set status = 'revealed'
where month_year = '2026-05';
