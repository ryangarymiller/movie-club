// Pure functions copied from Stats.jsx (not exported, so duplicated here for testing).
// Keep these in sync if the source logic changes.

// ─── Shared primitives ───────────────────────────────────────────────────────

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// ─── calcAgreementScore ──────────────────────────────────────────────────────
// Returns { avg, count } — avg absolute difference across shared films.

function calcAgreementScore(ratingsA, ratingsB) {
  const mapB = {}
  for (const r of ratingsB) {
    if (r.score != null) mapB[r.movie_id] = Number(r.score)
  }
  const diffs = []
  for (const r of ratingsA) {
    if (r.score == null) continue
    if (mapB[r.movie_id] == null) continue
    diffs.push(Math.abs(Number(r.score) - mapB[r.movie_id]))
  }
  return { avg: avg(diffs), count: diffs.length }
}

// ─── calcGenreBreakdown ──────────────────────────────────────────────────────
// Counts films per genre; each entry may be comma-separated.

function calcGenreBreakdown(genres) {
  const counts = {}
  for (const g of genres) {
    if (!g) continue
    const parts = String(g).split(',').map(s => s.trim()).filter(Boolean)
    for (const p of parts) {
      counts[p] = (counts[p] || 0) + 1
    }
  }
  return counts
}

// ─── calcScoringStreaks ──────────────────────────────────────────────────────
// Returns { userId: streak } — consecutive trailing months each user scored.

function calcScoringStreaks(userIds, monthOrder, ratingsByUser) {
  const result = {}
  for (const uid of userIds) {
    const scoredMonths = ratingsByUser[uid] || new Set()
    let streak = 0
    for (let i = monthOrder.length - 1; i >= 0; i--) {
      if (scoredMonths.has(monthOrder[i])) {
        streak++
      } else {
        break
      }
    }
    result[uid] = streak
  }
  return result
}

// ─── calcHeadToHeadRecord ────────────────────────────────────────────────────
// Returns { winsA, winsB, ties, films } across shared films.

function calcHeadToHeadRecord(ratingsA, ratingsB) {
  const mapB = {}
  for (const r of ratingsB) {
    if (r.score != null) mapB[r.movie_id] = Number(r.score)
  }
  let winsA = 0, winsB = 0, ties = 0
  const films = []
  for (const r of ratingsA) {
    if (r.score == null) continue
    if (mapB[r.movie_id] == null) continue
    const sA = Number(r.score)
    const sB = mapB[r.movie_id]
    const diff = Math.abs(sA - sB)
    films.push({ movie_id: r.movie_id, scoreA: sA, scoreB: sB, diff })
    if (Math.abs(sA - sB) < 0.005) ties++
    else if (sA > sB) winsA++
    else winsB++
  }
  films.sort((a, b) => a.diff - b.diff)
  return { winsA, winsB, ties, films }
}

// ─── Tests: calcAgreementScore ───────────────────────────────────────────────

describe('calcAgreementScore', () => {
  it('returns avg=null and count=0 when no shared films', () => {
    const a = [{ movie_id: '1', score: 7 }]
    const b = [{ movie_id: '2', score: 8 }]
    const { avg: a_, count } = calcAgreementScore(a, b)
    expect(a_).toBeNull()
    expect(count).toBe(0)
  })

  it('returns correct avg diff for one shared film', () => {
    const a = [{ movie_id: '1', score: 8 }]
    const b = [{ movie_id: '1', score: 6 }]
    const { avg: a_, count } = calcAgreementScore(a, b)
    expect(a_).toBe(2)
    expect(count).toBe(1)
  })

  it('returns 0 when both scores are identical', () => {
    const a = [{ movie_id: '1', score: 7.5 }]
    const b = [{ movie_id: '1', score: 7.5 }]
    const { avg: a_ } = calcAgreementScore(a, b)
    expect(a_).toBe(0)
  })

  it('averages absolute diffs across multiple shared films', () => {
    const a = [
      { movie_id: '1', score: 9 },
      { movie_id: '2', score: 5 },
      { movie_id: '3', score: 7 },
    ]
    const b = [
      { movie_id: '1', score: 7 },  // diff 2
      { movie_id: '2', score: 8 },  // diff 3
      { movie_id: '3', score: 7 },  // diff 0
    ]
    const { avg: a_, count } = calcAgreementScore(a, b)
    expect(count).toBe(3)
    expect(a_).toBeCloseTo((2 + 3 + 0) / 3, 5)
  })

  it('ignores films where A has no score', () => {
    const a = [
      { movie_id: '1', score: null },
      { movie_id: '2', score: 8 },
    ]
    const b = [
      { movie_id: '1', score: 7 },
      { movie_id: '2', score: 6 },
    ]
    const { count } = calcAgreementScore(a, b)
    expect(count).toBe(1)
  })

  it('ignores films where B has no score', () => {
    const a = [
      { movie_id: '1', score: 8 },
      { movie_id: '2', score: 7 },
    ]
    const b = [
      { movie_id: '1', score: null },
      { movie_id: '2', score: 5 },
    ]
    const { count } = calcAgreementScore(a, b)
    expect(count).toBe(1)
  })

  it('handles empty arrays gracefully', () => {
    const { avg: a_, count } = calcAgreementScore([], [])
    expect(a_).toBeNull()
    expect(count).toBe(0)
  })
})

