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

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Overview', 'Me']

export default function Stats() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Overview')

  // Shared data
  const [movies, setMovies] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [users, setUsers] = useState([])
  const [myRatings, setMyRatings] = useState([])
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
      ])

      setMovies(moviesData ?? [])
      setAllRatings(ratingsData ?? [])
      setUsers(usersData ?? [])
      setMyRatings(myRatingsData ?? [])
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
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '8px 0',
                borderRadius: '9px', border: 'none',
                background: activeTab === tab ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: activeTab === tab ? 'white' : '#4b5563',
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s ease',
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
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
