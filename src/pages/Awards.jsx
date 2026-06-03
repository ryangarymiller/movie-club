import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import { FilmDetailOverlay } from './Films.jsx'

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
        background: 'rgba(var(--fg-rgb), 0.04)',
        borderRadius: '14px',
        width: '100%',
      }}
    />
  )
}

// Detect if a season is Winter 2026 by checking if any of its months are Jan–Mar 2026
export function isWinter2026(season, months) {
  if (!season) return false
  const seasonMonths = months.filter(m => m.season_id === season.id)
  return seasonMonths.some(m => {
    const [year, month] = m.month_year.split('-').map(Number)
    return year === 2026 && month <= 3
  })
}

// For a given season, check if user is eligible (Zack excluded from Winter 2026)
function isUserEligibleForSeason(userName, seasonIsWinter2026) {
  if (!seasonIsWinter2026) return true
  const isZack = userName.toLowerCase().includes('zack') || userName.toLowerCase().includes('anjoorian')
  return !isZack
}



// ─── Award Card ──────────────────────────────────────────────────────────────

function AwardCard({ emoji, label, winner, metric, posterUrl, posterTitle, noData, onWinnerClick, winnerClickable, awardId }) {
  const clickable = winnerClickable && onWinnerClick && winner
  const hasPoster = !!(posterUrl || posterTitle)
  return (
    <div
      data-award-id={awardId}
      style={{
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        borderRadius: '14px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        position: 'relative',
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: '16px', paddingRight: hasPoster ? '12px' : '16px' }}>
        {/* Top label row */}
        <p style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: 'var(--hairline)',
          margin: '0 0 10px',
        }}>
          {emoji} {label}
        </p>

        {noData ? (
          <p style={{
            fontFamily: "'DM Sans',sans-serif",
            color: 'var(--hairline)',
            fontSize: '13px',
            margin: 0,
          }}>
            Not enough data
          </p>
        ) : (
          <div style={{ minWidth: 0 }}>
            <p
              onClick={clickable ? onWinnerClick : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e => { if (e.key === 'Enter') onWinnerClick() }) : undefined}
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '1.55rem',
                letterSpacing: '0.03em',
                color: 'var(--text-strong)',
                margin: '0 0 4px',
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: clickable ? 'pointer' : 'default',
                textDecoration: clickable ? 'underline' : 'none',
                textDecorationColor: clickable ? 'rgba(var(--fg-rgb), 0.2)' : undefined,
                textUnderlineOffset: '3px',
              }}
            >
              {winner ?? '—'}
            </p>
            {metric && (
              <p style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: '11px',
                color: 'var(--text-faint)',
                margin: 0,
                lineHeight: 1.4,
              }}>
                {metric}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Poster — fills full card height on the right edge */}
      {hasPoster && !noData && (
        <div
          onClick={clickable ? onWinnerClick : undefined}
          style={{
            flexShrink: 0,
            width: '56px',
            cursor: clickable ? 'pointer' : 'default',
            overflow: 'hidden',
            background: 'rgba(var(--fg-rgb), 0.05)',
            alignSelf: 'stretch',
          }}
        >
          {posterUrl ? (
            <img
              src={`https://image.tmdb.org/t/p/w185${posterUrl}`}
              alt={posterTitle ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: "'Bebas Neue',sans-serif",
                color: 'rgba(var(--fg-rgb), 0.15)',
                fontSize: '11px',
              }}>
                {(posterTitle ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Big Poster Hero Card ────────────────────────────────────────────────────

function BigPosterCard({ emoji, label, movie, avgScore, noData, onClick, awardId }) {
  const clickable = !!onClick && !!movie
  const initials = (movie?.title ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div
      data-award-id={awardId}
      style={{
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        borderRadius: '14px',
        padding: '16px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <p style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: 'var(--hairline)',
        margin: '0 0 14px',
      }}>
        {emoji} {label}
      </p>

      {noData ? (
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
          Not enough data
        </p>
      ) : (
        <div
          onClick={clickable ? onClick : undefined}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            minWidth: 0,
            cursor: clickable ? 'pointer' : 'default',
          }}
        >
          {/* Poster */}
          <div style={{
            flexShrink: 0,
            width: '64px',
            height: '90px',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'rgba(var(--fg-rgb), 0.05)',
          }}>
            {movie?.poster_url ? (
              <img
                src={`https://image.tmdb.org/t/p/w185${movie.poster_url}`}
                alt={movie.title}
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
                  color: 'rgba(var(--fg-rgb), 0.15)',
                  fontSize: '13px',
                }}>
                  {initials}
                </span>
              </div>
            )}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'Bebas Neue',sans-serif",
              fontSize: '1.8rem',
              letterSpacing: '0.03em',
              color: 'var(--text-strong)',
              margin: '0 0 6px',
              lineHeight: 1.05,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {movie?.title ?? '—'}
            </p>
            {movie?.year_released && (
              <p style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: '10px',
                color: 'var(--text-faint)',
                margin: '0 0 8px',
                letterSpacing: '0.06em',
              }}>
                {movie.year_released}
              </p>
            )}
            <div style={{
              display: 'inline-block',
              background: 'var(--accent, rgba(var(--fg-rgb), 0.1))',
              borderRadius: '6px',
              padding: '4px 10px',
            }}>
              <span style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '1.1rem',
                color: 'var(--text-strong)',
                letterSpacing: '0.04em',
              }}>
                {fmt(avgScore)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stat Mini Card ──────────────────────────────────────────────────────────

function StatMiniCard({ label, value, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter') onClick() }) : undefined}
      style={{
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        borderRadius: '14px',
        padding: '16px',
        flex: '1 1 calc(50% - 5px)',
        minWidth: 0,
        boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <p style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: 'var(--hairline)',
        margin: '0 0 6px',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.7rem',
        color: 'var(--text-strong)',
        margin: 0,
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

// ─── Award computations ──────────────────────────────────────────────────────

// ─── Season Awards computation ───────────────────────────────────────────────

export function computeSeasonAwards(movies, allRatings, users, season, months, seasonIsWinter2026) {
  // Get all months in this season
  const seasonMonthIds = new Set(
    months.filter(m => m.season_id === season.id).map(m => m.id)
  )
  // Month year lookup by month_id (needed for Zack eligibility in per-user monthly checks)
  const monthYearById = {}
  months.forEach(m => { monthYearById[m.id] = m.month_year })

  // Filter season movies that have scores_revealed
  const seasonMovies = movies.filter(m => seasonMonthIds.has(m.month_id) && m.scores_revealed)
  if (!seasonMovies.length) return null

  const movieIds = new Set(seasonMovies.map(m => m.id))
  const seasonRatings = allRatings.filter(r => movieIds.has(r.movie_id))

  const userMap = {}
  users.forEach(u => { userMap[u.id] = u })

  // Per-movie scores
  const scoresByMovie = {}
  const excitementByMovie = {}
  seasonMovies.forEach(m => {
    scoresByMovie[m.id] = []
    excitementByMovie[m.id] = []
  })
  seasonRatings.forEach(r => {
    if (r.score != null) scoresByMovie[r.movie_id]?.push(Number(r.score))
    if (r.pre_watch_excitement != null) excitementByMovie[r.movie_id]?.push(Number(r.pre_watch_excitement))
  })

  // Per-movie averages — historical_avg_score is authoritative when set
  const movieAvgScore = {}
  seasonMovies.forEach(m => {
    if (m.historical_avg_score != null) {
      movieAvgScore[m.id] = Number(m.historical_avg_score)
    } else {
      const scores = scoresByMovie[m.id]
      movieAvgScore[m.id] = scores.length ? avg(scores) : null
    }
  })

  // 1. Film of the Season — highest avg (min 2 scores)
  const twoPlus = seasonMovies.filter(m => scoresByMovie[m.id].length >= 2)
  const filmOfSeason = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 0) >= (movieAvgScore[b.id] ?? 0) ? a : b)
    : null

  // 2. Flop of the Season — lowest avg (min 2 scores)
  const flopOfSeason = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 10) <= (movieAvgScore[b.id] ?? 10) ? a : b)
    : null

  // 3–10: Per-user/per-picker computations
  // Build per-picker data (picker_revealed=true)
  const pickerMovies = {}
  seasonMovies.forEach(m => {
    if (!m.picked_by_user_id || !m.picker_revealed) return
    if (!pickerMovies[m.picked_by_user_id]) pickerMovies[m.picked_by_user_id] = []
    pickerMovies[m.picked_by_user_id].push(m)
  })

  // 3. Picker of the Season — avg of their picks' avg scores (min 1 pick with score)
  let pickerOfSeason = null
  let pickerOfSeasonAvg = -Infinity
  let pickerOfSeasonCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const user = userMap[uid]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    const avgs = pickedFilms
      .map(m => movieAvgScore[m.id])
      .filter(v => v != null)
    if (!avgs.length) return
    const pickerAvg = avg(avgs)
    if (pickerAvg > pickerOfSeasonAvg) {
      pickerOfSeasonAvg = pickerAvg
      pickerOfSeason = user
      pickerOfSeasonCount = avgs.length
    }
  })

  // 4. Ice Cold — picker whose picks averaged lowest
  let iceCold = null
  let iceColdAvg = Infinity
  let iceColdCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const user = userMap[uid]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    const avgs = pickedFilms
      .map(m => movieAvgScore[m.id])
      .filter(v => v != null)
    if (!avgs.length) return
    const pickerAvg = avg(avgs)
    if (pickerAvg < iceColdAvg) {
      iceColdAvg = pickerAvg
      iceCold = user
      iceColdCount = avgs.length
    }
  })

  // 4b. Most Consistent Picker — picker whose picks' averages vary the least (min 2 picks)
  let mostConsistentPicker = null
  let mostConsistentPickerSd = Infinity
  let mostConsistentPickerCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const user = userMap[uid]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    const avgs = pickedFilms.map(m => movieAvgScore[m.id]).filter(v => v != null)
    if (avgs.length < 2) return
    const sd = stddev(avgs)
    if (sd != null && sd < mostConsistentPickerSd) {
      mostConsistentPickerSd = sd
      mostConsistentPicker = user
      mostConsistentPickerCount = avgs.length
    }
  })

  // 5. Most Divisive Film — highest stddev (min 3 scores)
  const threePlus = seasonMovies.filter(m => scoresByMovie[m.id].length >= 3)
  const mostDivisiveFilm = threePlus.length
    ? threePlus.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? 0
        const sdB = stddev(scoresByMovie[b.id]) ?? 0
        return sdA >= sdB ? a : b
      })
    : null

  // 6. Most Unanimous Film — lowest stddev (min 3 scores)
  const mostUnanimousFilm = threePlus.length
    ? threePlus.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? Infinity
        const sdB = stddev(scoresByMovie[b.id]) ?? Infinity
        return sdA <= sdB ? a : b
      })
    : null

  // Per-user ratings this season — filtered by Zack eligibility
  const userRatingsThisSeason = {}
  seasonRatings.forEach(r => {
    const user = userMap[r.user_id]
    if (!user) return
    if (!isUserEligibleForSeason(user.name, seasonIsWinter2026)) return
    if (!userRatingsThisSeason[r.user_id]) userRatingsThisSeason[r.user_id] = []
    userRatingsThisSeason[r.user_id].push(r)
  })

  const eligibleUserIds = Object.keys(userRatingsThisSeason)

  // 7. Harshest Critic — lowest avg score given
  let harshestCritic = null
  let harshestCriticAvg = Infinity
  eligibleUserIds.forEach(uid => {
    const scores = userRatingsThisSeason[uid]
      .filter(r => r.score != null)
      .map(r => Number(r.score))
    if (!scores.length) return
    const a = avg(scores)
    if (a < harshestCriticAvg) {
      harshestCriticAvg = a
      harshestCritic = userMap[uid]
    }
  })

  // 8. Most Generous — highest avg score given
  let mostGenerous = null
  let mostGenerousAvg = -Infinity
  eligibleUserIds.forEach(uid => {
    const scores = userRatingsThisSeason[uid]
      .filter(r => r.score != null)
      .map(r => Number(r.score))
    if (!scores.length) return
    const a = avg(scores)
    if (a > mostGenerousAvg) {
      mostGenerousAvg = a
      mostGenerous = userMap[uid]
    }
  })

  // 8b. Easy Crowd — easiest to please: fewest "low" scores given (≤ 4.0), tie-break by
  //     highest average. Distinct from Most Generous (which is pure highest average).
  let easyCrowd = null
  let easyCrowdLowCount = Infinity
  let easyCrowdAvg = -Infinity
  eligibleUserIds.forEach(uid => {
    const scores = userRatingsThisSeason[uid].filter(r => r.score != null).map(r => Number(r.score))
    if (scores.length < 2) return
    const lowCount = scores.filter(s => s <= 4).length
    const a = avg(scores)
    if (lowCount < easyCrowdLowCount || (lowCount === easyCrowdLowCount && a > easyCrowdAvg)) {
      easyCrowdLowCount = lowCount
      easyCrowdAvg = a
      easyCrowd = userMap[uid]
    }
  })

  // 9. The Contrarian — highest avg |personal_score - film_avg|
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
    if (a > contrarianHighest) {
      contrarianHighest = a
      contrarianWinner = userMap[uid]
    }
  })

  // 10. The Oracle — lowest avg |excitement - film_avg|
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
    if (a < oracleBestDelta) {
      oracleBestDelta = a
      oracleWinner = userMap[uid]
    }
  })

  return {
    filmOfSeason, flopOfSeason,
    pickerOfSeason, pickerOfSeasonAvg, pickerOfSeasonCount,
    iceCold, iceColdAvg, iceColdCount,
    mostConsistentPicker, mostConsistentPickerSd, mostConsistentPickerCount,
    mostDivisiveFilm, mostUnanimousFilm,
    harshestCritic, harshestCriticAvg,
    mostGenerous, mostGenerousAvg,
    easyCrowd, easyCrowdLowCount, easyCrowdAvg,
    contrarianWinner, contrarianHighest,
    oracleWinner, oracleBestDelta,
    movieAvgScore,
    scoresByMovie,
  }
}

