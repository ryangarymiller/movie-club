import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

if (!document.getElementById('mc-fonts')) {
  const link = document.createElement('link')
  link.id = 'mc-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const PROTECTED_EMAIL = 'ryan.gary.miller@gmail.com'

// Members joined_at cutoffs for expected-score calculations
// Zack joined April 2026, so exclude him from Jan–Mar films
function expectedMemberCount(monthYear, allUsers) {
  return allUsers.filter(u => {
    if (!u.is_active) return false
    const joined = new Date(u.joined_at)
    const [y, m] = monthYear.split('-').map(Number)
    const filmMonth = new Date(y, m - 1, 1)
    return joined <= filmMonth
  }).length
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />
}

function Label({ children }) {
  return (
    <span style={{ fontSize: '9px', letterSpacing: '0.14em', fontFamily: "'DM Mono',monospace", color: '#4b5563', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function Badge({ children, color = 'green' }) {
  const colors = {
    green: { background: '#14532d', color: '#4ade80', border: '1px solid #166534' },
    red: { background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d' },
    yellow: { background: '#422006', color: '#fbbf24', border: '1px solid #78350f' },
    gray: { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' },
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
        background: value ? 'var(--accent)' : '#374151', position: 'relative', transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: value ? '18px' : '2px',
        width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s',
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
function DashboardTab({ movies, ratings, users, months }) {
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

  // Films with missing scores
  const missingScoreFilms = movies.filter(m => {
    const mo = monthMap[m.month_id]
    if (!mo) return false
    const expected = expectedMemberCount(mo.month_year, users)
    const actual = ratings.filter(r => r.movie_id === m.id && r.score != null).length
    return actual < expected
  }).map(m => {
    const mo = monthMap[m.month_id]
    const expected = mo ? expectedMemberCount(mo.month_year, users) : 0
    const actual = ratings.filter(r => r.movie_id === m.id && r.score != null).length
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
          { label: 'Members', value: users.length },
          { label: 'The Vault', value: vaultFilms.length, sub: 'avg ≥ 8.5' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px' }}>
            <Label>{s.label}</Label>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.2rem', color: 'white', margin: '4px 0 0', lineHeight: 1 }}>{s.value}</p>
            {s.sub && <p style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Active month status */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <Label>Active Month</Label>
        {activeMonth ? (
          <div style={{ marginTop: '8px' }}>
            <p style={{ color: 'white', fontWeight: 500, fontSize: '15px', margin: '0 0 6px' }}>
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
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '8px' }}>No active month</p>
        )}
      </div>

      {/* Missing scores */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
        <Label>Films with Missing Scores</Label>
        {missingScoreFilms.length === 0 ? (
          <p style={{ color: '#4ade80', fontSize: '13px', marginTop: '10px' }}>All films fully scored</p>
        ) : (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {missingScoreFilms.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</p>
                  <p style={{ color: '#6b7280', fontSize: '11px', margin: '2px 0 0', fontFamily: "'DM Mono',monospace" }}>{f.month_year}</p>
                </div>
                <Badge color="red">{f.actual}/{f.expected}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 2 — Films
// ─────────────────────────────────────────────
function FilmsTab({ movies, ratings, months, users, onRefresh, setError, setSuccess }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

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
    // Convert scoring_deadline from UTC ISO to local datetime-local format (PT display)
    let deadlineLocal = ''
    if (movie.scoring_deadline) {
      const d = new Date(movie.scoring_deadline)
      // Format as YYYY-MM-DDTHH:MM for datetime-local input (browser local time)
      const pad = n => String(n).padStart(2, '0')
      deadlineLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setEditForm({
      scoring_deadline: deadlineLocal,
      scores_revealed: movie.scores_revealed ?? false,
      picker_revealed: movie.picker_revealed ?? false,
      historical_avg_score: movie.historical_avg_score ?? '',
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
      // datetime-local gives local time; store as ISO (UTC)
      updates.scoring_deadline = new Date(editForm.scoring_deadline).toISOString()
    } else {
      updates.scoring_deadline = null
    }

    const { error } = await supabase.from('movies').update(updates).eq('id', movieId)
    setSaving(false)
    if (error) {
      setError('Failed to save: ' + error.message)
    } else {
      setSuccess('Film updated')
      setEditingId(null)
      onRefresh()
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
      {sortedMonths.map(monthYear => (
        <div key={monthYear} style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Label>{monthYear}</Label>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {grouped[monthYear].map(movie => (
              <div key={movie.id} style={{ background: 'rgba(255,255,255,0.03)', border: editingId === movie.id ? '1px solid rgba(185,28,28,0.4)' : '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
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
                    <p style={{ color: 'white', fontWeight: 500, fontSize: '14px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movie.title}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                      <span style={{ color: '#6b7280', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>
                        {pickerName(movie)}
                      </span>
                      <span style={{ color: '#374151' }}>·</span>
                      <span style={{ color: '#9ca3af', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>
                        {avgScore(movie)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                      {movie.scores_revealed && <Badge color="green">Scores</Badge>}
                      {movie.picker_revealed && <Badge color="green">Picker</Badge>}
                      {movie.scoring_deadline && (
                        <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: "'DM Mono',monospace" }}>
                          {formatDeadline(movie.scoring_deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => editingId === movie.id ? setEditingId(null) : startEdit(movie)}
                    style={{
                      flexShrink: 0, padding: '5px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)',
                      background: editingId === movie.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: '#9ca3af', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Mono',monospace"
                    }}
                  >
                    {editingId === movie.id ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {/* Inline edit form */}
                {editingId === movie.id && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Scoring deadline */}
                      <div>
                        <Label>Scoring Deadline</Label>
                        <input
                          type="datetime-local"
                          value={editForm.scoring_deadline}
                          onChange={e => setEditForm(f => ({ ...f, scoring_deadline: e.target.value }))}
                          style={{
                            display: 'block', width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                        <p style={{ color: '#4b5563', fontSize: '10px', marginTop: '4px', fontFamily: "'DM Mono',monospace" }}>
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
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white', fontSize: '13px', fontFamily: "'DM Mono',monospace", boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Toggles */}
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Toggle value={editForm.scores_revealed} onChange={v => setEditForm(f => ({ ...f, scores_revealed: v }))} />
                          <span style={{ color: '#d1d5db', fontSize: '13px' }}>Scores revealed</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Toggle value={editForm.picker_revealed} onChange={v => setEditForm(f => ({ ...f, picker_revealed: v }))} />
                          <span style={{ color: '#d1d5db', fontSize: '13px' }}>Picker revealed</span>
                        </div>
                      </div>

                      <button
                        onClick={() => saveEdit(movie.id)}
                        disabled={saving}
                        style={{
                          padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent)',
                          color: 'white', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.7 : 1, alignSelf: 'flex-start', fontFamily: "'DM Sans',sans-serif"
                        }}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
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
function InviteCard({ onRefresh, setSuccess }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)

  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'white', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none',
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
      role: 'member',
      joined_at: new Date().toISOString().split('T')[0],
      has_completed_onboarding: false,
    })
    setInviting(false)

    if (error) {
      setInviteError(error.message)
    } else {
      setInviteSuccess(`✓ ${trimmedName} invited — they can sign in with ${trimmedEmail}`)
      setName('')
      setEmail('')
      onRefresh()
    }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
      <p style={{ color: 'white', fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Invite Member</p>

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
        <button
          type="submit"
          disabled={inviting}
          style={{
            padding: '9px 20px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: 'white', fontSize: '13px',
            fontWeight: 500, cursor: inviting ? 'not-allowed' : 'pointer',
            opacity: inviting ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {inviting ? 'Inviting…' : 'Send Invite'}
        </button>
      </form>

      <p style={{ color: '#4b5563', fontSize: '10px', marginTop: '10px', fontFamily: "'DM Mono',monospace" }}>
        This creates their account — share movie-club-blond.vercel.app with them to sign in.
      </p>
    </div>
  )
}

function MembersTab({ users, currentProfile, onRefresh, setError, setSuccess }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  function startEdit(user) {
    setEditingId(user.id)
    const joined = user.joined_at ? user.joined_at.slice(0, 10) : ''
    setEditForm({ joined_at: joined })
  }

  async function saveJoinedAt(userId) {
    setSaving(true)
    const { error } = await supabase.from('users').update({ joined_at: editForm.joined_at }).eq('id', userId)
    setSaving(false)
    if (error) setError('Save failed: ' + error.message)
    else { setSuccess('Member updated'); setEditingId(null); onRefresh() }
  }

  async function toggleActive(user) {
    if (user.email === PROTECTED_EMAIL || user.id === currentProfile?.id) return
    const { error } = await supabase.from('users').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) setError('Failed: ' + error.message)
    else { setSuccess('Updated'); onRefresh() }
  }

  function isProtected(user) {
    return user.email === PROTECTED_EMAIL || user.id === currentProfile?.id
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <InviteCard onRefresh={onRefresh} setSuccess={setSuccess} />
      {users.map(user => (
        <div key={user.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Avatar placeholder */}
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(185,28,28,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
                {user.name?.split(' ').map(w => w[0]).slice(0, 2).join('') ?? '?'}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <p style={{ color: 'white', fontWeight: 500, fontSize: '14px', margin: 0 }}>{user.name}</p>
                {user.role === 'admin' && <Badge color="yellow">admin</Badge>}
                {!user.is_active && <Badge color="red">inactive</Badge>}
              </div>
              <p style={{ color: '#6b7280', fontSize: '11px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'DM Mono',monospace" }}>
                {user.email}
              </p>
              <p style={{ color: '#4b5563', fontSize: '11px', margin: '2px 0 0', fontFamily: "'DM Mono',monospace" }}>
                Joined: {user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => editingId === user.id ? setEditingId(null) : startEdit(user)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: '#9ca3af', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono',monospace"
                }}
              >
                {editingId === user.id ? 'Cancel' : 'Edit'}
              </button>
              <button
                onClick={() => toggleActive(user)}
                disabled={isProtected(user)}
                style={{
                  padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: isProtected(user) ? '#4b5563' : (user.is_active ? '#f87171' : '#4ade80'),
                  fontSize: '11px', cursor: isProtected(user) ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono',monospace"
                }}
              >
                {user.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>

          {/* Edit form */}
          {editingId === user.id && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
              <Label>Joined Date</Label>
              <input
                type="date"
                value={editForm.joined_at}
                onChange={e => setEditForm(f => ({ ...f, joined_at: e.target.value }))}
                style={{
                  display: 'block', marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', fontSize: '13px', fontFamily: "'DM Mono',monospace"
                }}
              />
              <button
                onClick={() => saveJoinedAt(user.id)}
                disabled={saving}
                style={{
                  marginTop: '10px', padding: '8px 18px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent)', color: 'white', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
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
function ScoresTab({ movies, users, ratings, months, onRefresh, setError, setSuccess }) {
  const [selectedMovie, setSelectedMovie] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [score, setScore] = useState('')
  const [excitement, setExcitement] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAllFilms, setShowAllFilms] = useState(false)

  const monthMap = {}
  months.forEach(mo => { monthMap[mo.id] = mo })

  // Build set of existing ratings: "movieId:userId"
  const ratingSet = new Set(ratings.map(r => `${r.movie_id}:${r.user_id}`))

  // Movies sorted by month desc
  const sortedMovies = [...movies].sort((a, b) => {
    const ma = monthMap[a.month_id]?.month_year ?? ''
    const mb = monthMap[b.month_id]?.month_year ?? ''
    return mb.localeCompare(ma)
  })

  // For matrix: only show films with at least one missing score, unless showAllFilms
  const matrixMovies = showAllFilms ? sortedMovies : sortedMovies.filter(m => {
    const mo = monthMap[m.month_id]
    if (!mo) return false
    const expected = expectedMemberCount(mo.month_year, users)
    const actual = ratings.filter(r => r.movie_id === m.id && r.score != null).length
    return actual < expected
  })

  // For each movie in matrix, which users are expected?
  function expectedUsers(movieId) {
    const m = movies.find(mv => mv.id === movieId)
    if (!m) return users
    const mo = monthMap[m.month_id]
    if (!mo) return users
    return users.filter(u => {
      const joined = new Date(u.joined_at)
      const [y, month] = mo.month_year.split('-').map(Number)
      const filmMonth = new Date(y, month - 1, 1)
      return joined <= filmMonth
    })
  }

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

    const { error } = await supabase.from('ratings').upsert(payload, { onConflict: 'movie_id,user_id' })
    setSubmitting(false)
    if (error) setError('Failed: ' + error.message)
    else {
      setSuccess('Score submitted')
      setScore('')
      setExcitement('')
      onRefresh()
    }
  }

  const selectStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'white', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", outline: 'none'
  }
  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: '8px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'white', fontSize: '13px', fontFamily: "'DM Mono',monospace", outline: 'none'
  }

  return (
    <div>
      {/* Score entry form */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <p style={{ color: 'white', fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Backfill Score</p>
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
              {users.map(u => (
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
              color: 'white', fontSize: '13px', fontWeight: 500, cursor: (submitting || !selectedMovie || !selectedUser || !score) ? 'not-allowed' : 'pointer',
              opacity: (submitting || !selectedMovie || !selectedUser || !score) ? 0.6 : 1, alignSelf: 'flex-start'
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Score'}
          </button>
        </div>
      </div>

      {/* Score matrix */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <Label>Score Matrix</Label>
          <button
            onClick={() => setShowAllFilms(v => !v)}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Mono',monospace" }}
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
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#4b5563', fontSize: '10px', fontFamily: "'DM Mono',monospace", fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Film</th>
                  {users.map(u => (
                    <th key={u.id} style={{ padding: '6px 8px', color: '#4b5563', fontSize: '10px', fontFamily: "'DM Mono',monospace", fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                      {u.name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixMovies.map((m, i) => {
                  const expUsers = expectedUsers(m.id)
                  const expUserIds = new Set(expUsers.map(u => u.id))
                  return (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <p style={{ color: 'white', fontSize: '12px', margin: 0, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                        <p style={{ color: '#4b5563', fontSize: '10px', margin: '1px 0 0', fontFamily: "'DM Mono',monospace" }}>{monthMap[m.month_id]?.month_year}</p>
                      </td>
                      {users.map(u => {
                        const hasScore = ratingSet.has(`${m.id}:${u.id}`)
                        const isExpected = expUserIds.has(u.id)
                        return (
                          <td key={u.id} style={{ padding: '7px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {!isExpected ? (
                              <span style={{ color: '#374151', fontSize: '12px' }}>–</span>
                            ) : hasScore ? (
                              <span style={{ color: '#4ade80', fontSize: '14px' }}>✓</span>
                            ) : (
                              <span style={{ color: '#ef4444', fontSize: '14px' }}>✗</span>
                            )}
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
      supabase.from('users').select('id, name, email, role, joined_at, is_active, admin_mode_enabled').order('joined_at'),
      supabase.from('months').select('id, season_id, month_year, status').order('month_year'),
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
  }, [isAdmin, profile, fetchAll])

  // Auto-clear success after 3s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(null), 3000)
    return () => clearTimeout(t)
  }, [success])

  // Guard
  if (!isAdmin || !profile?.admin_mode_enabled) {
    return (
      <div style={{ background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#4b5563', fontSize: '13px' }}>Admin access required</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", paddingBottom: '6rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4b5563', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>
            Admin
          </p>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.6rem', color: 'white', lineHeight: 1, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            Dashboard
          </h1>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: '7px', border: 'none',
                background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === tab ? 'white' : '#6b7280',
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
