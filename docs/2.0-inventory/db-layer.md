I have everything needed; no further reads. Final finding before the write-up: as `anon`, `movies_safe` returns all 32 film rows (verified) — the CASE still masks the 3 unrevealed pickers, so it is not an anonymity leak, but it's an unintended anon read path outside the guest views.

# Movie Club DB layer — 1.0 inventory for the 2.0 plan

**Method.** Read all 57 files in `supabase/migrations/` in filename order, then pulled the live catalog of project `pjwttvazgabwcybrwpmx` read-only (pg_policies, pg_trigger, cron.job, pg_proc, pg_views, column grants, publication). **Baseline gap (README.md:5-14):** the Phase-1 schema — `users`, `seasons`, `months`, `movies`, `ratings`, `upcoming_picks`, `picker_guesses`, `score_predictions`, `score_change_requests`, `month_absences`, `awards`, `auth_debug_logs`, enums, `auth_user_has_scored`, `handle_auth_user_created`, the auth trigger, the original `movies_safe` and all base RLS — exists **only in the live DB**, not in any migration. Rows marked **BASE** below are cited from the live catalog. Everything else cites the migration holding the *current* definition.

**Live lifecycle snapshot (2026-09-24):** Jan–Jul `revealed`; **2026-08 `active`** (3 films, all `scores_revealed`, pickers hidden); **2026-09 `upcoming`, `auto_activate=true`, `active_date=2026-10-01`**, 0 films. When September activates, `activate_month` will auto-create **2026-10 as `upcoming` with `auto_activate=true`** — the first v2 month will be born with v1 automation switched on unless the cutover flips it.

---

## 1. Tables

Assumption vocabulary: one-pick-per-member · N-films-per-month · per-film-deadlines · calendar-auto-activation · picker-identity · month-as-unit · upcoming_picks · completeness-gate · test-account-email-filter · none.