// ─── Annual Awards computation ────────────────────────────────────────────────

export function computeAnnualAwards(movies, allRatings, users, year, guesses = [], monthYearByMovie = {}) {
  // All revealed movies from this calendar year
  // We need months to know which movies belong to which year — instead we use the
  // month_year embedded context. Since movies don't directly carry year, we filter
  // via the months map that callers pass separately. But to keep this function
  // self-contained for testing, we accept pre-filtered movies.
  // Caller must pass movies already filtered to the relevant year.
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

  // Per-movie averages — historical_avg_score is authoritative when set
  const movieAvgScore = {}
  revealedMovies.forEach(m => {
    if (m.historical_avg_score != null) {
      movieAvgScore[m.id] = Number(m.historical_avg_score)
    } else {
      const scores = scoresByMovie[m.id]
      movieAvgScore[m.id] = scores.length ? avg(scores) : null
    }
  })

  // 1. Glance stats
  const VAULT_THRESHOLD = 8.5
  const vaultFilms = revealedMovies.filter(m => (movieAvgScore[m.id] ?? 0) >= VAULT_THRESHOLD)
  const totalScoresCast = relevantRatings.filter(r => r.score != null).length
  const allScores = relevantRatings.filter(r => r.score != null).map(r => Number(r.score))
  const clubAvg = allScores.length ? avg(allScores) : null

  // 2. Film of Year — highest avg (min 2 scores)
  const twoPlus = revealedMovies.filter(m => scoresByMovie[m.id].length >= 2)
  const filmOfYear = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 0) >= (movieAvgScore[b.id] ?? 0) ? a : b)
    : null

  // 3. Worst Film of Year — lowest avg (min 2 scores)
  const worstFilmOfYear = twoPlus.length
    ? twoPlus.reduce((a, b) => (movieAvgScore[a.id] ?? 10) <= (movieAvgScore[b.id] ?? 10) ? a : b)
    : null

  // 4. Picker of the Year — from picker_revealed movies
  const pickerMovies = {}
  revealedMovies.forEach(m => {
    if (!m.picked_by_user_id || !m.picker_revealed) return
    if (!pickerMovies[m.picked_by_user_id]) pickerMovies[m.picked_by_user_id] = []
    pickerMovies[m.picked_by_user_id].push(m)
  })

  let pickerOfYear = null
  let pickerOfYearAvg = -Infinity
  let pickerOfYearCount = 0
  Object.entries(pickerMovies).forEach(([uid, pickedFilms]) => {
    const avgs = pickedFilms.map(m => movieAvgScore[m.id]).filter(v => v != null)
    if (!avgs.length) return
    const pickerAvg = avg(avgs)
    if (pickerAvg > pickerOfYearAvg) {
      pickerOfYearAvg = pickerAvg
      pickerOfYear = userMap[uid] ?? null
      pickerOfYearCount = avgs.length
    }
  })

  // 5–6. Per-user critic stats
  const userScoresGiven = {}
  relevantRatings.forEach(r => {
    if (r.score == null) return
    if (!userScoresGiven[r.user_id]) userScoresGiven[r.user_id] = []
    userScoresGiven[r.user_id].push(Number(r.score))
  })

  const usersWithScores = users.filter(u => userScoresGiven[u.id]?.length > 0)

  let harshestCritic = null
  let harshestCriticAvg = Infinity
  let mostGenerous = null
  let mostGenerousAvg = -Infinity
  usersWithScores.forEach(u => {
    const a = avg(userScoresGiven[u.id])
    if (a == null) return
    if (a < harshestCriticAvg) { harshestCriticAvg = a; harshestCritic = u }
    if (a > mostGenerousAvg) { mostGenerousAvg = a; mostGenerous = u }
  })

  // 6b. Most Consistent — member whose own scores vary the least (min 3 scores)
  let mostConsistent = null
  let mostConsistentSd = Infinity
  usersWithScores.forEach(u => {
    const scores = userScoresGiven[u.id]
    if (!scores || scores.length < 3) return
    const sd = stddev(scores)
    if (sd != null && sd < mostConsistentSd) { mostConsistentSd = sd; mostConsistent = u }
  })

  // 6c. The Wildcard — biggest contrarian: highest avg |score − film avg| (min 3 scored films)
  const userDevs = {}
  relevantRatings.forEach(r => {
    if (r.score == null) return
    const filmAvgVal = movieAvgScore[r.movie_id]
    if (filmAvgVal == null) return
    if (!userDevs[r.user_id]) userDevs[r.user_id] = []
    userDevs[r.user_id].push(Math.abs(Number(r.score) - filmAvgVal))
  })
  let wildcard = null
  let wildcardHighest = -Infinity
  users.forEach(u => {
    const devs = userDevs[u.id]
    if (!devs || devs.length < 3) return
    const a = avg(devs)
    if (a > wildcardHighest) { wildcardHighest = a; wildcard = u }
  })

  // 6d. Most Evolved — biggest swing in a member's average between the year's first and
  //     second half. Dormant until the year spans ≥ 8 distinct months (auto-activates with data).
  let mostEvolved = null
  let mostEvolvedDelta = -Infinity
  {
    const monthsPresent = new Set()
    revealedMovies.forEach(m => { const my = monthYearByMovie[m.id]; if (my) monthsPresent.add(my) })
    const sortedMonths = [...monthsPresent].sort()
    if (sortedMonths.length >= 8) {
      const firstHalf = new Set(sortedMonths.slice(0, Math.floor(sortedMonths.length / 2)))
      const half = {} // uid -> { early:[], late:[] }
      relevantRatings.forEach(r => {
        if (r.score == null) return
        const my = monthYearByMovie[r.movie_id]
        if (!my) return
        if (!half[r.user_id]) half[r.user_id] = { early: [], late: [] }
        ;(firstHalf.has(my) ? half[r.user_id].early : half[r.user_id].late).push(Number(r.score))
      })
      users.forEach(u => {
        const h = half[u.id]
        if (!h || h.early.length < 2 || h.late.length < 2) return
        const delta = Math.abs(avg(h.late) - avg(h.early))
        if (delta > mostEvolvedDelta) { mostEvolvedDelta = delta; mostEvolved = u }
      })
    }
  }

  // 6e. Master of Disguise — picker whose films were correctly guessed least often (best at
  //     hiding their picks). Uses picker_guesses; requires ≥ 3 guesses on their films.
  let masterOfDisguise = null
  let masterOfDisguiseRate = Infinity
  {
    const movieById = {}
    revealedMovies.forEach(m => { movieById[m.id] = m })
    const byPicker = {} // uid -> { correct, total }
    guesses.forEach(g => {
      const m = movieById[g.movie_id]
      if (!m || !m.picker_revealed || !m.picked_by_user_id) return
      const pid = m.picked_by_user_id
      if (!byPicker[pid]) byPicker[pid] = { correct: 0, total: 0 }
      byPicker[pid].total += 1
      if (g.guessed_user_id === pid) byPicker[pid].correct += 1
    })
    Object.entries(byPicker).forEach(([pid, t]) => {
      if (t.total < 3) return
      const rate = t.correct / t.total
      if (rate < masterOfDisguiseRate) { masterOfDisguiseRate = rate; masterOfDisguise = userMap[pid] ?? null }
    })
  }

  // 7. Most Divisive Film — highest stddev (min 3 scores)
  const threePlus = revealedMovies.filter(m => scoresByMovie[m.id].length >= 3)
  const mostDivisiveFilm = threePlus.length
    ? threePlus.reduce((a, b) => {
        const sdA = stddev(scoresByMovie[a.id]) ?? 0
        const sdB = stddev(scoresByMovie[b.id]) ?? 0
        return sdA >= sdB ? a : b
      })
    : null

  // 8. The Oracle — lowest avg |excitement - film_avg|
  const userExcitementDeltas = {}
  relevantRatings.forEach(r => {
    if (r.pre_watch_excitement == null) return
    const filmAvgVal = movieAvgScore[r.movie_id]
    if (filmAvgVal == null) return
    if (!userExcitementDeltas[r.user_id]) userExcitementDeltas[r.user_id] = []
    userExcitementDeltas[r.user_id].push(Math.abs(Number(r.pre_watch_excitement) - filmAvgVal))
  })

  let oracleOfYear = null
  let oracleBestDelta = Infinity
  users.forEach(u => {
    const deltas = userExcitementDeltas[u.id]
    if (!deltas?.length) return
    const a = avg(deltas)
    if (a < oracleBestDelta) {
      oracleBestDelta = a
      oracleOfYear = u
    }
  })

  return {
    totalFilms: revealedMovies.length,
    totalScoresCast,
    clubAvg,
    vaultCount: vaultFilms.length,
    filmOfYear, worstFilmOfYear,
    pickerOfYear, pickerOfYearAvg, pickerOfYearCount,
    harshestCritic, harshestCriticAvg,
    mostGenerous, mostGenerousAvg,
    mostConsistent, mostConsistentSd,
    wildcard, wildcardHighest,
    mostEvolved, mostEvolvedDelta,
    masterOfDisguise, masterOfDisguiseRate,
    mostDivisiveFilm,
    oracleOfYear, oracleBestDelta,
    movieAvgScore,
    scoresByMovie,
  }
}

