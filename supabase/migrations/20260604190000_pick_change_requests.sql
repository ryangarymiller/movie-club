-- Member pick-change requests. Once a month is active its picks are locked; a
-- member may REQUEST to swap their own active-month pick (only while the film has
-- zero scores — unfair to change once others have watched/scored). An admin
-- approves (which swaps the film) or denies. Mirrors score_change_requests.

create table if not exists public.pick_change_requests (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  requested_tmdb_id integer not null,
  requested_title text not null,
  requested_poster_url text,
  requested_year integer,
  reason text,
  status text not null default 'pending',  -- pending | approved | denied
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.pick_change_requests enable row level security;

create policy "users insert own pick requests" on public.pick_change_requests
  for insert with check (auth.uid() = user_id);
create policy "users read own pick requests" on public.pick_change_requests
  for select using (auth.uid() = user_id);
create policy "admins manage all pick requests" on public.pick_change_requests
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create index if not exists pick_change_requests_movie_idx on public.pick_change_requests(movie_id);
create index if not exists pick_change_requests_status_idx on public.pick_change_requests(status);

-- Notify the requester when an admin decides (approved/denied).
create or replace function public.notify_pick_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','denied') then
    insert into notifications (user_id, type, title, body, link, payload)
    values (NEW.user_id, 'pick_change',
            case when NEW.status = 'approved' then 'Pick change approved ✅' else 'Pick change denied' end,
            'Your request to change "' || NEW.requested_title || '" was ' || NEW.status || '.',
            '/this-month',
            jsonb_build_object('request_id', NEW.id));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_pick_change on public.pick_change_requests;
create trigger trg_notify_pick_change after update of status on public.pick_change_requests
for each row execute function public.notify_pick_change();
