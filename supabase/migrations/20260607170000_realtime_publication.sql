-- Enable Postgres realtime for the data tables the app already subscribes to.
--
-- Home + This Month subscribe to `ratings` changes and ReadjustmentContext to
-- `seasons`, but these tables were never added to the `supabase_realtime`
-- publication — so those subscriptions silently never fired (you had to refresh
-- to see a new score reflected in Home stats / "Your Turn"). Adding them makes the
-- existing subscriptions live. Realtime still honours RLS, so each client only
-- receives change events for rows it may SELECT (your own score, revealed scores).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ratings'
  ) then
    alter publication supabase_realtime add table public.ratings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seasons'
  ) then
    alter publication supabase_realtime add table public.seasons;
  end if;
end $$;