// ─── Tests: calcGenreBreakdown ───────────────────────────────────────────────

describe('calcGenreBreakdown', () => {
  it('returns empty object for empty input', () => {
    expect(calcGenreBreakdown([])).toEqual({})
  })

  it('counts a single genre correctly', () => {
    const result = calcGenreBreakdown(['Drama', 'Drama', 'Drama'])
    expect(result.Drama).toBe(3)
  })

  it('splits comma-separated genre strings', () => {
    const result = calcGenreBreakdown(['Drama, Thriller'])
    expect(result.Drama).toBe(1)
    expect(result.Thriller).toBe(1)
  })

  it('handles multiple comma-separated genres across films', () => {
    const result = calcGenreBreakdown(['Drama, Comedy', 'Comedy', 'Drama'])
    expect(result.Drama).toBe(2)
    expect(result.Comedy).toBe(2)
  })

  it('trims whitespace from genre parts', () => {
    const result = calcGenreBreakdown(['  Action ,  Sci-Fi  '])
    expect(result.Action).toBe(1)
    expect(result['Sci-Fi']).toBe(1)
  })

  it('skips null and empty entries', () => {
    const result = calcGenreBreakdown([null, '', 'Drama'])
    expect(result.Drama).toBe(1)
    expect(Object.keys(result).length).toBe(1)
  })

  it('is case-sensitive (Drama !== drama)', () => {
    const result = calcGenreBreakdown(['Drama', 'drama'])
    expect(result.Drama).toBe(1)
    expect(result.drama).toBe(1)
  })
})

// ─── Tests: calcScoringStreaks ───────────────────────────────────────────────

describe('calcScoringStreaks', () => {
  it('returns 0 streak for a user with no scores', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    const result = calcScoringStreaks(['u1'], months, {})
    expect(result.u1).toBe(0)
  })

  it('returns full streak when user scored every month', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    const rated = { u1: new Set(['2026-01', '2026-02', '2026-03']) }
    const result = calcScoringStreaks(['u1'], months, rated)
    expect(result.u1).toBe(3)
  })

  it('returns 1 when user only scored the most recent month', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    const rated = { u1: new Set(['2026-03']) }
    const result = calcScoringStreaks(['u1'], months, rated)
    expect(result.u1).toBe(1)
  })

  it('breaks streak at first missing month from the end', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04']
    // scored Jan, Feb, Apr — missed Mar — streak should be 1 (only Apr)
    const rated = { u1: new Set(['2026-01', '2026-02', '2026-04']) }
    const result = calcScoringStreaks(['u1'], months, rated)
    expect(result.u1).toBe(1)
  })

  it('handles multiple users independently', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    const rated = {
      u1: new Set(['2026-01', '2026-02', '2026-03']),
      u2: new Set(['2026-02', '2026-03']),
      u3: new Set(['2026-01']),
    }
    const result = calcScoringStreaks(['u1', 'u2', 'u3'], months, rated)
    expect(result.u1).toBe(3)
    expect(result.u2).toBe(2)
    expect(result.u3).toBe(0)
  })

  it('returns 0 for all users when monthOrder is empty', () => {
    const result = calcScoringStreaks(['u1', 'u2'], [], { u1: new Set(['2026-01']) })
    expect(result.u1).toBe(0)
    expect(result.u2).toBe(0)
  })
})

