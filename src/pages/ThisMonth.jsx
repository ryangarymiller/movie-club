import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import MonthReveal from '../components/MonthReveal'
import { FilmDetailOverlay } from './Films'
import { MEMBER_COLORS } from '../lib/colors'

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
      style={{ background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: '8px', ...style }}
    />
  )
}

// ─── Guess the Picker ────────────────────────────────────────────────────────

function GuessThePicker({ movie, profile, allUsers }) {
  const [guess, setGuess] = useState(null)      // existing guess row
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile || !movie) return
    supabase
      .from('picker_guesses')
      .select('id, guessed_user_id')
      .eq('movie_id', movie.id)
      .eq('guessing_user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setGuess(data ?? null)
        setLoaded(true)
      })
  }, [movie, profile])

  if (!profile || !loaded) return null

  const otherUsers = (allUsers ?? []).filter(u => u.id !== profile.id)

  // After reveal — show result
  if (movie.picker_revealed) {
    if (!guess) return null
    const correct = guess.guessed_user_id === movie.picked_by_user_id
    const guessedUser = (allUsers ?? []).find(u => u.id === guess.guessed_user_id)
    const pickerUser = (allUsers ?? []).find(u => u.id === movie.picked_by_user_id)
      ?? (profile.id === movie.picked_by_user_id ? { name: profile.name } : null)
    return (
      <div style={{ marginTop: '8px' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          borderRadius: '999px',
          border: `1px solid ${correct ? 'rgba(134,239,172,0.3)' : 'rgba(248,113,113,0.3)'}`,
          background: correct ? 'rgba(134,239,172,0.06)' : 'rgba(248,113,113,0.06)',
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          letterSpacing: '0.04em',
          color: correct ? '#86efac' : '#f87171',
        }}>
          {correct ? '✓' : '✗'}
          {correct
            ? ` Correct! It was ${pickerUser?.name ?? 'Unknown'}`
            : ` You guessed ${guessedUser?.name ?? '?'} — It was ${pickerUser?.name ?? 'Unknown'}`}
        </span>
      </div>
    )
  }

  async function submitGuess(userId) {
    setSaving(true)
    setOpen(false)
    await supabase.from('picker_guesses').upsert(
      { movie_id: movie.id, guessing_user_id: profile.id, guessed_user_id: userId },
      { onConflict: 'movie_id,guessing_user_id' }
    )
    const { data: updated } = await supabase
      .from('picker_guesses')
      .select('id, guessed_user_id')
      .eq('movie_id', movie.id)
      .eq('guessing_user_id', profile.id)
      .maybeSingle()
    setGuess(updated ?? null)
    setSaving(false)
  }

  // Already guessed, not editing
  if (guess && !open) {
    const guessedUser = otherUsers.find(u => u.id === guess.guessed_user_id)
    return (
      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '999px',
          border: '1px solid rgba(var(--fg-rgb), 0.1)',
          background: 'rgba(var(--fg-rgb), 0.04)',
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}>
          Guess: {guessedUser?.name ?? '?'}
        </span>
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '4px 9px',
            borderRadius: '999px',
            border: '1px solid rgba(var(--fg-rgb), 0.1)',
            background: 'transparent',
            color: 'var(--text-dim)',
            fontFamily: "'DM Mono',monospace",
            fontSize: '10px',
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          Edit
        </button>
      </div>
    )
  }

  // Dropdown open or no guess yet
  return (
    <div style={{ marginTop: '8px' }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '999px',
            border: '1px solid rgba(var(--fg-rgb), 0.1)',
            background: 'rgba(var(--fg-rgb), 0.03)',
            color: 'var(--text-dim)',
            fontFamily: "'DM Mono',monospace",
            fontSize: '10px',
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          Guess picker →
        </button>
      )}
      {open && (
        <div style={{
          borderRadius: '10px',
          border: '1px solid rgba(var(--fg-rgb), 0.08)',
          overflow: 'hidden',
          background: 'rgba(var(--fg-rgb), 0.03)',
        }}>
          {otherUsers.map((u, i) => (
            <button
              key={u.id}
              onClick={() => submitGuess(u.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: i < otherUsers.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
                color: 'rgba(var(--fg-rgb), 0.75)',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {u.name}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{
              width: '100%',
              padding: '7px',
              background: 'transparent',
              border: 'none',
              borderTop: '1px solid rgba(var(--fg-rgb), 0.05)',
              color: 'var(--text-faint)',
              fontFamily: "'DM Mono',monospace",
              fontSize: '10px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            CANCEL
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Film Card ───────────────────────────────────────────────────────────────

function FilmCard({ movie, rating, onScorePress, onOpen, pickerName, profile, allUsers }) {
  const status = scoreStatus(rating)
  const pickerColor = pickerName ? MEMBER_COLORS[pickerName] : undefined

  const ctaLabel = status === 'excitement'
    ? 'Excitement'
    : status === 'final'
      ? 'Score it'
      : `${Number(rating.score).toFixed(2)}`

  const ctaStyle = status === 'done'
    ? { background: 'transparent', border: '1px solid rgba(var(--fg-rgb), 0.12)', color: 'rgba(var(--fg-rgb), 0.5)' }
    : { background: 'var(--accent)', border: 'none', color: 'var(--text-strong)' }

  const labelAbove = status === 'excitement'
    ? 'Submit excitement score'
    : status === 'final'
      ? 'Submit final score'
      : 'Scored'

  const labelColor = status === 'done' ? 'var(--text-faint)' : 'var(--text-muted)'

  return (
    <div
      onClick={() => onOpen && onOpen(movie)}
      style={{
        padding: '12px',
        borderRadius: '14px',
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        borderLeft: pickerColor ? `3px solid ${pickerColor}` : '1px solid rgba(var(--fg-rgb), 0.07)',
        width: '100%', boxSizing: 'border-box',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      {/* Row: poster + info + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Poster */}
        <div style={{
          flexShrink: 0, width: '48px', height: '68px',
          borderRadius: '7px', overflow: 'hidden',
          background: 'var(--surface-2)',
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
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '13px' }}>
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
            fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
            fontWeight: 500, fontSize: '14px',
            margin: '0 0 2px', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {movie.title}
          </p>
          <p style={{
            fontFamily: "'DM Mono',monospace", color: 'var(--hairline)',
            fontSize: '11px', margin: 0,
          }}>
            {movie.year_released ?? ''}
            {movie.director ? ` · ${movie.director}` : ''}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={e => { e.stopPropagation(); status !== 'done' && onScorePress(movie, rating) }}
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

      {/* Deadline + picker meta row */}
      {(movie.scoring_deadline || pickerName) && (() => {
        const cd = countdownLabel(movie.scoring_deadline)
        return (
          <div style={{
            marginTop: '8px',
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            {movie.scoring_deadline && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontFamily: "'DM Mono',monospace", fontSize: '10px',
                letterSpacing: '0.04em',
                color: cd?.past ? 'var(--text-faint)' : 'var(--text-dim)',
              }}>
                <span style={{ opacity: 0.5, fontSize: '9px' }}>⏱</span>
                {cd?.past
                  ? formatDeadline(movie.scoring_deadline)
                  : `${cd?.text ?? ''} · ${formatDeadline(movie.scoring_deadline)}`}
              </span>
            )}
            {pickerName && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontFamily: "'DM Mono',monospace", fontSize: '10px',
                letterSpacing: '0.04em',
                color: pickerColor ?? 'var(--text-dim)',
              }}>
                <span style={{ opacity: 0.6, fontSize: '9px' }}>◆</span>
                Picked by {pickerName}
              </span>
            )}
          </div>
        )
      })()}

      {/* Guess the Picker */}
      {profile && (
        <GuessThePicker movie={movie} profile={profile} allUsers={allUsers} />
      )}
    </div>
  )
}

// ─── Films Tab ───────────────────────────────────────────────────────────────

function FilmsTab({ movies, ratingsMap, loading, onScorePress, onOpen, users, profile, activeMonth }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: '92px' }} />)}
      </div>
    )
  }

  if (!movies.length) {
    const monthLabel = activeMonth?.month_year
      ? formatMonthLabel(activeMonth.month_year)
      : 'this month'

    return (
      <div style={{
        padding: '18px 20px',
        borderRadius: '14px',
        background: 'rgba(var(--fg-rgb), 0.025)',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        boxSizing: 'border-box',
      }}>
        <p style={{
          fontFamily: "'DM Sans',sans-serif", color: 'var(--text-muted)',
          fontSize: '14px', margin: '0 0 4px', fontWeight: 500,
        }}>
          No films yet for {monthLabel}
        </p>
        <p style={{
          fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)',
          fontSize: '13px', margin: 0, lineHeight: 1.5,
        }}>
          Films appear here once the month is activated by the admin. In the meantime, submit your pick below.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {movies.map(m => {
        const pickerName = m.picker_revealed
          ? (users.find(u => u.id === m.picked_by_user_id)?.name ?? undefined)
          : undefined
        return (
          <FilmCard
            key={m.id}
            movie={m}
            rating={ratingsMap[m.id] ?? null}
            onScorePress={onScorePress}
            onOpen={onOpen}
            pickerName={pickerName}
            profile={profile}
            allUsers={users}
          />
        )
      })}
    </div>
  )
}

