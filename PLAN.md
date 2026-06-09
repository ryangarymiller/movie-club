# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Source of truth: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → this plan (all kept congruent).
> Last updated: 2026-06-09 (session 13)

---

## Session 13 — Phase 4c live + recap fidelity + docs congruence

- **Soft deadline enforcement ON (4c):** new `cron_enforce_due_deadlines()` + hourly `enforce-due-deadlines` pg_cron job — a film's **scores** auto-reveal once `scoring_deadline + app_settings.deadline_grace_days` (default 1) passes. Soft model: scores only (picker stays hidden), non-scorers absent (not zeroed), late scores still accepted. Admin **"Deadline Grace"** panel tunes the grace. Revealed the 4 overdue May films as the first run.
- **Self-perpetuating auto-activation (4c):** `activate_month` now seeds each next month with `auto_activate = true`, so after one manual kickoff the monthly cadence runs itself at 12am PT (the `auto-activate-due-months` cron was already on). June 2026 stays a manual kickoff (pre-existing, auto off); July onward is automatic.
- **AI recap hardening:** generate-once guarantee (server `force` flag + skip-if-exists; client `recapsLoaded` gate) so the recap never silently re-rolls; prompt now lists films in **watch order** (numbered, ordered by `scoring_deadline`) and disambiguates shared first names (the two Ryans) — fixed a recap that called the last film the month's kickoff. Regenerated May correctly.
- **Recaps on Films → History:** each revealed month's recap + the AI-picked **Best Review of the Month** now render below the film grid (revealed months only — the active month's recap names pickers). `RecapProse` exported from `MonthReveal`.
- **Late-score notifications:** `notify_late_score` trigger on `ratings` — a score on the active month's already-revealed film notifies every other member (type `late_score`, ⏰ glyph).
- **Adaptation RLS fix:** `ratings` rolling-reveal SELECT policy gained a direct `user_id = auth.uid()` clause so a member's first live score's upsert RETURNING no longer trips RLS.
- **UX:** This Month pick CTA absorbs the deadline reminder as a subtitle (dropped the redundant banner). Admin "dev mode / not enforced" copy replaced with the soft-enforcement description. Home milestones per-member; "23 watched" club-stat fix; Stats Overview avg-of-picks bar chart + member-avg dedup; ScoreModal "value invalid" + skip-excitement fixes; genre-pie focus-box removal.
- **Docs:** corrected email reality (verified domain delivers to opted-in members, not test-mode-only); full README/spec/CLAUDE congruence pass (4c live, Auteur = best picker, per-user export shipped, 4 modes/8 accents, Connection Web actor+writer+director).
- **Email finding:** of 5 members only the two Ryans have `channel_email = true`; Resend sends from a verified domain (`movieclub.cc`) — email works, most members just haven't opted in.

---

## Session 12 — Big browser-test batch (5 deploys)

- **Batch 1 — polish:** Awards posters as full 2:3 thumbnails; Home "Your Turn" deadlines + month-specific wording (no "all caught up" with no active month); genre pie tooltip fixed (selection info line, no sticky hover tooltip); score-over-time legend = solid club line + custom legend that dims swatch+label + "tap to highlight" hint; Head-to-Head "?" explainer; **new 11-colour distinct palette + all 5 members reassigned** (red/gold/green/blue/violet) in DB + MEMBER_COLORS.
- **Batch 2 — popups/back:** ScoreModal portals to `<body>` (z-200) so it's never behind the film overlay; `.mc-modal-panel` caps to 100dvh + internal scroll (no off-screen modals); notification bulletin sheet = flex-column 85dvh (scrolls); **Android Back closes the top popup** via a shared `useBackClose` coordinator (film/member/score/pick/notification overlays).
- **Icon:** film-themed clapperboard `public/icon.svg` + `manifest.webmanifest` + favicon; index.html links manifest/apple-touch/theme-color.
- **Batch 3 — month/pick lifecycle redesign:** always one active + one upcoming; picks target the upcoming month (active picks locked); `activate_month` RPC (single-active + materialize + next-month + readjustment auto-open); `months.auto_activate` + soft client auto-activation (12am PT); removed month Deactivate; This Month films sorted by deadline + "for next month" wording; admin Upcoming Picks includes historical pickers. May activated live.
- **Batch 4 — admin/RLS + readjustment:** `users` SELECT RLS fixed so admins read inactive members (`is_admin()` SECURITY DEFINER, recursion-safe) — deactivate works again; test account filtered from Members tab; readjustment automation (`app_settings.readjustment_length_days`, `seasons.readjustment_auto`, auto-open on season change at 12am PT; clean date default — no "3:06pm").
- **Batch 5:** Watchlist "+ Queue" button + pointer-based draft-queue drag (works on touch); deeper `tmdb_cast` backfill (~40) so the Connection Web bridges Adaptation↔BJM (Cusack/Keener/Malkovich) + more; **member full-stats popup** (`MemberStatsOverlay` + context) opened from the member profile overlay and the Stats Members-tab card — reuses `MeTab`, renders in the member's colour (root accent override), closes back to where you were.
- **Deferred:** member pick-change request flow (active-month, zero-scores); Android Back restoring the last sub-tab (route tabs via URL); film tags already done.

### New files (session 12)
- `src/lib/useBackClose.js` — back-button popup coordinator.
- `src/context/MemberStatsOverlayContext.jsx` + `src/components/MemberStatsOverlay.jsx` — member full-stats popup.
- `public/icon.svg`, `public/manifest.webmanifest` — PWA icon + manifest.
- Migrations: `month_lifecycle_redesign`, `users_admin_read_inactive`, `readjustment_automation`.

---

## Session 11 — Browser-test fixes (charts, profiles, admin, connection web)

