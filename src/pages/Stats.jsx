import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr) {
  if (arr.length < 2) return null
  const mean = avg(arr)
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ style = {}, className = '' }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', ...style }}
    />
  )
}

// ─── Glass card ─────────────────────────────────────────────────────────────

function GlassCard({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '14px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Section label ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p style={{
      fontFamily: "'DM Mono',monospace",
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: '#374151',
      margin: '0 0 12px',
    }}>
      {children}
    </p>
  )
}

// ─── Stat Card (small) ───────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <GlassCard style={{ padding: '14px 16px' }}>
      <p style={{
        fontFamily: "'DM Mono',monospace",
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: '#374151',
        margin: '0 0 6px',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.8rem',
        color: 'white',
        letterSpacing: '0.04em',
        lineHeight: 1,
        margin: 0,
      }}>
        {value}
      </p>
    </GlassCard>
  )
}

// ─── Film row card ───────────────────────────────────────────────────────────

function FilmRowCard({ movie, label, sublabel }) {
  return (
    <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
      {/* Poster */}
      <div style={{
        flexShrink: 0, width: '48px', height: '68px',
        borderRadius: '7px', overflow: 'hidden',
        background: '#1a1b25',
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${movie.poster_url}`}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '13px' }}>
              {initials(movie.title)}
            </span>
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans',sans-serif",
          color: 'white', fontWeight: 500,
          fontSize: '14px', margin: '0 0 4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {movie.title}
        </p>
        <p style={{
          fontFamily: "'DM Mono',monospace",
          color: '#6b7280', fontSize: '11px', margin: 0,
        }}>
          {sublabel}
        </p>
      </div>
      {/* Label */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif",
          color: 'var(--accent)',
          fontSize: '1.3rem',
          letterSpacing: '0.04em',
          margin: 0, lineHeight: 1,
        }}>
          {label}
        </p>
      </div>
    </GlassCard>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ movies, ratings, users, loading }) {
  const stats = useMemo(() => {
    if (!movies.length) return null

    const revealed = movies.filter(m => m.scores_revealed)
    const allScores = ratings.filter(r => r.score != null).map(r => Number(r.score))
    const clubAvg = avg(allScores)

    // Build per-movie score arrays
    const movieScores = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!movieScores[r.movie_id]) movieScores[r.movie_id] = []
      movieScores[r.movie_id].push(Number(r.score))
    }

    // Compute avg for each movie (fallback to historical)
    const movieAvg = (m) => {
      const sc = movieScores[m.id]
      if (sc && sc.length >= 1) return avg(sc)
      return m.historical_avg_score ? Number(m.historical_avg_score) : null
    }

    // Vault films (avg >= 8.5)
    const vault = revealed.filter(m => {
      const a = movieAvg(m)
      return a != null && a >= 8.5
    }).map(m => ({ ...m, _avg: movieAvg(m) }))
      .sort((a, b) => b._avg - a._avg)

    // Films with enough scores for statistical calculations
    const scoredFilms = revealed.filter(m => (movieScores[m.id] || []).length >= 3)

    // Most divisive (highest stddev)
    let mostDivisive = null
    let maxSd = -1
    for (const m of scoredFilms) {
      const sd = stddev(movieScores[m.id])
      if (sd != null && sd > maxSd) { maxSd = sd; mostDivisive = m }
    }

    // Most unanimous (lowest stddev)
    let mostUnanimous = null
    let minSd = Infinity
    for (const m of scoredFilms) {
      const sd = stddev(movieScores[m.id])
      if (sd != null && sd < minSd) { minSd = sd; mostUnanimous = m }
    }

    // Highest rated
    const ratedFilms = revealed.filter(m => movieAvg(m) != null)
    let highest = null, lowest = null
    let maxA = -Infinity, minA = Infinity
    for (const m of ratedFilms) {
      const a = movieAvg(m)
      if (a > maxA) { maxA = a; highest = m }
      // lowest: need at least 2 scores
      const sc = movieScores[m.id] || []
      if (sc.length >= 2 && a < minA) { minA = a; lowest = m }
    }

    // Member averages
    const memberScores = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!memberScores[r.user_id]) memberScores[r.user_id] = []
      memberScores[r.user_id].push(Number(r.score))
    }
    const memberAvgs = users
      .filter(u => u.is_active !== false)
      .map(u => ({
        ...u,
        avgScore: avg(memberScores[u.id] || []),
        count: (memberScores[u.id] || []).length,
      }))
      .filter(u => u.avgScore != null)
      .sort((a, b) => b.avgScore - a.avgScore)

    return {
      totalFilms: revealed.length,
      totalScores: allScores.length,
      clubAvg,
      vault,
      mostDivisive: mostDivisive ? {
        movie: mostDivisive,
        sd: maxSd,
        low: Math.min(...movieScores[mostDivisive.id]),
        high: Math.max(...movieScores[mostDivisive.id]),
        avgScore: movieAvg(mostDivisive),
      } : null,
      mostUnanimous: mostUnanimous ? {
        movie: mostUnanimous,
        sd: minSd,
        low: Math.min(...movieScores[mostUnanimous.id]),
        high: Math.max(...movieScores[mostUnanimous.id]),
        avgScore: movieAvg(mostUnanimous),
      } : null,
      highest: highest ? { movie: highest, avgScore: maxA } : null,
      lowest: lowest ? { movie: lowest, avgScore: minA } : null,
      memberAvgs,
      movieScores,
      movieAvg,
    }
  }, [movies, ratings, users])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Stat cards skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Skeleton style={{ height: '72px' }} />
          <Skeleton style={{ height: '72px' }} />
          <Skeleton style={{ gridColumn: '1 / -1', height: '72px' }} />
        </div>
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
        <Skeleton style={{ height: '90px' }} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px' }}>
        No data yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <StatCard label="Total Films" value={stats.totalFilms} />
        <StatCard label="Scores Cast" value={stats.totalScores} />
        <div style={{ gridColumn: '1 / -1' }}>
          <StatCard label="Club Average Score" value={fmt(stats.clubAvg)} />
        </div>
      </div>

      {/* The Vault */}
      <div>
        <SectionLabel>The Vault — avg ≥ 8.5</SectionLabel>
        {stats.vault.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>
            No films have reached the Vault yet.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {stats.vault.map(m => (
              <div key={m.id} style={{ flexShrink: 0, width: '112px' }}>
                <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#1a1b25', aspectRatio: '2/3' }}>
                  {m.poster_url ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${m.poster_url}`}
                      alt={m.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '16px' }}>
                        {initials(m.title)}
                      </span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
                    <span style={{
                      background: 'var(--accent)',
                      fontFamily: "'DM Mono',monospace",
                      fontSize: '10px',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      fontWeight: 500,
                    }}>
                      {fmt(m._avg)}
                    </span>
                  </div>
                </div>
                <p style={{
                  marginTop: '6px',
                  fontFamily: "'DM Sans',sans-serif",
                  color: '#9ca3af',
                  fontSize: '11px',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {m.title}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Most Divisive */}
      <div>
        <SectionLabel>Most Divisive Film</SectionLabel>
        {stats.mostDivisive ? (
          <FilmRowCard
            movie={stats.mostDivisive.movie}
            label={`${fmt(stats.mostDivisive.avgScore)}`}
            sublabel={`Std dev: ${fmt(stats.mostDivisive.sd)} · Low: ${fmt(stats.mostDivisive.low)} · High: ${fmt(stats.mostDivisive.high)}`}
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>
            Need at least 3 scores per film.
          </p>
        )}
      </div>

      {/* Most Unanimous */}
      <div>
        <SectionLabel>Most Unanimous Film</SectionLabel>
        {stats.mostUnanimous ? (
          <FilmRowCard
            movie={stats.mostUnanimous.movie}
            label={`${fmt(stats.mostUnanimous.avgScore)}`}
            sublabel={`Std dev: ${fmt(stats.mostUnanimous.sd)} · Low: ${fmt(stats.mostUnanimous.low)} · High: ${fmt(stats.mostUnanimous.high)}`}
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>
            Need at least 3 scores per film.
          </p>
        )}
      </div>

      {/* Highest Rated */}
      <div>
        <SectionLabel>Highest Rated Film</SectionLabel>
        {stats.highest ? (
          <FilmRowCard
            movie={stats.highest.movie}
            label={fmt(stats.highest.avgScore)}
            sublabel={`Avg of ${(stats.movieScores[stats.highest.movie.id] || []).length} score(s)`}
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>No data.</p>
        )}
      </div>

      {/* Lowest Rated */}
      <div>
        <SectionLabel>Lowest Rated Film</SectionLabel>
        {stats.lowest ? (
          <FilmRowCard
            movie={stats.lowest.movie}
            label={fmt(stats.lowest.avgScore)}
            sublabel={`Avg of ${(stats.movieScores[stats.lowest.movie.id] || []).length} score(s)`}
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>Need at least 2 scores per film.</p>
        )}
      </div>

      {/* Member Averages */}
      <div>
        <SectionLabel>Member Avg Scores</SectionLabel>
        {stats.memberAvgs.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>No ratings yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {stats.memberAvgs.map(u => (
              <GlassCard key={u.id} style={{ flexShrink: 0, padding: '14px 16px', textAlign: 'center', minWidth: '90px' }}>
                {/* Avatar */}
                <div style={{
                  width: '40px', height: '40px',
                  borderRadius: '50%',
                  border: '2px solid var(--accent)',
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 8px',
                }}>
                  <span style={{
                    fontFamily: "'Bebas Neue',sans-serif",
                    color: 'var(--accent)',
                    fontSize: '14px',
                    letterSpacing: '0.04em',
                  }}>
                    {initials(u.name)}
                  </span>
                </div>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif",
                  color: '#9ca3af', fontSize: '11px',
                  margin: '0 0 4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '80px',
                }}>
                  {u.name.split(' ')[0]}
                </p>
                <p style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  color: 'white', fontSize: '1.3rem',
                  letterSpacing: '0.04em', lineHeight: 1,
                  margin: 0,
                }}>
                  {fmt(u.avgScore)}
                </p>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Me Tab ───────────────────────────────────────────────────────────────────

function MeTab({ movies, ratings, loading }) {
  const [showAll, setShowAll] = useState(false)

  const stats = useMemo(() => {
    if (!movies.length && !ratings.length) return null

    // Build movie lookup
    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    const scored = ratings.filter(r => r.score != null)
    const scores = scored.map(r => Number(r.score))
    const excitements = ratings
      .filter(r => r.pre_watch_excitement != null)
      .map(r => Number(r.pre_watch_excitement))
    const recommendations = ratings.filter(r => r.recommend_outside_club != null)
    const wouldRecommend = recommendations.filter(r => r.recommend_outside_club === true)

    // Score distribution buckets
    const buckets = [
      { label: '0–1', min: 0, max: 1 },
      { label: '1–2', min: 1, max: 2 },
      { label: '2–3', min: 2, max: 3 },
      { label: '3–4', min: 3, max: 4 },
      { label: '4–5', min: 4, max: 5 },
      { label: '5–6', min: 5, max: 6 },
      { label: '6–7', min: 6, max: 7 },
      { label: '7–8', min: 7, max: 8 },
      { label: '8–9', min: 8, max: 9 },
      { label: '9–10', min: 9, max: 10.01 },
    ]
    const bucketCounts = buckets.map(b => ({
      label: b.label,
      count: scores.filter(s => s >= b.min && s < b.max).length,
    }))

    // Top 5 and bottom 5
    const scoredWithMovies = scored
      .map(r => ({ ...r, movie: movieMap[r.movie_id] }))
      .filter(r => r.movie)
      .sort((a, b) => Number(b.score) - Number(a.score))
    const top5 = scoredWithMovies.slice(0, 5)
    const bottom5 = [...scoredWithMovies].sort((a, b) => Number(a.score) - Number(b.score)).slice(0, 5)

    // Excitement vs final
    const excVsFinal = scored
      .map(r => ({
        ...r,
        movie: movieMap[r.movie_id],
        excitement: r.pre_watch_excitement != null ? Number(r.pre_watch_excitement) : null,
        finalScore: Number(r.score),
      }))
      .filter(r => r.movie)
      .sort((a, b) => b.finalScore - a.finalScore)

    return {
      filmCount: scored.length,
      avgScore: avg(scores),
      excitementAvg: avg(excitements),
      recommendPct: recommendations.length > 0 ? (wouldRecommend.length / recommendations.length) * 100 : null,
      bucketCounts,
      top5,
      bottom5,
      excVsFinal,
    }
  }, [movies, ratings])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: '72px' }} />)}
        </div>
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '200px' }} />
        <Skeleton style={{ height: '200px' }} />
      </div>
    )
  }

  if (!stats || stats.filmCount === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px' }}>
        You haven't scored any films yet.
      </div>
    )
  }

  const maxBucket = Math.max(...stats.bucketCounts.map(b => b.count), 1)

  const visibleExcVsFinal = showAll ? stats.excVsFinal : stats.excVsFinal.slice(0, 15)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Header row — 4 mini stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <StatCard label="Films Scored" value={stats.filmCount} />
        <StatCard label="Avg Score" value={fmt(stats.avgScore)} />
        <StatCard label="Excitement Avg" value={stats.excitementAvg != null ? fmt(stats.excitementAvg) : '—'} />
        <StatCard
          label="Would Recommend"
          value={stats.recommendPct != null ? `${Math.round(stats.recommendPct)}%` : '—'}
        />
      </div>

      {/* Score Distribution Bar Chart */}
      <div>
        <SectionLabel>Score Distribution</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px' }}>
            {stats.bucketCounts.map((b, i) => {
              const barHeight = b.count === 0 ? 2 : Math.max(4, (b.count / maxBucket) * 88)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  {/* Count label */}
                  <span style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '9px',
                    color: b.count > 0 ? '#9ca3af' : 'transparent',
                    lineHeight: 1,
                  }}>
                    {b.count > 0 ? b.count : ''}
                  </span>
                  {/* Bar */}
                  <div style={{
                    width: '100%',
                    height: `${barHeight}px`,
                    background: b.count > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                  }} />
                </div>
              )
            })}
          </div>
          {/* X-axis labels */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            {stats.bucketCounts.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <span style={{
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '7px',
                  color: '#374151',
                  display: 'block',
                  lineHeight: 1.2,
                  wordBreak: 'break-all',
                }}>
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Top 5 */}
      <div>
        <SectionLabel>Top 5 Films</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.top5.map(r => (
            <MiniFilmCard key={r.id} movie={r.movie} score={r.score} />
          ))}
        </div>
      </div>

      {/* Bottom 5 */}
      <div>
        <SectionLabel>Bottom 5 Films</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.bottom5.map(r => (
            <MiniFilmCard key={r.id} movie={r.movie} score={r.score} />
          ))}
        </div>
      </div>

      {/* Excitement vs Final */}
      <div>
        <SectionLabel>Excitement vs. Final Score</SectionLabel>
        <GlassCard style={{ padding: '4px 0' }}>
          {visibleExcVsFinal.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              borderBottom: i < visibleExcVsFinal.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <p style={{
                flex: 1, minWidth: 0,
                fontFamily: "'DM Sans',sans-serif",
                color: '#d1d5db', fontSize: '13px',
                margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.movie.title}
              </p>
              {r.excitement != null && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '1rem',
                  letterSpacing: '0.04em',
                  color: '#fbbf24',
                  minWidth: '36px',
                  textAlign: 'right',
                }}>
                  {fmt(r.excitement)}
                </span>
              )}
              {r.excitement == null && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  color: '#374151',
                  minWidth: '36px',
                  textAlign: 'right',
                }}>
                  —
                </span>
              )}
              <span style={{
                flexShrink: 0,
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '1.2rem',
                letterSpacing: '0.04em',
                color: 'var(--accent)',
                minWidth: '40px',
                textAlign: 'right',
              }}>
                {fmt(r.finalScore)}
              </span>
            </div>
          ))}
        </GlassCard>
        {stats.excVsFinal.length > 15 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: '#6b7280',
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {showAll ? 'Show less' : `Show all ${stats.excVsFinal.length} films`}
          </button>
        )}
        {stats.excVsFinal.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: '#6b7280' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#fbbf24' }} />
              Excitement
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: '#6b7280' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent)' }} />
              Final
            </span>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Mini Film Card (for Top/Bottom 5) ───────────────────────────────────────

