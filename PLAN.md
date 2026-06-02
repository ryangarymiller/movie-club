# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Source of truth: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → this plan (all kept congruent).
> Last updated: 2026-06-02 (session 6)

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
| ThisMonth — Films tab | ✅ | |
| ThisMonth — Deadlines tab | ✅ | Past-deadline shows "Scores revealed"/"Awaiting reveal" |
| ThisMonth — Picks tab (renamed from Upcoming) | ✅ | "Pick your next movie" CTA, no search bar |
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
| Members directory / clickable names | ✅ | Per-member route /profile/:userId live |
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
- [ ] **Verify in-browser** — components are agent-built + build/test-green but not yet click-tested live

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
- [ ] Guess/predictions in Picks tab — **blocked by data model**: picker_guesses & score_predictions FK to `movies.id`, but the Picks tab shows next-month `upcoming_picks` (no movie row yet). Functional placement is the film overlay (works). Needs a schema change (key to upcoming_picks) to do literally.

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
- [ ] Per-film watch/scoring deadlines and grace period logic
- [ ] Grace period auto-trigger and admin manual override
- [ ] Watch schedule with suggested dates and reminders
- [ ] Quiet hours (12am–8am local, toggleable per user, timing admin-adjustable globally)
- [ ] All notification types (see spec §11 for full list)

## Phase 5 — Stats & Visualizations
- [ ] Recharts stubs needing data: genre/cast (genre not on movies table), guess-the-picker accuracy, director/actor connection web
- [ ] Director/actor connection web — interactive force-directed graph with 6 Degrees of Separation mode
- [ ] Genre blindspot tracker (requires genre field on movies)
- [ ] Taste compatibility heatmap (member × member score correlation)
- [ ] Winning streak tracker

## Phase 6 — Awards & Recaps
- [ ] Automated award calculation written to DB on reveal (monthly, seasonal, annual, all-time)
- [ ] Auteur Award — ranked choice (instant runoff) vote + notification flow
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
