import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

function fmtMonth(monthYear) {
  if (!monthYear) return ''
  return new Date(`${monthYear}-02`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function stddev(arr) {
  if (arr.length < 2) return null
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// Zack Anjoorian joined April 2026 — exclude from Jan–Mar
function isZackEligible(userName, monthYear) {
  if (!userName || !monthYear) return true
  const isZack = userName.toLowerCase().includes('zack') || userName.toLowerCase().includes('anjoorian')
  if (!isZack) return true
  const [year, month] = monthYear.split('-').map(Number)
  // Exclude Jan (01), Feb (02), Mar (03) 2026
  if (year === 2026 && month < 4) return false
  return true
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ height = 120 }) {
  return (
    <div
      className="animate-pulse"
      style={{
        height,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '14px',
        width: '100%',
      }}
    />
  )
}

// ─── Poster Thumbnail ────────────────────────────────────────────────────────

function PosterThumb({ posterUrl, title }) {
  const initials = (title ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div style={{
      flexShrink: 0,
      width: '40px',
      height: '56px',
      borderRadius: '6px',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.05)',
    }}>
      {posterUrl ? (
        <img
          src={`https://image.tmdb.org/t/p/w185${posterUrl}`}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: "'Bebas Neue',sans-serif",
            color: 'rgba(255,255,255,0.15)',
            fontSize: '11px',
          }}>
            {initials}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Award Card ──────────────────────────────────────────────────────────────

function AwardCard({ emoji, label, winner, metric, posterUrl, posterTitle, noData }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '14px',
      padding: '16px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Top label row */}
      <p style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: '#374151',
        margin: '0 0 10px',
      }}>
        {emoji} {label}
      </p>

      {noData ? (
        <p style={{
          fontFamily: "'DM Sans',sans-serif",
          color: '#374151',
          fontSize: '13px',
          margin: 0,
        }}>
          Not enough data
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Winner text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'Bebas Neue',sans-serif",
              fontSize: '1.55rem',
              letterSpacing: '0.03em',
              color: 'white',
              margin: '0 0 4px',
              lineHeight: 1.1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {winner ?? '—'}
            </p>
            {metric && (
              <p style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: '11px',
                color: '#4b5563',
                margin: 0,
                lineHeight: 1.4,
              }}>
                {metric}
              </p>
            )}
          </div>

          {/* Optional poster */}
          {(posterUrl || posterTitle) && (
            <PosterThumb posterUrl={posterUrl} title={posterTitle} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Award computations ──────────────────────────────────────────────────────

function computeMonthlyAwards(movies, allRatings, users, selectedMonth) {
  // Filter movies for the selected month with scores revealed
  const monthMovies = movies.filter(m => m.month_id === selectedMonth?.id && m.scores_revealed)
  if (!monthMovies.length) return null

  const movieIds = new Set(monthMovies.map(m => m.id))
  const monthRatings = allRatings.filter(r => movieIds.has(r.movie_id))

  // Map: movie_id → array of scores
  const scoresByMovie = {}
  const excitementByMovie = {}
  monthMovies.forEach(m => {
    scoresByMovie[m.id] = []
    excitementByMovie[m.id] = []
  })
  monthRatings.forEach(r => {
    if (r.score != null) scoresByMovie[r.movie_id]?.push(Number(r.score))
    if (r.pre_watch_excitement != null) excitementByMovie[r.movie_id]?.push(Number(r.pre_watch_excitement))
  })

  // Per-movie averages
  const movieAvgScore = {}
  const movieAvgExcitement = {}
  monthMovies.forEach(m => {
    const scores = scoresByMovie[m.id]
    movieAvgScore[m.id] = scores.length
      ? avg(scores)
      : (m.historical_avg_score ? Number(m.historical_avg_score) : null)
    movieAvgExcitement[m.id] = excitementByMovie[m.id].length
      ? avg(excitementByMovie[m.id])
      : null
  })

  // 1. Pick of the Month — highest avg score
  const scoredMovies = monthMovies.filter(m => movieAvgScore[m.id] != null)
  const pickOfMonth = scoredMovies.length
    ? scoredMovies.reduce((a, b) => movieAvgScore[a.id] >= movieAvgScore[b.id] ? a : b)
    : null

  // 2. Flop of the Month — lowest avg score
  const flopOfMonth = scoredMovies.length
    ? scoredMovies.reduce((a, b) => movieAvgScore[a.id] <= movieAvgScore[b.id] ? a : b)
    : null

  // 3–9: Per-user computations
  // Build user map
  const userMap = {}
  users.forEach(u => { userMap[u.id] = u })

  // Per-user ratings for this month, filtered by Zack eligibility
  const userRatingsThisMonth = {}
  monthRatings.forEach(r => {
    const user = userMap[r.user_id]
    if (!user) return
    if (!isZackEligible(user.name, selectedMonth?.month_year)) return
    if (!userRatingsThisMonth[r.user_id]) userRatingsThisMonth[r.user_id] = []
    userRatingsThisMonth[r.user_id].push(r)
  })

  const eligibleUserIds = Object.keys(userRatingsThisMonth)

  // 3. The Oracle — member with lowest sum of |excitement - final_avg| for films they scored
  // Only members who have excitement scores for all (or most) films
  let oracleWinner = null
  let oracleBestDelta = Infinity
  eligibleUserIds.forEach(uid => {
    const userRatings = userRatingsThisMonth[uid]
    const deltas = []
    userRatings.forEach(r => {
      if (r.pre_watch_excitement == null) return
      const filmAvg = movieAvgScore[r.movie_id]
      if (filmAvg == null) return
      deltas.push(Math.abs(Number(r.pre_watch_excitement) - filmAvg))
    })
    if (!deltas.length) return
    const avgDelta = avg(deltas)
    if (avgDelta < oracleBestDelta) {
      oracleBestDelta = avgDelta
      oracleWinner = userMap[uid]
    }
  })

  // 4. Hype Machine — highest avg pre_watch_excitement
  let hypeMachineWinner = null
  let hypeMachineAvg = -Infinity
  eligibleUserIds.forEach(uid => {
    const excitements = userRatingsThisMonth[uid]
      .map(r => r.pre_watch_excitement)
      .filter(v => v != null)
      .map(Number)
    if (!excitements.length) return
    const a = avg(excitements)
    if (a > hypeMachineAvg) {
      hypeMachineAvg = a
      hypeMachineWinner = userMap[uid]
    }
  })

  // 5. The Letdown — film where excitement >> final (most negative gap)
  const letdownFilms = monthMovies.filter(m =>
    movieAvgExcitement[m.id] != null && movieAvgScore[m.id] != null
  )
  const letdownMovie = letdownFilms.length
    ? letdownFilms.reduce((a, b) => {
        const gapA = movieAvgScore[a.id] - movieAvgExcitement[a.id]
        const gapB = movieAvgScore[b.id] - movieAvgExcitement[b.id]
        return gapA <= gapB ? a : b
      })
    : null

  // 6. The Surprise — film where final most exceeded excitement
  const surpriseMovie = letdownFilms.length
    ? letdownFilms.reduce((a, b) => {
        const gapA = movieAvgScore[a.id] - movieAvgExcitement[a.id]
        const gapB = movieAvgScore[b.id] - movieAvgExcitement[b.id]
        return gapA >= gapB ? a : b
      })
    : null

  // 7. Most Divisive — highest stddev (min 2 scores)
  const divisiveMovies = monthMovies.filter(m => scoresByMovie[m.id].length >= 2)
  const divisiveMovie = divisiveMovies.length
    ? divisiveMovies.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? 0
        const sdB = stddev(scoresByMovie[b.id]) ?? 0
        return sdA >= sdB ? a : b
      })
    : null

  // 8. Most Unanimous — lowest stddev (min 2 scores)
  const unanimousMovie = divisiveMovies.length
    ? divisiveMovies.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? Infinity
        const sdB = stddev(scoresByMovie[b.id]) ?? Infinity
        return sdA <= sdB ? a : b
      })
    : null

  // 9. The Contrarian — highest avg |personal_score - film_avg|
  let contrarianWinner = null
  let contrarianHighest = -Infinity
  eligibleUserIds.forEach(uid => {
    const userRatings = userRatingsThisMonth[uid]
    const devs = []
    userRatings.forEach(r => {
      if (r.score == null) return
      const filmAvg = movieAvgScore[r.movie_id]
      if (filmAvg == null) return
      devs.push(Math.abs(Number(r.score) - filmAvg))
    })
    if (!devs.length) return
    const avgDev = avg(devs)
    if (avgDev > contrarianHighest) {
      contrarianHighest = avgDev
      contrarianWinner = userMap[uid]
    }
  })

  return {
    pickOfMonth,
    flopOfMonth,
    oracleWinner, oracleBestDelta,
    hypeMachineWinner, hypeMachineAvg,
    letdownMovie,
    surpriseMovie,
    divisiveMovie,
    unanimousMovie,
    contrarianWinner, contrarianHighest,
    movieAvgScore,
    movieAvgExcitement,
    scoresByMovie,
  }
}