export function computeMonthlyAwards(movies, allRatings, users, selectedMonth) {
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

  // Per-movie averages — historical_avg_score is authoritative when set
  const movieAvgScore = {}
  const movieAvgExcitement = {}
  monthMovies.forEach(m => {
    if (m.historical_avg_score != null) {
      movieAvgScore[m.id] = Number(m.historical_avg_score)
    } else {
      const scores = scoresByMovie[m.id]
      movieAvgScore[m.id] = scores.length ? avg(scores) : null
    }
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

export function computeAllTimeAwards(movies, allRatings, users, guesses = []) {
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

  // Per-movie averages — historical_avg_score is authoritative when set
  const movieAvgScore = {}
  revealedMovies.forEach(m => {
    if (m.historical_avg_score != null) {
      movieAvgScore[m.id] = Number(m.historical_avg_score)
    } else {
      const scores = scoresByMovie[m.id]
      movieAvgScore[m.id] = scores.length ? avg(scores) : null
    }
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

  // 5b. Master of Disguise — picker correctly guessed least often across all their films
  //     (best at hiding their picks). Uses picker_guesses; requires ≥ 3 guesses on their films.
  let masterOfDisguise = null
  let masterOfDisguiseRate = Infinity
  {
    const movieById = {}
    revealedMovies.forEach(m => { movieById[m.id] = m })
    const byPicker = {}
    guesses.forEach(g => {
      const m = movieById[g.movie_id]
      if (!m || !m.picker_revealed || !m.picked_by_user_id) return
      const pid = m.picked_by_user_id
      if (!byPicker[pid]) byPicker[pid] = { correct: 0, total: 0 }
      byPicker[pid].total += 1
      if (g.guessed_user_id === pid) byPicker[pid].correct += 1
    })
    Object.entries(byPicker).forEach(([pid, t]) => {
      if (t.total < 3) return
      const rate = t.correct / t.total
      if (rate < masterOfDisguiseRate) { masterOfDisguiseRate = rate; masterOfDisguise = userMap[pid] ?? null }
    })
  }

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
    masterOfDisguise, masterOfDisguiseRate,
    oracleAllTime, oracleAllTimeDelta,
    movieAvgScore,
    scoresByMovie,
  }
}

// ─── Monthly Tab ─────────────────────────────────────────────────────────────

function MonthlyTab({ months, movies, allRatings, users, loading, onFilm, onMember, deepLink }) {
  const revealedMonths = useMemo(() => {
    return months
      .filter(m => {
        const monthMovies = movies.filter(mv => mv.month_id === m.id && mv.scores_revealed)
        return monthMovies.length > 0
      })
      .sort((a, b) => b.month_year.localeCompare(a.month_year))
  }, [months, movies])

  const [selectedMonth, setSelectedMonth] = useState(null)

  // set default once revealed months load; honour deep-link ref
  useEffect(() => {
    if (!revealedMonths.length) return
    if (deepLink?.ref) {
      const target = revealedMonths.find(m => m.month_year === deepLink.ref)
      if (target) { setSelectedMonth(target); return }
    }
    if (!selectedMonth) setSelectedMonth(revealedMonths[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedMonths, deepLink?.ref])

  const awards = useMemo(() => {
    if (!selectedMonth) return null
    return computeMonthlyAwards(movies, allRatings, users, selectedMonth)
  }, [selectedMonth, movies, allRatings, users])

  const aid = useCallback(
    (key) => selectedMonth ? `monthly:${key}:${selectedMonth.month_year}` : undefined,
    [selectedMonth]
  )

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
          color: 'rgba(var(--fg-rgb), 0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
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
                border: active ? '1px solid rgba(var(--fg-rgb), 0.15)' : '1px solid rgba(var(--fg-rgb), 0.07)',
                background: active ? 'rgba(var(--fg-rgb), 0.1)' : 'rgba(var(--fg-rgb), 0.03)',
                color: active ? 'var(--text-strong)' : 'var(--text-faint)',
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.pickOfMonth)}
            awardId={aid('pick_of_month')}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.flopOfMonth)}
            awardId={aid('flop_of_month')}
          />

          {/* 3. The Oracle */}
          <AwardCard
            emoji="🎯"
            label="The Oracle"
            winner={awards.oracleWinner?.name}
            metric={awards.oracleWinner ? `avg delta: ±${fmt(awards.oracleBestDelta)}` : null}
            noData={!awards.oracleWinner}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.oracleWinner)}
            awardId={aid('oracle')}
          />

          {/* 4. Hype Machine */}
          <AwardCard
            emoji="🚀"
            label="Hype Machine"
            winner={awards.hypeMachineWinner?.name}
            metric={awards.hypeMachineWinner ? `avg excitement: ${fmt(awards.hypeMachineAvg)}` : null}
            noData={!awards.hypeMachineWinner}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.hypeMachineWinner)}
            awardId={aid('hype_machine')}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.letdownMovie)}
            awardId={aid('letdown')}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.surpriseMovie)}
            awardId={aid('surprise')}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.divisiveMovie)}
            awardId={aid('most_divisive')}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.unanimousMovie)}
            awardId={aid('most_unanimous')}
          />

          {/* 9. The Contrarian */}
          <AwardCard
            emoji="🦅"
            label="The Contrarian"
            winner={awards.contrarianWinner?.name}
            metric={awards.contrarianWinner ? `avg deviation: ±${fmt(awards.contrarianHighest)}` : null}
            noData={!awards.contrarianWinner}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.contrarianWinner)}
            awardId={aid('contrarian')}
          />
        </div>
      )}
    </div>
  )
}

