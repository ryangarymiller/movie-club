// ─── Shared Awards module ─────────────────────────────────────────────────────
//
// Awards are NOT stored in the database — there is no `awards` table. They are
// computed at runtime from { movies, ratings, users, months, seasons } by reusing
// the compute functions that live in src/pages/Awards.jsx.
//
// This module assembles the full award set across every month / season / year
// present in the data and exposes two lookups:
//
//   getAwardsForFilm(movieId, data) → awards that this film won
//   getAwardsForUser(userId,  data) → awards this user won, INCLUDING awards for
//                                     films they picked (e.g. Pick of the Month)
//
// Each award record has the shape:
//   { key, label, emoji, scope, period, movieId?, userId?, metric? }
//
// HARD RULES honoured here:
//   • Test account i.am.ryan.the.miller@gmail.com is excluded from all data.
//   • Zack (joined Apr 2026) exclusion for Jan–Mar 2026 is handled inside the
//     compute functions (monthly/season) which we reuse unchanged.

import {
  computeMonthlyAwards,
  computeSeasonAwards,
  computeAnnualAwards,
  computeAllTimeAwards,
  isWinter2026,
} from '../pages/Awards.jsx'

export const TEST_USER_EMAIL = 'i.am.ryan.the.miller@gmail.com'

// ─── Award definitions ────────────────────────────────────────────────────────
// For each scope, a list describing how to extract winners from a compute result.
// `target` is 'film' (winner is a movie) or 'user' (winner is a member).
// `field` is the key on the compute result holding the winner object.

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

// Monthly: from computeMonthlyAwards()
const MONTHLY_DEFS = [
  { key: 'pick_of_month',    label: 'Pick of the Month',  emoji: '🎬', target: 'film', field: 'pickOfMonth' },
  { key: 'flop_of_month',    label: 'Flop of the Month',  emoji: '💀', target: 'film', field: 'flopOfMonth' },
  { key: 'oracle',           label: 'The Oracle',         emoji: '🎯', target: 'user', field: 'oracleWinner' },
  { key: 'hype_machine',     label: 'Hype Machine',       emoji: '🚀', target: 'user', field: 'hypeMachineWinner' },
  { key: 'letdown',          label: 'The Letdown',        emoji: '📉', target: 'film', field: 'letdownMovie' },
  { key: 'surprise',         label: 'The Surprise',       emoji: '⬆️', target: 'film', field: 'surpriseMovie' },
  { key: 'most_divisive',    label: 'Most Divisive',      emoji: '🔥', target: 'film', field: 'divisiveMovie' },
  { key: 'most_unanimous',   label: 'Most Unanimous',     emoji: '🤝', target: 'film', field: 'unanimousMovie' },
  { key: 'contrarian',       label: 'The Contrarian',     emoji: '🦅', target: 'user', field: 'contrarianWinner' },
]

// Season: from computeSeasonAwards()
const SEASON_DEFS = [
  { key: 'film_of_season',     label: 'Film of the Season',     emoji: '🏆', target: 'film', field: 'filmOfSeason' },
  { key: 'flop_of_season',     label: 'Flop of the Season',     emoji: '💀', target: 'film', field: 'flopOfSeason' },
  { key: 'picker_of_season',   label: 'Picker of the Season',   emoji: '🎬', target: 'user', field: 'pickerOfSeason' },
  { key: 'ice_cold',           label: 'Ice Cold',               emoji: '🧊', target: 'user', field: 'iceCold' },
  { key: 'season_divisive',    label: 'Most Divisive Film',     emoji: '🔥', target: 'film', field: 'mostDivisiveFilm' },
  { key: 'season_unanimous',   label: 'Most Unanimous Film',    emoji: '🤝', target: 'film', field: 'mostUnanimousFilm' },
  { key: 'season_harshest',    label: 'Harshest Critic',        emoji: '😤', target: 'user', field: 'harshestCritic' },
  { key: 'season_generous',    label: 'Most Generous',          emoji: '😊', target: 'user', field: 'mostGenerous' },
  { key: 'season_contrarian',  label: 'The Contrarian',         emoji: '🦅', target: 'user', field: 'contrarianWinner' },
  { key: 'season_oracle',      label: 'The Oracle',             emoji: '🎯', target: 'user', field: 'oracleWinner' },
  { key: 'season_consistent_picker', label: 'Most Consistent Picker', emoji: '🎚️', target: 'user', field: 'mostConsistentPicker' },
]

