// Shared member/user colors. Hues are spread so no two members are easily confused
// (fixes the Ryan Miller vs Chris Deschenes clash). MEMBER_COLORS is the per-member
// fallback used across the app; USER_COLOR_PALETTE is the pool for the one-per-member
// user-color picker (Phase 3 themes).

// Five maximally-separated anchor hues (red · gold · green · blue · violet) — the
// most intuitively-distinct 5-colour set, so no two member series are ever
// confusable on a chart. Mirrored into users.user_color in the DB.
export const MEMBER_COLORS = {
  'Ryan Miller':     '#a855f7', // violet
  'Ryan Bey':        '#ef4444', // red
  'Andrew Bond':     '#22c55e', // green
  'Zack Anjoorian':  '#eab308', // gold
  'Chris Deschenes': '#3b82f6', // blue
}

export function memberColor(name) {
  return name ? (MEMBER_COLORS[name] ?? undefined) : undefined
}

// Prefer the user's DB-stored color (user_color) over the hardcoded fallback.
// Use this wherever a full user object is in scope; fall back to memberColor(name)
// when only a name string is available.
export function userColor(user) {
  return user?.user_color || memberColor(user?.name) || undefined
}

// Curated set of mutually-distinct options for the user-color picker (one-per-member
// enforced). Deliberately fewer than before: every prior near-duplicate pair (two reds,
// three purples, teal-vs-cyan, etc.) was collapsed to a single representative, so no two
// swatches are confusable on a chart. All are mid-tone + saturated → legible on BOTH the
// light and dark themes (no near-black/near-white that vanishes on one). The 5 member
// anchors above are included so each member's colour is selectable.
export const USER_COLOR_PALETTE = [
  '#ef4444', // red      (Ryan B)
  '#f97316', // orange
  '#eab308', // gold     (Zack)
  '#84cc16', // lime
  '#22c55e', // green    (Andrew)
  '#06b6d4', // cyan
  '#3b82f6', // blue     (Chris)
  '#a855f7', // violet   (Ryan M)
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#64748b', // slate (neutral)
]

// Categorical palette for non-member chart series (secondary/tertiary bars, TMDB vs club,
// correlation scales, etc.). 8 hues spread across the wheel, distinct from each other and
// from the 5 member colors above. Works on both light and dark backgrounds.
export const CHART_CATEGORICAL = [
  '#38bdf8', // sky-400      — light blue (distinct from Chris's #3b82f6)
  '#fb923c', // orange-400   — warm orange (distinct from Zack's amber #f59e0b)
  '#4ade80', // green-400    — lime-green (distinct from Andrew's emerald #10b981)
  '#e879f9', // fuchsia-400  — magenta (distinct from Ryan M's purple #a855f7)
  '#facc15', // yellow-400   — golden yellow
  '#2dd4bf', // teal-400     — teal/cyan (distinct from #14b8a6 palette entry)
  '#f472b6', // pink-400     — pink (lighter than Ryan B's rose #f43f5e)
  '#a3e635', // lime-400     — chartreuse
]

// Neutral single-series color for the "club average" aggregate line/bar.
// CSS token so it automatically adapts to light/dark mode (dark-on-light, light-on-dark).
export const CHART_NEUTRAL = 'var(--text-strong)'

// Safe categorical indexer — wraps around if i >= palette length.
export function chartColorAt(i) {
  return CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]
}
