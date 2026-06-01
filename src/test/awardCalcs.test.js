// ─── Pure calculation functions (verbatim from source) ───────────────────────
// Sourced from src/pages/Awards.jsx and src/pages/Stats.jsx

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr) {
  if (arr.length < 2) return null
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// Zack Anjoorian joined April 2026 — exclude from Jan–Mar
// Verbatim from Awards.jsx
function isZackEligible(userName, monthYear) {
  if (!userName || !monthYear) return true
  const isZack = userName.toLowerCase().includes('zack') || userName.toLowerCase().includes('anjoorian')
  if (!isZack) return true
  const [year, month] = monthYear.split('-').map(Number)
  // Exclude Jan (01), Feb (02), Mar (03) 2026
  if (year === 2026 && month < 4) return false
  return true
}

// Helper introduced for testing film avg fallback behaviour
function filmAvg(movieId, ratings, historicalAvg) {
  const scores = ratings.filter(r => r.movie_id === movieId && r.score != null).map(r => r.score)
  return scores.length > 0 ? avg(scores) : historicalAvg
}

// Verbatim from the task spec / Admin.jsx logic
function expectedMemberCount(monthYear, allUsers) {
  return allUsers.filter(u => {
    if (!u.is_active) return false
    const joined = new Date(u.joined_at)
    const [y, m] = monthYear.split('-').map(Number)
    const filmMonth = new Date(y, m - 1, 1)
    return joined <= filmMonth
  }).length
}

// ─── Minimal oracle / hype / contrarian helpers driven by computeMonthlyAwards
// Rather than re-implementing the full function, we extract just the per-user
// loops here so tests remain focused and fast.

function computeOracle(userRatingsMap, movieAvgScore, userMap) {
  let winner = null
  let bestDelta = Infinity
  Object.keys(userRatingsMap).forEach(uid => {
    const ratings = userRatingsMap[uid]
    const deltas = []
    ratings.forEach(r => {
      if (r.pre_watch_excitement == null) return
      const filmAvgVal = movieAvgScore[r.movie_id]
      if (filmAvgVal == null) return
      deltas.push(Math.abs(Number(r.pre_watch_excitement) - filmAvgVal))
    })
    if (!deltas.length) return
    const avgDelta = avg(deltas)
    if (avgDelta < bestDelta) {
      bestDelta = avgDelta
      winner = userMap[uid]
    }
  })
  return { winner, bestDelta }
}

function computeHypeMachine(userRatingsMap, userMap) {
  let winner = null
  let highestAvg = -Infinity
  Object.keys(userRatingsMap).forEach(uid => {
    const excitements = userRatingsMap[uid]
      .map(r => r.pre_watch_excitement)
      .filter(v => v != null)
      .map(Number)
    if (!excitements.length) return
    const a = avg(excitements)
    if (a > highestAvg) {
      highestAvg = a
      winner = userMap[uid]
    }
  })
  return { winner, highestAvg }
}

function computeContrarian(userRatingsMap, movieAvgScore, userMap) {
  let winner = null
  let highest = -Infinity
  Object.keys(userRatingsMap).forEach(uid => {
    const devs = []
    userRatingsMap[uid].forEach(r => {
      if (r.score == null) return
      const filmAvgVal = movieAvgScore[r.movie_id]
      if (filmAvgVal == null) return
      devs.push(Math.abs(Number(r.score) - filmAvgVal))
    })
    if (!devs.length) return
    const avgDev = avg(devs)
    if (avgDev > highest) {
      highest = avgDev
      winner = userMap[uid]
    }
  })
  return { winner, highest }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('avg()', () => {
  test('returns null for empty array', () => {
    expect(avg([])).toBeNull()
  })

  test('returns correct average for [7, 8, 9]', () => {
    expect(avg([7, 8, 9])).toBe(8)
  })

  test('returns single value unchanged', () => {
    expect(avg([5])).toBe(5)
  })

  test('handles decimals correctly', () => {
    expect(avg([1, 2])).toBe(1.5)
  })

  test('handles all-same values', () => {
    expect(avg([4, 4, 4, 4])).toBe(4)
  })
})

describe('stddev()', () => {
  test('returns null for single-element array (< 2 elements)', () => {
    expect(stddev([5])).toBeNull()
  })

  test('returns null for empty array', () => {
    expect(stddev([])).toBeNull()
  })

  test('returns 0 for identical values [5, 5]', () => {
    expect(stddev([5, 5])).toBe(0)
  })

  test('returns 3 for [2, 8] — population stddev', () => {
    // mean=5, variance=((2-5)^2+(8-5)^2)/2 = (9+9)/2 = 9, sqrt(9)=3
    expect(stddev([2, 8])).toBe(3)
  })

  test('handles three values correctly', () => {
    // [4,4,4] → stddev 0
    expect(stddev([4, 4, 4])).toBe(0)
  })

  test('returns correct value for spread scores', () => {
    // [1,5,9] mean=5, variance=((1-5)^2+(5-5)^2+(9-5)^2)/3 = (16+0+16)/3 ≈ 10.667
    const result = stddev([1, 5, 9])
    expect(result).toBeCloseTo(Math.sqrt(32 / 3), 10)
  })
})

describe('filmAvg()', () => {
  const ratings = [
    { movie_id: 'a', score: 7 },
    { movie_id: 'a', score: 9 },
    { movie_id: 'b', score: 5 },
    { movie_id: 'b', score: null },  // null score — should be ignored
  ]

  test('returns computed avg from ratings when present', () => {
    expect(filmAvg('a', ratings, 6.0)).toBe(8)
  })

  test('falls back to historicalAvg when no ratings exist for that movie', () => {
    expect(filmAvg('c', ratings, 6.5)).toBe(6.5)
  })

  test('ignores null scores and uses available ones only', () => {
    // movie 'b' has one non-null score (5) and one null — should average just [5]
    expect(filmAvg('b', ratings, 3.0)).toBe(5)
  })

  test('returns null historicalAvg when no ratings and no historical', () => {
    expect(filmAvg('z', ratings, null)).toBeNull()
  })

  test('returns historicalAvg when all scores are null', () => {
    const nullRatings = [{ movie_id: 'x', score: null }]
    expect(filmAvg('x', nullRatings, 7.7)).toBe(7.7)
  })
})

describe('isZackEligible() — Zack excluded from Jan–Mar 2026', () => {
  test('non-Zack member is always eligible regardless of month', () => {
    expect(isZackEligible('Ryan Miller', '2026-01')).toBe(true)
    expect(isZackEligible('Andrew Bond', '2026-02')).toBe(true)
  })

  test('Zack is eligible for April 2026 (the month he joined)', () => {
    expect(isZackEligible('Zack Anjoorian', '2026-04')).toBe(true)
  })

  test('Zack is eligible for months after April 2026', () => {
    expect(isZackEligible('Zack Anjoorian', '2026-05')).toBe(true)
    expect(isZackEligible('Zack Anjoorian', '2026-12')).toBe(true)
  })

  test('Zack is NOT eligible for January 2026', () => {
    expect(isZackEligible('Zack Anjoorian', '2026-01')).toBe(false)
  })

  test('Zack is NOT eligible for February 2026', () => {
    expect(isZackEligible('Zack Anjoorian', '2026-02')).toBe(false)
  })

  test('Zack is NOT eligible for March 2026', () => {
    expect(isZackEligible('Zack Anjoorian', '2026-03')).toBe(false)
  })

  test('name match works on first-name-only "Zack"', () => {
    expect(isZackEligible('Zack', '2026-01')).toBe(false)
    expect(isZackEligible('Zack', '2026-04')).toBe(true)
  })

  test('name match works on last name "Anjoorian" alone', () => {
    expect(isZackEligible('Anjoorian', '2026-02')).toBe(false)
  })

  test('returns true when userName is null', () => {
    expect(isZackEligible(null, '2026-01')).toBe(true)
  })

  test('returns true when monthYear is null', () => {
    expect(isZackEligible('Zack Anjoorian', null)).toBe(true)
  })
})

describe('Oracle calculation — lowest avg |excitement - film_avg|', () => {
  // Setup: 2 members, 2 films
  // Film 1 avg = 7, Film 2 avg = 5
  // Member A: excitement 7 for film1 (delta 0), excitement 5 for film2 (delta 0) → avg delta = 0
  // Member B: excitement 4 for film1 (delta 3), excitement 8 for film2 (delta 3) → avg delta = 3
  const movieAvgScore = { film1: 7, film2: 5 }
  const userMap = {
    u1: { id: 'u1', name: 'Member A' },
    u2: { id: 'u2', name: 'Member B' },
  }
  const userRatingsMap = {
    u1: [
      { movie_id: 'film1', pre_watch_excitement: 7, score: 7 },
      { movie_id: 'film2', pre_watch_excitement: 5, score: 5 },
    ],
    u2: [
      { movie_id: 'film1', pre_watch_excitement: 4, score: 6 },
      { movie_id: 'film2', pre_watch_excitement: 8, score: 6 },
    ],
  }

  test('member with lower avg delta wins Oracle', () => {
    const { winner } = computeOracle(userRatingsMap, movieAvgScore, userMap)
    expect(winner.name).toBe('Member A')
  })

  test('winner has correct bestDelta of 0', () => {
    const { bestDelta } = computeOracle(userRatingsMap, movieAvgScore, userMap)
    expect(bestDelta).toBe(0)
  })

  test('member B has avg delta of 3', () => {
    // Isolated check — run only u2
    const singleMap = { u2: userRatingsMap.u2 }
    const { bestDelta } = computeOracle(singleMap, movieAvgScore, userMap)
    expect(bestDelta).toBe(3)
  })

  test('returns no winner when no excitement scores provided', () => {
    const noExcitement = {
      u1: [{ movie_id: 'film1', pre_watch_excitement: null, score: 7 }],
    }
    const { winner } = computeOracle(noExcitement, movieAvgScore, userMap)
    expect(winner).toBeNull()
  })

  test('skips film when movieAvgScore is missing', () => {
    const partial = {
      u1: [
        { movie_id: 'unknown_film', pre_watch_excitement: 7, score: 7 },
        { movie_id: 'film1', pre_watch_excitement: 6, score: 7 },  // delta 1
      ],
    }
    const { bestDelta } = computeOracle(partial, movieAvgScore, userMap)
    // Only film1 counted — delta = |6 - 7| = 1
    expect(bestDelta).toBe(1)
  })
})

describe('Hype Machine — highest avg pre_watch_excitement', () => {
  const userMap = {
    u1: { id: 'u1', name: 'Low Hype' },
    u2: { id: 'u2', name: 'Medium Hype' },
    u3: { id: 'u3', name: 'High Hype' },
  }

  const userRatingsMap = {
    u1: [
      { pre_watch_excitement: 3, movie_id: 'm1' },
      { pre_watch_excitement: 4, movie_id: 'm2' },
    ],  // avg 3.5
    u2: [
      { pre_watch_excitement: 6, movie_id: 'm1' },
      { pre_watch_excitement: 7, movie_id: 'm2' },
    ],  // avg 6.5
    u3: [
      { pre_watch_excitement: 9, movie_id: 'm1' },
      { pre_watch_excitement: 8, movie_id: 'm2' },
    ],  // avg 8.5
  }

  test('member with highest avg excitement wins', () => {
    const { winner } = computeHypeMachine(userRatingsMap, userMap)
    expect(winner.name).toBe('High Hype')
  })

  test('winner has correct highestAvg', () => {
    const { highestAvg } = computeHypeMachine(userRatingsMap, userMap)
    expect(highestAvg).toBe(8.5)
  })

  test('null excitement values are ignored in the average', () => {
    const withNull = {
      u1: [
        { pre_watch_excitement: 9, movie_id: 'm1' },
        { pre_watch_excitement: null, movie_id: 'm2' },  // only one valid → avg 9
      ],
      u2: [
        { pre_watch_excitement: 8, movie_id: 'm1' },
        { pre_watch_excitement: 8, movie_id: 'm2' },  // avg 8
      ],
    }
    const { winner, highestAvg } = computeHypeMachine(withNull, userMap)
    expect(winner.name).toBe('Low Hype')  // u1 mapped to 'Low Hype' user object
    expect(highestAvg).toBe(9)
  })

  test('returns no winner when all excitement values are null', () => {
    const noExcitement = {
      u1: [{ pre_watch_excitement: null, movie_id: 'm1' }],
    }
    const { winner } = computeHypeMachine(noExcitement, userMap)
    expect(winner).toBeNull()
  })
})

describe('Contrarian — highest avg |personal_score - film_avg|', () => {
  // Film avgs: film1=7, film2=6
  const movieAvgScore = { film1: 7, film2: 6 }
  const userMap = {
    u1: { id: 'u1', name: 'Conformist' },
    u2: { id: 'u2', name: 'Contrarian' },
  }

  // Member A scores close to avg: film1=7 (dev 0), film2=6 (dev 0) → avg dev = 0
  // Member B scores far from avg: film1=1 (dev 6), film2=10 (dev 4) → avg dev = 5
  const userRatingsMap = {
    u1: [
      { movie_id: 'film1', score: 7 },
      { movie_id: 'film2', score: 6 },
    ],
    u2: [
      { movie_id: 'film1', score: 1 },
      { movie_id: 'film2', score: 10 },
    ],
  }

  test('member who deviates most from group avg wins Contrarian', () => {
    const { winner } = computeContrarian(userRatingsMap, movieAvgScore, userMap)
    expect(winner.name).toBe('Contrarian')
  })

  test('conformist has avg deviation of 0', () => {
    const single = { u1: userRatingsMap.u1 }
    const { highest } = computeContrarian(single, movieAvgScore, userMap)
    expect(highest).toBe(0)
  })

  test('contrarian has correct avg deviation', () => {
    // film1 dev = |1-7| = 6, film2 dev = |10-6| = 4, avg = 5
    const single = { u2: userRatingsMap.u2 }
    const { highest } = computeContrarian(single, movieAvgScore, userMap)
    expect(highest).toBe(5)
  })

  test('null scores are skipped — member with only null scores gets no entry', () => {
    const withNull = {
      u1: [{ movie_id: 'film1', score: null }],
    }
    const { winner } = computeContrarian(withNull, movieAvgScore, userMap)
    expect(winner).toBeNull()
  })

  test('missing film avg causes that film to be skipped entirely', () => {
    const unknownFilm = {
      u1: [
        { movie_id: 'unknown', score: 10 },     // no filmAvg → skipped
        { movie_id: 'film1', score: 7 },         // dev = 0
      ],
    }
    const { highest } = computeContrarian(unknownFilm, movieAvgScore, userMap)
    expect(highest).toBe(0)
  })
})

describe('expectedMemberCount()', () => {
  // joined_at must be <= the first day of the film month for the member to be expected.
  // The function compares new Date(joined_at) <= new Date(y, m-1, 1) (local midnight on the 1st).
  // Founding members use '2026-01-01' so they are counted from January onward.
  // Zack uses '2026-04-01' so he is counted from April onward (equals film month start → <=).
  const allMembers = [
    { id: 'u1', name: 'Ryan Miller',    joined_at: '2026-01-01', is_active: true },
    { id: 'u2', name: 'Ryan Bey',       joined_at: '2026-01-01', is_active: true },
    { id: 'u3', name: 'Andrew Bond',    joined_at: '2026-01-01', is_active: true },
    { id: 'u4', name: 'Chris Deschenes', joined_at: '2026-01-01', is_active: true },
    { id: 'u5', name: 'Zack Anjoorian', joined_at: '2026-04-01', is_active: true },
  ]

  test('all 5 members expected for April 2026 (Zack joined 2026-04-01 which equals film month start)', () => {
    expect(expectedMemberCount('2026-04', allMembers)).toBe(5)
  })

  test('only 4 members expected for January 2026 (Zack not yet joined)', () => {
    expect(expectedMemberCount('2026-01', allMembers)).toBe(4)
  })

  test('only 4 members expected for February 2026', () => {
    expect(expectedMemberCount('2026-02', allMembers)).toBe(4)
  })

  test('only 4 members expected for March 2026', () => {
    expect(expectedMemberCount('2026-03', allMembers)).toBe(4)
  })

  test('inactive members are not counted', () => {
    const withInactive = [
      ...allMembers.slice(0, 4),
      { id: 'u5', name: 'Zack Anjoorian', joined_at: '2026-04-01', is_active: false },
    ]
    // April 2026: 4 active founding + 0 (Zack inactive) = 4
    expect(expectedMemberCount('2026-04', withInactive)).toBe(4)
  })

  test('inactive founding member reduces count', () => {
    const withInactive = allMembers.map((u, i) =>
      i === 0 ? { ...u, is_active: false } : u
    )
    // Jan 2026: 3 active founding + Zack not yet joined = 3
    expect(expectedMemberCount('2026-01', withInactive)).toBe(3)
  })

  test('all 5 expected for May 2026', () => {
    expect(expectedMemberCount('2026-05', allMembers)).toBe(5)
  })

  test('returns 0 for empty user list', () => {
    expect(expectedMemberCount('2026-04', [])).toBe(0)
  })
})
