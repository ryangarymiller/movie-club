import { describe, it, expect } from 'vitest'
import { sortMovies, SORT_OPTIONS } from '../pages/Films.jsx'

// The All Films wall lets members browse the catalog by Most/Least Recent,
// Highest/Lowest Rated, Most/Least Divisive, and By Member. Getting this
// ordering right is core to actually using the app, and it depends on several
// derived fields (_avgScore / historical_avg_score, _scores, _monthOrder, id).
// sortMovies must always return a NEW array and place films lacking data last.

const ids = arr => arr.map(m => m.id)

describe('sortMovies', () => {
  it('does not mutate the input array', () => {
    const input = [
      { id: 'a', _monthOrder: 1 },
      { id: 'b', _monthOrder: 2 },
    ]
    const snapshot = ids(input)
    sortMovies(input, 'recent')
    expect(ids(input)).toEqual(snapshot)
  })

  it('recent: months descending, reversed watch-order (id desc) within a month', () => {
    const movies = [
      { id: 'a', _monthOrder: 1 },
      { id: 'b', _monthOrder: 1 },
      { id: 'c', _monthOrder: 2 },
    ]
    expect(ids(sortMovies(movies, 'recent'))).toEqual(['c', 'b', 'a'])
  })

  it('oldest: months ascending, watch-order (id asc) within a month', () => {
    const movies = [
      { id: 'c', _monthOrder: 2 },
      { id: 'b', _monthOrder: 1 },
      { id: 'a', _monthOrder: 1 },
    ]
    expect(ids(sortMovies(movies, 'oldest'))).toEqual(['a', 'b', 'c'])
  })

  it('high: highest displayed average first, films without a score sink last', () => {
    const movies = [
      { id: 'lo', _avgScore: 5 },
      { id: 'hi', _avgScore: 9 },
      { id: 'none' }, // no score → last
    ]
    expect(ids(sortMovies(movies, 'high'))).toEqual(['hi', 'lo', 'none'])
  })

  it('low: lowest displayed average first, films without a score sink last', () => {
    const movies = [
      { id: 'hi', _avgScore: 9 },
      { id: 'lo', _avgScore: 5 },
      { id: 'none' },
    ]
    expect(ids(sortMovies(movies, 'low'))).toEqual(['lo', 'hi', 'none'])
  })

  it('high: a revealed film uses its authoritative historical_avg_score', () => {
    const movies = [
      { id: 'computed', _avgScore: 7 },
      { id: 'historical', scores_revealed: true, historical_avg_score: 8.6, _avgScore: 2 },
    ]
    // historical (8.6) must beat the computed 7, ignoring its stale _avgScore.
    expect(ids(sortMovies(movies, 'high'))).toEqual(['historical', 'computed'])
  })

  it('divisive: highest score spread first, under-2-score films last', () => {
    const movies = [
      { id: 'flat', _scores: [7, 7] },      // stddev 0
      { id: 'split', _scores: [5, 9] },     // stddev 2
      { id: 'single', _scores: [7] },       // < 2 scores → null → last
    ]
    expect(ids(sortMovies(movies, 'divisive'))).toEqual(['split', 'flat', 'single'])
  })

  it('unanimous: lowest score spread first, under-2-score films last', () => {
    const movies = [
      { id: 'split', _scores: [5, 9] },
      { id: 'flat', _scores: [7, 7] },
      { id: 'single', _scores: [7] },
    ]
    expect(ids(sortMovies(movies, 'unanimous'))).toEqual(['flat', 'split', 'single'])
  })

  it('picker: groups by revealed picker, unrevealed pickers sort first', () => {
    const movies = [
      { id: 'x', picker_revealed: true, picked_by_user_id: 'u2', _monthOrder: 1 },
      { id: 'y', picker_revealed: true, picked_by_user_id: 'u1', _monthOrder: 2 },
      { id: 'z', picker_revealed: true, picked_by_user_id: 'u1', _monthOrder: 1 },
      { id: 'w', picker_revealed: false, picked_by_user_id: 'u9', _monthOrder: 5 },
    ]
    // '' (unrevealed) < 'u1' < 'u2'; within a picker, _monthOrder ascending.
    expect(ids(sortMovies(movies, 'picker'))).toEqual(['w', 'z', 'y', 'x'])
  })

  it('every SORT_OPTIONS key produces a stable full-length ordering', () => {
    const movies = [
      { id: 'a', _monthOrder: 1, _avgScore: 6, _scores: [6, 6], picker_revealed: true, picked_by_user_id: 'u1' },
      { id: 'b', _monthOrder: 2, _avgScore: 8, _scores: [4, 9], picker_revealed: true, picked_by_user_id: 'u2' },
    ]
    for (const opt of SORT_OPTIONS) {
      const out = sortMovies(movies, opt.key)
      expect(out).toHaveLength(movies.length)
      expect(new Set(ids(out))).toEqual(new Set(['a', 'b']))
    }
  })
})