function MiniFilmCard({ movie, score }) {
  return (
    <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
      <div style={{
        flexShrink: 0, width: '40px', height: '56px',
        borderRadius: '6px', overflow: 'hidden',
        background: '#1a1b25',
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '11px' }}>
              {initials(movie.title)}
            </span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans',sans-serif",
          color: 'white', fontWeight: 500,
          fontSize: '13px', margin: '0 0 3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {movie.title}
        </p>
        <p style={{
          fontFamily: "'DM Mono',monospace",
          color: '#4b5563', fontSize: '11px', margin: 0,
        }}>
          {movie.year_released ?? ''}
        </p>
      </div>
      <span style={{
        flexShrink: 0,
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: '1.4rem',
        letterSpacing: '0.04em',
        color: 'var(--accent)',
        lineHeight: 1,
      }}>
        {fmt(score)}
      </span>
    </GlassCard>
  )
}

// ─── Pure calculation helpers (also used by tests) ──────────────────────────

// agreementScore: avg absolute difference between two score arrays aligned by film
// ratingsA and ratingsB are arrays of { movie_id, score }
export function calcAgreementScore(ratingsA, ratingsB) {
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

// genreBreakdown: count films per genre from an array of genre strings
// each entry may be a comma-separated list like "Drama, Thriller"
export function calcGenreBreakdown(genres) {
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

// scoringStreaks: for each member, count consecutive months (most recent first)
// in which they scored at least one film.
// monthOrder: sorted array of month_ids oldest→newest
// ratingsByUser: { userId: Set<month_id> }  (months in which they have a score)
export function calcScoringStreaks(userIds, monthOrder, ratingsByUser) {
  const result = {}
  for (const uid of userIds) {
    const scoredMonths = ratingsByUser[uid] || new Set()
    let streak = 0
    // Walk backwards through months (newest first)
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

// headToHeadRecord: for each film both users scored, determine who won
// ratingsA and ratingsB are arrays of { movie_id, score }
export function calcHeadToHeadRecord(ratingsA, ratingsB) {
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

// ─── Members Tab ─────────────────────────────────────────────────────────────

function MembersTab({ movies, ratings, users, loading }) {
  const stats = useMemo(() => {
    if (!users.length) return null

    // Build movie lookup
    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    // Group ratings by user
    const byUser = {}
    for (const r of ratings) {
      if (!byUser[r.user_id]) byUser[r.user_id] = []
      byUser[r.user_id].push(r)
    }

    return users
      .filter(u => u.is_active !== false)
      .map(u => {
        const userRatings = byUser[u.id] || []
        const scored = userRatings.filter(r => r.score != null)
        const scores = scored.map(r => Number(r.score))
        const avgScore = avg(scores)

        // Sort by score desc for highest/lowest
        const scoredWithMovies = scored
          .map(r => ({ ...r, movie: movieMap[r.movie_id] }))
          .filter(r => r.movie)
          .sort((a, b) => Number(b.score) - Number(a.score))

        const highest = scoredWithMovies[0] || null
        const lowest = scoredWithMovies[scoredWithMovies.length - 1] || null

        // Recommend %
        const recAnswered = userRatings.filter(r => r.recommend_outside_club != null)
        const recYes = recAnswered.filter(r => r.recommend_outside_club === true)
        const recommendPct = recAnswered.length > 0
          ? (recYes.length / recAnswered.length) * 100
          : null

        // Avg excitement
        const excitements = userRatings
          .filter(r => r.pre_watch_excitement != null)
          .map(r => Number(r.pre_watch_excitement))
        const avgExcitement = avg(excitements)

        return {
          ...u,
          filmCount: scored.length,
          avgScore,
          highest,
          lowest,
          recommendPct,
          avgExcitement,
        }
      })
      .filter(u => u.avgScore != null)
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [movies, ratings, users])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[...Array(5)].map((_, i) => <Skeleton key={i} style={{ height: '160px' }} />)}
      </div>
    )
  }

  if (!stats || stats.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px' }}>
        No member data yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {stats.map(u => (
        <GlassCard key={u.id} style={{ padding: '18px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            {/* Initials avatar */}
            <div style={{
              flexShrink: 0,
              width: '44px', height: '44px',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: "'Bebas Neue',sans-serif",
                color: 'var(--accent)',
                fontSize: '15px',
                letterSpacing: '0.04em',
              }}>
                {initials(u.name)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 700,
                color: 'white',
                fontSize: '15px',
                margin: '0 0 2px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u.name}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace",
                color: '#4b5563',
                fontSize: '11px',
                margin: 0,
              }}>
                {u.filmCount} film{u.filmCount !== 1 ? 's' : ''} scored
              </p>
            </div>
            {/* Big avg score */}
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <p style={{
                fontFamily: "'DM Mono',monospace",
                color: '#4b5563',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                margin: '0 0 2px',
              }}>
                Avg
              </p>
              <p style={{
                fontFamily: "'Bebas Neue',sans-serif",
                color: 'var(--accent)',
                fontSize: '2rem',
                letterSpacing: '0.04em',
                lineHeight: 1,
                margin: 0,
              }}>
                {fmt(u.avgScore)}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '9px',
              padding: '10px 12px',
            }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151', margin: '0 0 4px' }}>
                Excitement Avg
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'white', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {u.avgExcitement != null ? fmt(u.avgExcitement) : '—'}
              </p>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '9px',
              padding: '10px 12px',
            }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151', margin: '0 0 4px' }}>
                Would Recommend
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'white', fontSize: '1.3rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {u.recommendPct != null ? `${Math.round(u.recommendPct)}%` : '—'}
              </p>
            </div>
          </div>

          {/* Highest / Lowest */}
          {u.highest && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {u.highest && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151', flexShrink: 0, width: '52px' }}>
                    Highest
                  </span>
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: '#d1d5db', fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.highest.movie.title}
                  </p>
                  <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {fmt(u.highest.score)}
                  </span>
                </div>
              )}
              {u.lowest && u.lowest.id !== u.highest?.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151', flexShrink: 0, width: '52px' }}>
                    Lowest
                  </span>
                  <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: '#d1d5db', fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.lowest.movie.title}
                  </p>
                  <span style={{ flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", color: '#6b7280', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {fmt(u.lowest.score)}
                  </span>
                </div>
              )}
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  )
}

// ─── Club Tab ─────────────────────────────────────────────────────────────────

function formatMonthLabel(monthYear) {
  if (!monthYear) return monthYear
  const d = new Date(monthYear + '-01')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function ClubTab({ movies, ratings, users, loading, monthsById = {} }) {
  const stats = useMemo(() => {
    if (!movies.length) return null

    const movieMap = {}
    for (const m of movies) movieMap[m.id] = m

    // Build month lookup from movies (month_id)
    const monthSet = []
    const monthMovies = {}
    for (const m of movies) {
      if (!m.month_id) continue
      if (!monthMovies[m.month_id]) {
        monthMovies[m.month_id] = []
        monthSet.push(m.month_id)
      }
      monthMovies[m.month_id].push(m)
    }
    // Sort months by id (they're likely sequential UUIDs or ints; use string sort as fallback)
    const sortedMonths = [...new Set(monthSet)].sort()

    // Score over time: avg score per month
    const ratingsByMovie = {}
    for (const r of ratings) {
      if (r.score == null) continue
      if (!ratingsByMovie[r.movie_id]) ratingsByMovie[r.movie_id] = []
      ratingsByMovie[r.movie_id].push(Number(r.score))
    }

    const monthAvgs = sortedMonths.map(mid => {
      const films = monthMovies[mid] || []
      const allScores = []
      for (const m of films) {
        const sc = ratingsByMovie[m.id] || []
        allScores.push(...sc)
        if (!sc.length && m.historical_avg_score) allScores.push(Number(m.historical_avg_score))
      }
      const monthYear = monthsById[mid]?.month_year ?? null
      return { month_id: mid, month_year: monthYear, avgScore: avg(allScores), films }
    }).filter(x => x.avgScore != null)

    // Most active scorer
    const scoreCounts = {}
    for (const r of ratings) {
      if (r.score == null) continue
      scoreCounts[r.user_id] = (scoreCounts[r.user_id] || 0) + 1
    }
    let mostActiveUser = null
    let mostActiveCount = 0
    for (const u of users) {
      const c = scoreCounts[u.id] || 0
      if (c > mostActiveCount) { mostActiveCount = c; mostActiveUser = u }
    }

    // Scoring streaks — months a user scored at least one film
    const ratingsByUser = {}
    for (const r of ratings) {
      if (r.score == null) continue
      const movie = movieMap[r.movie_id]
      if (!movie || !movie.month_id) continue
      if (!ratingsByUser[r.user_id]) ratingsByUser[r.user_id] = new Set()
      ratingsByUser[r.user_id].add(movie.month_id)
    }
    const activeUsers = users.filter(u => u.is_active !== false)
    const streaks = calcScoringStreaks(
      activeUsers.map(u => u.id),
      sortedMonths,
      ratingsByUser,
    )

    // Genre breakdown
    const genres = movies.filter(m => m.genre).map(m => m.genre)
    const genreCounts = calcGenreBreakdown(genres)
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const totalFilmsForGenre = movies.length

    // Excitement vs Reality
    const excitements = ratings
      .filter(r => r.pre_watch_excitement != null)
      .map(r => Number(r.pre_watch_excitement))
    const finalScores = ratings
      .filter(r => r.score != null)
      .map(r => Number(r.score))
    const avgExcitement = avg(excitements)
    const avgFinal = avg(finalScores)

    return {
      monthAvgs,
      mostActiveUser,
      mostActiveCount,
      streaks,
      activeUsers,
      topGenres,
      totalFilmsForGenre,
      avgExcitement,
      avgFinal,
    }
  }, [movies, ratings, users])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Skeleton style={{ height: '220px' }} />
        <Skeleton style={{ height: '80px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '120px' }} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px' }}>
        No club data yet.
      </div>
    )
  }

  const maxMonthAvg = Math.max(...stats.monthAvgs.map(m => m.avgScore), 10)
  const maxGenreCount = stats.topGenres.length > 0 ? stats.topGenres[0][1] : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Score Over Time */}
      <div>
        <SectionLabel>Score Over Time</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          {stats.monthAvgs.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>No monthly data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stats.monthAvgs.map(m => {
                const pct = (m.avgScore / maxMonthAvg) * 100
                return (
                  <div key={m.month_id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontFamily: "'DM Mono',monospace",
                      fontSize: '10px',
                      color: '#6b7280',
                      flexShrink: 0,
                      width: '72px',
                      textAlign: 'right',
                    }}>
                      {m.month_year ? formatMonthLabel(m.month_year) : m.month_id}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, height: '18px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'Bebas Neue',sans-serif",
                      fontSize: '1rem',
                      color: 'white',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                      width: '36px',
                      textAlign: 'right',
                    }}>
                      {fmt(m.avgScore)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Most Active Scorer */}
      <div>
        <SectionLabel>Most Active Scorer</SectionLabel>
        {stats.mostActiveUser ? (
          <GlassCard style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px' }}>
            <div style={{
              flexShrink: 0,
              width: '44px', height: '44px',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '15px', letterSpacing: '0.04em' }}>
                {initials(stats.mostActiveUser.name)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, color: 'white', fontSize: '15px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stats.mostActiveUser.name}
              </p>
              <p style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '11px', margin: 0 }}>
                most scores submitted
              </p>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.mostActiveCount}
              </p>
              <p style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '2px 0 0' }}>
                scores
              </p>
            </div>
          </GlassCard>
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>No scores yet.</p>
        )}
      </div>

      {/* Scoring Streaks */}
      <div>
        <SectionLabel>Scoring Streaks</SectionLabel>
        <GlassCard style={{ padding: '4px 0' }}>
          {stats.activeUsers.map((u, i) => {
            const streak = stats.streaks[u.id] || 0
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 16px',
                borderBottom: i < stats.activeUsers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <div style={{
                  flexShrink: 0,
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  border: '1.5px solid var(--accent)',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '12px', letterSpacing: '0.04em' }}>
                    {initials(u.name)}
                  </span>
                </div>
                <p style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", color: '#d1d5db', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name}
                </p>
                <div style={{
                  flexShrink: 0,
                  background: streak > 0 ? 'rgba(var(--accent-rgb,220,38,38),0.15)' : 'rgba(255,255,255,0.04)',
                  border: streak > 0 ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  borderRadius: '999px',
                  padding: '3px 10px',
                }}>
                  <span style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: streak > 0 ? 'var(--accent)' : '#374151',
                    fontWeight: 500,
                  }}>
                    {streak} mo
                  </span>
                </div>
              </div>
            )
          })}
        </GlassCard>
      </div>

      {/* Genre Breakdown */}
      <div>
        <SectionLabel>Top Genres</SectionLabel>
        <GlassCard style={{ padding: '16px' }}>
          {stats.topGenres.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '13px', margin: 0 }}>No genre data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stats.topGenres.map(([genre, count]) => {
                const pct = (count / maxGenreCount) * 100
                return (
                  <div key={genre} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: '12px',
                      color: '#9ca3af',
                      flexShrink: 0,
                      width: '90px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {genre}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                        opacity: 0.75,
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'DM Mono',monospace",
                      fontSize: '10px',
                      color: '#6b7280',
                      flexShrink: 0,
                      width: '24px',
                      textAlign: 'right',
                    }}>
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Excitement vs Reality */}
      <div>
        <SectionLabel>Excitement vs. Reality</SectionLabel>
        <GlassCard style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#fbbf24', margin: '0 0 6px' }}>
                Avg Excitement
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: '#fbbf24', fontSize: '2.8rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.avgExcitement != null ? fmt(stats.avgExcitement) : '—'}
              </p>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', margin: '0 0 6px' }}>
                Avg Final Score
              </p>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.8rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                {stats.avgFinal != null ? fmt(stats.avgFinal) : '—'}
              </p>
            </div>
          </div>
          {stats.avgExcitement != null && stats.avgFinal != null && (
            <p style={{
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '12px',
              color: '#6b7280',
              textAlign: 'center',
              margin: '14px 0 0',
            }}>
              {stats.avgExcitement > stats.avgFinal
                ? 'We tend to over-hype films before watching.'
                : stats.avgExcitement < stats.avgFinal
                  ? 'Films tend to exceed expectations.'
                  : 'Excitement and scores are perfectly aligned.'}
            </p>
          )}
        </GlassCard>
      </div>

    </div>
  )
}

