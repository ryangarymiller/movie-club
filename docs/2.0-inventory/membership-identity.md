# Membership & Identity — 1.0 research for Movie Club 2.0

**Headline findings**

1. There is no single "who counts" predicate. The rule *active ∧ not-test ∧ joined by this month* is re-implemented 6 times (2 SQL, 4 client) with three different date comparisons and two different Zack name-hacks; only one of the six (`month_picks_complete`) consults `month_absences`. The picker-reveal trigger ignores absences entirely, so an absent member blocks month-level picker reveal until month end.
2. `month_absences` is **month-scoped** (`month_id`, `user_id`, `marked_by_admin_id`, `reason`), has admin-ALL RLS, and **no client UI writes to it** (zero hits for `absence` in `src/`). B5 ("mark absent to unblock a cycle") needs both a film/cycle-scoped table and a UI.
3. The 41 test-email sites split 18 client / 1 edge / 21 SQL / 1 doc. Only **15 of the 21 SQL lines are in live definitions** (6 are superseded copies); the live ones span 8 functions/views that one migration can redefine. A **42nd site exists only in the live DB**: an orphan `public.handle_new_auth_user()` (attached to no trigger) hardcodes an approved-email allowlist including the test address.
4. Onboarding is DB-driven: the live `on_auth_user_created` trigger (not in the repo — baseline gap, `supabase/migrations/README.md:5-14`) either claims an admin-pre-created row by email or inserts a new row with `is_active=false`. Adding Mike is a one-row insert; `joined_at` (a `date`) automatically excludes him from every pre-Oct computation. Note the club's Joined-At compare is month-granular everywhere.

---

## 1. Expected / active member computations