function computeAllTimeAwards(movies, allRatings, users) {
  const revealedMovies = movies.filter(m => m.scores_revealed)
  if (!revealedMovies.length) return null

  const movieIds = new Set(revealedMovies.map(m => m.id))
  const relevantRatings = allRatings.filter(r => movieIds.has(r.movie_id))

  const userMap = {}
  users.forEach(u => { userMap[u.id] = u })

  // Per-movie scores
  const scoresByMovie = {}
  revealedMovies.forEach(m => { scoresByMovie[m.id] = [] })
  relevantRatings.forEach(r => {
    if (r.score != null) scoresByMovie[r.movie_id]?.push(Number(r.score))
  })

  const movieAvgScore = {}
  revealedMovies.forEach(m => {
    const scores = scoresByMovie[m.id]
    movieAvgScore[m.id] = scores.length
      ? avg(scores)
      : (m.historical_avg_score ? Number(m.historical_avg_score) : null)
  })

  // 1. Greatest Film — highest avg (min 2 scores)
  const twoPlus = revealedMovies.filter(m => scoresByMovie[m.id].length >= 2)
  const greatestFilm = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 0) >= (movieAvgScore[b.id] ?? 0) ? a : b)
    : null

  // 2. Worst Film — lowest avg (min 2 scores)
  const worstFilm = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 10) <= (movieAvgScore[b.id] ?? 10) ? a : b)
    : null

  // 3. Most Divisive Film — highest stddev (min 3 scores)
  const threePlus = revealedMovies.filter(m => scoresByMovie[m.id].length >= 3)
  const mostDivisiveFilm = threePlus.length
    ? threePlus.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? 0
        const sdB = stddev(scoresByMovie[b.id]) ?? 0
        return sdA >= sdB ? a : b
      })
    : null

  // 4. Most Unanimous Film — lowest stddev (min 3 scores)
  const mostUnanimousFilm = threePlus.length
    ? threePlus.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? Infinity
        const sdB = stddev(scoresByMovie[b.id]) ?? Infinity
        return sdA <= sdB ? a : b
      })
    : null

  // Build per-picker data: picked_by_user_id → movies they picked
  // (needs picker_revealed = true to be meaningful)
  const pickerMovies = {}
  revealedMovies.forEach(m => {
    if (!m.picked_by_user_id || !m.picker_revealed) return
    if (!pickerMovies[m.picked_by_user_id]) pickerMovies[m.picked_by_user_id] = []
    pickerMovies[m.picked_by_user_id].push(m)
  })

  // 5. Top Picker — % of picks with avg >= 7.0
  let topPicker = null
  let topPickerVal = -1
  let topPickerStr = ''
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    if (!pickedFilms.length) return
    const above = pickedFilms.filter(m => (movieAvgScore[m.id] ?? 0) >= 7.0)
    const pct = above.length / pickedFilms.length
    if (pct > topPickerVal) {
      topPickerVal = pct
      topPicker = userMap[uid] ?? null
      topPickerStr = `${above.length}/${pickedFilms.length} picks above 7.0`
    }
  })

  // 6–8: Per-user stats (all time, respecting Zack eligibility)
  // We need to figure out which month each movie belongs to — we have month_id on movies
  // We'll need to filter ratings properly. For simplicity, exclude ratings by Zack on
  // movies from months before Apr 2026. We'll use submitted_at or approximate via movie month.
  // Since we have months data available, we'll pass month map to this function if available,
  // but for now we approximate: just check user name vs month_year we don't have here.
  // Instead, we rely on the fact that for all-time stats we include everyone but note the join date.

  const userScoresGiven = {}   // uid → [scores given]
  const userDeviations = {}    // uid → [|personal - film_avg|]
  const userExcitementDeltas = {} // uid → [|excitement - film_avg|]

  relevantRatings.forEach(r => {
    const user = userMap[r.user_id]
    if (!user) return

    if (r.score != null) {
      if (!userScoresGiven[r.user_id]) userScoresGiven[r.user_id] = []
      userScoresGiven[r.user_id].push(Number(r.score))

      const filmAvg = movieAvgScore[r.movie_id]
      if (filmAvg != null) {
        if (!userDeviations[r.user_id]) userDeviations[r.user_id] = []
        userDeviations[r.user_id].push(Math.abs(Number(r.score) - filmAvg))
      }
    }

    if (r.pre_watch_excitement != null) {
      const filmAvg = movieAvgScore[r.movie_id]
      if (filmAvg != null) {
        if (!userExcitementDeltas[r.user_id]) userExcitementDeltas[r.user_id] = []
        userExcitementDeltas[r.user_id].push(Math.abs(Number(r.pre_watch_excitement) - filmAvg))
      }
    }
  })

  const usersWithScores = users.filter(u => userScoresGiven[u.id]?.length > 0)

  // 6. Harshest Critic — lowest avg score given
  let harshestCritic = null
  let harshestAvg = Infinity
  usersWithScores.forEach(u => {
    const a = avg(userScoresGiven[u.id])
    if (a != null && a < harshestAvg) {
      harshestAvg = a
      harshestCritic = u
    }
  })

  // 7. Most Generous — highest avg score given
  let mostGenerous = null
  let mostGenerousAvg = -Infinity
  usersWithScores.forEach(u => {
    const a = avg(userScoresGiven[u.id])
    if (a != null && a > mostGenerousAvg) {
      mostGenerousAvg = a
      mostGenerous = u
    }
  })

  // 8. Biggest Contrarian — highest avg deviation from group
  let biggestContrarian = null
  let biggestContrarianDev = -Infinity
  users.forEach(u => {
    const devs = userDeviations[u.id]
    if (!devs?.length) return
    const a = avg(devs)
    if (a > biggestContrarianDev) {
      biggestContrarianDev = a
      biggestContrarian = u
    }
  })

  // 9. Oracle all-time — lowest avg |excitement - film_avg|
  let oracleAllTime = null
  let oracleAllTimeDelta = Infinity
  users.forEach(u => {
    const deltas = userExcitementDeltas[u.id]
    if (!deltas?.length) return
    const a = avg(deltas)
    if (a < oracleAllTimeDelta) {
      oracleAllTimeDelta = a
      oracleAllTime = u
    }
  })

  return {
    greatestFilm, worstFilm,
    mostDivisiveFilm, mostUnanimousFilm,
    topPicker, topPickerStr,
    harshestCritic, harshestAvg,
    mostGenerous, mostGenerousAvg,
    biggestContrarian, biggestContrarianDev,
    oracleAllTime, oracleAllTimeDelta,
    movieAvgScore,
    scoresByMovie,
  }
}

