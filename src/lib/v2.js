// Movie Club 2.0 — client data layer. Every 2.0 surface (This Month, Home "Your Turn",
// Admin round controls) reads and writes through this module, never ad-hoc queries, so the
// round model lives in one place. Server side: supabase/migrations/20261001000000_v2_engine.sql.
//
// Anonymity is enforced by the DB, not here: *_safe views mask submitter / ballot identity
// until the film reveals, and the progress RPCs expose WHO has acted, never WHAT.

import { supabase } from './supabase'

/** Round phases of the current 2.0 month. */
export const PHASE = {
  NONE: 'none',             // no 2.0 month exists yet
  COLLECTING: 'collecting', // month upcoming: members add 0–2 films to the list
  VOTING: 'voting',         // an election is open: rank your top 3
  WATCHING: 'watching',     // a film is elected and not yet fully scored
  BETWEEN: 'between',       // current film revealed; admin opens the next vote or closes the month
  CLOSED: 'closed',         // latest 2.0 month revealed, next not yet open
}

/**
 * Pure: derive the phase from loaded rows. Exported for tests.
 * @param {{month?:object|null, elections?:object[], films?:object[]}} s
 */
export function derivePhase({ month, elections = [], films = [] } = {}) {
  if (!month) return PHASE.NONE
  if (month.status === 'upcoming') return PHASE.COLLECTING
  if (month.status === 'revealed') return PHASE.CLOSED
  if (elections.some(e => e.status === 'open')) return PHASE.VOTING
  if (films.some(f => !f.scores_revealed)) return PHASE.WATCHING
  return PHASE.BETWEEN
}

/** Pure: live candidates for a vote = submissions on the list, not withdrawn, not yet elected. */
export function liveCandidates(submissions = []) {
  return submissions.filter(s => !s.withdrawn_at && !s.elected)
}

/** Pure: points for a ranked ballot under the club's weights (default 6/4/3). */
export function ballotPoints(rank, weights = [6, 4, 3]) {
  return weights[rank - 1] ?? 0
}

/** Pick the 2.0 month that's "current": an active one first, else the newest upcoming, else newest revealed. */
export function pickCurrentMonth(months = []) {
  const by = st => months.filter(m => m.status === st).sort((a, b) => b.month_year.localeCompare(a.month_year))[0]
  return by('active') ?? by('upcoming') ?? by('revealed') ?? null
}

/**
 * Load everything a 2.0 surface needs for the viewer, in one call.
 * Returns { phase, month, submissions, mySubmissions, elections, openElection, myBallot,
 *           films, currentFilm, myRating, voteProgress, filmProgress, weights, error }.
 */
export async function loadV2State(userId) {
  const empty = { phase: PHASE.NONE, month: null, submissions: [], mySubmissions: [], elections: [],
    openElection: null, myBallot: [], films: [], currentFilm: null, myRating: null,
    voteProgress: [], filmProgress: [], weights: [6, 4, 3], error: null }

  const [{ data: months, error: mErr }, { data: settings }] = await Promise.all([
    supabase.from('months').select('id, month_year, status, mode, theme, submissions_close_at, started_at, season_id')
      .eq('mode', 'v2').order('month_year', { ascending: false }).limit(6),
    supabase.from('app_settings').select('vote_points').limit(1).maybeSingle(),
  ])
  if (mErr) return { ...empty, error: mErr.message }
  const weights = settings?.vote_points ?? [6, 4, 3]
  const month = pickCurrentMonth(months ?? [])
  if (!month) return { ...empty, weights }

  const [{ data: submissions }, { data: elections }, { data: films }] = await Promise.all([
    supabase.from('submissions_safe').select('*').eq('month_id', month.id).order('submitted_at'),
    supabase.from('elections_safe').select('*').eq('month_id', month.id).order('sequence'),
    supabase.from('movies_safe').select('*').eq('month_id', month.id).order('created_at'),
  ])
  const subs = submissions ?? []
  const elecs = elections ?? []
  const filmRows = films ?? []
  const openElection = elecs.find(e => e.status === 'open') ?? null
  const currentFilm = filmRows.find(f => !f.scores_revealed) ?? null

  const [ballotRes, ratingRes, voteProg, filmProg] = await Promise.all([
    openElection
      ? supabase.from('ballots_safe').select('submission_id, rank').eq('election_id', openElection.id).eq('user_id', userId).order('rank')
      : Promise.resolve({ data: [] }),
    currentFilm
      ? supabase.from('ratings').select('id, movie_id, score, pre_watch_excitement, recommend_outside_club').eq('movie_id', currentFilm.id).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    openElection ? supabase.rpc('v2_vote_progress', { p_election_id: openElection.id }) : Promise.resolve({ data: [] }),
    currentFilm ? supabase.rpc('v2_film_progress', { p_movie_id: currentFilm.id }) : Promise.resolve({ data: [] }),
  ])

  return {
    phase: derivePhase({ month, elections: elecs, films: filmRows }),
    month,
    submissions: subs,
    mySubmissions: subs.filter(s => s.user_id === userId && !s.withdrawn_at),
    elections: elecs,
    openElection,
    myBallot: (ballotRes.data ?? []).map(b => b.submission_id),
    films: filmRows,
    currentFilm,
    myRating: ratingRes.data ?? null,
    voteProgress: voteProg.data ?? [],
    filmProgress: filmProg.data ?? [],
    weights,
    error: null,
  }
}

// ── Member actions ────────────────────────────────────────────────────────────
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

/** Add (or update) a film on the list. `selected` = enrichFilm() output; `metadata` = metadataFor(). */
export const submitFilm = (monthId, selected, metadata, justification = null) =>
  rpc('v2_submit', { p_month_id: monthId, p_tmdb_id: selected.tmdb_id, p_title: selected.title,
    p_poster_url: selected.poster_path ?? null, p_metadata: metadata, p_justification: justification?.trim() || null })
export const withdrawSubmission = submissionId => rpc('v2_withdraw', { p_submission_id: submissionId })
/** Ranked ballot: array of 1–3 submission ids, best first. Re-casting replaces the ballot. */
export const castBallot = (electionId, rankedSubmissionIds) =>
  rpc('v2_cast_ballot', { p_election_id: electionId, p_submission_ids: rankedSubmissionIds })

// ── Admin actions (the DB re-checks is_admin on every one) ───────────────────
export const closeSubmissions = monthId => rpc('v2_close_submissions', { p_month_id: monthId })
export const openElection = monthId => rpc('v2_open_election', { p_month_id: monthId })
export const closeElection = electionId => rpc('v2_close_election', { p_election_id: electionId, p_force: false })
export const markAbsent = (movieId, userId, reason = null) => rpc('v2_mark_absent', { p_movie_id: movieId, p_user_id: userId, p_reason: reason })
export const closeMonth = (monthId, force = false) => rpc('v2_close_month', { p_month_id: monthId, p_force: force })

export async function setClubMode(mode) {
  const { error } = await supabase.from('app_settings').update({ club_mode: mode }).eq('id', true)
  if (error) throw new Error(error.message)
}
export async function setVoteWeights(weights) {
  const { error } = await supabase.from('app_settings').update({ vote_points: weights }).eq('id', true)
  if (error) throw new Error(error.message)
}
/** Admin: create the first 2.0 month (later months are spawned by closeMonth). */
export async function createV2Month({ seasonId, monthYear, theme, submissionsCloseAt }) {
  const { data, error } = await supabase.from('months').insert({
    season_id: seasonId, month_year: monthYear, status: 'upcoming', mode: 'v2', auto_activate: false,
    theme: theme || null, submissions_close_at: submissionsCloseAt || null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}