| Table | Current def | What / key columns | Depends on | 1.0 assumptions | Verdict |
|---|---|---|---|---|---|
| `users` | BASE; `is_op` 20260603120000:9; `id` default 20260604200000:10 | id, name, email(unique), role(user_role), is_op, timezone, joined_at, is_active, theme_*, default_film_sort, … | auth signup trigger | test-account-email-filter (email is the discriminator) | **carry** — add `is_test` (additive) |
| `seasons` | BASE; readjustment cols 20260604120000:13-15, 20260604180000:25 | name, start/end_date, readjustment_open/ends_at/auto | activate_month auto-open | none | **carry** |
| `months` | BASE; `active_date` 20260603120200:3; `auto_activate` 20260604160000:8 | season_id, month_year(unique text), status enum `upcoming/active/revealed`, active_date, auto_activate | activate_month, 2 crons, notify/broadcast triggers | month-as-unit, calendar-auto-activation | **adapt** — add `mode`, `theme`; v2 months must have `auto_activate=false` |
| `movies` | BASE; +tmdb metrics 20260603190000:6-9; +cast 20260603240000:3; +writers 20260604130000:5; +veto flag 20260607120000:19-20 | month_id, title, tmdb_id, picked_by_user_id, pick_justification, scores_revealed, picker_revealed, scoring_deadline, historical_avg_score, tmdb_*, veto_resubmit_required | everything | picker-identity, per-film-deadlines, N-films-per-month | **adapt** — shared film record; `picked_by_user_id`→submitter (C6b), `scoring_deadline` NULL in v2 |
| `ratings` | BASE; unique(movie_id,user_id) | score 0.01–10, pre_watch_excitement, recommend_outside_club | reveal/notify triggers | none (score = "watched" signal, B4) | **carry** |
| `upcoming_picks` | BASE; unique(user_id,**month_target**) | user_id, tmdb_id, title, poster_url, metadata jsonb, **month_target text** (= month_year; *not* `month_id` as CLAUDE.md says) | activate_month, month_picks_complete | one-pick-per-member, upcoming_picks, month-as-unit | **retire** (scope off) — 0–2 submissions violates the unique key; new `submissions` table |
| `month_absences` | BASE; unique(month_id,user_id) | month_id, user_id, reason, marked_by_admin_id | month_picks_complete only (NOT the picker-reveal trigger) | month-as-unit | **adapt** — B5 needs per-cycle/film absence; month-keyed is too coarse when a month has N films |
| `score_change_requests` | BASE | rating_id, requested_score, status(request_status) | notify_score_change | none | **carry** |
| `picker_guesses` | BASE; unique(movie_id,guessing_user_id) | movie_id, guessing/guessed_user_id | picker_revealed RLS | picker-identity | **adapt** — becomes "who submitted it"; schema fits |
| `score_predictions` | BASE; unique(movie_id,predicting,target) | picker-only predictions | is_movie_picker RLS | picker-identity | **adapt** — submitter predicts; verify makes-sense |
| `awards` | BASE; unique nulls-not-distinct(award_key,scope,period_ref); scope ∈ monthly/season/annual/alltime | user_id, movie_id, picker_user_id, metric | client writeAwardsToDb | month-as-unit (monthly scope) | **adapt** — G1 monthly redesign; schema fits |
| `veto_votes` | 20260602120100:84-96 | movie_id, voting_user_id; unique | trg_notify_veto_threshold | picker-identity, N-films-per-month | **retire** — vetoing a vote-elected film is incoherent |
| `reviews` | 20260602120100:6; unique dropped 20260603120100:5 | thread roots | notify_review | none | **carry** |
| `comments` | 20260602120100:35; +review_id 20260603120100:9 | tree | notify_comment | none | **carry** |
| `reactions` | 20260602120100:68; polymorphic 20260603120100:13-18; constraint 20260603180000:11 | target_type/id, emoji | — | none | **carry** |
| `votes` | 20260603120100:21 | up/down on review/comment | — | none | **carry** — name clash: call 2.0 ballots `ballots`, not `votes` |
| `auth_events` / `auth_debug_logs` | 20260603170000:3 / BASE | diagnostics | — | none | **carry** |
| `notifications` | 20260603200000:6 | user_id, type, title, body, link, payload, read_at | all notify_* | none | **carry** |
| `notification_preferences` | 20260603210000:4 | muted_types, channel_push/email, quiet hours | email/push triggers | none | **carry** |
| `push_subscriptions` | 20260603230000:2 | endpoint, p256dh, auth | push_notification | none | **carry** |
| `watchlist` | 20260604140000:6 | private | — | none | **carry** |
| `draft_queue` | 20260604140000:17 | private, ranked | ThisMonth quick-pick | upcoming_picks (promotion target) | **adapt** — promote into submissions |
| `film_tags` | 20260604150000:8 | member tags | — | none | **carry** |
| `app_settings` | 20260604180000:9; +veto_threshold 20260607180000:5; +deadline_grace_days 20260608000000:9 | singleton | crons, veto trigger | per-film-deadlines, N-films-per-month | **adapt** — add `club_mode` |
| `pick_change_requests` | 20260604190000:6 | swap a locked active pick | trg_notify_pick_change | one-pick-per-member, picker-identity | **retire** |
| `month_recaps` | 20260607130000:11 | recap_md, best_review_id | ai-recap fn | month-as-unit | **carry** — 1..N films still recap-able; prompt adapts |
| `custom_avatars` | 20260607160000:38 | admin assets | — | none | **carry** |

## 2. Functions / RPCs