| # | Location | Computes | Who counts | Mike (joined Oct 2026) | Absent for one film/cycle | Assumptions | Verdict |
|---|---|---|---|---|---|---|---|
| 1a | `src/pages/Admin.jsx:29-56` `expectedMembersList` / `expectedMemberCount` / `isZackPreApril` / `joinedByMonth` | Expected scorers for a month | `is_active` ∧ email≠test ∧ not (name==='Zack Anjoorian' ∧ month<'2026-04') ∧ `joined_at.slice(0,7) <= month_year` | Expected from `2026-10` onward, excluded before — automatic; Zack hack is redundant for him | Ignored: never reads `month_absences`; no film-level concept | month-as-unit, test-account-email-filter | **adapt** — key on cycle + absences + `is_test`; delete the name hack (`joined_at` subsumes it) |
| 1b | `Admin.jsx:870-911` "Films with missing scores" + back-calc `:896-908`, `runBackCalc :930-944` | Missing-score films; offers back-calc when exactly one expected member is missing and `historical_avg_score` set | Uses 1a; ratings by non-expected users dropped `:877-885` | Fine | Absent member reads as "missing"; if exactly one absent + historical avg set, back-calc would fabricate a score for the absent member (dormant: historical avg only on imports) | month-as-unit | **carry** back-calc (historical-only), **adapt** matrix to cycles/absences |
| 1c | `Admin.jsx:2396-2423` manual-score matrix rows; cells `:2570-2599` | Per member×film cell: ✓ / ✗ / `–` (not yet member) / `N/A` (Zack pre-April) | 1a's rules inline again (`:2417-2419`) | Pre-Oct cells render `–`, still clickable for backfill | No absent state — shows ✗ | month-as-unit | **adapt** — add absent glyph; derive from shared predicate |
| 1d | `src/pages/Stats.jsx:913-919` `isZackPreApril` (name starts with "Zack", hardcoded `['2026-01','2026-02','2026-03']`) applied `:5017-5023`; reused `src/components/MemberStatsOverlay.jsx:65` | Drops Zack's ratings on Jan–Mar films from all stats | Users: `.eq('is_active', true)` `:4987` + test filter; ratings: test + Zack only (**inactive members' ratings still count**) | No exclusion — if Mike backfills a pre-Oct score it counts (the Zack hack exists because Zack backfilled) | n/a | month-as-unit | **adapt** — generalize to `rating counts iff joined_at ≤ film cycle` (era-aware per E12); retire name check |
| 1e | `src/pages/Awards.jsx:227-236` `isZackEligible`, `:254-269` `isWinter2026`/`isUserEligibleForSeason`; used `:739, :877-880, :1152-1157, :1290-1293, :1391` | Per-person award eligibility | Name contains "zack"/"anjoorian" ∧ 2026 month<4 | Not excluded from pre-Oct per-person awards (harmless unless he has ratings there) | n/a | month-as-unit | **adapt** — shared `joined_at`-based eligibility with 1d |
| 1f | `src/lib/awards.js:114-128` `sanitize` | Roster for persisted awards | email≠test only; **no is_active/joined_at** (delegates to 1e) | Fine | n/a | test-account-email-filter | **carry** with `is_test` |
| 1g | `src/pages/Films.jsx:1039-1049` `_monthYear` (comment claims recommend-stat uses "members in club that month") | Dead: `_monthYear` is set but never consumed | — | — | — | none | **retire** (dead code) |
| 1h | `Films.jsx:1830-1835` `VetoControl totalActiveMembers={users.length}` (users = all rows minus test, **inactive included** `:1030,:1118`) + `app_settings.veto_threshold` (`20260607180000:5-6,:27`) | Veto denominator/threshold | All non-test users | 3-of-6 = 50% (was 3-of-5); admin-tunable | n/a | none | **adapt** — denominator should be expected members |
| 1i | SQL `month_picks_complete` `supabase/migrations/20260703000000_gate_auto_activation_on_complete_picks.sql:20-56` | Auto-activation gate: every expected picker has an `upcoming_pick` | `is_active` ∧ email≠test ∧ `to_char(joined_at,'YYYY-MM') <= month_year` ∧ **not in `month_absences`** | Once `is_active`, any v1 month ≥ `2026-10` waits for his pick | Month-level only | one-pick-per-member, upcoming_picks, completeness-gate, month-as-unit, test-account-email-filter | **retire** (scope off, mode='v1'); **extract its member predicate** as `expected_members(month_id)` — the reusable kernel |
| 1j | SQL `reveal_picker_when_month_complete` `20260605030000_rolling_reveal_engine.sql:112-157`, trigger `trg_reveal_picker_complete` on `ratings` `:159-162` | Flips `picker_revealed` for the whole month when expected×films pairs all scored | `is_active` ∧ email≠test ∧ `date_trunc('month', joined_at) <= month start`; **ignores `month_absences`** | Expected from Oct | An absent member blocks the reveal until month end (`activate_month` bulk reveal) | month-as-unit, N-films-per-month, picker-identity, test-account-email-filter | **adapt** — closest ancestor of v2's B7/C6b "last member scored → reveal + unblock" trigger, but per-film and absence-aware |
| 1k | SQL notification fan-outs (live defs): `notify_scores_revealed` `20260605120000:9-26`; `notify_month_status` `20260603200000:39-56`; `notify_comment` `20260605140000:5-30`; `notify_review` `20260605140000:32-46`; `notify_late_score` `20260609000000:8-43`; `cron_notify_due_soon` `20260609010000:7-38` | Recipients | `is_active` ∧ email≠test (no `joined_at`) | Receives everything as soon as `is_active=true` | `cron_notify_due_soon` nags non-scorers — would nag an absent member | test-account-email-filter; `due_soon` = per-film-deadlines; `late_score` = per-film-deadlines | **carry** (with `is_test`) except `cron_notify_due_soon` **retire**, `notify_late_score` **adapt** (no deadline in v2 → "score after reveal") |
| 1l | `src/pages/Home.jsx:317` | Club Members strip / activity | email≠test ∧ `is_active !== false` | Fine | n/a | test-account-email-filter | **carry** |
| 1m | `src/pages/ThisMonth.jsx:1776-1782` users; `src/components/GuessThePicker.jsx:30-44` candidates | Guess-the-picker candidate list | email≠test only (**inactive included**) | Appears as a candidate for pre-Oct months if any are still guessable | n/a | picker-identity | **adapt** — candidates = expected members of that cycle (v2: "who submitted") |
| 1n | `src/lib/milestones.js:105-120` `memberAnniversaries` | Join-monthiversaries | `joined_at` date math | Fine | n/a | none | **carry** |
| 1o | `src/pages/Admin.jsx:2003-2010` invite; `:2163` activate/deactivate; users SELECT RLS (`20260604170000`) | Roster management | admins see inactive; members see active+self | — | — | none | **carry** |

