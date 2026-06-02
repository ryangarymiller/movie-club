# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Last updated: 2026-06-02 (session 4)

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
| Back-calculate missing scores (1 missing) | ❌ |

---

## Frontend — Page Status

| Page / Feature | Status | Notes |
|----------------|--------|-------|
| Login | ✅ | Google OAuth |
| AuthCallback | ✅ | Remove debug text display |
| NotApproved | ✅ | |
| AppLayout | ✅ | |
| Home | ⚠️ | Clicking movie doesn't open film page |
| ThisMonth — Films tab | ✅ | |
| ThisMonth — Deadlines tab | ⚠️ | Past deadlines show blank |
| ThisMonth — Picks tab (renamed from Upcoming) | ⚠️ | Needs "Pick your next movie" CTA; remove inline search |
| ThisMonth — No picks yet state | ❌ | |
| Films — Poster wall | ⚠️ | Within-month ordering wrong; vault gold border → star only |
| Films — FilmDetailOverlay | ⚠️ | Streaming info missing; review blocked if not scored |
| Films — Score predictions locked after score submitted | ❌ | |
| Films — Show own score before reveal | ❌ | |
| Stats — Overview | ⚠️ | Clicking film/user should navigate; test user visible |
| Stats — Me | ⚠️ | Score over time shows UUIDs; charts needed |
| Stats — Members | ❌ | |
| Stats — Club | ❌ | |
| Stats — Head to Head | ❌ | |
| Awards — Monthly | ✅ | |
| Awards — All-Time | ✅ | |
| Awards — Season | ❌ | |
| Awards — Annual | ❌ | |
| Awards on film pages | ❌ | |
| Awards on profile pages | ❌ | |
| Profile | ⚠️ | Missing light/dark mode toggle; no link to other profiles |
| Profile — Admin mode toggle | ❌ | |
| Members directory / clickable names | ❌ | |
| Admin — Dashboard | ⚠️ | Missing score count uses wrong expected total; excludes test user |
| Admin — Films | ⚠️ | Needs full TMDB field editing; trigger by month |
| Admin — Members | ✅ | |
| Admin — Scores | ⚠️ | N/A cells not crossed out for ineligible members |
| Admin — Streaming refresh | ❌ | |
| WelcomeDialog | ✅ | |
| ScoreModal | ⚠️ | Excitement score not locked when final score exists |
| Streaming providers fetch (TMDB → Claude fallback) | ❌ | |

---

## Pending Fixes (session 4 feedback)

### Quick / isolated
- [ ] Remove debug logging display from AuthCallback (revert to clean "Signing you in…")
- [ ] Home page: clicking a movie card opens film detail
- [ ] Films page: sort within month by movie id ASC
- [ ] Films page: vault = gold star only, no gold border
- [ ] Stats: score-over-time x-axis shows month names not UUIDs
- [ ] Stats: test user excluded from all displays
- [ ] ScoreModal: lock excitement score input if final score already submitted
- [ ] Movie page: hide/disable review form if user hasn't submitted a final score yet
- [ ] Movie page: lock score prediction for a user once that user has scored
- [ ] Movie page: always show the viewing user's own score even before scores_revealed

### Medium
- [ ] Streaming providers: fetch from TMDB on film load; Claude API fallback; cache in DB
- [ ] This Month — Deadlines: handle past-deadline state gracefully (show result, not blank)
- [ ] This Month — Picks tab: rename, add "Pick your next movie" button, remove display search bar
- [ ] This Month — current month with no films: show "No picks yet for [Month]" state
- [ ] Admin: expected score count uses member count at film's month (pre/post Zack), excludes test user
- [ ] Admin: N/A cells crossed out in scores matrix for ineligible months
- [ ] Admin: bulk month-level reveal triggers (scores_revealed + picker_revealed for whole month)
- [ ] Admin: full TMDB metadata editing on film edit form (title, poster, plot, year, director, runtime)
- [ ] Light/dark mode toggle on Profile page
- [ ] Clickable member names throughout app → their profile page
- [ ] Members directory (accessible from Stats Members tab or nav)

### Larger
- [ ] Charts: Recharts — score distribution histogram, score over time line chart (month name x-axis), member comparison bar, excitement vs final scatter/bar, head-to-head matrix
- [ ] Awards shown on film pages (awards that film won)
- [ ] Awards shown on profile pages (all awards user won, including for films they picked)
- [ ] Back-calculate missing score: when exactly 1 score missing + historical_avg_score set, compute and insert
- [ ] Stats — Members tab (full)
- [ ] Stats — Club tab (full)
- [ ] Stats — Head to Head tab (full)

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
