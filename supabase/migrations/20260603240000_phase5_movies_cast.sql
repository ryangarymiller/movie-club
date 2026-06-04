-- Top-billed cast per film (from TMDB credits), for the Stats "Connection Web · 6 Degrees".
-- Backfilled from the TMDB /movie/{id}/credits endpoint (top ~12 billed names per film).
alter table public.movies add column if not exists tmdb_cast text[];