// ─── Head to Head Tab ────────────────────────────────────────────────────────

function HeadToHeadTab({ movies, ratings, users, loading }) {
  const activeUsers = useMemo(
    () => users.filter(u => u.is_active !== false),
    [users],
  )

  // Default to first two admins (Ryan Miller + Ryan Bey)
  const defaultA = useMemo(() => {
    const admins = activeUsers.filter(u => u.role === 'admin')
    return admins[0] ?? activeUsers[0] ?? null
  }, [activeUsers])

  const defaultB = useMemo(() => {
    const admins = activeUsers.filter(u => u.role === 'admin')
    return admins[1] ?? activeUsers[1] ?? null
  }, [activeUsers])

  const [userA, setUserA] = useState(null)
  const [userB, setUserB] = useState(null)

  // Set defaults once users load
  useEffect(() => {
    if (defaultA && !userA) setUserA(defaultA)
  }, [defaultA])
  useEffect(() => {
    if (defaultB && !userB) setUserB(defaultB)
  }, [defaultB])

  const movieMap = useMemo(() => {
    const map = {}
    for (const m of movies) map[m.id] = m
    return map
  }, [movies])

  const h2h = useMemo(() => {
    if (!userA || !userB) return null
    const ratingsA = ratings.filter(r => r.user_id === userA.id && r.score != null)
    const ratingsB = ratings.filter(r => r.user_id === userB.id && r.score != null)
    const { avg: agreementAvg, count } = calcAgreementScore(ratingsA, ratingsB)
    const record = calcHeadToHeadRecord(ratingsA, ratingsB)

    const avgA = avg(ratingsA.map(r => Number(r.score)))
    const avgB = avg(ratingsB.map(r => Number(r.score)))

    // Films sorted by diff
    const filmsWithMovies = record.films
      .map(f => ({ ...f, movie: movieMap[f.movie_id] }))
      .filter(f => f.movie)

    const mostAgreed = filmsWithMovies.slice(0, 3)
    const mostDisagreed = [...filmsWithMovies].sort((a, b) => b.diff - a.diff).slice(0, 3)

    return {
      agreementAvg,
      sharedCount: count,
      record,
      avgA,
      avgB,
      mostAgreed,
      mostDisagreed,
    }
  }, [userA, userB, ratings, movieMap])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Skeleton style={{ height: '56px' }} />
        <Skeleton style={{ height: '100px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '160px' }} />
        <Skeleton style={{ height: '80px' }} />
      </div>
    )
  }

  if (activeUsers.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px' }}>
        Need at least 2 members.
      </div>
    )
  }

  const MemberPill = ({ selected, onSelect, exclude }) => (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <select
        value={selected?.id ?? ''}
        onChange={e => {
          const u = activeUsers.find(u => u.id === e.target.value)
          if (u) onSelect(u)
        }}
        style={{
          width: '100%',
          appearance: 'none',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px',
          padding: '10px 36px 10px 14px',
          fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600,
          fontSize: '14px',
          color: 'white',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {activeUsers
          .filter(u => u.id !== exclude?.id)
          .map(u => (
            <option key={u.id} value={u.id} style={{ background: '#0a0b10', color: 'white' }}>
              {u.name}
            </option>
          ))}
      </select>
      <span style={{
        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
        color: '#6b7280', pointerEvents: 'none', fontSize: '11px',
      }}>
        ▾
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Member selectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <MemberPill selected={userA} onSelect={setUserA} exclude={userB} />
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: '#374151', flexShrink: 0 }}>
          vs
        </span>
        <MemberPill selected={userB} onSelect={setUserB} exclude={userA} />
      </div>

      {(!h2h || h2h.sharedCount < 3) ? (
        <GlassCard style={{ padding: '28px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px', margin: 0 }}>
            {h2h && h2h.sharedCount > 0
              ? `Only ${h2h.sharedCount} shared score${h2h.sharedCount !== 1 ? 's' : ''} — not enough yet.`
              : 'Not enough shared scores yet.'}
          </p>
        </GlassCard>
      ) : (
        <>
          {/* Agreement score */}
          <div>
            <SectionLabel>Avg Disagreement</SectionLabel>
            <GlassCard style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#9ca3af', fontSize: '13px', margin: '0 0 2px' }}>
                  Avg |score A − score B| across {h2h.sharedCount} shared films
                </p>
                <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: '#374151', margin: 0 }}>
                  Lower = more aligned
                </p>
              </div>
              <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0, flexShrink: 0 }}>
                {fmt(h2h.agreementAvg)}
              </p>
            </GlassCard>
          </div>

          {/* Who scores higher */}
          <div>
            <SectionLabel>Scoring Comparison</SectionLabel>
            <GlassCard style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userA?.name.split(' ')[0]}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {fmt(h2h.avgA)}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'center', paddingBottom: '4px' }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: '#374151' }}>avg</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userB?.name.split(' ')[0]}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'white', fontSize: '2.2rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {fmt(h2h.avgB)}
                  </p>
                </div>
              </div>
              {h2h.avgA != null && h2h.avgB != null && (
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: '#6b7280', margin: 0, textAlign: 'center' }}>
                  {Math.abs(h2h.avgA - h2h.avgB) < 0.005
                    ? 'Identical average scores.'
                    : h2h.avgA > h2h.avgB
                      ? `${userA?.name} scores higher on average.`
                      : `${userB?.name} scores higher on average.`}
                </p>
              )}
            </GlassCard>
          </div>

          {/* Head to head record */}
          <div>
            <SectionLabel>Head to Head Record</SectionLabel>
            <GlassCard style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userA?.name.split(' ')[0]}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.winsA}
                  </p>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151', margin: '0 0 4px' }}>
                    Ties
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: '#6b7280', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.ties}
                  </p>
                </div>
                <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userB?.name.split(' ')[0]}
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'white', fontSize: '2.6rem', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
                    {h2h.record.winsB}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Most agreed on */}
          <div>
            <SectionLabel>Most Agreed On</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {h2h.mostAgreed.map(f => (
                <GlassCard key={f.movie_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'white', fontWeight: 500, fontSize: '13px', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.movie.title}
                    </p>
                    <p style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '10px', margin: 0 }}>
                      {fmt(f.scoreA)} vs {fmt(f.scoreB)}
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: '#22c55e',
                    background: 'rgba(34,197,94,0.1)',
                    padding: '3px 8px',
                    borderRadius: '999px',
                  }}>
                    Δ {fmt(f.diff)}
                  </span>
                </GlassCard>
              ))}
            </div>
          </div>

          {/* Most disagreed on */}
          <div>
            <SectionLabel>Most Disagreed On</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {h2h.mostDisagreed.map(f => (
                <GlassCard key={f.movie_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'white', fontWeight: 500, fontSize: '13px', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.movie.title}
                    </p>
                    <p style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '10px', margin: 0 }}>
                      {fmt(f.scoreA)} vs {fmt(f.scoreB)}
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '11px',
                    color: '#f87171',
                    background: 'rgba(248,113,113,0.1)',
                    padding: '3px 8px',
                    borderRadius: '999px',
                  }}>
                    Δ {fmt(f.diff)}
                  </span>
                </GlassCard>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Overview', 'Me', 'Members', 'Club', 'Head to Head']

