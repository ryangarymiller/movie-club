import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { userColor, memberColor } from '../lib/colors'

// ── small shared helpers (kept local so the component is self-contained) ──
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const AVATAR_COLORS = ['#e11d48', '#db2777', '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#ca8a04']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function fmtScore(s) { return s != null ? Number(s).toFixed(2) : '—' }
function scoreColor(s) {
  if (s == null) return 'var(--text-faint)'
  if (s >= 8.5) return '#fbbf24'
  if (s >= 7) return '#86efac'
  if (s <= 4) return '#f87171'
  return 'var(--accent-light, #fca5a5)'
}
function deltaColor(d) {
  if (d == null) return 'var(--text-faint)'
  if (d <= 1.0) return '#86efac'
  if (d <= 2.0) return '#fbbf24'
  return '#f87171'
}

function Label({ children }) {
  return (
    <p style={{
      fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 10px',
    }}>
      {children}
    </p>
  )
}

function Avatar({ name, size = 30, color }) {
  return (
    <div style={{
      flexShrink: 0, width: size, height: size, borderRadius: '50%',
      background: color || avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: size * 0.36, fontWeight: 600, color: '#fff' }}>
        {initials(name)}
      </span>
    </div>
  )
}

export default function MonthReveal({ monthId, monthLabel, users = [], currentUserId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [films, setFilms] = useState([])
  const [ratings, setRatings] = useState([])
  const [guesses, setGuesses] = useState([])
  const [predictions, setPredictions] = useState([])

  const nameById = {}
  const colorById = {}
  for (const u of users) { nameById[u.id] = u.name; colorById[u.id] = userColor(u) || memberColor(u.name) }

  const load = useCallback(async () => {
    if (!monthId) return
    setLoading(true)
    setError(null)
    try {
      const { data: movieData, error: mErr } = await supabase
        .from('movies_safe')
        .select('id, title, poster_url, year_released, picked_by_user_id, pick_justification, historical_avg_score, scores_revealed, picker_revealed')
        .eq('month_id', monthId)
      if (mErr) throw mErr
      const movies = movieData ?? []
      const ids = movies.map(m => m.id)

      let ratingsData = [], guessData = [], predData = []
      if (ids.length) {
        const [r, g, p] = await Promise.all([
          supabase.from('ratings').select('movie_id, user_id, score').in('movie_id', ids),
          supabase.from('picker_guesses').select('movie_id, guessing_user_id, guessed_user_id').in('movie_id', ids),
          supabase.from('score_predictions').select('movie_id, predicting_user_id, target_user_id, predicted_score').in('movie_id', ids),
        ])
        ratingsData = r.data ?? []
        guessData = g.data ?? []
        predData = p.data ?? []
      }
      setFilms(movies)
      setRatings(ratingsData)
      setGuesses(guessData)
      setPredictions(predData)
    } catch (e) {
      setError(e.message ?? 'Failed to load reveal.')
    } finally {
      setLoading(false)
    }
  }, [monthId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'var(--text-dim)' }}>Loading reveal…</p>
  }
  if (error) {
    return <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#f87171' }}>{error}</p>
  }
  if (!films.length) {
    return <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'var(--text-dim)' }}>Nothing to reveal yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '8px',
        padding: '6px 14px', borderRadius: '999px',
        background: 'rgba(var(--fg-rgb),0.05)', border: '1px solid rgba(var(--fg-rgb),0.1)',
      }}>
        <span style={{ fontSize: '13px' }}>🎬</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {monthLabel} — Reveal
        </span>
      </div>

      {films.map(f => {
        const pickerName = f.picked_by_user_id ? (nameById[f.picked_by_user_id] ?? 'Unknown') : 'Unknown'
        const ratingByUser = {}
        for (const r of ratings) if (r.movie_id === f.id && r.score != null) ratingByUser[r.user_id] = r.score

        // Guess-the-picker results for this film. Exclude guesses by the test account
        // (and any unknown user) — it's filtered out of `users`/nameById, so it must not
        // appear as a blank "—" guesser or be counted in "X/Y guessed correctly".
        const filmGuesses = guesses.filter(g => g.movie_id === f.id && nameById[g.guessing_user_id])
        const correctGuessers = filmGuesses.filter(g => g.guessed_user_id === f.picked_by_user_id)
        const myGuess = filmGuesses.find(g => g.guessing_user_id === currentUserId)

        // Picker's predictions for this film
        // Likewise drop predictions targeting an unknown/test user (would render "Unknown").
        const filmPreds = predictions.filter(p => p.movie_id === f.id && p.predicting_user_id === f.picked_by_user_id && nameById[p.target_user_id])

        return (
          <div key={f.id} style={{
            background: 'rgba(var(--fg-rgb),0.03)', border: '1px solid rgba(var(--fg-rgb),0.08)',
            borderRadius: '14px', padding: '16px',
          }}>
            {/* Film + picker */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: filmGuesses.length || filmPreds.length ? '14px' : 0 }}>
              <div style={{ flexShrink: 0, width: '46px', aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)' }}>
                {f.poster_url && (
                  <img src={`https://image.tmdb.org/t/p/w185${f.poster_url}`} alt={f.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.style.display = 'none' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: '0.03em', color: 'var(--text-strong)', margin: '0 0 4px', lineHeight: 1.1 }}>
                  {f.title}{f.year_released ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> {f.year_released}</span> : null}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: f.pick_justification ? '6px' : 0 }}>
                  <Avatar name={pickerName} size={22} color={colorById[f.picked_by_user_id]} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'var(--text)' }}>
                    Picked by <strong style={{ color: 'var(--text-strong)' }}>{pickerName}</strong>
                  </span>
                </div>
                {f.pick_justification && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', fontStyle: 'italic', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
                    "{f.pick_justification}"
                  </p>
                )}
              </div>
            </div>

            {/* Guess the picker results */}
            {filmGuesses.length > 0 && (
              <div style={{ marginBottom: filmPreds.length ? '14px' : 0, paddingTop: '12px', borderTop: '1px solid rgba(var(--fg-rgb),0.06)' }}>
                <Label>Guess the Picker</Label>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  {correctGuessers.length}/{filmGuesses.length} guessed correctly
                  {myGuess && (
                    <span style={{ color: myGuess.guessed_user_id === f.picked_by_user_id ? '#86efac' : '#f87171', marginLeft: '8px' }}>
                      · you {myGuess.guessed_user_id === f.picked_by_user_id ? 'nailed it' : 'missed'}
                    </span>
                  )}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {filmGuesses.map((g, i) => {
                    const right = g.guessed_user_id === f.picked_by_user_id
                    return (
                      <span key={i} style={{
                        fontFamily: "'DM Mono', monospace", fontSize: '10px', padding: '3px 8px', borderRadius: '999px',
                        background: 'rgba(var(--fg-rgb),0.05)',
                        border: `1px solid ${right ? '#86efac55' : '#f8717155'}`,
                        color: 'var(--text-muted)',
                      }}>
                        {nameById[g.guessing_user_id] ?? '—'} → {nameById[g.guessed_user_id] ?? '—'} {right ? '✓' : '✗'}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Picker's score predictions vs actual */}
            {filmPreds.length > 0 && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(var(--fg-rgb),0.06)' }}>
                <Label>Picker's Predictions</Label>
                {filmPreds.map((p, i) => {
                  const actual = ratingByUser[p.target_user_id]
                  const delta = (p.predicted_score != null && actual != null) ? Math.abs(Number(p.predicted_score) - Number(actual)) : null
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(var(--fg-rgb),0.04)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nameById[p.target_user_id] ?? 'Unknown'}
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'var(--text-dim)' }}>{fmtScore(p.predicted_score)}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'var(--text-faint)' }}>→</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', fontWeight: 600, color: scoreColor(actual) }}>{fmtScore(actual)}</span>
                      {delta != null && (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: deltaColor(delta), flexShrink: 0 }}>±{delta.toFixed(2)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
