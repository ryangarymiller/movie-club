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
6. **Phase 6 — Awards & Recaps:** Automated awards, Auteur vote, AI recap, The Vault, season readjustment
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
- **Auth diagnostics:** `src/lib/authLog.js` exports `logAuthEvent()` (fire-and-forget insert into `auth_events`) and `deliberateSignOut()` (tags sign-out as user-initiated before calling Supabase signOut). Logs include `SIGNED_OUT` (with `user_initiated` flag, visibility, and online status) and profile-fetch retry/error events. The `auth_events` table has open INSERT so signed-out events can still be logged without an authenticated session; reads are admin-only.

---

## Architecture: Anonymity & Reveal System

This is the most architecturally significant system — it affects RLS policies, queries, and UI throughout the app.

### Two-tier reveal

**Per-film reveal (weekly):** Each film has a `scoring_deadline`. When it passes, `movies.scores_revealed` flips to `true` — individual member scores become visible to everyone.

**End-of-month reveal:** After all film deadlines pass, a separate event flips `movies.picker_revealed = true` on all films simultaneously — this reveals picker identity, pick justifications, guesses, and predictions.

### Rolling score visibility (before deadline)
Before a film's scoring deadline: you can only see scores and discussions for members who have both watched AND submitted — and only if you've also watched and submitted. RLS enforces this.

**Exception:** A user can always see their own score for a film regardless of `scores_revealed` status.

### RLS enforcement
- `movies.picked_by_user_id` and `pick_justification` must be excluded from non-admin queries until `picker_revealed = true`
- Individual scores visibility is gated on `scores_revealed` per film AND the rolling watch-and-submitted check
- Admins always see everything
- At end-of-month reveal, `picker_revealed` flips and Supabase realtime subscriptions push updates to all clients

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

## Architecture: Pick → Film Lifecycle

When a month is activated, a member's `upcoming_picks` row materializes into a `movies` row for that month. The RPC `public.materialize_and_split_month(p_month_id)` handles materialization and auto-splits scoring deadlines evenly across the resulting film count. Admins trigger this via an "Activate / Trigger now" button on the Admin panel; automatic activation on `active_date` is deferred to Phase 4.

**Deadlines are display-only for now (dev mode, until launch/July).** Enforcement, grace periods, and auto month-activation on the 1st are Phase 4 work.

The "Activate / Trigger now" action now correctly persists the `status='active'` update (admin INSERT/UPDATE RLS policies on `months` were added in Session 9 to fix a silent block). The RPC also accepts a service/privileged context (`auth.uid()` null) so server-side or migration-driven materialization works without a signed-in user.

The signed-in user's own pick shows inline on the This Month page (clickable → justification + change-pick flow). Upcoming-month films are excluded from the Films page (no pre-activation pick leak). Once materialized, picks become film cards on the This Month page with inline deadlines.

---

## Architecture: Deadline & Timezone Logic

- All deadlines stored in **Pacific Time (PT)** (for fairness to Chris Deschenes, the west coast member); displayed in each user's local timezone via the browser's `Intl` API
- **Deadlines are currently display-only** — enforcement, grace periods, and auto-reveal on deadline passage are Phase 4
- Grace period (default 1–2 days, configurable) is invisible to regular members — results appear after deadline from their perspective
- If all scores submitted before deadline, results reveal immediately

---

## Key Data Models

