// Pure helpers for the 2.0 admin round controls (no React, no Supabase) so they can be
// unit-tested directly. Club times are US Pacific (CLAUDE.md: deadlines live in PT).

export const PT = 'America/Los_Angeles'

/** Shared form-field styles (match Admin.jsx's MonthActivationPanel inputs). */
export const fieldStyle = {
  display: 'block', width: '100%', marginTop: '6px', padding: '9px 10px', borderRadius: '8px',
  background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
  color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box',
}
export const fieldLabelStyle = { fontSize: '9px', letterSpacing: '0.14em', fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', textTransform: 'uppercase' }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM' → 'October 2026'. Passes anything unparseable through unchanged. */
export function fmtMonthYear(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '')
  return m ? `${MONTH_NAMES[+m[2] - 1]} ${m[1]}` : (ym || '')
}

/** 'YYYY-MM' + n months → 'YYYY-MM'. */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

function ptParts(date, tz = PT) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(p => [p.type, p.value]))
}

/** The calendar month it currently is in US Pacific, as 'YYYY-MM'. */
export function currentPacificMonthYear(now = new Date()) {
  const p = ptParts(now)
  return `${p.year}-${p.month}`
}

/** Soonest month (from the current PT month on) that has no `months` row yet. */
export function nextFreeMonthYear(months = [], now = new Date()) {
  const taken = new Set(months.map(m => m.month_year))
  let ym = currentPacificMonthYear(now)
  for (let i = 0; i < 60 && taken.has(ym); i++) ym = addMonths(ym, 1)
  return ym
}

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * The season that covers a 'YYYY-MM' month: the one containing the 1st, else any season
 * overlapping the month (Winter 2026 starts on the club founding date, Jan 5).
 */
export function seasonForMonth(seasons = [], ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return null
  const first = `${ym}-01`
  const last = lastDayOfMonth(ym)
  const d = s => String(s ?? '').slice(0, 10)
  return seasons.find(s => d(s.start_date) <= first && first <= d(s.end_date))
    ?? seasons.find(s => d(s.start_date) <= last && d(s.end_date) >= first)
    ?? null
}

/**
 * A `<input type="datetime-local">` value ('YYYY-MM-DDTHH:mm') read as US Pacific wall time
 * → ISO-8601 UTC string. DST-safe: iterates the zone offset at the resolved instant.
 * Returns null for an empty/invalid value.
 */
export function pacificLocalToISO(local, tz = PT) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '')
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = t => {
    const p = ptParts(new Date(t), tz)
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    return asUTC - Math.floor(t / 1000) * 1000
  }
  let t = wall
  for (let i = 0; i < 3; i++) t = wall - offsetAt(t)
  return new Date(t).toISOString()
}

/** ISO timestamp → 'Sep 28, 2026, 11:59 PM PT'. */
export function fmtPacific(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: PT, dateStyle: 'medium', timeStyle: 'short' }).format(dt) + ' PT'
}

/** ISO timestamp → the viewer's local time (for a "that's … your time" echo). */
export function fmtLocal(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(dt)
}

/**
 * Validate ballot weights for 1st/2nd/3rd. Returns an error string, or null when valid:
 * three whole numbers, each ≥ 0, strictly decreasing.
 */
export function validateWeights(values) {
  if (!Array.isArray(values) || values.length !== 3) return 'Enter three weights.'
  const nums = values.map(v => (typeof v === 'string' && v.trim() === '' ? NaN : Number(v)))
  if (nums.some(n => !Number.isInteger(n))) return 'Weights must be whole numbers.'
  if (nums.some(n => n < 0)) return 'Weights can’t be negative.'
  if (!(nums[0] > nums[1] && nums[1] > nums[2])) return '1st must beat 2nd, and 2nd must beat 3rd (strictly decreasing).'
  return null
}

/**
 * PostgREST returns a `setof uuid` RPC either as bare strings or as one-key objects
 * depending on version — normalize to an array of ids.
 */
export function normalizeIdList(data) {
  return (data ?? []).map(r => (r && typeof r === 'object' ? Object.values(r)[0] : r)).filter(Boolean)
}

/**
 * Client fallback for `expected_members(month)` if the RPC is unavailable: active, not a
 * test account, joined in or before the month. (Ignores month_absences — the RPC is
 * authoritative; this only keeps the per-member counts useful if it errors.)
 */
export function expectedMembersFallback(users = [], ym) {
  return users
    .filter(u => u.is_active && u.is_test !== true && (!u.joined_at || String(u.joined_at).slice(0, 7) <= ym))
    .map(u => u.id)
}