// ─── All-Time Tab ─────────────────────────────────────────────────────────────

function AllTimeTab({ movies, allRatings, users, guesses = [], loading, onFilm, onMember }) {
  const awards = useMemo(() => {
    if (loading || !movies.length) return null
    return computeAllTimeAwards(movies, allRatings, users, guesses)
  }, [movies, allRatings, users, guesses, loading])

  const aid = useCallback((key) => `alltime:${key}:`, [])

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
          color: 'rgba(var(--fg-rgb), 0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
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
        winnerClickable
        onWinnerClick={() => onFilm?.(awards.greatestFilm)}
        awardId={aid('greatest_film')}
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
        winnerClickable
        onWinnerClick={() => onFilm?.(awards.worstFilm)}
        awardId={aid('worst_film')}
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
        winnerClickable
        onWinnerClick={() => onFilm?.(awards.mostDivisiveFilm)}
        awardId={aid('divisive_ever')}
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
        winnerClickable
        onWinnerClick={() => onFilm?.(awards.mostUnanimousFilm)}
        awardId={aid('unanimous_ever')}
      />

      {/* 5. Top Picker */}
      <AwardCard
        emoji="🎬"
        label="Top Picker"
        winner={awards.topPicker?.name}
        metric={awards.topPickerStr || null}
        noData={!awards.topPicker}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.topPicker)}
        awardId={aid('picker_goat')}
      />

      {/* 6. Harshest Critic */}
      <AwardCard
        emoji="😤"
        label="Harshest Critic"
        winner={awards.harshestCritic?.name}
        metric={awards.harshestCritic ? `avg score given: ${fmt(awards.harshestAvg)}` : null}
        noData={!awards.harshestCritic}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.harshestCritic)}
        awardId={aid('coldest_critic')}
      />

      {/* 7. Most Generous */}
      <AwardCard
        emoji="😊"
        label="Most Generous"
        winner={awards.mostGenerous?.name}
        metric={awards.mostGenerous ? `avg score given: ${fmt(awards.mostGenerousAvg)}` : null}
        noData={!awards.mostGenerous}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.mostGenerous)}
        awardId={aid('biggest_softie')}
      />

      {/* 8. Biggest Contrarian */}
      <AwardCard
        emoji="🦅"
        label="Biggest Contrarian"
        winner={awards.biggestContrarian?.name}
        metric={awards.biggestContrarian ? `avg deviation: ±${fmt(awards.biggestContrarianDev)}` : null}
        noData={!awards.biggestContrarian}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.biggestContrarian)}
        awardId={aid('wildcard_alltime')}
      />

      {/* 8b. Master of Disguise */}
      <AwardCard
        emoji="🥸"
        label="Master of Disguise"
        winner={awards.masterOfDisguise?.name}
        metric={awards.masterOfDisguise ? `guessed right ${Math.round(awards.masterOfDisguiseRate * 100)}% of the time` : null}
        noData={!awards.masterOfDisguise}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.masterOfDisguise)}
        awardId={aid('master_of_disguise_alltime')}
      />

      {/* 9. The Oracle (all-time) */}
      <AwardCard
        emoji="🎯"
        label="The Oracle (All-Time)"
        winner={awards.oracleAllTime?.name}
        metric={awards.oracleAllTime ? `avg delta: ±${fmt(awards.oracleAllTimeDelta)}` : null}
        noData={!awards.oracleAllTime}
        winnerClickable
        onWinnerClick={() => onMember?.(awards.oracleAllTime)}
        awardId={aid('oracle_alltime')}
      />
    </div>
  )
}