| Function | Current def | Does | Fires on / depends | Assumptions | Verdict |
|---|---|---|---|---|---|
| `activate_month(uuid, p_force bool=false)` | 20260703000000:72-209 | THE orchestrator: gate (due ∧ picks-complete unless admin force) → demote other `active`→`revealed` + bulk-reveal its films → set target active → materialize `upcoming_picks`→`movies` (full TMDB copy) → **split `scoring_deadline` over ALL films in month** → create next month `upcoming`+`auto_activate=true` → auto-open prior season readjustment | cron, client-soft page load, admin button | one-pick-per-member, N-films-per-month, per-film-deadlines, calendar-auto-activation, picker-identity, month-as-unit, upcoming_picks, completeness-gate | **retire for v2** — must no-op/raise when target OR currently-active month is `mode='v2'` (it would demote a live v2 month, stamp deadlines on v2 films, and spawn an auto_activate next month) |
| `month_picks_complete(uuid)` | 20260703000000:20-56 | every expected picker has an upcoming_pick | activate_month, cron | one-pick-per-member, upcoming_picks, completeness-gate, month-as-unit, test-account-email-filter | **retire** |
| `materialize_and_split_month(uuid)` | 20260603150000:8-47 | legacy materialize+split | admin only (legacy) | upcoming_picks, per-film-deadlines, one-pick-per-member | **retire** (already legacy) |
| `cron_auto_activate_due_months()` | 20260703000000:215-234 | activates due+complete upcoming months | pg_cron :05 | calendar-auto-activation, completeness-gate | **retire/guard** — add `mode='v1'` predicate |
| `cron_enforce_due_deadlines()` | 20260608000000:13-38 | flips `scores_revealed` when deadline+grace passed on active month | pg_cron :20 | per-film-deadlines, month-as-unit | **retire/guard** — inert if v2 deadlines are NULL, but guard anyway (B7: reveal by completion) |
| `cron_notify_due_soon()` | 20260609010000:7-38 | "due tomorrow" reminders | pg_cron :35 | per-film-deadlines, test-account-email-filter | **retire/guard** — same |
| `reveal_picker_when_month_complete()` | 20260605030000:112-157 | after each score: if every expected member scored **every film in the month**, flip `picker_revealed` month-wide; **ignores `month_absences`** | trg on ratings | month-as-unit, N-films-per-month, picker-identity, test-account-email-filter | **adapt** — B7/C6b/C7b is this event but *per film*, absence-aware, and also flipping `scores_revealed`; write a v2 sibling, guard this one by mode |
| `notify_scores_revealed()` | 20260605120000:9-26 | per-film "scores are in" (skipped if month already `revealed`) | trg on movies | month-as-unit (skip rule), test-account-email-filter | **carry** — per-film reveal is the v2 event |
| `notify_month_status()` | 20260603200000:39-56 | month `active`/`revealed` notifications | trg on months | month-as-unit; copy "New films to watch this month" | **adapt** (copy only) |
| `notify_comment()` / `notify_review()` | 20260605140000:5-30 / :32-46 | reply + @mention | trg | test-account-email-filter | **carry** |
| `notify_score_change()` | 20260605120000:71-85 | decision notice | trg | none | **carry** |
| `notify_pick_change()` | 20260604190000:34-46 | decision notice | trg | one-pick-per-member | **retire** |
| `notify_late_score()` | 20260609000000:8-43 | score on active+already-revealed film → notify others | trg on ratings | per-film-deadlines (copy says "after the deadline"), month-as-unit, test-account-email-filter | **adapt** — in v2 fires when an *absent* member scores post-reveal; keep, fix copy |
| `notify_veto_threshold()` | 20260607180000:17-62 | flag film + notify picker at threshold | trg on veto_votes | picker-identity, N-films-per-month | **retire** |
| `resubmit_vetoed_pick(15 args)` | 20260607120000:95-167 | picker swaps vetoed film | RPC | picker-identity | **retire** |
| `email_notification()` | 20260604210000:4-61 | Resend via pg_net | trg on notifications | none | **carry** |
| `push_notification()` | 20260603230100:6-46 | send-push via pg_net | trg on notifications | none | **carry** |
| `broadcast_reveal()` | 20260611010000:6-24 | realtime `{table,id}` on `reveals` | trg on movies/months | none | **carry** |
| `auth_user_has_scored(uuid)` | BASE (live) | caller has a score on film | ratings/reviews/comments RLS | none | **carry** |
| `is_movie_picker` / `auth_user_picked` / `auth_user_picked_movie_ids` | 20260607200000:17-34 | definer picker checks | score_predictions RLS, client | picker-identity | **carry** (semantics → submitter) |
| `is_admin(uuid)` | 20260604170000:10-18 | recursion-safe admin | RLS | none | **carry** |
| `abbrev_name(text)` | 20260607140000:16-24 (+20260607150000:6) | "First L." | guest views | none | **carry** |
| `claim_invited_user()` | 20260604200000:20-34 | reconcile invited row id | client | none | **carry** |
| `enforce_op_for_role_changes()` | 20260603130000:6-19 | op-only role edits | trg on users | none | **carry** |
| `handle_auth_user_created()` | BASE (live) | on auth signup: reconcile pre-created row **or** insert inactive member | `on_auth_user_created` on auth.users | none | **carry, but BROKEN**: its reconcile branch UPDATEs `public.auteur_votes` and `public.season_rankings`, which **do not exist** (verified `to_regclass` = null) → an admin-pre-created member (E11 Mike) signing in would fail with undefined_table |
| `handle_new_auth_user()` | BASE (live), **orphaned** (no trigger) | old approved-email allowlist incl. test address | — | test-account-email-filter | **retire** (dead code) |
| `rls_auto_enable()` | BASE; event trigger `ensure_rls` | auto-enable RLS on new public tables | ddl_command_end | none | **carry** (v2 tables get RLS on by default) |