// Annual: from computeAnnualAwards()
const ANNUAL_DEFS = [
  { key: 'film_of_year',       label: 'Film of the Year',          emoji: '🏆', target: 'film', field: 'filmOfYear' },
  { key: 'worst_film_of_year', label: 'Worst Film of the Year',    emoji: '💀', target: 'film', field: 'worstFilmOfYear' },
  { key: 'picker_of_year',     label: 'Picker of the Year',        emoji: '🎬', target: 'user', field: 'pickerOfYear' },
  { key: 'annual_harshest',    label: 'Harshest Critic of the Year', emoji: '😤', target: 'user', field: 'harshestCritic' },
  { key: 'annual_generous',    label: 'Most Generous of the Year', emoji: '😊', target: 'user', field: 'mostGenerous' },
  { key: 'annual_divisive',    label: 'Most Divisive Film of the Year', emoji: '🔥', target: 'film', field: 'mostDivisiveFilm' },
  { key: 'annual_oracle',      label: 'The Oracle of the Year',    emoji: '🎯', target: 'user', field: 'oracleOfYear' },
  { key: 'annual_most_consistent', label: 'Most Consistent',       emoji: '🎚️', target: 'user', field: 'mostConsistent' },
  { key: 'annual_wildcard',    label: 'The Wildcard',              emoji: '🎭', target: 'user', field: 'wildcard' },
]

// All-Time: from computeAllTimeAwards()
const ALLTIME_DEFS = [
  { key: 'greatest_film',     label: 'Greatest Film Ever Shown', emoji: '🏆', target: 'film', field: 'greatestFilm' },
  { key: 'worst_film',        label: 'Worst Film Ever',          emoji: '💩', target: 'film', field: 'worstFilm' },
  { key: 'divisive_ever',     label: 'Most Divisive Film Ever',  emoji: '🔥', target: 'film', field: 'mostDivisiveFilm' },
  { key: 'unanimous_ever',    label: 'Most Unanimous Film Ever', emoji: '🤝', target: 'film', field: 'mostUnanimousFilm' },
  { key: 'picker_goat',       label: 'Picker GOAT',              emoji: '🐐', target: 'user', field: 'topPicker' },
  { key: 'coldest_critic',    label: 'Coldest Critic Ever',      emoji: '🧊', target: 'user', field: 'harshestCritic' },
  { key: 'biggest_softie',    label: 'Biggest Softie Ever',      emoji: '🥰', target: 'user', field: 'mostGenerous' },
  { key: 'wildcard_alltime',  label: 'The Wildcard',             emoji: '🎭', target: 'user', field: 'biggestContrarian' },
  { key: 'oracle_alltime',    label: 'The Oracle (All-Time)',    emoji: '🎯', target: 'user', field: 'oracleAllTime' },
]

// ─── Data filtering ───────────────────────────────────────────────────────────

// Remove the test account from users (and its ratings) before computing anything.
function sanitize(data) {
  const users = (data.users ?? []).filter(
    u => (u.email ?? '').toLowerCase() !== TEST_USER_EMAIL
  )
  const allowedUserIds = new Set(users.map(u => u.id))
  const ratings = (data.ratings ?? []).filter(r => allowedUserIds.has(r.user_id))
  return {
    movies: data.movies ?? [],
    ratings,
    users,
    months: data.months ?? [],
    seasons: data.seasons ?? [],
  }
}