// ─── Season Tab ───────────────────────────────────────────────────────────────

function SeasonTab({ seasons, months, movies, allRatings, users, loading, onFilm, onMember, deepLink }) {
  // Only seasons that have at least one movie with scores_revealed
  const revealedSeasons = useMemo(() => {
    return seasons
      .filter(s => {
        const seasonMonthIds = new Set(months.filter(m => m.season_id === s.id).map(m => m.id))
        return movies.some(mv => seasonMonthIds.has(mv.month_id) && mv.scores_revealed)
      })
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
  }, [seasons, months, movies])

  const [selectedSeason, setSelectedSeason] = useState(null)

  useEffect(() => {
    if (!revealedSeasons.length) return
    if (deepLink?.ref) {
      const target = revealedSeasons.find(s => s.id === deepLink.ref)
      if (target) { setSelectedSeason(target); return }
    }
    if (!selectedSeason) setSelectedSeason(revealedSeasons[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedSeasons, deepLink?.ref])

  const seasonIsWinter2026 = useMemo(
    () => isWinter2026(selectedSeason, months),
    [selectedSeason, months]
  )

  const awards = useMemo(() => {
    if (!selectedSeason) return null
    return computeSeasonAwards(movies, allRatings, users, selectedSeason, months, seasonIsWinter2026)
  }, [selectedSeason, movies, allRatings, users, months, seasonIsWinter2026])

  const aid = useCallback(
    (key) => selectedSeason ? `season:${key}:${selectedSeason.id}` : undefined,
    [selectedSeason]
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(8)].map((_, i) => <Skeleton key={i} height={100} />)}
      </div>
    )
  }

  if (!revealedSeasons.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: '1.4rem',
          color: 'rgba(var(--fg-rgb), 0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No season data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
          Awards appear once film scores are revealed.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Season selector pills */}
      <div style={{
        display: 'flex',
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '4px',
        marginBottom: '20px',
        scrollbarWidth: 'none',
      }}>
        {revealedSeasons.map(s => {
          const active = selectedSeason?.id === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSelectedSeason(s)}
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                borderRadius: '20px',
                border: active ? '1px solid rgba(var(--fg-rgb), 0.15)' : '1px solid rgba(var(--fg-rgb), 0.07)',
                background: active ? 'rgba(var(--fg-rgb), 0.1)' : 'rgba(var(--fg-rgb), 0.03)',
                color: active ? 'var(--text-strong)' : 'var(--text-faint)',
                fontFamily: "'DM Mono',monospace",
                fontSize: '11px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </button>
          )
        })}
      </div>

      {/* Zack Winter note */}
      {seasonIsWinter2026 && (
        <p style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          color: 'var(--hairline)',
          letterSpacing: '0.1em',
          margin: '0 0 16px',
        }}>
          * Zack joined April 2026 — excluded from per-person awards this season
        </p>
      )}

      {/* Award cards */}
      {awards && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* 1. Film of the Season */}
          <AwardCard
            emoji="🏆"
            label="Film of the Season"
            winner={awards.filmOfSeason?.title}
            metric={awards.filmOfSeason ? `avg score: ${fmt(awards.movieAvgScore[awards.filmOfSeason.id])}` : null}
            posterUrl={awards.filmOfSeason?.poster_url}
            posterTitle={awards.filmOfSeason?.title}
            noData={!awards.filmOfSeason}
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.filmOfSeason)}
            awardId={aid('film_of_season')}
          />

          {/* 2. Flop of the Season */}
          <AwardCard
            emoji="💀"
            label="Flop of the Season"
            winner={awards.flopOfSeason?.title}
            metric={awards.flopOfSeason ? `avg score: ${fmt(awards.movieAvgScore[awards.flopOfSeason.id])}` : null}
            posterUrl={awards.flopOfSeason?.poster_url}
            posterTitle={awards.flopOfSeason?.title}
            noData={!awards.flopOfSeason || awards.flopOfSeason.id === awards.filmOfSeason?.id}
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.flopOfSeason)}
            awardId={aid('flop_of_season')}
          />

          {/* 3. Picker of the Season */}
          <AwardCard
            emoji="🎬"
            label="Picker of the Season"
            winner={awards.pickerOfSeason?.name}
            metric={
              awards.pickerOfSeason
                ? `avg ${fmt(awards.pickerOfSeasonAvg)} across ${awards.pickerOfSeasonCount} pick${awards.pickerOfSeasonCount !== 1 ? 's' : ''}`
                : null
            }
            noData={!awards.pickerOfSeason}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.pickerOfSeason)}
            awardId={aid('picker_of_season')}
          />

          {/* 4. Ice Cold */}
          <AwardCard
            emoji="🧊"
            label="Ice Cold"
            winner={awards.iceCold?.name}
            metric={
              awards.iceCold
                ? `avg ${fmt(awards.iceColdAvg)} across ${awards.iceColdCount} pick${awards.iceColdCount !== 1 ? 's' : ''}`
                : null
            }
            noData={!awards.iceCold || awards.iceCold?.id === awards.pickerOfSeason?.id}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.iceCold)}
            awardId={aid('ice_cold')}
          />

          {/* 5. Most Divisive Film */}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.mostDivisiveFilm)}
            awardId={aid('season_divisive')}
          />

          {/* 6. Most Unanimous Film */}
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
            winnerClickable
            onWinnerClick={() => onFilm?.(awards.mostUnanimousFilm)}
            awardId={aid('season_unanimous')}
          />

          {/* 7. Harshest Critic */}
          <AwardCard
            emoji="😤"
            label="Harshest Critic"
            winner={awards.harshestCritic?.name}
            metric={awards.harshestCritic ? `avg score given: ${fmt(awards.harshestCriticAvg)}` : null}
            noData={!awards.harshestCritic}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.harshestCritic)}
            awardId={aid('season_harshest')}
          />

          {/* 8. Most Generous */}
          <AwardCard
            emoji="😊"
            label="Most Generous"
            winner={awards.mostGenerous?.name}
            metric={awards.mostGenerous ? `avg score given: ${fmt(awards.mostGenerousAvg)}` : null}
            noData={!awards.mostGenerous}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.mostGenerous)}
            awardId={aid('season_generous')}
          />

          {/* 9. The Contrarian */}
          <AwardCard
            emoji="🦅"
            label="The Contrarian"
            winner={awards.contrarianWinner?.name}
            metric={awards.contrarianWinner ? `avg deviation: ±${fmt(awards.contrarianHighest)}` : null}
            noData={!awards.contrarianWinner}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.contrarianWinner)}
            awardId={aid('season_contrarian')}
          />

          {/* 10. The Oracle */}
          <AwardCard
            emoji="🎯"
            label="The Oracle"
            winner={awards.oracleWinner?.name}
            metric={awards.oracleWinner ? `avg delta: ±${fmt(awards.oracleBestDelta)}` : null}
            noData={!awards.oracleWinner}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.oracleWinner)}
            awardId={aid('season_oracle')}
          />

          {/* 11. Most Consistent Picker */}
          <AwardCard
            emoji="🎚️"
            label="Most Consistent Picker"
            winner={awards.mostConsistentPicker?.name}
            metric={awards.mostConsistentPicker ? `pick spread: ±${fmt(awards.mostConsistentPickerSd)}` : null}
            noData={!awards.mostConsistentPicker}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.mostConsistentPicker)}
            awardId={aid('season_consistent_picker')}
          />

          {/* 12. Easy Crowd */}
          <AwardCard
            emoji="🍻"
            label="Easy Crowd"
            winner={awards.easyCrowd?.name}
            metric={awards.easyCrowd ? `${awards.easyCrowdLowCount} low score${awards.easyCrowdLowCount !== 1 ? 's' : ''} · avg ${fmt(awards.easyCrowdAvg)}` : null}
            noData={!awards.easyCrowd}
            winnerClickable
            onWinnerClick={() => onMember?.(awards.easyCrowd)}
            awardId={aid('season_easy_crowd')}
          />
        </div>
      )}
    </div>
  )
}

