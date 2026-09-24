// ─── Membership helpers ───────────────────────────────────────────────────────
//
// THE DATABASE IS THE SOURCE OF TRUTH for who counts as a club member.
//
//   • Test accounts are flagged by `users.is_test` (boolean, default false). The
//     client never knows a test account's email or name — it only reads the flag.
//     Every `users` query that feeds one of these helpers must select `is_test`.
//     (Server-side, the same flag drives the notification fan-outs, the guest
//     views, and `public.expected_members(month_id)`.)
//
//   • "Was this member in the club for that month?" is answered by
//     `users.joined_at` alone: a member is eligible for a film/month iff the
//     calendar month they joined is <= the film's `month_year`. There are no
//     per-person special cases — a member joining mid-2026 (or any later year)
//     is excluded from earlier months automatically. Make sure `joined_at` is
//     selected wherever a roster is loaded for an eligibility check.
//
// These are pure functions (no Supabase import) so they can be unit-tested and
// reused from tests directly.

/** True when the user row is a test account (invisible in all UI). */
export function isTestUser(u) {
  return u?.is_test === true
}

/** The roster minus test accounts. Keeps inactive members (callers filter). */
export function clubUsers(list) {
  return (list ?? []).filter(u => u && !isTestUser(u))
}

/** Set of user ids flagged as test accounts — for filtering rows keyed by user_id. */
export function testUserIds(list) {
  return new Set((list ?? []).filter(u => u && isTestUser(u)).map(u => u.id))
}

/** 'YYYY-MM' of a user's joined_at (a date or ISO string), or null when unset. */
export function joinedMonth(user) {
  if (!user?.joined_at) return null
  const ym = String(user.joined_at).slice(0, 7)
  return /^\d{4}-\d{2}$/.test(ym) ? ym : null
}

/**
 * Can this member's data count toward a film in `monthYear` ('YYYY-MM')?
 * True iff the month they joined is <= the film's month.
 *
 * LENIENT on missing data: an unknown user (e.g. an inactive member absent from
 * an `is_active`-filtered roster), a user with no `joined_at`, or a film with no
 * month resolves to eligible — the check only ever *removes* data it can prove
 * predates the member's join. Use `joinedByMonth` where a strict answer is
 * needed (expected-scorer counts).
 */
export function memberEligibleForMonth(user, monthYear) {
  const jm = joinedMonth(user)
  if (!jm || !monthYear) return true
  return jm <= String(monthYear).slice(0, 7)
}

/**
 * Members who joined after a season began (their scores on that season's
 * earlier films don't count toward per-person awards). Returns
 * [{ user, joinedMonth, afterSeason }] where `afterSeason` is true when they
 * joined after the season's LAST month too (so nothing of theirs counts).
 * Sorted by join month. Empty when the season has no months.
 */
export function lateJoinersForSeason(users, season, months) {
  if (!season) return []
  const ms = (months ?? [])
    .filter(m => m.season_id === season.id && m.month_year)
    .map(m => m.month_year)
    .sort()
  if (!ms.length) return []
  const first = ms[0]
  const last = ms[ms.length - 1]
  return clubUsers(users)
    .map(u => ({ user: u, joinedMonth: joinedMonth(u) }))
    .filter(x => x.joinedMonth && x.joinedMonth > first)
    .map(x => ({ ...x, afterSeason: x.joinedMonth > last }))
    .sort((a, b) => a.joinedMonth.localeCompare(b.joinedMonth))
}

/** 'YYYY-MM' → 'April 2026' (for copy). */
export function monthYearLabel(ym) {
  if (!ym) return ''
  const [y, m] = String(ym).split('-').map(Number)
  if (!y || !m) return String(ym)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
