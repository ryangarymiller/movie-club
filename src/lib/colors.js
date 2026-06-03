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