// ─── Monthly Tab ─────────────────────────────────────────────────────────────

function MonthlyTab({ months, movies, allRatings, users, loading }) {
  const revealedMonths = useMemo(() => {
    return months
      .filter(m => {
        const monthMovies = movies.filter(mv => mv.month_id === m.id && mv.scores_revealed)
        return monthMovies.length > 0
      })
      .sort((a, b) => b.month_year.localeCompare(a.month_year))
  }, [months, movies])

  const defaultMonth = revealedMonths[0] ?? null
  const [selectedMonth, setSelectedMonth] = useState(null)

  // set default once revealed months load
  useEffect(() => {
    if (revealedMonths.length && !selectedMonth) {
      setSelectedMonth(revealedMonths[0])
    }
  }, [revealedMonths])

  const awards = useMemo(() => {
    if (!selectedMonth) return null
    return computeMonthlyAwards(movies, allRatings, users, selectedMonth)
  }, [selectedMonth, movies, allRatings, users])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(6)].map((_, i) => <Skeleton key={i} height={100} />)}
      </div>
    )
  }

  if (!revealedMonths.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: '1.4rem',
          color: 'rgba(255,255,255,0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>
          Awards appear once film scores are revealed.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Month selector pills */}
      <div style={{
        display: 'flex',
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '4px',
        marginBottom: '20px',
        scrollbarWidth: 'none',
      }}>
        {revealedMonths.map(m => {
          const active = selectedMonth?.id === m.id
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMonth(m)}
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                borderRadius: '20px',
                border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.07)',
                background: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                color: active ? 'white' : '#4b5563',
                fontFamily: "'DM Mono',monospace",
                fontSize: '11px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {fmtMonth(m.month_year)}
            </button>
          )
        })}
        <style>{`::-webkit-scrollbar{display:none}`}</style>
      </div>

      {/* Awards cards */}
      {awards && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* 1. Pick of the Month */}
          <AwardCard
            emoji="🎬"
            label="Pick of the Month"
            winner={awards.pickOfMonth?.title}
            metric={awards.pickOfMonth ? `avg score: ${fmt(awards.movieAvgScore[awards.pickOfMonth.id])}` : null}
            posterUrl={awards.pickOfMonth?.poster_url}
            posterTitle={awards.pickOfMonth?.title}
            noData={!awards.pickOfMonth}
          />

          {/* 2. Flop of the Month */}
          <AwardCard
            emoji="💀"
            label="Flop of the Month"
            winner={awards.flopOfMonth?.title}
            metric={awards.flopOfMonth ? `avg score: ${fmt(awards.movieAvgScore[awards.flopOfMonth.id])}` : null}
            posterUrl={awards.flopOfMonth?.poster_url}
            posterTitle={awards.flopOfMonth?.title}
            noData={!awards.flopOfMonth || awards.flopOfMonth.id === awards.pickOfMonth?.id}
          />

          {/* 3. The Oracle */}
          <AwardCard
            emoji="🎯"
            label="The Oracle"
            winner={awards.oracleWinner?.name}
            metric={awards.oracleWinner ? `avg delta: ±${fmt(awards.oracleBestDelta)}` : null}
            noData={!awards.oracleWinner}
          />

          {/* 4. Hype Machine */}
          <AwardCard
            emoji="🚀"
            label="Hype Machine"
            winner={awards.hypeMachineWinner?.name}
            metric={awards.hypeMachineWinner ? `avg excitement: ${fmt(awards.hypeMachineAvg)}` : null}
            noData={!awards.hypeMachineWinner}
          />

          {/* 5. The Letdown */}
          <AwardCard
            emoji="📉"
            label="The Letdown"
            winner={awards.letdownMovie?.title}
            metric={awards.letdownMovie
              ? `Excitement: ${fmt(awards.movieAvgExcitement[awards.letdownMovie.id])} → Final: ${fmt(awards.movieAvgScore[awards.letdownMovie.id])}`
              : null}
            posterUrl={awards.letdownMovie?.poster_url}
            posterTitle={awards.letdownMovie?.title}
            noData={!awards.letdownMovie}
          />

          {/* 6. The Surprise */}
          <AwardCard
            emoji="⬆️"
            label="The Surprise"
            winner={awards.surpriseMovie?.title}
            metric={awards.surpriseMovie
              ? `Excitement: ${fmt(awards.movieAvgExcitement[awards.surpriseMovie.id])} → Final: ${fmt(awards.movieAvgScore[awards.surpriseMovie.id])}`
              : null}
            posterUrl={awards.surpriseMovie?.poster_url}
            posterTitle={awards.surpriseMovie?.title}
            noData={!awards.surpriseMovie}
          />

          {/* 7. Most Divisive */}
          <AwardCard
            emoji="🔥"
            label="Most Divisive"
            winner={awards.divisiveMovie?.title}
            metric={awards.divisiveMovie
              ? `Std dev: ${fmt(stddev(awards.scoresByMovie[awards.divisiveMovie.id]))}`
              : null}
            posterUrl={awards.divisiveMovie?.poster_url}
            posterTitle={awards.divisiveMovie?.title}
            noData={!awards.divisiveMovie}
          />

          {/* 8. Most Unanimous */}
          <AwardCard
            emoji="🤝"
            label="Most Unanimous"
            winner={awards.unanimousMovie?.title}
            metric={awards.unanimousMovie
              ? `Std dev: ${fmt(stddev(awards.scoresByMovie[awards.unanimousMovie.id]))}`
              : null}
            posterUrl={awards.unanimousMovie?.poster_url}
            posterTitle={awards.unanimousMovie?.title}
            noData={!awards.unanimousMovie}
          />

          {/* 9. The Contrarian */}
          <AwardCard
            emoji="🦅"
            label="The Contrarian"
            winner={awards.contrarianWinner?.name}
            metric={awards.contrarianWinner ? `avg deviation: ±${fmt(awards.contrarianHighest)}` : null}
            noData={!awards.contrarianWinner}
          />
        </div>
      )}
    </div>
  )
}

