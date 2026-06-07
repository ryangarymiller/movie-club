-- The notification bell subscribes to realtime INSERTs on public.notifications
-- (NotificationsContext), but the table was never added to the supabase_realtime
-- publication — so the live subscription never fired in production and new
-- notifications only appeared after a full reload. Add it (RLS still applies, so
-- each member only receives their own rows).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