Date-compare inconsistency worth fixing once: 1a/1i compare `YYYY-MM` strings; 1j compares `date_trunc('month')`; 1d/1e hardcode months. All are month-granular, so a member joining mid-cycle is "expected" for films already completed that month — v2 should compare `joined_at` to the **cycle start** (film-level).

---

## 2. Test-account email sites (41 lines / 25 files)

Categories: client-filter (CF), sql-function (SF), sql-view (SV), edge-function (EF), doc. There are **no sql-policy sites**. "live" = current definition; "superseded" = overwritten by a later migration (append-only history, no action).

| File:line | Category | Object / usage |
|---|---|---|
| `CLAUDE.md:23` | doc | spec note |
| `supabase/functions/ai-recap/index.ts:19` | EF | `TEST_EMAIL`; used `:166,:172` (excludes from scores, name-collision detection, reviews `:192,:208`) |
| `supabase/migrations/20260603200000_phase4_notifications_core.sql:31` | SF superseded | `notify_scores_revealed` |
| `…20260603200000…:48`, `:53` | SF **live** | `notify_month_status` |
| `…20260603200000…:76` | SF superseded | `notify_comment` |
| `…20260603200000…:94` | SF superseded | `notify_review` |
| `…20260605030000_rolling_reveal_engine.sql:134`, `:146` | SF **live** | `reveal_picker_when_month_complete` |
| `…20260605030000…:182` | SF superseded | `notify_scores_revealed` |
| `…20260605120000_notification_deep_links.sql:23` | SF **live** | `notify_scores_revealed` |
| `…20260605120000…:44`, `:60` | SF superseded | `notify_comment`, `notify_review` |
| `…20260605140000_notification_thread_anchor_links.sql:21`, `:37` | SF **live** | `notify_comment`, `notify_review` |
| `…20260607140000_guest_public_views.sql:48`, `:67`, `:82` | SV **live** | `guest_films` club_avg, `guest_scores`, `guest_reviews` |
| `…20260609000000_notify_late_score.sql:27`, `:38` | SF **live** | `notify_late_score` (actor + recipients) |
| `…20260609010000_notify_deadline_due_soon.sql:29` | SF **live** | `cron_notify_due_soon` |
| `…20260703000000_gate_auto_activation_on_complete_picks.sql:38`, `:49` | SF **live** | `month_picks_complete` |
| `src/pages/Admin.jsx:21` | CF | `TEST_USER_EMAIL` → `:32,:175,:178,:870,:2196,:2396` |
| `src/pages/Awards.jsx:2763` | CF | users + ratings + guesses `:2764-2775` |
| `src/pages/Films.jsx:1113` | CF | overlay ratings/users/predictions `:1114-1119` |
| `src/pages/Films.jsx:2877` | CF | wall scores + lookup `:2878-2881,:2928` |
| `src/pages/Home.jsx:317` | CF | users |
| `src/pages/Profile.jsx:621` | CF | `.neq('email', …)` **query predicate** (taken-colors) |
| `src/pages/Stats.jsx:4951` | CF | users + ratings `:5006-5020` |
| `src/pages/ThisMonth.jsx:1457` | CF | upcoming picks |
| `src/pages/ThisMonth.jsx:1782` | CF | users |
| `src/components/CommentThread.jsx:5` | CF | roster `:59`, `isTestAuthor :73` |
| `src/components/FilmTags.jsx:12` | CF | tag rows `:37` |
| `src/components/GuessThePicker.jsx:12` | CF | candidates `:34,:43` |
| `src/components/MemberStatsOverlay.jsx:13` | CF | users/ratings `:59-60` |
| `src/components/PickChangeRequest.jsx:13` | CF | requests `:197` |
| `src/components/ScoreChangeRequest.jsx:13` | CF | requests `:457` |
| `src/lib/awards.js:20` | doc (comment) | — |
| `src/lib/awards.js:32` | CF | exported `TEST_USER_EMAIL` → `sanitize :116` |
| `src/lib/exportData.js:380` | CF | `CLUB_TEST_EMAIL` → `:396` |
| **Live DB only** — `public.handle_new_auth_user()` (no repo file; not attached to any trigger) | SF orphan | allowlist incl. test email + placeholder member emails; **dead code** |

