# Movie Club

A private web app for a 5-person movie club. Each month every member picks one film they have not personally seen; all members watch all films and submit scores, reviews, and discussion. The app handles picks, anonymity before reveal, scoring, Reddit-style threaded reviews with votes, guess-the-picker, score predictions, stats and charts, awards, and admin tooling.

**Live:** private, invite-only deployment (URL shared with members, not published here).

---

## Features

### Core
- **Monthly Picks** — Submit film picks with TMDB integration for automatic metadata, posters, and streaming providers
- **Two-tier Reveal System** — Per-film score reveal (after scoring deadline) and end-of-month picker identity reveal; RLS enforces visibility rules throughout
- **Pick Lifecycle** — Picks materialize into films for the active month; scoring deadlines auto-split evenly across the month's films
- **Dual Scoring** — Pre-watch excitement score (locked once final score is submitted) and final score (0.01–10.00, two decimal places); backfill mode skips excitement and goes straight to final score entry
- **Guess-the-Picker & Score Predictions** — Members guess who picked each film; the picker predicts every other member's score for their own pick

### Discussion
- **Reddit-style Threaded Reviews** — Members post multiple reviews per film; comments nest under reviews and each other
- **Votes** — Up/down votes on reviews and comments (one per user per target); idempotent upsert, re-voting never errors
- **Emoji Reactions** — Reactions on reviews and comments (polymorphic target model); idempotent upsert, re-reacting never errors
- **15-minute Edit Window** — Authors can edit their own posts within 15 minutes; admins can delete any post
- **@Mentions** — Inline mentions preserved throughout

