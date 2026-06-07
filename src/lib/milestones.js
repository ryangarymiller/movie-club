// Pure computation helpers for the Home "Milestones / Anniversaries" section.
//
// Everything here is time-pure: callers pass `now` (defaults to Date.now()) so the
// values stay live and the helpers stay testable. No Supabase / React imports — this
// module only does date math and round-number detection.

const DAY_MS = 86400000

export const FOUNDING = new Date('2026-01-05')
// The club's 1-year anniversary (founding day + 1 year).
export const ONE_YEAR = new Date('2027-01-05')

function whole(n) {
  return Math.floor(n)
}

// Whole calendar months between `from` and `to` (counts a month only once its
// day-of-month anchor — the founding day — has been reached).
function monthsBetween(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

// Days from `now` until `target` (rounded up so "today" reads as the event, and a
// partial day still counts as 1 remaining).
function daysUntil(target, now) {
  return Math.ceil((target.getTime() - now) / DAY_MS)
}

// The next monthly-versary date on/after `now` (the next occurrence of the founding
// day-of-month). Handles months shorter than the founding day by clamping to the
// last day of that month.
function nextMonthlyVersary(now, founding = FOUNDING) {
  const day = founding.getDate()
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const startOfToday = d.getTime()
  // Start from the founding-day anchor in the current month. A versary landing
  // exactly today counts as today (it is not rolled forward), so a same-day
  // anniversary still surfaces; only a strictly-past anchor advances a month.
  let candidate = clampedDay(d.getFullYear(), d.getMonth(), day)
  if (candidate.getTime() < startOfToday) {
    candidate = clampedDay(d.getFullYear(), d.getMonth() + 1, day)
  }
  return candidate
}

// A Date for the given year/month with `day`, clamped to that month's last day
// (e.g. day 31 in February → Feb 28/29). Normalizes month overflow.
function clampedDay(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

// Club age / anniversary summary.
//   { months, label, nextVersary: { date, days, ordinal }, oneYear: { date, days, reached } }
export function clubAge(now = Date.now(), founding = FOUNDING) {
  const nowDate = new Date(now)
  const months = monthsBetween(founding, nowDate)
  const versaryDate = nextMonthlyVersary(now, founding)
  const versaryOrdinal = monthsBetween(founding, versaryDate) // the n-month mark that lands on that date
  const oneYearDays = daysUntil(ONE_YEAR, now)
  return {
    months,
    label: months === 1 ? '1 month old' : `${months} months old`,
    nextVersary: {
      date: versaryDate,
      days: Math.max(0, daysUntil(versaryDate, now)),
      ordinal: versaryOrdinal,
    },
    oneYear: {
      date: ONE_YEAR,
      days: oneYearDays,
      reached: oneYearDays <= 0,
    },
  }
}

// Detect a round-number milestone for a running `count` against a set of step
// thresholds. Returns the most relevant milestone or null when none is in range.
//   { value, kind: 'reached' | 'approaching', remaining }
// - `reached`: count is exactly on (or just past, within `justHitWindow`) a round number.
// - `approaching`: count is within `approachWindow` below the next round number.
export function roundMilestone(count, { step = 25, approachWindow = 5, justHitWindow = 2 } = {}) {
  if (!Number.isFinite(count) || count <= 0) return null
  const lower = whole(count / step) * step // nearest round number at or below count
  const upper = lower + step

  // Just hit / just passed a round number (and it's a meaningful one, >= step).
  if (lower >= step && count - lower <= justHitWindow) {
    return { value: lower, kind: 'reached', remaining: 0 }
  }
  // Approaching the next round number.
  if (upper - count <= approachWindow) {
    return { value: upper, kind: 'approaching', remaining: upper - count }
  }
  return null
}

// Members whose join monthly-versary falls within the next `windowDays` (or is
// today). Excludes the founding cohort's "0 month" no-op and anyone whose join
// monthversary is the same as today only when months === 0.
//   returns [{ user, months, date, days }] sorted by soonest.
export function memberAnniversaries(users, now = Date.now(), windowDays = 7) {
  const out = []
  for (const u of users) {
    if (!u?.joined_at) continue
    const joined = new Date(u.joined_at)
    if (Number.isNaN(joined.getTime())) continue
    const versary = nextMonthlyVersary(now, joined)
    const days = daysUntil(versary, now)
    if (days < 0 || days > windowDays) continue
    const months = monthsBetween(joined, versary)
    if (months < 1) continue // skip the join-day itself / sub-month accounts
    out.push({ user: u, months, date: versary, days: Math.max(0, days) })
  }
  out.sort((a, b) => a.days - b.days)
  return out
}

// Human "in N days" / "today" / "tomorrow" label.
export function inDaysLabel(days) {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
