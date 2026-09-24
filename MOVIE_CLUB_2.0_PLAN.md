# Movie Club 2.0 — High-Level Plan

> Companion to `MOVIE_CLUB_2.0.md` (the *what* and the decisions). This is the *how*.
> Grounded in four codebase inventories under `docs/2.0-inventory/` (ui-surface, db-layer,
> awards-stats, membership-identity) and a live-project audit. Nothing here is built.
> Status legend: ❌ not started · 🔄 in progress · ✅ done

---

## 0. Summary

2.0 is built **additively beside 1.0 in the same database**, with a `mode` discriminator on
`months` and one app-level switch (`app_settings.club_mode`). 1.0's machinery is never dropped —
it is **scoped to `mode='v1'`** so the revert is a flag flip (R1). Films, ratings, reviews, users
and seasons are shared by both eras, which is what era-aware history needs (E12).

The 2.0 engine is small: **three new tables** (`submissions`, `elections`, `ballots`+`ballot_ranks`),
**one new absence table** (`cycle_absences`), **one membership kernel** (`expected_members()`),
and a handful of `SECURITY DEFINER` RPCs/triggers that move a month through
*collecting → voting → watching → between films → closed*. Everything else is adaptation of
surfaces that already exist — which is why the parity audit (R2) is the largest phase, not the
engine.

Six phases: **0 Foundation → 1 Engine → 2 Surfaces → 3 Parity audit → 4 Cutover → 5 Debt.**
Phase 0 ships to prod with zero behavior change and is the prerequisite for everything else.

---

## 1. What the inventories changed about the plan

Findings that materially altered the approach (details in `docs/2.0-inventory/`):

| Finding | Consequence |
|---|---|
| **Migration drift**: prod has 80 applied migrations, the repo 57. The entire Phase-1 schema (users, months, movies, ratings, `movies_safe`, base RLS, the auth trigger) exists only in the live DB. | Phase 0 starts with a **schema baseline** (`supabase db pull`). Without it, "additive migration" has no trustworthy base and no branch can be created from the repo. |
| `handle_auth_user_created` (live, not in repo) UPDATEs `auteur_votes` and `season_rankings`, which **do not exist**. | Pre-creating Mike's row and letting him sign in would fail with `undefined_table`. Fix in Phase 0 before onboarding anyone. |
| The "who counts as a member right now" rule is **re-implemented 6×** (2 SQL, 4 client) with 3 different date comparisons and 2 Zack name-hacks; only 1 of 6 consults absences; the picker-reveal trigger ignores absences. | One SQL kernel `expected_members()` replaces all six. It is also exactly what B5 (mark absent), B7 (last-score reveal) and Mike need. |
| `month_absences` has **zero client references** and is month-scoped. | B5 is net-new: a per-film `cycle_absences` table + admin UI. |
| The test-account filter is inlined 41× (18 client / 1 edge / 21 SQL, 15 of them live) plus a 42nd orphan in the live DB. | `users.is_test` + one migration redefining 9 functions + 3 views + one client helper. Rides with the audit. |
| `activate_month` demotes *any* other active month, stamps deadlines on *all* films in the month, and spawns the next month with `auto_activate=true`. | It must refuse to run when either the target or the currently-active month is `v2`. And the 2026-10 row it would auto-create must be flipped to `v2` before it exists (see cutover). |
| Six pages find "the current month" via `status='active'`; Films/Stats gate on `status<>'upcoming'`; awards never read deadlines. | **Reuse the status vocabulary** (`upcoming/active/revealed`) for v2 months. Most read surfaces then keep working untouched. |
| The monthly awards tier is degenerate at 1–2 films; `writeAwardsToDb` never deletes rows. | Per-film reframe with thresholds + new voter-era awards (G1); scope the monthly loop by `mode`; delete rows for retired keys. |
| `movies_safe` is readable by `anon` (pickers still masked). `votes` already exists (review up/down). CLAUDE.md documents `upcoming_picks.month_id`; the column is `month_target`. | Revoke anon on `movies_safe`. Name the 2.0 voting table **`ballots`**. Fix the doc. |

---

## 2. Architecture

### 2.1 Coexistence and the switch (R1)

- `months.mode text not null default 'v1' check (mode in ('v1','v2'))` — which lifecycle governs
  each month. The era marker for stats (E12).
- `app_settings.club_mode` — which flow the *current-round* UI serves (This Month, Home "Your Turn",
  Admin controls). Read into a `ClubModeContext`. Read-only pages (Films, Stats, Awards, History)
  don't need the switch — they branch per month on `months.mode`.