// ─── Annual Tab ────────────────────────────────────────────────────────────────

function AnnualTab({ movies, allRatings, users, months, guesses = [], loading, onFilm, onMember, deepLink }) {
  const navigate = useNavigate()
  // Group movies by year via their month's month_year
  const monthYearById = useMemo(() => {
    const map = {}
    months.forEach(m => { map[m.id] = m.month_year })
    return map
  }, [months])

  const availableYears = useMemo(() => {
    const years = new Set()
    movies.forEach(m => {
      const my = monthYearById[m.month_id]
      if (my) years.add(my.split('-')[0])
    })
    return [...years].sort((a, b) => b.localeCompare(a))
  }, [movies, monthYearById])

  // We only show 2026 for now — if more years arrive later this auto-expands
  const [selectedYear, setSelectedYear] = useState(null)

  useEffect(() => {
    if (!availableYears.length) return
    if (deepLink?.ref && availableYears.includes(deepLink.ref)) {
      setSelectedYear(deepLink.ref); return
    }
    if (!selectedYear) setSelectedYear(availableYears[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears, deepLink?.ref])

  const yearMovies = useMemo(() => {
    if (!selectedYear) return []
    return movies.filter(m => {
      const my = monthYearById[m.month_id]
      return my && my.startsWith(selectedYear)
    })
  }, [movies, monthYearById, selectedYear])

  const awards = useMemo(() => {
    if (loading || !yearMovies.length) return null
    const monthYearByMovie = {}
    yearMovies.forEach(m => { monthYearByMovie[m.id] = monthYearById[m.month_id] })
    return computeAnnualAwards(yearMovies, allRatings, users, selectedYear, guesses, monthYearByMovie)
  }, [yearMovies, allRatings, users, selectedYear, loading, guesses, monthYearById])

  const aid = useCallback(
    (key) => selectedYear ? `annual:${key}:${selectedYear}` : undefined,
    [selectedYear]
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(8)].map((_, i) => <Skeleton key={i} height={100} />)}
      </div>
    )
  }

  if (!awards) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: '1.4rem',
          color: 'rgba(var(--fg-rgb), 0.12)',
          letterSpacing: '0.05em',
          margin: '0 0 8px',
        }}>
          No annual data yet
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '13px', margin: 0 }}>
          Awards appear once film scores are revealed.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Year selector pills — future-proofed */}
      {availableYears.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '4px',
          marginBottom: '20px',
          scrollbarWidth: 'none',
        }}>
          {availableYears.map(y => {
            const active = selectedYear === y
            return (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px',
                  borderRadius: '20px',
                  border: active ? '1px solid rgba(var(--fg-rgb), 0.15)' : '1px solid rgba(var(--fg-rgb), 0.07)',
                  background: active ? 'rgba(var(--fg-rgb), 0.1)' : 'rgba(var(--fg-rgb), 0.03)',
                  color: active ? 'var(--text-strong)' : 'var(--text-faint)',
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {y}
              </button>
            )
          })}
        </div>
      )}

      {/* Section heading */}
      <p style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.15rem',
        letterSpacing: '0.08em',
        color: 'rgba(var(--fg-rgb), 0.35)',
        margin: '0 0 14px',
      }}>
        {selectedYear} Season in Review
      </p>

      {/* 1. Year at a glance */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '10px',
      }}>
        <StatMiniCard label="Films Watched" value={awards.totalFilms} />
        <StatMiniCard label="Scores Cast" value={awards.totalScoresCast} />
        <StatMiniCard label="Club Avg" value={fmt(awards.clubAvg)} onClick={() => navigate('/stats?tab=club')} />
        <StatMiniCard label="In the Vault" value={awards.vaultCount} onClick={() => navigate('/films?tab=The Vault')} />
      </div>

      {/* Note if partial year */}
      {awards.totalFilms < 20 && (
        <p style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          color: 'var(--hairline)',
          letterSpacing: '0.1em',
          margin: '0 0 14px',
        }}>
          * Partial year data — results will update as more films are scored
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* 2. Film of the Year — hero card */}
        <BigPosterCard
          emoji="🏆"
          label="Film of the Year"
          movie={awards.filmOfYear}
          avgScore={awards.filmOfYear ? awards.movieAvgScore[awards.filmOfYear.id] : null}
          noData={!awards.filmOfYear}
          onClick={() => onFilm?.(awards.filmOfYear)}
          awardId={aid('film_of_year')}
        />

        {/* 3. Worst Film of the Year — hero card */}
        <BigPosterCard
          emoji="💀"
          label="Worst Film of the Year"
          movie={awards.worstFilmOfYear}
          avgScore={awards.worstFilmOfYear ? awards.movieAvgScore[awards.worstFilmOfYear.id] : null}
          noData={!awards.worstFilmOfYear || awards.worstFilmOfYear?.id === awards.filmOfYear?.id}
          onClick={() => onFilm?.(awards.worstFilmOfYear)}
          awardId={aid('worst_film_of_year')}
        />

        {/* 4. Picker of the Year */}
        <AwardCard
          emoji="🎬"
          label="Picker of the Year"
          winner={awards.pickerOfYear?.name}
          metric={
            awards.pickerOfYear
              ? `avg ${fmt(awards.pickerOfYearAvg)} across ${awards.pickerOfYearCount} pick${awards.pickerOfYearCount !== 1 ? 's' : ''}`
              : null
          }
          noData={!awards.pickerOfYear}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.pickerOfYear)}
          awardId={aid('picker_of_year')}
        />

        {/* 5. Harshest Critic */}
        <AwardCard
          emoji="😤"
          label="Harshest Critic of the Year"
          winner={awards.harshestCritic?.name}
          metric={awards.harshestCritic ? `avg score given: ${fmt(awards.harshestCriticAvg)}` : null}
          noData={!awards.harshestCritic}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.harshestCritic)}
          awardId={aid('annual_harshest')}
        />

        {/* 6. Most Generous */}
        <AwardCard
          emoji="😊"
          label="Most Generous of the Year"
          winner={awards.mostGenerous?.name}
          metric={awards.mostGenerous ? `avg score given: ${fmt(awards.mostGenerousAvg)}` : null}
          noData={!awards.mostGenerous}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.mostGenerous)}
          awardId={aid('annual_generous')}
        />

        {/* 7. Most Divisive Film */}
        <AwardCard
          emoji="🔥"
          label="Most Divisive Film of the Year"
          winner={awards.mostDivisiveFilm?.title}
          metric={awards.mostDivisiveFilm
            ? `Std dev: ${fmt(stddev(awards.scoresByMovie[awards.mostDivisiveFilm.id]))}`
            : null}
          posterUrl={awards.mostDivisiveFilm?.poster_url}
          posterTitle={awards.mostDivisiveFilm?.title}
          noData={!awards.mostDivisiveFilm}
          winnerClickable
          onWinnerClick={() => onFilm?.(awards.mostDivisiveFilm)}
          awardId={aid('annual_divisive')}
        />

        {/* 8. The Oracle */}
        <AwardCard
          emoji="🎯"
          label="The Oracle 2026"
          winner={awards.oracleOfYear?.name}
          metric={awards.oracleOfYear ? `avg delta: ±${fmt(awards.oracleBestDelta)}` : null}
          noData={!awards.oracleOfYear}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.oracleOfYear)}
          awardId={aid('annual_oracle')}
        />

        {/* 9. Most Consistent */}
        <AwardCard
          emoji="🎚️"
          label="Most Consistent"
          winner={awards.mostConsistent?.name}
          metric={awards.mostConsistent ? `score spread: ±${fmt(awards.mostConsistentSd)}` : null}
          noData={!awards.mostConsistent}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.mostConsistent)}
          awardId={aid('annual_most_consistent')}
        />

        {/* 10. The Wildcard */}
        <AwardCard
          emoji="🎭"
          label="The Wildcard"
          winner={awards.wildcard?.name}
          metric={awards.wildcard ? `avg deviation: ±${fmt(awards.wildcardHighest)}` : null}
          noData={!awards.wildcard}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.wildcard)}
          awardId={aid('annual_wildcard')}
        />

        {/* 11. Master of Disguise */}
        <AwardCard
          emoji="🥸"
          label="Master of Disguise"
          winner={awards.masterOfDisguise?.name}
          metric={awards.masterOfDisguise ? `guessed right ${Math.round(awards.masterOfDisguiseRate * 100)}% of the time` : null}
          noData={!awards.masterOfDisguise}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.masterOfDisguise)}
          awardId={aid('annual_master_of_disguise')}
        />

        {/* 12. Most Evolved (activates once the year spans ≥ 8 months) */}
        <AwardCard
          emoji="🦋"
          label="Most Evolved"
          winner={awards.mostEvolved?.name}
          metric={awards.mostEvolved ? `avg shift: ±${fmt(awards.mostEvolvedDelta)}` : null}
          noData={!awards.mostEvolved}
          winnerClickable
          onWinnerClick={() => onMember?.(awards.mostEvolved)}
          awardId={aid('annual_most_evolved')}
        />
      </div>
    </div>
  )
}