// ─── Tests: calcHeadToHeadRecord ─────────────────────────────────────────────

describe('calcHeadToHeadRecord', () => {
  it('returns all zeros and empty films for no shared scores', () => {
    const a = [{ movie_id: '1', score: 7 }]
    const b = [{ movie_id: '2', score: 8 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.winsA).toBe(0)
    expect(result.winsB).toBe(0)
    expect(result.ties).toBe(0)
    expect(result.films).toHaveLength(0)
  })

  it('counts a win for A when A scores higher', () => {
    const a = [{ movie_id: '1', score: 9 }]
    const b = [{ movie_id: '1', score: 7 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.winsA).toBe(1)
    expect(result.winsB).toBe(0)
    expect(result.ties).toBe(0)
  })

  it('counts a win for B when B scores higher', () => {
    const a = [{ movie_id: '1', score: 6 }]
    const b = [{ movie_id: '1', score: 8 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.winsA).toBe(0)
    expect(result.winsB).toBe(1)
    expect(result.ties).toBe(0)
  })

  it('counts a tie when scores are within 0.005 of each other', () => {
    const a = [{ movie_id: '1', score: 7.00 }]
    const b = [{ movie_id: '1', score: 7.00 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.ties).toBe(1)
    expect(result.winsA).toBe(0)
    expect(result.winsB).toBe(0)
  })

  it('does not count scores that differ by exactly 0.004 as a win', () => {
    const a = [{ movie_id: '1', score: 7.004 }]
    const b = [{ movie_id: '1', score: 7.000 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.ties).toBe(1)
  })

  it('counts scores that differ by 0.006 as a win (not a tie)', () => {
    const a = [{ movie_id: '1', score: 7.006 }]
    const b = [{ movie_id: '1', score: 7.000 }]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.winsA).toBe(1)
    expect(result.ties).toBe(0)
  })

  it('tallies multiple films correctly', () => {
    const a = [
      { movie_id: '1', score: 9 },  // A wins
      { movie_id: '2', score: 5 },  // B wins
      { movie_id: '3', score: 7 },  // A wins
      { movie_id: '4', score: 6 },  // tie
    ]
    const b = [
      { movie_id: '1', score: 7 },
      { movie_id: '2', score: 8 },
      { movie_id: '3', score: 6 },
      { movie_id: '4', score: 6 },
    ]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.winsA).toBe(2)
    expect(result.winsB).toBe(1)
    expect(result.ties).toBe(1)
    expect(result.films).toHaveLength(4)
  })

  it('sorts films by diff ascending (most agreed first)', () => {
    const a = [
      { movie_id: '1', score: 9 },  // diff 4
      { movie_id: '2', score: 7 },  // diff 0
      { movie_id: '3', score: 6 },  // diff 2
    ]
    const b = [
      { movie_id: '1', score: 5 },
      { movie_id: '2', score: 7 },
      { movie_id: '3', score: 8 },
    ]
    const { films } = calcHeadToHeadRecord(a, b)
    expect(films[0].diff).toBeCloseTo(0)
    expect(films[1].diff).toBeCloseTo(2)
    expect(films[2].diff).toBeCloseTo(4)
  })

  it('ignores films where A has null score', () => {
    const a = [
      { movie_id: '1', score: null },
      { movie_id: '2', score: 8 },
    ]
    const b = [
      { movie_id: '1', score: 7 },
      { movie_id: '2', score: 6 },
    ]
    const result = calcHeadToHeadRecord(a, b)
    expect(result.films).toHaveLength(1)
    expect(result.winsA).toBe(1)
  })

  it('handles empty arrays', () => {
    const result = calcHeadToHeadRecord([], [])
    expect(result.winsA).toBe(0)
    expect(result.winsB).toBe(0)
    expect(result.ties).toBe(0)
    expect(result.films).toHaveLength(0)
  })
})
