// Movie Club 2.0 — pure helpers + the handful of reads the 2.0 This Month screen needs
// beyond src/lib/v2.js (rosters for names/avatars, the viewer's draft queue, club averages
// and revealed ballots). Kept in a plain .js module (no components) so the v2 component
// files stay Fast-Refresh clean. Round state itself always comes from loadV2State().

import { supabase } from '../../lib/supabase'
import { clubUsers } from '../../lib/members'

// ── Formatting ───────────────────────────────────────────────────────────────

/** Scores always render as X.XX. */
export const formatScore = n => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(2))

export const ordinal = n => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`

export function formatMonthLabel(monthYear) {
  if (!monthYear) return ''
  return new Date(`${monthYear}-02`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Deadline in the viewer's local zone, e.g. "Mon, Sep 28, 11:59 PM PDT". */
export function formatDeadline(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso))
}

/** Remaining time until `iso` relative to `now` (ms). null when no deadline; {past:true} once passed. */
export function countdown(iso, now) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - now
  if (diff <= 0) return { past: true, text: 'Closed' }
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const text = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${Math.max(m, 1)}m left`
  return { past: false, text, urgent: diff < 86400000 }
}

/** movies.genre is text[] in the DB; submission metadata carries a ", "-joined string. */
export const genreText = g => (Array.isArray(g) ? g.join(', ') : g || '')

/**
 * Display names for a roster: first name, unless two members share it (the two Ryans),
 * then "First L." for those. Returns Map<user_id, label>.
 */
export function shortNames(people = []) {
  const first = p => String(p?.name ?? '').trim().split(/\s+/)[0] || 'Member'
  const counts = {}
  for (const p of people) counts[first(p)] = (counts[first(p)] ?? 0) + 1
  const out = new Map()
  for (const p of people) {
    const parts = String(p?.name ?? '').trim().split(/\s+/)
    const f = first(p)
    out.set(p.user_id ?? p.id, counts[f] > 1 && parts[1] ? `${f} ${parts[parts.length - 1][0]}.` : f)
  }
  return out
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names = []) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Server errors are shown verbatim (the DB message is the truth) under a kinder headline
 * for the ones members will realistically hit.
 */
export function friendlyError(message = '') {
  const m = String(message)
  const table = [
    [/already on the list/i, 'Someone beat you to it — that film is already on the list. Try another?'],
    [/already have 2 films/i, "You've used both of your slots. Withdraw one to swap it out."],
    [/deadline has passed|submissions are closed|list is locked/i, 'The list is locked now — submissions have closed.'],
    [/voting is not open/i, 'This vote has just closed.'],
    [/not an expected/i, "You're not on this round's roster. Ask an admin if that looks wrong."],
    [/admin only/i, 'Only an admin can do that.'],
    [/not finished yet|still being watched/i, "The current film isn't finished yet — everyone has to score it first."],
    [/no candidates left/i, 'There are no films left on the list. Close the month to start a new list.'],
  ]
  const hit = table.find(([re]) => re.test(m))
  return { headline: hit ? hit[1] : 'Something went wrong. Please try again.', detail: m || null }
}

/** Points-per-rank weights clipped to the first three, for display. */
export const rankWeights = (weights = [6, 4, 3]) => [0, 1, 2].map(i => weights?.[i] ?? 0)

// ── Reads not covered by src/lib/v2.js ───────────────────────────────────────

/** Club roster for names/avatars/colours (test account removed). */
export async function loadClubUsers() {
  const { data } = await supabase.from('users').select('id, name, is_test, is_active, user_color, avatar_id')
  return clubUsers(data)
}

/** The viewer's private, ranked draft queue (quick-pick source). */
export async function loadDraftQueue(userId) {
  if (!userId) return []
  const { data } = await supabase
    .from('draft_queue')
    .select('id, tmdb_id, title, poster_url, year_released, position')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  return data ?? []
}

/** Club average per film, from the RLS-visible ratings (callers pass revealed films only). */
export async function loadClubAverages(movieIds = []) {
  if (!movieIds.length) return {}
  const { data } = await supabase.from('ratings').select('movie_id, score').in('movie_id', movieIds)
  const acc = {}
  for (const r of data ?? []) {
    if (r.score == null) continue
    ;(acc[r.movie_id] ??= []).push(Number(r.score))
  }
  const out = {}
  for (const [id, arr] of Object.entries(acc)) out[id] = { avg: arr.reduce((s, v) => s + v, 0) / arr.length, count: arr.length }
  return out
}

/** Every member's ballot for an election. user_id is unmasked by ballots_safe once the film reveals. */
export async function loadElectionBallots(electionId) {
  if (!electionId) return []
  const { data, error } = await supabase
    .from('ballots_safe')
    .select('user_id, submission_id, rank')
    .eq('election_id', electionId)
    .order('rank')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Group ballot rows into [{user_id, ranks:[submission_id,…]}] (rank order). Masked rows are dropped. */
export function groupBallots(rows = []) {
  const by = new Map()
  for (const r of rows) {
    if (!r.user_id) continue
    if (!by.has(r.user_id)) by.set(r.user_id, [])
    by.get(r.user_id)[r.rank - 1] = r.submission_id
  }
  return [...by.entries()].map(([user_id, ranks]) => ({ user_id, ranks: ranks.filter(Boolean) }))
}

/** Has the club watched this TMDB film before? (Rule 8: allowed, but discouraged.) */
export async function clubWatchedBefore(tmdbId) {
  if (!tmdbId) return false
  const { data } = await supabase.from('movies').select('id').eq('tmdb_id', tmdbId).limit(1)
  return (data ?? []).length > 0
}

/**
 * Normalise movies.streaming_providers (stored in three shapes — full TMDB response,
 * region-keyed, or a flat US object; same rule as Films' StreamingSection) into
 * { groups: [{label, names[]}], link }. Empty groups are dropped.
 */
export function providerGroups(providers) {
  const us = providers?.results?.US ?? providers?.US ??
    (providers && ('flatrate' in providers || 'rent' in providers || 'buy' in providers) ? providers : null)
  if (!us) return { groups: [], link: null }
  const names = list => [...new Set((list ?? []).map(p => p?.provider_name).filter(Boolean))]
  const groups = [
    { label: 'Stream', names: names(us.flatrate) },
    { label: 'Rent', names: names(us.rent) },
    { label: 'Buy', names: names(us.buy) },
  ].filter(g => g.names.length)
  return { groups, link: us.link ?? null }
}