```
users          — id, name, email, avatar_id, user_color, role, is_op (bool), timezone, joined_at,
                 is_active, has_completed_onboarding, admin_mode_enabled,
                 last_online_at, show_last_online, created_at
                 (is_op: sole power to grant/revoke admin; an op is also an admin — role stays 'admin')
seasons        — id, name, start_date, end_date
                 (Quarterly: Winter Dec–Feb · Spring Mar–May · Summer Jun–Aug · Autumn Sep–Nov.
                  First season = Winter 2026, partial from the club founding date Jan 5 2026.)
months         — id, season_id, month_year, reveal_date, end_of_month_reveal_date, status,
                 active_date (date the month goes active; defaults to the 1st; admin-adjustable)
movies         — id, month_id, title, tmdb_id, picked_by_user_id, pick_justification,
                 scores_revealed (bool), picker_revealed (bool), scoring_deadline,
                 streaming_providers (json), historical_avg_score,
                 poster_url, year_released, director, runtime, overview
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
watchlist      — private per user
draft_queue    — private per user, drag-and-drop ranked
film_tags      — id, movie_id, user_id, tag (aggregated at query time with counts)
auteur_votes   — id, season_id, voter_user_id, rankings (json array, ranked choice)
season_rankings — id, season_id, user_id, movie_id, rank, locked_score (locked at end of window)
score_change_requests — id, rating_id, user_id, requested_score, status (pending|approved|denied)
month_absences — id, month_id, user_id (excludes member from picker stats that month)
notifications  — id, user_id, type, payload, channel (email|push)
awards         — id, user_id, award_key, scope (monthly|seasonal|annual|alltime), period_ref
auth_events    — id, user_id (nullable), event, user_initiated (bool), detail (jsonb), user_agent, created_at
                 (admins read; open insert so signed-out events still log;
                  used by src/lib/authLog.js — logAuthEvent() fire-and-forget,
                  deliberateSignOut() tags user-initiated sign-outs;
                  logs SIGNED_OUT with user_initiated + visibility/online, and profile-fetch retries/errors)

RPC: public.materialize_and_split_month(p_month_id uuid) SECURITY DEFINER
     — materializes upcoming_picks into movies for the given month and auto-splits scoring
       deadlines evenly by film count; accepts service/privileged context (auth.uid() null)
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
2. **Your Pick section:** Pick CTA ("Pick your next movie" → TMDB search → disambiguation → justification → confirm), the signed-in user's own pick inline (clickable → justification + change-pick flow), and — after the end-of-month reveal — other members' picks are shown and guess/predict nudge appears.
3. **Reveal section:** Shown only after `end_of_month_reveal_date` passes / `picker_revealed` is true for all films. Displays picker identities, pick justifications, guess + prediction results, monthly awards, and the month's recap. Hidden until the month is fully revealed.

**June 2026 exception:** Picks are being entered manually by the admin — the picks section may show an incomplete list until all picks are in.

### Films sub-tabs
All Films · The Vault · By Season · History

- **All Films:** Sort options — Most/Least Recent (months desc, watch-order reversed within month), Highest/Lowest Rated, Most/Least Divisive, By Member. Group average computed from actual ratings when `scores_revealed` and `historical_avg_score` is null (fixes missing May 2026 scores). Floating "hide scores" toggle hides score, divisive-sort stddev, and the vault gold star. Film title rendered under each poster. Genre tags deep-link to All Films filtered by that genre (genre filter active). Vault badge links to the Vault tab. Divisive sort shows stddev. "Where to watch" entries are links. "Pickers" legend renamed "Club Members" with profile links. Member names/avatars in the film overlay link to profiles. Upcoming-month films excluded (no pre-activation pick leak).
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
- **Additional stats implemented:** avg score per release decade, per-user scoring granularity, per-user std dev, per-movie breakdown, club-vs-TMDB comparison (uses `tmdb_vote_average`), expandable per-member cards, dynamic histogram bins, Club "score over time" trend line (club avg + per-member lines)
- **Session 9 stat polish:** Member names in scoring granularity, scoring variation, picker power rankings, score percentile generosity, most active scorer, and scoring streaks all link to the member overlay. Film titles in per-film spread, season/year rankings, and excitement-vs-final open the film overlay. Season/year ranking lists are collapsible. Genres link to the genre-filtered Films page. Genre pie single-selects + updates tooltip + legend links out. Club by-film trend chart click maps to the correct film (keyed by id). Histogram selected bar glows. Club-vs-TMDB scatter auto-scales to the data. Given/Received/Club-avg has y-axis labels + a data-driven domain. Taste-correlation uses the accent color. Std-dev/mean overlay lines are visually distinct with numeric values. Scoring-variation x-axis labels rounded.

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

Member overlay contains: profile card, awards badge grid (collapsible), "Films [member] picked" section (by month, with score), recent scores (each opens the film overlay), and a "View full stats" link.

### Smart Linking (global)

Films open the film overlay and member names/avatars open the **member overlay** throughout the app — Home, Stats, Awards, Films, the film overlay. (Direct `/profile/:id` navigation is preserved as a deep-link fallback.) Home "all caught up" box links to that month's scores (Films History); Home stats link to the relevant film or Films page. Home includes a "Club Members" browse strip and a collapsible Recent Activity section.

### Modal Safety

Global CSS classes `.mc-modal-backdrop` / `.mc-modal-panel` ensure modals never overflow the viewport top (mobile keyboard / off-screen safety). Apply these to all modals. ScoreModal uses these classes; mobile keyboard push-up is fixed.

---

## Themes

14 combinations: Light/Dark × 7 accent colors (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet). Implemented via CSS variables. Each member independently sets their own theme.

Light/dark mode is bound to the `.dark` CSS class (not `prefers-color-scheme`) — toggled by adding/removing `.dark` on `<html>`. Toggle accessible from the Profile page.

**User colors:** Centralized in `src/lib/colors.js` — `MEMBER_COLORS` map, `USER_COLOR_PALETTE` of 20 hue-separated options, `memberColor()` helper, plus `CHART_CATEGORICAL`, `CHART_NEUTRAL`, and `chartColorAt()` for chart series. Colors are hue-separated so no two members' colors are confusable (e.g. Ryan Miller = purple `#a855f7`, distinct from Chris's blue). One color per member enforced; Profile color picker strikes out colors already taken by other members. The color picker collapses after a color is chosen.

