// Shared member/user colors. Hues are spread so no two members are easily confused
// (fixes the Ryan Miller vs Chris Deschenes clash). MEMBER_COLORS is the per-member
// fallback used across the app; USER_COLOR_PALETTE is the pool for the one-per-member
// user-color picker (Phase 3 themes).

export const MEMBER_COLORS = {
  'Ryan Miller':     '#a855f7', // purple
  'Ryan Bey':        '#f43f5e', // rose
  'Andrew Bond':     '#10b981', // emerald
  'Zack Anjoorian':  '#f59e0b', // amber
  'Chris Deschenes': '#3b82f6', // blue
}

export function memberColor(name) {
  return name ? (MEMBER_COLORS[name] ?? undefined) : undefined
}

// 20 distinct options for the user-color picker (one-per-member enforced). Spread across
// the hue wheel with enough separation that none are easily mistaken for another.
export const USER_COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#64748b', '#a16207', '#7c3aed',
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
