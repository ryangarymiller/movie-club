# 🎬 Movie Club

A collaborative film rating and discovery platform for your movie club. Members submit monthly film picks, score them before and after watching, and compete for awards based on their rankings.

**Live:** [movie-club-blond.vercel.app](https://movie-club-blond.vercel.app)

---

## Features

### 📽️ Core Functionality
- **Monthly Submissions** — Submit film picks with TMDB integration for metadata auto-population
- **Dual Scoring** — Rate films both before-watch (excitement) and after-watch (final score)
- **Blind Reveal** — Admin-controlled score reveal timing for drama and discussion
- **Scoring Matrix** — View all member scores at a glance; backfill historical scores on unrevealed films
- **Film Vault** — Browse the entire club history: all films, vault-only picks, organized by season

### 🏆 Awards & Stats
- **Monthly Awards** — 9 rotating awards (e.g., Most Anticipated, Divisive, Unanimous, Biggest Surprise)
- **All-Time Awards** — Career achievements tracked since the club's inception
- **Member Stats** — Personal dashboards: score distribution, top/bottom 5 films, excitement vs. final correlation
- **Club Stats** — Vault trends, member averages, head-to-head comparisons

### 💬 Engagement
- **Film Reviews** — Write and discuss reviews with threaded comments and emoji reactions
- **Leaderboards** — Monthly and all-time standings
- **Admin Tools** — Manually override scores, manage member status, edit film metadata, control reveal timing

### 🎨 Personalization
- **Custom Accent Colors** — Choose from 20 user-facing colors for your profile
- **Dark Mode** — Native dark theme support
- **Onboarding** — First-login wizard to get new members up to speed

---

## Tech Stack

**Frontend:**
- [React 19](https://react.dev) + [React Router 7](https://reactrouter.com)
- [Vite](https://vitejs.dev) for fast development and production builds
- [Tailwind CSS 4](https://tailwindcss.com) for styling
- [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com) (124+ tests)

**Backend:**
- [Supabase](https://supabase.com) (PostgreSQL + Realtime subscriptions)
- OAuth authentication (Google)

**Deployment:**
- [Vercel](https://vercel.com) with auto-deployment on push

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Setup

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Contact a maintainer for these credentials.

---

## Project Structure

```
movie-club/
├── src/
│   ├── components/      # React components (pages, modals, UI)
│   ├── lib/            # Utilities (Supabase client, auth, formatting)
│   ├── styles/         # Global CSS and Tailwind config
│   └── App.jsx         # Main router and layout
├── public/             # Static assets
├── index.html          # Entry point
├── vite.config.js      # Vite configuration
├── tailwind.config.js  # Tailwind configuration
├── eslint.config.js    # ESLint rules
├── package.json        # Dependencies and scripts
├── PLAN.md             # Implementation roadmap and status
└── README.md           # This file
```

---

## Key Pages

| Page | Purpose |
|------|---------|
| **Login** | Google OAuth entry point |
| **Home** | Your Turn cards, film scroll, quick stats |
| **This Month** | Films tab, deadlines, upcoming submissions |
| **Films** | Poster wall gallery (All / Vault / By Season); detailed film overlays with scores & reviews |
| **Stats** | Personal, member, club, and head-to-head comparisons |
| **Awards** | Monthly, all-time, seasonal, and annual awards |
| **Profile** | User settings, accent color picker, sign out, admin toggle |
| **Admin** | Dashboard, film editing, member management, score matrix |

---

## Development Status

This project is actively under development. See [PLAN.md](./PLAN.md) for detailed status on features, phases, and known issues.

**Current Phase:** Social features (reviews, threaded comments, emoji reactions)  
**Recent Progress:** Core infrastructure, member/film management, awards system, scoring & stats

---

## Contributing

This is a personal project for a private movie club. Contact a maintainer if you'd like to contribute.

---

## License

MIT

---

## Questions?

Open an issue or reach out to [@ryangarymiller](https://github.com/ryangarymiller).
