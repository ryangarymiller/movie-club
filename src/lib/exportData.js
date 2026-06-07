// Personal-data export ("download my data", GDPR-style).
//
// Gathers EVERYTHING the app holds about the signed-in member — scored ratings,
// reviews, comments, revealed picks, the (private) upcoming pick / draft queue /
// watchlist, picker guesses, score predictions, awards, and their profile fields —
// into a single structured object, then helps the caller hand it to the browser as
// a downloadable file.
//
// Hard rule: this only ever queries by the OWNER's own user id. Nothing here takes
// an arbitrary id; the caller passes the signed-in `profile`. (RLS also guards
// each table, but we never even ask for anyone else's rows.)

// ─── Helpers ────────────────────────────────────────────────────────────────────

// Resolve the title (+ a little context) for a set of movie ids via movies_safe —
// the same non-admin-safe view the rest of Profile.jsx reads. Returns a id→movie map.
async function fetchMovieMap(supabase, movieIds) {
  const ids = [...new Set(movieIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('movies_safe')
    .select('id, title, year_released, month_id')
    .in('id', ids)
  if (error) throw error
  return Object.fromEntries((data ?? []).map(m => [m.id, m]))
}

// Build a month-id → "Month YYYY" label map for the given month ids.
async function fetchMonthMap(supabase, monthIds) {
  const ids = [...new Set(monthIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('months')
    .select('id, month_year')
    .in('id', ids)
  if (error) throw error
  const out = {}
  for (const m of data ?? []) {
    out[m.id] = { monthYear: m.month_year, label: monthLabel(m.month_year) }
  }
  return out
}

// "2026-03" → "March 2026". Anchored to day 02 to dodge any UTC/local off-by-one.
function monthLabel(monthYear) {
  if (!monthYear) return ''
  const d = new Date(`${monthYear}-02`)
  if (Number.isNaN(d.getTime())) return monthYear
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Data gathering ─────────────────────────────────────────────────────────────

// Returns the full export object for the signed-in member. Throws on the first
// query error so the UI can show an error state (each query is scoped to userId).
export async function gatherUserData(supabase, profile) {
  if (!profile?.id) throw new Error('No signed-in member to export.')
  const userId = profile.id

  // Run the independent per-table queries in parallel. Each is filtered to the
  // owner's own id; reads are further protected by RLS server-side.
  const [
    ratingsRes,
    reviewsRes,
    commentsRes,
    picksRes,
    upcomingRes,
    draftRes,
    watchlistRes,
    guessesRes,
    predictionsRes,
  ] = await Promise.all([
    supabase
      .from('ratings')
      .select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: true }),
    supabase
      .from('reviews')
      .select('id, movie_id, body, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('comments')
      .select('id, movie_id, review_id, parent_comment_id, body, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    // Revealed picks: films this member picked that are now public.
    supabase
      .from('movies_safe')
      .select('id, month_id, title, year_released, pick_justification, picker_revealed')
      .eq('picked_by_user_id', userId)
      .eq('picker_revealed', true),
    // Private, not-yet-revealed queued pick(s). Select * so the justification
    // (stored inside the `metadata` jsonb) comes along whatever its exact shape.
    supabase
      .from('upcoming_picks')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('draft_queue')
      .select('id, tmdb_id, title, poster_url, year_released, position, created_at')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
    supabase
      .from('watchlist')
      .select('id, tmdb_id, title, poster_url, year_released, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('picker_guesses')
      .select('id, movie_id, guessed_user_id')
      .eq('guessing_user_id', userId),
    supabase
      .from('score_predictions')
      .select('id, movie_id, target_user_id, predicted_score')
      .eq('predicting_user_id', userId),
  ])

  // Surface the first error encountered so the UI shows a clear failure.
  for (const res of [
    ratingsRes, reviewsRes, commentsRes, picksRes,
    upcomingRes, draftRes, watchlistRes, guessesRes, predictionsRes,
  ]) {
    if (res.error) throw res.error
  }

  const ratings = ratingsRes.data ?? []
  const reviews = reviewsRes.data ?? []
  const comments = commentsRes.data ?? []
  const picks = picksRes.data ?? []
  const upcomingPicks = upcomingRes.data ?? []
  const draftQueue = draftRes.data ?? []
  const watchlist = watchlistRes.data ?? []
  const guesses = guessesRes.data ?? []
  const predictions = predictionsRes.data ?? []

  // Enrich film-referencing rows with the film title (and picks with a month label).
  const movieMap = await fetchMovieMap(supabase, [
    ...ratings.map(r => r.movie_id),
    ...reviews.map(r => r.movie_id),
    ...comments.map(c => c.movie_id),
    ...guesses.map(g => g.movie_id),
    ...predictions.map(p => p.movie_id),
  ])
  const monthMap = await fetchMonthMap(supabase, picks.map(p => p.month_id))

  const titleOf = id => movieMap[id]?.title ?? null

  // Awards: direct wins + films this member picked that won. Reuse the same
  // OR-filter the Profile page already uses, but inline so this module has no
  // import cycle with the awards lib.
  const { data: awardRows, error: awardErr } = await supabase
    .from('awards')
    .select('id, award_key, scope, period_ref, movie_id, user_id, picker_user_id, metric')
    .or(`user_id.eq.${userId},picker_user_id.eq.${userId}`)
  if (awardErr) throw awardErr
  const awards = awardRows ?? []
  // Pull titles for any award-referenced films we haven't already mapped.
  const awardMovieMap = await fetchMovieMap(supabase, awards.map(a => a.movie_id))

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      name: profile.name ?? null,
      email: profile.email ?? null,
      joined_at: profile.joined_at ?? null,
      timezone: profile.timezone ?? null,
      theme_mode: profile.theme_mode ?? null,
      theme_accent: profile.theme_accent ?? null,
      user_color: profile.user_color ?? null,
      avatar_id: profile.avatar_id ?? null,
      role: profile.role ?? null,
    },
    scores: ratings.map(r => ({
      film: titleOf(r.movie_id),
      score: r.score,
      pre_watch_excitement: r.pre_watch_excitement,
      recommend_outside_club: r.recommend_outside_club,
      submitted_at: r.submitted_at,
      movie_id: r.movie_id,
    })),
    reviews: reviews.map(r => ({
      film: titleOf(r.movie_id),
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      movie_id: r.movie_id,
    })),
    comments: comments.map(c => ({
      film: titleOf(c.movie_id),
      body: c.body,
      review_id: c.review_id,
      parent_comment_id: c.parent_comment_id,
      created_at: c.created_at,
      updated_at: c.updated_at,
      movie_id: c.movie_id,
    })),
    picks: picks.map(p => ({
      film: p.title,
      year_released: p.year_released,
      month: monthMap[p.month_id]?.label ?? null,
      month_year: monthMap[p.month_id]?.monthYear ?? null,
      justification: p.pick_justification ?? null,
      movie_id: p.id,
    })),
    upcomingPicks: upcomingPicks.map(p => ({
      title: p.title ?? null,
      tmdb_id: p.tmdb_id ?? null,
      month_target: p.month_target ?? null,
      justification: p.metadata?.justification ?? p.justification ?? null,
      submitted_at: p.submitted_at ?? null,
    })),
    draftQueue: draftQueue.map(d => ({
      title: d.title,
      tmdb_id: d.tmdb_id,
      year_released: d.year_released,
      position: d.position,
      created_at: d.created_at,
    })),
    watchlist: watchlist.map(w => ({
      title: w.title,
      tmdb_id: w.tmdb_id,
      year_released: w.year_released,
      created_at: w.created_at,
    })),
    guesses: guesses.map(g => ({
      film: titleOf(g.movie_id),
      guessed_user_id: g.guessed_user_id,
      movie_id: g.movie_id,
    })),
    predictions: predictions.map(p => ({
      film: titleOf(p.movie_id),
      target_user_id: p.target_user_id,
      predicted_score: p.predicted_score,
      movie_id: p.movie_id,
    })),
    awards: awards.map(a => ({
      award_key: a.award_key,
      scope: a.scope,
      period_ref: a.period_ref,
      film: a.movie_id ? (movieMap[a.movie_id]?.title ?? awardMovieMap[a.movie_id]?.title ?? null) : null,
      won_as_picker: a.picker_user_id === userId && a.user_id !== userId,
      metric: a.metric,
    })),
  }
}

// ─── CSV (scores table — the most tabular slice) ─────────────────────────────────

function csvCell(value) {
  if (value == null) return ''
  const s = String(value)
  // Quote if the value contains a comma, quote, or newline; double interior quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Turn the gathered `scores` array into a CSV string.
export function buildScoresCsv(scores) {
  const headers = ['film', 'score', 'pre_watch_excitement', 'recommend_outside_club', 'submitted_at']
  const lines = [headers.join(',')]
  for (const row of scores ?? []) {
    lines.push(headers.map(h => csvCell(row[h])).join(','))
  }
  return lines.join('\r\n')
}

// ─── File naming + download ──────────────────────────────────────────────────────

// "movie-club-ryan-2026-06-07.json" — first name slugified, today's date.
export function exportFilename(name, ext) {
  const first = (name ?? 'me').trim().split(/\s+/)[0] || 'me'
  const slug = first.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'me'
  const date = new Date().toISOString().slice(0, 10)
  return `movie-club-${slug}-${date}.${ext}`
}

// Trigger a client-side download via a Blob + object URL + transient anchor click.
export function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has resolved.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
