-- Per-user notification preferences. muted_types lets a member silence specific event
-- types (the in-app center filters them out); channel_push/email + quiet hours feed the
-- push/email delivery layer (Phase 4b). A missing row means "all defaults" (nothing muted).
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  muted_types text[] not null default '{}',
  channel_push boolean not null default false,
  channel_email boolean not null default false,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "manage own notification prefs" on public.notification_preferences;
create policy "manage own notification prefs" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
