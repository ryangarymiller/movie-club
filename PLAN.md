# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Source of truth: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → this plan (all kept congruent).
> Last updated: 2026-06-02 (session 5 — recovery)

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
| Members directory / clickable names | ⚠️ | Names clickable but route to /profile (own) — needs per-member route in App.jsx |
| Admin — Dashboard | ✅ | Score count fix + N/A cells |
| Admin — Films | ✅ | Full TMDB metadata editing + bulk month reveal |
| Admin — Members | ✅ | |
| Admin — Scores | ✅ | N/A cells crossed out for ineligible months |
| Admin — Streaming refresh | ✅ | Per-film refresh button (TMDB) |
| WelcomeDialog | ✅ | |
| ScoreModal | ✅ | Excitement locked when final score exists |
| Streaming providers fetch (TMDB → Claude fallback) | ⚠️ | Code done; Edge Function needs deploy (keys on device) |

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

### Session 5 (recovery) — still open
- [ ] **Deploy** the streaming-fallback Edge Function (`supabase functions deploy streaming-fallback` + set `ANTHROPIC_API_KEY` secret)
- [ ] **Per-member profile route** in App.jsx (`/profile/:userId`) so clickable member names open the right profile
- [ ] Fix 10 pre-existing test failures ("Maximum update depth" loop in Admin InviteCard + stale supabase mocks) — predates recovery
- [ ] Recharts stubs needing data: genre/cast (genre not stored on movies), guess-the-picker accuracy, director/actor connection web

---

## Phase 2 — Social (next after Phase 1 complete)
- Film reviews (in progress)
- Threaded comments
- @mentions
- Emoji reactions
- Guess the picker
- Score predictions
- Animated reveal moment
- Score change requests

## Phase 3 — Themes & Personalisation
- Full light mode
- 20 user colors
- Avatar library
- Full Settings page

## Phase 4 — Notifications & Scheduling
- Email via Resend
- Push via Web Push API
- Deadline reminders
- Reveal notifications

## Phase 5 — Stats & Visualizations
- All remaining chart types
- Full Members / Club / Head-to-Head tabs

## Phase 6 — Awards & Recaps
- Automated award calculation
- Auteur vote UI
- AI recap (Claude API)
- The Vault auto-management
- Seasonal readjustment window

## Phase 7 — Polish
- Guest mode
- Export
- Milestones
- Veto voting
- Watchlist / draft queue