---

## 3. Edge functions

| Function | Does | Invoked by | 1.0 assumptions baked in | Verdict |
|---|---|---|---|---|
| `send-push` (`supabase/functions/send-push/index.ts`) | Stateless Web Push send; prunes 404/410 subs `:37-42` | `push_notification` DB trigger via pg_net on `notifications` INSERT | none (payload-agnostic) | **carry** |
| `streaming-fallback` (`…/streaming-fallback/index.ts`) | Claude web-search for US providers when TMDB empty; TMDB-shaped result | Client, film overlay `src/pages/Films.jsx:1078-1081` | none | **carry** |
| `ai-recap` (`…/ai-recap/index.ts`) | Admin-gated `:129-135`; gathers a month's films/scores/reviews with service role; Claude writes recap + Best Review → `month_recaps` upsert `:255-262`; generate-once unless `force` `:145-148` | `src/pages/Admin.jsx:658` (auto-gen for revealed months lacking a recap) and `:675` (force regenerate); rendered `MonthReveal.jsx:98`, Films History | (1) **month-as-unit**: keyed by `month_id`, one recap per month, label = raw `month_year` `:138,:217`; (2) **per-film-deadlines**: watch order = `order('scoring_deadline')` `:153-157`, prompt insists "Film 1 opened… last closed… never call a later film the opener" `:91,:99`; (3) **picker-identity**: `"picked by ${pickerName}"` from `picked_by_user_id` `:74,:201` — v2 has submitter *and* voters (C7); (4) **member count**: literal "private five-person movie club" `:90`; (5) **N-films-per-month** framing ("recap of the month", bookends) — awkward for a 1-film month; (6) "Everyone watches every film and scores it" `:91` — still true in v2; (7) **test-account-email-filter** `:19,:166,:172`; (8) club avg prefers `historical_avg_score` `:196-198` | **adapt** — recap per month still makes sense (D8 months contain 1..N films) but order by cycle sequence, describe submitter + winning vote, parametrize member count, read `is_test` |

---

## 4. Calendar-month assumptions (D8: months may start late / drift)

`months.month_year` ('YYYY-MM') serves three roles: **ordering key**, **display label**, and **date source**. Under D8 the first two survive if v2 months keep a nominal YYYY-MM name; everything that *derives dates or membership* from it must change.