### Stats and Charts
- Score distribution histogram, scores over time (trend line, per-member overlay, neutral grey dotted TMDB line), member comparison bar chart, excitement vs. final scatter, head-to-head score delta matrix
- Per-user scoring granularity and standard deviation, avg score per release decade, club-vs-TMDB vote average comparison (auto-scaled scatter), genre pie chart with filter link-outs
- **Connection Web / 6 Degrees** — radial SVG node-link graph linking films by shared actor or director; hover/tap a film to highlight its connections and see who bridges them; nodes open the film overlay. Backed by `movies.tmdb_cast` (top-billed cast, backfilled from TMDB)
- **Genre Blindspot Grid** — per-member genre coverage matrix showing which genres each member has (or hasn't) scored
- All Films has a filter-by-member control (revealed picks only); member colors in charts now read the DB `user_color` field so a chosen color propagates everywhere
- Clicking a film anywhere in Stats opens the film overlay; clicking a member name opens the member overlay (profile popup); season/year ranking lists are collapsible
- Improved chart interactions: histogram selected bar glows, club-by-film trend keyed by id, taste-correlation uses accent color, std-dev/mean overlays show numeric values

### Awards
Monthly, seasonal, annual, and all-time awards computed automatically from scoring data (`historical_avg_score` is authoritative in all computations). Awards appear as a collapsible badge grid (`AwardsBadges` component) on film overlay and member profiles. Deep-link to any award via `scope`/`key`/`ref` query params. Categories include: Pick/Flop of the Month, The Contrarian, The Oracle, Hype Machine, Most Divisive, Most Unanimous, Film/Picker of the Season, Harshest Critic, Most Generous, Easy Crowd, Master of Disguise, Most Evolved, and more. New awards: **The Underrated** (💎, club avg minus TMDB avg — biggest positive gap) and **The Deep Cut** (🕳️, genre rarity + inverse TMDB vote count). Both backed by new `movies` columns `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`. The Auteur Award (ranked-choice member vote) is planned for Phase 6.

### Member Profiles
- **Member Overlay** — Clicking any member name or avatar anywhere in the app (Home, Stats, Awards, Films legend, film overlay) opens a profile popup via `MemberOverlayContext`; closing it returns you exactly where you were. The bottom-bar Profile tab remains your own profile. `/profile/:id` is kept as a deep-link fallback.
- Profile shows: awards badge grid, films the member picked (by month with score), recent scores (click to open film overlay), user color, and a "View full stats" link

### Auth and Reliability
- **Intermittent sign-out fix** — `fetchProfile` now distinguishes a transient network/DB error from a genuine missing user row: it retries once and never blanks an existing session on error; the app shows a Retry screen instead of redirecting to `/not-approved`
- **Auth diagnostics** — `auth_events` table (admin-read; open insert so sign-out events log even while signed out) + `src/lib/authLog.js` (`logAuthEvent` fire-and-forget; `deliberateSignOut()` tags user-initiated sign-outs)

### Notifications
- **In-app notification center** — bell icon with unread badge (desktop sidebar popover, mobile bottom sheet); per-type glyphs, click-to-navigate + mark-read, "mark all read", empty state. `NotificationsContext` loads rows and subscribes via Supabase Realtime for live updates.
- **Notification engine** — `public.notifications` table (RLS: recipient reads/updates own rows; rows created only by SECURITY DEFINER triggers). Triggers fire only on meaningful events: a film's `scores_revealed` flip, `months.status` → `active` (new month) or → `revealed` (end-of-month), a reply to your review/comment, an @mention (parsed from body), and a `score_change_requests` decision (approved/denied).
- **Preferences** — `public.notification_preferences` table; Profile "Notifications" section lets each member toggle per-event-type mute, set quiet hours (from/until in their timezone), and enable Email or Browser-push delivery. Muting filters the in-app center and badge immediately.
- **Email delivery (Resend)** — a DB trigger POSTs to Resend via the `pg_net` extension when the recipient has email enabled, hasn't muted the type, and is outside quiet hours. Resend API key and app base URL are stored in `supabase_vault`. Opt-in (default off). *Note: full multi-member delivery requires a verified sending domain in Resend; test mode reaches the account owner only.*
- **Web Push delivery** — `public.push_subscriptions` table; `send-push` Edge Function (Deno, `npm:web-push`) sends to a user's subscriptions with VAPID and prunes expired ones (404/410); DB trigger gathers subscriptions + VAPID private key from vault and POSTs to the function via `pg_net`; `public/sw.js` service worker. Profile's Browser-push toggle gates on browser permission + service-worker support. *Note: iOS requires Add to Home Screen (PWA) for push to work.*
- **Scheduling (Phase 4c — auto month-activation + deadline enforcement/auto-reveal via pg_cron) is intentionally deferred** until closer to launch; deadlines remain display-only for now.

### Personalization
- Light/dark mode (bound to `.dark` class, not `prefers-color-scheme`)
- 7 accent colors (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet); light-mode accent overrides ensure vibrant, legible colors (dark mode unchanged)
- Active bottom-nav tab uses the accent color
- 20 distinct user colors (one-per-member enforced; taken colors shown with strikethrough in picker); chosen color propagates into Stats charts and the Films member filter via `userColor()` helper

### Admin
- OP role: a single operator (is_op) has exclusive ability to promote/demote admins; admins manage everything else
- Trigger score reveal and picker reveal per film or per entire month
- Manual score entry (can overwrite existing); missing-score matrix with member-presence awareness
- Film metadata editing, streaming provider refresh, member management (activate/deactivate)
- Materialize picks into films and recompute scoring deadlines for a month; month `status='active'` update now correctly persists (RLS INSERT/UPDATE policies added)
- **Upcoming Picks preview** — admin-only panel behind a Reveal toggle; members never see others' picks pre-reveal
- **Auto genre backfill** — Admin dashboard auto-fills genre when any film is missing one

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Routing | React Router 7 |
| Styling | Tailwind CSS v4 |
| Backend / DB | Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions) |
| Hosting | Vercel |
| Movie Data | TMDB API |
| Email | Resend (server-side only, via Edge Functions) |
| Push Notifications | Web Push API (via Edge Functions) |
| AI Features | Anthropic Claude API (server-side only, via Edge Functions) |
| Testing | Vitest + React Testing Library |

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Environment

Copy `.env.example` to `.env` and fill in values, or contact a maintainer. The only client-safe keys are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TMDB_READ_ACCESS_TOKEN`. All other secrets (`SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) live exclusively in Supabase Edge Function environment variables and are never exposed to the client.

