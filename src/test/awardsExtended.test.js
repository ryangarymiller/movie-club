// ─── Pure functions copied verbatim from Awards.jsx ───────────────────────────
// These must stay in sync with the source of truth in src/pages/Awards.jsx.

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function isWinter2026(season, months) {
  if (!season) return false
  const seasonMonths = months.filter(m => m.season_id === season.id)
  return seasonMonths.some(m => {
    const [year, month] = m.month_year.split('-').map(Number)
    return year === 2026 && month <= 3
  })
}

function isUserEligibleForSeason(userName, seasonIsWinter2026) {
  if (!seasonIsWinter2026) return true
  const isZack = userName.toLowerCase().includes('zack') || userName.toLowerCase().includes('anjoorian')
  return !isZack
}

// computeSeasonAwards — verbatim logic from Awards.jsx
function computeSeasonAwards(movies, allRatings, users, season, months, seasonIsWinter2026) {
  const seasonMonthIds = new Set(
    months.filter(m => m.season_id === season.id).map(m => m.id)
  )
  const seasonMovies = movies.filter(m => seasonMonthIds.has(m.month_id) && m.scores_revealed)
  if (!seasonMovies.length) return null

  const movieIds = new Set(seasonMovies.map(m => m.id))
  const seasonRatings = allRatings.filter(r => movieIds.has(r.movie_id))

  const userMap = {}
  users.forEach(u => { userMap[u.id] = u })

  const scoresByMovie = {}
  seasonMovies.forEach(m => { scoresByMovie[m.id] = [] })
  seasonRatings.forEach(r => {
    if (r.score != null) scoresByMovie[r.movie_id]?.push(Number(r.score))
  })

  const movieAvgScore = {}
  seasonMovies.forEach(m => {
    const scores = scoresByMovie[m.id]
    movieAvgScore[m.id] = scores.length
      ? avg(scores)
      : (m.historical_avg_score ? Number(m.historical_avg_score) : null)
  })

  const twoPlus = seasonMovies.filter(m => scoresByMovie[m.id].length >= 2)
  const filmOfSeason = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 0) >= (movieAvgScore[b.id] ?? 0) ? a : b)
    : null

  const flopOfSeason = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 10) <= (movieAvgScore[b.id] ?? 10) ? a : b)
    : null

  const pickerMovies = {}
  seasonMovies.forEach(m => {
    if (!m.picked_by_user_id || !m.picker_revealed) return
    if (!pickerMovies[m.picked_by_user_id]) pickerMovies[m.picked_by_user_id] = []
    pickerMovies[m.picked_by_user_id].push(m)
  })

  let pickerOfSeason = null
  let pickerOfSeasonAvg = -Infinity
  let pickerOfSeasonCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const user = userMap[uid]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    const avgs = pickedFilms.map(m => movieAvgScore[m.id]).filter(v => v != null)
    if (!avgs.length) return
    const pickerAvg = avg(avgs)
    if (pickerAvg > pickerOfSeasonAvg) {
      pickerOfSeasonAvg = pickerAvg
      pickerOfSeason = user
      pickerOfSeasonCount = avgs.length
    }
  })

  let iceCold = null
  let iceColdAvg = Infinity
  let iceColdCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const user = userMap[uid]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    const avgs = pickedFilms.map(m => movieAvgScore[m.id]).filter(v => v != null)
    if (!avgs.length) return
    const pickerAvg = avg(avgs)
    if (pickerAvg < iceColdAvg) {
      iceColdAvg = pickerAvg
      iceCold = user
      iceColdCount = avgs.length
    }
  })

  const userRatingsThisSeason = {}
  seasonRatings.forEach(r => {
    const user = userMap[r.user_id]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    if (!userRatingsThisSeason[r.user_id]) userRatingsThisSeason[r.user_id] = []
    userRatingsThisSeason[r.user_id].push(r)
  })

  const eligibleUserIds = Object.keys(userRatingsThisSeason)

  let harshestCritic = null
  let harshestCriticAvg = Infinity
  eligibleUserIds.forEach(uid => {
    const scores = userRatingsThisSeason[uid].filter(r => r.score != null).map(r => Number(r.score))
    if (!scores.length) return
    const a = avg(scores)
    if (a < harshestCriticAvg) { harshestCriticAvg = a; harshestCritic = userMap[uid] }
  })

  let mostGenerous = null
  let mostGenerousAvg = -Infinity
  eligibleUserIds.forEach(uid => {
    const scores = userRatingsThisSeason[uid].filter(r => r.score != null).map(r => Number(r.score))
    if (!scores.length) return
    const a = avg(scores)
    if (a > mostGenerousAvg) { mostGenerousAvg = a; mostGenerous = userMap[uid] }
  })

  let contrarianWinner = null
  let contrarianHighest = -Infinity
  eligibleUserIds.forEach(uid => {
    const devs = []
    userRatingsThisSeason[uid].forEach(r => {
      if (r.score == null) return
      const filmAvg = movieAvgScore[r.movie_id]
      if (filmAvg == null) return
      devs.push(Math.abs(Number(r.score) - filmAvg))
    })
    if (!devs.length) return
    const a = avg(devs)
    if (a > contrarianHighest) { contrarianHighest = a; contrarianWinner = userMap[uid] }
  })

  let oracleWinner = null
  let oracleBestDelta = Infinity
  eligibleUserIds.forEach(uid => {
    const deltas = []
    userRatingsThisSeason[uid].forEach(r => {
      if (r.pre_watch_excitement == null) return
      const filmAvgVal = movieAvgScore[r.movie_id]
      if (filmAvgVal == null) return
      deltas.push(Math.abs(Number(r.pre_watch_excitement) - filmAvgVal))
    })
    if (!deltas.length) return
    const a = avg(deltas)
    if (a < oracleBestDelta) { oracleBestDelta = a; oracleWinner = userMap[uid] }
  })

  return {
    filmOfSeason, flopOfSeason,
    pickerOfSeason, pickerOfSeasonAvg, pickerOfSeasonCount,
    iceCold, iceColdAvg, iceColdCount,
    harshestCritic, harshestCriticAvg,
    mostGenerous, mostGenerousAvg,
    contrarianWinner, contrarianHighest,
    oracleWinner, oracleBestDelta,
    movieAvgScore, scoresByMovie,
  }
}

