# Movie Club

A private web app for a 5-person movie club. Each month every member picks one film they have not personally seen; all members watch all films and submit scores, reviews, and discussion. The app handles picks, anonymity before reveal, scoring, Reddit-style threaded reviews with votes, guess-the-picker, score predictions, stats and charts, awards, and admin tooling.

**Live:** private, invite-only deployment (URL shared with members, not published here).

---

## Features

### Core
- **Monthly Picks** — Submit film picks with TMDB integration for automatic metadata, posters, and streaming providers
- **Rolling Reveal System** — During the active month, score visibility is *rolling per viewer*: you see a film's club average and other members' scores only once you've submitted your own. A **soft deadline** auto-reveals a film's scores when it passes (non-scorers absent, not zeroed; late scores still count), and the end of the month reveals picker identities. All of it is enforced server-side by RLS.
- **Pick Lifecycle** — Always exactly one `active` + one `upcoming` month; picks always target the upcoming month and materialize into films on activation (`activate_month`), which splits scoring deadlines evenly. Activation is server-scheduled via `pg_cron` (auto-activates on the 1st at 12am PT) and self-perpetuating — each month seeds the next with auto-activation on.
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
- **Connection Web / 6 Degrees** — radial SVG node-link graph linking films by shared **actor, writer, or director**; tap a film to highlight its connections and see who bridges them (labelled `dir.` / `wr.` / actor name), tap a connecting line to isolate it; nodes open the film overlay. Backed by `movies.tmdb_cast` (full billed cast), `movies.tmdb_writers`, and `director`, all backfilled from TMDB
- **Genre Blindspot Grid** — per-member curation matrix showing which genres each member has (or hasn't) **picked** — a zero cell is a genre they've never curated from. Columns derive live from each film's genre, so new genres auto-populate
- **Cast & Crew + Person pages** — every film overlay lists director, writers, and full billed cast as tappable chips; each opens a `PersonOverlay` with that person's in-club filmography + a TMDB bio
- All Films has a filter-by-member control (revealed picks only); member colors in charts now read the DB `user_color` field so a chosen color propagates everywhere
- Clicking a film anywhere in Stats opens the film overlay; clicking a member name opens the member overlay (profile popup); season/year ranking lists are collapsible
- Improved chart interactions: histogram selected bar glows, club-by-film trend keyed by id, taste-correlation uses accent color, std-dev/mean overlays show numeric values

### Awards
Monthly, seasonal, annual, and all-time awards computed automatically from scoring data (`historical_avg_score` is authoritative in all computations). Awards appear as a collapsible badge grid (`AwardsBadges` component) on film overlay and member profiles. Deep-link to any award via `scope`/`key`/`ref` query params. Categories include: Pick/Flop of the Month, The Contrarian, The Oracle, Hype Machine, Most Divisive, Most Unanimous, Film/Picker of the Season, Harshest Critic, Most Generous, Easy Crowd, Master of Disguise, Most Evolved, **The Underrated** (💎, club avg minus TMDB avg — biggest positive gap), **The Deep Cut** (🕳️, genre rarity + inverse TMDB vote count), and more. The **Auteur Award** (🎩) is the season's best picker by average pick score (≥2 scored picks), finalized only after the season's readjustment window closes — *not* a member vote, since the scores already rank the films. **Best Review of the Month** is AI-assisted (see AI & Recaps).

### AI and Recaps
- **AI Monthly Recap + Best Review** — the `ai-recap` Edge Function (Deno, `claude-sonnet-4-6`, admin-gated) writes a short narrative recap of each month and picks the single best-written review into `month_recaps`. `ANTHROPIC_API_KEY` lives only in the function. Generated **once** per month and stable thereafter (server skip-if-exists + client load-gate; only an admin "Regenerate" forces a re-roll). The prompt lists films in **watch order** and disambiguates members who share a first name. Recaps render in the month reveal and on Films → History (revealed months only).
- **Streaming fallback** — when TMDB has no US providers for a film, a `streaming-fallback` Edge Function uses Claude web-search server-side.

### Seasonal Readjustment
At a season's end, an admin (or automatic anchor on the next season's first activation) opens a window during which members may freely re-score that season's films; `ScoreModal` switches the normally-locked score into an editable "Update score" mode. A banner shows while open. When it closes (manually or past its end), scores lock again and the season's Auteur Award finalizes. Window state lives on `seasons`; a global default length lives in `app_settings.readjustment_length_days`.