### Stats
- [x] **Genre pie** — true single-select; removed the Recharts `<Tooltip>` whose touch-persistent active index kept the first slice + its tooltip stuck on; click-away on the chart background deselects (ref-flag, not `stopPropagation`).
- [x] **Y-axis label clipping** — Club-vs-TMDB scatter (`left:-16→0`) and Avg-by-Decade bar (ComparisonBar horizontal `left:-20→0`) no longer clip their numeric Y labels (the clipped `X.0` remnants were reading as "0").
- [x] **Trend tooltips** — Me + Members "scores over time" key each point by a unique `idx` (+ `xLabelKey`), so same-month films stay distinct (no more one film repeated across adjacent points). Same fix the Club by-film chart already had.
- [x] **Score Over Time toggle** defaults to per-**Film** (Month second).
- [x] **Excitement-vs-final list** collapses to a 6-row preview with a reliable Show all / Show less.
- [x] **Full member stats** — "View full stats" → `/stats?member=<id>` renders that member's full Me-tab breakdown (relabeled to their name) instead of the limited Members card; Stats re-syncs from the URL via `useLocation` so it works when already mounted.
- [x] **Connection Web** — single-tap selects a node (traces its links), second tap opens it; tap a line to isolate one connection (fat invisible hit-path); removed the white focus box; edge endpoints light in accent.

### Theme
- [x] **`--accent-rgb` defined** for all 7 accents × light/dark — fixes taste-correlation + genre-blindspot (and all `rgba(var(--accent-rgb),…)`) silently falling back to purple.

### Profile / Notifications
- [x] **Tier badge** reflects the displayed member's role (Op / Admin), not the viewer's — others no longer show "Admin".
- [x] **Quiet-hours** fields autofill 22:00–08:00 and complete the window when either bound is set.
- [x] **Bulletin** mobile sheet pinned flush to the bottom with contained scroll (no backdrop gap / rubber-band).

### Admin
- [x] **Deactivate month** button (status → `upcoming`, non-destructive, confirm) — counterpart to Activate / Trigger now; for reopening June pick-collection.

### Phase 6 — Seasonal readjustment + Auteur Award
- [x] **Migration** `20260604120000_phase6_season_readjustment` — `seasons.readjustment_open` + `readjustment_ends_at`; admin-only UPDATE RLS.
- [x] **ReadjustmentContext** — loads window state + month→season map, `seasons` realtime, `openSeason` / `isMonthReadjustable`.
- [x] **ScoreModal** — re-score mode while the film's season window is open (prefilled, bypasses change-request; locks again on close).
- [x] **Admin** "Season Readjustment" panel — open/close window + end datetime per season.
- [x] **ReadjustmentBanner** on Home while a window is open.
- [x] **Auteur Award** 🎩 — per Ryan, NOT a vote: best picker by avg score (≥2 picks), finalized only after the season's readjustment window closes. `computeSeasonAwards` + Awards Season card + badge.
- [x] **Club trend legend** toggle-highlight (click series → dim others, multi-select).

### Visual polish (charts, connection web, blindspot, film popup)
- [x] **Genre pie** redo — Cell-opacity selection (dropped activeShape/activeIndex that kept a stale slice lit), tooltip restored, click-away keyed off `.recharts-sector`.
- [x] **MemberScoreBars / FilmScoreBars** — glowing μ/σ lines (bright tokens, wide-faint + sharp pass), μ top / σ bottom (no label collision), data-fitted x-domain (`niceScoreDomain`).
- [x] **Film overlay** — collapsible "Score breakdown" per-member bar chart (`FilmScoreBars`, self-contained to avoid the Stats↔Films import cycle).
- [x] **Genre Blindspot** — now counts each member's PICKS per genre (curation, not rated); vertical rotated genre labels.
- [x] **Connection Web** — added `movies.tmdb_writers` (backfilled from TMDB credits) so screenwriters bridge films (Charlie Kaufman → Adaptation / BJM / Eternal Sunshine); padded viewBox so edge labels aren't clipped.
- [x] Migration `phase5_movies_writers` (tmdb_writers + movies_safe re-expose).

### Phase 7 — Watchlist + Draft Queue (started)
- [x] **Migration** `phase7_watchlist_draft_queue` — `watchlist` + `draft_queue` tables (tmdb_id/title/poster/year, `position` on draft_queue), unique(user,tmdb), own-only RLS.
- [x] **`PersonalLists.jsx`** — debounced TMDB add-search; **Watchlist** (saved films) + **Draft Queue** (ranked pick ideas, reorder by drag or ▲▼). Rendered on the member's OWN Profile only (private).
- [x] Follow-up: surface the draft queue in the This Month pick flow ("pick from your queue") — ranked quick-pick list above the film search; promoting a queued film into the monthly pick consumes (deletes) that queue row.