// ─── Shared test fixtures ──────────────────────────────────────────────────────

// Seasons
const WINTER_2026 = { id: 's1', name: 'Winter 2026', start_date: '2026-01-01', end_date: '2026-03-31' }
const SPRING_2026 = { id: 's2', name: 'Spring 2026', start_date: '2026-04-01', end_date: '2026-06-30' }

// Months (6 total: Jan–Jun 2026)
const MONTHS = [
  { id: 'm1', season_id: 's1', month_year: '2026-01' },
  { id: 'm2', season_id: 's1', month_year: '2026-02' },
  { id: 'm3', season_id: 's1', month_year: '2026-03' },
  { id: 'm4', season_id: 's2', month_year: '2026-04' },
  { id: 'm5', season_id: 's2', month_year: '2026-05' },
  { id: 'm6', season_id: 's2', month_year: '2026-06' },
]

// Users
const USERS = [
  { id: 'u1', name: 'Ryan Miller',     joined_at: '2026-01-01', is_active: true },
  { id: 'u2', name: 'Ryan Bey',        joined_at: '2026-01-01', is_active: true },
  { id: 'u3', name: 'Andrew Bond',     joined_at: '2026-01-01', is_active: true },
  { id: 'u4', name: 'Chris Deschenes', joined_at: '2026-01-01', is_active: true },
  { id: 'u5', name: 'Zack Anjoorian',  joined_at: '2026-04-01', is_active: true },
]