### Lists, Tags, Veto and Guest Mode (Phase 7)
- **Watchlist + Draft Queue** — private per-member lists on your own profile (films you want to watch / plan to pick, the queue ranked by drag or arrows). The draft queue also surfaces as a quick-pick list in the This Month pick flow; promoting a queued film consumes that queue row.
- **Film Tags** — members tag a film at rating time (compact picker in `ScoreModal`) and from the film overlay; tags render in aggregate (tag · count).
- **Veto Resubmission** — members can vote to veto an unscored pick; at the configurable threshold (default 3/5) the picker is prompted to resubmit via `resubmit_vetoed_pick()`.
- **Pick-Change Requests** — a member can request to swap a locked active-month pick; an admin approves (guarded on the film having zero scores) and the row swaps with fresh TMDB metadata.
- **Guest Mode** — public, read-only, no login. Reads three `SECURITY DEFINER` views (`guest_films`/`guest_scores`/`guest_reviews`) that bake in every safety filter (revealed-only, "First L." abbreviated names, test account excluded); base tables stay RLS-locked from `anon`.
- **Custom Avatars** — admins upload avatars to a public Storage bucket (`custom_avatars`), merged into the avatar picker alongside the static library.
- **Personal Data Export** — "download my data" (GDPR-style) on your own profile: gathers everything the app holds about you (ratings, reviews, comments, picks, draft queue, watchlist, guesses, predictions, awards, profile) into **JSON, CSV, or PDF**. Scoped strictly to the signed-in member's own id.

### Member Profiles
- **Member Overlay** — Clicking any member name or avatar anywhere in the app (Home, Stats, Awards, Films legend, film overlay) opens a profile popup via `MemberOverlayContext`; closing it returns you exactly where you were. The bottom-bar Profile tab remains your own profile. `/profile/:id` is kept as a deep-link fallback. "View full stats" opens a `MemberStatsOverlay` that renders that member's full Me-tab breakdown in their accent color.
- Profile shows: awards badge grid, films the member picked (by month with score), recent scores (click to open film overlay), user color, preferences (default film sort, timezone, show-last-online), a "Replay app tour" button, and a "View full stats" link
- **Guided Tour** — a skippable, replayable onboarding carousel (`GuidedTour`) that self-opens for members who haven't completed onboarding

### Auth and Reliability
- **Intermittent sign-out fix** — `fetchProfile` now distinguishes a transient network/DB error from a genuine missing user row: it retries once and never blanks an existing session on error; the app shows a Retry screen instead of redirecting to `/not-approved`
- **Auth diagnostics** — `auth_events` table (admin-read; open insert so sign-out events log even while signed out) + `src/lib/authLog.js` (`logAuthEvent` fire-and-forget; `deliberateSignOut()` tags user-initiated sign-outs)