// ─── All-Time Tab ─────────────────────────────────────────────────────────────

function AllTimeTab({ movies, allRatings, users, loading }) {
  const awards = useMemo(() => {
    if (loading || !movies.length) return null
    return computeAllTimeAwards(movies, allRatings, users)
  }, [movies, allRatings, users, loading])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(9)].map((_, i) => <Skeleton key={i} height={100} />)}
      </div>
    )
  }

  if (!awards) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: '1.4rem',
          color: 'rgba(255,255,255,0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>
          Awards appear once film scores are revealed.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* 1. Greatest Film */}
      <AwardCard
        emoji="🏆"
        label="Greatest Film"
        winner={awards.greatestFilm?.title}
        metric={awards.greatestFilm ? `avg score: ${fmt(awards.movieAvgScore[awards.greatestFilm.id])}` : null}
        posterUrl={awards.greatestFilm?.poster_url}
        posterTitle={awards.greatestFilm?.title}
        noData={!awards.greatestFilm}
      />

      {/* 2. Worst Film */}
      <AwardCard
        emoji="💩"
        label="Worst Film"
        winner={awards.worstFilm?.title}
        metric={awards.worstFilm ? `avg score: ${fmt(awards.movieAvgScore[awards.worstFilm.id])}` : null}
        posterUrl={awards.worstFilm?.poster_url}
        posterTitle={awards.worstFilm?.title}
        noData={!awards.worstFilm}
      />

      {/* 3. Most Divisive Film */}
      <AwardCard
        emoji="🔥"
        label="Most Divisive Film"
        winner={awards.mostDivisiveFilm?.title}
        metric={awards.mostDivisiveFilm
          ? `Std dev: ${fmt(stddev(awards.scoresByMovie[awards.mostDivisiveFilm.id]))}`
          : null}
        posterUrl={awards.mostDivisiveFilm?.poster_url}
        posterTitle={awards.mostDivisiveFilm?.title}
        noData={!awards.mostDivisiveFilm}
      />

      {/* 4. Most Unanimous Film */}
      <AwardCard
        emoji="🤝"
        label="Most Unanimous Film"
        winner={awards.mostUnanimousFilm?.title}
        metric={awards.mostUnanimousFilm
          ? `Std dev: ${fmt(stddev(awards.scoresByMovie[awards.mostUnanimousFilm.id]))}`
          : null}
        posterUrl={awards.mostUnanimousFilm?.poster_url}
        posterTitle={awards.mostUnanimousFilm?.title}
        noData={!awards.mostUnanimousFilm}
      />

      {/* 5. Top Picker */}
      <AwardCard
        emoji="🎬"
        label="Top Picker"
        winner={awards.topPicker?.name}
        metric={awards.topPickerStr || null}
        noData={!awards.topPicker}
      />

      {/* 6. Harshest Critic */}
      <AwardCard
        emoji="😤"
        label="Harshest Critic"
        winner={awards.harshestCritic?.name}
        metric={awards.harshestCritic ? `avg score given: ${fmt(awards.harshestAvg)}` : null}
        noData={!awards.harshestCritic}
      />

      {/* 7. Most Generous */}
      <AwardCard
        emoji="😊"
        label="Most Generous"
        winner={awards.mostGenerous?.name}
        metric={awards.mostGenerous ? `avg score given: ${fmt(awards.mostGenerousAvg)}` : null}
        noData={!awards.mostGenerous}
      />

      {/* 8. Biggest Contrarian */}
      <AwardCard
        emoji="🦅"
        label="Biggest Contrarian"
        winner={awards.biggestContrarian?.name}
        metric={awards.biggestContrarian ? `avg deviation: ±${fmt(awards.biggestContrarianDev)}` : null}
        noData={!awards.biggestContrarian}
      />

      {/* 9. The Oracle (all-time) */}
      <AwardCard
        emoji="🎯"
        label="The Oracle (All-Time)"
        winner={awards.oracleAllTime?.name}
        metric={awards.oracleAllTime ? `avg delta: ±${fmt(awards.oracleAllTimeDelta)}` : null}
        noData={!awards.oracleAllTime}
      />
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Monthly', 'All-Time']