// Movies — 3 in Winter, 3 in Spring; all scores_revealed
// u1 picked m1 movie, u2 picked m2 movie, etc.
const MOVIES = [
  { id: 'mv1', month_id: 'm1', title: 'Film Alpha',   scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u1', historical_avg_score: null, poster_url: null, year_released: 2020 },
  { id: 'mv2', month_id: 'm2', title: 'Film Beta',    scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u2', historical_avg_score: null, poster_url: null, year_released: 2021 },
  { id: 'mv3', month_id: 'm3', title: 'Film Gamma',   scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u3', historical_avg_score: null, poster_url: null, year_released: 2022 },
  { id: 'mv4', month_id: 'm4', title: 'Film Delta',   scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u4', historical_avg_score: null, poster_url: null, year_released: 2023 },
  { id: 'mv5', month_id: 'm5', title: 'Film Epsilon', scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u5', historical_avg_score: null, poster_url: null, year_released: 2024 },
  { id: 'mv6', month_id: 'm6', title: 'Film Zeta',    scores_revealed: true, picker_revealed: true, picked_by_user_id: 'u1', historical_avg_score: null, poster_url: null, year_released: 2025 },
]

// Ratings — 4 users score Winter films, 5 users score Spring films
// Winter: mv1 avg=8, mv2 avg=6, mv3 avg=5
// Spring: mv4 avg=7, mv5 avg=4, mv6 avg=9
const RATINGS = [
  // mv1 Film Alpha: scores 7,8,8,9 → avg 8
  { movie_id: 'mv1', user_id: 'u1', score: 7, pre_watch_excitement: 7 },
  { movie_id: 'mv1', user_id: 'u2', score: 8, pre_watch_excitement: 8 },
  { movie_id: 'mv1', user_id: 'u3', score: 8, pre_watch_excitement: 9 },
  { movie_id: 'mv1', user_id: 'u4', score: 9, pre_watch_excitement: 8 },
  // mv2 Film Beta: scores 5,6,6,7 → avg 6
  { movie_id: 'mv2', user_id: 'u1', score: 5, pre_watch_excitement: 6 },
  { movie_id: 'mv2', user_id: 'u2', score: 6, pre_watch_excitement: 6 },
  { movie_id: 'mv2', user_id: 'u3', score: 6, pre_watch_excitement: 7 },
  { movie_id: 'mv2', user_id: 'u4', score: 7, pre_watch_excitement: 6 },
  // mv3 Film Gamma: scores 4,5,5,6 → avg 5
  { movie_id: 'mv3', user_id: 'u1', score: 4, pre_watch_excitement: 5 },
  { movie_id: 'mv3', user_id: 'u2', score: 5, pre_watch_excitement: 5 },
  { movie_id: 'mv3', user_id: 'u3', score: 5, pre_watch_excitement: 6 },
  { movie_id: 'mv3', user_id: 'u4', score: 6, pre_watch_excitement: 5 },
  // mv4 Film Delta: scores 6,7,7,8 → avg 7
  { movie_id: 'mv4', user_id: 'u1', score: 6, pre_watch_excitement: 7 },
  { movie_id: 'mv4', user_id: 'u2', score: 7, pre_watch_excitement: 7 },
  { movie_id: 'mv4', user_id: 'u3', score: 7, pre_watch_excitement: 8 },
  { movie_id: 'mv4', user_id: 'u4', score: 8, pre_watch_excitement: 7 },
  { movie_id: 'mv4', user_id: 'u5', score: 7, pre_watch_excitement: 7 },
  // mv5 Film Epsilon: scores 3,4,4,5,4 → avg 4
  { movie_id: 'mv5', user_id: 'u1', score: 3, pre_watch_excitement: 5 },
  { movie_id: 'mv5', user_id: 'u2', score: 4, pre_watch_excitement: 5 },
  { movie_id: 'mv5', user_id: 'u3', score: 4, pre_watch_excitement: 5 },
  { movie_id: 'mv5', user_id: 'u4', score: 5, pre_watch_excitement: 5 },
  { movie_id: 'mv5', user_id: 'u5', score: 4, pre_watch_excitement: 5 },
  // mv6 Film Zeta: scores 8,9,9,10,9 → avg 9
  { movie_id: 'mv6', user_id: 'u1', score: 8, pre_watch_excitement: 9 },
  { movie_id: 'mv6', user_id: 'u2', score: 9, pre_watch_excitement: 9 },
  { movie_id: 'mv6', user_id: 'u3', score: 9, pre_watch_excitement: 9 },
  { movie_id: 'mv6', user_id: 'u4', score: 10, pre_watch_excitement: 9 },
  { movie_id: 'mv6', user_id: 'u5', score: 9, pre_watch_excitement: 9 },
]

// ─── isWinter2026() ────────────────────────────────────────────────────────────

describe('isWinter2026()', () => {
  test('returns true for Winter 2026 season (has Jan, Feb, Mar months)', () => {
    expect(isWinter2026(WINTER_2026, MONTHS)).toBe(true)
  })

  test('returns false for Spring 2026 season (Apr–Jun, no Jan–Mar months)', () => {
    expect(isWinter2026(SPRING_2026, MONTHS)).toBe(false)
  })

  test('returns false when season is null', () => {
    expect(isWinter2026(null, MONTHS)).toBe(false)
  })

  test('returns false for a season with no months in Jan–Mar', () => {
    const futureMonths = [{ id: 'mx', season_id: 'sx', month_year: '2026-07' }]
    const futureSeason = { id: 'sx', name: 'Summer 2026' }
    expect(isWinter2026(futureSeason, futureMonths)).toBe(false)
  })
})

// ─── isUserEligibleForSeason() ─────────────────────────────────────────────────

describe('isUserEligibleForSeason()', () => {
  test('Zack is NOT eligible for Winter 2026 season', () => {
    expect(isUserEligibleForSeason('Zack Anjoorian', true)).toBe(false)
  })

  test('Zack IS eligible for Spring 2026 season', () => {
    expect(isUserEligibleForSeason('Zack Anjoorian', false)).toBe(true)
  })

  test('other members always eligible regardless of season', () => {
    expect(isUserEligibleForSeason('Ryan Miller', true)).toBe(true)
    expect(isUserEligibleForSeason('Chris Deschenes', true)).toBe(true)
  })
})

// ─── Season film filtering ─────────────────────────────────────────────────────

describe('Season film filtering — only movies from months in the selected season', () => {
  test('Winter 2026 contains exactly mv1, mv2, mv3', () => {
    const winterMonthIds = new Set(MONTHS.filter(m => m.season_id === 's1').map(m => m.id))
    const winterMovies = MOVIES.filter(m => winterMonthIds.has(m.month_id))
    expect(winterMovies.map(m => m.id).sort()).toEqual(['mv1', 'mv2', 'mv3'])
  })

  test('Spring 2026 contains exactly mv4, mv5, mv6', () => {
    const springMonthIds = new Set(MONTHS.filter(m => m.season_id === 's2').map(m => m.id))
    const springMovies = MOVIES.filter(m => springMonthIds.has(m.month_id))
    expect(springMovies.map(m => m.id).sort()).toEqual(['mv4', 'mv5', 'mv6'])
  })

  test('computeSeasonAwards returns null when no movies for season', () => {
    const emptySeason = { id: 'sx', name: 'Empty Season' }
    const emptyMonths = [{ id: 'mx', season_id: 'sx', month_year: '2027-01' }]
    const result = computeSeasonAwards(MOVIES, RATINGS, USERS, emptySeason, emptyMonths, false)
    expect(result).toBeNull()
  })

  test('computeSeasonAwards returns null when no movies have scores_revealed', () => {
    const unrevealed = MOVIES.map(m => ({ ...m, scores_revealed: false }))
    const result = computeSeasonAwards(unrevealed, RATINGS, USERS, WINTER_2026, MONTHS, true)
    expect(result).toBeNull()
  })
})

// ─── Picker of Season calculation ─────────────────────────────────────────────

describe('computeSeasonAwards — Picker of Season', () => {
  // Winter 2026: u1 picked mv1 (avg 8), u2 picked mv2 (avg 6), u3 picked mv3 (avg 5)
  // Picker of Season = u1 with avg 8
  const winterAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, WINTER_2026, MONTHS, true)

  test('picker of Winter 2026 season is u1 (Ryan Miller) with highest pick avg', () => {
    expect(winterAwards.pickerOfSeason.name).toBe('Ryan Miller')
  })

  test('picker avg for Winter 2026 is 8.0 (Film Alpha avg)', () => {
    expect(winterAwards.pickerOfSeasonAvg).toBe(8)
  })

  test('picker count reflects number of picks scored', () => {
    expect(winterAwards.pickerOfSeasonCount).toBe(1)
  })

  // Spring 2026: u4 picked mv4 (avg 7), u5 picked mv5 (avg 4), u1 picked mv6 (avg 9)
  // Picker of Season = u1 with avg 9
  const springAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, SPRING_2026, MONTHS, false)

  test('picker of Spring 2026 season is u1 (Ryan Miller) with Film Zeta avg 9', () => {
    expect(springAwards.pickerOfSeason.name).toBe('Ryan Miller')
  })

  test('picker of Spring avg is 9.0', () => {
    expect(springAwards.pickerOfSeasonAvg).toBe(9)
  })
})

// ─── Ice Cold calculation ──────────────────────────────────────────────────────

describe('computeSeasonAwards — Ice Cold (lowest picker avg)', () => {
  // Winter 2026: u3 picked mv3 (avg 5) — lowest pick avg
  const winterAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, WINTER_2026, MONTHS, true)

  test('Ice Cold winner for Winter 2026 is u3 (Andrew Bond) with avg 5', () => {
    expect(winterAwards.iceCold.name).toBe('Andrew Bond')
  })

  test('Ice Cold avg for Winter 2026 is 5.0', () => {
    expect(winterAwards.iceColdAvg).toBe(5)
  })

  // Spring 2026: u5 (Zack) picked mv5 (avg 4) — lowest pick avg
  const springAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, SPRING_2026, MONTHS, false)

  test('Ice Cold for Spring 2026 is Zack Anjoorian (Film Epsilon avg 4)', () => {
    expect(springAwards.iceCold.name).toBe('Zack Anjoorian')
  })

  test('Ice Cold avg for Spring is 4.0', () => {
    expect(springAwards.iceColdAvg).toBe(4)
  })
})

// ─── Zack exclusion from Winter 2026 per-person awards ────────────────────────

describe('Zack exclusion — Winter 2026 per-person awards', () => {
  const winterAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, WINTER_2026, MONTHS, true)

  test('Zack is not Picker of Season for Winter 2026 (was not a member)', () => {
    expect(winterAwards.pickerOfSeason?.name).not.toBe('Zack Anjoorian')
  })

  test('Zack is not Ice Cold for Winter 2026', () => {
    expect(winterAwards.iceCold?.name).not.toBe('Zack Anjoorian')
  })

  test('Zack is not Harshest Critic for Winter 2026', () => {
    expect(winterAwards.harshestCritic?.name).not.toBe('Zack Anjoorian')
  })

  test('Zack is not Most Generous for Winter 2026', () => {
    expect(winterAwards.mostGenerous?.name).not.toBe('Zack Anjoorian')
  })

  test('Zack IS eligible for Spring 2026 per-person awards', () => {
    const springAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, SPRING_2026, MONTHS, false)
    // Zack can appear in Spring awards — e.g. Ice Cold is Zack (worst picker avg)
    expect(springAwards.iceCold?.name).toBe('Zack Anjoorian')
  })

  test('Zack with Winter movies explicitly excluded from picker of season even if he had picks', () => {
    // Inject a Zack-picked Winter movie with high avg to verify exclusion
    const zackWinterMovie = {
      id: 'mvZ', month_id: 'm1', title: 'Zack Winter Pick', scores_revealed: true,
      picker_revealed: true, picked_by_user_id: 'u5', historical_avg_score: null,
      poster_url: null, year_released: 2020,
    }
    const zackWinterRatings = [
      { movie_id: 'mvZ', user_id: 'u1', score: 10, pre_watch_excitement: 9 },
      { movie_id: 'mvZ', user_id: 'u2', score: 10, pre_watch_excitement: 9 },
      { movie_id: 'mvZ', user_id: 'u3', score: 10, pre_watch_excitement: 9 },
      { movie_id: 'mvZ', user_id: 'u4', score: 10, pre_watch_excitement: 9 },
    ]
    const moviesWithZack = [...MOVIES, zackWinterMovie]
    const ratingsWithZack = [...RATINGS, ...zackWinterRatings]
    const awards = computeSeasonAwards(moviesWithZack, ratingsWithZack, USERS, WINTER_2026, MONTHS, true)
    // Even with avg 10, Zack is excluded from Winter 2026 picker awards
    expect(awards.pickerOfSeason?.name).not.toBe('Zack Anjoorian')
  })
})

