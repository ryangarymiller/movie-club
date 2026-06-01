import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── helpers ──────────────────────────────────────────────────────────────────

function initials(title = '') {
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function fmtScore(s) {
  return s != null ? Number(s).toFixed(2) : null
}

function isVault(movie) {
  return movie.historical_avg_score != null && movie.historical_avg_score >= 8.5
}

// ─── tiny components ──────────────────────────────────────────────────────────

function Skeleton({ style, className = '' }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: 'rgba(255,255,255,0.05)', ...style }}
    />
  )
}

function SubTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '11px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '6px 14px',
        borderRadius: '999px',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.4)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function SortButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '10px',
        letterSpacing: '0.08em',
        padding: '5px 12px',
        borderRadius: '999px',
        border: active ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
        background: active ? 'rgba(var(--accent-rgb,185,28,28),0.15)' : 'transparent',
        color: active ? 'var(--accent-light, #fca5a5)' : 'rgba(255,255,255,0.35)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ─── PosterCard ───────────────────────────────────────────────────────────────

function PosterCard({ movie, vault = false, onClick }) {
  const score = movie.historical_avg_score
  const [hovered, setHovered] = useState(false)
  const scored = score != null

  return (
    <div
      onClick={() => onClick(movie)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      {/* card wrapper */}
      <div
        style={{
          position: 'relative',
          borderRadius: '8px',
          overflow: 'hidden',
          aspectRatio: '2/3',
          background: '#111218',
          boxShadow: vault
            ? '0 0 0 1.5px #d97706, 0 0 18px rgba(217,119,6,0.35), 0 8px 24px rgba(0,0,0,0.7)'
            : '0 4px 18px rgba(0,0,0,0.6)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          transform: hovered ? 'translateY(-3px) scale(1.02)' : 'none',
        }}
      >
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w300${movie.poster_url}`}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: 'rgba(255,255,255,0.12)' }}>
              {initials(movie.title)}
            </span>
          </div>
        )}

        {/* Hover title overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 45%, transparent 75%)',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.18s ease',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '10px 8px',
          }}
        >
          <p style={{ color: '#fff', fontSize: '11px', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, lineHeight: 1.3, margin: 0 }}>
            {movie.title}
            {movie.year_released ? (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}> {movie.year_released}</span>
            ) : null}
          </p>
        </div>

        {/* Score badge */}
        <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
          {scored ? (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'var(--accent)',
              color: '#fff',
              display: 'block',
            }}>
              {Number(score).toFixed(1)}
            </span>
          ) : (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(0,0,0,0.65)',
              color: 'rgba(255,255,255,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'block',
              fontFamily: "'DM Mono', monospace",
            }}>?</span>
          )}
        </div>

        {/* Vault star badge */}
        {vault && (
          <div style={{ position: 'absolute', top: '6px', left: '6px' }}>
            <span style={{
              fontSize: '13px',
              background: 'rgba(0,0,0,0.7)',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>★</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PosterGrid ───────────────────────────────────────────────────────────────

function PosterGrid({ movies, vault = false, loading, skeletonCount = 15, onSelect }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
      }}
      className="films-grid"
    >
      {loading
        ? [...Array(skeletonCount)].map((_, i) => (
            <Skeleton key={i} style={{ aspectRatio: '2/3', borderRadius: '8px' }} />
          ))
        : movies.map(m => (
            <PosterCard
              key={m.id}
              movie={m}
              vault={vault || isVault(m)}
              onClick={onSelect}
            />
          ))
      }
    </div>
  )
}

// ─── FilmSheet (bottom sheet detail) ─────────────────────────────────────────

function FilmSheet({ movie, onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (movie) {
      // slight delay so CSS transition fires
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [movie])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  if (!movie) return null

  const score = movie.historical_avg_score
  const genres = Array.isArray(movie.genre) ? movie.genre : []

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 50,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 51,
          background: '#0e0f16',
          borderRadius: '20px 20px 0 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '0 0 env(safe-area-inset-bottom, 24px)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ padding: '0 1.25rem 2rem' }}>
          {/* Poster + core info */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
            <div style={{
              flexShrink: 0,
              width: '90px',
              aspectRatio: '2/3',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#1a1b24',
              boxShadow: isVault(movie)
                ? '0 0 0 1.5px #d97706, 0 0 12px rgba(217,119,6,0.3)'
                : '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              {movie.poster_url ? (
                <img
                  src={`https://image.tmdb.org/t/p/w185${movie.poster_url}`}
                  alt={movie.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', color: 'rgba(255,255,255,0.15)' }}>
                    {initials(movie.title)}
                  </span>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingTop: '4px' }}>
              <h2 style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '1.75rem',
                color: '#fff',
                lineHeight: 1.05,
                letterSpacing: '0.03em',
                margin: '0 0 4px',
              }}>
                {movie.title}
              </h2>

              {movie.year_released && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 10px', fontFamily: "'DM Mono', monospace" }}>
                  {movie.year_released}
                  {movie.runtime_minutes ? ` · ${movie.runtime_minutes} min` : ''}
                </p>
              )}

              {score != null && (
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '2rem',
                    color: isVault(movie) ? '#fbbf24' : 'var(--accent-light, #fca5a5)',
                    lineHeight: 1,
                  }}>
                    {Number(score).toFixed(2)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', fontFamily: "'DM Mono', monospace" }}>/10</span>
                  {isVault(movie) && (
                    <span style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      fontFamily: "'DM Mono', monospace",
                      letterSpacing: '0.1em',
                      color: '#fbbf24',
                      background: 'rgba(251,191,36,0.12)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      padding: '1px 7px',
                      borderRadius: '999px',
                    }}>
                      THE VAULT
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Details rows */}
          {movie.director && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start' }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', width: '64px', flexShrink: 0, paddingTop: '1px' }}>
                Director
              </span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}>
                {movie.director}
              </span>
            </div>
          )}

          {genres.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-start' }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', width: '64px', flexShrink: 0, paddingTop: '1px' }}>
                Genre
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {genres.map(g => (
                  <span key={g} style={{
                    fontSize: '11px',
                    fontFamily: "'DM Sans', sans-serif",
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: "'DM Mono', monospace",
              fontSize: '12px',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              marginTop: '8px',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </>
  )
}

// ─── AllFilms tab ─────────────────────────────────────────────────────────────

const SORTS = [
  { key: 'recent', label: 'Most Recent' },
  { key: 'high', label: 'Highest Rated' },
  { key: 'low', label: 'Lowest Rated' },
]

function AllFilmsTab({ movies, loading, onSelect }) {
  const [sort, setSort] = useState('recent')

  const sorted = [...movies].sort((a, b) => {
    if (sort === 'high') return (b.historical_avg_score ?? -1) - (a.historical_avg_score ?? -1)
    if (sort === 'low') return (a.historical_avg_score ?? 999) - (b.historical_avg_score ?? 999)
    // recent: higher month_id = more recent (months are sequential by id)
    return (b._monthOrder ?? 0) - (a._monthOrder ?? 0)
  })

  return (
    <div>
      {/* Sort bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px' }}>
        {SORTS.map(s => (
          <SortButton key={s.key} label={s.label} active={sort === s.key} onClick={() => setSort(s.key)} />
        ))}
      </div>

      <PosterGrid movies={sorted} loading={loading} onSelect={onSelect} />
    </div>
  )
}

// ─── VaultTab ─────────────────────────────────────────────────────────────────

function VaultTab({ movies, loading, onSelect }) {
  const vaultMovies = [...movies]
    .filter(isVault)
    .sort((a, b) => b.historical_avg_score - a.historical_avg_score)

  return (
    <div>
      {/* Vault header treatment */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          borderRadius: '999px',
          background: 'rgba(217,119,6,0.1)',
          border: '1px solid rgba(217,119,6,0.3)',
        }}>
          <span style={{ fontSize: '16px' }}>★</span>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1.1rem',
            letterSpacing: '0.2em',
            color: '#fbbf24',
          }}>
            THE VAULT
          </span>
          <span style={{ fontSize: '16px' }}>★</span>
        </div>
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '10px',
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.08em',
          marginTop: '8px',
        }}>
          Films averaging 8.5 or above
        </p>
      </div>

      {!loading && vaultMovies.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: 'rgba(255,255,255,0.25)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
        }}>
          No films have reached The Vault yet.
        </div>
      ) : (
        <PosterGrid
          movies={vaultMovies}
          vault
          loading={loading}
          skeletonCount={4}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

// ─── BySeasonTab ──────────────────────────────────────────────────────────────

function BySeasonTab({ movies, seasons, loading, onSelect }) {
  if (loading) {
    return (
      <div>
        {[...Array(2)].map((_, si) => (
          <div key={si} style={{ marginBottom: '32px' }}>
            <Skeleton style={{ height: '28px', width: '160px', marginBottom: '12px', borderRadius: '6px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} style={{ aspectRatio: '2/3', borderRadius: '8px' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Group movies by season
  const bySeason = seasons.map(season => {
    const seasonMovies = movies.filter(m => m._seasonId === season.id)
    const scored = seasonMovies.filter(m => m.historical_avg_score != null)
    const avg = scored.length
      ? (scored.reduce((s, m) => s + Number(m.historical_avg_score), 0) / scored.length)
      : null
    return { season, movies: seasonMovies, avg }
  }).filter(g => g.movies.length > 0)

  if (bySeason.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
        No films yet.
      </div>
    )
  }

  return (
    <div>
      {bySeason.map(({ season, movies: sMovies, avg }) => (
        <div key={season.id} style={{ marginBottom: '36px' }}>
          {/* Season header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '1.4rem',
              color: '#fff',
              letterSpacing: '0.05em',
              margin: 0,
            }}>
              {season.name}
            </h3>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.08em',
            }}>
              {sMovies.length} film{sMovies.length !== 1 ? 's' : ''}
            </span>
            {avg != null && (
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                color: 'var(--accent-light, #fca5a5)',
                letterSpacing: '0.05em',
                marginLeft: 'auto',
              }}>
                avg {Number(avg).toFixed(2)}
              </span>
            )}
          </div>

          <PosterGrid movies={sMovies} loading={false} onSelect={onSelect} />
        </div>
      ))}
    </div>
  )
}

// ─── Main Films page ──────────────────────────────────────────────────────────

const TABS = ['All Films', 'The Vault', 'By Season']

export default function Films() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('All Films')
  const [loading, setLoading] = useState(true)
  const [movies, setMovies] = useState([])
  const [seasons, setSeasons] = useState([])
  const [selectedMovie, setSelectedMovie] = useState(null)

  useEffect(() => {
    async function load() {
      const [
        { data: moviesData },
        { data: monthsData },
        { data: seasonsData },
      ] = await Promise.all([
        supabase.from('movies_safe').select(
          'id, month_id, title, tmdb_id, poster_url, genre, director, runtime_minutes, year_released, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id'
        ),
        supabase.from('months').select('id, month_year, season_id, status').order('month_year', { ascending: true }),
        supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
      ])

      // Build a lookup: month_id → { order, season_id }
      const monthLookup = {}
      ;(monthsData ?? []).forEach((m, idx) => {
        monthLookup[m.id] = { order: idx, seasonId: m.season_id }
      })

      const enriched = (moviesData ?? []).map(m => ({
        ...m,
        _monthOrder: monthLookup[m.month_id]?.order ?? 0,
        _seasonId: monthLookup[m.month_id]?.seasonId ?? null,
      }))

      setMovies(enriched)
      setSeasons(seasonsData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSelect = useCallback((movie) => {
    setSelectedMovie(movie)
  }, [])

  const handleClose = useCallback(() => {
    setSelectedMovie(null)
  }, [])

  return (
    <div
      style={{
        background: '#07080d',
        minHeight: '100vh',
        fontFamily: "'DM Sans', sans-serif",
        paddingBottom: '6rem',
        width: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Single padded container */}
      <div style={{ padding: '2rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Page header */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: '#4b5563',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            Collection
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2.8rem',
            color: '#fff',
            lineHeight: 1,
            letterSpacing: '0.03em',
            margin: 0,
          }}>
            Films
          </h1>
        </div>

        {/* Sub-tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          paddingBottom: '2px',
        }}>
          {TABS.map(tab => (
            <SubTab
              key={tab}
              label={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            />
          ))}
        </div>

        {/* Tab content */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'All Films' && (
            <AllFilmsTab movies={movies} loading={loading} onSelect={handleSelect} />
          )}
          {activeTab === 'The Vault' && (
            <VaultTab movies={movies} loading={loading} onSelect={handleSelect} />
          )}
          {activeTab === 'By Season' && (
            <BySeasonTab movies={movies} seasons={seasons} loading={loading} onSelect={handleSelect} />
          )}
        </div>

      </div>

      {/* Film detail sheet */}
      <FilmSheet movie={selectedMovie} onClose={handleClose} />

      <style>{`
        @media (min-width: 480px) { .films-grid { grid-template-columns: repeat(4, 1fr) !important; } }
        @media (min-width: 768px) { .films-grid { grid-template-columns: repeat(5, 1fr) !important; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