### Phase 7 — Film tags
- [x] **Migration** `20260604150000_phase7_film_tags` — `film_tags` table (movie_id/user_id/tag, unique(movie,user,tag)), RLS readable-by-any-member + insert/delete own.
- [x] **`FilmTags.jsx`** — aggregated tag display (tag · count), own tags accent-highlighted + removable, curated suggestions, client-side tag normalization, test account filtered. Compact variant in `ScoreModal` (final/readjust mode, "applied at rating time"); full variant in the film overlay (add/remove once you've scored).
- [x] Doc fix: CLAUDE.md previously implied `film_tags` existed before the table did — now created + accurately described.

---

## Session 10 — Phase 4 notifications + awards/stats additions + theme fixes

### Phase 4a — In-app notification engine + center + preferences
- [x] **`public.notifications` table** — `id, user_id, type, title, body, link, payload jsonb, read_at, created_at`; RLS: recipients read/update their own rows only; rows created exclusively by SECURITY DEFINER triggers (no direct client insert).
- [x] **Selective DB triggers** — fire only on meaningful events (never on general activity): `movies.scores_revealed` flip; `months.status → 'active'` (new month) and `→ 'revealed'` (end-of-month reveal); reply to your review/comment; `@mention` parsed from body against each member's FirstLast handle; `score_change_requests` decision (approved/denied) delivered to the requester.
- [x] **`NotificationsContext`** (`src/context/NotificationsContext.jsx`) — loads notifications, subscribes via Supabase Realtime for live updates, exposes `markRead` / `markAllRead`, and surfaces push-support helpers (`pushSupported`, `pushEnabled`, `enablePush`, `disablePush`).
- [x] **`NotificationCenter`** (`src/components/NotificationCenter.jsx`) — bell icon with unread badge; desktop sidebar popover + mobile bottom sheet; per-type glyphs; click-to-navigate + mark-read; "mark all read"; empty state.
- [x] **`public.notification_preferences` table** — `user_id` (PK), `muted_types text[]`, `channel_push bool`, `channel_email bool`, `quiet_start / quiet_end time`, `updated_at`; RLS: own row only.
- [x] **Profile "Notifications" settings section** (own profile only) — per-event-type mute toggles, quiet-hours from/until, Email delivery toggle, Browser Push delivery toggle. Muting filters the in-app center + unread badge immediately.

### Phase 4b — Email + web push delivery
- [x] **Email via Resend** — a `email_notification` DB trigger (pg_net extension) POSTs to the Resend API when: recipient has `channel_email = true`, hasn't muted the event type, and is not in their quiet-hours window (checked against their timezone). `RESEND_API_KEY` and `APP_BASE_URL` stored in `supabase_vault` (never in code). Opt-in (`channel_email` defaults to `false`). Verified end-to-end (HTTP 200 + real email ids from Resend). Sends from a verified domain (`movieclub.cc`), so it delivers to any opted-in member — not just the account owner. (Currently only the two Ryans have email on.)
- [x] **Web push** — `public.push_subscriptions` table; `send-push` Supabase Edge Function (Deno, `npm:web-push`) sends to a user's subscriptions with VAPID and prunes expired (404/410) ones; `push_notification` DB trigger gathers subscriptions + VAPID private key (from vault) and POSTs to the function via pg_net. Client-side: `NotificationsContext` exposes `enablePush` / `disablePush` (permission gate → SW register → `PushManager.subscribe` → store subscription → flip `channel_push`); `public/sw.js` service worker. Profile's Browser Push row is a live toggle (shows a note where unsupported, e.g. iOS without Add to Home Screen). End-to-end requires a real browser with push support.
- [x] **`supabase_vault` secrets added:** `resend_api_key`, `app_base_url`, `vapid_private_key`, `vapid_subject`.
- [x] **New Edge Function:** `send-push` (deployed).

### Phase 4c — Scheduling / enforcement (LIVE)
- [x] **Auto month-activation** via `pg_cron` (`auto-activate-due-months`) — activates a due scheduled month at 12am PT; self-perpetuating (`activate_month` seeds the next month with auto-activate on).
- [x] **Soft deadline enforcement + grace + auto-reveal** (`enforce-due-deadlines` cron) — scores auto-reveal at `scoring_deadline + deadline_grace_days`; non-scorers absent, late scores still count; no hard lock. Grace tunable in the Admin "Deadline Grace" panel.

### Awards — new
- [x] **"The Underrated" (💎)** — club average minus TMDB average; biggest positive gap. Monthly / Season / Annual / All-Time. Badge on film + profile pages.
- [x] **"The Deep Cut" (🕳️)** — genre rarity (vs club catalog) + obscurity (log-scaled inverse TMDB `vote_count`). Same scopes. Badge on film + profile pages.
- [x] **New `movies` columns:** `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity` — backfilled from TMDB, exposed via `movies_safe`.

### Stats — new
- [x] **Connection Web / 6 Degrees** — films linked by shared actor or director; custom radial SVG node-link graph (hover/tap a film lights its connections + shows who bridges them; nodes open the film overlay). Backed by `movies.tmdb_cast text[]` (top-billed cast backfilled from TMDB, exposed via `movies_safe`).
- [x] **Genre Blindspot Grid** — per-member genre coverage heatmap implemented.
- [x] **Club "score over time" TMDB line** — neutral grey dotted TMDB average line added to the trend chart.
- [x] **Films member filter** — "All Films" gains a filter-by-member control (revealed picks only); member color propagates via `userColor()` helper reading `user_color` from the DB.

### Theme / misc
- [x] **Light-mode accent overrides** — vibrant `--accent` + dark accent text per accent variant so light mode is legible; dark mode unchanged.
- [x] **`userColor()` reads DB `user_color` first** — chosen color now propagates correctly into Stats charts and the Films member filter.
- [x] **Active bottom-nav tab uses accent color.**
- [x] **Home poster-row shadow no longer clips.**
- [x] **Admin: "Upcoming Picks" preview** — admin-only panel behind a Reveal toggle; members never see others' pre-reveal picks.
- [x] **Admin: auto genre backfill** — dashboard detects films missing a genre and backfills from TMDB automatically.
- [x] **Notifications/anonymity fix** — This Month member view never exposes others' upcoming picks (even to admins in non-admin view); end-of-month reveal path handles that. `MonthReveal` guess/prediction rows exclude the test account.

### DB / Migrations (session 10)
- [x] New tables: `notifications`, `notification_preferences`, `push_subscriptions`.
- [x] New `movies` columns: `tmdb_vote_average`, `tmdb_vote_count`, `tmdb_popularity`, `tmdb_cast`.
- [x] New extension: `pg_net` (for DB → HTTP delivery of email + push).
- [x] `supabase_vault` secrets: `resend_api_key`, `app_base_url`, `vapid_private_key`, `vapid_subject`.
- [x] New Edge Function: `send-push` (deployed).
- [x] All changes tracked as new migrations under `supabase/migrations/`.

---

## Session 9 — Browser-test rounds 2–3 + consolidation

### Navigation / Architecture
- [x] **This Month consolidated** — sub-tabs (Films / Deadlines / Picks / Reveal) removed. Single scrolling page with three sections: (1) this month's films with inline deadline countdowns + inline picker reveal once `picker_revealed`; (2) "Your Pick" (pick CTA, own pick inline, change-pick, others' picks after reveal, guess/predict nudge); (3) "Reveal" section (picker identities, justifications, guess + prediction results, monthly awards, recap) shown only once a month is fully revealed. Deadlines are inline on film cards — no separate Deadlines tab.
- [x] **Member overlay (MemberOverlayContext)** — clicking any member name/avatar anywhere (Home, Stats, Awards, Films legend, film overlay) opens a popup overlay; closing returns you exactly where you were. Bottom-bar Profile tab remains your own profile. `/profile/:id` route kept as a deep-link fallback.
- [x] **New files:** `src/components/AwardsBadges.jsx`, `src/context/MemberOverlayContext.jsx`, `src/lib/authLog.js`.