// ─── Season film/score correctness ────────────────────────────────────────────

describe('computeSeasonAwards — film and score correctness', () => {
  const springAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, SPRING_2026, MONTHS, false)

  test('Film of Spring 2026 is Film Zeta (highest avg 9)', () => {
    expect(springAwards.filmOfSeason.title).toBe('Film Zeta')
  })

  test('Flop of Spring 2026 is Film Epsilon (lowest avg 4)', () => {
    expect(springAwards.flopOfSeason.title).toBe('Film Epsilon')
  })

  test('movieAvgScore for mv6 (Film Zeta) is 9', () => {
    expect(springAwards.movieAvgScore['mv6']).toBe(9)
  })

  test('scoresByMovie for mv5 (Film Epsilon) has 5 scores', () => {
    expect(springAwards.scoresByMovie['mv5'].length).toBe(5)
  })

  test('Film of Winter 2026 is Film Alpha (highest avg 8)', () => {
    const winterAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, WINTER_2026, MONTHS, true)
    expect(winterAwards.filmOfSeason.title).toBe('Film Alpha')
  })
})

// ─── Historical avg fallback ───────────────────────────────────────────────────

describe('computeSeasonAwards — historical_avg_score fallback', () => {
  test('uses historical_avg_score when no ratings exist for that movie', () => {
    const movieWithHistorical = {
      id: 'mvH', month_id: 'm1', title: 'Historical Film', scores_revealed: true,
      picker_revealed: true, picked_by_user_id: 'u1', historical_avg_score: 9.5,
      poster_url: null, year_released: 2019,
    }
    const onlyHistoricalMovies = [movieWithHistorical]
    const result = computeSeasonAwards(onlyHistoricalMovies, [], USERS, WINTER_2026, MONTHS, true)
    expect(result.movieAvgScore['mvH']).toBe(9.5)
  })
})