Displayed as a colored ring around the member's avatar and as the color of the initials text when no avatar is set.

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
- **Op-only (Ryan Miller):** Admin Members tab shows Op / Admin / Member tiers; op can promote members to admin or demote admins to member. No other admin can change roles. **DB-enforced:** the `trg_enforce_op_role` trigger rejects any `role`/`is_op` change by a non-op, so it can't be bypassed via the API (the `materialize_and_split_month` RPC is likewise authorization-gated).

---

## Guest Mode

Public read-only, no login required. Shows post-reveal data only (poster wall, film pages, scores, reviews). Member names shown as "First L." only. Hides: individual profiles, watchlists, draft queues, predictions, guesses.

---

## Seasonal Readjustment

Opens automatically at the start of each new season for the previous season (default 1 week). Members can update scores freely during this window; ranking is always score-derived (not drag-and-drop). After window closes, scores lock and are fed into season awards calculation.

---

## Awards Summary

> Combined maximal catalog (union of spec + this doc + implemented). ✅ = computed today in
> `src/lib/awards.js`; ⏳ = catalogued but not yet implemented (needs AI, the Auteur vote,
> guess-the-picker data, or multi-period trends — Phase 6).

**Monthly:** Pick of the Month ✅, Flop of the Month ✅, The Contrarian ✅, The Oracle ✅, Hype Machine ✅, The Letdown ✅, The Surprise ✅, Most Divisive ✅, Most Unanimous ✅, Best Review (AI-assisted) ⏳

**Season:** Film of the Season ✅, Flop of the Season ✅, Picker of the Season ✅, Ice Cold ✅, Most Divisive Film ✅, Most Unanimous Film ✅, Harshest Critic ✅, Most Generous ✅, The Contrarian ✅, The Oracle ✅, Most Consistent Picker ✅, Easy Crowd ✅, Auteur Award (member vote) ⏳

**Annual:** Film of the Year ✅, Worst Film of the Year ✅, Picker of the Year ✅, Harshest Critic ✅, Most Generous ✅, Most Divisive Film of the Year ✅, The Oracle of the Year ✅, Most Consistent ✅, The Wildcard ✅, Master of Disguise ✅, Most Evolved ✅ (dormant until the year spans ≥8 months of data)

**All-Time:** Continuously updated — Greatest Film Ever Shown ✅, Worst Film Ever ✅, Most Divisive Film Ever ✅, Most Unanimous Film Ever ✅, Picker GOAT ✅, Coldest Critic Ever ✅, Biggest Softie Ever ✅, The Wildcard ✅, The Oracle (All-Time) ✅, Master of Disguise ✅

> Definitions added this session (no spec definition existed): **Easy Crowd** = member with fewest low scores (≤4.0), tie-break highest avg (distinct from Most Generous). **Master of Disguise** = picker whose films were correctly guessed least often (min 3 guesses). **Most Evolved** = member with the biggest avg shift between the year's first and second half (activates once ≥8 distinct months exist). Only **Auteur Award** (ranked-choice member vote) remains ⏳ — needs the Phase 6 voting system.

The Vault: films averaging ≥ 8.5 (configurable). Auto-removes if average drops below threshold after score updates.

**Awards display:** Shown on film pages (awards that film won) and on profile pages (all awards a user has won, including awards for films they picked).

---

## New Files (Session 9)

- `src/components/AwardsBadges.jsx` — collapsible badge-grid component for awards; used on Profile and in the film overlay
- `src/context/MemberOverlayContext.jsx` — global context that opens the member profile overlay from anywhere in the app
- `src/lib/authLog.js` — `logAuthEvent()` and `deliberateSignOut()` for auth diagnostics
- `supabase/migrations/` — new migration files for: `auth_events` table, `months` admin RLS policies, `reactions` unique constraint, `materialize_and_split_month` service-context support