| Site | What it assumes | Assumption | Verdict |
|---|---|---|---|
| `activate_month` (live `20260703000000:72-209`): `active_date` default `month_year||'-01'` `:89`; deadline split over days-in-month `:174-179`; next month = +1 calendar month `:182-189`; season lookup = 1st-of-month between season dates `:184-185`; readjustment auto-open when month == season's first month `:192-207` | Month = calendar month; one active + one upcoming | calendar-auto-activation, per-film-deadlines, month-as-unit, upcoming_picks | **retire** for v2 months (guard on `mode='v1'`); v2 needs its own "open next month" that assigns season by *actual* start date |
| `cron_auto_activate_due_months` `:215-234` | due = `active_date <= today PT` | calendar-auto-activation, completeness-gate | **retire** (guard) |
| `month_picks_complete` `:39,:50`; `reveal_picker_when_month_complete` `20260605030000:135,:147` | `joined_at` month ≤ `month_year` | month-as-unit | **adapt** → compare to cycle start |
| `notify_month_status` `20260603200000:43` | label `to_char(month_year||'-01','FMMonth YYYY')` | month-as-unit | **carry** if v2 months keep a YYYY-MM name; body copy "New films to watch this month" → adapt |
| `upcoming_picks.month_target` = `month_year` text, unique `(user_id, month_target)` (`ThisMonth.jsx:700-717`, `Home.jsx:274`, `Admin.jsx:153-161`) | One pick per member per calendar month | one-pick-per-member, upcoming_picks | **retire** (submissions table keyed by round) |
| `Admin.jsx:52-56` `joinedByMonth`; `:291` active_date default; `:2407-2411` sort | string compare / date derive | month-as-unit | adapt / retire / carry |
| `Films.jsx:34-47` `sortMonthsDescending` + `formatMonthYear`; History pills `:2591-2595` (`status in active,revealed`, order `month_year` desc); wall `:2859-2868,:2905-2909` | order + label from `month_year`; films grouped by `month_id` | month-as-unit | **carry** (ordering/label) — but History becomes "months containing 1..N cycles"; within-month order must become cycle sequence, not `scoring_deadline`/`created_at` |
| `Home.jsx:109-112,:260,:267`; `ThisMonth.jsx:48-51,:66,:1436-1439,:1769-1772,:1868-1873` | "latest active/upcoming by month_year"; label parse (`-02` trick) | month-as-unit, calendar-auto-activation | **adapt** — "current" should come from the v2 round state, not `month_year` order |
| `Stats.jsx:902-911` `seasonForMonthYear` (quarter from month number); grouping/sorting `:1655-1676,:2303-2308,:3466-3488,:3635,:3672` | Season derivable from month number; per-month trend points | month-as-unit | **carry** ordering; **adapt** season derivation to `months.season_id` (a late-starting month could be assigned by actual start date) |
| `Awards.jsx:228-236,:255-262` (hardcoded 2026-Q1), annual scope `:2333-2356` (`month_year.startsWith(year)`), `awards.js:147,:181` period label | Year = first 4 chars; monthly awards per month | month-as-unit, N-films-per-month | **adapt** (G1 monthly redesign; era boundary E12 = `month_year >= '2026-10'` or better `months.mode`) |
| `Guest.jsx:32-37`, `exportData.js:39-49,:401`, `Profile.jsx:1273-1274` | label only | month-as-unit | **carry** |
| `milestones.js:20,:42-44` | real calendar dates for anniversaries (unrelated to `months`) | none | **carry** |

---

## 5. Onboarding / user creation today

| Step | Where | Behavior |
|---|---|---|
| Sign-in | `src/pages/Login.jsx:9-20` → `/auth/callback` (`AuthCallback.jsx:11-31`) → `/` | Google OAuth only |
| DB auto-provision | **live DB, not in repo**: trigger `on_auth_user_created` AFTER INSERT ON `auth.users` → `public.handle_auth_user_created()` (SECURITY DEFINER, `row_security off`) | Looks up `public.users` by email. **Pre-created row with different id** → re-points `user_id` across ratings, upcoming_picks, month_absences, score_change_requests, picker_guesses (both cols), score_predictions (both), film_tags, auteur_votes, season_rankings, awards, `movies.picked_by_user_id`, then sets `users.id = auth id`. (Does *not* touch reviews/comments/reactions/votes/notifications/prefs/push/watchlist/draft_queue/pick_change_requests/veto_votes — fine for a fresh invite only.) **No row** → inserts `{role member, is_active false, joined_at now()}`. |
| Client fallback | `src/context/AuthContext.jsx:69-118` | Reads by id; else by email and calls `claim_invited_user` (`20260604200000_admin_invite_users.sql:20-36`) — redundant with the trigger, harmless |
| Gate | `src/App.jsx:33-86` `RequireAuth` | no session → `/login`; profile null or `is_active === false` → `/not-approved` (`NotApproved.jsx`: "waiting for admin approval"); transient error → Retry |
| Approval | `src/pages/Admin.jsx:2163-2165` toggle `is_active` | Admin flips the auto-created inactive row |
| Pre-invite | `Admin.jsx:1990-2024` form → `users.insert {name, email, is_active: true, role, joined_at, has_completed_onboarding: false}`; policy "admins can insert users" `20260604200000:13-14`; `id` default `gen_random_uuid()` `:10` | Note: the form hardcodes `is_active: true` |
| Tour | `src/components/GuidedTour.jsx:55,:81` | opens while `has_completed_onboarding=false`; sets true |
| Roles | op-only via `trg_enforce_op_role` (`20260603130000`) | — |
| Live `users` columns | `joined_at` is **`date`** (default `CURRENT_DATE`); no `is_test` column exists | — |

---

## (a) Recommended shape of the `users.is_test` refactor

**Let the database own the rule; leave the client with one helper and zero email strings.**