- **Every 1.0 lifecycle object gets a `mode='v1'` guard by redefinition, never a `DROP`:**
  `activate_month` (target *and* current-active must be v1), `cron_auto_activate_due_months`,
  `cron_enforce_due_deadlines`, `cron_notify_due_soon`, `month_picks_complete`,
  `reveal_picker_when_month_complete`, `notify_veto_threshold`/`resubmit_vetoed_pick`,
  `notify_pick_change`, `notify_late_score` (copy). The client-soft `autoActivateDueMonths()` is
  covered by the RPC guard.
- **Revert = `club_mode='v1'`.** v2 tables stay, inert. Films watched under v2 remain in `movies`.
  A **revert drill** on the preview environment is a Phase 4 exit criterion.

### 2.2 Data model (additive)

```
months          + mode, theme, submissions_close_at, started_at
                  (status reused: upcoming=collecting · active=in play · revealed=closed)

submissions     id, month_id, user_id, tmdb_id, title, poster_url, metadata jsonb,
                justification, submitted_at, withdrawn_at
                unique(month_id,user_id,tmdb_id) where withdrawn_at is null
                trigger: ≤2 live rows per (month,user)           -- rule 2
                metadata = same shape as upcoming_picks.metadata  -- reuse materialization

elections       id, month_id, sequence, status(open|closed), opened_at, closed_at,
                winner_submission_id, movie_id, tie_broken_randomly, tally jsonb (frozen)
                unique(month_id,sequence)                          -- one per elected film

ballots         id, election_id, user_id, submitted_at; unique(election_id,user_id)
ballot_ranks    ballot_id, submission_id, rank 1..3; unique(ballot_id,rank), unique(ballot_id,submission_id)

cycle_absences  movie_id, user_id, marked_by_admin_id, reason, created_at; unique   -- B5

movies          + election_id, submission_id (nullable FKs); scoring_deadline NULL for v2
                picked_by_user_id = the SUBMITTER  → movies_safe masking + guess-the-picker
                keep working unchanged (C6/C6b).  ⚠ new columns must be added to the
                column-grant list or members can't read them.

app_settings    + club_mode
```

**Anonymity (C6/C6b/C7/C7b):** `submissions_safe` and `ballots_safe` are definer views that
expose `user_id` only when the linked film's `picker_revealed` is true (or viewer is admin, or it's
the viewer's own row). Base tables get column-level grants like `movies` already does. Non-winning
submissions in a closed month are revealed with the month (decision needed — see §6).

### 2.3 The round state machine (per v2 month)

```
upcoming ──close_submissions (cron at submissions_close_at, or admin)──▶ active
                                                                          │
     ┌──────────────────────── active ─────────────────────────────────┐  │
     │  election OPEN ──all expected members balloted──▶ film WATCHING │◀─┘
     │       ▲                (Borda 3/2/1, tie→random, materialize)   │
     │       │                                                          │
     │   admin "next vote"      all expected members scored ──▶ BETWEEN FILMS
     │       └──────────────────────────────────────────────────┘  │
     └─────────────────────────────────────────────── admin "close month" ──▶ revealed
```

- **Rule 1** is structural: no election can open while a film is unrevealed.
- **Voting closes itself** the moment the last expected member ballots (A2). Admin can force-close.
- **The film reveals itself** the moment the last expected member scores (B4/B7): `scores_revealed`
  + `picker_revealed` flip together → submitter and ballots become visible (C6b/C7b) → broadcast.
- **Absence** (`v2_mark_absent`) removes a member from `expected_members()` for that film and
  re-evaluates completion — if they were the last blocker, the film reveals.
- **Closing the month** withdraws the remaining submissions (D9), sets `revealed`, and creates the
  next v2 month (`mode='v2'`, `auto_activate=false`, no dates) — the people-gated analog of
  `activate_month`'s next-month step. Season assignment uses `started_at`, not the calendar (D8).

### 2.4 Engine surface (all `SECURITY DEFINER`, all mode-checked)

