import { useState, useEffect, useCallback, useRef } from 'react'
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

function formatMonthLabel(monthYear) {
  if (!monthYear) return ''
  return new Date(`${monthYear}-02`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

async function tmdbFetch(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

function UpcomingTab({ profile }) {
  // next upcoming month
  const [nextMonth, setNextMonth] = useState(null)
  const [monthLoading, setMonthLoading] = useState(true)

  // existing pick
  const [existingPick, setExistingPick] = useState(null)
  const [pickLoading, setPickLoading] = useState(true)

  // search
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // selected film (before confirm)
  const [selected, setSelected] = useState(null) // tmdb movie object enriched with detail
  const [detailLoading, setDetailLoading] = useState(false)
  const [alreadyWatched, setAlreadyWatched] = useState(false)

  // justification
  const [justification, setJustification] = useState('')

  // saving
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // change-pick confirmation
  const [confirmChange, setConfirmChange] = useState(false)

  const debounceRef = useRef(null)

  // load next upcoming month + existing pick
  useEffect(() => {
    async function init() {
      setMonthLoading(true)
      setPickLoading(true)
      const { data: month } = await supabase
        .from('months')
        .select('id, month_year')
        .eq('status', 'upcoming')
        .order('month_year', { ascending: true })
        .limit(1)
        .maybeSingle()
      setNextMonth(month ?? null)
      setMonthLoading(false)

      if (month && profile) {
        const { data: pick } = await supabase
          .from('upcoming_picks')
          .select('*')
          .eq('user_id', profile.id)
          .eq('month_target', month.month_year)
          .maybeSingle()
        setExistingPick(pick ?? null)
      }
      setPickLoading(false)
    }
    init()
  }, [profile])

  // debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query.trim())}&page=1`)
        setSearchResults(data.results ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function selectFilm(result) {
    setDetailLoading(true)
    setSelected(null)
    setAlreadyWatched(false)
    try {
      const [detail, providersData, clubCheck] = await Promise.all([
        tmdbFetch(`/movie/${result.id}`),
        tmdbFetch(`/movie/${result.id}/watch/providers`),
        supabase.from('movies').select('id').eq('tmdb_id', result.id).maybeSingle(),
      ])

      const usProviders = providersData?.results?.US ?? {}
      const streamingProviders = {
        flatrate: usProviders.flatrate ?? [],
        rent: usProviders.rent ?? [],
        buy: usProviders.buy ?? [],
        link: usProviders.link ?? null,
      }

      const director = detail.credits?.crew?.find(c => c.job === 'Director')?.name ?? null

      setSelected({
        tmdb_id: detail.id,
        title: detail.title,
        poster_path: detail.poster_path,
        year: detail.release_date ? detail.release_date.slice(0, 4) : null,
        director,
        runtime_minutes: detail.runtime ?? null,
        genre: detail.genres?.map(g => g.name).join(', ') ?? null,
        plot_summary: detail.overview ?? null,
        streaming_providers: streamingProviders,
      })

      if (clubCheck.data) setAlreadyWatched(true)
    } catch {
      // if detail fails, fall back to search result basics
      setSelected({
        tmdb_id: result.id,
        title: result.title,
        poster_path: result.poster_path,
        year: result.release_date ? result.release_date.slice(0, 4) : null,
        director: null,
        runtime_minutes: null,
        genre: null,
        plot_summary: result.overview ?? null,
        streaming_providers: null,
      })
    } finally {
      setDetailLoading(false)
    }
    setQuery('')
    setSearchResults([])
  }

  async function confirmPick() {
    if (!selected || !nextMonth || !profile) return
    setSaving(true)
    setSaveError(null)
    try {
      const { error } = await supabase.from('upcoming_picks').upsert({
        user_id: profile.id,
        tmdb_id: selected.tmdb_id,
        title: selected.title,
        poster_url: selected.poster_path,
        month_target: nextMonth.month_year,
        metadata: {
          year: selected.year,
          director: selected.director,
          runtime_minutes: selected.runtime_minutes,
          genre: selected.genre,
          plot_summary: selected.plot_summary,
          streaming_providers: selected.streaming_providers,
          justification: justification.trim() || null,
        },
      }, { onConflict: 'user_id,month_target' })

      if (error) throw error

      // reload pick
      const { data: pick } = await supabase
        .from('upcoming_picks')
        .select('*')
        .eq('user_id', profile.id)
        .eq('month_target', nextMonth.month_year)
        .maybeSingle()
      setExistingPick(pick ?? null)
      setSelected(null)
      setJustification('')
      setConfirmChange(false)
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save pick.')
    } finally {
      setSaving(false)
    }
  }

  function handleChangePick() {
    if (confirmChange) {
      setExistingPick(null)
      setConfirmChange(false)
      setSelected(null)
      setQuery('')
    } else {
      setConfirmChange(true)
    }
  }

  // ── Loading ──
  if (monthLoading || pickLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Skeleton style={{ height: '28px', width: '60%' }} />
        <Skeleton style={{ height: '110px' }} />
      </div>
    )
  }

  // ── No upcoming month configured ──
  if (!nextMonth) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em', margin: '0 0 8px' }}>
          No upcoming month
        </p>
        <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#374151', fontSize: '14px', margin: 0 }}>
          No upcoming month has been set yet.
        </p>
      </div>
    )
  }

  const nextMonthLabel = formatMonthLabel(nextMonth.month_year)

  // ── State A: pick already submitted ──
  if (existingPick && !confirmChange) {
    const meta = existingPick.metadata ?? {}
    return (
      <div>
        <p style={{
          fontFamily: "'DM Mono',monospace", color: '#4b5563',
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
          margin: '0 0 14px',
        }}>
          Your pick for {nextMonthLabel}
        </p>

        {/* Pick card */}
        <div style={{
          display: 'flex', gap: '14px',
          padding: '14px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxSizing: 'border-box',
        }}>
          <div style={{
            flexShrink: 0, width: '56px', height: '80px',
            borderRadius: '7px', overflow: 'hidden', background: '#1a1b25',
          }}>
            {existingPick.poster_url ? (
              <img
                src={`https://image.tmdb.org/t/p/w185${existingPick.poster_url}`}
                alt={existingPick.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '13px' }}>
                  {initials(existingPick.title)}
                </span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'DM Sans',sans-serif", color: 'white',
              fontWeight: 600, fontSize: '15px',
              margin: '0 0 4px', lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {existingPick.title}
            </p>
            <p style={{
              fontFamily: "'DM Mono',monospace", color: '#4b5563',
              fontSize: '11px', margin: '0 0 6px',
            }}>
              {meta.year ?? ''}
              {meta.director ? ` · ${meta.director}` : ''}
              {meta.runtime_minutes ? ` · ${meta.runtime_minutes}m` : ''}
            </p>
            {meta.justification && (
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: '#6b7280',
                fontSize: '12px', margin: 0, lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                "{meta.justification}"
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleChangePick}
          style={{
            marginTop: '14px',
            width: '100%',
            padding: '10px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#6b7280',
            fontFamily: "'DM Sans',sans-serif",
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Change pick
        </button>
      </div>
    )
  }

  // ── Confirm-change guard ──
  if (confirmChange && !existingPick) {
    // already cleared existingPick, fall through to search UI below
  } else if (confirmChange) {
    return (
      <div>
        <div style={{
          padding: '16px',
          borderRadius: '14px',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          marginBottom: '12px',
        }}>
          <p style={{
            fontFamily: "'DM Sans',sans-serif", color: '#f87171',
            fontSize: '13px', fontWeight: 500, margin: '0 0 4px',
          }}>
            Are you sure?
          </p>
          <p style={{
            fontFamily: "'DM Sans',sans-serif", color: '#6b7280',
            fontSize: '12px', margin: 0, lineHeight: 1.5,
          }}>
            Changing your pick will replace your current selection. You can only pick once per month.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setConfirmChange(false)}
            style={{
              flex: 1, padding: '10px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#6b7280',
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleChangePick}
            style={{
              flex: 1, padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: 'rgba(239,68,68,0.15)',
              color: '#f87171',
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 600,
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            Yes, change it
          </button>
        </div>
      </div>
    )
  }

  // ── State B: no pick yet (or after confirmed change) ──

  // If a film is selected, show confirmation card
  if (selected) {
    return (
      <div>
        <p style={{
          fontFamily: "'DM Mono',monospace", color: '#4b5563',
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
          margin: '0 0 14px',
        }}>
          Pick for {nextMonthLabel}
        </p>

        {/* Confirmation card */}
        <div style={{
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'hidden',
          marginBottom: '12px',
        }}>
          {/* Poster + title row */}
          <div style={{ display: 'flex', gap: '14px', padding: '14px' }}>
            <div style={{
              flexShrink: 0, width: '64px', height: '92px',
              borderRadius: '7px', overflow: 'hidden', background: '#1a1b25',
            }}>
              {selected.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w185${selected.poster_path}`}
                  alt={selected.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '13px' }}>
                    {initials(selected.title)}
                  </span>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: 'white',
                fontWeight: 600, fontSize: '16px',
                margin: '0 0 5px', lineHeight: 1.25,
              }}>
                {selected.title}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace", color: '#4b5563',
                fontSize: '11px', margin: '0 0 6px',
              }}>
                {[selected.year, selected.director, selected.runtime_minutes ? `${selected.runtime_minutes}m` : null]
                  .filter(Boolean).join(' · ')}
              </p>
              {selected.genre && (
                <p style={{
                  fontFamily: "'DM Mono',monospace", color: '#374151',
                  fontSize: '10px', margin: 0,
                }}>
                  {selected.genre}
                </p>
              )}
            </div>
          </div>

          {/* Plot */}
          {selected.plot_summary && (
            <div style={{
              padding: '0 14px 14px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              paddingTop: '12px',
            }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: '#6b7280',
                fontSize: '13px', lineHeight: 1.55, margin: 0,
              }}>
                {selected.plot_summary}
              </p>
            </div>
          )}
        </div>

        {/* Already watched warning */}
        {alreadyWatched && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.18)',
            marginBottom: '12px',
          }}>
            <p style={{
              fontFamily: "'DM Sans',sans-serif", color: '#fbbf24',
              fontSize: '12px', margin: 0, lineHeight: 1.4,
            }}>
              This film has already been watched in Movie Club. You can still pick it.
            </p>
          </div>
        )}

        {/* Justification textarea */}
        <textarea
          value={justification}
          onChange={e => setJustification(e.target.value)}
          placeholder="Why did you pick this? (optional)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: 'white',
            fontFamily: "'DM Sans',sans-serif",
            fontSize: '13px',
            lineHeight: 1.5,
            resize: 'vertical',
            marginBottom: '12px',
            outline: 'none',
          }}
        />

        {saveError && (
          <p style={{
            fontFamily: "'DM Mono',monospace", color: '#f87171',
            fontSize: '12px', margin: '0 0 10px',
          }}>
            {saveError}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { setSelected(null); setAlreadyWatched(false) }}
            style={{
              flex: 1, padding: '11px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#6b7280',
              fontFamily: "'DM Sans',sans-serif",
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={confirmPick}
            disabled={saving}
            style={{
              flex: 2, padding: '11px',
              borderRadius: '10px',
              border: 'none',
              background: saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: saving ? '#4b5563' : 'white',
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 600,
              fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s ease',
            }}
          >
            {saving ? 'Saving…' : 'Confirm Pick'}
          </button>
        </div>
      </div>
    )
  }

  // Search UI
  return (
    <div>
      <p style={{
        fontFamily: "'DM Mono',monospace", color: '#4b5563',
        fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
        margin: '0 0 14px',
      }}>
        Pick for {nextMonthLabel}
      </p>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search for a film…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'white',
            fontFamily: "'DM Sans',sans-serif",
            fontSize: '14px',
            outline: 'none',
          }}
        />
        {searching && (
          <div style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            width: '14px', height: '14px',
            border: '2px solid rgba(255,255,255,0.1)',
            borderTop: '2px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
        )}
      </div>

      {/* Loading detail */}
      {detailLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton style={{ height: '80px' }} />
        </div>
      )}

      {/* Search results */}
      {!detailLoading && searchResults.length > 0 && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.02)',
        }}>
          {searchResults.map((r, i) => (
            <button
              key={r.id}
              onClick={() => selectFilm(r)}
              style={{
                width: '100%', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                flexShrink: 0, width: '36px', height: '52px',
                borderRadius: '5px', overflow: 'hidden', background: '#1a1b25',
              }}>
                {r.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${r.poster_path}`}
                    alt={r.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '10px' }}>
                      {initials(r.title)}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif", color: 'white',
                  fontWeight: 500, fontSize: '14px',
                  margin: '0 0 2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.title}
                </p>
                <p style={{
                  fontFamily: "'DM Mono',monospace", color: '#4b5563',
                  fontSize: '11px', margin: 0,
                }}>
                  {r.release_date ? r.release_date.slice(0, 4) : 'Unknown year'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {!detailLoading && !searching && query.trim().length > 1 && searchResults.length === 0 && (
        <p style={{
          fontFamily: "'DM Sans',sans-serif", color: '#374151',
          fontSize: '13px', textAlign: 'center', padding: '24px 0',
        }}>
          No films found for "{query}"
        </p>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
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

  // Realtime subscription: re-fetch all data whenever any rating is inserted or
  // updated for movies in the active month. This keeps scores and CTA states
  // in sync across devices without requiring a manual refresh.
  useEffect(() => {
    if (!activeMonth) return

    const channel = supabase
      .channel('ratings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings' },
        () => loadData()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [activeMonth, loadData])

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
          {activeTab === 'Upcoming' && (
            <UpcomingTab profile={profile} />
          )}
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
