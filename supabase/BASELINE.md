# Schema baseline — run on the laptop

**Why.** Prod carries 80 applied migrations; this repo holds 57, and the entire Phase-1 schema
(`users`, `months`, `movies`, `ratings`, `movies_safe`, base RLS, the auth trigger, enums) exists
only in the live database. `supabase start` from this repo therefore does **not** reproduce prod.
The 2.0 work (see `MOVIE_CLUB_2.0_PLAN.md` Phase 0) needs one true baseline first.

**Where.** The cloud session cannot open a raw Postgres connection (network policy), but the
laptop can. Run this there, once, from the repo root on branch `claude/july-selection-issue-txp1un`.

## 1. Dump the live public schema

```bash
# Connection string: Supabase dashboard → Project Settings → Database → "Direct connection".
# Put it in an env var for the shell session only; never commit it.
export PROD_DB_URL='postgresql://postgres:<password>@db.pjwttvazgabwcybrwpmx.supabase.co:5432/postgres'

pg_dump "$PROD_DB_URL" \
  --schema-only --no-owner --no-comments \
  --schema=public \
  > supabase/migrations/20260924000000_baseline_v1.sql
```

Keep grants (do **not** pass `--no-privileges`): the column-level grants on `movies` are part of
the anonymity model.

## 2. Add what a `--schema=public` dump misses

Append `supabase/baseline_addendum.sql` (committed alongside this doc) to the end of the baseline
file. It re-creates the three things that live outside `public` or outside a schema dump:

- the auth-signup trigger `on_auth_user_created` on `auth.users`
- the `ensure_rls` event trigger (event triggers are cluster-level, excluded by `--schema`)
- the three `pg_cron` jobs (`cron.job` rows are data, not schema)

## 3. Archive the historical migrations

The 57 pre-baseline files are history, not a build recipe, and would collide with the baseline on a
fresh database. Move them out of the CLI's path:

```bash
git mv supabase/migrations/2026060*.sql supabase/migrations/2026061*.sql supabase/migrations/20260703*.sql \
       supabase/migrations_archive/
```

`docs/2.0-inventory/` cites them by their original names; the archive keeps those names.

## 4. Verify the baseline reproduces prod

```bash
supabase start                      # fresh local DB: baseline + any newer migrations
supabase link --project-ref pjwttvazgabwcybrwpmx
supabase db diff --linked           # must be EMPTY (or only the newer 2.0 migrations)
```

An empty diff is the Phase 0 exit criterion for step 1. Commit the baseline file and the archive
move together.

## 5. Mark the baseline as applied in prod (checkpoint — ask before running)

Prod already *has* this schema; the baseline must be recorded, not executed:

```bash
supabase migration repair --status applied 20260924000000
```

Every later migration then applies to prod normally.
