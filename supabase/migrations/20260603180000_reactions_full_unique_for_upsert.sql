-- The reactions uniqueness was a PARTIAL index (WHERE target_id IS NOT NULL), which
-- Postgres cannot use as an ON CONFLICT target — so the client's reaction upsert failed
-- with "no unique or exclusion constraint matching the ON CONFLICT specification".
-- target_id is NOT NULL on every row, so a plain (non-partial) unique constraint is
-- equivalent and IS usable by ON CONFLICT.
alter table public.reactions drop constraint if exists reactions_target_user_emoji_key;
drop index if exists public.reactions_target_user_emoji_key;
delete from public.reactions r using public.reactions r2
  where r.ctid < r2.ctid and r.target_type = r2.target_type and r.target_id = r2.target_id
    and r.user_id = r2.user_id and r.emoji = r2.emoji;
alter table public.reactions add constraint reactions_target_user_emoji_key
  unique (target_type, target_id, user_id, emoji);
