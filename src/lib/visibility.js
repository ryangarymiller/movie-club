// Rolling score-visibility helpers (mirror the `ratings` RLS).
// ---------------------------------------------------------------------------
// During the ACTIVE month, a film's club average + other members' scores are
// visible to a viewer ONLY once they've submitted their own score for it. When
// the month ends (next month activated) the film flips `scores_revealed = true`
// and is public to everyone. The viewer's OWN score is always visible.
//
// The database enforces this — the client just needs to avoid showing a
// misleading partial average (e.g. computed from the viewer's own lone rating)
// for a film it can't actually see. Use these everywhere a club average,
// other-member score, or per-film stat is displayed.

// Can this viewer see OTHER members' scores / the club average for `film`?
// `myRating` is the viewer's own rating row for the film (or null/undefined).
export function canSeeScores(film, myRating) {
  if (!film) return false
  if (film.scores_revealed) return true
  return !!(myRating && myRating.score != null)
}

// The average to DISPLAY for a film, or null when the viewer can't see it.
//   · not visible            → null (UI should show a "score to reveal" hint)
//   · revealed + historical  → the authoritative historical average
//   · otherwise              → the computed average from visible ratings
// `historicalAvg` is movies.historical_avg_score; `computedAvg` is the mean of
// the (already RLS-gated) ratings the client received for this film.
export function visibleAvg(film, myRating, computedAvg, historicalAvg = null) {
  if (!canSeeScores(film, myRating)) return null
  if (film.scores_revealed && historicalAvg != null) return Number(historicalAvg)
  return computedAvg ?? null
}