1. **One additive migration**: `alter table users add column is_test boolean not null default false`; `update users set is_test = true where email = <test>` (the last time the address appears in SQL, as data). Then, in the same migration, **redefine the 8 live objects** to use `not u.is_test`: `notify_scores_revealed`, `notify_month_status`, `notify_comment`, `notify_review`, `reveal_picker_when_month_complete`, `month_picks_complete`, `notify_late_score`, `cron_notify_due_soon`, and the three `guest_*` views (`create or replace` — R1-safe; superseded historical copies untouched). Optionally drop the orphan `handle_new_auth_user()` (dead, live-DB-only).
2. **Centralize the membership predicate in SQL**: `public.expected_members(p_month_id)` (later: `p_movie_id` for v2 cycles) = `is_active ∧ not is_test ∧ joined_at ≤ cycle/month start ∧ not absent`. `month_picks_complete` and `reveal_picker_when_month_complete` call it; expose it as an RPC so the Admin matrix (1a–1c), the picker-guess candidates (1m), the veto denominator (1h) and ai-recap use the *same* answer. This collapses the six divergent implementations and retires both Zack name-hacks (his `joined_at` already handles it).
3. **Client**: every `users` select adds `is_test`; a single `src/lib/members.js` (`isTestUser(u)`, `clubUsers(list)`, `testUserIds(list)`) replaces the 18 CF sites. The 12 roster-filter sites become `clubUsers(...)`; the 6 row-filter sites (Stats:5007, Awards:2765, Films:2878, MemberStatsOverlay:60, exportData:396, awards.js:118) become `testUserIds(...)`. `Profile.jsx:621` becomes `.eq('is_test', false)`. Going further (hiding test rows via the `users` SELECT RLS) is *not* recommended: joined rows would come back with null `users` and the test account must still read its own row to pass `RequireAuth`.
4. **Edge**: `ai-recap` selects `is_test` and drops `TEST_EMAIL` (`:19,:166,:172`).

Net: 41 sites → 1 data update + 1 SQL predicate + 1 client helper + 1 edge column read.

## (b) Exact steps to add Mike

1. **Decide timing (open question 5).** Creating the row now with `is_active = false` makes him invisible everywhere (users SELECT RLS hides inactive from members; Stats/Awards/MemberStatsOverlay query `.eq('is_active', true)`; every notification fan-out filters `is_active`) and is flipped to `true` at cutover via `Admin.jsx:2163`. Creating him active now means he immediately (i) receives Aug/Sep notifications and (ii) is an *expected picker* for any v1 month with `month_year >= '2026-10'` — `month_picks_complete` would wait on his pick (mitigation: a `month_absences` row, which currently requires SQL since there is no UI).
2. **Create the row** via Admin → Members → invite (`Admin.jsx:1990-2010`): name, his email (never in the repo — E11; record it in `PRIVATE.md`), role `member`, **`joined_at = 2026-10-01`** (any October date works for the month-granular compares, but the 1st is exact and reads "Member since October 2026"). The form forces `is_active: true`, so click Deactivate immediately if pre-creating inactive; or insert directly with the service role.
3. **First sign-in** does the rest: `handle_auth_user_created` reconciles the placeholder id to his auth uid (the client `claim_invited_user` is the backup); `has_completed_onboarding=false` fires the GuidedTour.
4. **Pre-Oct exclusion is automatic** — Admin matrix (`joinedByMonth`), `month_picks_complete`, `reveal_picker_when_month_complete`, milestones all key off `joined_at`. **No Zack-style code is needed** *unless* he backfill-scores a pre-Oct film; then generalize the Stats/Awards Zack filters to `joined_at` (the refactor in (a)-2 does this anyway).
5. **Six-member consequences to touch**: `ai-recap` "five-person" literal (`index.ts:90`); veto = `app_settings.veto_threshold` 3 → now 3-of-6 (retune or derive); `MEMBER_COLORS` static map (`src/lib/colors.js:13` — optional, `user_color` covers it, picker strikes out taken colors); `CLAUDE.md`/`PRIVATE.md` member lists; the `awardCalcs`/`awardsExtended` test rosters assume 5.
6. **Era boundary**: his `joined_at` coincides with E12's Oct-2026 boundary, so "films picked per member" for Mike is v2-only by construction; nothing to special-case.