## 3. Triggers (live catalog, 15)

| Trigger | Table · event | Function | WHEN | Assumptions | Verdict |
|---|---|---|---|---|---|
| `on_auth_user_created` | auth.users AFTER INSERT | handle_auth_user_created | — | none | carry (fix above) |
| `trg_enforce_op_role` | users BEFORE UPDATE | enforce_op_for_role_changes | — | none | carry |
| `trg_notify_month_status` (20260603200000:58) | months AFTER UPDATE OF status | notify_month_status | — | month-as-unit | adapt |
| `trg_broadcast_month_status` (20260611010000:38) | months AFTER UPDATE OF status | broadcast_reveal | status changed | none | carry |
| `trg_notify_scores_revealed` (20260603200000:36) | movies AFTER UPDATE OF scores_revealed | notify_scores_revealed | — | none | carry |
| `trg_broadcast_movie_reveal` (20260611010000:29) | movies AFTER UPDATE OF scores_revealed, picker_revealed, veto_resubmit_required | broadcast_reveal | any of three changed | none | carry |
| `trg_reveal_picker_complete` (20260605030000:160) | ratings AFTER INSERT OR UPDATE OF score | reveal_picker_when_month_complete | — | month-as-unit | **guard by mode** |
| `trg_notify_late_score` (20260609000000:46) | ratings AFTER INSERT OR UPDATE OF score | notify_late_score | — | per-film-deadlines | adapt |
| `trg_notify_review` / `trg_notify_comment` (20260603200000:104/86) | reviews/comments AFTER INSERT | notify_review/comment | — | none | carry |
| `trg_notify_score_change` (20260603200000:120) | score_change_requests AFTER UPDATE OF status | notify_score_change | — | none | carry |
| `trg_notify_pick_change` (20260604190000:48) | pick_change_requests AFTER UPDATE OF status | notify_pick_change | — | one-pick-per-member | retire |
| `trg_notify_veto_threshold` (20260607120000:90) | veto_votes AFTER INSERT | notify_veto_threshold | — | picker-identity | retire |
| `trg_email_notification` / `trg_push_notification` (20260603220000:63 / 20260603230100:48) | notifications AFTER INSERT | email/push_notification | — | none | carry |

## 4. pg_cron jobs (live: all `active=true`)

| Job | Schedule | Command | Def | Assumptions | Verdict |
|---|---|---|---|---|---|
| `auto-activate-due-months` (jobid 1) | `5 * * * *` | `cron_auto_activate_due_months()` | 20260607230000:42 | calendar-auto-activation, completeness-gate | **guard** (`mode='v1'`), never unschedule |
| `enforce-due-deadlines` (2) | `20 * * * *` | `cron_enforce_due_deadlines()` | 20260608000000:43 | per-film-deadlines | **guard** |
| `notify-due-soon` (3) | `35 * * * *` | `cron_notify_due_soon()` | 20260609010000:43 | per-film-deadlines | **guard** |

