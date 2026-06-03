-- Session 9 critical fix: months had NO admin write policy, so the client UPDATE that
-- sets status='active'/active_date was silently blocked by RLS (0 rows changed, no error)
-- while the SECURITY DEFINER materialize_and_split_month RPC still created movies — leaving
-- a month with films but status 'upcoming', and the admin dashboard showing "no active
-- month". Every other table (movies, reviews, comments, upcoming_picks) already had admin
-- write policies; months was the gap.
drop policy if exists "admins can insert months" on public.months;
create policy "admins can insert months" on public.months for insert
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "admins can update months" on public.months;
create policy "admins can update months" on public.months for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Cleanup: the legacy (comment_id, user_id, emoji) unique constraint on reactions is dead
-- weight now — reactions are polymorphic (the partial unique index
-- reactions_target_user_emoji_key on (target_type, target_id, user_id, emoji) enforces
-- uniqueness) and comment_id is always NULL for new rows, so this constraint never fires.
alter table public.reactions drop constraint if exists reactions_comment_id_user_id_emoji_key;
