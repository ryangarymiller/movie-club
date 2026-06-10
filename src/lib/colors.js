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

// ─── Genre colors ───────────────────────────────────────────────────────────────
// A FIXED, unique colour per TMDB genre — so a genre is the SAME colour in every
// genre chart (Most Picked Genres, Picks by Genre, …) and no two genres ever share
// one. Hues are spread + interleaved so genres that commonly co-occur (crime/drama/
// thriller, action/adventure/sci-fi, comedy/romance) stay visually distinct. Covers
// all 19 TMDB genres; anything outside the map gets a stable hashed fallback.
export const GENRE_COLORS = {
  'Action': '#38bdf8',          // sky
  'Adventure': '#ef4444',       // red
  'Animation': '#a3e635',       // lime
  'Comedy': '#facc15',          // yellow
  'Crime': '#a855f7',           // purple
  'Documentary': '#2dd4bf',     // teal
  'Drama': '#f472b6',           // pink
  'Family': '#fb923c',          // orange
  'Fantasy': '#6366f1',         // indigo
  'History': '#4ade80',         // green
  'Horror': '#d946ef',          // fuchsia
  'Music': '#22d3ee',           // cyan
  'Mystery': '#3b82f6',         // blue
  'Romance': '#8b5cf6',         // violet
  'Science Fiction': '#10b981', // emerald
  'Thriller': '#f43f5e',        // rose
  'TV Movie': '#f59e0b',        // amber
  'War': '#a16207',             // brown
  'Western': '#94a3b8',         // slate
}

// Unique, stable colour for a genre name. Known genres come from GENRE_COLORS;
// any unknown string gets a deterministic hashed colour (still stable per name).
export function genreColor(name) {
  const key = String(name ?? '').trim()
  if (GENRE_COLORS[key]) return GENRE_COLORS[key]
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CHART_CATEGORICAL[h % CHART_CATEGORICAL.length]
}

// "#a855f7" -> "168, 85, 247" for the --accent-rgb CSS token (rgba() usages).
// Returns null for non-hex input (e.g. a CSS var) so callers can fall back.
export function hexToRgbTriple(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return null
  const h = hex.slice(1)
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return [r, g, b].some(Number.isNaN) ? null : `${r}, ${g}, ${b}`
}
