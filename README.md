# Movie Club

A private web app for a 5-person movie club. Each month every member picks one film they have not personally seen; all members watch all films and submit scores, reviews, and discussion. The app handles picks, anonymity before reveal, scoring, Reddit-style threaded reviews with votes, guess-the-picker, score predictions, stats and charts, awards, and admin tooling.

**Live:** [movie-club-blond.vercel.app](https://movie-club-blond.vercel.app)

---

## Features

### Core
- **Monthly Picks** — Submit film picks with TMDB integration for automatic metadata, posters, and streaming providers
- **Two-tier Reveal System** — Per-film score reveal (after scoring deadline) and end-of-month picker identity reveal; RLS enforces visibility rules throughout
- **Pick Lifecycle** — Picks materialize into films for the active month; scoring deadlines auto-split evenly across the month's films
- **Dual Scoring** — Pre-watch excitement score (locked once final score is submitted) and final score (0.01–10.00, two decimal places)
- **Guess-the-Picker & Score Predictions** — Members guess who picked each film; the picker predicts every other member's score for their own pick

### Discussion
- **Reddit-style Threaded Reviews** — Members post multiple reviews per film; comments nest under reviews and each other
- **Votes** — Up/down votes on reviews and comments (one per user per target)
- **Emoji Reactions** — Reactions on reviews and comments (polymorphic target model)
- **15-minute Edit Window** — Authors can edit their own posts within 15 minutes; admins can delete any post
- **@Mentions** — Inline mentions preserved throughout

### Stats and Charts
- Score distribution histogram, scores over time (trend line, per-member overlay), member comparison bar chart, excitement vs. final scatter, head-to-head score delta matrix
- Per-user scoring granularity and standard deviation, avg score per release decade, club-vs-TMDB vote average comparison
- Clicking a film anywhere in Stats opens the film overlay; clicking a member name navigates to their profile

### Awards
Monthly, seasonal, annual, and all-time awards computed automatically from scoring data. Awards appear on film pages and member profile pages. Categories include: Pick/Flop of the Month, The Contrarian, The Oracle, Hype Machine, Most Divisive, Most Unanimous, Film/Picker of the Season, Harshest Critic, Most Generous, Easy Crowd, Master of Disguise, Most Evolved, and more. The Auteur Award (ranked-choice member vote) is planned for Phase 6.

### Personalization
- Light/dark mode (bound to `.dark` class, not `prefers-color-scheme`)
- 7 accent colors (Crimson, Ember, Amber, Sage, Slate Blue, Indigo, Violet)
- 20 distinct user colors (one-per-member enforced; taken colors shown with strikethrough in picker)

### Admin
- OP role: a single operator (is_op) has exclusive ability to promote/demote admins; admins manage everything else
- Trigger score reveal and picker reveal per film or per entire month
- Manual score entry (can overwrite existing); missing-score matrix with member-presence awareness
- Film metadata editing, streaming provider refresh, member management (activate/deactivate)
- Materialize picks into films and recompute scoring deadlines for a month

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

Key tables: `users` (+ `is_op`), `seasons`, `months` (+ `active_date`), `movies`, `ratings`, `upcoming_picks`, `reviews`, `comments` (+ `review_id`, `parent_comment_id`), `reactions` (polymorphic), `votes`, `picker_guesses`, `score_predictions`, `score_change_requests`, `month_absences`, `awards`, `film_tags`, `auteur_votes`, `season_rankings`, `notifications`.

Key RPC: `public.materialize_and_split_month(p_month_id uuid)` — materializes picks into films and splits scoring deadlines evenly.

> `PRIVATE.md` (member info and infra URLs) and `MOVIE_CLUB_SPEC.md` (authoritative spec) are gitignored and never committed.

---

## Navigation

**Mobile:** Bottom tab bar. **Desktop:** Left sidebar.

| Tab | Description |
|-----|-------------|
| Home | Your Turn cards, recent activity, quick stats |
| This Month | Films, Deadlines, Picks, Reveal (post-reveal only) |
| Films | All Films, The Vault, By Season, History |
| Stats | Overview, Me, Members, Club, Head to Head |
| Awards | Monthly, Season, Annual, All-Time |
| Profile | Theme, user color, settings, sign out |
| Admin | Dashboard, film editing, member management, score matrix *(admin only)* |

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

Phases 1–3 are complete. Phase 4 deadline enforcement is display-only until launch; admin "trigger now" is available in the meantime.

---

## Contributing

This is a private project for a 5-person movie club. Contact a maintainer if you would like to contribute.

**GitHub:** [@ryangarymiller](https://github.com/ryangarymiller)