export default function Stats() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Overview')

  const TEST_USER_EMAIL = 'i.am.ryan.the.miller@gmail.com'

  // Shared data
  const [movies, setMovies] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [users, setUsers] = useState([])
  const [myRatings, setMyRatings] = useState([])
  const [monthsById, setMonthsById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      setLoading(true)
      const [
        { data: moviesData },
        { data: ratingsData },
        { data: usersData },
        { data: myRatingsData },
        { data: monthsData },
      ] = await Promise.all([
        supabase
          .from('movies_safe')
          .select('id, month_id, title, poster_url, year_released, director, genre, scores_revealed, picker_revealed, historical_avg_score, runtime_minutes'),
        supabase
          .from('ratings')
          .select('id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at'),
        supabase
          .from('users')
          .select('id, name, email, role, joined_at, is_active')
          .eq('is_active', true),
        supabase
          .from('ratings')
          .select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
          .eq('user_id', profile.id),
        supabase
          .from('months')
          .select('id, month_year'),
      ])

      // Build month lookup
      const mById = {}
      for (const m of (monthsData ?? [])) mById[m.id] = m

      // Exclude test user
      const filteredUsers = (usersData ?? []).filter(u => u.email !== TEST_USER_EMAIL)

      setMovies(moviesData ?? [])
      setAllRatings(ratingsData ?? [])
      setUsers(filteredUsers)
      setMyRatings(myRatingsData ?? [])
      setMonthsById(mById)
      setLoading(false)
    }
    load()
  }, [profile])

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
            Stats
          </h1>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex', gap: '4px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px', padding: '4px',
          marginBottom: '24px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flexShrink: 0,
                padding: '8px 12px',
                borderRadius: '9px', border: 'none',
                background: activeTab === tab ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: activeTab === tab ? 'white' : '#4b5563',
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          {activeTab === 'Overview' && (
            <OverviewTab
              movies={movies}
              ratings={allRatings}
              users={users}
              loading={loading}
            />
          )}
          {activeTab === 'Me' && (
            <MeTab
              movies={movies}
              ratings={myRatings}
              loading={loading}
            />
          )}
          {activeTab === 'Members' && (
            <MembersTab
              movies={movies}
              ratings={allRatings}
              users={users}
              loading={loading}
            />
          )}
          {activeTab === 'Club' && (
            <ClubTab
              movies={movies}
              ratings={allRatings}
              users={users}
              loading={loading}
              monthsById={monthsById}
            />
          )}
          {activeTab === 'Head to Head' && (
            <HeadToHeadTab
              movies={movies}
              ratings={allRatings}
              users={users}
              loading={loading}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
