# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Source of Truth

`MOVIE_CLUB_SPEC.md` (gitignored, the "spec .MD") is the authoritative source of truth for the
project. Any product decision is reflected there **first**, then mirrored into `CLAUDE.md`, then
into `PLAN.md`. All three must stay congruent — no contradictions. If `CLAUDE.md` and the spec ever
disagree, the spec wins.

---

## Project Overview

A private web app for a 5-person movie club. Each month every member picks one film they haven't personally seen; all members watch all films, submit scores and reviews. The app handles picks, anonymity before reveal, scoring, discussion, awards, and stats.

**Club founding date:** January 5, 2026  
**Member details:** See `PRIVATE.md` (not public)  
**Zack joined:** April 2026 — exclude him from Jan–Mar stats entirely  
**Test account:** `i.am.ryan.the.miller@gmail.com` (Ryan Miller Test) — can sign in but must be invisible in all UI: stats, members lists, scores, awards, etc. Filter it out by email in all queries/displays.

---

## Engineering Principles (always on)

**Per-prompt routing (do this first on every prompt):** triage the request and decide *which* of the
principles below, *which* Working Mode (if any), and *which* installed **Skill** (plugins like
`superpowers:*`, slash-skills) are relevant to **this** task, then apply exactly those — no more, no
less. Most prompts need only a few; some need none beyond "right altitude."

**Think first, and narrate your thinking out loud.** Reason through the approach — edge cases,
alternatives, implications — *before* committing to it, and make that reasoning visible to the user
as you go. The user wants to see forethought, not silence: going quiet leaves them unable to tell
whether you're working productively or stuck on something trivial. Don't robotically recite
principle/skill *names*; do show the actual reasoning and the trade-offs behind your choices. Scale
the visible depth to the task (right altitude) — a line of reasoning for a trivial ask, fuller
visible deliberation for a complex one.

