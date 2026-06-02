import { describe, it, expect } from 'vitest'
import {
  computeSeasonAwards,
  computeAnnualAwards,
  computeAllTimeAwards,
} from '../pages/Awards.jsx'

// ──────────────────────────────────────────────────────────────────────────────
// Tests for the awards added this session, importing the REAL compute functions
// from src/pages/Awards.jsx (no re-implementation).
//
// Winner shapes (confirmed from source):
//   - User awards return the whole user object: { id, name, email }
//   - Movie awards return the whole movie object
//
// Data shapes:
//   movies   { id, month_id, picked_by_user_id, picker_revealed, scores_revealed,
//              historical_avg_score }
//   ratings  { movie_id, user_id, score, pre_watch_excitement }
//   users    { id, name, email }
//   months   { id, season_id, month_year }
//   seasons  { id, name }
//   guesses  { movie_id, guessing_user_id, guessed_user_id }
// ──────────────────────────────────────────────────────────────────────────────

// Shared user roster (no Zack, so season eligibility is never a confound)
const users = [
  { id: 'u1', name: 'Alice', email: 'alice@example.com' },
  { id: 'u2', name: 'Bob', email: 'bob@example.com' },
  { id: 'u3', name: 'Carol', email: 'carol@example.com' },
  { id: 'u4', name: 'Dave', email: 'dave@example.com' },
]

// ─── computeSeasonAwards ──────────────────────────────────────────────────────