// ─── Pick Submission Flow (used inside modal) ─────────────────────────────────

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

async function tmdbFetch(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

function PickSubmissionFlow({ profile, nextMonth, monthIsActive, onPickSaved }) {
  // existing pick (may be pre-loaded by parent)
  const [existingPick, setExistingPick] = useState(null)
  const [pickLoading, setPickLoading] = useState(true)

  // search
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // selected film (before confirm)
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [alreadyWatched, setAlreadyWatched] = useState(false)

  // justification
  const [justification, setJustification] = useState('')

  // saving
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // change-pick confirmation
  const [confirmChange, setConfirmChange] = useState(false)

  // draft queue (Phase 7) — quick-pick source
  const [queue, setQueue] = useState([])
  const [queueSourceId, setQueueSourceId] = useState(null) // draft_queue row a selection came from

  const debounceRef = useRef(null)

  // load existing pick for next month
  useEffect(() => {
    if (!nextMonth || !profile) { setPickLoading(false); return }
    supabase
      .from('upcoming_picks')
      .select('*')
      .eq('user_id', profile.id)
      .eq('month_target', nextMonth.month_year)
      .maybeSingle()
      .then(({ data }) => {
        setExistingPick(data ?? null)
        setPickLoading(false)
      })
  }, [profile, nextMonth])

  // load the viewer's private draft queue (ranked pick ideas) for quick-pick
  useEffect(() => {
    if (!profile) return
    supabase
      .from('draft_queue')
      .select('id, tmdb_id, title, poster_url, year_released, position')
      .eq('user_id', profile.id)
      .order('position', { ascending: true })
      .then(({ data }) => setQueue(data ?? []))
  }, [profile])

  // debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    // Enter the searching state immediately so "No films found" can't flash
    // during the debounce window (before the fetch has actually run).
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
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

  async function selectFilm(result, sourceQueueId = null) {
    setDetailLoading(true)
    setSelected(null)
    setAlreadyWatched(false)
    setQueueSourceId(sourceQueueId)
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

  // Quick-pick a film straight from the draft queue. Maps the stored row into the
  // TMDB-result shape selectFilm expects, then routes through the same detail-fetch
  // path so the pick's metadata (director, runtime, genre, streaming) stays complete.
  function selectFromQueue(item) {
    selectFilm(
      {
        id: item.tmdb_id,
        title: item.title,
        poster_path: item.poster_url,
        release_date: item.year_released ? `${item.year_released}-01-01` : null,
      },
      item.id,
    )
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

      // If the target month is already active, materialize this pick into a film
      // and re-split the month's scoring deadlines evenly by film count. SECURITY
      // DEFINER RPC — idempotent per (month, picker). Deadlines are display-only (dev mode).
      if (monthIsActive && nextMonth.id) {
        const { error: rpcErr } = await supabase.rpc('materialize_and_split_month', { p_month_id: nextMonth.id })
        if (rpcErr) throw rpcErr
      }

      // If this pick was promoted from the draft queue, consume that queue entry —
      // it's no longer a plan to pick, it IS the pick. Only after a successful save.
      if (queueSourceId) {
        await supabase.from('draft_queue').delete().eq('id', queueSourceId)
        setQueue(prev => prev.filter(q => q.id !== queueSourceId))
        setQueueSourceId(null)
      }

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
      if (onPickSaved) onPickSaved()
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

  if (pickLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Skeleton style={{ height: '28px', width: '60%' }} />
        <Skeleton style={{ height: '110px' }} />
      </div>
    )
  }

  const nextMonthLabel = nextMonth ? formatMonthLabel(nextMonth.month_year) : ''

  // ── State A: pick already submitted ──
  if (existingPick && !confirmChange) {
    const meta = existingPick.metadata ?? {}
    return (
      <div>
        <p style={{
          fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
          margin: '0 0 14px',
        }}>
          Your pick for {nextMonthLabel}
        </p>

        <div style={{
          display: 'flex', gap: '14px',
          padding: '14px',
          borderRadius: '14px',
          background: 'rgba(var(--fg-rgb), 0.025)',
          border: '1px solid rgba(var(--fg-rgb), 0.07)',
          boxSizing: 'border-box',
        }}>
          <div style={{
            flexShrink: 0, width: '56px', height: '80px',
            borderRadius: '7px', overflow: 'hidden', background: 'var(--surface-2)',
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
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '13px' }}>
                  {initials(existingPick.title)}
                </span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
              fontWeight: 600, fontSize: '15px',
              margin: '0 0 4px', lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {existingPick.title}
            </p>
            <p style={{
              fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
              fontSize: '11px', margin: '0 0 6px',
            }}>
              {meta.year ?? ''}
              {meta.director ? ` · ${meta.director}` : ''}
              {meta.runtime_minutes ? ` · ${meta.runtime_minutes}m` : ''}
            </p>
            {meta.justification && (
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)',
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
            border: '1px solid rgba(var(--fg-rgb), 0.1)',
            background: 'transparent',
            color: 'var(--text-dim)',
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
            fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)',
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
              border: '1px solid rgba(var(--fg-rgb), 0.1)',
              background: 'transparent',
              color: 'var(--text-dim)',
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

  if (selected) {
    return (
      <div>
        <p style={{
          fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
          margin: '0 0 14px',
        }}>
          Pick for {nextMonthLabel}
        </p>

        <div style={{
          borderRadius: '14px',
          background: 'rgba(var(--fg-rgb), 0.025)',
          border: '1px solid rgba(var(--fg-rgb), 0.07)',
          overflow: 'hidden',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', gap: '14px', padding: '14px' }}>
            <div style={{
              flexShrink: 0, width: '64px', height: '92px',
              borderRadius: '7px', overflow: 'hidden', background: 'var(--surface-2)',
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
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '13px' }}>
                    {initials(selected.title)}
                  </span>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
                fontWeight: 600, fontSize: '16px',
                margin: '0 0 5px', lineHeight: 1.25,
              }}>
                {selected.title}
              </p>
              <p style={{
                fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
                fontSize: '11px', margin: '0 0 6px',
              }}>
                {[selected.year, selected.director, selected.runtime_minutes ? `${selected.runtime_minutes}m` : null]
                  .filter(Boolean).join(' · ')}
              </p>
              {selected.genre && (
                <p style={{
                  fontFamily: "'DM Mono',monospace", color: 'var(--hairline)',
                  fontSize: '10px', margin: 0,
                }}>
                  {selected.genre}
                </p>
              )}
            </div>
          </div>

          {selected.plot_summary && (
            <div style={{
              padding: '0 14px 14px',
              borderTop: '1px solid rgba(var(--fg-rgb), 0.04)',
              paddingTop: '12px',
            }}>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)',
                fontSize: '13px', lineHeight: 1.55, margin: 0,
              }}>
                {selected.plot_summary}
              </p>
            </div>
          )}
        </div>

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

        <textarea
          value={justification}
          onChange={e => setJustification(e.target.value)}
          placeholder="Why did you pick this? (optional)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(var(--fg-rgb), 0.08)',
            background: 'rgba(var(--fg-rgb), 0.03)',
            color: 'var(--text-strong)',
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
            onClick={() => { setSelected(null); setAlreadyWatched(false); setQueueSourceId(null) }}
            style={{
              flex: 1, padding: '11px',
              borderRadius: '10px',
              border: '1px solid rgba(var(--fg-rgb), 0.1)',
              background: 'transparent',
              color: 'var(--text-dim)',
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
              background: saving ? 'rgba(var(--fg-rgb), 0.06)' : 'var(--accent)',
              color: saving ? 'var(--text-faint)' : 'var(--text-strong)',
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
        fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
        fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
        margin: '0 0 14px',
      }}>
        Pick for {nextMonthLabel}
      </p>

      {/* Quick-pick from your draft queue (private, ranked pick ideas).
          Hidden once you start typing so search results take over. */}
      {queue.length > 0 && !query.trim() && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{
            fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em',
            margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ color: 'var(--accent)' }}>★</span> From your draft queue
          </p>
          <div style={{
            borderRadius: '12px',
            border: '1px solid rgba(var(--accent-rgb, 99,102,241),0.25)',
            overflow: 'hidden',
            background: 'rgba(var(--accent-rgb, 99,102,241),0.04)',
          }}>
            {queue.map((item, i) => (
              <button
                key={item.id}
                onClick={() => selectFromQueue(item)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px',
                  background: 'transparent', border: 'none',
                  borderBottom: i < queue.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  flexShrink: 0, width: '16px', textAlign: 'center',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', color: 'var(--accent)',
                }}>
                  {i + 1}
                </span>
                <div style={{
                  flexShrink: 0, width: '34px', height: '50px',
                  borderRadius: '5px', overflow: 'hidden', background: 'var(--surface-2)',
                }}>
                  {item.poster_url ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${item.poster_url}`}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '10px' }}>
                        {initials(item.title)}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
                    fontWeight: 500, fontSize: '14px', margin: '0 0 2px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </p>
                  <p style={{
                    fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
                    fontSize: '11px', margin: 0,
                  }}>
                    {item.year_released ?? ''}
                  </p>
                </div>
                <span style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: '15px' }}>→</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0 4px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(var(--fg-rgb), 0.08)' }} />
            <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', letterSpacing: '0.1em' }}>OR SEARCH</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(var(--fg-rgb), 0.08)' }} />
          </div>
        </div>
      )}

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
            border: '1px solid rgba(var(--fg-rgb), 0.1)',
            background: 'rgba(var(--fg-rgb), 0.04)',
            color: 'var(--text-strong)',
            fontFamily: "'DM Sans',sans-serif",
            fontSize: '14px',
            outline: 'none',
          }}
        />
        {searching && (
          <div style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            width: '14px', height: '14px',
            border: '2px solid rgba(var(--fg-rgb), 0.1)',
            borderTop: '2px solid rgba(var(--fg-rgb), 0.4)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
        )}
      </div>

      {detailLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton style={{ height: '80px' }} />
        </div>
      )}

      {!detailLoading && searchResults.length > 0 && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid rgba(var(--fg-rgb), 0.07)',
          overflow: 'hidden',
          background: 'rgba(var(--fg-rgb), 0.02)',
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
                borderBottom: i < searchResults.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                flexShrink: 0, width: '36px', height: '52px',
                borderRadius: '5px', overflow: 'hidden', background: 'var(--surface-2)',
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
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '10px' }}>
                      {initials(r.title)}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
                  fontWeight: 500, fontSize: '14px',
                  margin: '0 0 2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.title}
                </p>
                <p style={{
                  fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
                  fontSize: '11px', margin: 0,
                }}>
                  {r.release_date ? r.release_date.slice(0, 4) : 'Unknown year'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!detailLoading && !searching && query.trim().length > 1 && searchResults.length === 0 && (
        <p style={{
          fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)',
          fontSize: '13px', textAlign: 'center', padding: '24px 0',
        }}>
          No films found for "{query}"
        </p>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Pick Submission Modal ────────────────────────────────────────────────────

function PickModal({ profile, nextMonth, monthIsActive, onClose, onPickSaved }) {
  return (
    <div
      className="mc-modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mc-modal-panel" style={{
        background: 'var(--surface-3)',
        border: '1px solid rgba(var(--fg-rgb), 0.08)',
        borderRadius: '20px',
        maxWidth: '600px',
        padding: '20px 16px 32px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem',
            color: 'var(--text-strong)', margin: 0, letterSpacing: '0.03em',
          }}>
            Pick Your Film
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(var(--fg-rgb), 0.07)',
              border: 'none',
              borderRadius: '50%',
              width: '30px', height: '30px',
              color: 'var(--text-muted)',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {nextMonth ? (
          <PickSubmissionFlow
            profile={profile}
            nextMonth={nextMonth}
            monthIsActive={monthIsActive}
            onPickSaved={onPickSaved}
            onCancel={onClose}
          />
        ) : (
          <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px' }}>
            No upcoming month has been configured yet.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Picks Tab ────────────────────────────────────────────────────────────────

function PicksTab({ profile, onOpenFilm, onMaterialized }) {
  const [nextMonth, setNextMonth] = useState(null)
  const [monthIsActive, setMonthIsActive] = useState(false)
  const [monthLoading, setMonthLoading] = useState(true)
  const [picks, setPicks] = useState([])
  const [picksLoading, setPicksLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [expandedPickId, setExpandedPickId] = useState(null) // pick whose justification is shown
  const [myOpenPicks, setMyOpenPicks] = useState([]) // films I picked that still need my score predictions

  // Predictions are picker-only and attach to the movie (which exists once the admin
  // creates the month). Surface a nudge here routing the picker to the film overlay to predict.
  useEffect(() => {
    if (!profile) return
    let alive = true
    ;(async () => {
      try {
        const { data: mine } = await supabase
          .from('movies')
          .select('id, title, poster_url, scores_revealed, picker_revealed')
          .eq('picked_by_user_id', profile.id)
          .eq('scores_revealed', false)
        if (!alive) return
        if (!mine?.length) { setMyOpenPicks([]); return }
        const ids = mine.map(m => m.id)
        const { data: preds } = await supabase
          .from('score_predictions')
          .select('movie_id')
          .eq('predicting_user_id', profile.id)
          .in('movie_id', ids)
        const predicted = new Set((preds ?? []).map(p => p.movie_id))
        if (alive) setMyOpenPicks(mine.filter(m => !predicted.has(m.id)))
      } catch {
        if (alive) setMyOpenPicks([])
      }
    })()
    return () => { alive = false }
  }, [profile])

  async function loadNextMonthAndPicks() {
    setMonthLoading(true)
    setPicksLoading(true)

    // Target month for picking: the active month if one exists (picks materialize into
    // films immediately), otherwise the next upcoming month (picks stay queued until the
    // admin activates that month).
    const { data: active } = await supabase
      .from('months')
      .select('id, month_year')
      .eq('status', 'active')
      .order('month_year', { ascending: false })
      .limit(1)
      .maybeSingle()

    let month = active ?? null
    let isActive = !!active
    if (!month) {
      const { data: upcoming } = await supabase
        .from('months')
        .select('id, month_year')
        .eq('status', 'upcoming')
        .order('month_year', { ascending: true })
        .limit(1)
        .maybeSingle()
      month = upcoming ?? null
      isActive = false
    }

    setNextMonth(month)
    setMonthIsActive(isActive)
    setMonthLoading(false)

    if (month) {
      // Picks readable here follow RLS: a regular member only sees their OWN upcoming pick;
      // admins see all. The viewer's own pick is therefore always visible, while others stay
      // hidden until reveal. Join user info for the picker label/color.
      const { data: picksData } = await supabase
        .from('upcoming_picks')
        .select('id, user_id, tmdb_id, title, poster_url, month_target, metadata, submitted_at, users(name, email)')
        .eq('month_target', month.month_year)
        .order('submitted_at', { ascending: true })
      // Test account must be invisible in all UI — filter by email.
      setPicks((picksData ?? []).filter(p => p.users?.email !== 'i.am.ryan.the.miller@gmail.com'))
    } else {
      setPicks([])
    }
    setPicksLoading(false)
  }

  useEffect(() => {
    loadNextMonthAndPicks()
  }, [])

  const nextMonthLabel = nextMonth ? formatMonthLabel(nextMonth.month_year) : ''
  const loading = monthLoading || picksLoading

  // The viewer's own pick is always visible (RLS guarantees it's readable). Other
  // members' upcoming picks are intentionally never displayed in this view (they're
  // secret until the end-of-month reveal) — so the admin "read all" RLS policy can't
  // spoil the surprise here.
  const myPick = profile ? picks.find(p => p.user_id === profile.id) ?? null : null

  return (
    <div>
      {/* Picker nudge: predict everyone's scores for your own pick (opens the film overlay) */}
      {onOpenFilm && myOpenPicks.map(film => (
        <button
          key={film.id}
          onClick={() => onOpenFilm(film)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            padding: '12px 14px', borderRadius: '12px',
            border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.08)',
            color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif",
            fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginBottom: '12px', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '15px' }}>🎬</span>
          <span style={{ flex: 1 }}>You picked “{film.title}” — predict how everyone will score it</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '16px' }}>→</span>
        </button>
      ))}

      {/* CTA button — only shown when the viewer has not yet picked for this month */}
      {!loading && nextMonth && !myPick && (
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '13px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(var(--accent-rgb, 99,102,241),0.4)',
            background: 'rgba(var(--accent-rgb, 99,102,241),0.08)',
            color: 'var(--text-strong)',
            fontFamily: "'DM Sans',sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '20px',
            textAlign: 'left',
            transition: 'background 0.15s ease',
          }}
        >
          <span style={{ flex: 1 }}>Pick your next movie</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '16px' }}>→</span>
        </button>
      )}

      {/* Picks list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[...Array(5)].map((_, i) => <Skeleton key={i} style={{ height: '72px' }} />)}
        </div>
      ) : !nextMonth ? (
        <div style={{
          textAlign: 'center', padding: '32px 0',
          fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px',
        }}>
          No upcoming month configured yet.
        </div>
      ) : (
        <>
          {/* Only the viewer's OWN pick is shown here. Other members' upcoming picks
              are secret until the end-of-month reveal (surfaced by the Reveal section,
              gated on picker_revealed) — they are NOT shown here even to admins, so the
              surprise isn't spoiled in this member-facing view. */}
          {myPick ? (
            <div>
              <p style={{
                fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
                fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
                margin: '0 0 12px',
              }}>
                Your pick for {nextMonthLabel}
              </p>
              <PickRow
                pick={myPick}
                isOwn
                expanded={expandedPickId === myPick.id}
                onToggle={() => setExpandedPickId(id => id === myPick.id ? null : myPick.id)}
                onChange={() => setShowModal(true)}
              />
            </div>
          ) : (
            <div style={{
              textAlign: 'center', padding: '32px 0',
              fontFamily: "'DM Sans',sans-serif", color: 'var(--hairline)', fontSize: '14px',
            }}>
              You haven’t picked a film for {nextMonthLabel} yet.
            </div>
          )}
        </>
      )}

      {/* Pick modal */}
      {showModal && (
        <PickModal
          profile={profile}
          nextMonth={nextMonth}
          monthIsActive={monthIsActive}
          onClose={() => setShowModal(false)}
          onPickSaved={() => {
            loadNextMonthAndPicks()
            // If the month is active, the pick just materialized into a film and the
            // deadlines were re-split — refresh the parent so the Films/Deadlines tabs reflect it.
            if (monthIsActive && onMaterialized) onMaterialized()
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Pick Row (a single upcoming pick; expandable justification) ───────────────

function PickRow({ pick, isOwn = false, expanded, onToggle, onChange }) {
  const meta = pick.metadata ?? {}
  const pickerName = pick.users?.name ?? 'Unknown'
  const pickerColor = MEMBER_COLORS[pickerName]
  const justification = meta.justification

  return (
    <div style={{
      borderRadius: '14px',
      background: 'rgba(var(--fg-rgb), 0.025)',
      border: '1px solid rgba(var(--fg-rgb), 0.07)',
      borderLeft: pickerColor ? `3px solid ${pickerColor}` : '1px solid rgba(var(--fg-rgb), 0.07)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', gap: '12px', width: '100%',
          padding: '12px',
          background: 'transparent', border: 'none',
          textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        {/* Poster */}
        <div style={{
          flexShrink: 0, width: '44px', height: '62px',
          borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)',
        }}>
          {pick.poster_url ? (
            <img
              src={`https://image.tmdb.org/t/p/w185${pick.poster_url}`}
              alt={pick.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '11px' }}>
                {initials(pick.title)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "'DM Sans',sans-serif", color: 'var(--text-strong)',
            fontWeight: 500, fontSize: '14px',
            margin: '0 0 2px', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {pick.title}
          </p>
          <p style={{
            fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)',
            fontSize: '11px', margin: '0 0 4px',
          }}>
            {[meta.year, meta.director].filter(Boolean).join(' · ')}
          </p>
          <p style={{
            fontFamily: "'DM Mono',monospace",
            fontSize: '10px',
            margin: 0,
            color: pickerColor ?? 'var(--text-dim)',
          }}>
            {isOwn ? 'You' : pickerName}
          </p>
        </div>

        {/* Expand chevron (only when there's a justification to reveal) */}
        {justification && (
          <span style={{
            flexShrink: 0, alignSelf: 'center',
            color: 'var(--text-faint)', fontSize: '14px',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}>
            ⌄
          </span>
        )}
      </button>

      {/* Expanded: justification + (own pick only) change affordance */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: '1px solid rgba(var(--fg-rgb), 0.05)',
        }}>
          {justification ? (
            <p style={{
              fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)',
              fontSize: '13px', lineHeight: 1.5, margin: '12px 0 0',
            }}>
              “{justification}”
            </p>
          ) : (
            <p style={{
              fontFamily: "'DM Sans',sans-serif", color: 'var(--text-faint)',
              fontSize: '12px', fontStyle: 'italic', margin: '12px 0 0',
            }}>
              No justification given.
            </p>
          )}
          {isOwn && onChange && (
            <button
              onClick={onChange}
              style={{
                marginTop: '12px',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(var(--fg-rgb), 0.1)',
                background: 'transparent',
                color: 'var(--text-dim)',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              Change pick
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ThisMonth() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [movies, setMovies] = useState([])
  const [ratingsMap, setRatingsMap] = useState({}) // movie_id → rating row
  const [activeMonth, setActiveMonth] = useState(null)
  const [revealMonth, setRevealMonth] = useState(null) // latest fully-revealed month
  const [users, setUsers] = useState([])

  // Score modal state
  const [modalMovie, setModalMovie] = useState(null)
  const [modalRating, setModalRating] = useState(null)

  // Film detail overlay (opened by the picker-predict nudge in the Picks tab)
  const [selectedMovie, setSelectedMovie] = useState(null)

  const loadData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [{ data: month }, { data: revealed }, { data: ratings }, { data: usersData }] = await Promise.all([
      supabase.from('months').select('id, month_year').eq('status', 'active').maybeSingle(),
      supabase.from('months').select('id, month_year').eq('status', 'revealed')
        .order('month_year', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ratings')
        .select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
        .eq('user_id', profile.id),
      supabase.from('users').select('id, name, email'),
    ])

    setActiveMonth(month)
    setRevealMonth(revealed ?? null)
    // Test account must be invisible in all UI — filter by email.
    setUsers((usersData ?? []).filter(u => u.email !== 'i.am.ryan.the.miller@gmail.com'))

    if (month) {
      const { data: movieData } = await supabase
        .from('movies_safe')
        .select('id, month_id, title, poster_url, genre, director, year_released, scores_revealed, picker_revealed, historical_avg_score, scoring_deadline, picked_by_user_id')
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

  const revealMonthLabel = revealMonth?.month_year
    ? new Date(`${revealMonth.month_year}-02`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  // Reveal tab is active only once a month's end-of-month reveal has happened.
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
            fontFamily: "'DM Mono',monospace", color: 'var(--hairline)',
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em',
            margin: '0 0 4px',
          }}>
            {monthLabel}
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.6rem',
            color: 'var(--text-strong)', lineHeight: 1, margin: 0, letterSpacing: '0.03em',
          }}>
            This Month
          </h1>
        </div>

        {/* Single consolidated view: this month's films (with inline deadlines +
            picker reveal), then your next pick, then the end-of-month reveal. */}
        <div style={{ animation: 'fadeUp 0.3s ease both', display: 'flex', flexDirection: 'column', gap: '34px' }}>
          <FilmsTab
            movies={movies}
            ratingsMap={ratingsMap}
            loading={loading}
            onScorePress={openModal}
            onOpen={setSelectedMovie}
            users={users}
            profile={profile}
            activeMonth={activeMonth}
          />

          <section>
            <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 14px' }}>
              Your Pick
            </p>
            <PicksTab profile={profile} onOpenFilm={setSelectedMovie} onMaterialized={loadData} />
          </section>

          {revealMonth && (
            <section>
              <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 14px' }}>
                Reveal · {revealMonthLabel}
              </p>
              <MonthReveal
                monthId={revealMonth.id}
                monthLabel={revealMonthLabel}
                users={users}
                currentUserId={profile?.id}
              />
            </section>
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

      {/* Film overlay — opened by the picker-predict nudge */}
      <FilmDetailOverlay movie={selectedMovie} onClose={() => setSelectedMovie(null)} />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
