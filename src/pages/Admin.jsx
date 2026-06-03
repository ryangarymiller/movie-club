import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { writeAwardsToDb } from '../lib/awards'
import { ScoreChangeRequestsAdminPanel } from '../components/ScoreChangeRequest'

if (!document.getElementById('mc-fonts')) {
  const link = document.createElement('link')
  link.id = 'mc-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const PROTECTED_EMAIL = 'ryan.gary.miller@gmail.com'
const TEST_USER_EMAIL = 'i.am.ryan.the.miller@gmail.com'

// Zack joined April 2026 — exclude him from pre-April films
const ZACK_NAME = 'Zack Anjoorian'
const ZACK_JOIN_MONTH = '2026-04' // first month Zack is included

// Members joined_at cutoffs for expected-score calculations
// Always excludes the test user. Uses joined_at logic to handle Zack's April join.
function expectedMemberCount(monthYear, allUsers) {
  return allUsers.filter(u => {
    if (!u.is_active) return false
    if (u.email === TEST_USER_EMAIL) return false
    if (isZackPreApril(u, monthYear)) return false
    return joinedByMonth(u, monthYear)
  }).length
}

// Whether a given user is Zack and the film is pre-April 2026
function isZackPreApril(user, monthYear) {
  if (user.name !== ZACK_NAME) return false
  return monthYear < ZACK_JOIN_MONTH
}

// Was a user a club member during a given film month?
// Compares by year-month string (not raw Date objects) to avoid the UTC-vs-local
// midnight skew that made same-month joiners (e.g. joined Jan 5 for a Jan film)
// register as "not yet a member" and render as a dash. A user counts as expected
// if the month they joined is <= the film's month.
function joinedByMonth(user, monthYear) {
  if (!user.joined_at || !monthYear) return false
  const joinedMonth = String(user.joined_at).slice(0, 7) // 'YYYY-MM'
  return joinedMonth <= monthYear
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />
}

function Label({ children }) {
  return (
    <span style={{ fontSize: '9px', letterSpacing: '0.14em', fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function Badge({ children, color = 'green' }) {
  const colors = {
    green: { background: '#14532d', color: '#4ade80', border: '1px solid #166534' },
    red: { background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d' },
    yellow: { background: '#422006', color: '#fbbf24', border: '1px solid #78350f' },
    gray: { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--hairline)' },
  }
  return (
    <span style={{ ...colors[color], borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontFamily: "'DM Mono',monospace" }}>
      {children}
    </span>
  )
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: value ? 'var(--accent)' : 'var(--hairline)', position: 'relative', transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: value ? '18px' : '2px',
        width: '16px', height: '16px', borderRadius: '50%', background: 'var(--text-strong)', transition: 'left 0.2s',
      }} />
    </button>
  )
}

function ErrorBanner({ msg, onClose }) {
  if (!msg) return null
  return (
    <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#f87171', fontSize: '13px' }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '16px' }}>×</button>
    </div>
  )
}

function SuccessBanner({ msg, onClose }) {
  if (!msg) return null
  return (
    <div style={{ background: '#14532d', border: '1px solid #166534', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#4ade80', fontSize: '13px' }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '16px' }}>×</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 1 — Dashboard
// ─────────────────────────────────────────────
// Activate a month: set status='active', set active_date (default the 1st, editable),
// and materialize its upcoming picks into movies + split deadlines via the RPC.
// Deadlines are NOT enforced yet (dev mode) — they are just computed/shown.
function MonthActivationPanel({ months, onRefresh, setError, setSuccess }) {
  const sortedMonths = [...months].sort((a, b) => b.month_year.localeCompare(a.month_year))
  const [targetId, setTargetId] = useState('')
  const [activeDate, setActiveDate] = useState('')
  const [busy, setBusy] = useState(false)

  const target = months.find(m => m.id === targetId) || null

  // Default the active_date for a month: its existing active_date, or the 1st of that month
  // (months.month_year is 'YYYY-MM').
  function defaultActiveDate(mo) {
    if (!mo) return ''
    return mo.active_date ? String(mo.active_date).slice(0, 10) : `${mo.month_year}-01`
  }

  function onSelectMonth(id) {
    setTargetId(id)
    setActiveDate(defaultActiveDate(months.find(m => m.id === id)))
  }

  async function saveActiveDate() {
    if (!target) return
    setBusy(true)
    const { error } = await supabase.from('months').update({ active_date: activeDate || null }).eq('id', target.id)
    setBusy(false)
    if (error) setError('Failed to save active date: ' + error.message)
    else { setSuccess('Active date saved'); onRefresh() }
  }

  async function activateNow() {
    if (!target) return
    setBusy(true)
    // 1) Set status + active_date.
    const { error: updErr } = await supabase
      .from('months')
      .update({ status: 'active', active_date: activeDate || defaultActiveDate(target) })
      .eq('id', target.id)
    if (updErr) {
      setBusy(false)
      setError('Failed to activate month: ' + updErr.message)
      return
    }
    // 2) Materialize upcoming picks into movies + split deadlines evenly by film count.
    const { error: rpcErr } = await supabase.rpc('materialize_and_split_month', { p_month_id: target.id })
    setBusy(false)
    if (rpcErr) {
      setError('Month set active, but materialize/split failed: ' + rpcErr.message)
    } else {
      setSuccess(`${target.month_year} is now active — picks materialized and deadlines split.`)
    }
    onRefresh()
  }

  const fieldStyle = {
    display: 'block', width: '100%', marginTop: '6px', padding: '9px 10px', borderRadius: '8px',
    background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
    color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
      <Label>Month Activation</Label>
      <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '8px 0 12px', fontFamily: "'DM Mono',monospace" }}>
        Sets the month active, records its active date, and materializes upcoming picks into films with deadlines split evenly. Deadlines are not enforced yet (dev mode).
      </p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <Label>Target month</Label>
          <select value={targetId} onChange={e => onSelectMonth(e.target.value)} style={fieldStyle}>
            <option value="">Select month…</option>
            {sortedMonths.map(mo => (
              <option key={mo.id} value={mo.id}>
                {mo.month_year}{mo.status === 'active' ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <Label>Active date</Label>
          <input
            type="date"
            value={activeDate}
            disabled={!target}
            onChange={e => setActiveDate(e.target.value)}
            style={{ ...fieldStyle, fontFamily: "'DM Mono',monospace", opacity: target ? 1 : 0.5 }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
        <button
          onClick={activateNow}
          disabled={!target || busy}
          style={{
            padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--accent)',
            color: 'var(--text-strong)', fontSize: '13px', fontWeight: 500,
            cursor: (!target || busy) ? 'not-allowed' : 'pointer', opacity: (!target || busy) ? 0.6 : 1,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {busy ? 'Working…' : 'Activate / Trigger now'}
        </button>
        <button
          onClick={saveActiveDate}
          disabled={!target || busy}
          title="Save the active date without re-running materialization"
          style={{
            padding: '9px 14px', borderRadius: '8px', border: '1px solid rgba(var(--fg-rgb), 0.12)',
            background: 'transparent', color: (!target || busy) ? 'var(--text-faint)' : 'var(--text-muted)',
            fontSize: '12px', cursor: (!target || busy) ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace",
          }}
        >
          Save active date only
        </button>
      </div>
    </div>
  )
}

function DashboardTab({ movies, ratings, users, months, onBackfillFilm, onRefresh, setError, setSuccess }) {
  const totalFilms = movies.length
  const totalRatings = ratings.length
  const vaultFilms = movies.filter(m => {
    const scores = ratings.filter(r => r.movie_id === m.id).map(r => r.score)
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : m.historical_avg_score
    return avg >= 8.5
  })

  // Build month lookup
  const monthMap = {}
  months.forEach(mo => { monthMap[mo.id] = mo })

  // Non-test users only
  const activeUsers = users.filter(u => u.email !== TEST_USER_EMAIL)

  // Films with missing scores
  const missingScoreFilms = movies.filter(m => {
    const mo = monthMap[m.month_id]
    if (!mo) return false
    const expected = expectedMemberCount(mo.month_year, activeUsers)
    const actual = ratings.filter(r => {
      if (r.movie_id !== m.id || r.score == null) return false
      // Exclude test user
      const ratingUser = activeUsers.find(u => u.id === r.user_id)
      if (!ratingUser) return false
      // Exclude Zack on pre-April films
      if (isZackPreApril(ratingUser, mo.month_year)) return false
      return true
    }).length
    return actual < expected
  }).map(m => {
    const mo = monthMap[m.month_id]
    const expected = mo ? expectedMemberCount(mo.month_year, activeUsers) : 0
    const actual = ratings.filter(r => {
      if (r.movie_id !== m.id || r.score == null) return false
      const ratingUser = activeUsers.find(u => u.id === r.user_id)
      if (!ratingUser) return false
      if (isZackPreApril(ratingUser, mo?.month_year ?? '')) return false
      return true
    }).length
    return { ...m, expected, actual, month_year: mo?.month_year }
  })

  const activeMonth = months.find(m => m.status === 'active')
  const activeMovies = activeMonth ? movies.filter(m => m.month_id === activeMonth.id) : []
  const deadlinesSet = activeMovies.filter(m => m.scoring_deadline).length

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Total Films', value: totalFilms },
          { label: 'Total Ratings', value: totalRatings },
          { label: 'Members', value: activeUsers.length },
          { label: 'The Vault', value: vaultFilms.length, sub: 'avg ≥ 8.5' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '14px' }}>
            <Label>{s.label}</Label>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.2rem', color: 'var(--text-strong)', margin: '4px 0 0', lineHeight: 1 }}>{s.value}</p>
            {s.sub && <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '2px' }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Active month status */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <Label>Active Month</Label>
        {activeMonth ? (
          <div style={{ marginTop: '8px' }}>
            <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '15px', margin: '0 0 6px' }}>
              {activeMonth.month_year}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge color="gray">{activeMovies.length} films</Badge>
              <Badge color={deadlinesSet === activeMovies.length && activeMovies.length > 0 ? 'green' : 'yellow'}>
                {deadlinesSet}/{activeMovies.length} deadlines set
              </Badge>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '8px' }}>No active month</p>
        )}
      </div>

      {/* Month activation (set active, edit active_date, materialize + split deadlines) */}
      <MonthActivationPanel
        months={months}
        onRefresh={onRefresh}
        setError={setError}
        setSuccess={setSuccess}
      />

      {/* Missing scores */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px' }}>
        <Label>Films with Missing Scores</Label>
        {missingScoreFilms.length === 0 ? (
          <p style={{ color: '#4ade80', fontSize: '13px', marginTop: '10px' }}>All films fully scored</p>
        ) : (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {missingScoreFilms.map(f => (
              <button
                key={f.id}
                onClick={() => onBackfillFilm?.(f.id)}
                title="Open the Scores tab to backfill this film"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px',
                  border: '1px solid rgba(var(--fg-rgb), 0.08)', background: 'rgba(var(--fg-rgb), 0.02)',
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'var(--text-strong)', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '2px 0 0', fontFamily: "'DM Mono',monospace" }}>{f.month_year} · tap to backfill</p>
                </div>
                <Badge color="red">{f.actual}/{f.expected}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pending score-change requests (member → admin approval) */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px' }}>
        <Label>Score-Change Requests</Label>
        <div style={{ marginTop: '10px' }}>
          <ScoreChangeRequestsAdminPanel />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Awards helper — fetch full dataset and write to DB (fire-and-forget)
// ─────────────────────────────────────────────
async function triggerAwardsWrite() {
  try {
    const [
      { data: movies },
      { data: ratings },
      { data: users },
      { data: months },
      { data: seasons },
      { data: guesses },
    ] = await Promise.all([
      supabase.from('movies').select('*').order('id'),
      supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, submitted_at'),
      supabase.from('users').select('id, name, email, role, joined_at, is_active'),
      supabase.from('months').select('id, season_id, month_year, status').order('month_year'),
      supabase.from('seasons').select('*').order('start_date'),
      supabase.from('picker_guesses').select('movie_id, guessing_user_id, guessed_user_id'),
    ])
    const { count, error } = await writeAwardsToDb(supabase, {
      movies: movies ?? [],
      ratings: ratings ?? [],
      users: users ?? [],
      months: months ?? [],
      seasons: seasons ?? [],
      guesses: guesses ?? [],
    })
    if (error) {
      console.error('[awards] write failed', error)
    } else {
      console.log('[awards] wrote', count, 'records')
    }
  } catch (e) {
    console.error('[awards] unexpected error', e)
  }
}

// ─────────────────────────────────────────────
// TAB 2 — Films
// ─────────────────────────────────────────────
function FilmsTab({ movies, ratings, months, onRefresh, setError, setSuccess }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [refreshingId, setRefreshingId] = useState(null)
  const [refetchingId, setRefetchingId] = useState(null)
  const [backfillStatus, setBackfillStatus] = useState(null) // null | 'running' | 'done'
  const [backfillMsg, setBackfillMsg] = useState('')

  // Bulk reveal state
  const [selectedBulkMonth, setSelectedBulkMonth] = useState('')
  const [bulkRevealing, setBulkRevealing] = useState(null) // 'scores' | 'pickers' | null

  const monthMap = {}
  months.forEach(mo => { monthMap[mo.id] = mo })

  // Group movies by month
  const grouped = {}
  movies.forEach(m => {
    const key = monthMap[m.month_id]?.month_year ?? 'Unknown'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  })
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  function startEdit(movie) {
    setEditingId(movie.id)
    let deadlineLocal = ''
    if (movie.scoring_deadline) {
      const d = new Date(movie.scoring_deadline)
      const pad = n => String(n).padStart(2, '0')
      deadlineLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setEditForm({
      scoring_deadline: deadlineLocal,
      scores_revealed: movie.scores_revealed ?? false,
      picker_revealed: movie.picker_revealed ?? false,
      historical_avg_score: movie.historical_avg_score ?? '',
      // Film metadata (TMDB-sourced fields)
      title: movie.title ?? '',
      poster_url: movie.poster_url ?? '',
      overview: movie.overview ?? '',
      year_released: movie.year_released ?? '',
      director: movie.director ?? '',
      runtime: movie.runtime ?? '',
      tmdb_id: movie.tmdb_id ?? '',
      genre: Array.isArray(movie.genre) ? movie.genre.join(', ') : (movie.genre ?? ''),
    })
  }

  async function saveEdit(movieId) {
    setSaving(true)
    const updates = {
      scores_revealed: editForm.scores_revealed,
      picker_revealed: editForm.picker_revealed,
    }
    if (editForm.historical_avg_score !== '') {
      const v = parseFloat(editForm.historical_avg_score)
      if (!isNaN(v)) updates.historical_avg_score = v
    } else {
      updates.historical_avg_score = null
    }
    if (editForm.scoring_deadline) {
      updates.scoring_deadline = new Date(editForm.scoring_deadline).toISOString()
    } else {
      updates.scoring_deadline = null
    }

    // Film metadata (TMDB-sourced fields)
    updates.title = editForm.title?.trim() || null
    updates.poster_url = editForm.poster_url?.trim() || null
    updates.overview = editForm.overview?.trim() || null
    updates.director = editForm.director?.trim() || null
    updates.genre = editForm.genre
      ? editForm.genre.split(',').map(s => s.trim()).filter(Boolean)
      : []

    if (editForm.year_released !== '' && editForm.year_released != null) {
      const y = parseInt(editForm.year_released, 10)
      updates.year_released = isNaN(y) ? null : y
    } else {
      updates.year_released = null
    }
    if (editForm.runtime !== '' && editForm.runtime != null) {
      const r = parseInt(editForm.runtime, 10)
      updates.runtime = isNaN(r) ? null : r
    } else {
      updates.runtime = null
    }
    if (editForm.tmdb_id !== '' && editForm.tmdb_id != null) {
      const t = parseInt(editForm.tmdb_id, 10)
      updates.tmdb_id = isNaN(t) ? null : t
    } else {
      updates.tmdb_id = null
    }

    if (!updates.title) {
      setSaving(false)
      setError('Title is required')
      return
    }

    const prevMovie = movies.find(m => m.id === movieId)
    const { error } = await supabase.from('movies').update(updates).eq('id', movieId)
    setSaving(false)
    if (error) {
      setError('Failed to save: ' + error.message)
    } else {
      setSuccess('Film updated')
      setEditingId(null)
      onRefresh()
      // Trigger awards write if picker_revealed just turned on.
      // Also trigger if scores_revealed just turned on and picker is already/now revealed for this film's month.
      const pickerJustRevealed = !prevMovie?.picker_revealed && updates.picker_revealed
      const scoresJustRevealed = !prevMovie?.scores_revealed && updates.scores_revealed
      if (pickerJustRevealed) {
        triggerAwardsWrite()
      } else if (scoresJustRevealed) {
        // Check if all films in this movie's month have picker_revealed (including this one which now does/doesn't)
        const movieMonth = prevMovie?.month_id
        const siblingFilms = movies.filter(m => m.month_id === movieMonth && m.id !== movieId)
        const pickerRevealedForMonth = updates.picker_revealed && siblingFilms.every(m => m.picker_revealed)
        if (pickerRevealedForMonth) triggerAwardsWrite()
      }
    }
  }

  // Re-fetch streaming providers from TMDB (US) and cache on the film.
  // Mirrors the auth/token approach used in Films.jsx (Bearer read-access token).
  async function refreshProviders(movie) {
    if (!movie.tmdb_id) {
      setError('No TMDB ID set for this film — add one and save before refreshing providers.')
      return
    }
    setRefreshingId(movie.id)
    try {
      const tmdbToken = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
      const resp = await fetch(
        `https://api.themoviedb.org/3/movie/${movie.tmdb_id}/watch/providers`,
        { headers: { Authorization: `Bearer ${tmdbToken}` } }
      )
      if (!resp.ok) {
        throw new Error(`TMDB returned ${resp.status}`)
      }
      const tmdbData = await resp.json()
      const us = tmdbData?.results?.US ?? null
      const providersData = {
        flatrate: (us?.flatrate ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
        rent:     (us?.rent     ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
        buy:      (us?.buy      ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
      }
      const hasAny = providersData.flatrate.length > 0 || providersData.rent.length > 0 || providersData.buy.length > 0

      const { error } = await supabase
        .from('movies')
        .update({ streaming_providers: providersData })
        .eq('id', movie.id)
      if (error) throw error

      setSuccess(hasAny
        ? 'Streaming providers refreshed'
        : 'No US providers found on TMDB — saved empty result')
      onRefresh()
    } catch (e) {
      setError('Failed to refresh providers: ' + (e.message ?? 'unknown error'))
    } finally {
      setRefreshingId(null)
    }
  }

  async function refetchFromTmdb(movie) {
    const tmdbId = editForm.tmdb_id || movie.tmdb_id
    if (!tmdbId) {
      setError('No TMDB ID set for this film — add one and save before re-fetching.')
      return
    }
    setRefetchingId(movie.id)
    try {
      const tmdbToken = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
      const resp = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=credits`,
        { headers: { Authorization: `Bearer ${tmdbToken}` } }
      )
      if (!resp.ok) throw new Error(`TMDB returned ${resp.status}`)
      const data = await resp.json()

      const director = data.credits?.crew?.find(c => c.job === 'Director')?.name ?? editForm.director
      const genreNames = (data.genres ?? []).map(g => g.name)

      setEditForm(f => ({
        ...f,
        title: data.title ?? f.title,
        overview: data.overview ?? f.overview,
        poster_url: data.poster_path ?? f.poster_url,
        year_released: data.release_date ? new Date(data.release_date).getFullYear() : f.year_released,
        runtime: data.runtime ?? f.runtime,
        director: director ?? f.director,
        genre: genreNames.length > 0 ? genreNames.join(', ') : f.genre,
      }))
      setSuccess('Metadata fetched from TMDB — review and save.')
    } catch (e) {
      setError('Failed to fetch from TMDB: ' + (e.message ?? 'unknown error'))
    } finally {
      setRefetchingId(null)
    }
  }

  async function backfillGenres() {
    const toBackfill = movies.filter(m => m.tmdb_id && (!m.genre || m.genre.length === 0))
    if (toBackfill.length === 0) {
      setBackfillMsg('All films already have genre data.')
      setBackfillStatus('done')
      return
    }
    setBackfillStatus('running')
    setBackfillMsg(`Backfilling ${toBackfill.length} film${toBackfill.length !== 1 ? 's' : ''}…`)

    const tmdbToken = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
    let done = 0
    let errors = 0

    for (const movie of toBackfill) {
      try {
        const resp = await fetch(
          `https://api.themoviedb.org/3/movie/${movie.tmdb_id}`,
          { headers: { Authorization: `Bearer ${tmdbToken}` } }
        )
        if (!resp.ok) throw new Error(`TMDB ${resp.status}`)
        const data = await resp.json()
        const genreNames = (data.genres ?? []).map(g => g.name)
        if (genreNames.length > 0) {
          const { error } = await supabase
            .from('movies')
            .update({ genre: genreNames })
            .eq('id', movie.id)
          if (error) throw error
        }
        done++
        setBackfillMsg(`Backfilling… ${done}/${toBackfill.length} done`)
      } catch (e) {
        errors++
        console.error(`Genre backfill failed for ${movie.title}:`, e)
      }
      // Rate-limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200))
    }

    setBackfillStatus('done')
    setBackfillMsg(`Done — ${done} film${done !== 1 ? 's' : ''} updated${errors > 0 ? `, ${errors} failed (see console)` : ''}`)
    onRefresh()
  }

  async function bulkReveal(type) {
    if (!selectedBulkMonth) return
    const monthRow = months.find(m => m.month_year === selectedBulkMonth)
    if (!monthRow) return

    const moviesInMonth = movies.filter(m => m.month_id === monthRow.id)
    if (moviesInMonth.length === 0) {
      setError('No films found for that month.')
      return
    }

    setBulkRevealing(type)
    const field = type === 'scores' ? 'scores_revealed' : 'picker_revealed'
    const label = type === 'scores' ? 'scores' : 'pickers'

    const { error } = await supabase
      .from('movies')
      .update({ [field]: true })
      .in('id', moviesInMonth.map(m => m.id))

    setBulkRevealing(null)
    if (error) {
      setError(`Failed to reveal ${label}: ` + error.message)
    } else {
      setSuccess(`All ${label} revealed for ${selectedBulkMonth}`)
      onRefresh()
      // Recompute and persist awards whenever pickers are revealed (full reveal).
      // Also trigger on scores reveal if all films in the month already have picker_revealed.
      if (type === 'pickers') {
        triggerAwardsWrite()
      } else if (type === 'scores') {
        // Only write awards if every film in this month already has picker_revealed
        const allPickersRevealed = moviesInMonth.every(m => m.picker_revealed)
        if (allPickersRevealed) triggerAwardsWrite()
      }
    }
  }

  function avgScore(movie) {
    const scores = ratings.filter(r => r.movie_id === movie.id && r.score != null).map(r => r.score)
    if (scores.length > 0) return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
    if (movie.historical_avg_score != null) return Number(movie.historical_avg_score).toFixed(2)
    return '—'
  }

  function pickerName(movie) {
    if (!movie.picked_by) return '—'
    return movie.picked_by.name
  }

  function formatDeadline(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }

  return (
    <div>
      {/* Bulk reveal section */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Bulk Month Reveal</p>
        <div style={{ marginBottom: '12px' }}>
          <Label>Month</Label>
          <select
            value={selectedBulkMonth}
            onChange={e => setSelectedBulkMonth(e.target.value)}
            style={{
              display: 'block', width: '100%', marginTop: '6px', padding: '9px 10px', borderRadius: '8px',
              background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
              color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box',
            }}
          >
            <option value="">Select month…</option>
            {months.slice().sort((a, b) => b.month_year.localeCompare(a.month_year)).map(mo => (
              <option key={mo.id} value={mo.month_year}>{mo.month_year}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => bulkReveal('scores')}
            disabled={!selectedBulkMonth || bulkRevealing != null}
            style={{
              flex: 1, minWidth: '140px', padding: '9px 12px', borderRadius: '8px',
              border: '1px solid rgba(74,222,128,0.25)',
              background: 'rgba(74,222,128,0.07)',
              color: (!selectedBulkMonth || bulkRevealing != null) ? 'var(--hairline)' : '#4ade80',
              fontSize: '12px', fontFamily: "'DM Sans',sans-serif",
              cursor: (!selectedBulkMonth || bulkRevealing != null) ? 'not-allowed' : 'pointer',
              opacity: (!selectedBulkMonth || bulkRevealing != null) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {bulkRevealing === 'scores' ? 'Revealing…' : `Reveal all scores${selectedBulkMonth ? ` for ${selectedBulkMonth}` : ''}`}
          </button>
          <button
            onClick={() => bulkReveal('pickers')}
            disabled={!selectedBulkMonth || bulkRevealing != null}
            style={{
              flex: 1, minWidth: '140px', padding: '9px 12px', borderRadius: '8px',
              border: '1px solid rgba(251,191,36,0.25)',
              background: 'rgba(251,191,36,0.07)',
              color: (!selectedBulkMonth || bulkRevealing != null) ? 'var(--hairline)' : '#fbbf24',
              fontSize: '12px', fontFamily: "'DM Sans',sans-serif",
              cursor: (!selectedBulkMonth || bulkRevealing != null) ? 'not-allowed' : 'pointer',
              opacity: (!selectedBulkMonth || bulkRevealing != null) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {bulkRevealing === 'pickers' ? 'Revealing…' : `Reveal all pickers${selectedBulkMonth ? ` for ${selectedBulkMonth}` : ''}`}
          </button>
        </div>
        <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '10px', fontFamily: "'DM Mono',monospace" }}>
          Sets scores_revealed / picker_revealed = true for all films in the selected month.
        </p>
      </div>

      {/* Genre backfill */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '15px', margin: '0 0 10px' }}>Genre Backfill</p>
        <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '0 0 12px', fontFamily: "'DM Mono',monospace" }}>
          Fetches genre data from TMDB for all films that have a TMDB ID but no genre set.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={backfillGenres}
            disabled={backfillStatus === 'running'}
            style={{
              padding: '9px 16px', borderRadius: '8px',
              border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(99,102,241,0.08)',
              color: backfillStatus === 'running' ? 'var(--text-faint)' : '#a5b4fc',
              fontSize: '12px', fontFamily: "'DM Mono',monospace",
              cursor: backfillStatus === 'running' ? 'not-allowed' : 'pointer',
              opacity: backfillStatus === 'running' ? 0.6 : 1,
            }}
          >
            {backfillStatus === 'running' ? 'Running…' : 'Backfill genres from TMDB'}
          </button>
          {backfillMsg && (
            <span style={{ color: backfillStatus === 'done' ? '#4ade80' : '#fbbf24', fontSize: '12px', fontFamily: "'DM Mono',monospace" }}>
              {backfillMsg}
            </span>
          )}
        </div>
      </div>

      {sortedMonths.map(monthYear => (
        <div key={monthYear} style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Label>{monthYear}</Label>
            <div style={{ flex: 1, height: '1px', background: 'rgba(var(--fg-rgb), 0.06)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {grouped[monthYear].map(movie => (
              <div key={movie.id} style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: editingId === movie.id ? '1px solid rgba(185,28,28,0.4)' : '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Film row */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {movie.poster_url && (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`}
                      alt={movie.title}
                      style={{ width: '32px', height: '46px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '14px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movie.title}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>
                        {pickerName(movie)}
                      </span>
                      <span style={{ color: 'var(--hairline)' }}>·</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>
                        {avgScore(movie)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                      {movie.scores_revealed && <Badge color="green">Scores</Badge>}
                      {movie.picker_revealed && <Badge color="green">Picker</Badge>}
                      {movie.scoring_deadline && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace" }}>
                          {formatDeadline(movie.scoring_deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => editingId === movie.id ? setEditingId(null) : startEdit(movie)}
                    style={{
                      flexShrink: 0, padding: '5px 12px', borderRadius: '7px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                      background: editingId === movie.id ? 'rgba(var(--fg-rgb), 0.08)' : 'transparent',
                      color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Mono',monospace"
                    }}
                  >
                    {editingId === movie.id ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {/* Inline edit form */}
                {editingId === movie.id && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* ── Film metadata (TMDB-sourced) ── */}
                      <div>
                        <Label>Title</Label>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Film title"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Label>Year Released</Label>
                          <input
                            type="number"
                            value={editForm.year_released}
                            onChange={e => setEditForm(f => ({ ...f, year_released: e.target.value }))}
                            placeholder="e.g. 2012"
                            style={{
                              display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                              background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                              color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Label>Runtime (min)</Label>
                          <input
                            type="number"
                            value={editForm.runtime}
                            onChange={e => setEditForm(f => ({ ...f, runtime: e.target.value }))}
                            placeholder="e.g. 137"
                            style={{
                              display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                              background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                              color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Director</Label>
                        <input
                          type="text"
                          value={editForm.director}
                          onChange={e => setEditForm(f => ({ ...f, director: e.target.value }))}
                          placeholder="Director name"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div>
                        <Label>Genres (comma-separated)</Label>
                        <input
                          type="text"
                          value={editForm.genre}
                          onChange={e => setEditForm(f => ({ ...f, genre: e.target.value }))}
                          placeholder="e.g. Drama, Thriller, Crime"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box'
                          }}
                        />
                        <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '4px', fontFamily: "'DM Mono',monospace" }}>
                          Stored as an array. Separate multiple genres with commas.
                        </p>
                      </div>

                      <div>
                        <Label>Overview (plot)</Label>
                        <textarea
                          value={editForm.overview}
                          onChange={e => setEditForm(f => ({ ...f, overview: e.target.value }))}
                          placeholder="Plot summary"
                          rows={4}
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
                            resize: 'vertical', lineHeight: 1.5
                          }}
                        />
                      </div>

                      <div>
                        <Label>Poster URL (TMDB path)</Label>
                        <input
                          type="text"
                          value={editForm.poster_url}
                          onChange={e => setEditForm(f => ({ ...f, poster_url: e.target.value }))}
                          placeholder="/abc123.jpg"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                        <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '4px', fontFamily: "'DM Mono',monospace" }}>
                          TMDB path only (e.g. /abc123.jpg). Displayed via image.tmdb.org.
                        </p>
                      </div>

                      <div>
                        <Label>TMDB ID</Label>
                        <input
                          type="number"
                          value={editForm.tmdb_id}
                          onChange={e => setEditForm(f => ({ ...f, tmdb_id: e.target.value }))}
                          placeholder="e.g. 1124"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ height: '1px', background: 'rgba(var(--fg-rgb), 0.06)', margin: '2px 0' }} />

                      {/* Scoring deadline */}
                      <div>
                        <Label>Scoring Deadline</Label>
                        <input
                          type="datetime-local"
                          value={editForm.scoring_deadline}
                          onChange={e => setEditForm(f => ({ ...f, scoring_deadline: e.target.value }))}
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                        <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '4px', fontFamily: "'DM Mono',monospace" }}>
                          Stored as UTC. Displayed in your browser's local time.
                        </p>
                      </div>

                      {/* Historical avg score */}
                      <div>
                        <Label>Historical Avg Score</Label>
                        <input
                          type="number"
                          min="0.01" max="10" step="0.01"
                          value={editForm.historical_avg_score}
                          onChange={e => setEditForm(f => ({ ...f, historical_avg_score: e.target.value }))}
                          placeholder="e.g. 7.25"
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                            color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Toggles */}
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Toggle value={editForm.scores_revealed} onChange={v => setEditForm(f => ({ ...f, scores_revealed: v }))} />
                          <span style={{ color: 'var(--text)', fontSize: '13px' }}>Scores revealed</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Toggle value={editForm.picker_revealed} onChange={v => setEditForm(f => ({ ...f, picker_revealed: v }))} />
                          <span style={{ color: 'var(--text)', fontSize: '13px' }}>Picker revealed</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => saveEdit(movie.id)}
                          disabled={saving}
                          style={{
                            padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent)',
                            color: 'var(--text-strong)', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif"
                          }}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => refetchFromTmdb(movie)}
                          disabled={refetchingId === movie.id || !editForm.tmdb_id}
                          title={!editForm.tmdb_id ? 'Set a TMDB ID first' : 'Re-fetch metadata (title, poster, overview, year, runtime, director, genres) from TMDB'}
                          style={{
                            padding: '9px 16px', borderRadius: '8px',
                            border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.06)',
                            color: (refetchingId === movie.id || !editForm.tmdb_id) ? 'var(--text-faint)' : '#a5b4fc',
                            fontSize: '12px', fontFamily: "'DM Mono',monospace",
                            cursor: (refetchingId === movie.id || !editForm.tmdb_id) ? 'not-allowed' : 'pointer',
                            opacity: (refetchingId === movie.id || !editForm.tmdb_id) ? 0.6 : 1,
                          }}
                        >
                          {refetchingId === movie.id ? 'Fetching…' : 'Re-fetch from TMDB'}
                        </button>
                        <button
                          onClick={() => refreshProviders(movie)}
                          disabled={refreshingId === movie.id || !editForm.tmdb_id}
                          title={!editForm.tmdb_id ? 'Set a TMDB ID first' : 'Re-fetch US streaming providers from TMDB'}
                          style={{
                            padding: '9px 16px', borderRadius: '8px',
                            border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'transparent',
                            color: (refreshingId === movie.id || !editForm.tmdb_id) ? 'var(--text-faint)' : 'var(--text-muted)',
                            fontSize: '12px', fontFamily: "'DM Mono',monospace",
                            cursor: (refreshingId === movie.id || !editForm.tmdb_id) ? 'not-allowed' : 'pointer',
                            opacity: (refreshingId === movie.id || !editForm.tmdb_id) ? 0.6 : 1,
                          }}
                        >
                          {refreshingId === movie.id ? 'Refreshing…' : 'Refresh streaming providers'}
                        </button>
                      </div>
                      <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '-4px', fontFamily: "'DM Mono',monospace" }}>
                        Re-fetch pulls metadata + genres from TMDB into the form (save to apply). Refresh streaming updates cached providers.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 3 — Members
// ─────────────────────────────────────────────
function InviteCard({ onRefresh, currentProfile }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [joinedAt, setJoinedAt] = useState(todayStr)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)

  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
    color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none',
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)

    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedName) { setInviteError('Name is required'); return }
    if (!trimmedEmail) { setInviteError('Email is required'); return }
    if (!trimmedEmail.includes('@')) { setInviteError('Enter a valid email address'); return }

    setInviting(true)
    const { error } = await supabase.from('users').insert({
      name: trimmedName,
      email: trimmedEmail,
      is_active: true,
      role,
      joined_at: joinedAt || todayStr,
      has_completed_onboarding: false,
    })
    setInviting(false)

    if (error) {
      if (error.message?.toLowerCase().includes('duplicate') || error.code === '23505') {
        setInviteError(`${trimmedEmail} is already in the system`)
      } else {
        setInviteError(error.message)
      }
    } else {
      setInviteSuccess(`Member added. They can now log in with ${trimmedEmail} via Google.`)
      setName('')
      setEmail('')
      setRole('member')
      setJoinedAt(todayStr)
      onRefresh()
    }
  }

  return (
    <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Add Member</p>

      {inviteError && (
        <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
          <span style={{ color: '#f87171', fontSize: '13px' }}>{inviteError}</span>
        </div>
      )}
      {inviteSuccess && (
        <div style={{ background: '#14532d', border: '1px solid #166534', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
          <span style={{ color: '#4ade80', fontSize: '13px' }}>{inviteSuccess}</span>
        </div>
      )}

      <form onSubmit={handleInvite} noValidate>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Label>Name</Label>
            <input
              type="text"
              placeholder="e.g. Alex Jones"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ ...inputStyle, marginTop: '6px' }}
              aria-label="Name"
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <Label>Email</Label>
            <input
              type="email"
              placeholder="e.g. alex@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginTop: '6px' }}
              aria-label="Email"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ flex: '1 1 120px', minWidth: 0 }}>
            <Label>Role</Label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ ...inputStyle, marginTop: '6px' }}
              aria-label="Role"
            >
              <option value="member">member</option>
              {currentProfile?.is_op && <option value="admin">admin</option>}
            </select>
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Label>Joined Date</Label>
            <input
              type="date"
              value={joinedAt}
              onChange={e => setJoinedAt(e.target.value)}
              style={{ ...inputStyle, marginTop: '6px', fontFamily: "'DM Mono',monospace" }}
              aria-label="Joined Date"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={inviting}
          style={{
            padding: '9px 20px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: 'var(--text-strong)', fontSize: '13px',
            fontWeight: 500, cursor: inviting ? 'not-allowed' : 'pointer',
            opacity: inviting ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {inviting ? 'Adding…' : 'Add Member'}
        </button>
      </form>

      <p style={{ color: 'var(--text-faint)', fontSize: '10px', marginTop: '10px', fontFamily: "'DM Mono',monospace" }}>
        Adds their account — they can then sign in at movie-club-blond.vercel.app using Google with this email.
      </p>
    </div>
  )
}

function MembersTab({ users, currentProfile, onRefresh, setError, setSuccess }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const fieldStyle = {
    display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
    background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
    color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif",
    outline: 'none', boxSizing: 'border-box',
  }

  function startEdit(user) {
    setEditingId(user.id)
    setEditForm({
      name: user.name ?? '',
      email: user.email ?? '',
      role: user.role ?? 'member',
      joined_at: user.joined_at ? user.joined_at.slice(0, 10) : '',
    })
  }

  async function saveMember(userId) {
    const trimmedName = editForm.name.trim()
    const trimmedEmail = editForm.email.trim().toLowerCase()
    if (!trimmedName) { setError('Name is required'); return }
    if (!trimmedEmail || !trimmedEmail.includes('@')) { setError('Enter a valid email address'); return }

    const target = users.find(u => u.id === userId)
    const updates = {
      name: trimmedName,
      email: trimmedEmail,
      joined_at: editForm.joined_at || null,
    }
    // Role changes are op-only (and never via this form for ops or yourself).
    const canChangeRole = currentProfile?.is_op && !target?.is_op && userId !== currentProfile?.id
    if (canChangeRole && (editForm.role === 'member' || editForm.role === 'admin')) {
      updates.role = editForm.role
    }

    setSaving(true)
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    setSaving(false)
    if (error) setError('Save failed: ' + error.message)
    else { setSuccess('Member updated'); setEditingId(null); onRefresh() }
  }

  async function toggleActive(user) {
    if (user.email === PROTECTED_EMAIL || user.id === currentProfile?.id) return
    const { error } = await supabase.from('users').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) setError('Failed: ' + error.message)
    else { setSuccess(user.is_active ? 'Member deactivated' : 'Member activated'); onRefresh() }
  }

  function isProtected(user) {
    return user.email === PROTECTED_EMAIL || user.id === currentProfile?.id
  }

  // Op-only: only ops may grant/revoke admin. Ops can't be demoted here and you can't change your own role.
  const viewerIsOp = !!currentProfile?.is_op

  async function changeRole(user, newRole) {
    if (!viewerIsOp) return
    if (user.id === currentProfile?.id) { setError('You cannot change your own role.'); return }
    if (user.is_op) { setError('Ops cannot be demoted from here.'); return }
    setSaving(true)
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', user.id)
    setSaving(false)
    if (error) setError('Failed: ' + error.message)
    else { setSuccess(newRole === 'admin' ? 'Promoted to admin' : 'Demoted to member'); onRefresh() }
  }

  function roleLabel(user) {
    if (user.is_op) return { text: 'Op', color: 'yellow' }
    if (user.role === 'admin') return { text: 'Admin', color: 'yellow' }
    return { text: 'Member', color: 'gray' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <InviteCard onRefresh={onRefresh} setSuccess={setSuccess} currentProfile={currentProfile} />
      {users.map(user => (
        <div key={user.id} style={{
          background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)',
          borderRadius: '12px', overflow: 'hidden',
          opacity: user.is_active ? 1 : 0.45,
          transition: 'opacity 0.2s',
        }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Avatar placeholder */}
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(185,28,28,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-strong)', fontSize: '13px', fontWeight: 600 }}>
                {user.name?.split(' ').map(w => w[0]).slice(0, 2).join('') ?? '?'}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '14px', margin: 0 }}>{user.name}</p>
                <Badge color={roleLabel(user).color}>{roleLabel(user).text}</Badge>
                {!user.is_active && <Badge color="red">inactive</Badge>}
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'DM Mono',monospace" }}>
                {user.email}
              </p>
              <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '2px 0 0', fontFamily: "'DM Mono',monospace" }}>
                Joined: {user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => editingId === user.id ? setEditingId(null) : startEdit(user)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                  background: editingId === user.id ? 'rgba(var(--fg-rgb), 0.08)' : 'transparent',
                  color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono',monospace"
                }}
              >
                {editingId === user.id ? 'Cancel' : 'Edit'}
              </button>
              {/* Op-only: promote a member to admin, or demote an admin to member.
                  Hidden for non-ops, for yourself, and for other ops (who can't be demoted here). */}
              {viewerIsOp && user.id !== currentProfile?.id && !user.is_op && (
                user.role === 'admin' ? (
                  <button
                    onClick={() => changeRole(user, 'member')}
                    disabled={saving}
                    title="Demote this admin to member"
                    style={{
                      padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                      background: 'transparent', color: saving ? 'var(--text-faint)' : '#fbbf24',
                      fontSize: '11px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace"
                    }}
                  >
                    Demote
                  </button>
                ) : (
                  <button
                    onClick={() => changeRole(user, 'admin')}
                    disabled={saving}
                    title="Promote this member to admin"
                    style={{
                      padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                      background: 'transparent', color: saving ? 'var(--text-faint)' : '#a5b4fc',
                      fontSize: '11px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace"
                    }}
                  >
                    Promote
                  </button>
                )
              )}
              <button
                onClick={() => toggleActive(user)}
                disabled={isProtected(user)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                  background: 'transparent', color: isProtected(user) ? 'var(--text-faint)' : (user.is_active ? '#f87171' : '#4ade80'),
                  fontSize: '11px', cursor: isProtected(user) ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace"
                }}
              >
                {user.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>

          {/* Inline edit form */}
          {editingId === user.id && (
            <div style={{ padding: '14px', borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                    <Label>Name</Label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      style={fieldStyle}
                    />
                  </div>
                  <div style={{ flex: '1 1 170px', minWidth: 0 }}>
                    <Label>Email</Label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="email@example.com"
                      style={{ ...fieldStyle, fontFamily: "'DM Mono',monospace" }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 100px', minWidth: 0 }}>
                    <Label>Role</Label>
                    <select
                      value={user.is_op ? 'op' : editForm.role}
                      onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                      disabled={!viewerIsOp || user.is_op || user.id === currentProfile?.id}
                      style={{ ...fieldStyle, opacity: (!viewerIsOp || user.is_op || user.id === currentProfile?.id) ? 0.5 : 1 }}
                    >
                      {user.is_op && <option value="op">op</option>}
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    {!viewerIsOp && (
                      <p style={{ color: 'var(--text-faint)', fontSize: '9px', marginTop: '4px', fontFamily: "'DM Mono',monospace" }}>
                        Only ops can change roles.
                      </p>
                    )}
                  </div>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <Label>Joined Date</Label>
                    <input
                      type="date"
                      value={editForm.joined_at}
                      onChange={e => setEditForm(f => ({ ...f, joined_at: e.target.value }))}
                      style={{ ...fieldStyle, fontFamily: "'DM Mono',monospace" }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => saveMember(user.id)}
                    disabled={saving}
                    style={{
                      padding: '8px 18px', borderRadius: '8px', border: 'none',
                      background: 'var(--accent)', color: 'var(--text-strong)', fontSize: '13px',
                      fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    style={{
                      padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'transparent',
                      color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 4 — Scores
// ─────────────────────────────────────────────
function ScoresTab({ movies, users, ratings, months, preselectFilmId, onConsumePreselect, onRefresh, setError, setSuccess }) {
  const [selectedMovie, setSelectedMovie] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [score, setScore] = useState('')
  const [excitement, setExcitement] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAllFilms, setShowAllFilms] = useState(false)

  // Deep-link in from the Dashboard's "missing scores" list: preselect that film once.
  useEffect(() => {
    if (preselectFilmId) {
      setSelectedMovie(preselectFilmId)
      onConsumePreselect?.()
    }
  }, [preselectFilmId, onConsumePreselect])

  // Preselect a film+member in the backfill form (used by the matrix cells) and
  // scroll the form into view so the admin can immediately enter/overwrite a score.
  function preselect(movieId, userId) {
    setSelectedMovie(movieId)
    setSelectedUser(userId)
    const existing = ratings.find(r => r.movie_id === movieId && r.user_id === userId)
    setScore(existing?.score != null ? String(existing.score) : '')
    setExcitement(existing?.pre_watch_excitement != null ? String(existing.pre_watch_excitement) : '')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const monthMap = {}
  months.forEach(mo => { monthMap[mo.id] = mo })

  // Non-test users only
  const activeUsers = users.filter(u => u.email !== TEST_USER_EMAIL)

  // Build set of existing ratings: "movieId:userId"
  const ratingSet = new Set(ratings.map(r => `${r.movie_id}:${r.user_id}`))

  // The rating currently targeted by the form (if any) — drives overwrite messaging.
  const existingRating = (selectedMovie && selectedUser)
    ? ratings.find(r => r.movie_id === selectedMovie && r.user_id === selectedUser)
    : null

  // Movies sorted by month desc
  const sortedMovies = [...movies].sort((a, b) => {
    const ma = monthMap[a.month_id]?.month_year ?? ''
    const mb = monthMap[b.month_id]?.month_year ?? ''
    return mb.localeCompare(ma)
  })

  // For matrix: only show films with at least one missing score (from expected users), unless showAllFilms
  const matrixMovies = showAllFilms ? sortedMovies : sortedMovies.filter(m => {
    const mo = monthMap[m.month_id]
    if (!mo) return false
    const expUsers = activeUsers.filter(u => {
      if (isZackPreApril(u, mo.month_year)) return false
      return joinedByMonth(u, mo.month_year)
    })
    const missing = expUsers.some(u => !ratingSet.has(`${m.id}:${u.id}`))
    return missing
  })

  async function submitScore() {
    if (!selectedMovie || !selectedUser || !score) return
    const scoreNum = parseFloat(score)
    if (isNaN(scoreNum) || scoreNum < 0.01 || scoreNum > 10) {
      setError('Score must be between 0.01 and 10.00')
      return
    }
    setSubmitting(true)

    const payload = {
      movie_id: selectedMovie,
      user_id: selectedUser,
      score: scoreNum,
      submitted_at: new Date().toISOString(),
    }
    if (excitement !== '') {
      const eNum = parseFloat(excitement)
      if (!isNaN(eNum)) payload.pre_watch_excitement = eNum
    }

    const wasOverwrite = ratingSet.has(`${selectedMovie}:${selectedUser}`)
    const { error } = await supabase.from('ratings').upsert(payload, { onConflict: 'movie_id,user_id' })
    setSubmitting(false)
    if (error) setError('Failed: ' + error.message)
    else {
      setSuccess(wasOverwrite ? 'Score overwritten' : 'Score submitted')
      setScore('')
      setExcitement('')
      onRefresh()
    }
  }

  const selectStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
    color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none'
  }
  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
    color: 'var(--text-strong)', fontSize: '13px', fontFamily: "'DM Mono',monospace", outline: 'none'
  }

  return (
    <div>
      {/* Score entry form */}
      <div style={{ background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <p style={{ color: 'var(--text-strong)', fontWeight: 500, fontSize: '15px', margin: '0 0 6px' }}>Backfill / Overwrite Score</p>
        <p style={{ color: 'var(--text-faint)', fontSize: '10px', margin: '0 0 14px', fontFamily: "'DM Mono',monospace" }}>
          {existingRating
            ? `Overwriting existing score (${Number(existingRating.score).toFixed(2)}) for this member.`
            : 'Fills a blank score, or overwrites an existing one if the member already has a score for this film.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <Label>Film</Label>
            <select value={selectedMovie} onChange={e => setSelectedMovie(e.target.value)} style={{ ...selectStyle, marginTop: '6px' }}>
              <option value="">Select film…</option>
              {sortedMovies.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} ({monthMap[m.month_id]?.month_year ?? '?'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Member</Label>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ ...selectStyle, marginTop: '6px' }}>
              <option value="">Select member…</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Score (0.01–10.00)</Label>
              <input
                type="number" min="0.01" max="10" step="0.01"
                value={score} onChange={e => setScore(e.target.value)}
                placeholder="e.g. 7.50"
                style={{ ...inputStyle, marginTop: '6px' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Pre-watch Excitement (optional)</Label>
              <input
                type="number" min="0.01" max="10" step="0.01"
                value={excitement} onChange={e => setExcitement(e.target.value)}
                placeholder="e.g. 6.00"
                style={{ ...inputStyle, marginTop: '6px' }}
              />
            </div>
          </div>
          <button
            onClick={submitScore}
            disabled={submitting || !selectedMovie || !selectedUser || !score}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent)',
              color: 'var(--text-strong)', fontSize: '13px', fontWeight: 500, cursor: (submitting || !selectedMovie || !selectedUser || !score) ? 'not-allowed' : 'pointer',
              opacity: (submitting || !selectedMovie || !selectedUser || !score) ? 0.6 : 1, alignSelf: 'flex-start'
            }}
          >
            {submitting ? 'Submitting…' : (existingRating ? 'Overwrite Score' : 'Submit Score')}
          </button>
        </div>
      </div>

      {/* Score matrix */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <Label>Score Matrix</Label>
          <button
            onClick={() => setShowAllFilms(v => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono',monospace" }}
          >
            {showAllFilms ? 'Show missing only' : 'Show all films'}
          </button>
        </div>

        {matrixMovies.length === 0 ? (
          <p style={{ color: '#4ade80', fontSize: '13px' }}>All films fully scored</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '400px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-faint)', fontSize: '10px', fontFamily: "'DM Mono',monospace", fontWeight: 500, borderBottom: '1px solid rgba(var(--fg-rgb), 0.06)' }}>Film</th>
                  {activeUsers.map(u => (
                    <th key={u.id} style={{ padding: '6px 8px', color: 'var(--text-faint)', fontSize: '10px', fontFamily: "'DM Mono',monospace", fontWeight: 500, borderBottom: '1px solid rgba(var(--fg-rgb), 0.06)', whiteSpace: 'nowrap' }}>
                      {u.name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixMovies.map((m, i) => {
                  const mo = monthMap[m.month_id]
                  const monthYear = mo?.month_year ?? ''
                  return (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb), 0.015)' }}>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(var(--fg-rgb), 0.04)' }}>
                        <p style={{ color: 'var(--text-strong)', fontSize: '12px', margin: 0, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                        <p style={{ color: 'var(--text-faint)', fontSize: '10px', margin: '1px 0 0', fontFamily: "'DM Mono',monospace" }}>{monthYear}</p>
                      </td>
                      {activeUsers.map(u => {
                        const hasScore = ratingSet.has(`${m.id}:${u.id}`)
                        const naForZack = isZackPreApril(u, monthYear)
                        // Whether this user was a club member during this film's month.
                        const isExpected = joinedByMonth(u, monthYear)
                        // Every cell is clickable to preselect this film + member in the backfill
                        // form above — including N/A cells, so an admin can still manually enter a
                        // score for Zack on a pre-April film he actually watched.
                        const cellTitle = naForZack
                          ? `Backfill ${u.name} for "${m.title}" (N/A — not in club this month, but you can still enter a score)`
                          : `Backfill ${u.name} for "${m.title}"`
                        let mark
                        if (naForZack || !isExpected) {
                          // N/A (Zack pre-April) and not-yet-a-member both render the same way:
                          // a crossed-out marker. Scored cells below override with a ✓.
                          mark = hasScore
                            ? <span style={{ color: '#4ade80', fontSize: '14px' }}>✓</span>
                            : (
                              <span style={{
                                color: 'var(--hairline)', fontSize: naForZack ? '11px' : '12px',
                                fontFamily: "'DM Mono',monospace", textDecoration: naForZack ? 'line-through' : 'none',
                              }}>
                                {naForZack ? 'N/A' : '–'}
                              </span>
                            )
                        } else if (hasScore) {
                          mark = <span style={{ color: '#4ade80', fontSize: '14px' }}>✓</span>
                        } else {
                          mark = <span style={{ color: '#ef4444', fontSize: '14px' }}>✗</span>
                        }
                        return (
                          <td key={u.id} style={{ padding: 0, textAlign: 'center', borderBottom: '1px solid rgba(var(--fg-rgb), 0.04)' }}>
                            <button
                              onClick={() => preselect(m.id, u.id)}
                              title={cellTitle}
                              style={{
                                width: '100%', padding: '7px 8px', background: 'none', border: 'none',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {mark}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ROOT — Admin page
// ─────────────────────────────────────────────
const TABS = ['Dashboard', 'Films', 'Members', 'Scores']

export default function Admin() {
  const { profile, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  // Deep-link target for the Scores tab (set when an admin clicks a missing-score row).
  const [preselectFilmId, setPreselectFilmId] = useState('')

  // Jump from the Dashboard's "missing scores" list straight to the Scores backfill form.
  const goToScoresForFilm = useCallback((movieId) => {
    setPreselectFilmId(movieId)
    setActiveTab('Scores')
  }, [])

  // Data
  const [movies, setMovies] = useState([])
  const [ratings, setRatings] = useState([])
  const [users, setUsers] = useState([])
  const [months, setMonths] = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: moviesData, error: moviesErr },
      { data: ratingsData, error: ratingsErr },
      { data: usersData, error: usersErr },
      { data: monthsData, error: monthsErr },
    ] = await Promise.all([
      supabase.from('movies').select('*, picked_by:users!picked_by_user_id(name)').order('id'),
      supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, submitted_at'),
      supabase.from('users').select('id, name, email, role, is_op, joined_at, is_active, admin_mode_enabled').order('joined_at'),
      supabase.from('months').select('id, season_id, month_year, status, active_date').order('month_year'),
    ])

    if (moviesErr || ratingsErr || usersErr || monthsErr) {
      setError('Failed to load data. Check console for details.')
      console.error({ moviesErr, ratingsErr, usersErr, monthsErr })
    } else {
      setMovies(moviesData ?? [])
      setRatings(ratingsData ?? [])
      setUsers(usersData ?? [])
      setMonths(monthsData ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isAdmin && profile?.admin_mode_enabled) {
      fetchAll()
    }
  }, [isAdmin, profile?.id, profile?.admin_mode_enabled, fetchAll])

  // Auto-clear success after 3s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(null), 3000)
    return () => clearTimeout(t)
  }, [success])

  // Guard
  if (!isAdmin || !profile?.admin_mode_enabled) {
    return (
      <div style={{ background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Admin access required</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", paddingBottom: '6rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>
            Admin
          </p>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.6rem', color: 'var(--text-strong)', lineHeight: 1, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            Dashboard
          </h1>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(var(--fg-rgb), 0.04)', borderRadius: '10px', padding: '4px' }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: '7px', border: 'none',
                background: activeTab === tab ? 'rgba(var(--fg-rgb), 0.1)' : 'transparent',
                color: activeTab === tab ? 'var(--text-strong)' : 'var(--text-dim)',
                fontSize: '12px', fontWeight: activeTab === tab ? 500 : 400,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Banners */}
        <ErrorBanner msg={error} onClose={() => setError(null)} />
        <SuccessBanner msg={success} onClose={() => setSuccess(null)} />

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'Dashboard' && (
              <DashboardTab
                movies={movies}
                ratings={ratings}
                users={users}
                months={months}
                onBackfillFilm={goToScoresForFilm}
                onRefresh={fetchAll}
                setError={setError}
                setSuccess={setSuccess}
              />
            )}
            {activeTab === 'Films' && (
              <FilmsTab
                movies={movies}
                ratings={ratings}
                months={months}
                users={users}
                onRefresh={fetchAll}
                setError={setError}
                setSuccess={setSuccess}
              />
            )}
            {activeTab === 'Members' && (
              <MembersTab
                users={users}
                currentProfile={profile}
                onRefresh={fetchAll}
                setError={setError}
                setSuccess={setSuccess}
              />
            )}
            {activeTab === 'Scores' && (
              <ScoresTab
                movies={movies}
                users={users}
                ratings={ratings}
                months={months}
                preselectFilmId={preselectFilmId}
                onConsumePreselect={() => setPreselectFilmId('')}
                onRefresh={fetchAll}
                setError={setError}
                setSuccess={setSuccess}
              />
            )}
          </>
        )}
      </div>

      <style>{`
        select option { background: #1a1b23; color: white; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { opacity: 0.4; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator,
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        table { width: 100%; }
      `}</style>
    </div>
  )
}
