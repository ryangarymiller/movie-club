# Supabase Migrations

SQL changes applied to the Supabase project (`pjwttvazgabwcybrwpmx`), tracked in the repo.

## Important: baseline gap

Migration tracking started in **session 7 (2026-06-02)**. The schema that predates this
(tables `users`, `seasons`, `months`, `movies`, `ratings`, `upcoming_picks`, `picker_guesses`,
`score_predictions`, `score_change_requests`, `month_absences`, `awards`, `auth_debug_logs`; the
`movies_safe` view; enums `user_role`/`month_status`/`request_status`; functions
`auth_user_has_scored`, `handle_auth_user_created`, `rls_auto_enable`; and the auth triggers) was
created directly via the Supabase MCP/dashboard and is **not** captured here yet.

**The live project is the source of truth** until a baseline is generated.

### To generate a true baseline (recommended)

Install the Supabase CLI, link the project, and pull the current schema:

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase link --project-ref pjwttvazgabwcybrwpmx
supabase db pull             # writes a baseline migration capturing the full current schema
```

Commit the generated baseline as `0000_baseline.sql` (it will sit before the session-7 files).
The migrations below are written idempotently (`create table if not exists`, `drop policy if exists`)
so they coexist with a pulled baseline.

## Migrations (in order)

| File | What it does |
|------|--------------|
| `20260602120000_session7_data_fixes.sql` | Data corrections: Ryan Bey → admin; backfill his 5 NULL pick attributions; May 2026 → revealed |
| `20260602120100_phase2_social_tables.sql` | Phase 2 tables `reviews`, `comments`, `reactions`, `veto_votes` + RLS (rolling visibility via `auth_user_has_scored`; comments delete = admin-only) |
| `20260602120200_predictions_picker_only_rls.sql` | Replace the score_predictions policy so only a film's picker can write predictions for it |

> The data-fixes file is a one-time production correction kept here for traceability; it is
> idempotent and harmless to re-run, but is not part of the reproducible schema.