export default function Awards() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Monthly')

  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState([])
  const [movies, setMovies] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [
        { data: monthsData },
        { data: moviesData },
        { data: ratingsData },
        { data: usersData },
      ] = await Promise.all([
        supabase.from('months').select('id, season_id, month_year, status').order('month_year', { ascending: true }),
        supabase.from('movies_safe').select('id, month_id, title, poster_url, year_released, director, genre, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id').eq('scores_revealed', true),
        supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at'),
        supabase.from('users').select('id, name, email, role, joined_at, is_active').eq('is_active', true),
      ])

      setMonths(monthsData ?? [])
      setMovies(moviesData ?? [])
      setAllRatings(ratingsData ?? [])
      setUsers(usersData ?? [])
      setLoading(false)
    }

    fetchAll()
  }, [])

  return (
    <div style={{
      background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)',
      fontFamily: "'DM Sans',sans-serif",
      minHeight: '100vh',
      paddingBottom: '6rem',
      width: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', animation: 'fadeUp 0.45s ease both' }}>
          <p style={{
            fontFamily: "'DM Mono',monospace",
            color: '#374151',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            margin: '0 0 4px',
          }}>
            Movie Club
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: '2.6rem',
            color: 'white',
            lineHeight: 1,
            margin: 0,
            letterSpacing: '0.03em',
          }}>
            Awards
          </h1>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: '9px',
                border: 'none',
                background: activeTab === tab ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: activeTab === tab ? 'white' : '#4b5563',
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          {activeTab === 'Monthly' && (
            <MonthlyTab
              months={months}
              movies={movies}
              allRatings={allRatings}
              users={users}
              loading={loading}
            />
          )}
          {activeTab === 'All-Time' && (
            <AllTimeTab
              movies={movies}
              allRatings={allRatings}
              users={users}
              loading={loading}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
