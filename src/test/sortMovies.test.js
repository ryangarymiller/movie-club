import { describe, it, expect } from 'vitest'
import { sortMovies } from '../pages/Films.jsx'

// Minimal enriched-movie factory (only the fields sortMovies reads).
const film = (id, monthOrder, myScored, avg = null) => ({
  id, _monthOrder: monthOrder, _myScored: myScored, _avgScore: avg, _scores: avg != null ? [avg] : [],
})

describe('sortMovies — "To Score First"', () => {
  it('floats unscored films above scored ones', () => {
    const movies = [
      film('a', 2, true),   // scored
      film('b', 1, false),  // unscored
      film('c', 3, true),   // scored
      film('d', 1, false),  // unscored
    ]
    const ordered = sortMovies(movies, 'toscore').map(m => m.id)
    // First two must be the unscored ones, last two the scored ones.
    expect(ordered.slice(0, 2).sort()).toEqual(['b', 'd'])
    expect(ordered.slice(2).sort()).toEqual(['a', 'c'])
  })

  it('tie-breaks each group by most-recent (month order desc, then id desc)', () => {
    const movies = [
      film('m1a', 1, false),
      film('m1b', 1, false),
      film('m2', 2, false),
    ]
    // All unscored → ordered purely by recency: month 2 first, then month 1 (id desc).
    expect(sortMovies(movies, 'toscore').map(m => m.id)).toEqual(['m2', 'm1b', 'm1a'])
  })

  it('does not mutate the input array', () => {
    const movies = [film('a', 1, true), film('b', 2, false)]
    const before = movies.map(m => m.id)
    sortMovies(movies, 'toscore')
    expect(movies.map(m => m.id)).toEqual(before)
  })
})
