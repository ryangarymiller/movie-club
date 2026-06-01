# Movie Club — Implementation Plan

> Living document. Update status as work completes.
> Last updated: 2026-06-01 (session 3)

---

## Legend
- ✅ Done
- 🔄 In progress (agent running)
- ❌ Not started
- ⚠️ Issue / needs fix

---

## Infrastructure
| Item | Status |
|------|--------|
| Vite + React + Tailwind scaffold | ✅ |
| GitHub repo | ✅ github.com/ryangarymiller/movie-club |
| Vercel deployment | ✅ movie-club-blond.vercel.app (auto-deploys) |
| Supabase project | ✅ pjwttvazgabwcybrwpmx.supabase.co |
| Vitest + React Testing Library | ✅ 124 tests passing |

---

## Database — Known Issues
| Issue | Status |
|-------|--------|
| joined_at dates | ✅ Fixed |
| Ryan Bey email | ✅ ryan.bey1234@gmail.com |
| Andrew Bond email | ✅ andrewbond833@gmail.com |
| Chris Deschenes email | ⚠️ Placeholder — need real email |
| Zack Anjoorian email | ⚠️ Placeholder — need real email |
| May 2026 scoring deadlines | ⚠️ Null — deferred |
| Missing April/May scores | ⚠️ Waiting on Ryan Bey's Google Form data |
| admin_mode_enabled for admins | ✅ Enabled for Ryan Miller + Ryan Bey |
| has_completed_onboarding column | ✅ Added |

---

## Frontend — Page Status

| Page / Feature | Status | Notes |
|----------------|--------|-------|
| Login | ✅ | Google OAuth |
| AuthCallback | ✅ | |
| NotApproved | ✅ | |
| AppLayout | 🔄 | SVG icon upgrade in progress |
| Home | ✅ | Your Turn cards, ScoreModal wired, film scroll, stats |
| ThisMonth — Films tab | ✅ | ScoreModal wired |
| ThisMonth — Deadlines tab | ✅ | |
| ThisMonth — Upcoming tab | ✅ | TMDB search → pick submission |
| ThisMonth — Realtime | 🔄 | Supabase realtime subscription in progress |
| Films — Poster wall | ✅ | All Films / Vault / By Season |
| Films — FilmDetailOverlay | ✅ | Scores, streaming, picker, plot, recommend |
| Films — Backfill scoring | ✅ | Submit score on historical unrevealed films |
| Films — Reviews | 🔄 | In progress |
| Stats — Overview | ✅ | Vault, divisive/unanimous, member avgs |
| Stats — Me | ✅ | Distribution chart, top/bottom 5, excitement vs final |
| Stats — Members | 🔄 | In progress |
| Stats — Club | 🔄 | In progress |
| Stats — Head to Head | 🔄 | In progress |
| Awards — Monthly | ✅ | 9 awards, month selector |
| Awards — All-Time | ✅ | 9 all-time awards |
| Awards — Season | 🔄 | In progress |
| Awards — Annual | 🔄 | In progress |
| Profile | ✅ | Stats, recent scores, accent picker, sign out |
| Profile — Admin mode toggle | 🔄 | In progress |
| Admin — Dashboard | ✅ | Stats, missing scores, active month |
| Admin — Films | ✅ | Edit metadata, deadlines, reveal toggles |
| Admin — Members | ✅ | Edit emails/joined_at, activate/deactivate |
| Admin — Scores | ✅ | Manual score entry + matrix view |
| WelcomeDialog | ✅ | First-login onboarding |
| ScoreModal | ✅ | Pre-watch + final + confirmation dialog |

---

## Phase 1 — Remaining After Current Agents

- Real emails: Chris Deschenes + Zack Anjoorian
- May 2026 wrap-up (flip scores_revealed=true) — after backfill
- Missing April/May scores — waiting on Ryan Bey's Google Form data
- Invite flow (allowlist before first login)
- Score change requests UI

---

## Phase 2 — Social (next)
- Film reviews 🔄 in progress
- Threaded comments
- @mentions
- Emoji reactions
- Guess the picker
- Score predictions
- Animated reveal moment
- Score change requests

## Phase 3 — Themes & Personalisation
Light mode, 20 user colors + avatar rings, full Settings page.

## Phase 4 — Notifications & Scheduling
Email (Resend), web push, deadline auto-triggers (pg_cron) — all via Edge Functions.

## Phase 5 — Stats & Visualizations
Remaining chart work; consider Recharts.

## Phase 6 — Awards & Recaps
Auteur Award (ranked choice), AI recap (Claude API), The Vault auto-management, season readjustment window.

## Phase 7 — Polish
Guest mode, export, milestones timeline, veto system, watchlist/draft queue.

---

## Next After Current Agents Complete
1. Invite flow (allowlist + email link)
2. Guess the picker
3. Score predictions
4. Threaded comments on reviews
5. Animated reveal moment
6. Edge Functions: email + push notifications