### Notifications
- **In-app notification center** — bell icon with unread badge (desktop sidebar popover, mobile bottom sheet); per-type glyphs, click-to-navigate + mark-read, "mark all read", empty state. `NotificationsContext` loads rows and subscribes via Supabase Realtime for live updates.
- **Notification engine** — `public.notifications` table (RLS: recipient reads/updates own rows; rows created only by SECURITY DEFINER triggers). Triggers fire only on meaningful events: a film's `scores_revealed` flip, `months.status` → `active` (new month) or → `revealed` (end-of-month), a reply to your review/comment, an @mention (parsed from body), a `score_change_requests` decision, a `pick_change_requests` decision, a veto reaching threshold, and a **late score** (a score submitted on the active month after a film's deadline has revealed).
- **Preferences** — `public.notification_preferences` table; Profile "Notifications" section lets each member toggle per-event-type mute, set quiet hours (from/until in their timezone), and enable Email or Browser-push delivery. Muting filters the in-app center and badge immediately.
- **Email delivery (Resend)** — a DB trigger POSTs to Resend via the `pg_net` extension when the recipient has email enabled, hasn't muted the type, and is outside quiet hours. Resend API key and app base URL are stored in `supabase_vault`. Email is **opt-in (default off)**, sent from a verified domain so it delivers to any member who has enabled it — not just the account owner.
- **Web Push delivery** — `public.push_subscriptions` table; `send-push` Edge Function (Deno, `npm:web-push`) sends to a user's subscriptions with VAPID and prunes expired ones (404/410); DB trigger gathers subscriptions + VAPID private key from vault and POSTs to the function via `pg_net`; `public/sw.js` service worker. Profile's Browser-push toggle gates on browser permission + service-worker support. *Note: iOS requires Add to Home Screen (PWA) for push to work.*
- **Scheduling (`pg_cron`) is live** — `auto-activate-due-months` activates a scheduled month on its date (12am PT), and `enforce-due-deadlines` soft-reveals a film's scores once its deadline + grace passes. Both run hourly and are DST-safe.

### Personalization
- **4 theme modes** (lightest → darkest): `light` · `sepia` (warm paper) · `grey` (soft slate) · `dark`, via a 4-way segmented selector — 32 combinations with the 8 accents
- **8 accent colors** (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet, Hot Pink), each with an `--accent-rgb` triple so accent-tinted surfaces/heatmaps render in the chosen hue; light/sepia overrides keep all 8 legible
- **Cross-device persistence** — theme mode + accent are saved to the user's row (not just `localStorage`), so the choice follows them across devices
- Active bottom-nav tab uses the accent color
- 20 distinct user colors (one-per-member enforced; taken colors shown with strikethrough in picker); chosen color propagates everywhere via the `memberColor()` helper (reads the DB `user_color`)

### Admin
- OP role: a single operator (is_op) has exclusive ability to promote/demote admins (DB-enforced via `trg_enforce_op_role`); admins manage everything else
- **Month Activation** — "Activate now" (`activate_month`), an editable activation date, and an auto-activate toggle (Save schedule). The single-active invariant is enforced
- **Deadline Grace** — tune `app_settings.deadline_grace_days` (how long after a deadline scores auto-reveal; 0 = at the deadline)
- **Season Readjustment** — open/close a season's re-scoring window, with a global default length and per-season auto toggle
- **AI Month Recaps** — generate/regenerate a month's recap + Best Review (auto-generates for revealed months lacking one)
- Trigger score reveal and picker reveal per film or per entire month
- Manual score entry (can overwrite existing); missing-score matrix with member-presence awareness + one-click back-calculation when exactly one score is missing and a historical average exists
- Film metadata editing, streaming provider refresh, member management (activate/deactivate)
- **Pick-Change & Score-Change Requests** — approve/deny member requests from the dashboard
- **Upcoming Picks preview** — admin-only panel behind a Reveal toggle; members never see others' picks pre-reveal
- **Assets** — upload custom avatars to the public Storage bucket
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

Key tables: `users` (+ `is_op`), `seasons` (+ readjustment window fields), `months` (+ `active_date`, `auto_activate`), `app_settings` (singleton: `readjustment_length_days`, `veto_threshold`, `deadline_grace_days`), `movies` (+ `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`, `tmdb_cast`, `tmdb_writers`, `veto_resubmit_required`), `ratings`, `upcoming_picks`, `reviews`, `comments` (+ `review_id`, `parent_comment_id`), `reactions` (polymorphic, unique constraint), `votes`, `picker_guesses`, `score_predictions`, `score_change_requests`, `pick_change_requests`, `month_absences`, `awards`, `month_recaps`, `film_tags`, `watchlist`, `draft_queue`, `veto_votes`, `custom_avatars`, `auteur_votes`, `season_rankings`, `notifications` (SECURITY DEFINER triggers only; RLS recipient-own), `notification_preferences`, `push_subscriptions`, `auth_events` (admin-read, open insert for sign-out logging).