// ─── Deep-link highlight hook ────────────────────────────────────────────────
// After the target tab renders, find the card with data-award-id matching the
// deep-link and scroll it into view + briefly highlight it.

function useAwardDeepLink(activeTab, loading, deepLink) {
  const highlightRef = useRef(null) // tracks the highlight timeout

  useEffect(() => {
    if (!deepLink || loading) return
    // Give the tab content a moment to render and the sub-tab to auto-select
    const timer = setTimeout(() => {
      if (!deepLink.key || !deepLink.scope) return
      const ref = deepLink.ref ?? ''
      const id = `${deepLink.scope}:${deepLink.key}:${ref}`
      const el = document.querySelector(`[data-award-id="${id}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Flash highlight
      el.style.transition = 'box-shadow 0.2s ease, outline 0.2s ease'
      el.style.outline = '2px solid var(--accent, rgba(var(--fg-rgb), 0.4))'
      el.style.outlineOffset = '2px'
      if (highlightRef.current) clearTimeout(highlightRef.current)
      highlightRef.current = setTimeout(() => {
        el.style.outline = ''
        el.style.outlineOffset = ''
        highlightRef.current = null
      }, 1800)
    }, 300)
    return () => clearTimeout(timer)
  }, [activeTab, loading, deepLink])

  useEffect(() => () => { if (highlightRef.current) clearTimeout(highlightRef.current) }, [])
}

// Map URL scope param → tab label
const SCOPE_TO_TAB = {
  monthly: 'Monthly',
  season: 'Season',
  annual: 'Annual',
  alltime: 'All-Time',
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Monthly', 'Season', 'Annual', 'All-Time']

export default function Awards() {
  const location = useLocation()

  // Parse deep-link params once on mount
  const deepLink = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const scope = params.get('scope')
    const key = params.get('key')
    const ref = params.get('ref') ?? ''
    if (!scope || !key) return null
    return { scope, key, ref }
  }, [location.search])

  const initialTab = useMemo(() => {
    if (deepLink?.scope) return SCOPE_TO_TAB[deepLink.scope] ?? 'Monthly'
    return 'Monthly'
  }, [deepLink])

  const [activeTab, setActiveTab] = useState(initialTab)
  const [selectedMovie, setSelectedMovie] = useState(null)

  // Clicking a film title/poster opens the shared film overlay.
  const onFilm = (movie) => { if (movie?.id) setSelectedMovie(movie) }
  const { openMember } = useMemberOverlay()
  // Clicking a member name opens their profile as an overlay.
  const onMember = (user) => { if (user?.id) openMember(user.id) }

  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState([])
  const [months, setMonths] = useState([])
  const [movies, setMovies] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [users, setUsers] = useState([])
  const [guesses, setGuesses] = useState([]) // picker_guesses (for Master of Disguise)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [
        { data: seasonsData },
        { data: monthsData },
        { data: moviesData },
        { data: ratingsData },
        { data: usersData },
        { data: guessesData },
      ] = await Promise.all([
        supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: false }),
        supabase.from('months').select('id, season_id, month_year, status').order('month_year', { ascending: true }),
        supabase.from('movies_safe').select('id, month_id, title, poster_url, year_released, director, genre, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id').eq('scores_revealed', true),
        supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at'),
        supabase.from('users').select('id, name, email, role, joined_at, is_active').eq('is_active', true),
        supabase.from('picker_guesses').select('movie_id, guessing_user_id, guessed_user_id'),
      ])

      const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
      const filteredUsers = (usersData ?? []).filter(u => u.email !== TEST_EMAIL)
      const testUserIds = new Set(
        (usersData ?? []).filter(u => u.email === TEST_EMAIL).map(u => u.id)
      )
      const filteredRatings = (ratingsData ?? []).filter(r => !testUserIds.has(r.user_id))

      setSeasons(seasonsData ?? [])
      setMonths(monthsData ?? [])
      setMovies(moviesData ?? [])
      setAllRatings(filteredRatings)
      setUsers(filteredUsers)
      setGuesses((guessesData ?? []).filter(g => !testUserIds.has(g.guessing_user_id)))
      setLoading(false)
    }

    fetchAll()
  }, [])

  // Scroll + highlight the target award card after tab + sub-tab resolve
  useAwardDeepLink(activeTab, loading, deepLink)

  return (
    <div style={{
      background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
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
            color: 'var(--hairline)',
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
            color: 'var(--text-strong)',
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
          background: 'rgba(var(--fg-rgb), 0.04)',
          border: '1px solid rgba(var(--fg-rgb), 0.07)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: '1 0 auto',
                padding: '8px 12px',
                borderRadius: '9px',
                border: 'none',
                background: activeTab === tab ? 'rgba(var(--fg-rgb), 0.09)' : 'transparent',
                color: activeTab === tab ? 'var(--text-strong)' : 'var(--text-faint)',
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
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
              onFilm={onFilm}
              onMember={onMember}
              deepLink={deepLink?.scope === 'monthly' ? deepLink : null}
            />
          )}
          {activeTab === 'Season' && (
            <SeasonTab
              seasons={seasons}
              months={months}
              movies={movies}
              allRatings={allRatings}
              users={users}
              loading={loading}
              onFilm={onFilm}
              onMember={onMember}
              deepLink={deepLink?.scope === 'season' ? deepLink : null}
            />
          )}
          {activeTab === 'Annual' && (
            <AnnualTab
              movies={movies}
              allRatings={allRatings}
              users={users}
              months={months}
              guesses={guesses}
              loading={loading}
              onFilm={onFilm}
              onMember={onMember}
              deepLink={deepLink?.scope === 'annual' ? deepLink : null}
            />
          )}
          {activeTab === 'All-Time' && (
            <AllTimeTab
              movies={movies}
              allRatings={allRatings}
              users={users}
              guesses={guesses}
              loading={loading}
              onFilm={onFilm}
              onMember={onMember}
            />
          )}
        </div>
      </div>

      {/* Shared film overlay (opened by clicking a film title) */}
      <FilmDetailOverlay movie={selectedMovie} onClose={() => setSelectedMovie(null)} />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