// ─── Oracle for season ─────────────────────────────────────────────────────────

describe('computeSeasonAwards — Oracle (excitement vs final)', () => {
  // For Spring 2026: mv6 avg = 9. u1 excitement for mv6 = 9 (delta 0).
  // Most users have excitement ≈ film avg for mv6.
  // For mv4 avg = 7. u1 excitement = 7 (delta 0).
  // For mv5 avg = 4. u1 excitement = 5 (delta 1).
  // u1 total deltas: mv4=0, mv5=1, mv6=0 → avg delta = 1/3 ≈ 0.33
  const springAwards = computeSeasonAwards(MOVIES, RATINGS, USERS, SPRING_2026, MONTHS, false)

  test('Oracle winner has a bestDelta value >= 0', () => {
    expect(springAwards.oracleBestDelta).toBeGreaterThanOrEqual(0)
  })

  test('Oracle winner is defined', () => {
    expect(springAwards.oracleWinner).not.toBeNull()
  })

  test('Oracle winner has lowest avg delta among eligible members', () => {
    // Verify by checking no other member has a lower delta than the winner's delta
    const springMonthIds = new Set(MONTHS.filter(m => m.season_id === 's2').map(m => m.id))
    const springMovies = MOVIES.filter(m => springMonthIds.has(m.month_id))
    const mvIds = new Set(springMovies.map(m => m.id))
    const springRatings = RATINGS.filter(r => mvIds.has(r.movie_id))

    USERS.forEach(u => {
      const userRatings = springRatings.filter(r => r.user_id === u.id)
      const deltas = userRatings
        .filter(r => r.pre_watch_excitement != null)
        .map(r => {
          const scores = springRatings.filter(rr => rr.movie_id === r.movie_id && rr.score != null).map(rr => rr.score)
          const filmAvg = avg(scores)
          return filmAvg != null ? Math.abs(Number(r.pre_watch_excitement) - filmAvg) : null
        })
        .filter(d => d != null)
      if (!deltas.length) return
      const memberDelta = avg(deltas)
      expect(memberDelta).toBeGreaterThanOrEqual(springAwards.oracleBestDelta - 0.0001)
    })
  })
})
