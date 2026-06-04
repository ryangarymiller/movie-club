-- Phase 6 — Seasonal readjustment window.
--
-- At a season's end an admin opens a readjustment window during which members may
-- freely re-score that season's films (the client routes around the normal
-- score-change-request lock; the ratings UPDATE RLS already allows self-edits).
-- When the window closes, scores lock and feed the season's *finalized* awards —
-- including the new Auteur Award (best picker by score, awarded only post-window).
--
-- `readjustment_open`     — admin-controlled on/off for the window.
-- `readjustment_ends_at`  — display countdown + soft auto-close (client treats a
--                           window past this instant as closed even if still flagged open).

alter table public.seasons
  add column if not exists readjustment_open boolean not null default false,
  add column if not exists readjustment_ends_at timestamptz;

-- Admins manage the window (members already have SELECT on seasons).
drop policy if exists "admins can update seasons" on public.seasons;
create policy "admins can update seasons" on public.seasons
  for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
