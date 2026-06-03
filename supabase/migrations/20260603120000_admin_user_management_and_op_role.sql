-- Admins can update any user row (fixes "Deactivate" not persisting + enables member
-- management). Op-only restrictions (changing role) are enforced in the app layer.
create policy "admins can update any user" on public.users for update
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- "Op" super-role: an op IS an admin (role stays 'admin', so all existing admin gating
-- keeps working) plus the sole power to grant/revoke admin from others.
alter table public.users add column if not exists is_op boolean not null default false;

-- Ryan Miller is the sole op.
update public.users set is_op = true where email = 'ryan.gary.miller@gmail.com';
