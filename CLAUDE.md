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

## Architecture: Scoring Rules

- Range: 0.01–10.00 (two decimal places, always displayed as X.XX)
- Pre-watch excitement score submitted **before** final score; permanently locked once final score is submitted
- **If a user has already submitted their final score, the excitement score input must be locked/hidden**
- Final score confirmation dialogue triggers above 8.99 or below 2.01 (admin-adjustable thresholds)
- Scores locked on submission; changes outside the seasonal readjustment window require admin approval via `score_change_requests` table
- During seasonal readjustment window: score changes allowed freely
- Missing scores after deadline = absent (not zero); group averages calculated from available scores only
- Late scores trigger stat recalculation + notifications to all members
- **Back-calculation:** If exactly one member's score is missing for a film and `historical_avg_score` is set, back-calculate the missing score as `(historical_avg * expected_count) - sum(known_scores)`. Store as a real rating entry attributed to that user. Only apply if result is within 0.01–10.00.

---

## Architecture: Deadline & Timezone Logic

- All deadlines stored and enforced in **Pacific Time (PT)** (for fairness to Chris Deschenes, the west coast member)
- Displayed in each user's local timezone using the browser's `Intl` API
- Grace period (default 1–2 days, configurable) is invisible to regular members — results appear after deadline from their perspective
- If all scores submitted before deadline, results reveal immediately

---

## Key Data Models

```
users          — id, name, email, avatar_id, user_color, role, timezone, joined_at,
                 is_active, has_completed_onboarding, admin_mode_enabled,
                 last_online_at, show_last_online, created_at
seasons        — id, name, start_date, end_date
                 (Quarterly: Winter Dec–Feb · Spring Mar–May · Summer Jun–Aug · Autumn Sep–Nov.
                  First season = Winter 2026, partial from the club founding date Jan 5 2026.)
months         — id, season_id, month_year, reveal_date, end_of_month_reveal_date, status
movies         — id, month_id, title, tmdb_id, picked_by_user_id, pick_justification,
                 scores_revealed (bool), picker_revealed (bool), scoring_deadline,
                 streaming_providers (json), historical_avg_score,
                 poster_url, year_released, director, runtime, overview
ratings        — id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club,
                 submitted_at
reviews        — id, movie_id, user_id, body (one primary review per user per film)
comments       — id, movie_id, user_id, parent_comment_id (nullable), body, reaction_counts
reactions      — id, comment_id, user_id, emoji (aggregated into comments.reaction_counts at query time)
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

### This Month sub-tabs
Films · Deadlines · Picks · Reveal *(active only after end-of-month reveal)*

- **Films tab:** Shows current month's films with scoring status
- **Deadlines tab:** Countdown timers per film
- **Picks tab:** Shows all active members' upcoming picks for the *next* month (hidden until reveal — could be 4 or 5 depending on who sits out). A "Pick your next movie" CTA button triggers the TMDB search → disambiguation → justification → confirm submission flow. No search/filter bar on the picks display.
- If current month has no films yet (e.g. picks not entered yet): show "No picks yet for [Month]" state
- **June 2026 exception:** Picks are being entered manually by the admin — the Picks tab may show an incomplete list until all picks are in.

### Films sub-tabs
All Films · The Vault · By Season · History

- **History tab:** Browse revealed months one at a time (month pills → 2-up film grid with picker labels). Complements All Films (flat wall) with a month-by-month view.

**Film ordering within each month:** follows the watch-order established in the group chat (earliest deadline first). Films are ordered by their DB insertion order (id ASC within a month).

### Stats sub-tabs
Overview · Me · Members · Club · Head to Head

- Clicking a film anywhere in Stats navigates to that film's page
- Clicking a member name anywhere in Stats navigates to their profile page
- Member names are clickable throughout the app (scores, stats, reviews, etc.)

### Awards sub-tabs
Monthly · Season · Annual · All-Time

- Awards are also shown on individual film pages (awards that film won)
- Awards are also shown on user profile pages (awards that user has won, including awards for films they picked)

---

## Themes

14 combinations: Light/Dark × 7 accent colors (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet). Implemented via CSS variables. Each member independently sets their own theme.

Light/dark mode toggle must be accessible from the Profile page.

User colors: 20 distinct options, one per member enforced (taken colors shown with strikethrough). Displayed as a colored ring around the member's avatar and as the color of the initials text when no avatar is set.

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
- Manual score entry for any user/film
- Member management (email, joined_at, activate/deactivate)
- "Films with missing scores" matrix:
  - Expected count based on members active at that time (pre-Zack = 4, post-Zack = 5)
  - Test accounts excluded from counts
  - Cells marked N/A (crossed out) when a member wasn't in the club for that film's month
- Trigger by month: bulk-reveal scores or pickers for all films in a month

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

**Season:** Film of the Season ✅, Flop of the Season ✅, Picker of the Season ✅, Ice Cold ✅, Most Divisive Film ✅, Most Unanimous Film ✅, Harshest Critic ✅, Most Generous ✅, The Contrarian ✅, The Oracle ✅, Most Consistent Picker ✅, Easy Crowd ⏳, Auteur Award (member vote) ⏳

**Annual:** Film of the Year ✅, Worst Film of the Year ✅, Picker of the Year ✅, Harshest Critic ✅, Most Generous ✅, Most Divisive Film of the Year ✅, The Oracle of the Year ✅, Most Consistent ✅, The Wildcard ✅, Master of Disguise ⏳, Most Evolved ⏳

**All-Time:** Continuously updated — Greatest Film Ever Shown ✅, Worst Film Ever ✅, Most Divisive Film Ever ✅, Most Unanimous Film Ever ✅, Picker GOAT ✅, Coldest Critic Ever ✅, Biggest Softie Ever ✅, The Wildcard ✅, The Oracle (All-Time) ✅, Master of Disguise ⏳

The Vault: films averaging ≥ 8.5 (configurable). Auto-removes if average drops below threshold after score updates.

**Awards display:** Shown on film pages (awards that film won) and on profile pages (all awards a user has won, including awards for films they picked).