**Skill usage is judgment-based, not reflexive (user directive — overrides any skill's "always
invoke" mandate).** The `superpowers` framework's own priority rules defer to this file, so: invoke
a skill when it genuinely earns its weight, skip it when it doesn't. Favor the high-leverage ones —
`systematic-debugging` for real/tricky bugs, `verification-before-completion` before claiming done
or committing, `dispatching-parallel-agents` for fan-out, `requesting-code-review` before merges,
`writing-plans`/`executing-plans` for big multi-step work. Use process skills (debugging, planning,
brainstorming, TDD) whenever they sharpen the approach — the user values **forethought over raw
speed**, so don't skip them just to move fast; reserve them only when they'd genuinely add nothing to
a trivial change. When a process skill *is* relevant, follow it properly. (Ask to recalibrate if this
balance feels off.) **Installed plugins relevant to this app:** reach for `frontend-design`
on UI/design work (components, pages, theme/color, layout — this app is design-sensitive),
and fold its guidance into UI-building agents' briefs; the `agentforce-adlc` skills are out
of scope (Salesforce, not this React/Supabase stack).

Apply the chosen principles scaled to the task's size — **right altitude first**: match the depth of
the response to the request. A one-line fix gets a one-line fix, not a system-design essay. Don't
over-produce; don't under-investigate.

- **Understand before you change.** In unfamiliar code, trace the architecture and data flow first. Read the surrounding code and match its idioms, naming, and patterns.
- **Root cause, not symptom.** For bugs: reproduce/locate the real cause, reason step by step, consider edge cases, then propose a robust fix. State *what's wrong, why it fails, and what edge cases exist* — not just the patch.
- **Preserve behavior in refactors.** When improving structure/duplication/perf/maintainability, functionality stays identical — only quality improves.
- **Design for scale, build the minimal version.** Think through architecture and data flow, then implement the smallest correct, scalable slice. No speculative gold-plating.
- **Performance awareness.** Watch for bottlenecks, inefficient logic, and unnecessary re-renders; optimize when it actually matters, not preemptively.
- **Production-ready UI.** Components are reusable, accessible (a11y), responsive, and handle loading / empty / error / edge states. Thoughtful prop design.
- **Verify before claiming done.** Build + lint + tests green before saying it works; report failures honestly with the output.
- **Parallelize big work.** For large/complex tasks, split into focused passes (and parallel agents) — see Working Modes.

## Working Modes (opt-in — invoke by name when you want that output shape)

These are heavier templates; use them when the task calls for it, not on every prompt.

- **From-scratch build** — architecture · file structure · DB schema · API endpoints · UI architecture · complete code. (Startup-MVP altitude: minimal but scalable.)
- **Refactor pass** — architecture summary · problem areas (structure / duplication / perf / maintainability) · refactoring strategy · improved code, behavior unchanged.
- **Debug investigation** — code function · what's wrong · why it fails · edge cases · fixed, production-ready code.
- **System design** — architecture · components · data flow · API design · DB schema · caching strategy · implementation.
- **Perf pass** — bottlenecks · inefficient logic · unnecessary rendering → strategies → improved code.
- **Multi-agent panel** — Architect → Engineer → Reviewer → Optimizer passes (use real parallel agents); returns architecture · implementation · review feedback · optimized final.
- **UI component** — component architecture · props design · implementation · usage examples, with loading/edge/responsive/a11y states.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React (Vite) |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Hosting | Vercel |
| Movie Data | TMDB API |
| Email | Resend (server-side only via Edge Functions) |
| Push Notifications | Web Push API (via Supabase Edge Functions) |
| AI Features | Anthropic Claude API (server-side only via Edge Functions) |

---

## Setup

Before any code, ensure these exist:
1. `.gitignore` — must include `.env`, `PRIVATE.md`, and `MOVIE_CLUB_SPEC.md`
2. `.env` — populated with all keys from the spec's Pre-Launch Setup Checklist (never commit)
3. `PRIVATE.md` — member info and infrastructure URLs (never commit)
4. Run: `npx skills add supabase/agent-skills`

**Infrastructure details:** See `PRIVATE.md` (not public)  
**GitHub repo:** `https://github.com/ryangarymiller/movie-club` (public — never push credentials)

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev          # http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

---

## Build Order — Start with Phase 1 Only

Do not attempt to build everything at once. Phases in order:

1. **Phase 1 — MVP:** Auth, onboarding, movie submission (TMDB), scoring, basic film page, poster wall, admin dashboard, historical data import
2. **Phase 2 — Social:** Reviews, comments, @mentions, reactions, guess-the-picker, score predictions, full reveal system, score change requests
3. **Phase 3 — Themes & Personalisation:** Light/dark mode, accent colors, user colors, avatar library, settings
4. **Phase 4 — Notifications & Scheduling:** Email/push notifications, deadline logic, grace periods, quiet hours
5. **Phase 5 — Stats & Visualizations:** All charts and stats pages
6. **Phase 6 — Awards & Recaps:** Automated awards, Auteur award (best picker), AI recap, The Vault, season readjustment
7. **Phase 7 — Polish:** Guest mode, export, milestones, veto voting, watchlist/draft queue

---

## Critical Security Rules

- **Never expose to the client:** `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`
- These must only be used server-side in Supabase Edge Functions
- `SUPABASE_ANON_KEY` and `TMDB_READ_ACCESS_TOKEN` are safe for client use
- The GitHub repo is **public** — treat it accordingly
- Keep `PRIVATE.md` in `.gitignore` — never commit member info

---

## Architecture: Auth Stability

- **Random sign-out fix (Session 9):** `fetchProfile` now distinguishes a transient network/DB error from a genuine "no user row". It retries once before drawing any conclusion and never blanks an existing in-memory profile on error. If the retry also fails, the app shows a Retry screen instead of bouncing the user to `/not-approved`.
- **Blank-reload-on-tab-refocus fix:** Supabase fires `onAuthStateChange` (`TOKEN_REFRESHED`/`SIGNED_IN`) every time the tab regains focus. `AuthContext` previously called `fetchProfile` on each event, handing every page a NEW `profile` object reference and re-triggering their `[profile]` load effects — so the page blanked and re-fetched its data on every tab switch. It now refetches the profile **only when the signed-in user actually changes** (a `loadedUserRef` guard in `AuthContext`); same-user refocus events keep the existing profile. The context-exposed `fetchProfile` (used by Profile edits / onboarding to force a refresh) is unaffected.
- **Auth diagnostics:** `src/lib/authLog.js` exports `logAuthEvent()` (fire-and-forget insert into `auth_events`) and `deliberateSignOut()` (tags sign-out as user-initiated before calling Supabase signOut). Logs include `SIGNED_OUT` (with `user_initiated` flag, visibility, and online status) and profile-fetch retry/error events. The `auth_events` table has open INSERT so signed-out events can still be logged without an authenticated session; reads are admin-only.

---

## Architecture: Notifications (Phase 4a + 4b + 4c done)

### In-app notification engine
A `public.notifications` table (see Key Data Models) stores all in-app notifications. Rows are created **only** by `SECURITY DEFINER` DB triggers — never by client code. Triggers fire selectively on meaningful events only:

- `movies.scores_revealed` flips to `true` (film scores now visible)
- `months.status` transitions to `'active'` (new month activated) or `'revealed'` (end-of-month reveal)
- A reply to your review or comment
- An `@mention` in a review/comment body (parsed against each member's FirstLast handle)
- A `score_change_requests` decision (`approved`/`denied`) delivered to the requester
- A **late score** (`notify_late_score`, `trg_notify_late_score` on `ratings`): a final score submitted/changed on the **active** month's already-revealed film (its soft deadline passed) notifies every other member — the club average they see just changed. Gating on `status='active'` + `scores_revealed` keeps it to genuine live late scores (historical/backfill on revealed months + readjustment re-scores never fire it). Type `late_score`; the existing email/push INSERT triggers handle delivery.

### Notification center
- `src/context/NotificationsContext.jsx` — loads notifications, subscribes to Supabase Realtime for live updates, exposes `markRead`/`markAllRead`, and surfaces preference state (muted types gate the unread badge count).
- `src/components/NotificationCenter.jsx` — bell icon with unread badge; desktop sidebar renders as a popover, mobile as a bottom sheet. Per-type glyphs, click-to-navigate + mark-read, "mark all read" action, empty state. The mobile sheet overrides the generic `.mc-modal-backdrop` (padding 0 + `overflow:hidden` + `overscroll-behavior:contain`) so it sits flush to the viewport bottom with the scroll contained to the inner list — no dark backdrop gap beneath it or rubber-band scroll.

### Notification preferences
Profile page ("Notifications" settings section, own profile only): per-event-type mute toggles, quiet-hours from/until, and Email + Browser-push delivery toggles. Preferences stored in `notification_preferences`; muting filters the in-app center + unread badge immediately. Quiet-hours fields **autofill** to a 22:00–08:00 default when unset, and setting either bound seeds the other's default so the window is always complete.

### Email delivery (Resend via pg_net)
A DB trigger (`email_notification`) POSTs to the Resend API via the `pg_net` extension when the recipient has `channel_email = true`, has not muted the event type, and is outside quiet hours (evaluated in their timezone). The Resend API key and app base URL are stored in `supabase_vault` (never in code). Verified end-to-end (HTTP 200 from Resend, real email ids returned). It sends from a **verified domain** (`noreply@movieclub.cc`), so it delivers to **any** member who has enabled email — not just the account owner. Email is opt-in (`channel_email` default false), so only members who turned it on receive mail (currently the two Ryans).

### Web Push delivery
`public.push_subscriptions` stores each browser's subscription object. A `push_notification` DB trigger gathers the recipient's subscriptions + VAPID private key (from vault) and POSTs to the `send-push` Edge Function via `pg_net`. The Edge Function (Deno, `npm:web-push`) sends to each subscription and prunes expired ones (404/410). Client: `NotificationsContext` exposes `pushSupported`/`pushEnabled` + `enablePush()`/`disablePush()` (permission gate → SW register → `PushManager.subscribe` → store subscription → flip `channel_push`). `public/sw.js` is the service worker. Profile's "Browser push" row is a live toggle (shown as disabled with a note where unsupported — iOS requires Add to Home Screen). Needs a real browser to validate end-to-end.

### Scheduling (4c — auto-activation ON + soft deadline enforcement ON, both via pg_cron)
**Auto-activation is now server-scheduled.** `pg_cron` runs `public.cron_auto_activate_due_months()` hourly (`'5 * * * *'`, job `auto-activate-due-months`): it activates any month with `auto_activate = true` + `status='upcoming'` whose `active_date` has arrived in US Pacific (DST-safe; the due-check is evaluated in `America/Los_Angeles`). It calls `activate_month` (which runs without a JWT in cron context — its caller-auth block is skipped — and enforces the single-active invariant + materialize + next-upcoming + readjustment). The client-soft `autoActivateDueMonths()` on This Month load remains as a redundant trigger.

**Self-perpetuating cadence:** `activate_month` now creates each next `upcoming` month with `auto_activate = true` (and `active_date` = the 1st), so after one manual kickoff the chain runs itself — every month auto-activates at 12am PT on the 1st, revealing the prior month + materializing the new one. An admin can still flip a specific month's `auto_activate` off, change its `active_date`, or hit "Activate now" manually (the Admin "This month" controls). *(Months created before this change keep their original `auto_activate=false`; e.g. June 2026 is a manual kickoff, July onward is automatic.)*

**Soft deadline enforcement is now ON.** `pg_cron` runs `public.cron_enforce_due_deadlines()` hourly (`'20 * * * *'`, job `enforce-due-deadlines`): for each film in the **active** month whose `scoring_deadline + app_settings.deadline_grace_days` (default 1) has passed in absolute time and which is still unrevealed, it flips `scores_revealed = true`. It is a **soft** model: only **scores** reveal (the `picker_revealed` flag is untouched — guess-the-picker stays a month-end game); non-scorers are simply **absent** (excluded from the average, never zeroed — averages already compute from available scores only); and **late scores are still accepted** and recalculate (no submission lock — the rolling `ratings` RLS + ScoreModal already allow scoring a revealed film). `notify_scores_revealed` sends the per-film "scores revealed" notification. Function EXECUTE revoked from anon/authenticated; runs in cron context. The grace is admin-tunable in the Admin dashboard **"Deadline Grace"** panel (writes `app_settings.deadline_grace_days`; 0 = reveal right at the deadline).

---

## Architecture: Anonymity & Reveal System

This is the most architecturally significant system — it affects RLS policies, queries, and UI throughout the app.

### Rolling reveal model (current)
During the **active** month, score visibility is **rolling per viewer**: you see a film's club average + other members' scores ONLY once you've submitted your own final score for it (your own score is always visible). The `ratings` SELECT RLS enforces this server-side: a row is visible iff `ratings.user_id = auth.uid()` (your own, always) OR `movies.scores_revealed` OR you're an admin OR `(score IS NOT NULL AND auth_user_has_scored(movie_id))` (others' scores, once you've scored it). The direct `user_id = auth.uid()` clause is required: without it, a member's FIRST score on an unrevealed film failed because the app upsert's `RETURNING` applies the SELECT policy to the just-inserted row, and the `auth_user_has_scored` subquery doesn't see that same-statement row (only surfaced once scoring went live via the app — historical data was imported server-side). So the client can't even fetch hidden scores — it just must avoid displaying a misleading partial average for a film it can't see (use `src/lib/visibility.js` `canSeeScores`/`visibleAvg`, mirrored in Films/Home/This Month/Stats).

**Month-end full reveal:** when the next month is activated, `activate_month` flips the demoted month's films to `scores_revealed = true` + `picker_revealed = true` — the whole month becomes public to everyone (even members who never scored it).

**Picker reveal triggers (two paths):**
- **Month ends** (next month activated) → `picker_revealed = true` via `activate_month`.
- **Month fully scored** → a trigger (`trg_reveal_picker_complete` on `ratings`) flips `picker_revealed = true` once every member active that month has a score for every film in the month (test account excluded; members expected from the month they joined). Picker-revealed always coincides with full score visibility.

**Stats/Awards are viewer-relative for the active month:** score stats include a film only when the viewer can see it (`scores_revealed` OR they scored it — a `_canSee` flag); existence-only visuals (genre mix, connection web) use a `_exists` flag (active/revealed months, never upcoming). A "stats are based on what you can see" note shows while the viewer still has unscored active-month films. Awards gate on `scores_revealed`/`picker_revealed`, so the active month is simply excluded from awards until it reveals (not per-viewer).

**`notify_scores_revealed`** skips its per-film notification when the film's month is already `revealed` (an end-of-month bulk reveal) so revealing N films at once doesn't blast N emails/pushes — the month-level notification covers it.

### RLS enforcement
- `movies.picked_by_user_id` and `pick_justification` excluded from non-admin queries until `picker_revealed = true` (via `movies_safe`). **Enforced server-side, not just by convention:** base `movies` has its table-level SELECT revoked from `anon`/`authenticated` and re-granted column-level on every column EXCEPT those two — so a member can't read an unrevealed picker by querying the base table directly; `movies_safe` (definer view) is the only path (masks until reveal, exposes to admins via its CASE). Self-pick checks use the `auth_user_picked(movie_id)` / `auth_user_picked_movie_ids()` SECURITY DEFINER RPCs; the `score_predictions` picker policy uses `is_movie_picker()` instead of inline-reading the column. (Hardened after the audit found the mask was previously advisory-only.)
- Individual scores gated on `scores_revealed` per film OR the rolling "you've scored it" check (`auth_user_has_scored`)
- A user always sees their own score regardless of reveal status
- Admins always see everything; realtime subscriptions push reveal updates to all clients

> Note: the old per-film *weekly* `scoring_deadline` auto-reveal is superseded by this rolling model — scores stay rolling per-viewer until the soft deadline + grace passes (the `enforce-due-deadlines` pg_cron job auto-reveals them), the month ends, or an admin reveals a film manually.

---

## Architecture: Discussion Model (Reddit-style Threads)

The old "one primary review per user + flat comments" model is **superseded**. The current model:

- A user may post **multiple reviews** per film; each review is a **thread root** rendered in a single `<CommentThread>` component on the film overlay (the separate Reviews section was removed).
- **Comments** nest under a review (`comments.review_id`) and under each other (`parent_comment_id`), forming a tree.
- Both reviews and comments support **emoji reactions** (polymorphic `reactions` table: `target_type 'review'|'comment'` + `target_id`) and **up/down votes** (`votes` table: same polymorphic shape, `value +1|-1`, one per user per target).
- **Edit window:** 15 minutes. Members may delete their own content; admins may delete any content.
- **@mentions** are preserved.
- **Idempotency:** votes and reactions use upsert + swallow-duplicate-key — re-voting or re-reacting never surfaces a duplicate-key error.

---

## Architecture: Scoring Rules

- Range: 0.01–10.00 (two decimal places, always displayed as X.XX)
- Pre-watch excitement score submitted **before** final score; permanently locked once final score is submitted
- **If a user has already submitted their final score, the excitement score input must be locked/hidden**
- **ScoreModal skips the excitement step entirely for revealed/historical (backfill) films** — it goes straight to final-score entry so a backfilled score never lands in `pre_watch_excitement`.
- The score input shows a large live-echo of the typed value for mobile legibility.
- The "Submit Score" CTA appears whenever there is no final score yet — an excitement-only row (no final score) does not hide it.
- Final score confirmation dialogue triggers above 8.99 or below 2.01 (admin-adjustable thresholds)
- Scores locked on submission; changes outside the seasonal readjustment window require admin approval via `score_change_requests` table
- During seasonal readjustment window: score changes allowed freely
- Missing scores after deadline = absent (not zero); group averages calculated from available scores only
- Score submission modal includes a "Would you recommend outside the club?" yes/no prompt; "X/Y would recommend" counts only members who have submitted (not the full member count)
- After submitting a score the review/discussion thread opens automatically
- Late scores trigger stat recalculation + notifications to all members
- **Back-calculation:** If exactly one member's score is missing for a film and `historical_avg_score` is set, back-calculate the missing score as `(historical_avg * expected_count) - sum(known_scores)`. Store as a real rating entry attributed to that user. Only apply if result is within 0.01–10.00.

---

## Architecture: Pick → Film Lifecycle (redesigned)

**Invariant: there is always exactly one `active` month and (at least) one `upcoming` month for picks.** Picks ALWAYS target the next `upcoming` month — never the active one. The active month's picks are **locked** (its films are being watched/scored); editing a pick only ever edits the upcoming month's pick. This removed the old bug where re-picking an active month re-pointed the existing `movies` row in place and looked like it "moved" that film's scores.

**Activation is the single point that materializes picks into films.** `public.activate_month(p_month_id)` (SECURITY DEFINER) is the one orchestration RPC: it (1) demotes any other `active` month to `revealed` (single-active), (2) sets the target active + materializes its `upcoming_picks` into `movies` (updating the existing row per picker so ratings stay attached; inserting if new) + splits scoring deadlines evenly by film count, (3) guarantees a next `upcoming` month exists (auto-creates `month_year+1` in the matching season), and (4) auto-opens the prior season's readjustment window when the activated month is the first of a new season (see Seasonal Readjustment). The older `materialize_and_split_month` RPC still exists but activation now goes through `activate_month`.

**Auto-activation (admin-toggleable, default off).** Each month has `auto_activate` (bool) + `active_date`. When `auto_activate` is on and `active_date` has arrived **in US Pacific (12am PT)**, the month activates itself — now via a **server-side `pg_cron` job** (`cron_auto_activate_due_months()`, hourly, DST-safe; see Scheduling 4c) **plus** the redundant **client-soft trigger** `autoActivateDueMonths()` which runs on This Month load and calls `activate_month` for a due month. `activate_month` authorizes a non-admin caller ONLY for a month that is genuinely due (auto_activate + date passed), so members can trigger a *scheduled* activation but can't force-activate anything else; admins can activate any month manually.

**Deadlines are now enforced (soft).** A film's scores auto-reveal once its `scoring_deadline + deadline_grace_days` passes, via the `enforce-due-deadlines` pg_cron job (see Scheduling 4c). Soft model: scores reveal, non-scorers are absent (not zeroed), late scores still accepted. Picker reveal stays a month-end event.

Admin panel: "Activate now" (calls `activate_month`), an Auto-activate toggle, and a scheduled "Activation date (12am PT)" saved via "Save schedule". The month-level **Deactivate button was removed** (the always-one-active invariant replaces it). The Upcoming Picks preview also lists historical pickers (from revealed months' films), not just queued `upcoming_picks`.

The signed-in user's own pick (for the upcoming month) shows inline on This Month (clickable → justification + change-pick flow). The active month's films are sorted by **scoring deadline** (watch order). Upcoming-month films are excluded from the Films page (no pre-activation pick leak).

**Member pick-change for the active month (implemented):** members can't change an active-month pick directly (locked); instead the picker sees a **"Request a different pick"** affordance on their active-month film's overlay (TMDB search → reason → submit, backed by `pick_change_requests`). An admin approves/denies on the Dashboard ("Pick-Change Requests" panel) — **approval is guarded on the film having zero scores** (admin reads all), then fetches fresh TMDB metadata and swaps the `movies` row wholesale; a decision notification goes to the requester. Component: `src/components/PickChangeRequest.jsx`.

---

## Architecture: Deadline & Timezone Logic

- All deadlines stored in **Pacific Time (PT)** (for fairness to Chris Deschenes, the west coast member); displayed in each user's local timezone via the browser's `Intl` API
- **Deadlines are enforced (soft):** scores auto-reveal at `scoring_deadline + deadline_grace_days` (default 1) via the `enforce-due-deadlines` pg_cron job; non-scorers absent (not zeroed), late scores still accepted. Hard submission locks are intentionally not implemented.
- Grace period (default 1–2 days, configurable) is invisible to regular members — results appear after deadline from their perspective
- If all scores submitted before deadline, results reveal immediately

---

## Key Data Models

```
users          — id, name, email, avatar_id, user_color, role, is_op (bool), timezone, joined_at,
                 is_active, has_completed_onboarding, admin_mode_enabled,
                 last_online_at, show_last_online, created_at
                 (is_op: sole power to grant/revoke admin; an op is also an admin — role stays 'admin')
seasons        — id, name, start_date, end_date, readjustment_open (bool), readjustment_ends_at (timestamptz),
                 readjustment_auto (bool, default true — per-season auto-open toggle)
                 (Quarterly: Winter Dec–Feb · Spring Mar–May · Summer Jun–Aug · Autumn Sep–Nov.
                  First season = Winter 2026, partial from the club founding date Jan 5 2026.
                  readjustment_* drive the Phase 6 seasonal readjustment window; admin-only UPDATE RLS.)
months         — id, season_id, month_year, reveal_date, end_of_month_reveal_date, status,
                 active_date (date the month goes active; defaults to the 1st; admin-adjustable),
                 auto_activate (bool, default false — scheduled auto-activation at 12am PT on active_date)
                 (Invariant: always one 'active' + one 'upcoming'. Activation goes through activate_month.)
app_settings   — id (singleton true), readjustment_length_days (int, default 7), updated_at
                 (global config; RLS readable by any member, admin-write)
movies         — id, month_id, title, tmdb_id, picked_by_user_id, pick_justification,
                 scores_revealed (bool), picker_revealed (bool), scoring_deadline,
                 streaming_providers (json), historical_avg_score,
                 poster_url, year_released, director, runtime, overview,
                 tmdb_vote_average (numeric), tmdb_vote_count (int), tmdb_popularity (numeric),
                 tmdb_cast (text[], top-billed cast; backfilled from TMDB, exposed via movies_safe),
                 tmdb_writers (text[], Writing-department crew; backfilled from /movie/{id}/credits,
                 exposed via movies_safe — powers Connection Web writer bridges)
ratings        — id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club,
                 submitted_at
reviews        — id, movie_id, user_id, body
                 (multiple reviews per user per film; each review is a thread root in the discussion)
comments       — id, movie_id, review_id, user_id, parent_comment_id (nullable), body
                 (comments nest under a review via review_id, and under each other via parent_comment_id)
reactions      — id, target_type ('review'|'comment'), target_id, user_id, emoji
                 (polymorphic — applies to both reviews and comments;
                  unique constraint on (target_type,target_id,user_id,emoji) enables upsert ON CONFLICT)
votes          — id, target_type ('review'|'comment'), target_id, user_id, value (+1|-1)
                 (one vote per user per target; Reddit-style up/down)
picker_guesses — id, movie_id, guessing_user_id, guessed_user_id
score_predictions — id, movie_id, predicting_user_id, target_user_id, predicted_score
                 (picker-only: only the film's picker predicts the other members' scores for their own pick)
upcoming_picks — id, user_id, month_id, tmdb_id, justification (hidden from all others until reveal)
veto_votes     — id, movie_id, voting_user_id (3+/5 triggers picker resubmission)
watchlist      — id, user_id, tmdb_id, title, poster_url, year_released, created_at (private per user;
                 unique(user_id,tmdb_id); RLS own-only). Films a member wants to watch.
draft_queue    — id, user_id, tmdb_id, title, poster_url, year_released, position, created_at
                 (private per user, ranked via position; unique(user_id,tmdb_id); RLS own-only).
                 Films a member plans to pick next; reorder by drag or up/down arrows.
                 Both rendered by src/components/PersonalLists.jsx on the member's OWN Profile
                 (Phase 7); add films via a debounced TMDB /search/movie box. The draft queue
                 also surfaces as a "From your draft queue" quick-pick list in the This Month
                 pick flow (src/pages/ThisMonth.jsx); promoting a queued film into the monthly
                 pick deletes that draft_queue row.
film_tags      — id, movie_id, user_id, tag, created_at; unique(movie_id,user_id,tag);
                 RLS: readable by any member, insert/delete own only. Members tag a film at
                 rating time (compact picker in ScoreModal) and from the film overlay; tags
                 render in aggregate (tag · count) via src/components/FilmTags.jsx. Tag text
                 normalized client-side (trim + lowercase + collapse). Test account filtered.
auteur_votes   — id, season_id, voter_user_id, rankings (json array, ranked choice)
season_rankings — id, season_id, user_id, movie_id, rank, locked_score (locked at end of window)
score_change_requests — id, rating_id, user_id, requested_score, status (pending|approved|denied)
pick_change_requests — id, movie_id, user_id, requested_tmdb_id, requested_title, requested_poster_url,
                 requested_year, reason, status (pending|approved|denied), admin_note, resolved_at
                 (member requests to swap a locked active-month pick; admin approval guarded on
                  zero scores, swaps the movie row + fresh TMDB metadata; decision notification
                  via trg_notify_pick_change. RLS: own insert/read, admin manage via is_admin())
month_absences — id, month_id, user_id (excludes member from picker stats that month)
notifications  — id, user_id, type, title, body, link, payload (jsonb), read_at, created_at
                 (RLS: recipient reads/updates own rows; rows created only by SECURITY DEFINER triggers)
notification_preferences — user_id (pk), muted_types (text[]), channel_push (bool), channel_email (bool),
                 quiet_start (time), quiet_end (time), updated_at
                 (RLS: own only; channel_email default false — opt-in)
push_subscriptions — id, user_id, endpoint, p256dh, auth, created_at
                 (stores Web Push subscription objects; expired subs pruned by the send-push Edge Function)
awards         — id, user_id, award_key, scope (monthly|seasonal|annual|alltime), period_ref
month_recaps   — month_id (pk), recap_md, best_review_id, best_review_blurb, model, generated_at
                 (AI monthly recap + Best Review; written ONLY by the ai-recap Edge Function /
                  service role; members read, admins may delete to regenerate)
custom_avatars — id, pack, slug, label, storage_path, created_at; unique(pack,slug)
                 (admin-uploaded avatars in the public `avatars` Storage bucket; members read,
                  admins manage; referenced as avatar_id "storage:<path>", resolved by avatarSrc())
movies.veto_resubmit_required (bool) — set by trg_notify_veto_threshold at 3/5 vetoes on an
                 unscored film; cleared by resubmit_vetoed_pick(); exposed in movies_safe
guest_films / guest_scores / guest_reviews — anon-safe SECURITY DEFINER views (Guest Mode):
                 revealed-only, "First L." abbreviated (abbrev_name()), test excluded; anon SELECT only
auth_events    — id, user_id (nullable), event, user_initiated (bool), detail (jsonb), user_agent, created_at
                 (admins read; open insert so signed-out events still log;
                  used by src/lib/authLog.js — logAuthEvent() fire-and-forget,
                  deliberateSignOut() tags user-initiated sign-outs;
                  logs SIGNED_OUT with user_initiated + visibility/online, and profile-fetch retries/errors)

RPC: public.activate_month(p_month_id uuid) SECURITY DEFINER
     — THE activation orchestration: single-active invariant + materialize + split deadlines +
       guarantee a next upcoming month + auto-open prior season's readjustment. Admin-gated,
       except a genuinely-due scheduled month (auto_activate + date passed in PT) which any
       client may trigger (soft auto-activation).
RPC: public.materialize_and_split_month(p_month_id uuid) SECURITY DEFINER
     — legacy materialize+split (still present); activation now goes through activate_month.
RPC: public.is_admin(uuid) SECURITY DEFINER STABLE — recursion-safe admin check used by RLS
     policies (e.g. users SELECT, app_settings write).

users SELECT RLS: "members read active or self; admins read all" — a member sees active users +
     their own row; admins (via is_admin()) also see INACTIVE members (so a deactivated member
     stays visible and can be reactivated — the old policy hid inactive rows from everyone).

Extensions / infra: pg_net (HTTP from DB triggers); supabase_vault secrets: resend_api_key,
     app_base_url, vapid_private_key, vapid_subject
Edge Function: 'send-push' (Deno, npm:web-push) — sends Web Push to a user's subscriptions
     with VAPID; prunes expired (404/410) subscriptions
Edge Function: 'streaming-fallback' (Deno) — Claude web-search fallback for US streaming providers
Edge Function: 'ai-recap' (Deno, claude-sonnet-4-6, verify_jwt) — admin-gated; generates a month's
     AI recap + Best Review into month_recaps. ANTHROPIC_API_KEY server-side only.
RPC: public.resubmit_vetoed_pick(...) SECURITY DEFINER — picker swaps a vetoed pick (guards:
     caller=picker/admin, veto_resubmit_required, zero scores); clears flag + veto votes. anon EXECUTE revoked.
Function: public.abbrev_name(text) — "First L." abbreviation used by the guest_* views (search_path pinned)
Storage: public bucket 'avatars' (admin-write RLS) backs custom_avatars
```

---

## TMDB Integration

- Use Read Access Token (Bearer auth) for all calls
- Film search must handle disambiguation (multiple results for same title) in the pick submission UI
- Use `/movie/{id}/watch/providers` for US streaming availability; cache result in `movies.streaming_providers`
- **Streaming provider fetch order:**
  1. Try TMDB `/movie/{id}/watch/providers` (US region) — client-side, safe with anon key
  2. If TMDB returns no providers or errors: fall back to a **server-side** Supabase Edge Function that calls the Claude API (web search) — `ANTHROPIC_API_KEY` must never be exposed to the client
  3. If both fail: display "No streaming availability found"
- Streaming providers should be fetched and cached when a film overlay is first opened, and refreshable from Admin

---

## Navigation Structure

**Mobile:** Bottom tab bar (6 items + Admin when admin mode on)  
**Desktop:** Left sidebar  
**Tabs:** Home · This Month · Films · Stats · Awards · Profile · Admin *(admin only)*

### This Month — single consolidated view (no sub-tabs)

This Month is a **single scrolling page** (sub-tabs removed as of Session 9). It contains three sections in order:

1. **Films section:** This month's film cards with inline deadline countdowns. Once `picker_revealed` is true, the picker's identity appears inline on each card. Populated once picks are materialized; shows "No films yet for [Month]" otherwise.
2. **Your Pick section:** Pick CTA ("Pick your next movie" → TMDB search → disambiguation → justification → confirm), the signed-in user's own pick inline (clickable → justification + change-pick flow), and — after the end-of-month reveal — other members' picks are shown and guess/predict nudge appears. **Pick from your queue:** when the member has a Draft Queue, a ranked "From your draft queue" quick-pick list renders above the film search (hidden once they start typing); selecting an entry routes through the same TMDB detail-fetch path as a search result, and a successful save **consumes** that queue row (promoted out of the queue).
3. **Reveal section:** Shown only after `end_of_month_reveal_date` passes / `picker_revealed` is true for all films. Displays picker identities, pick justifications, guess + prediction results, monthly awards, and the month's recap. Hidden until the month is fully revealed.

**June 2026 exception:** Picks are being entered manually by the admin — the picks section may show an incomplete list until all picks are in.

**Anonymity/notifications note:** The member-facing This Month view never shows others' upcoming picks, even to admins (the Admin dashboard has a separate "Upcoming Picks" preview panel for that). MonthReveal guess/prediction rows exclude the test account.

### Films sub-tabs
All Films · The Vault · By Season · History

- **All Films:** Sort options — Most/Least Recent (months desc, watch-order reversed within month), Highest/Lowest Rated, Most/Least Divisive, By Member. Filter-by-member control (revealed picks only). Group average computed from actual ratings when `scores_revealed` and `historical_avg_score` is null (fixes missing May 2026 scores). Floating "hide scores" toggle hides score, divisive-sort stddev, and the vault gold star. Film title rendered under each poster. Genre tags deep-link to All Films filtered by that genre (genre filter active). Vault badge links to the Vault tab. Divisive sort shows stddev. "Where to watch" entries are links. "Pickers" legend renamed "Club Members" with profile links. Member names/avatars in the film overlay link to profiles. Upcoming-month films excluded (no pre-activation pick leak).
- **By Season tab:** Sortable (newest/oldest season order; sort applies within every season). Same group-average fix applied.
- **History tab:** Browse revealed months one at a time (month pills → 2-up film grid with picker labels).
- Streaming providers display correctly (flat-shape read fix applied).
- Duplicate "Discussion" label removed from the film overlay.

**Film ordering within each month:** follows the watch-order established in the group chat (earliest deadline first). Films are ordered by their DB insertion order (id ASC within a month).

### Stats sub-tabs
Overview · Me · Members · Club · Head to Head

- Clicking a film anywhere in Stats opens the film overlay; clicking a member name opens the **member overlay** (MemberOverlayContext)
- Member names shown as "First L." in Stats (guest-style abbreviation)
- Member names are clickable throughout the app (scores, stats, reviews, etc.) and open the member overlay
- Clicking a stat value expands a relevant chart (per-member bars, mean/stddev for divisive/unanimous)
- **Additional stats implemented:** avg score per release decade, per-user scoring granularity, per-user std dev, per-movie breakdown, club-vs-TMDB comparison (uses `tmdb_vote_average`), expandable per-member cards, dynamic histogram bins, Club "score over time" trend line (club avg + per-member lines + neutral grey dotted TMDB average line)
- **Session 9 stat polish:** Member names in scoring granularity, scoring variation, picker power rankings, score percentile generosity, most active scorer, and scoring streaks all link to the member overlay. Film titles in per-film spread, season/year rankings, and excitement-vs-final open the film overlay. Season/year ranking lists are collapsible. Genres link to the genre-filtered Films page. Genre pie single-selects + updates tooltip + legend links out. Club by-film trend chart click maps to the correct film (keyed by id). Histogram selected bar glows. Club-vs-TMDB scatter auto-scales to the data. Given/Received/Club-avg has y-axis labels + a data-driven domain. Taste-correlation uses the accent color. Std-dev/mean overlay lines are visually distinct with numeric values. Scoring-variation x-axis labels rounded.
- **Stats chart polish (this session):** genre pie is true single-select with a hover **Tooltip kept** — selection is driven purely by `selectedIndex` via Cell opacity (no Recharts `activeShape`/`activeIndex`, which kept a stale slice highlighted); click-away is keyed off the real `.recharts-sector` DOM target. Club-vs-TMDB scatter and Avg-by-Decade bar no longer clip their Y-axis labels (negative left margins removed). Me/Members "scores over time" trend keys each point by a unique `idx` (+ `xLabelKey`) so same-month films don't repeat one title in the tooltip; Club "Score Over Time" defaults to the per-Film view (Month second) and its **legend toggles series highlight** (click to dim others, multi-select). The excitement-vs-final list collapses to a 6-row preview.
- **Reference-line + domain polish:** `MemberScoreBars` (and `FilmScoreBars`) draw **glowing** μ/σ lines (a wide faint pass under a sharp pass, in `--text-strong` / `--accent-light` so they pop over bright bars on dark themes), put the μ label at the **top** and σ at the **bottom** so they never collide, and **fit the x-domain to the data** (`niceScoreDomain`) so a tight cluster of scores (e.g. everyone > 7) spreads across the plot instead of wasting the 0–10 range. `FilmScoreBars` moves its μ/σ out of inline ReferenceLine labels (which overlapped the y-axis member names) into a **caption below the chart**.
- **Stats UI consistency + caching (this session):** the `InfoButton` "?" popovers now **dismiss on outside click / Escape / scroll / resize** with a single-open coordinator (matching the Awards page — previously they only toggled on a second click). The Stats **sub-tabs grow to fill the bar** (`flex: 1 0 auto`, like Awards/Admin) instead of clustering left. The **Score-Over-Time TMDB community line is cached**: `movies.tmdb_vote_average` is loaded in the Stats query and seeds `ClubTrendChart`'s vote map so the line + legend paint on first render, then a live TMDB pull merges fresh values on top without blanking (no late pop-in). The connection-web edge popover renders its two titles + ↔ as a flex row so the arrow stays vertically centered when a title wraps.
- **Per-member Score Spread box plot:** each member's row shows the IQR box + whiskers + a strong **median line** AND their **mean** as a ringed dot on the centre line (distinct shape + colour from the median), with a legend (median / mean / box / whiskers) and a `mean` value in the tooltip. *(Note: the club's medians all land on exactly 7.0 — verified as real, not a bug: 7.00 is the runaway modal score and everyone has an odd score count, so the middle value is a true 7. The mean is what actually separates members.)*
- **Connection Web · 6 Degrees:** Films linked by a shared **actor, writer, or director**, rendered as a custom radial SVG node-link graph. **Single-tap a film node** to select it (lights its connections + shows who bridges them, labelled `dir.` / `wr.` / raw actor name); **tap the selected node again** to open its film overlay. **Tap a connecting line** to isolate that single connection (only that line + its two endpoint films light up; a fat invisible hit-path makes thin lines tappable). No focus box on nodes/lines; the viewBox is horizontally padded so edge labels (e.g. "Kingdom of Heaven") aren't clipped. Backed by `movies.tmdb_cast` (full TMDB billed cast — ~20–40 names per film, incl. minor roles, not just the headliners) + `movies.tmdb_writers` (Writing-department crew, backfilled from `/movie/{id}/credits`) + `director` — e.g. Charlie Kaufman bridges Adaptation, Being John Malkovich, and Eternal Sunshine. The graph uses the **entire** cast array (no top-N cap), so deep-billed shared actors form connections too.
- **Cast & Crew dropdown (film overlay):** every film overlay has a collapsible "Cast & Crew" section listing the director, writers, and the full TMDB billed cast as chips (the same names that power the Connection Web). **Person pages (Phase 7 — implemented):** each director / writer / cast chip is now tappable → `PersonOverlay` (`src/components/PersonOverlay.jsx` + `PersonOverlayContext`) showing that person's in-club filmography (with click-through to each film) + a TMDB bio (searched by name via `/search/person` → `/person/{id}`, cached). Wired globally in `App.jsx` alongside the member overlays.
- **Genre charts (personalized vs club-wide):** A genre breakdown of "films I scored" is identical for everyone (all members score every film), so the genre pie is split by scope. The **Club tab** shows two club-wide charts: **"Most Picked Genres"** (donut — films PICKED per genre, existence-based, not score; renamed from the misleading "Favourite Genres") and **"Avg Score by Genre"** (bars — the club's average score per genre, over RLS-visible scores). The **Me / member pages** show two *personal* charts: **"Picks by Genre"** (donut of the genres of films THAT person picked = their curation) and **"Avg Score by Genre"** (bars of their average score per genre = their taste). NOTE: the Me-tab "Picks by Genre" donut keys off `picked_by_user_id === subjectId` where `subjectId = ratings[0].user_id`, so the signed-in user's own-ratings query MUST select `user_id` (a Session-15 fix — it was omitted, blanking the own donut while other members' worked).
- **Genre Blindspot Grid:** Per-member **curation** coverage — for each member × genre, how many films they've **PICKED** in that genre (a zero cell = a genre they've never picked from = their blindspot as a curator; rendered in a **neutral** tint, not red). Switched from "rated" to "picked" (everyone rates every film, so that carried little signal). Genre column labels are rotated vertical so the full name fits each narrow column. Columns are derived **live** from each film's `genre` field (auto-backfilled from TMDB), so newly-picked films with new genres **auto-populate** new columns; the display cap is set above TMDB's fixed 19-genre ceiling (the grid scrolls horizontally) so no genre is silently dropped.
- **Per-film score breakdown:** every film overlay has a collapsible "Score breakdown" dropdown rendering that film's per-member score bar chart with glowing μ (mean) + ±1 σ reference lines and a data-fitted x-domain (`src/components/FilmScoreBars.jsx`) — the same chart shape used for the expandable film stats on Stats Overview.
- **All Films member filter:** A filter-by-member control on the All Films view (revealed picks only).
- **Film tags (Phase 7):** every film overlay has a "Tags" section showing member-applied descriptive tags in aggregate (tag · count); a member who has submitted a final score can add/remove their own tags there. Tags are also captured at rating time via a compact picker in `ScoreModal` (final/readjust mode). Backed by `film_tags` + `src/components/FilmTags.jsx`; your own tags are accent-highlighted and removable, curated suggestions lower friction, tag text is normalized (trim + lowercase + collapse), test account excluded.

### Awards sub-tabs
Monthly · Season · Annual · All-Time

- Awards are also shown on individual film pages (awards that film won)
- Awards are also shown on user profile pages (awards that user has won, including awards for films they picked)
- Award film/member click-throughs verified: films open the overlay, members open the member overlay
- Awards render as a collapsible badge grid (`AwardsBadges` component) on Profile pages and in the film overlay
- Awards deep-link via scope/key/ref query params — the target award scrolls into view and highlights
- `historical_avg_score` is authoritative in all award computations (e.g. Eternal Sunshine reads 8.60, not 9.5)
- "In the Vault" links to the Vault tab; "Club average" in award copy links to the Stats Club tab
- Award poster fills its card

### Member Overlay (global)

Member profiles open as an **overlay/popup** (`MemberOverlayContext`) anywhere you click a member name or avatar — Home, Stats, Awards, Films legend, film overlay. Closing the overlay returns the user exactly where they were. The bottom-bar **Profile** tab is always the signed-in user's own profile. The `/profile/:id` route is kept as a deep-link fallback (e.g. from external links or direct navigation).

Member overlay contains: profile card, awards badge grid (collapsible), "Films [member] picked" section (by month, with score), recent scores (each opens the film overlay), and a "View full stats" button. **"View full stats" opens the `MemberStatsOverlay` popup** (`src/components/MemberStatsOverlay.jsx` + `MemberStatsOverlayContext`) — a full-screen overlay rendering that member's **full Me-tab breakdown** (reuses the exported `MeTab`; loads its own data). Closing (X or Android Back) returns you exactly where you were (the member profile or the Stats Members tab). While open it **overrides the app accent with that member's colour**, so every accent-driven chart renders in their colour. Also openable from a "View full stats" button in the Stats **Members-tab** expanded card. (The `/stats?member=<id>` route still works as a deep-link fallback.) The profile **tier badge** (Op / Admin) reflects the *displayed* member's role, not the signed-in viewer's.

### Smart Linking (global)

Films open the film overlay and member names/avatars open the **member overlay** throughout the app — Home, Stats, Awards, Films, the film overlay. (Direct `/profile/:id` navigation is preserved as a deep-link fallback.) Home "all caught up" box links to that month's scores (Films History); Home stats link to the relevant film or Films page. Home includes a "Club Members" browse strip and a collapsible Recent Activity section. The This-Month **poster row** shows each film's **club average** as a badge prefixed with a 👥 glyph (with a "👥 = club average" legend) — visible per the rolling model (only once you've scored that film); the **"Your scores"** list below it shows your own submitted scores in the accent colour. The two are labelled distinctly so a club average is never mistaken for your own score.

### Modal Safety

Global CSS classes `.mc-modal-backdrop` / `.mc-modal-panel` ensure modals never overflow the viewport top (mobile keyboard / off-screen safety). Apply these to all modals. ScoreModal uses these classes; mobile keyboard push-up is fixed.

### Onboarding — Guided Tour (Phase 1/3 — implemented)

The one-shot `WelcomeDialog` is **superseded** by `src/components/GuidedTour.jsx` — a skippable, **replayable** multi-step carousel (Welcome · This Month · Films · Stats · Awards · Notifications · Preferences). It self-gates: opens automatically for members with `has_completed_onboarding = false` (finishing/skipping sets the flag), and on demand via `useTour().startTour()` (`src/context/TourContext.jsx`, in the provider stack). A "Replay app tour" button lives in Profile → Preferences. Keyboard: ←/→ navigate, Esc skips.

### Member Preferences (Phase 3 — implemented)

Profile "Preferences" section (own profile only): **default film sort** (`users.default_film_sort`, a SORT_OPTIONS key — the All Films wall seeds its initial sort from it), **timezone** (`users.timezone`, full IANA picker, shows the detected zone), and a **"Show last online" toggle** (`users.show_last_online`). `PresencePing` (App.jsx) records `users.last_online_at` on load + tab refocus (throttled ~5min, write-only — no profile refetch, so it doesn't trip the focus-guard reload). Other members' profiles show "Last online X ago" when `show_last_online` is true.

---

## Themes

32 combinations: **4 modes × 8 accent colors** (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet, Hot Pink). Implemented via CSS variables. Each member independently sets their own theme.

**Cross-device persistence:** theme **mode + accent** are saved to the user's row (`users.theme_mode`, `users.theme_accent`) — not just localStorage — so the choice follows them across devices. `localStorage` still drives the instant first paint on a known device; a `<ThemeSync>` bridge (in `App.jsx`, inside `AuthProvider`) applies the DB value once the profile loads, so a fresh device picks up the saved theme. The Profile mode selector + accent swatches write the change to the DB (like `user_color`).

**4 theme modes (lightest → darkest):** `light` · `sepia` (warm paper) · `grey` (soft slate) · `dark`. Sepia and grey are the two "in-between" options. Modes are managed in `src/context/ThemeContext.jsx` (`MODE_OPTIONS`); the Profile page has a 4-way segmented selector.

Mode bindings: `data-theme` carries the exact mode (drives the palette block in `index.css`), and `data-base` (`light`|`dark`) carries the *family* — **sepia is light-family, grey is dark-family**. The light-mode Tailwind utility remaps + accent-legibility overrides key off `[data-base="light"]` so sepia inherits them; the `.dark` class (for `prefers-color-scheme`-independent dark utilities) is applied for **grey and dark**. An inline script in `index.html` applies the saved mode before first paint (no flash of default dark) and the `theme-color` meta tracks the mode. Light-family `--text-faint`/`--hairline` were darkened so captions clear ~4.5:1. Chart tooltips read `var(--surface)` (theme-aware, not a fixed dark box).

**User colors:** Centralized in `src/lib/colors.js` — `MEMBER_COLORS` map, `USER_COLOR_PALETTE` of 20 hue-separated options, `memberColor()` helper (reads `user_color` from the DB first, falling back to the static map — so a chosen color propagates into Stats, the Films member filter, and everywhere else), plus `CHART_CATEGORICAL`, `CHART_NEUTRAL`, and `chartColorAt()` for chart series. Colors are hue-separated so no two members' colors are confusable (e.g. Ryan Miller = purple `#a855f7`, distinct from Chris's blue). One color per member enforced; Profile color picker strikes out colors already taken by other members. The color picker collapses after a color is chosen.

Displayed as a colored ring around the member's avatar and as the color of the initials text when no avatar is set.

**Light-mode accent overrides:** Each accent color has a vibrant `--accent` CSS variable + a dark accent-text companion in light mode so all 8 accents remain legible (dark mode unchanged). Active bottom-nav tab uses the accent color. Home poster-row shadow no longer clips.

**`--accent-rgb`:** Every accent also defines an `--accent-rgb` triple (e.g. Sage = `16, 173, 79` in light, `60, 179, 113` in dark) alongside `--accent`, for both light and dark. This fixes all `rgba(var(--accent-rgb), …)` usages — the taste-correlation heatmap, the genre-blindspot grid, and accent-tinted surfaces — which previously had no `--accent-rgb` defined and silently fell back to the purple default regardless of the selected accent.

**Readability/vibrancy pass:** the per-mode text tokens (`--text` → `--text-faint`) were tuned for contrast — brighter in dark/grey, darker in light/sepia — so secondary text/captions stay readable in every mode. The 8 accents were bumped to vibrant `-500`-ish shades (base/dark + grey) with matching light/sepia overrides, so accent fills, the active nav, and accent text pop instead of looking washed out.

**Vault films:** Gold star indicator only — no gold border (would clash with user color border on picks).

---

## Stats & Visualizations

Charts use a library (Recharts preferred). Specific chart types needed:
- **Score distribution:** Histogram of all scores (0–10 buckets)
- **Score over time:** Line chart by month (x-axis = month name, not UUID)
- **Member comparison:** Bar chart comparing member averages
- **Excitement vs final:** Scatter or paired bar per film
- **Head to head:** Score delta matrix between two selected members

*(Owner to add more specific chart requests here)*

---

## Historical Data

Import source: Google Sheet "Movie Club" (accessible via Google Drive MCP) + chat log at `/data/data/com.termux/files/home/storage/downloads/movie_club_chat.txt` for individual scores.

All historical films (Jan–May 2026) import with `scores_revealed = true` and `picker_revealed = true`. May 2026 has only 4 picks — Zack did not pick in May.

**Film ordering within months** (from group chat, earliest deadline = first):
- Jan: The Master → Rebel Ridge → Princess Mononoke → Primer
- Feb: Kingdom of Heaven → Where the Wild Things Are → Smashing Machine → City of God
- Mar: Contact → Frailty → Oldboy → Spirited Away
- Apr: Three Billboards → Birdman → Heat → Eternal Sunshine → Arlington Road
- May: American Gangster → Cherry → Being John Malkovich → Adaptation

---

## Admin Capabilities

- Trigger `scores_revealed` and `picker_revealed` by **individual film** or by **entire month**
- Edit all film metadata including TMDB-sourced fields (title, poster, plot, year, director, runtime, etc.)
- Refresh streaming providers for any film
- Manual score entry for any user/film (can overwrite an existing score)
- Member management (email, joined_at, activate/deactivate); deactivated members drop out of all member lists
- "Films with missing scores" matrix:
  - Rows link to the film's Scores tab
  - Expected count based on members active at that time (pre-Zack = 4, post-Zack = 5)
  - Test accounts excluded from counts
  - Cells marked N/A (crossed out) when a member wasn't in the club for that film's month
  - Zack is backfillable for pre-join months via the matrix
- Trigger by month: bulk-reveal scores or pickers for all films in a month
- **Activate / Trigger now:** runs `materialize_and_split_month` for a month, materializing picks into films and splitting deadlines. The `status='active'` update now persists correctly — admin INSERT/UPDATE RLS policies were added to `months` in Session 9 to fix a silent block that previously prevented persistence.
- **Deactivate:** counterpart to Activate — sets an active month back to `status='upcoming'` (after a confirm) so members can keep adding/changing picks. **Non-destructive:** films already materialized for that month are left in place (re-activating re-splits deadlines). Enabled only when the selected month is currently active.
- **Upcoming Picks preview:** Admin-only section (behind a "Reveal" toggle on the Admin dashboard) showing all pending `upcoming_picks` before materialization. Regular members — including admins in their member-facing view — never see others' picks pre-reveal; this preview is strictly the admin panel.
- Auto genre backfill runs on the Admin dashboard when any film is missing a genre (fetches from TMDB and updates `movies` in the background).
- **Op-only (Ryan Miller):** Admin Members tab shows Op / Admin / Member tiers; op can promote members to admin or demote admins to member. No other admin can change roles. **DB-enforced:** the `trg_enforce_op_role` trigger rejects any `role`/`is_op` change by a non-op, so it can't be bypassed via the API (the `materialize_and_split_month` RPC is likewise authorization-gated).

---

## Guest Mode (Phase 7 — implemented)

Public read-only, no login required. Shows post-reveal data only (poster wall, film pages, scores, reviews). Member names shown as "First L." only. Hides: individual profiles, watchlists, draft queues, predictions, guesses.

**Security model (the repo is public, anon is untrusted):** we do NOT open table-level RLS to anon. Instead `/guest` (`src/pages/Guest.jsx`, route outside `<RequireAuth>`) reads a tiny **controlled surface** — three SECURITY DEFINER views that bake in every safety filter: `guest_films` (scores_revealed only; picker label gated on `picker_revealed`; club avg), `guest_scores` (per-member abbreviated name + score), `guest_reviews` (abbreviated author + body). All exclude the test account and abbreviate names via `public.abbrev_name()`. `anon` is granted SELECT on these views ONLY; the base tables stay RLS-locked (verified: anon gets `[]` from movies/users/ratings). A "Browse as guest" link sits on Login. The definer views flag as a Supabase advisor ERROR by design (same accepted pattern as `movies_safe`).

---

## Architecture: AI Recaps & Best Review (Phase 6 — implemented)

The two AI-dependent award-catalog pieces, server-side only. The `ai-recap` Edge Function (`supabase/functions/ai-recap`, Deno, model `claude-sonnet-4-6`) is **admin-gated** (caller JWT must resolve to an admin), gathers a month's films/scores/reviews with the service role (test account excluded), asks Claude for a short narrative recap + the single best-written review, validates the returned review id, and upserts `public.month_recaps` (recap_md, best_review_id, best_review_blurb, model, generated_at). `ANTHROPIC_API_KEY` + service key live ONLY in the function. `MonthReveal` renders the recap (safe **bold**/paragraph renderer, no raw HTML) + a highlighted "Best Review of the Month". Admin dashboard "AI Month Recaps" panel generates/regenerates per active/revealed month, and **auto-generates** for any revealed month without a recap. The auto-gen is **client-soft** (the panel is admin-only and re-renders right after an activation reveals the prior month, so it fires promptly) rather than a DB→pg_net trigger — the ai-recap function is admin-JWT-gated and a DB trigger can't mint an admin token (and the service-role key isn't in the vault). A session-level attempted-set bounds it to one try per month per session.

**Generate-once guarantee (don't silently regenerate):** the recap is generated exactly once per month and is **stable** thereafter. Two guards enforce this: (1) **server-side** — the `ai-recap` function takes a `force` flag and, when `force` is not true, returns `{ ok: true, skipped: true, reason: "recap_exists" }` *without calling Claude* if a `month_recaps` row already exists; (2) **client-side** — `AiRecapPanel` gates its auto-gen effect on `recapsLoaded` (the effect previously ran on mount with `recaps === {}`, so every revealed month looked "due" and the recap was re-rolled on each full page reload, producing slightly different prose each time). Only the admin **"Regenerate"** button passes `force: true`; the auto-gen never does. So the recap a member sees never changes on its own.

**Prompt fidelity (watch order + names):** the prompt lists films in **watch order** (the `movies` query orders by `scoring_deadline`, numbered `1..n`) and instructs the model to honor it — only film 1 "opened" the month and only the last "closed" it, no false "bookends" — fixing a recap that once called the *last* film the month's kickoff. Members are referred to by first name, except the function detects shared first names (the two Ryans — Ryan Miller / Ryan Bey) and instructs the model to disambiguate them by full/last name. The recap also surfaces **read-only on the Films → History tab** (below the film grid) for **revealed months only** — the active month's recap names pickers, so `HistoryTab` only fetches recaps for `status='revealed'` months (`RecapProse` is exported from `MonthReveal` and reused).

---

## Architecture: Veto Resubmission (Phase 7 — implemented)

`VetoControl` (film overlay, pre-reveal) lets members vote to veto a pick. `movies.veto_resubmit_required` (exposed in `movies_safe`) is flipped by `trg_notify_veto_threshold` when veto votes reach **3 of 5** while the film is still unscored — which also notifies the picker. The picker then sees `VetoResubmit.jsx` (picker-only, keyed on `isPicker && veto_resubmit_required && no scores`): a TMDB-search "choose a replacement" flow that calls `resubmit_vetoed_pick()` (SECURITY DEFINER; re-guards caller=picker/admin + flagged + zero scores), swaps the movie row wholesale with fresh metadata, clears the flag, and resets the veto tally. Threshold is hardcoded to 3 (trigger + UI).

---

## Score Back-Calculation (Phase 1 — implemented in Admin)

The Admin "Films with Missing Scores" matrix surfaces a "Back-calculate" CTA on any film missing **exactly one** expected member's score when `historical_avg_score` is set: `missing = historical_avg * expected_count - sum(known scores)`, offered only when the result is a valid 0.01–10.00, written as a real rating attributed to the missing member (updates an excitement-only row in place if present). `expectedMembersList()` sits beside `expectedMemberCount()`.

---

## Custom Avatars / Admin Assets (Phase 7 — implemented, additive)

The static avatar library (`public/avatars/*` + auto-generated `src/lib/avatars.js`) is the polished base set and is left untouched. **Additive** on top: a public `avatars` Storage bucket (admin-write RLS, 2 MB, image mimes) + `public.custom_avatars` (pack/slug/label/storage_path; members read, admins manage). The Admin **Assets** tab uploads images (file + preview, pack datalist, label → slugified path) and lists/deletes them. `avatarSrc()` resolves `storage:<path>` ids to the bucket's public URL so rendering stays synchronous (no DB lookup); `AvatarPicker` merges `custom_avatars` in as extra packs after the static library. The 3 still-missing static icons can now be added here instead of via code.

---

## Seasonal Readjustment (Phase 6 — implemented)

At a season's end an **admin opens a readjustment window** (Admin → Dashboard → "Season Readjustment": Open window + end datetime, or Close). While the window is open, members may **freely re-score that season's films** — the `ScoreModal` detects the open window (via `ReadjustmentContext.isMonthReadjustable(movie.month_id)`) and switches the normally-locked score into an editable "Update score" mode, prefilled with their current value, bypassing the `score_change_requests` flow. (The `ratings` UPDATE RLS already permits self-edits; the lock is a client convention, so no new policy is needed.) A `ReadjustmentBanner` shows on Home while any window is open. When the admin closes the window — or it passes `readjustment_ends_at` (soft auto-close, client-evaluated; no pg_cron) — scores lock again and the season's **Auteur Award** finalizes.

- Window state lives on `seasons` (`readjustment_open`, `readjustment_ends_at`, `readjustment_auto`); admin-only UPDATE RLS.
- **Automation:** a global default window length lives in `public.app_settings.readjustment_length_days` (default 7, admin-editable; RLS readable-by-all, admin-write). `seasons.readjustment_auto` (per-season toggle, default on) controls auto-open. `activate_month` **auto-opens the prior season's window** when a new season's first month is activated (e.g. activating June opens Spring's window), ending `length` days after the season's end, **anchored to 12am US Pacific**. Manual open/close still available; the Admin panel exposes the global length, a per-season auto toggle, and a window-end **date** (defaults to season-end + length — no stray time-of-day).
- `src/context/ReadjustmentContext.jsx` loads every season's window + a month→season map, subscribes to `seasons` realtime (so a member's UI flips when an admin toggles), and exposes `openSeason`, `isMonthReadjustable(monthId)`, `isSeasonOpen(season)`.
- Ranking is always score-derived (not drag-and-drop).

---

## Awards Summary

> Combined maximal catalog (union of spec + this doc + implemented). ✅ = computed in
> `src/lib/awards.js` (or, for Best Review, the `ai-recap` Edge Function). The catalog is now
> **fully implemented** — including the Auteur Award (best picker, not a vote) and the AI Best Review.

**Monthly:** Pick of the Month ✅, Flop of the Month ✅, The Contrarian ✅, The Oracle ✅, Hype Machine ✅, The Letdown ✅, The Surprise ✅, Most Divisive ✅, Most Unanimous ✅, The Underrated 💎 ✅, The Deep Cut 🕳️ ✅, Best Review (AI-assisted) ✅ (via the `ai-recap` Edge Function → `month_recaps.best_review_id`; shown in MonthReveal)

**Season:** Film of the Season ✅, Flop of the Season ✅, Picker of the Season ✅, Auteur Award 🎩 ✅, Ice Cold ✅, Most Divisive Film ✅, Most Unanimous Film ✅, Harshest Critic ✅, Most Generous ✅, The Contrarian ✅, The Oracle ✅, Most Consistent Picker ✅, Easy Crowd ✅, The Underrated 💎 ✅, The Deep Cut 🕳️ ✅

**Annual:** Film of the Year ✅, Worst Film of the Year ✅, Picker of the Year ✅, Harshest Critic ✅, Most Generous ✅, Most Divisive Film of the Year ✅, The Oracle of the Year ✅, Most Consistent ✅, The Wildcard ✅, Master of Disguise ✅, Most Evolved ✅ (dormant until the year spans ≥8 months of data), The Underrated 💎 ✅, The Deep Cut 🕳️ ✅

**All-Time:** Continuously updated — Greatest Film Ever Shown ✅, Worst Film Ever ✅, Most Divisive Film Ever ✅, Most Unanimous Film Ever ✅, Picker GOAT ✅, Coldest Critic Ever ✅, Biggest Softie Ever ✅, The Wildcard ✅, The Oracle (All-Time) ✅, Master of Disguise ✅, The Underrated 💎 ✅, The Deep Cut 🕳️ ✅

> Definitions added this session (no spec definition existed): **Easy Crowd** = member with fewest low scores (≤6.0 in code — the original ≤4.0 was dead since nobody scores that low), tie-break highest avg (distinct from Most Generous). **Master of Disguise** = picker whose films were correctly guessed least often (min 3 guesses). **Most Evolved** = member with the biggest avg shift between the year's first and second half (activates once ≥8 distinct months exist). **The Underrated** 💎 = film where club average minus TMDB average is the largest positive gap (the club valued it most above mainstream consensus). **The Deep Cut** 🕳️ = film scoring highest on genre rarity within the club catalog + obscurity (log-scaled inverse `tmdb_vote_count`). Both backed by `movies.tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`; badge appears on film + profile pages; computed across all four scopes.

**Auteur Award** 🎩 (Phase 6 — implemented, NOT a vote): per Ryan's decision the Auteur is *not* a ranked-choice member vote (scores already rank the films). It's the season's **best picker by average pick score** with a body-of-work bar (≥2 scored picks), **finalized only after that season's readjustment window has closed** (and the season is over) so it reflects the locked scores. Distinct from Picker of the Season (which allows a single pick and is provisional). Computed in `computeSeasonAwards` (gated on `seasons.readjustment_open` / `readjustment_ends_at`), shown on the Awards Season tab + the badge grid. The AI-dependent pieces (Best Review, AI recap) are now also implemented via the `ai-recap` Edge Function — the award catalog is fully built.

The Vault: films averaging ≥ 8.5 (configurable). Auto-removes if average drops below threshold after score updates.

**Awards display:** Shown on film pages (awards that film won) and on profile pages (all awards a user has won, including awards for films they picked).

---

## New Files (Session 9)

- `src/components/AwardsBadges.jsx` — collapsible badge-grid component for awards; used on Profile and in the film overlay
- `src/context/MemberOverlayContext.jsx` — global context that opens the member profile overlay from anywhere in the app
- `src/lib/authLog.js` — `logAuthEvent()` and `deliberateSignOut()` for auth diagnostics
- `supabase/migrations/` — new migration files for: `auth_events` table, `months` admin RLS policies, `reactions` unique constraint, `materialize_and_split_month` service-context support

## New Files (Phase 4 + subsequent sessions)

- `src/context/NotificationsContext.jsx` — notification load, Realtime subscription, markRead/markAllRead, preference state
- `src/components/NotificationCenter.jsx` — bell + unread badge; desktop popover / mobile bottom sheet
- `public/sw.js` — service worker for Web Push
- `supabase/functions/send-push/` — Deno Edge Function (npm:web-push); sends Web Push + prunes expired subscriptions
- `supabase/migrations/` — additional migrations for: `notifications` table + SECURITY DEFINER triggers, `notification_preferences`, `push_subscriptions`, `movies` TMDB columns (`tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`, `tmdb_cast`), pg_net email trigger, push_notification trigger, vault secrets setup