## 5. RLS policies (live; the anonymity model)

| Table | Policy · cmd | Rule | Def | Assumptions | Verdict |
|---|---|---|---|---|---|
| movies | `authenticated users can read movies` SELECT | auth.uid() not null (picker cols hidden by **column grants**, not RLS) | BASE | none | carry |
| movies | `admins can insert/update movies` | admin | BASE | none | carry (v2 elect RPC must be definer) |
| ratings | `rolling score visibility` SELECT | own OR film scores_revealed OR admin OR (score not null ∧ auth_user_has_scored) | 20260608120000:18-26 | none | **carry** (C6) |
| ratings | insert own / update own / admins ALL | — | BASE | none | carry |
| reviews / comments | `rolling visibility` SELECT | own OR revealed OR admin OR (you scored ∧ author scored) | 20260602120100:17-28 / :49-60 | none | carry |
| reviews / comments | `insert own (scored)` | must have scored (admin exempt) | 20260602130000:5-22 | none | carry |
| reviews / comments | update own; delete own-or-admin | — | 20260602120100:30-32; 20260603130000:66-67 | none | carry |
| upcoming_picks | `users can manage own upcoming pick` ALL; `read own` SELECT; `admins can read all` SELECT | own rows; admin read | BASE | one-pick-per-member, upcoming_picks | retire |
| months | authenticated read; admin insert/update | — | BASE; 20260603160000:8-14 | none | carry (v2 mode edits are admin) |
| picker_guesses | `Guesses visible after reveal` SELECT (picker_revealed); `Users manage own guesses` ALL | — | BASE | picker-identity | adapt (semantics) |
| score_predictions | `Predictions visible after reveal` SELECT (scores_revealed); `picker manages own predictions` ALL via is_movie_picker | — | BASE; 20260607200000:45-49 | picker-identity | adapt |
| veto_votes | readable; insert own; delete own-or-admin | — | 20260602120100:93-96 | — | retire |
| month_absences | authenticated read; admins ALL | — | BASE | month-as-unit | adapt |
| seasons / app_settings / users / awards / score_change_requests / pick_change_requests | as documented in CLAUDE.md | — | 20260604120000:19; 20260604180000:18-23; 20260604170000:23-30; 20260604200000:13; BASE; 20260604190000:23-28 | none | carry |

## 6. Views & grants

| Object | Def | Behaviour | Verdict / note |
|---|---|---|---|
| `movies_safe` | 20260607120000:23-40 (definer: `reloptions=null`, owner postgres) | masks `picked_by_user_id`/`pick_justification` until `picker_revealed` or admin | **carry** (submitter mask, C6). **Side finding:** anon holds SELECT on it and it has no auth filter — verified `set role anon` returns all 32 rows (pickers still masked). Revoke anon SELECT (additive-safe). |
| `guest_films` / `guest_scores` / `guest_reviews` | 20260607140000:27-83 (`security_invoker=false`) | revealed-only, abbreviated, test excluded; anon+authenticated SELECT (:86-88) | carry; `picker_label` semantics → submitter |
| `movies` column grants | 20260607210000:16-23 | table SELECT revoked from anon/authenticated; authenticated re-granted every column except the two picker columns; anon has none (verified: permission denied) | carry — any **new** `movies` column must be added to this grant list or members can't read it |
| Realtime publication | 20260607170000, 20260607190000, 20260609020000 | comments, notifications, ratings, reactions, reviews, seasons, votes (movies/months deliberately excluded) | carry |

## 7. Hardcoded test-account email — every SQL site

**Current (live) definitions — 15 SQL sites, 9 functions + 3 views:**