Column-level RLS: base `movies` SELECT is revoked and re-granted on every column except `picked_by_user_id` / `pick_justification`; the `movies_safe` definer view is the only path that exposes those (and only after `picker_revealed`). The guest views (`guest_films`/`guest_scores`/`guest_reviews`) are the controlled `anon` surface.

Key RPCs (all `SECURITY DEFINER`): `activate_month(p_month_id)` — the single activation orchestration (single-active invariant + materialize + split deadlines + guarantee a next upcoming month + auto-open prior season's readjustment); `resubmit_vetoed_pick(...)`; `is_admin(uuid)`; `auth_user_has_scored(...)` / `auth_user_picked(...)`. The legacy `materialize_and_split_month` still exists.

Infrastructure: `pg_net` (outbound HTTP from triggers) and `pg_cron` (`auto-activate-due-months`, `enforce-due-deadlines`); `supabase_vault` secrets (`resend_api_key`, `app_base_url`, `vapid_private_key`, `vapid_subject`); Edge Functions `send-push`, `ai-recap`, `streaming-fallback`.

> `PRIVATE.md` (member info and infra URLs) and `MOVIE_CLUB_SPEC.md` (authoritative spec) are gitignored and never committed.

---

## Navigation

**Mobile:** Bottom tab bar. **Desktop:** Left sidebar.

| Tab | Description |
|-----|-------------|
| Home | Your Turn cards, collapsible recent activity, Club Members browse strip, quick stats |
| This Month | Single consolidated scrolling view: film cards with inline deadline countdowns, Your Pick section (pick CTA / change-pick / others' picks after reveal), Reveal section (picker identities, justifications, guess + prediction results, monthly awards — shown once fully revealed) |
| Films | All Films (floating hide-scores toggle; filter by member; upcoming-month films excluded), The Vault, By Season, History (with each revealed month's AI recap + Best Review below the grid) |
| Stats | Overview, Me, Members, Club (incl. Connection Web + Genre Blindspot Grid), Head to Head |
| Awards | Monthly, Season, Annual, All-Time (incl. The Underrated, The Deep Cut, Auteur) |
| Profile | Theme (4 modes + 8 accents), user color picker, Notifications settings (per-type mute, quiet hours, email + push toggles), preferences (default sort, timezone, last-online), watchlist + draft queue, films you picked, awards badge grid, Replay app tour, sign out |
| Admin | Dashboard (activation, deadline grace, readjustment, AI recaps, requests), film editing, member management, score matrix, Upcoming Picks preview, Assets *(admin only)* |
| Guest | Public read-only view at `/guest` (revealed data, abbreviated names) — no login |

---

## Build Phases

| Phase | Scope |
|-------|-------|
| 1 — MVP | Auth, onboarding, TMDB pick submission, scoring, film pages, poster wall, admin, historical data import |
| 2 — Social | Reviews, threaded comments, votes, reactions, @mentions, guess-the-picker, score predictions, full reveal system, score change requests |
| 3 — Themes and Personalisation | 4 theme modes, 8 accent colors, user colors, avatar library, settings |
| 4 — Notifications and Scheduling | Email/push notifications, soft deadline enforcement, grace periods, auto month-activation |
| 5 — Stats and Visualizations | All chart types, club-vs-TMDB comparison |
| 6 — Awards and Recaps | Auteur Award (best picker), AI recap + Best Review, seasonal readjustment window |
| 7 — Polish | Guest mode, milestones, veto voting, watchlist, draft queue, film tags, custom avatars, person pages, personal data export (JSON/CSV/PDF) |

Phases 1–7 are substantially implemented. Notifications + scheduling are fully live: `pg_cron` drives both auto month-activation and **soft deadline enforcement** (a film's scores auto-reveal at its deadline + grace; non-scorers absent, late scores still count). The deliberately **un**built piece is a *hard* submission lock — the model is intentionally soft. Remaining is an optional admin-level club-wide export (personal "download my data" already ships) and a few cosmetic items.

---

## Contributing

This is a private project for a 5-person movie club. Contact a maintainer if you would like to contribute.

**GitHub:** [@ryangarymiller](https://github.com/ryangarymiller)