// Build a movie_id → picker_user_id map (only when picker revealed).
function pickerByMovie(movies) {
  const map = {}
  movies.forEach(m => {
    if (m.picker_revealed && m.picked_by_user_id) map[m.id] = m.picked_by_user_id
  })
  return map
}

// ─── Core: compute every award record across all periods ───────────────────────

function computeAllAwardRecords(rawData) {
  const data = sanitize(rawData)
  const { movies, ratings, users, months, seasons } = data
  const records = []
  const pickerMap = pickerByMovie(movies)
  const monthYearById = {}
  months.forEach(m => { monthYearById[m.id] = m.month_year })

  // Helper: push one record from a def + compute result.
  function pushFrom(defs, result, scope, period, periodRef) {
    if (!result) return
    defs.forEach(def => {
      const winner = result[def.field]
      if (!winner || winner.id == null) return
      const rec = {
        key: def.key,
        label: def.label,
        emoji: def.emoji,
        scope,
        period,
        periodRef,
      }
      if (def.target === 'film') {
        rec.movieId = winner.id
        // attach picker so the award also surfaces on the picker's profile
        if (pickerMap[winner.id]) rec.pickerUserId = pickerMap[winner.id]
        const avgScore = result.movieAvgScore?.[winner.id]
        if (avgScore != null) rec.metric = `avg ${fmt(avgScore)}`
      } else {
        rec.userId = winner.id
      }
      records.push(rec)
    })
  }

  // ── Monthly (per month that has revealed films) ──
  months.forEach(month => {
    const monthMovies = movies.filter(m => m.month_id === month.id && m.scores_revealed)
    if (!monthMovies.length) return
    const result = computeMonthlyAwards(movies, ratings, users, month)
    const period = fmtMonthYear(month.month_year)
    pushFrom(MONTHLY_DEFS, result, 'monthly', period, month.month_year)
  })

  // ── Season (per season that has revealed films) ──
  seasons.forEach(season => {
    const seasonMonthIds = new Set(months.filter(m => m.season_id === season.id).map(m => m.id))
    const hasRevealed = movies.some(m => seasonMonthIds.has(m.month_id) && m.scores_revealed)
    if (!hasRevealed) return
    const winter = isWinter2026(season, months)
    const result = computeSeasonAwards(movies, ratings, users, season, months, winter)
    pushFrom(SEASON_DEFS, result, 'season', season.name, season.id)
  })

  // ── Annual (per calendar year present in the data) ──
  const years = new Set()
  movies.forEach(m => {
    const my = monthYearById[m.month_id]
    if (my) years.add(my.split('-')[0])
  })
  years.forEach(year => {
    const yearMovies = movies.filter(m => (monthYearById[m.month_id] ?? '').startsWith(year))
    if (!yearMovies.some(m => m.scores_revealed)) return
    const result = computeAnnualAwards(yearMovies, ratings, users, year)
    pushFrom(ANNUAL_DEFS, result, 'annual', year, year)
  })

  // ── All-Time ──
  const allTime = computeAllTimeAwards(movies, ratings, users)
  pushFrom(ALLTIME_DEFS, allTime, 'alltime', 'All-Time', null)

  return records
}

