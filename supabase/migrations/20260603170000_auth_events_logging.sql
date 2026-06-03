-- Diagnostic logging for auth/session events (esp. unexpected sign-outs).
-- Inserts must work even when signed out (anon), so insert is open; only admins read.
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  event text not null,
  user_initiated boolean not null default false,
  detail jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.auth_events enable row level security;

drop policy if exists "anyone can insert auth events" on public.auth_events;
create policy "anyone can insert auth events" on public.auth_events
  for insert with check (true);

drop policy if exists "admins read auth events" on public.auth_events;
create policy "admins read auth events" on public.auth_events
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

create index if not exists auth_events_created_idx on public.auth_events (created_at desc);
create index if not exists auth_events_event_idx on public.auth_events (event);
