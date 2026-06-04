-- Fix: deactivating a member made their row unreadable to EVERYONE (the users
-- SELECT policy required is_active = true), so an "inactive" member vanished from
-- the admin list and could never be reactivated. Admins must be able to read
-- inactive members; a deactivated user must still read their own row.
--
-- A self-referencing EXISTS in a SELECT policy would recurse (the subquery's own
-- read re-applies the policy), so the admin check goes through a SECURITY DEFINER
-- helper that bypasses RLS in its body.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.users where id = uid and role = 'admin');
$$;

grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists "members can read users" on public.users;
create policy "members read active or self; admins read all" on public.users
  for select using (
    auth.uid() is not null and (
      is_active = true
      or id = auth.uid()
      or public.is_admin(auth.uid())
    )
  );