### Auth / Security / DB
- [x] **Intermittent sign-out fix** — `fetchProfile` now distinguishes transient network/DB errors from a genuine missing user row; retries once and never blanks an existing profile on error. App shows a Retry screen instead of bouncing to `/not-approved`.
- [x] **Auth diagnostics** — new table `public.auth_events` (admins read; open insert so signed-out events still log). `src/lib/authLog.js` provides fire-and-forget `logAuthEvent`; `deliberateSignOut()` centralises the user-initiated tag. Logs: `SIGNED_OUT` (with `user_initiated` + visibility/online flags) and profile-fetch retries/errors.
- [x] **`months` admin RLS** — added INSERT + UPDATE policies for admins. The client `status='active'` update was previously silently blocked, so "Activate / Trigger now" did not persist. Now it does.
- [x] **`reactions` unique constraint** — replaced the partial unique index with a plain unique constraint (`target_type, target_id, user_id, emoji`) so the upsert `ON CONFLICT` works. Emoji react no longer errors.
- [x] **`materialize_and_split_month` service context** — allows a null `auth.uid()` (service/privileged context) to drive materialization (previously hard-failed for null caller).

### Scoring
- [x] **ScoreModal backfill path** — skips the pre-watch excitement step for revealed/historical films and goes straight to final-score entry; a backfilled score never lands in `pre_watch_excitement`. Large live-echo of the typed value for mobile legibility. "Submit Score" CTA now shows whenever no final score exists (an excitement-only row no longer hides it).

### Films
- [x] **Group average from live ratings** — All Films + By Season now compute the group average from actual `ratings` rows when `scores_revealed = true` and `historical_avg_score` is null (fixes missing May 2026 scores; History already did this).
- [x] **Floating "hide scores" toggle** — hides score, divisive-sort stddev, and the Vault gold star across the films grid. Film title rendered under each poster.
- [x] **Upcoming-month films excluded** — films for months not yet active are excluded from the Films page (prevents pre-activation pick leaks).
- [x] **Divisive sort** — shows stddev value alongside the sort label.
- [x] **"Where to watch" entries are links.**
- [x] **Duplicate "Discussion" label removed** from film overlay.

### Discussion
- [x] **Idempotent votes + reactions** — both use upsert and swallow duplicate-key errors; re-voting or re-reacting no longer surfaces a duplicate-key error.

### Stats
- [x] **Member names → member overlay** across scoring granularity, scoring variation, picker power rankings, score percentile generosity, most active scorer, scoring streaks.
- [x] **Film titles → film overlay** in per-film spread, season/year rankings, excitement-vs-final.
- [x] **Season/year ranking lists collapsible.**
- [x] **Genres link** to the genre-filtered Films page. Genre pie: single-select + tooltip + legend links out.
- [x] **Club by-film trend chart** — click maps to the correct film (keyed by `id`, not index).
- [x] **Histogram** — selected bar glows.
- [x] **Club-vs-TMDB scatter** — auto-scales to the data range.
- [x] **Given/Received/Club-avg chart** — y-axis labels + data-driven domain.
- [x] **Taste-correlation** uses the accent color.
- [x] **Std-dev/mean overlay lines** are visually distinct with numeric values.
- [x] **Scoring-variation x-axis** labels rounded.

### Awards
- [x] **`historical_avg_score` authoritative in all award computations** — e.g. Eternal Sunshine reads 8.60, not 9.5.
- [x] **Award poster fills its card.**
- [x] **Awards deep-link** — `scope`/`key`/`ref` query params scroll to and highlight the matching award.
- [x] **"In the Vault"** links to the Vault tab; **"Club average"** links to the Stats Club tab.
- [x] **`AwardsBadges` component** — awards render as a collapsible badge grid on Profile pages and the film overlay (replaces previous list display).

### Profile / Home / Theme
- [x] **Profile: awards collapsible grid** — reserves space on mount (no layout jump).
- [x] **Profile: "Films [member] picked" section** — shows picks by month with score.
- [x] **Profile: user-color picker collapses** after a color is chosen.
- [x] **Profile: recent-scores rows** open the film overlay.
- [x] **Profile (member popup): clicking an award** closes the popup.
- [x] **Profile: "View full stats" link** added.
- [x] **Home: "Club Members" browse strip** added.
- [x] **Home: Recent Activity** collapsible.
- [x] **Home: "all caught up" box** links to that month's scores (Films › History).
- [x] **`colors.js` additions** — `CHART_CATEGORICAL`, `CHART_NEUTRAL`, `chartColorAt` for chart series coloring.

### DB / Migrations
- [x] New table: `public.auth_events` (auth diagnostics).
- [x] `months`: admin INSERT + UPDATE RLS policies.
- [x] `reactions`: partial unique index → plain unique constraint.
- [x] `materialize_and_split_month`: service-context (null `auth.uid()`) allowed.
- [x] All changes tracked as new migrations under `supabase/migrations/`.

---

## Session 8 — Browser-test fixes & features

### OP role & admin user management
- [x] **`users.is_op` boolean** — new column; Ryan Miller is the sole op. An op IS an admin (role stays 'admin') plus the exclusive power to promote/demote other members. Admin Members tab now shows Op / Admin / Member tiers with promote/demote UI (op-only).
- [x] **Admin user management RLS** — admins can update any `users` row; fixes Deactivate not persisting. Test account, when deactivated, drops from all member lists.

### Discussion redesign (Reddit-style threads)
- [x] **Multi-review model** — a user may post multiple reviews per film; reviews are thread roots (supersedes "one primary review per user + flat comments" model).
- [x] **`comments.review_id`** — comments now nest under a review (and under each other via `parent_comment_id`). DB migration applied.
- [x] **Polymorphic reactions** — `reactions` table gains `target_type` ('review'|'comment') + `target_id`; works on both reviews and comments.
- [x] **Up/down votes** — new `votes` table (`target_type`, `target_id`, `user_id`, `value` ±1; one per user per target) on both reviews and comments.
- [x] **15-min edit window; member delete own / admin delete any; @mentions preserved** — carried forward into new model.
- [x] Film overlay renders a single `<CommentThread>`; the old separate Reviews section removed.

