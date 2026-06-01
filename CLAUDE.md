# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

A private web app for a 5-person movie club. Each month every member picks one film they haven't personally seen; all members watch all films, submit scores and reviews. The app handles picks, anonymity, scoring, reviews, stats, visualizations, and awards.

**Club members:** Ryan Miller (owner/admin), Ryan Bey (admin), Andrew Bond, Zack Anjoorian, Chris Deschenes  
**Club founding date:** January 5, 2026  
**Zack joined:** April 2026 — exclude him from Jan–Mar stats entirely

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
1. `.gitignore` — must include `.env` and `MOVIE_CLUB_SPEC.md`
2. `.env` — populated with all keys from the spec's Pre-Launch Setup Checklist (never commit)
3. Run: `npx skills add supabase/agent-skills`

**Supabase project:** `https://pjwttvazgabwcybrwpmx.supabase.co`  
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

---

## Architecture: Anonymity & Reveal System

This is the most architecturally significant system — it affects RLS policies, queries, and UI throughout the app.

### Two-tier reveal

**Per-film reveal (weekly):** Each film has a `scoring_deadline`. When it passes, `movies.scores_revealed` flips to `true` — individual member scores become visible to everyone.

**End-of-month reveal:** After all film deadlines pass, a separate event flips `movies.picker_revealed = true` on all films simultaneously — this reveals picker identity, pick justifications, guess-the-picker results, and score predictions.

### Rolling score visibility (before deadline)
Before a film's scoring deadline: you can only see scores and discussions for members who have both watched AND submitted — and only if you've also watched and submitted. RLS enforces this.

### RLS enforcement
- `movies.picked_by_user_id` and `pick_justification` must be excluded from non-admin queries until `picker_revealed = true`
- Individual scores visibility is gated on `scores_revealed` per film AND the rolling watch-and-submitted check
- Admins always see everything
- At end-of-month reveal, `picker_revealed` flips and Supabase realtime subscriptions push updates to all clients

---

## Architecture: Scoring Rules

- Range: 0.01–10.00 (two decimal places, always displayed as X.XX)
- Pre-watch excitement score submitted **before** final score; permanently locked once final score is submitted
- Final score confirmation dialogue triggers above 8.99 or below 2.01 (admin-adjustable thresholds)
- Scores locked on submission; changes outside the seasonal readjustment window require admin approval via `score_change_requests` table
- During seasonal readjustment window: score changes allowed freely
- Missing scores after deadline = absent (not zero); group averages calculated from available scores only
- Late scores trigger stat recalculation + notifications to all members

---

## Architecture: Deadline & Timezone Logic

- All deadlines stored and enforced in **Pacific Time (PT)** (for fairness to Chris Deschenes, the west coast member)
- Displayed in each user's local timezone using the browser's `Intl` API
- Grace period (default 1–2 days, configurable) is invisible to regular members — results appear after deadline from their perspective
- If all scores submitted before deadline, results reveal immediately

---

## Key Data Models

```
users          — id, name, email, avatar_id, user_color, role, timezone, joined_at
seasons        — id, name, start_date, end_date
months         — id, season_id, month_year, reveal_date, end_of_month_reveal_date, status
movies         — id, month_id, title, tmdb_id, picked_by_user_id, pick_justification,
                 scores_revealed (bool), picker_revealed (bool), scoring_deadline,
                 streaming_providers (json), historical_avg_score
ratings        — id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club
reviews        — id, movie_id, user_id, body (one primary review per user per film)
comments       — id, movie_id, user_id, parent_comment_id (nullable), body, reaction_counts
picker_guesses — id, movie_id, guessing_user_id, guessed_user_id
score_predictions — id, movie_id, predicting_user_id, target_user_id, predicted_score
upcoming_picks — id, user_id, tmdb_id (hidden from all others until reveal)
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
- If TMDB returns no providers or fails: fall back to a server-side Claude API call (web search + parse)
- If both fail: display "No streaming availability found"

---

## Navigation Structure

**Mobile:** Bottom tab bar (6 items + Admin when admin mode on)  
**Desktop:** Left sidebar  
**Tabs:** Home · This Month · Films · Stats · Awards · Profile · Admin *(admin only)*

### This Month sub-tabs
Films · Deadlines · Upcoming · Reveal *(active only after end-of-month reveal)*

### Films sub-tabs
All Films · The Vault · By Season

### Stats sub-tabs
Overview · Me · Members · Club · Head to Head

### Awards sub-tabs
Monthly · Season · Annual · All-Time

---

## Themes

14 combinations: Light/Dark × 7 accent colors (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet). Implemented via CSS variables. Each member independently sets their own theme.

User colors: 20 distinct options, one per member enforced (taken colors shown with strikethrough). Displayed as a colored ring around the member's avatar.

---

## Historical Data

Import source: Google Sheet "Movie Club" (accessible via Google Drive MCP) + chat log at `/data/data/com.termux/files/home/storage/downloads/movie_club_chat.txt` for individual scores.

All historical films (Jan–May 2026) import with `scores_revealed = true` and `picker_revealed = true`. May 2026 has only 4 picks — verify with admin whether Zack's pick is missing.

---

## Guest Mode

Public read-only, no login required. Shows post-reveal data only (poster wall, film pages, scores, reviews). Member names shown as "First L." only. Hides: individual profiles, watchlists, draft queues, upcoming picks, pre-reveal data.

---

## Seasonal Readjustment

Opens automatically at the start of each new season for the previous season (default 1 week). Members can update scores freely during this window; ranking is always score-derived (not drag-and-drop). After window closes, scores and rankings are locked in `season_rankings`. Completing readjustment unlocks the Auteur Award ballot for that season (ranked choice, instant runoff, can't vote for yourself).

---

## Awards Summary

**Monthly:** Pick of Month, Flop of Month, The Contrarian, The Oracle, Hype Machine, The Letdown, Most Divisive, Most Unanimous, Best Review (AI-assisted)

**Season:** Picker of Season, Ice Cold, Easy Crowd, Auteur Award (member vote), Most Consistent Picker, Film of Season

**Annual:** Film of Year, Picker of Year, Harshest Critic, Most Generous, Master of Disguise, Most Consistent, Most Evolved, The Wildcard

**All-Time:** Continuously updated — Picker GOAT, Master of Disguise, The Wildcard, Coldest Critic, Biggest Softie, Most Divisive Film Ever, Greatest Film Ever Shown

The Vault: films averaging ≥ 8.5 (configurable). Auto-removes if average drops below threshold after score updates.