function fmtMonthYear(monthYear) {
  if (!monthYear) return ''
  return new Date(`${monthYear}-02`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Cache keyed by identity of the input arrays so repeated calls (film overlay +
// profile) within one render pass don't recompute. Keyed loosely on lengths +
// first ids; callers pass freshly-loaded data so this is just a small win.
let _cache = null
function getRecords(data) {
  const sig = [
    data.movies?.length, data.ratings?.length, data.users?.length,
    data.months?.length, data.seasons?.length,
    data.movies?.[0]?.id, data.ratings?.[0]?.id,
  ].join('|')
  if (_cache && _cache.sig === sig) return _cache.records
  const records = computeAllAwardRecords(data)
  _cache = { sig, records }
  return records
}

// ─── Public API ────────────────────────────────────────────────────────────────

// Awards this film won.
export function getAwardsForFilm(movieId, data) {
  if (movieId == null) return []
  return getRecords(data).filter(r => r.movieId === movieId)
}

// Awards this user won — directly (critic/picker awards) OR via a film they
// picked (e.g. Pick of the Month for their pick).
export function getAwardsForUser(userId, data) {
  if (userId == null) return []
  return getRecords(data).filter(
    r => r.userId === userId || r.pickerUserId === userId
  )
}

// Exposed for callers that want the whole computed set.
export function getAllAwardRecords(data) {
  return getRecords(data)
}

// ─── DB-backed reads ──────────────────────────────────────────────────────────

// Build a flat lookup: award_key → { label, emoji }
function buildKeyLookup() {
  const map = {}
  for (const def of [...MONTHLY_DEFS, ...SEASON_DEFS, ...ANNUAL_DEFS, ...ALLTIME_DEFS]) {
    map[def.key] = { label: def.label, emoji: def.emoji }
  }
  return map
}
const KEY_LOOKUP = buildKeyLookup()

function fmtPeriodRef(scope, periodRef) {
  if (scope === 'monthly') return fmtMonthYear(periodRef)
  if (scope === 'alltime') return 'All-Time'
  return periodRef ?? ''
}

function mapDbRow(row) {
  const info = KEY_LOOKUP[row.award_key] ?? { label: row.award_key, emoji: '🏅' }
  return {
    key: row.award_key,
    label: info.label,
    emoji: info.emoji,
    scope: row.scope,
    period: fmtPeriodRef(row.scope, row.period_ref),
    periodRef: row.period_ref,
    movieId: row.movie_id ?? undefined,
    userId: row.user_id ?? undefined,
    pickerUserId: row.picker_user_id ?? undefined,
    metric: row.metric ?? undefined,
  }
}

// Read this film's awards from the DB. Falls back to [] on error.
export async function fetchAwardsForFilm(supabase, movieId) {
  if (movieId == null) return []
  try {
    const { data, error } = await supabase
      .from('awards')
      .select('*')
      .eq('movie_id', movieId)
    if (error) return []
    return (data ?? []).map(mapDbRow)
  } catch {
    return []
  }
}

// Read this user's awards from the DB (direct wins + picker credits).
export async function fetchAwardsForUser(supabase, userId) {
  if (userId == null) return []
  try {
    const { data, error } = await supabase
      .from('awards')
      .select('*')
      .or(`user_id.eq.${userId},picker_user_id.eq.${userId}`)
    if (error) return []
    return (data ?? []).map(mapDbRow)
  } catch {
    return []
  }
}

// ─── DB persistence ───────────────────────────────────────────────────────────
//
// Compute all award records from rawData and upsert them to the `awards` table.
// Returns { count, error }.
//
export async function writeAwardsToDb(supabase, rawData) {
  const records = getAllAwardRecords(rawData)

  const rows = records.map(rec => {
    if (rec.movieId != null) {
      // Film award
      return {
        award_key: rec.key,
        scope: rec.scope,
        period_ref: rec.periodRef ?? null,
        movie_id: rec.movieId,
        picker_user_id: rec.pickerUserId ?? null,
        metric: rec.metric ?? null,
      }
    } else {
      // User award
      return {
        award_key: rec.key,
        scope: rec.scope,
        period_ref: rec.periodRef ?? null,
        user_id: rec.userId,
        metric: rec.metric ?? null,
      }
    }
  })

  if (rows.length === 0) return { count: 0, error: null }

  const { error } = await supabase
    .from('awards')
    .upsert(rows, { onConflict: 'award_key,scope,period_ref', ignoreDuplicates: false })

  return { count: rows.length, error }
}
