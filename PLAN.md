# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Source of truth: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → this plan (all kept congruent).
> Last updated: 2026-06-03 (session 9)

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
- [x] **Deadlines computed/displayed; enforcement deferred** — display-only until launch/July (Phase 4).

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
| Vercel deployment | ✅ movie-club-blond.vercel.app (auto-deploys) |
| Supabase project | ✅ See PRIVATE.md |
| Vitest + React Testing Library | ✅ 124 tests passing |
| TMDB env vars in Vercel | ✅ Added session 4 |

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
| Profile | ✅ | Light/dark toggle added; user_color on avatar; awards section |
| Profile — Admin mode toggle | ✅ | Was already built |
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
- Only **Auteur Award** remains ⏳ (needs the Phase 6 ranked-choice vote)
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
- [ ] Full light mode
- [ ] 7 accent colors via CSS variables (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet)
- [ ] 20 user colors with ring display and one-per-member enforcement
- [ ] Avatar library (all 18 packs — see spec for full asset list)
- [ ] Settings page: all options (theme, accent, user color, avatar, notifications, quiet hours, sort default, last online, timezone, tour replay, admin mode toggle)
- [ ] Last online tracking and visibility toggle

## Phase 4 — Notifications & Scheduling
- [ ] Email notifications via Resend (server-side Edge Function)
- [ ] Web push notifications (iOS "Add to Home Screen" prompt)
- [ ] **Deadline enforcement** — deadlines are currently display-only; Phase 4 wires up actual enforcement (score submission blocked after deadline + grace period passes). Deferred from session 8 (dev mode until launch/July).
- [ ] **Grace period** — invisible to members; results reveal after deadline from their perspective; auto-trigger when all scores are in before deadline. Admin manual override. Deferred from session 8.
- [ ] **Auto month-activation on the 1st** — currently admin-triggered via "Activate / Trigger now" button calling `materialize_and_split_month()`; Phase 4 automates this on the month's `active_date`. Deferred from session 8.
- [ ] Watch schedule with suggested dates and reminders
- [ ] Quiet hours (12am–8am local, toggleable per user, timing admin-adjustable globally)
- [ ] All notification types (see spec §11 for full list) — includes score-change approval notices and other events deferred from session 8

## Phase 5 — Stats & Visualizations
- [ ] Recharts stubs needing data: genre/cast (genre not on movies table), guess-the-picker accuracy, director/actor connection web
- [ ] Director/actor connection web — interactive force-directed graph with 6 Degrees of Separation mode
- [ ] Genre blindspot tracker (requires genre field on movies)
- [ ] Taste compatibility heatmap (member × member score correlation)
- [ ] Winning streak tracker
- [ ] **Rotten Tomatoes comparison** — RT API/scrape; Stats currently uses TMDB `vote_average` as a proxy. Deferred from session 8 (RT API access TBD).

## Phase 6 — Awards & Recaps
- [ ] Automated award calculation written to DB on reveal (monthly, seasonal, annual, all-time)
- [ ] **Auteur Award** — ranked-choice (instant runoff) member vote + notification flow. ⭐ This is the **only remaining award** in the catalog (all 43 others implemented in session 7); add it once the voting system exists. Award key/scope already reserved: `auteur_award`, season scope, backed by the `auteur_votes` table.
- [ ] AI monthly recap (Claude API via Edge Function, admin editable before publish)
- [ ] AI best review detection (Claude API)
- [ ] The Vault — auto-add/remove based on configurable threshold (default 8.5)
- [ ] Season readjustment window — auto-open, score-derived rankings, tie flagging, Auteur vote unlock

## Phase 7 — Polish & Extras
- [ ] Guest mode (first name + last initial only, post-reveal data only, no login required)
- [ ] Export — CSV (full data) + PDF (season/year-end formatted report) — admin only
- [ ] Milestones & anniversaries timeline (10th film, 25th film, 1-year, etc.)
- [ ] Watchlist (private, TMDB integration)
- [ ] Draft Queue (private, drag-and-drop ranked, TMDB integration)
- [ ] Admin avatar pack management (upload packs, add individual avatars, organise)
- [ ] Home page "Your turn" action cards (what user still needs to do this month)
- [ ] Home page activity feed (recent scores, comments, awards)
- [ ] Film tags — user-applied at rating time, aggregated with counts on film page
- [ ] "Would recommend outside club" field on ratings, shown as % on film page
- [ ] Admin Schedule tab — set deadlines, watch schedule, reveal dates, grace period
- [ ] Admin Readjustment tab — manage readjustment window
- [ ] Admin Assets tab — avatar pack management
- [ ] Admin Export tab — CSV + PDF export
- [ ] Streaming providers: genre field needed for genre/cast Recharts stubs