### Pick → film lifecycle
- [x] **`months.active_date`** — new column (date the month goes active; defaults to 1st; admin-adjustable).
- [x] **`materialize_and_split_month(p_month_id)` RPC** — SECURITY DEFINER; materializes upcoming picks into `movies` for the active month and auto-splits scoring deadlines evenly by film count.
- [x] **Admin "Activate / Trigger now" button** — calls the RPC on demand.
- [x] **Picks tab self-pick** — your own pick shown inline (clickable → justification + change-pick); picks flow through to Films + Deadlines tabs. June is now the active month.
- [x] **Deadlines computed/displayed AND soft-enforced** — scores auto-reveal at `scoring_deadline + grace` via the `enforce-due-deadlines` pg_cron job (Phase 4c, live).

### User colors & theme
- [x] **`src/lib/colors.js`** — centralized `MEMBER_COLORS` map, `USER_COLOR_PALETTE` (20 distinct options), `memberColor()` helper. Ryan Miller → purple `#a855f7` (distinct from Chris's blue). Profile color picker strikes out taken colors.
- [x] **Light/dark mode root-cause fix** — Tailwind v4 was defaulting to `prefers-color-scheme`; fixed by binding `dark:` variant to the `.dark` class. Theme now actually works.
- [x] **Modal safety** — global CSS classes `.mc-modal-backdrop` / `.mc-modal-panel` ensure modals never overflow the viewport top. Applied to ScoreModal (mobile keyboard/off-screen fix).

### Films page
- [x] **Sort options expanded** — Most/Least Recent, Highest/Lowest Rated, Most/Least Divisive, By Member. "Most Recent" orders months descending and reverses within-month watch order (latest-watched first).
- [x] **By Season tab sortable** — sort applies per-season; seasons orderable newest/oldest.
- [x] **Genre deep-link** — genre tags link to All Films filtered by that genre (genre filter added).
- [x] **Vault badge** — links to the Vault tab.
- [x] **"Pickers" legend** renamed "Club Members" with profile links.
- [x] **History tab mobile grid** overflow fixed; streaming providers now display correctly (flat-shape read fix).
- [x] **Member names/avatars in overlay** — link to /profile/:id.

### Stats page
- [x] **Posters open film overlay** everywhere in Stats.
- [x] **Clicking a stat expands a chart** — per-member bars, mean/stddev for divisive/unanimous.
- [x] **"First L." member names** applied throughout Stats.
- [x] **Dynamic histogram bins**; trend charts (scores over time, avg/month).
- [x] **Expandable per-member cards**; Club "score over time" is now a trend line (club avg + members).
- [x] **New stats** — avg score per release decade, per-user scoring granularity, per-user std dev, per-movie breakdown, club-vs-TMDB comparison (uses TMDB `vote_average`).

### Smart linking throughout
- [x] Films open the overlay and members open /profile/:id across Home, Stats, Awards, Films.
- [x] Home "all caught up" box links to Stats Me tab; Home stats link to film/Films page.
- [x] Awards click-through verified; "Zack joined late" note shows only on Winter 2026.

### ScoreModal
- [x] **Mobile keyboard/off-screen** fixed (modal-safety classes).
- [x] **"Would you recommend outside the club?"** yes/no added to rating flow.
- [x] **Review/discussion opens automatically** after submitting a score.
- [x] **"X/Y would recommend"** counts members who submitted (not /1).

### Admin
- [x] **Missing-scores rows** link to the Scores tab.
- [x] **Manual score entry** can overwrite an existing score.
- [x] **Score matrix** missing-only rendering fixed; Zack backfillable for pre-join months.

### DB state after session 8
Tables: `users` (+`is_op`), `seasons`, `months` (+`active_date`), `movies`, `ratings`, `upcoming_picks`, `picker_guesses`, `score_predictions`, `score_change_requests`, `month_absences`, `awards`, `reviews` (multi/film), `comments` (+`review_id`, `parent_comment_id`), `reactions` (polymorphic `target_type`/`target_id`, NOT NULL), `votes` (new). RPC: `materialize_and_split_month(uuid)`. All tracked in `supabase/migrations/`.

*(Session 9 additions: `auth_events` table; `months` admin INSERT/UPDATE RLS; `reactions` plain unique constraint; `materialize_and_split_month` service-context allowance — see Session 9 DB/Migrations above.)*

### Security hardening & adversarial review (post-build)
- [x] **Op-role enforced at the DB layer** — `trg_enforce_op_role` trigger blocks any non-op from changing `role`/`is_op` (was UI-only; a regular admin could self-promote via the API).
- [x] **`materialize_and_split_month` locked down** — admin anytime, else a member only for an active month where they have a pick (was callable by any authenticated user on any month).
- [x] **Comment delete policy → own-or-admin** (Reddit redesign lets members delete their own comments; was admin-only and silently failed).
- [x] **6-agent adversarial review** of the parallel build → fixed: Stats UUID month-sort (corrupted trend chart/streaks), picker-reveal guard on the Stats picker map (pre-reveal leak), zombie-film-on-repick (RPC now updates the materialized film), reactions NOT NULL, InviteCard admin-option gated on `is_op`, dup recommend line, real last-day-of-month, CommentThread reaction target-type filter + null-thread comments.
- [ ] **Noted, not blocking** (low risk for a trusted club): member emails in client state (RLS already exposes them to members); 15-min edit window is UI-only (no DB time-check).

---

## Session 7 — Audit + Phase 2 start
**Data fixes (DB):** Ryan Bey role → admin; Ryan Bey's 5 pick attributions backfilled (all were NULL — same root cause); May 2026 status → revealed.
**Phase 1 bug fixes (code):** score format X.XX (3 spots); Home dynamic month heading; test-account filtered from film overlay + Home + This Month (scores/predictions/picker-name); History month off-by-one (UTC parse → local noon, 4 spots); authoritative `historical_avg_score` now wins over incomplete individual scores in Stats + History + overlay (fixes Eternal Sunshine 8.6); picker→member labels; History 5-film grid spacing; **light/dark theme now functional** via CSS-variable token system (dark preserved byte-for-byte).
**Audit (25-agent fan-out, adversarially verified):** Phase 1 verified solid. Remaining open Phase-1 bug: **Stats film/member names not clickable** (claimed done, not wired). Spec decisions pending: extra Films "History" tab; CLAUDE.md-vs-spec award-list drift. Tech-debt: leftover debug*.test.jsx, eslint missing vitest globals.
**Phase 2 started:** social tables + RLS created.

---

## Legend
- ✅ Done
- 🔄 In progress
- ❌ Not started
- ⚠️ Issue / needs fix

---

## Infrastructure
| Item | Status |
|------|--------|
| Vite + React + Tailwind scaffold | ✅ |
| GitHub repo | ✅ github.com/ryangarymiller/movie-club |
| Vercel deployment | ✅ auto-deploys from main (URL in PRIVATE.md) |
| Supabase project | ✅ See PRIVATE.md |
| Vitest + React Testing Library | ✅ 124 tests passing |
| TMDB env vars in Vercel | ✅ Added session 4 |
| pg_net extension | ✅ Enabled session 10 (email + push delivery) |
| supabase_vault secrets | ✅ resend_api_key, app_base_url, vapid_private_key, vapid_subject (session 10) |
| send-push Edge Function | ✅ Deployed session 10 |

---

## Database
| Item | Status |
|------|--------|
| All member emails confirmed | ✅ See PRIVATE.md |
| Zack email | ⚠️ Still placeholder |
| May scores_revealed + picker_revealed | ✅ Flipped session 4 |
| All members is_active = true | ✅ Fixed session 4 |
| auth.users NULL columns fixed | ✅ Fixed session 4 |
| Back-calculate missing scores (1 missing) | ✅ | Smashing Machine: Andrew=7.00; Spirited Away: Ryan Bey=8.50 |
| notifications + notification_preferences + push_subscriptions | ✅ Added session 10 |
| movies: tmdb_vote_average, tmdb_vote_count, tmdb_popularity, tmdb_cast | ✅ Added + backfilled session 10 |

---

## Frontend — Page Status

| Page / Feature | Status | Notes |
|----------------|--------|-------|
| Login | ✅ | Google OAuth |
| AuthCallback | ✅ | Clean "Signing you in…" only |
| NotApproved | ✅ | |
| AppLayout | ✅ | |
| Home | ✅ | Film click opens FilmDetailOverlay |
| ThisMonth — consolidated single page | ✅ | Films + inline deadlines + Your Pick + Reveal sections; sub-tabs removed |
| ThisMonth — No picks yet state | ✅ | "No picks yet for [Month]" |
| Films — Poster wall | ✅ | Sorted by id ASC; vault = gold star only |
| Films — FilmDetailOverlay | ✅ | Streaming (TMDB→Edge fallback), review gate, own score, prediction lock, awards section |
| Films — Score predictions locked after score submitted | ✅ | |
| Films — Show own score before reveal | ✅ | |
| Stats — Overview | ✅ | Recharts mini-charts; film/member navigation |
| Stats — Me | ✅ | Full Recharts suite; month names on x-axis; test user excluded |
| Stats — Members | ✅ | Browse + navigate to profiles |
| Stats — Club | ✅ | Full Recharts suite (box plots, heatmap, leaderboards) |
| Stats — Head to Head | ✅ | Pearson correlation + signed score-delta chart |
| Awards — Monthly | ✅ | Clickable winners/films |
| Awards — All-Time | ✅ | Clickable winners/films |
| Awards — Season | ✅ | Quarterly seasons |
| Awards — Annual | ✅ | |
| Awards on film pages | ✅ | FilmDetailOverlay awards section (computed via src/lib/awards.js) |
| Awards on profile pages | ✅ | Includes awards for films the user picked |
| Profile | ✅ | Light/dark toggle; user_color on avatar; awards section; Notifications settings section (mute/quiet-hours/email/push) |
| Profile — Admin mode toggle | ✅ | Was already built |
| Notifications — bell + center | ✅ | `NotificationCenter.jsx`; desktop popover + mobile sheet; unread badge; per-type glyphs; mark-read / mark-all-read |
| Notifications — preferences | ✅ | `notification_preferences` table; per-type mute; quiet hours; email + push toggles; live in Profile |
| Members directory / clickable names | ✅ | MemberOverlayContext: any member click opens popup; /profile/:id deep-link kept |
| Admin — Dashboard | ✅ | Score count fix + N/A cells |
| Admin — Films | ✅ | Full TMDB metadata editing + bulk month reveal |
| Admin — Members | ✅ | |
| Admin — Scores | ✅ | N/A cells crossed out for ineligible months |
| Admin — Streaming refresh | ✅ | Per-film refresh button (TMDB) |
| WelcomeDialog | ✅ | |
| ScoreModal | ✅ | Excitement locked when final score exists |
| Streaming providers fetch (TMDB → Claude fallback) | ✅ | All 21 films cached; ANTHROPIC_API_KEY set in Supabase |

---

## Pending Fixes (session 4 feedback)

### Quick / isolated
- [x] Remove debug logging display from AuthCallback
- [x] Home page: clicking a movie card opens film detail
- [x] Films page: sort within month by movie id ASC
- [x] Films page: vault = gold star only, no gold border
- [x] Stats: score-over-time x-axis shows month names not UUIDs
- [x] Stats: test user excluded from all displays
- [x] ScoreModal: lock excitement score input if final score already submitted
- [x] Movie page: hide/disable review form if user hasn't submitted a final score yet
- [x] Movie page: lock score prediction for a user once that user has scored
- [x] Movie page: always show the viewing user's own score even before scores_revealed

### Medium
- [x] Streaming providers: fetch from TMDB on film load; cache in DB
- [x] Streaming providers: Claude API fallback via Edge Function (code done — **deploy pending**, keys on device)
- [x] This Month — Deadlines: handle past-deadline state gracefully (show result, not blank)
- [x] This Month — Picks tab: rename, add "Pick your next movie" button, remove display search bar
- [x] This Month — current month with no films: show "No picks yet for [Month]" state
- [x] Admin: expected score count uses member count at film's month (pre/post Zack), excludes test user
- [x] Admin: N/A cells crossed out in scores matrix for ineligible months
- [x] Admin: bulk month-level reveal triggers (scores_revealed + picker_revealed for whole month)
- [x] Admin: full TMDB metadata editing on film edit form (title, poster, plot, year, director, runtime)
- [x] Light/dark mode toggle on Profile page
- [~] Clickable member names → profile: clickable, but route to /profile (own) — **needs per-member route in App.jsx**
- [x] Members directory (Stats > Members tab)
- [x] Stats — Overview: clicking film/member name navigates to their page

### Larger
- [x] Charts: Recharts — full spec suite across Overview/Me/Club/Head-to-Head (histograms, lines, scatter, box plots, heatmap, deltas). Stubbed where data missing: genre/cast charts, guess-the-picker accuracy, director/actor web
- [x] Awards shown on film pages (awards that film won)
- [x] Awards shown on profile pages (all awards user won, including for films they picked)
- [x] Back-calculate missing score: Smashing Machine (Andrew=7.00), Spirited Away (Ryan Bey=8.50)
- [x] Stats — Members tab (full)
- [x] Stats — Club tab (full)
- [x] Stats — Head to Head tab (full)

### Session 5 (recovery) — completed
- [x] **Deploy** streaming-fallback Edge Function — deployed; ANTHROPIC_API_KEY in Supabase dashboard
- [x] PRIVATE.md: Chris Deschenes email updated to 54sirhc@gmail.com
- [x] **Per-member profile route** (`/profile/:userId`) — done
- [x] Fix 10 pre-existing test failures — 241/241 passing
- [x] Genre data backfilled via TMDB for all 21 films; genre BarChart live in Stats › Club
- [x] Streaming providers bulk-fetched for all 21 films (TMDB); data cached in DB
- [x] Score format X.XX consistency — fixed toFixed(1)→toFixed(2) in Home.jsx
- [~] Recharts stubs: genre chart ✅ done; guess-the-picker & director/actor web → Phase 5 (require Phase 2 data)

---

## Phase 2 — Social  *(session 7 — major build)*
- [x] **DB foundation**: reviews, comments, reactions, veto_votes tables + RLS — rolling visibility reuses `auth_user_has_scored`; comments delete = admin-only
- [x] Reviews (primary review per user per film) — table created; overlay UI functional
- [x] Threaded comments with replies — `CommentThread.jsx`, integrated in film overlay Discussion section
- [x] @mention support (@FirstLast format) — autocomplete + highlight in CommentThread
- [x] Emoji reactions on comments — 👍❤️😂🔥👀 toggle, aggregated counts
- [x] 15-minute comment edit window; no member delete (admin only) — UI + RLS
- [x] Comment/review visibility gated on watch+score status (rolling access) — RLS + `canParticipate` gate
- [x] Guess the picker — `GuessThePicker.jsx` (overlay, active window) + results in Reveal tab
- [x] Score predictions picker-only — UI gate (`isPicker`) + RLS policy (picker-only insert/update); reveal in predictions section & Reveal tab
- [x] Score change request flow — `ScoreChangeRequest.jsx`: member request button (film overlay) + admin approve/deny panel (Admin dashboard)
- [x] Veto voting (3+/5) — `VetoControl.jsx`, film overlay (current pre-reveal films)
- [x] This Month — Reveal sub-tab — `MonthReveal.jsx`: picker + justification + guess results + prediction results (shows latest revealed month)
- [~] Reveal system: per-film + per-month admin triggers already exist; auto-scheduling of reveals is Phase 4
- [x] **Verify in-browser** — browser-tested in sessions 8–9; issues found and fixed (see Session 9 above)

### Phase 2 polish (session 7 cont.)
- [x] New awards implemented: Most Consistent Picker + Easy Crowd (Season); Most Consistent + The Wildcard + Master of Disguise + Most Evolved (Annual); Master of Disguise (All-Time)
- [x] Home "Recent Activity" feed (scores/reviews/comments)
- [x] Stats static-components bug fixed (Whisker/MemberPill hoisted)
- [x] Comment/review posting gated server-side on having scored (RLS) — `20260602130000_comments_reviews_require_scored.sql`
- [x] Test suite fully clean (234 pass, 0 unhandled errors)
- [x] Master of Disguise (Annual + All-Time) — picker_guesses threaded through compute fns + lib + Admin write; least-correctly-guessed picker
- [x] Easy Crowd (Season) — fewest low scores (≤4.0), tie-break avg; defined this session
- [x] Most Evolved (Annual) — biggest first-half/second-half avg swing; implemented but **dormant until the year spans ≥8 months** (per owner's "trigger after more data")
- All awards implemented — the **Auteur Award** ships as the season's best picker by average pick score (NOT a ranked-choice vote; scores already rank the films)
- [x] Guess/predictions placement (option A+C): functional placement stays the film overlay (predictions picker-only; guess on current films). Added a **Picks-tab nudge** that routes the picker to the overlay to predict their own pick once the movie exists. (Literal "submit in Picks tab" is blocked by the data model — picker_guesses/score_predictions FK to `movies.id`, not `upcoming_picks` — deferred unless a schema change is wanted.)

### Phase 2 polish — final pre-browser batch (session 7)
- [x] **Stats: Guess-the-Picker Accuracy** — filled the stub (Me tab) with the viewer's correct-guess rate, now that picker_guesses has data
- [x] **Tests** — `awardsNew.test.js`: 18 real-import tests for the new awards (suite now **252 passing**)
- [x] **Auto-awards on reveal** — verified already wired (per-film + per-month reveal both call `triggerAwardsWrite`)
- [x] **Lint cleanup** — `npm run lint` now **0 errors** (was ~620 false + 42 real): hoisted `ProviderRow` (real static-components bug), removed 20 dead-code unused vars; downgraded advisory-only rules (`set-state-in-effect`, `only-export-components`) to documented warnings. Remaining 49 are intentional advisories (incl. `exhaustive-deps` ×7).

### Carried from audit — resolved
- [x] **Stats: film/member names clickable** — films open FilmDetailOverlay (Overview/Me/Members); member names → /profile/:id. (Recharts axis labels in Club/H2H still static — low value.)
- [x] Tech-debt: removed debug2/3/4.test.jsx (superseded by inviteFlow.test.jsx); eslint now knows vitest globals (620 false errors → 0). Remaining 76 lint advisories are pre-existing React-19 patterns (set-state-in-effect, static-components, only-export-components) — separate refactor, no runtime impact.
- [x] Decision: **History tab kept** + documented in spec & CLAUDE.md
- [x] Decision: **award list combined** into one maximal catalog (44 awards) in CLAUDE.md + spec; ✅ implemented vs ⏳ pending (Phase 6) marked
- [x] **DB tracked in repo**: `supabase/migrations/` (session-7 data fixes, Phase 2 tables+RLS, predictions RLS) + README. Baseline of pre-session-7 schema still needs `supabase db pull` (CLI not installed here)

## Phase 3 — Themes & Personalisation
- [x] Full light mode — CSS-variable token system; light-mode accent overrides (vibrant per-accent colors + dark accent text for legibility); dark mode preserved
- [x] 7 accent colors via CSS variables (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet) — active bottom-nav tab uses accent color
- [x] 20 user colors with ring display and one-per-member enforcement — `userColor()` reads DB `user_color` first so chosen color propagates into Stats + Films member filter; Profile picker strikes out taken colors and collapses after selection
- [ ] Avatar library (all 18 packs — see spec for full asset list)
- [~] Settings page: theme ✅, accent ✅, user color ✅, notifications + quiet hours ✅ (Profile "Notifications" section, session 10); avatar, sort default, last online, timezone, tour replay, admin mode toggle — remaining
- [ ] Last online tracking and visibility toggle

## Phase 4 — Notifications & Scheduling
- [x] **4a — In-app notification engine + center + preferences** (session 10): `notifications` table + selective SECURITY DEFINER triggers; `NotificationsContext` + `NotificationCenter` (bell/badge, popover/sheet, per-type glyphs, mark-read); `notification_preferences` table with per-type mute, quiet hours, email + push toggles; Profile "Notifications" settings section
- [x] **4b — Email delivery via Resend** (session 10): `email_notification` DB trigger via pg_net; Resend key + app URL in `supabase_vault`; opt-in; verified end-to-end (full multi-member delivery needs verified sending domain in Resend)
- [x] **4b — Web push delivery** (session 10): `push_subscriptions` table; `send-push` Edge Function (Deno + npm:web-push + VAPID); `push_notification` DB trigger via pg_net; `public/sw.js` service worker; Profile Browser Push toggle; `enablePush`/`disablePush` in context; end-to-end requires real browser
- [x] **4c — Auto month-activation** via pg_cron (`auto-activate-due-months`); self-perpetuating cadence
- [x] **4c — Soft deadline enforcement + grace + auto-reveal** (`enforce-due-deadlines`); non-scorers absent, late scores still count, no hard lock
- [ ] Watch schedule with suggested dates and reminders

## Phase 5 — Stats & Visualizations
- [x] **Connection Web / 6 Degrees** (session 10) — custom radial SVG node-link graph linking films by shared actor or director; hover/tap lights connections + shows bridging members; nodes open the film overlay; backed by `movies.tmdb_cast` (backfilled from TMDB)
- [x] **Genre Blindspot Grid** (session 10) — per-member genre coverage heatmap implemented
- [x] **Club trend chart TMDB line** (session 10) — neutral grey dotted TMDB average overlaid on the "score over time" chart
- [x] **Films member filter** (session 10) — "All Films" filter-by-member control (revealed picks only); member color from DB propagates correctly
- [ ] Recharts stubs needing data: guess-the-picker accuracy chart stubs remain
- [ ] Taste compatibility heatmap (member × member score correlation)
- [ ] Winning streak tracker
- [ ] **Rotten Tomatoes comparison** — RT API/scrape; Stats currently uses TMDB `vote_average` as a proxy. Deferred from session 8 (RT API access TBD).

## Phase 6 — Awards & Recaps
- [x] **"The Underrated" award (💎)** (session 10) — biggest positive club-avg minus TMDB-avg gap; Monthly / Season / Annual / All-Time; badge on film + profile pages; backed by new `movies.tmdb_vote_average` column
- [x] **"The Deep Cut" award (🕳️)** (session 10) — genre rarity + log-scaled inverse TMDB `vote_count` obscurity score; same scopes; backed by `movies.tmdb_vote_count` + `tmdb_popularity`
- [ ] Automated award calculation written to DB on reveal (monthly, seasonal, annual, all-time)
- [x] **Auteur Award** — implemented as the season's **best picker by average pick score** (≥2 scored picks), finalized after the season's readjustment window closes. Per Ryan's decision it is **not** a ranked-choice vote (scores already rank the films). `auteur_award` key / season scope; the `auteur_votes` table is retained but unused for the award.
- [ ] AI monthly recap (Claude API via Edge Function, admin editable before publish)
- [ ] AI best review detection (Claude API)
- [ ] The Vault — auto-add/remove based on configurable threshold (default 8.5)
- [ ] Season readjustment window — auto-open, score-derived rankings, tie flagging, Auteur vote unlock

## Phase 7 — Polish & Extras
- [ ] Guest mode (first name + last initial only, post-reveal data only, no login required)
- [x] Export — personal "download my data" (JSON/CSV/PDF, own data only) on Profile via `src/lib/exportData.js`. *Pending (optional):* an admin-level club-wide export.
- [ ] Milestones & anniversaries timeline (10th film, 25th film, 1-year, etc.)
- [ ] Watchlist (private, TMDB integration)
- [ ] Draft Queue (private, drag-and-drop ranked, TMDB integration)
- [ ] Admin avatar pack management (upload packs, add individual avatars, organise)
- [ ] Home page "Your turn" action cards (what user still needs to do this month)
- [ ] Home page activity feed (recent scores, comments, awards)
- [x] Film tags — user-applied at rating time (compact picker in ScoreModal) + add/remove from the film overlay once scored; aggregated with counts on the film page. `film_tags` table (unique(movie,user,tag), own-write RLS) + `src/components/FilmTags.jsx`. (session 11)
- [ ] "Would recommend outside club" field on ratings, shown as % on film page
- [x] Admin Month Activation + Deadline Grace panels — activation date, auto-activate toggle, "Activate now" (`activate_month`), and `deadline_grace_days` tuning
- [ ] Admin Readjustment tab — manage readjustment window
- [ ] Admin Assets tab — avatar pack management
- [ ] Admin club-wide export tab — CSV + PDF (optional; per-user export already ships on Profile)
- [ ] Streaming providers: genre field needed for genre/cast Recharts stubs
