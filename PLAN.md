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
| ThisMonth — Deadlines tab | ⚠️ | Past deadlines handle in progress (agent) |
| ThisMonth — Picks tab (renamed from Upcoming) | 🔄 | Agent in progress |
| ThisMonth — No picks yet state | 🔄 | Agent in progress |
| Films — Poster wall | ✅ | Sorted by id ASC; vault = gold star only |
| Films — FilmDetailOverlay | ✅ | Streaming fetch, review gate, own score, prediction lock |
| Films — Score predictions locked after score submitted | ✅ | |
| Films — Show own score before reveal | ✅ | |
| Stats — Overview | ⚠️ | Clicking film/user to navigate — still needed |
| Stats — Me | ✅ | Month names on x-axis; test user excluded |
| Stats — Members | ❌ | |
| Stats — Club | ❌ | |
| Stats — Head to Head | ❌ | |
| Awards — Monthly | ✅ | |
| Awards — All-Time | ✅ | |
| Awards — Season | ❌ | |
| Awards — Annual | ❌ | |
| Awards on film pages | ❌ | |
| Awards on profile pages | ❌ | |
| Profile | ✅ | Light/dark toggle added; user_color on avatar |
| Profile — Admin mode toggle | ❌ | |
| Members directory / clickable names | ❌ | |
| Admin — Dashboard | ⚠️ | Score count fix + N/A cells in progress (agent) |
| Admin — Films | ⚠️ | Full TMDB editing + month trigger in progress (agent) |
| Admin — Members | ✅ | |
| Admin — Scores | 🔄 | N/A cells agent in progress |
| Admin — Streaming refresh | ❌ | |
| WelcomeDialog | ✅ | |
| ScoreModal | ✅ | Excitement locked when final score exists |
| Streaming providers fetch (TMDB → Claude fallback) | ⚠️ | TMDB fetch done; Claude fallback needs Edge Function |

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
- [ ] Streaming providers: Claude API fallback via Edge Function (ANTHROPIC_API_KEY server-side only)
- [ ] This Month — Deadlines: handle past-deadline state gracefully (show result, not blank)
- [ ] This Month — Picks tab: rename, add "Pick your next movie" button, remove display search bar
- [ ] This Month — current month with no films: show "No picks yet for [Month]" state
- [ ] Admin: expected score count uses member count at film's month (pre/post Zack), excludes test user
- [ ] Admin: N/A cells crossed out in scores matrix for ineligible months
- [ ] Admin: bulk month-level reveal triggers (scores_revealed + picker_revealed for whole month)
- [ ] Admin: full TMDB metadata editing on film edit form (title, poster, plot, year, director, runtime)
- [x] Light/dark mode toggle on Profile page
- [ ] Clickable member names throughout app → their profile page
- [ ] Members directory (Stats > Members tab acts as directory; names clickable throughout)
- [ ] Stats — Overview: clicking film/member name navigates to their page

### Larger
- [ ] Charts: Recharts — score distribution histogram, score over time line, member comparison bar, excitement vs final, head-to-head matrix
- [ ] Awards shown on film pages (awards that film won)
- [ ] Awards shown on profile pages (all awards user won, including for films they picked)
- [x] Back-calculate missing score: Smashing Machine (Andrew=7.00), Spirited Away (Ryan Bey=8.50)
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