| Object | Role |
|---|---|
| `expected_members(p_movie_id)` / `(p_month_id)` | **The kernel.** active ∧ not `is_test` ∧ `joined_at` ≤ cycle start ∧ not absent. RPC-exposed; consumed by every trigger below, the Admin matrix, guess candidates, ai-recap. |
| `v2_submit(month, tmdb…)` / `v2_withdraw` | Rule 2/6 enforcement; TMDB enrichment reused from the pick flow. |
| `v2_close_submissions(month)` | Locks the list (rule 5), `status→active`, opens election 1. |
| `v2_open_election(month)` | Next `sequence`; candidates = live, not-yet-elected submissions. Refuses if a film is unrevealed. |
| `v2_cast_ballot(election, ranks[])` | Validates (≤3, distinct, in-election); upsert; auto-closes when complete. |
| `v2_close_election(election)` | Borda tally → random tiebreak (recorded) → materialize winner into `movies` (factor `activate_month`'s metadata mapping into a shared `materialize_submission`) → freeze `tally`. |
| `trg_v2_on_score` on `ratings` | Per-film completion → reveal + broadcast. Sibling of `reveal_picker_when_month_complete`, which is guarded off for v2. |
| `v2_mark_absent(movie, user)` | Admin; inserts `cycle_absences`; re-evaluates completion. |
| `v2_close_month(month)` | Withdraw leftovers, `status→revealed`, spawn next v2 month, readjustment auto-open on season boundary. |
| `broadcast_reveal` | Extend to `elections` + `submissions` state changes so `RevealBus` repaints every client. |
| Notification types | `submissions_open`, `vote_open`, `film_elected`, `waiting_on_you`, `film_revealed`; mute rows + glyphs. |

Borda is pure SQL and gets a unit-test fixture (ties, <3 candidates, absent voters).

---

## 3. Phases

### Phase 0 — Foundation 🔄 *(prod-safe; zero behavior change; prerequisite for all else)*
1. ❌ **Schema baseline.** Laptop-side: `pg_dump --schema=public` + `supabase/baseline_addendum.sql`
   (auth trigger, `ensure_rls`, cron jobs) → `20260924000000_baseline_v1.sql`; archive the 57
   historical files; `supabase db diff --linked` must be empty. Procedure: `supabase/BASELINE.md`.
   *(Blocked on the laptop: the cloud container cannot open a raw Postgres connection.)*
2. ✅ SQL / 🔄 client **`users.is_test`** — `20260924010000` (column, data, 5 functions, 3 views,
   orphan `handle_new_auth_user` dropped). Client `src/lib/members.js` + 18 sites + `ai-recap`: in progress.
3. ✅ SQL / 🔄 client **`expected_members()` kernel** — `20260924020000`. Client Zack name-hacks → `joined_at`: in progress.
4. ✅ **Fix `handle_auth_user_created`** — `20260924020000`. Was broken twice (non-existent tables;
   children re-pointed before the parent row existed under NO ACTION FKs). Now insert-new → move
   children over every FK dynamically → delete placeholder.
5. ✅ **Mode plumbing + guards** — `20260924030000`: `months.mode/theme/submissions_close_at/started_at`,
   `app_settings.club_mode`, guards on `activate_month`, 3 crons, `month_picks_complete`, picker
   reveal (now absence-aware), veto. Validated end-to-end against prod in an aborted transaction.
6. ✅ SQL / 🔄 client Side fixes: `anon` grants revoked (`20260924030000`); CLAUDE.md doc fixes done;
   duplicate `GuessThePicker`: in progress. Bonus: latent `resubmit_vetoed_pick` text→text[] bug fixed.
7. ❌ **Dev isolation** — decided: local `supabase start` on Ryan's always-on laptop (H2). Needs
   Docker + Supabase CLI + repo clone there, and either Remote Control or Tailscale onboarding on a
   new cloud environment for me to drive it.
8. ❌ **Prod apply** of 010000/020000/030000 — *checkpoint; ask first.* Independent of step 1's
   baseline (they are additive against the live schema).

*Exit:* baseline diff empty on the laptop; prod behaves identically after apply; `club_mode='v1'`.

### Phase 1 — Engine ❌ *(DB only; on the branch)*
Tables + RLS + column grants + definer views (§2.2) · the RPCs and triggers (§2.4) · Borda fixture ·
broadcast events · notification types. Parallelizable in three lanes: (a) tables/RLS/views,
(b) election/ballot RPCs + tally, (c) completion/absence triggers + broadcasts + notifications.

*Exit:* a scripted end-to-end round (submit → close → ballot → elect → score → reveal → next vote →
close month) passes on the branch with 6 simulated members, including an absence and a tie.

### Phase 2 — Surfaces ❌ *(UI; on the preview deploy)*
- **This Month v2** — rewritten as the state machine: Submissions (0–2, editable, anonymous, draft-queue
  quick-pick) → Ballot (rank top 3) → Now Watching (one hero film + "waiting on …" roster) → Cycle
  reveal (submitter, ballots, tally) → repeat. Nothing in the current page maps 1:1.
- **Home "Your Turn" v2** — four people-gated states: submit / vote / score / waiting-on-X.
- **Admin v2** — round controls (close submissions, open vote, force-close, close month),
  **mark-absent UI** (net new), candidate-pool preview (admin-only, anonymous to members).
- Films History: within-month order = election sequence. Copy + GuidedTour mode-aware.
Parallelizable by surface (This Month · Home · Admin · Films/History · notifications/copy).

*Exit:* a real 6-person dry run on the preview deploy completes one full round.

### Phase 3 — R2 parity audit ❌ *(the largest phase)*
The four inventories are the input; the output is a **verdict table with evidence** for every
feature. Shard mirrors the inventories: UI surface · DB layer · awards+stats · membership/edge.
Each item: **works?** (exercised on the preview deploy against a v2 month) and **makes sense?**
Known rework inside this phase:
- Awards: per-film monthly tier with thresholds; new voter-era awards (Kingmaker, Curator's Win
  Rate, Buyer's Remorse, Contrarian Voter…); scope the monthly loop by `mode`; delete stale rows.
- Stats: era-split the five `picked_by`-keyed stats; retire the month-keyed degenerates
  (avg-per-month, scoring streaks); submissions-by-genre as the richer v2 curation signal.
- Guess-the-picker → "who submitted it"; score predictions → submitter predicts (or scope off).
- `ai-recap`: order by election sequence, describe submitter + vote, parametrize member count.
- Guest views, export, notification copy, `late_score` semantics.

*Exit:* every inventory row has a verdict + evidence; no "carry" is unexercised.

### Phase 4 — Cutover ❌
1. **Close the v1 era.** August: bulk-reveal once scoring is done. September (empty v1 `upcoming`,
   will never pass the v1 gate): delete the row.
2. **Create October** as the first v2 month: `mode='v2'`, theme *Halloween/Horror*,
   `auto_activate=false`, `submissions_close_at` per the club.
3. **Add Mike** via the fixed onboarding path: `joined_at=2026-10-01`; pre-Oct exclusion is automatic.
   Six-member ripple: `ai-recap` "five-person" literal, veto threshold, static color map, test rosters.
4. **Revert drill on preview**: run a v2 round → flip `club_mode='v1'` → verify 1.0 flows work and no
   v1 cron touches the v2 month → flip back. *Required before prod.*
5. Merge the branch; flip `club_mode='v2'` in prod; watch the first round.

### Phase 5 — Debt ❌
Git-history purge decision for the test address (needs a force-push of a public repo); docs
congruence pass (spec → CLAUDE.md → PLAN.md); test suite for the engine; retire dead code
(`handle_new_auth_user`, `_monthYear`).

---

## 4. Parallel-agent map

| Phase | Lanes | Coordination |
|---|---|---|
| 0 | mostly sequential (baseline first) | one agent + reviewer |
| 1 | tables/RLS · RPCs+tally · triggers/broadcast | shared DDL contract from §2.2 first |
| 2 | This Month · Home · Admin · History · copy/notifications | shared `ClubModeContext` + engine RPC signatures first |
| 3 | the four inventory shards | one rubric, one verdict-table format |
| every phase | adversarial reviewer pass (repo precedent: 6-agent review) | — |

---

## 5. Risks

- **Rule 1 deadlock.** One unresponsive member halts the club with no date to fall back on. Mitigation
  is B5 — make "mark absent" one tap, and nudge (`waiting_on_you`) before the admin has to act.
- **Automation misfire across the mode boundary** — the entire July/August incident class. Mitigation:
  guards in Phase 0, the revert drill in Phase 4, and no v1 cron ever unscheduled (so revert is real).
- **Baseline correctness.** If the pulled baseline disagrees with prod, every later migration is
  suspect. Mitigation: apply the baseline to a fresh branch and diff against prod before Phase 1.
- **Scope creep in Phase 3.** The audit is where "just one more award" lives. Mitigation: verdict
  first, redesign second; new awards are a list, not a gate.

---

## 6. Open decisions (need Ryan)

From `MOVIE_CLUB_2.0.md` §5 (still open): **Q1** submission deadline hard-locks (rec: yes, cron at
`submissions_close_at`) · **Q2** re-vote with <3 candidates (rec: rank all; 1 candidate auto-elects)
· **Q3** tally hidden until close (rec: hidden) · **Q4** scoring model unchanged (rec: yes) ·
**Q5** Mike timing (rec: after the trigger fix, at cutover).

New, surfaced by the inventories:
- **N1 Same film submitted twice in one round?** Rule 3 only covers *across* rounds. Rec: no — the
  second submitter sees "already on the list"; one submitter per film keeps `picked_by_user_id`,
  guess-the-picker and predictions single-valued.
- **N2 Who opens the next vote / closes the month?** Rec: admin one-tap with a nudge, since rule 1's
  spirit is that the *club* decides to continue or stop.
- **N3 Score predictions in v2** — submitter predicts the others, or scope off? Rec: keep (the
  submitter championed it).
- **N4 Veto** — incoherent against a vote-elected film. Rec: scope off for v2.
- **N5 Non-winning submissions' anonymity** — revealed at month close, or never? Rec: at month close
  (feeds "Never Say Die" and submissions-by-genre).
- **N6 August closure** — bulk-reveal now, or wait for the remaining scores? Rec: wait; it gates nothing.

---

## 7. Checkpoints where I will stop and ask

Plan approval → branching cost approval → Phase 0 prod apply → each phase exit → open decisions
above as they become blocking → the revert drill result → the prod flip → any merge to `main`.