---

## Schema and Migrations

The full database schema lives in `supabase/migrations/`. Migrations are tracked in order and applied via the Supabase CLI (`supabase db push`) or the Supabase dashboard.

Key tables: `users` (+ `is_op`), `seasons`, `months` (+ `active_date`), `movies` (+ `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`, `tmdb_cast`), `ratings`, `upcoming_picks`, `reviews`, `comments` (+ `review_id`, `parent_comment_id`), `reactions` (polymorphic, unique constraint on target_type/target_id/user_id/emoji), `votes`, `picker_guesses`, `score_predictions`, `score_change_requests`, `month_absences`, `awards`, `film_tags`, `auteur_votes`, `season_rankings`, `notifications` (SECURITY DEFINER triggers only; RLS recipient-own), `notification_preferences`, `push_subscriptions`, `auth_events` (admin-read, open insert for sign-out logging).

Key RPC: `public.materialize_and_split_month(p_month_id uuid)` — materializes picks into films and splits scoring deadlines evenly.

Infrastructure additions: `pg_net` extension (outbound HTTP from DB triggers), `supabase_vault` secrets (`resend_api_key`, `app_base_url`, `vapid_private_key`, `vapid_subject`), Edge Function `send-push`.

> `PRIVATE.md` (member info and infra URLs) and `MOVIE_CLUB_SPEC.md` (authoritative spec) are gitignored and never committed.

---

## Navigation

**Mobile:** Bottom tab bar. **Desktop:** Left sidebar.

| Tab | Description |
|-----|-------------|
| Home | Your Turn cards, collapsible recent activity, Club Members browse strip, quick stats |
| This Month | Single consolidated scrolling view: film cards with inline deadline countdowns, Your Pick section (pick CTA / change-pick / others' picks after reveal), Reveal section (picker identities, justifications, guess + prediction results, monthly awards — shown once fully revealed) |
| Films | All Films (floating hide-scores toggle; filter by member; upcoming-month films excluded), The Vault, By Season, History |
| Stats | Overview, Me, Members, Club (incl. Connection Web + Genre Blindspot Grid), Head to Head |
| Awards | Monthly, Season, Annual, All-Time (incl. The Underrated + The Deep Cut) |
| Profile | Theme, user color picker (collapses after choosing), Notifications settings (per-type mute, quiet hours, email + push toggles), films you picked, awards badge grid, sign out |
| Admin | Dashboard, film editing, member management, score matrix, Upcoming Picks preview *(admin only)* |

---

## Build Phases

| Phase | Scope |
|-------|-------|
| 1 — MVP | Auth, onboarding, TMDB pick submission, scoring, film pages, poster wall, admin, historical data import |
| 2 — Social | Reviews, threaded comments, votes, reactions, @mentions, guess-the-picker, score predictions, full reveal system, score change requests |
| 3 — Themes and Personalisation | Light/dark mode, accent colors, user colors, avatar library, settings |
| 4 — Notifications and Scheduling | Email/push notifications, deadline enforcement, grace periods, auto month-activation |
| 5 — Stats and Visualizations | All chart types, Rotten Tomatoes comparison |
| 6 — Awards and Recaps | Auteur Award (ranked-choice vote), AI recap, seasonal readjustment window |
| 7 — Polish | Guest mode, export, milestones, veto voting, watchlist, draft queue |

Phases 1–4a/4b are complete. Phase 4c (pg_cron auto-activation + deadline enforcement) is intentionally deferred until closer to launch; deadlines remain display-only and the admin "trigger now" button is available in the meantime. Sessions 1–9+ have also delivered portions of Phases 5–6 work (Connection Web, Genre Blindspot Grid, The Underrated/The Deep Cut awards, stats charts, auth hardening, member overlays) ahead of their formal phase.

---

## Contributing

This is a private project for a 5-person movie club. Contact a maintainer if you would like to contribute.

**GitHub:** [@ryangarymiller](https://github.com/ryangarymiller)
