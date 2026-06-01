import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDeadline(isoString) {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(isoString))
}

function countdownLabel(isoString) {
  if (!isoString) return null
  const diff = new Date(isoString).getTime() - Date.now()
  if (diff <= 0) return { text: 'PAST DUE', past: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return { text: `${days}d ${hours}h remaining`, past: false }
  if (hours > 0) return { text: `${hours}h remaining`, past: false }
  const mins = Math.floor((diff % 3600000) / 60000)
  return { text: `${mins}m remaining`, past: false }
}

function scoreStatus(rating) {
  if (!rating) return 'excitement'
  if (!rating.pre_watch_excitement) return 'excitement'
  if (!rating.score) return 'final'
  return 'done'
}

function initials(title) {
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
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

// ─── Film Card ───────────────────────────────────────────────────────────────

function FilmCard({ movie, rating, onScorePress }) {
  const status = scoreStatus(rating)

  const ctaLabel = status === 'excitement'
    ? 'Excitement'
    : status === 'final'
      ? 'Score it'
      : `${Number(rating.score).toFixed(2)}`

  const ctaStyle = status === 'done'
    ? { background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }
    : { background: 'var(--accent)', border: 'none', color: 'white' }

  const labelAbove = status === 'excitement'
    ? 'Submit excitement score'
    : status === 'final'
      ? 'Submit final score'
      : 'Scored'

  const labelColor = status === 'done' ? '#4b5563' : '#9ca3af'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px',
      borderRadius: '14px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      width: '100%', boxSizing: 'border-box',
    }}>
      {/* Poster */}
      <div style={{
        flexShrink: 0, width: '48px', height: '68px',
        borderRadius: '7px', overflow: 'hidden',
        background: '#1a1b25',
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w300${movie.poster_url}`}
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
          fontFamily: "'DM Mono',monospace", color: labelColor,
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em',
          margin: '0 0 3px',
        }}>
          {labelAbove}
        </p>
        <p style={{
          fontFamily: "'DM Sans',sans-serif", color: 'white',
          fontWeight: 500, fontSize: '14px',
          margin: '0 0 2px', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {movie.title}
        </p>
        <p style={{
          fontFamily: "'DM Mono',monospace", color: '#374151',
          fontSize: '11px', margin: 0,
        }}>
          {movie.year_released ?? ''}
          {movie.director ? ` · ${movie.director}` : ''}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => status !== 'done' && onScorePress(movie, rating)}
        style={{
          flexShrink: 0,
          fontFamily: status === 'done' ? "'Bebas Neue',sans-serif" : "'DM Sans',sans-serif",
          fontWeight: status === 'done' ? 400 : 600,
          fontSize: status === 'done' ? '1.1rem' : '12px',
          letterSpacing: status === 'done' ? '0.05em' : '0.01em',
          padding: status === 'done' ? '5px 10px' : '7px 12px',
          borderRadius: '8px',
          cursor: status === 'done' ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          transition: 'opacity 0.15s ease',
          ...ctaStyle,
        }}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

// ─── Films Tab ───────────────────────────────────────────────────────────────

function FilmsTab({ movies, ratingsMap, loading, onScorePress }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: '92px' }} />)}
      </div>
    )
  }

  if (!movies.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 0',
        fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px',
      }}>
        No active films this month.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {movies.map(m => (
        <FilmCard
          key={m.id}
          movie={m}
          rating={ratingsMap[m.id] ?? null}
          onScorePress={onScorePress}
        />
      ))}
    </div>
  )
}

// ─── Deadlines Tab ───────────────────────────────────────────────────────────

function DeadlinesTab({ movies, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: '72px' }} />)}
      </div>
    )
  }

  if (!movies.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 0',
        fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px',
      }}>
        No deadlines to show.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {movies.map(m => {
        const cd = countdownLabel(m.scoring_deadline)
        return (
          <div key={m.id} style={{
            padding: '14px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.025)',
            border: `1px solid ${cd?.past ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
            width: '100%', boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif", color: 'white',
                  fontWeight: 500, fontSize: '14px', margin: '0 0 4px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.title}
                </p>
                <p style={{
                  fontFamily: "'DM Mono',monospace", color: '#4b5563',
                  fontSize: '11px', margin: 0, lineHeight: 1.4,
                }}>
                  {formatDeadline(m.scoring_deadline)}
                </p>
              </div>
              {cd && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: cd.past ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                  color: cd.past ? '#ef4444' : '#6b7280',
                  whiteSpace: 'nowrap',
                  marginTop: '2px',
                }}>
                  {cd.text}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Upcoming Tab ─────────────────────────────────────────────────────────────

function UpcomingTab() {
  return (
    <div style={{
      textAlign: 'center', padding: '56px 0',
    }}>
      <p style={{
        fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem',
        color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em',
        margin: '0 0 8px',
      }}>
        Coming Soon
      </p>
      <p style={{
        fontFamily: "'DM Sans',sans-serif", color: '#374151',
        fontSize: '14px', margin: 0,
      }}>
        Your pick for next month goes here.
      </p>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Films', 'Deadlines', 'Upcoming']

export default function ThisMonth() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Films')
  const [loading, setLoading] = useState(true)
  const [movies, setMovies] = useState([])
  const [ratingsMap, setRatingsMap] = useState({}) // movie_id → rating row
  const [activeMonth, setActiveMonth] = useState(null)

  // Score modal state
  const [modalMovie, setModalMovie] = useState(null)
  const [modalRating, setModalRating] = useState(null)

  const loadData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [{ data: month }, { data: ratings }] = await Promise.all([
      supabase.from('months').select('id, month_year').eq('status', 'active').maybeSingle(),
      supabase.from('ratings')
        .select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
        .eq('user_id', profile.id),
    ])

    setActiveMonth(month)

    if (month) {
      const { data: movieData } = await supabase
        .from('movies_safe')
        .select('id, month_id, title, poster_url, genre, director, year_released, scores_revealed, picker_revealed, historical_avg_score, scoring_deadline')
        .eq('month_id', month.id)

      setMovies(movieData ?? [])
    } else {
      setMovies([])
    }

    const map = {}
    for (const r of (ratings ?? [])) {
      map[r.movie_id] = r
    }
    setRatingsMap(map)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    loadData()
  }, [loadData])

  function openModal(movie, rating) {
    setModalMovie(movie)
    setModalRating(rating)
  }

  function closeModal() {
    setModalMovie(null)
    setModalRating(null)
  }

  // Format month label, e.g. "2026-05" → "May 2026"
  const monthLabel = activeMonth?.month_year
    ? new Date(`${activeMonth.month_year}-02`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'This Month'

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
            fontFamily: "'DM Mono',monospace", color: '#374151',
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em',
            margin: '0 0 4px',
          }}>
            {monthLabel}
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.6rem',
            color: 'white', lineHeight: 1, margin: 0, letterSpacing: '0.03em',
          }}>
            This Month
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

        {/* Tab Content */}
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          {activeTab === 'Films' && (
            <FilmsTab
              movies={movies}
              ratingsMap={ratingsMap}
              loading={loading}
              onScorePress={openModal}
            />
          )}
          {activeTab === 'Deadlines' && (
            <DeadlinesTab movies={movies} loading={loading} />
          )}
          {activeTab === 'Upcoming' && <UpcomingTab />}
        </div>
      </div>

      {/* Score Modal */}
      {modalMovie && (
        <ScoreModal
          movie={modalMovie}
          existingRating={modalRating}
          onClose={closeModal}
          onSaved={loadData}
        />
      )}

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