| File:line | Object |
|---|---|
| 20260603200000:48, :53 | `notify_month_status` (never redefined) |
| 20260605030000:134, :146 | `reveal_picker_when_month_complete` |
| 20260605120000:23 | `notify_scores_revealed` |
| 20260605140000:21 | `notify_comment` |
| 20260605140000:37 | `notify_review` |
| 20260607140000:48 / :67 / :82 | `guest_films` / `guest_scores` / `guest_reviews` |
| 20260609000000:27, :38 | `notify_late_score` |
| 20260609010000:29 | `cron_notify_due_soon` |
| 20260703000000:38, :49 | `month_picks_complete` |
| *(live only, no migration)* | `handle_new_auth_user` — approved-email array incl. the test address; orphaned |

**Superseded definitions (history only, no action):** 20260603200000:31 (`notify_scores_revealed` v1), :76 (`notify_comment` v1), :94 (`notify_review` v1); 20260605030000:182 (`notify_scores_revealed` v2); 20260605120000:44 (`notify_comment` v2), :60 (`notify_review` v2).

**Non-SQL adjacent:** `supabase/functions/ai-recap/index.ts:19` (`TEST_EMAIL` const).

The `is_test` refactor = one migration that adds `users.is_test`, sets it for the one row (verified 1 row), and re-`CREATE OR REPLACE`s the 9 functions + 3 views.

---

## (a) Objects that MUST be guarded by a mode flag in 2.0

1. `activate_month` — both its *target* and the *currently-active* month must be `mode='v1'`; otherwise it demotes a live v2 month, stamps `scoring_deadline` on v2 films, and spawns an `auto_activate=true` successor.
2. `cron_auto_activate_due_months` — add `and mode='v1'`.
3. `cron_enforce_due_deadlines` — add mode predicate (defence in depth beyond NULL deadlines).
4. `cron_notify_due_soon` — same.
5. `month_picks_complete` — return false / not called for v2.
6. `reveal_picker_when_month_complete` (`trg_reveal_picker_complete`) — month-scoped and absence-blind; must skip v2 months so the v2 per-film completion trigger owns the reveal.
7. `notify_veto_threshold` / `resubmit_vetoed_pick` / `veto_votes` RLS — scope off for v2 films.
8. `notify_pick_change` / `pick_change_requests` — scope off.
9. `notify_late_score` — keep firing but copy assumes a deadline; gate copy on mode.
10. The **client-soft `autoActivateDueMonths()`** page-load path (calls #1) — same guard on the RPC covers it.
11. **Cutover data step:** the 2026-10 `months` row (auto-created with `auto_activate=true`) must be set `mode='v2', auto_activate=false` *before* Oct 1 PT.

## (b) Objects 2.0 can reuse as-is

`ratings` + `rolling score visibility` RLS · `auth_user_has_scored` · `reviews`/`comments`/`reactions`/`votes` tables + RLS + realtime · `notifications` + `notify_scores_revealed`, `notify_comment`, `notify_review`, `notify_score_change`, `email_notification`, `push_notification` · `broadcast_reveal` + both triggers · `movies_safe` masking + column grants · `is_movie_picker`/`auth_user_picked*` (as "submitter") · `is_admin`, `abbrev_name`, `claim_invited_user`, `enforce_op_for_role_changes`, `rls_auto_enable` · `seasons` + readjustment automation · `app_settings` (extend) · `month_recaps` · `film_tags`, `watchlist`, `custom_avatars`, `push_subscriptions`, `notification_preferences`, `auth_events` · guest views (label semantics only).

**Other side findings worth folding into the plan:** (i) CLAUDE.md documents `upcoming_picks.month_id`; the real column is `month_target text` — fix the doc. (ii) `handle_auth_user_created`'s reconcile branch references two non-existent tables — Mike's onboarding (open question 5) will hit it if his row is pre-created; either create him via first-login (inactive → admin activates) or fix the trigger first. (iii) `month_absences` is only consulted by `month_picks_complete`, not by the picker-reveal trigger — B5 needs a new absence check in the v2 completion trigger.