describe('computeSeasonAwards — mostConsistentPicker', () => {
  // Build a season where each picker has 2 picks. We craft the per-film averages
  // (via the member scores) so one picker has clearly the lowest spread between
  // their picks' averages.
  const season = { id: 's1', name: 'Spring 2026' }
  const months = [
    { id: 'm1', season_id: 's1', month_year: '2026-03' },
    { id: 'm2', season_id: 's1', month_year: '2026-04' },
  ]

  // Alice picks films whose averages are 6 and 6.2  → tiny spread (consistent)
  // Bob   picks films whose averages are 2 and 9    → huge spread (inconsistent)
  const movies = [
    { id: 'A1', month_id: 'm1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'A2', month_id: 'm2', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'B1', month_id: 'm1', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'B2', month_id: 'm2', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]

  // 4 scorers per film so each film has ≥2 scores and a clean average.
  const ratingsFor = (movieId, value) =>
    users.map(u => ({ movie_id: movieId, user_id: u.id, score: value, pre_watch_excitement: null }))
  const allRatings = [
    ...ratingsFor('A1', 6.0),  // Alice film avg 6.0
    ...ratingsFor('A2', 6.2),  // Alice film avg 6.2  → sd of [6.0,6.2] = 0.1
    ...ratingsFor('B1', 2.0),  // Bob film avg 2.0
    ...ratingsFor('B2', 9.0),  // Bob film avg 9.0    → sd of [2.0,9.0] = 3.5
  ]

  const result = computeSeasonAwards(movies, allRatings, users, season, months, false)

  it('picks the picker with the lowest spread between their picks', () => {
    expect(result.mostConsistentPicker).toBeTruthy()
    expect(result.mostConsistentPicker.id).toBe('u1')
    expect(result.mostConsistentPicker.name).toBe('Alice')
  })

  it('reports the winning stddev (population sd of pick averages)', () => {
    // population sd of [6.0, 6.2] = 0.1
    expect(result.mostConsistentPickerSd).toBeCloseTo(0.1, 6)
  })

  it('records the pick count behind the stddev', () => {
    expect(result.mostConsistentPickerCount).toBe(2)
  })
})

describe('computeSeasonAwards — mostConsistentPicker threshold (needs ≥2 picks)', () => {
  // Every picker has only ONE pick → nobody qualifies → null winner.
  const season = { id: 's1', name: 'Spring 2026' }
  const months = [{ id: 'm1', season_id: 's1', month_year: '2026-03' }]
  const movies = [
    { id: 'A1', month_id: 'm1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'B1', month_id: 'm1', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]
  const allRatings = [
    ...users.map(u => ({ movie_id: 'A1', user_id: u.id, score: 7, pre_watch_excitement: null })),
    ...users.map(u => ({ movie_id: 'B1', user_id: u.id, score: 5, pre_watch_excitement: null })),
  ]

  const result = computeSeasonAwards(movies, allRatings, users, season, months, false)

  it('returns null when no picker has ≥2 picks', () => {
    expect(result.mostConsistentPicker).toBeNull()
    expect(result.mostConsistentPickerSd).toBe(Infinity)
  })
})

describe('computeSeasonAwards — easyCrowd', () => {
  // Easy Crowd = fewest "low" scores (≤ 4.0), tie-break highest average. Min 2 scores.
  const season = { id: 's1', name: 'Spring 2026' }
  const months = [{ id: 'm1', season_id: 's1', month_year: '2026-03' }]
  // Two films so every member casts ≥2 scores.
  const movies = [
    { id: 'F1', month_id: 'm1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'F2', month_id: 'm1', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]
  // Carol (u3) never scores low → 0 low scores → should win Easy Crowd.
  // Alice (u1): one low score (3). Bob (u2): two low scores. Dave (u4): one low score
  // but lower average than Alice (irrelevant since both have ≥1 low and Carol has 0).
  const allRatings = [
    // F1
    { movie_id: 'F1', user_id: 'u1', score: 3.0, pre_watch_excitement: null },  // Alice low
    { movie_id: 'F1', user_id: 'u2', score: 2.0, pre_watch_excitement: null },  // Bob low
    { movie_id: 'F1', user_id: 'u3', score: 8.0, pre_watch_excitement: null },  // Carol high
    { movie_id: 'F1', user_id: 'u4', score: 4.0, pre_watch_excitement: null },  // Dave low (==4 counts)
    // F2
    { movie_id: 'F2', user_id: 'u1', score: 9.0, pre_watch_excitement: null },  // Alice high
    { movie_id: 'F2', user_id: 'u2', score: 1.0, pre_watch_excitement: null },  // Bob low
    { movie_id: 'F2', user_id: 'u3', score: 7.0, pre_watch_excitement: null },  // Carol high
    { movie_id: 'F2', user_id: 'u4', score: 9.0, pre_watch_excitement: null },  // Dave high
  ]

  const result = computeSeasonAwards(movies, allRatings, users, season, months, false)

  it('picks the member with the fewest scores ≤ 4.0', () => {
    expect(result.easyCrowd).toBeTruthy()
    expect(result.easyCrowd.id).toBe('u3')
    expect(result.easyCrowd.name).toBe('Carol')
  })

  it('reports the winner low-count and average', () => {
    expect(result.easyCrowdLowCount).toBe(0)         // Carol: 0 scores ≤ 4
    expect(result.easyCrowdAvg).toBeCloseTo(7.5, 6)  // (8 + 7) / 2
  })
})

describe('computeSeasonAwards — easyCrowd tie-break by highest average', () => {
  const season = { id: 's1', name: 'Spring 2026' }
  const months = [{ id: 'm1', season_id: 's1', month_year: '2026-03' }]
  const movies = [
    { id: 'F1', month_id: 'm1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'F2', month_id: 'm1', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]
  // Both Alice and Carol have 0 low scores. Carol's average is higher → Carol wins.
  const allRatings = [
    { movie_id: 'F1', user_id: 'u1', score: 6.0, pre_watch_excitement: null },  // Alice
    { movie_id: 'F2', user_id: 'u1', score: 7.0, pre_watch_excitement: null },  // Alice avg 6.5
    { movie_id: 'F1', user_id: 'u3', score: 9.0, pre_watch_excitement: null },  // Carol
    { movie_id: 'F2', user_id: 'u3', score: 10.0, pre_watch_excitement: null }, // Carol avg 9.5
  ]

  const result = computeSeasonAwards(movies, allRatings, users, season, months, false)

  it('breaks a low-count tie in favour of the higher average', () => {
    expect(result.easyCrowdLowCount).toBe(0)
    expect(result.easyCrowd.id).toBe('u3')
    expect(result.easyCrowdAvg).toBeCloseTo(9.5, 6)
  })
})

// ─── computeAnnualAwards ──────────────────────────────────────────────────────

// A helper to build the 8-month "evolved-eligible" calendar of revealed movies.
// One revealed movie per month, picked by a rotating member so picker logic stays valid.
function buildYearMovies() {
  const monthYears = [
    '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08',
  ]
  const movies = []
  const monthYearByMovie = {}
  monthYears.forEach((my, i) => {
    const id = `mov${i + 1}`
    const picker = users[i % users.length].id
    movies.push({
      id,
      month_id: `mo${i + 1}`,
      picked_by_user_id: picker,
      picker_revealed: true,
      scores_revealed: true,
      historical_avg_score: null,
    })
    monthYearByMovie[id] = my
  })
  return { movies, monthYearByMovie, monthYears }
}

describe('computeAnnualAwards — mostConsistent (lowest score stddev, ≥3 scores)', () => {
  const { movies, monthYearByMovie } = buildYearMovies()
  // Alice gives identical scores everywhere (sd 0) → most consistent.
  // Bob swings wildly. Carol scores only twice → below the ≥3 threshold, ignored.
  const allRatings = []
  movies.forEach((m, i) => {
    allRatings.push({ movie_id: m.id, user_id: 'u1', score: 7.0, pre_watch_excitement: null }) // Alice flat
    allRatings.push({ movie_id: m.id, user_id: 'u2', score: i % 2 === 0 ? 1.0 : 10.0, pre_watch_excitement: null }) // Bob swings
  })
  // Carol only 2 scores total
  allRatings.push({ movie_id: movies[0].id, user_id: 'u3', score: 5.0, pre_watch_excitement: null })
  allRatings.push({ movie_id: movies[1].id, user_id: 'u3', score: 5.0, pre_watch_excitement: null })

  const result = computeAnnualAwards(movies, allRatings, users, 2026, [], monthYearByMovie)

  it('picks the member with the lowest stddev (≥3 scores)', () => {
    expect(result.mostConsistent).toBeTruthy()
    expect(result.mostConsistent.id).toBe('u1')
    expect(result.mostConsistentSd).toBeCloseTo(0, 6)
  })

  it('ignores members below the 3-score threshold', () => {
    // Carol (2 scores, sd 0) would tie/beat Alice if counted — confirm she is NOT chosen.
    expect(result.mostConsistent.id).not.toBe('u3')
  })
})

describe('computeAnnualAwards — wildcard (highest avg deviation from film avg, ≥3 scored films)', () => {
  const { movies, monthYearByMovie } = buildYearMovies()
  // Every film: u1, u3, u4 all score 5.0 (so film avg sits near 5).
  // Bob (u2) scores far from the pack each time → biggest deviation → wildcard.
  const allRatings = []
  movies.forEach(m => {
    allRatings.push({ movie_id: m.id, user_id: 'u1', score: 5.0, pre_watch_excitement: null })
    allRatings.push({ movie_id: m.id, user_id: 'u3', score: 5.0, pre_watch_excitement: null })
    allRatings.push({ movie_id: m.id, user_id: 'u4', score: 5.0, pre_watch_excitement: null })
    allRatings.push({ movie_id: m.id, user_id: 'u2', score: 10.0, pre_watch_excitement: null }) // Bob far away
  })

  const result = computeAnnualAwards(movies, allRatings, users, 2026, [], monthYearByMovie)

  it('picks the member with the biggest deviation from group consensus', () => {
    expect(result.wildcard).toBeTruthy()
    expect(result.wildcard.id).toBe('u2')
    expect(result.wildcard.name).toBe('Bob')
  })

  it('reports a positive wildcard deviation', () => {
    // Film avg per film = (5+5+5+10)/4 = 6.25. Bob's |10-6.25| = 3.75.
    expect(result.wildcardHighest).toBeCloseTo(3.75, 6)
  })
})

describe('computeAnnualAwards — masterOfDisguise (lowest correct-guess rate, ≥3 guesses)', () => {
  const { movies, monthYearByMovie } = buildYearMovies()
  const allRatings = []
  movies.forEach(m => {
    users.forEach(u => allRatings.push({ movie_id: m.id, user_id: u.id, score: 6.0, pre_watch_excitement: null }))
  })

  // mov1 picked by u1, mov5 by u1 (i%4: idx0→u1, idx4→u1). mov2 by u2, mov6 by u2.
  // We want Alice (u1) hard to guess: nobody guesses her correctly.
  // We want Bob (u2) easy to guess: always guessed correctly.
  const guesses = [
    // 3 guesses on Alice's films (mov1, mov5) — all WRONG → rate 0/3
    { movie_id: 'mov1', guessing_user_id: 'u2', guessed_user_id: 'u3' },
    { movie_id: 'mov1', guessing_user_id: 'u3', guessed_user_id: 'u4' },
    { movie_id: 'mov5', guessing_user_id: 'u2', guessed_user_id: 'u4' },
    // 3 guesses on Bob's films (mov2, mov6) — all CORRECT → rate 3/3
    { movie_id: 'mov2', guessing_user_id: 'u1', guessed_user_id: 'u2' },
    { movie_id: 'mov2', guessing_user_id: 'u3', guessed_user_id: 'u2' },
    { movie_id: 'mov6', guessing_user_id: 'u1', guessed_user_id: 'u2' },
  ]

  const result = computeAnnualAwards(movies, allRatings, users, 2026, guesses, monthYearByMovie)

  it('picks the picker guessed correctly least often', () => {
    expect(result.masterOfDisguise).toBeTruthy()
    expect(result.masterOfDisguise.id).toBe('u1')
    expect(result.masterOfDisguise.name).toBe('Alice')
  })

  it('reports the correct-guess rate of the winner', () => {
    expect(result.masterOfDisguiseRate).toBeCloseTo(0, 6)
  })
})

describe('computeAnnualAwards — masterOfDisguise threshold (needs ≥3 guesses)', () => {
  const { movies, monthYearByMovie } = buildYearMovies()
  const allRatings = []
  movies.forEach(m => {
    users.forEach(u => allRatings.push({ movie_id: m.id, user_id: u.id, score: 6.0, pre_watch_excitement: null }))
  })
  // Only 2 guesses on any single picker's films → nobody hits the ≥3 threshold.
  const guesses = [
    { movie_id: 'mov1', guessing_user_id: 'u2', guessed_user_id: 'u3' }, // Alice film
    { movie_id: 'mov5', guessing_user_id: 'u3', guessed_user_id: 'u4' }, // Alice film
    { movie_id: 'mov2', guessing_user_id: 'u1', guessed_user_id: 'u2' }, // Bob film (only 1)
  ]

  const result = computeAnnualAwards(movies, allRatings, users, 2026, guesses, monthYearByMovie)

  it('returns null winner when no picker has ≥3 guesses', () => {
    expect(result.masterOfDisguise).toBeNull()
    expect(result.masterOfDisguiseRate).toBe(Infinity)
  })
})

describe('computeAnnualAwards — mostEvolved spans-≥8-months threshold', () => {
  // CASE A: fewer than 8 distinct months → dormant → null.
  it('returns null when the year spans < 8 distinct months', () => {
    const monthYears = ['2026-01', '2026-02', '2026-03'] // only 3 months
    const movies = []
    const monthYearByMovie = {}
    monthYears.forEach((my, i) => {
      const id = `s${i}`
      movies.push({ id, month_id: `mo${i}`, picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null })
      monthYearByMovie[id] = my
    })
    const allRatings = []
    // Give Alice a big early/late swing so she WOULD win if the threshold weren't enforced.
    movies.forEach((m, i) => {
      allRatings.push({ movie_id: m.id, user_id: 'u1', score: i === 0 ? 1.0 : 10.0, pre_watch_excitement: null })
      allRatings.push({ movie_id: m.id, user_id: 'u2', score: 5.0, pre_watch_excitement: null })
    })
    const result = computeAnnualAwards(movies, allRatings, users, 2026, [], monthYearByMovie)
    expect(result.mostEvolved).toBeNull()
    expect(result.mostEvolvedDelta).toBe(-Infinity)
  })

  // CASE B: ≥8 distinct months → active → picks the biggest first-half→second-half swing.
  it('picks the biggest early→late swing once the year spans ≥8 months', () => {
    const { movies, monthYearByMovie, monthYears } = buildYearMovies()
    // 8 months → firstHalf = first 4 months (idx 0..3), late = idx 4..7.
    const firstHalf = new Set(monthYears.slice(0, 4))
    const allRatings = []
    movies.forEach(m => {
      const my = monthYearByMovie[m.id]
      const early = firstHalf.has(my)
      // Alice: early ~2, late ~9  → big swing (~7)
      allRatings.push({ movie_id: m.id, user_id: 'u1', score: early ? 2.0 : 9.0, pre_watch_excitement: null })
      // Bob: flat 5 everywhere → ~0 swing
      allRatings.push({ movie_id: m.id, user_id: 'u2', score: 5.0, pre_watch_excitement: null })
    })
    const result = computeAnnualAwards(movies, allRatings, users, 2026, [], monthYearByMovie)
    expect(result.mostEvolved).toBeTruthy()
    expect(result.mostEvolved.id).toBe('u1')
    expect(result.mostEvolvedDelta).toBeCloseTo(7.0, 6) // |9 - 2|
  })
})

// ─── computeAllTimeAwards ─────────────────────────────────────────────────────

describe('computeAllTimeAwards — masterOfDisguise', () => {
  // All-time uses the same picker-guess logic but no month gating.
  const movies = [
    { id: 'mA', month_id: 'mo1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mB', month_id: 'mo2', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mC', month_id: 'mo3', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mD', month_id: 'mo4', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mE', month_id: 'mo5', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mF', month_id: 'mo6', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]
  const allRatings = []
  movies.forEach(m => {
    users.forEach(u => allRatings.push({ movie_id: m.id, user_id: u.id, score: 6.0, pre_watch_excitement: null }))
  })
  // Alice (u1): 3 guesses, only 1 correct → rate 1/3 ≈ 0.333
  // Bob   (u2): 3 guesses, all correct → rate 3/3 = 1.0
  const guesses = [
    { movie_id: 'mA', guessing_user_id: 'u2', guessed_user_id: 'u1' }, // correct
    { movie_id: 'mB', guessing_user_id: 'u3', guessed_user_id: 'u4' }, // wrong
    { movie_id: 'mC', guessing_user_id: 'u4', guessed_user_id: 'u2' }, // wrong
    { movie_id: 'mD', guessing_user_id: 'u1', guessed_user_id: 'u2' }, // correct
    { movie_id: 'mE', guessing_user_id: 'u3', guessed_user_id: 'u2' }, // correct
    { movie_id: 'mF', guessing_user_id: 'u4', guessed_user_id: 'u2' }, // correct
  ]

  const result = computeAllTimeAwards(movies, allRatings, users, guesses)

  it('picks the picker with the lowest all-time correct-guess rate', () => {
    expect(result.masterOfDisguise).toBeTruthy()
    expect(result.masterOfDisguise.id).toBe('u1')
    expect(result.masterOfDisguiseRate).toBeCloseTo(1 / 3, 6)
  })
})

describe('computeAllTimeAwards — masterOfDisguise threshold (needs ≥3 guesses)', () => {
  const movies = [
    { id: 'mA', month_id: 'mo1', picked_by_user_id: 'u1', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
    { id: 'mB', month_id: 'mo2', picked_by_user_id: 'u2', picker_revealed: true, scores_revealed: true, historical_avg_score: null },
  ]
  const allRatings = []
  movies.forEach(m => {
    users.forEach(u => allRatings.push({ movie_id: m.id, user_id: u.id, score: 6.0, pre_watch_excitement: null }))
  })
  // At most 2 guesses on any one picker → below threshold.
  const guesses = [
    { movie_id: 'mA', guessing_user_id: 'u2', guessed_user_id: 'u3' },
    { movie_id: 'mA', guessing_user_id: 'u3', guessed_user_id: 'u4' },
    { movie_id: 'mB', guessing_user_id: 'u1', guessed_user_id: 'u2' },
  ]

  const result = computeAllTimeAwards(movies, allRatings, users, guesses)

  it('returns null winner below the 3-guess threshold', () => {
    expect(result.masterOfDisguise).toBeNull()
    expect(result.masterOfDisguiseRate).toBe(Infinity)
  })
})
