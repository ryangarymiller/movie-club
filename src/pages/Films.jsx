import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'
import { getAwardsForFilm, fetchAwardsForFilm } from '../lib/awards'

// ─── helpers ──────────────────────────────────────────────────────────────────

export const MEMBER_COLORS = {
  'Ryan Miller':    '#6366f1',
  'Ryan Bey':       '#f43f5e',
  'Andrew Bond':    '#10b981',
  'Zack Anjoorian': '#f59e0b',
  'Chris Deschenes':'#3b82f6',
}

export function pickerColor(pickerName) {
  if (!pickerName) return undefined
  return MEMBER_COLORS[pickerName] ?? undefined
}

export function sortMonthsDescending(months) {
  return [...months].sort((a, b) => {
    if (a.month_year < b.month_year) return 1
    if (a.month_year > b.month_year) return -1
    return 0
  })
}

function formatMonthYear(monthYear) {
  const d = new Date(monthYear + '-01')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function fmtScore(s) {
  return s != null ? Number(s).toFixed(2) : null
}

function isVault(movie) {
  return movie.historical_avg_score != null && movie.historical_avg_score >= 8.5
}

function formatRuntime(mins) {
  if (!mins) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Score colour: green if high, red if low, accent otherwise
function scoreColor(score) {
  if (score == null) return 'var(--accent-light, #fca5a5)'
  if (score >= 8.5) return '#fbbf24'
  if (score >= 7) return '#86efac'
  if (score <= 4) return '#f87171'
  return 'var(--accent-light, #fca5a5)'
}

// Deterministic colour for member avatars from initials
const AVATAR_COLORS = [
  '#e11d48','#db2777','#9333ea','#7c3aed','#4f46e5',
  '#2563eb','#0891b2','#0d9488','#16a34a','#ca8a04',
]
function avatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
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

function PosterCard({ movie, vault = false, onClick, pickerBorderColor }) {
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
          boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          transform: hovered ? 'translateY(-3px) scale(1.02)' : 'none',
          ...(pickerBorderColor ? { borderLeft: `3px solid ${pickerBorderColor}` } : {}),
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
          <div style={{ position: 'absolute', top: '6px', right: '6px' }}>
            <span style={{
              fontSize: '13px',
              color: '#fbbf24',
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

// ─── PickerLegend ─────────────────────────────────────────────────────────────

function PickerLegend({ movies, userById }) {
  // Collect unique pickers that are revealed
  const seen = new Set()
  const entries = []
  for (const m of movies) {
    if (m.picker_revealed && m.picked_by_user_id) {
      const name = userById[m.picked_by_user_id]?.name
      if (name && !seen.has(name)) {
        seen.add(name)
        const color = pickerColor(name)
        if (color) entries.push({ name, color })
      }
    }
  }
  if (entries.length === 0) return null

  return (
    <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '10px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.2)',
        margin: '0 0 10px',
      }}>
        Pickers
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
        {entries.map(({ name, color }) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.04em',
            }}>
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PosterGrid ───────────────────────────────────────────────────────────────

function PosterGrid({ movies, vault = false, loading, skeletonCount = 15, onSelect, userById = {} }) {
  return (
    <div>
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
          : movies.map(m => {
              const name = m.picker_revealed ? (userById[m.picked_by_user_id]?.name ?? null) : null
              const borderColor = name ? pickerColor(name) : undefined
              return (
                <PosterCard
                  key={m.id}
                  movie={m}
                  vault={vault || isVault(m)}
                  onClick={onSelect}
                  pickerBorderColor={borderColor}
                />
              )
            })
        }
      </div>
      {!loading && <PickerLegend movies={movies} userById={userById} />}
    </div>
  )
}

// ─── FilmDetailOverlay ────────────────────────────────────────────────────────

function MemberScoreRow({ rating, user }) {
  const name = user?.name ?? 'Unknown'
  const score = rating?.score
  const excitement = rating?.pre_watch_excitement

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* Avatar */}
      <div style={{
        flexShrink: 0,
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: avatarColor(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#fff' }}>
          {initials(name)}
        </span>
      </div>

      {/* Name */}
      <span style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>

      {/* Pre-watch excitement */}
      {excitement != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px', marginRight: '4px' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
            HYPED
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
            {Number(excitement).toFixed(1)}
          </span>
        </div>
      )}

      {/* Final score */}
      <div style={{
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: '8px',
        background: score != null ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: score != null ? '1px solid rgba(255,255,255,0.08)' : 'none',
        minWidth: '48px',
        textAlign: 'center',
      }}>
        {score != null ? (
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '15px',
            fontWeight: 600,
            color: scoreColor(Number(score)),
          }}>
            {Number(score).toFixed(2)}
          </span>
        ) : (
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>—</span>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: '9px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.25)',
      margin: '0 0 10px',
    }}>
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />
}

function PlotSummary({ text }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  return (
    <div>
      <SectionLabel>Plot</SectionLabel>
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.6)',
          margin: '0 0 6px',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 3,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}
      >
        {text}
      </p>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: "'DM Mono', monospace",
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: 'var(--accent-light, #fca5a5)',
        }}
      >
        {expanded ? 'SHOW LESS' : 'READ MORE'}
      </button>
    </div>
  )
}

function StreamingSection({ providers }) {
  // providers is the full TMDB watch_providers response JSON stored in the DB
  const us = providers?.results?.US ?? providers?.US ?? null

  const flatrate = us?.flatrate ?? []
  const rent = us?.rent ?? []
  const buy = us?.buy ?? []

  const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0

  if (!providers || !hasAny) {
    return (
      <div>
        <SectionLabel>Where to Watch</SectionLabel>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
          No streaming info available
        </p>
      </div>
    )
  }

  function ProviderRow({ label, items }) {
    if (!items || items.length === 0) return null
    return (
      <div style={{ marginBottom: '12px' }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)', margin: '0 0 8px', textTransform: 'uppercase' }}>
          {label}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {items.map(p => (
            <div key={p.provider_id ?? p.provider_name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {p.logo_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                  alt={p.provider_name}
                  title={p.provider_name}
                  style={{ width: '28px', height: '28px', borderRadius: '6px', display: 'block' }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : (
                <span style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.55)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {p.provider_name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>Where to Watch</SectionLabel>
      <ProviderRow label="Stream" items={flatrate} />
      <ProviderRow label="Rent" items={rent} />
      <ProviderRow label="Buy" items={buy} />
    </div>
  )
}

// ─── Prediction helpers (exported for tests) ─────────────────────────────────

export function predictionDelta(predicted, actual) {
  if (predicted == null || actual == null) return null
  return Math.abs(Number(predicted) - Number(actual))
}

export function deltaColor(delta) {
  if (delta == null) return 'rgba(255,255,255,0.4)'
  if (delta <= 1.0) return '#86efac'   // green
  if (delta <= 2.0) return '#fbbf24'   // yellow
  return '#f87171'                     // red
}

export function avgAccuracy(predictions, ratings) {
  // predictions: [{target_user_id, predicted_score}]
  // ratings: [{user_id, score}]
  const ratingByUser = {}
  for (const r of ratings) ratingByUser[r.user_id] = r.score
  const deltas = predictions
    .map(p => predictionDelta(p.predicted_score, ratingByUser[p.target_user_id]))
    .filter(d => d != null)
  if (!deltas.length) return null
  return deltas.reduce((s, d) => s + d, 0) / deltas.length
}

// ─── PredictionsSection ───────────────────────────────────────────────────────

function PredictionsSection({ movie, profile, users, ratings, predictions, onSaved }) {
  const otherUsers = users.filter(u => u.id !== profile?.id)
  const [inputMap, setInputMap] = useState({}) // target_user_id → string value
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Populate inputs with existing predictions
  useEffect(() => {
    const map = {}
    for (const p of predictions) {
      map[p.target_user_id] = String(p.predicted_score ?? '')
    }
    setInputMap(map)
  }, [predictions])

  if (!profile) return null

  const scoresRevealed = movie?.scores_revealed

  // After reveal: show predicted vs actual
  if (scoresRevealed) {
    if (!predictions.length) return null

    const ratingByUser = {}
    for (const r of ratings) ratingByUser[r.user_id] = r.score

    const myPredictions = predictions.filter(p => p.predicting_user_id === profile.id)
    if (!myPredictions.length) return null

    const acc = avgAccuracy(myPredictions, ratings)

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
          <SectionLabel>Predictions</SectionLabel>
          {acc != null && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: deltaColor(acc),
              letterSpacing: '0.06em',
            }}>
              Your avg accuracy: ±{acc.toFixed(2)}
            </span>
          )}
        </div>
        {myPredictions.map(p => {
          const targetUser = users.find(u => u.id === p.target_user_id)
          const actual = ratingByUser[p.target_user_id]
          const delta = predictionDelta(p.predicted_score, actual)
          return (
            <div
              key={p.target_user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <span style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: 'rgba(255,255,255,0.7)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {targetUser?.name ?? 'Unknown'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                {p.predicted_score != null ? Number(p.predicted_score).toFixed(2) : '—'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}>→</span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '13px',
                fontWeight: 600,
                color: actual != null ? scoreColor(Number(actual)) : 'rgba(255,255,255,0.2)',
              }}>
                {actual != null ? Number(actual).toFixed(2) : '—'}
              </span>
              {delta != null && (
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  color: deltaColor(delta),
                  background: `${deltaColor(delta)}18`,
                  border: `1px solid ${deltaColor(delta)}40`,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  flexShrink: 0,
                }}>
                  ±{delta.toFixed(2)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Before reveal: input form
  async function handleSave() {
    if (!profile || !movie) return
    setSaving(true)
    setSaveError(null)
    try {
      const rows = otherUsers
        .filter(u => inputMap[u.id] && inputMap[u.id].trim() !== '')
        .map(u => {
          const val = parseFloat(inputMap[u.id])
          if (isNaN(val) || val < 0.01 || val > 10.0) throw new Error(`Invalid score for ${u.name}`)
          return {
            movie_id: movie.id,
            predicting_user_id: profile.id,
            target_user_id: u.id,
            predicted_score: Math.round(val * 100) / 100,
          }
        })
      if (rows.length > 0) {
        const { error } = await supabase
          .from('score_predictions')
          .upsert(rows, { onConflict: 'movie_id,predicting_user_id,target_user_id' })
        if (error) throw error
      }
      if (onSaved) onSaved()
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save predictions.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionLabel>Predictions</SectionLabel>
      <p style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        color: 'rgba(255,255,255,0.3)',
        margin: '0 0 14px',
        lineHeight: 1.5,
      }}>
        Predict each member's score. Revealed when scores are shown.
      </p>
      {otherUsers.map(u => {
        // Fix 4: lock prediction once the target user has submitted their score
        const targetRating = ratings.find(r => r.user_id === u.id)
        const isLocked = targetRating?.score != null
        return (
          <div
            key={u.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              opacity: isLocked ? 0.55 : 1,
            }}
          >
            <span style={{
              flex: 1,
              minWidth: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: 'rgba(255,255,255,0.7)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {u.name}
              {isLocked && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginLeft: '6px', letterSpacing: '0.08em' }}>
                  SCORED
                </span>
              )}
            </span>
            <input
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              placeholder="—"
              disabled={isLocked}
              value={inputMap[u.id] ?? ''}
              onChange={e => !isLocked && setInputMap(prev => ({ ...prev, [u.id]: e.target.value }))}
              style={{
                width: '72px',
                padding: '5px 8px',
                borderRadius: '7px',
                border: isLocked ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.1)',
                background: isLocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                color: isLocked ? 'rgba(255,255,255,0.3)' : 'white',
                fontFamily: "'DM Mono', monospace",
                fontSize: '13px',
                textAlign: 'right',
                outline: 'none',
                flexShrink: 0,
                cursor: isLocked ? 'not-allowed' : 'auto',
              }}
            />
          </div>
        )
      })}
      {saveError && (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#f87171', margin: '10px 0 0' }}>
          {saveError}
        </p>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: '14px',
          background: saving ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
          color: saving ? '#4b5563' : '#fff',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          fontSize: '13px',
          border: 'none',
          borderRadius: '8px',
          padding: '8px 16px',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save Predictions'}
      </button>
    </div>
  )
}

export function FilmDetailOverlay({ movie, onClose }) {
  const { profile, isAdmin } = useAuth()
  const [visible, setVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(true)
  const [ratings, setRatings] = useState([])
  const [users, setUsers] = useState([])
  const [reviews, setReviews] = useState([])
  const [fullMovie, setFullMovie] = useState(null)
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [reviewText, setReviewText] = useState('')
  const [editingReview, setEditingReview] = useState(false)
  const [editText, setEditText] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [awardData, setAwardData] = useState(null) // { movies, ratings, users, months, seasons }
  const [filmAwardsState, setFilmAwardsState] = useState(null) // null = not yet loaded
  const scrollRef = useRef(null)

  // Trigger animation
  useEffect(() => {
    if (movie) {
      requestAnimationFrame(() => setVisible(true))
      // Reset scroll
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    } else {
      setVisible(false)
    }
  }, [movie])

  // Fetch full details whenever a movie is selected
  const fetchDetails = useCallback(async (movieId, movieFallback) => {
    const [
      { data: movieData },
      { data: ratingsData },
      { data: usersData },
      { data: reviewsData },
      { data: predictionsData },
    ] = await Promise.all([
      supabase
        .from('movies_safe')
        .select('*')
        .eq('id', movieId)
        .single(),
      supabase
        .from('ratings')
        .select('user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
        .eq('movie_id', movieId),
      supabase
        .from('users')
        .select('id, name, email, role, joined_at'),
      supabase
        .from('reviews')
        .select('id, movie_id, user_id, body, created_at')
        .eq('movie_id', movieId),
      supabase
        .from('score_predictions')
        .select('id, predicting_user_id, target_user_id, predicted_score')
        .eq('movie_id', movieId),
    ])

    let resolvedMovie = movieData ?? movieFallback

    // Fix 1: Fetch and cache streaming providers if not yet stored.
    // Order: TMDB first; if it returns nothing, fall back to the streaming-fallback
    // Edge Function (server-side Claude web search). Cache whichever yields results.
    if (resolvedMovie && resolvedMovie.streaming_providers == null && resolvedMovie.tmdb_id) {
      let providersData = null
      try {
        const tmdbToken = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN
        const resp = await fetch(
          `https://api.themoviedb.org/3/movie/${resolvedMovie.tmdb_id}/watch/providers`,
          { headers: { Authorization: `Bearer ${tmdbToken}` } }
        )
        if (resp.ok) {
          const tmdbData = await resp.json()
          const us = tmdbData?.results?.US ?? null
          const candidate = {
            flatrate: (us?.flatrate ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
            rent:     (us?.rent     ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
            buy:      (us?.buy      ?? []).map(p => ({ provider_name: p.provider_name, logo_path: p.logo_path, provider_id: p.provider_id })),
          }
          if (candidate.flatrate.length || candidate.rent.length || candidate.buy.length) {
            providersData = candidate
          }
        }
      } catch (_e) {
        // Ignore — fall through to the Edge Function fallback.
      }

      // Fallback: TMDB had nothing/failed → ask the streaming-fallback Edge Function.
      if (!providersData) {
        try {
          const { data: fb } = await supabase.functions.invoke('streaming-fallback', {
            body: {
              title: resolvedMovie.title,
              year: resolvedMovie.year_released ?? null,
              tmdb_id: resolvedMovie.tmdb_id ?? null,
            },
          })
          const us = fb?.results?.US ?? null
          const candidate = {
            flatrate: (us?.flatrate ?? []).map(p => ({ provider_name: p.provider_name })),
            rent:     (us?.rent     ?? []).map(p => ({ provider_name: p.provider_name })),
            buy:      (us?.buy      ?? []).map(p => ({ provider_name: p.provider_name })),
          }
          if (candidate.flatrate.length || candidate.rent.length || candidate.buy.length) {
            providersData = candidate
          }
        } catch (_e) {
          // Silently ignore — StreamingSection will show "No streaming info available".
        }
      }

      if (providersData) {
        await supabase
          .from('movies')
          .update({ streaming_providers: providersData })
          .eq('id', resolvedMovie.id)
        resolvedMovie = { ...resolvedMovie, streaming_providers: providersData }
      }
    }

    setFullMovie(resolvedMovie)
    setRatings(ratingsData ?? [])
    setUsers(usersData ?? [])
    setReviews(reviewsData ?? [])
    setPredictions(predictionsData ?? [])
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    if (!movie) return

    setDetailLoading(true)
    setRatings([])
    setUsers([])
    setReviews([])
    setPredictions([])
    setFullMovie(null)
    setShowScoreModal(false)
    setReviewText('')
    setEditingReview(false)
    setEditText('')
    setReviewError('')
    setFilmAwardsState(null)

    fetchDetails(movie.id, movie)
  }, [movie, fetchDetails])

  // Load the club-wide dataset once so awards (computed at runtime) can be shown.
  useEffect(() => {
    if (!movie || awardData) return
    let cancelled = false
    async function loadAwardData() {
      const [
        { data: moviesData },
        { data: ratingsData },
        { data: usersData },
        { data: monthsData },
        { data: seasonsData },
      ] = await Promise.all([
        supabase.from('movies_safe').select('id, month_id, title, poster_url, year_released, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id'),
        supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, submitted_at'),
        supabase.from('users').select('id, name, email, role, joined_at, is_active'),
        supabase.from('months').select('id, season_id, month_year, status'),
        supabase.from('seasons').select('id, name, start_date, end_date'),
      ])
      if (cancelled) return
      setAwardData({
        movies: moviesData ?? [],
        ratings: ratingsData ?? [],
        users: usersData ?? [],
        months: monthsData ?? [],
        seasons: seasonsData ?? [],
      })
    }
    loadAwardData()
    return () => { cancelled = true }
  }, [movie, awardData])

  // Fetch this film's awards from DB; fall back to computed set if DB is empty.
  useEffect(() => {
    if (!movie) return
    let cancelled = false
    async function loadFilmAwards() {
      const dbAwards = await fetchAwardsForFilm(supabase, movie.id)
      if (cancelled) return
      if (dbAwards.length > 0) {
        setFilmAwardsState(dbAwards)
      } else {
        // DB not yet populated — fall back to compute approach once awardData is ready
        setFilmAwardsState(null)
      }
    }
    loadFilmAwards()
    return () => { cancelled = true }
  }, [movie])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  async function handleSubmitReview() {
    if (!profile || !movie) return
    const text = reviewText.trim()
    if (text.length < 10) {
      setReviewError('Review must be at least 10 characters.')
      return
    }
    setReviewError('')
    setReviewSubmitting(true)
    await supabase
      .from('reviews')
      .upsert(
        { movie_id: movie.id, user_id: profile.id, body: text },
        { onConflict: 'movie_id,user_id' }
      )
    setReviewText('')
    await fetchDetails(movie.id, movie)
    setReviewSubmitting(false)
  }

  async function handleEditReview() {
    if (!profile || !movie) return
    const text = editText.trim()
    if (text.length < 10) {
      setReviewError('Review must be at least 10 characters.')
      return
    }
    setReviewError('')
    setReviewSubmitting(true)
    await supabase
      .from('reviews')
      .upsert(
        { movie_id: movie.id, user_id: profile.id, body: text },
        { onConflict: 'movie_id,user_id' }
      )
    setEditingReview(false)
    setEditText('')
    await fetchDetails(movie.id, movie)
    setReviewSubmitting(false)
  }

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleClose()
    }
    if (movie) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [movie])

  if (!movie) return null

  const m = fullMovie ?? movie
  const genres = Array.isArray(m.genre) ? m.genre : []
  const runtime = formatRuntime(m.runtime_minutes)
  const vault = isVault(m)

  // ── Scores section logic ──
  const myUserId = profile?.id
  const myRating = ratings.find(r => r.user_id === myUserId)
  const myHasSubmitted = myRating != null

  // Build user lookup
  const userById = {}
  users.forEach(u => { userById[u.id] = u })

  // Which ratings to display
  let visibleRatings = []
  let scoresMessage = null

  if (m.scores_revealed) {
    // All scores visible
    visibleRatings = ratings
  } else if (myHasSubmitted) {
    // Rolling: only show scores of members who have also submitted
    visibleRatings = ratings // all submitted ratings (only submitters have rows)
  } else {
    // Fix 3: even before scores_revealed, always show the current user's own score row
    scoresMessage = 'Scores revealed after the scoring deadline'
    if (myRating) {
      visibleRatings = [myRating]
    }
  }

  // Compute group average from visibleRatings that have a score
  const scoredRatings = visibleRatings.filter(r => r.score != null)
  const groupAvg = scoredRatings.length
    ? scoredRatings.reduce((s, r) => s + Number(r.score), 0) / scoredRatings.length
    : null

  // Recommend count — exclude test user
  const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
  const testUserId = users.find(u => u.email === TEST_EMAIL)?.id ?? null
  const ratedWithRecommend = ratings.filter(r =>
    r.recommend_outside_club != null && r.user_id !== testUserId
  )
  const recommendYes = ratedWithRecommend.filter(r => r.recommend_outside_club).length
  const recommendTotal = ratedWithRecommend.length

  // Month label
  const monthLabel = m._monthLabel ?? null

  // Streaming providers
  const streamingProviders = m.streaming_providers ?? null

  // Picker name
  let pickerName = null
  if (m.picker_revealed && m.picked_by_user_id) {
    const pickerUser = users.find(u => u.id === m.picked_by_user_id)
    pickerName = pickerUser?.name ?? null
  }

  // Reviews
  const sortedReviews = [...reviews].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const myReview = reviews.find(r => r.user_id === myUserId) ?? null

  // Awards this film has won — prefer DB read; fall back to compute if DB empty.
  const filmAwards = filmAwardsState != null
    ? filmAwardsState
    : (awardData ? getAwardsForFilm(m.id, awardData) : [])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 99,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Overlay panel */}
      <div
        ref={scrollRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            float: 'right',
            margin: '16px 16px 0 0',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '20px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Close"
        >
          ×
        </button>

        {/* Content */}
        <div style={{ padding: '0 1rem 4rem', boxSizing: 'border-box', width: '100%', maxWidth: '680px', margin: '0 auto' }}>

          {/* ── HERO ── */}
          <div style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'flex-start',
            paddingTop: '20px',
            marginBottom: '28px',
          }}>
            {/* Poster */}
            <div style={{
              flexShrink: 0,
              width: '110px',
              aspectRatio: '2/3',
              borderRadius: '10px',
              overflow: 'hidden',
              background: '#1a1b24',
              boxShadow: vault
                ? '0 0 0 2px #d97706, 0 0 20px rgba(217,119,6,0.4), 0 8px 32px rgba(0,0,0,0.7)'
                : '0 8px 32px rgba(0,0,0,0.65)',
            }}>
              {m.poster_url ? (
                <img
                  src={`https://image.tmdb.org/t/p/w500${m.poster_url}`}
                  alt={m.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', color: 'rgba(255,255,255,0.15)' }}>
                    {initials(m.title)}
                  </span>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
              <h1 style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 'clamp(1.8rem, 7vw, 2.6rem)',
                color: '#fff',
                lineHeight: 1.0,
                letterSpacing: '0.03em',
                margin: '0 0 8px',
                wordBreak: 'break-word',
              }}>
                {m.title}
              </h1>

              {/* Meta line: year · runtime */}
              <p style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '12px',
                color: 'rgba(255,255,255,0.35)',
                margin: '0 0 10px',
                lineHeight: 1.4,
              }}>
                {[m.year_released, runtime].filter(Boolean).join(' · ')}
                {monthLabel ? <><br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>{monthLabel}</span></> : null}
              </p>

              {/* Director */}
              {m.director && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.55)',
                  margin: '0 0 10px',
                }}>
                  dir. <span style={{ color: 'rgba(255,255,255,0.8)' }}>{m.director}</span>
                </p>
              )}

              {/* Genre tags */}
              {genres.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {genres.map(g => (
                    <span key={g} style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '11px',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Vault badge */}
              {vault && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <span style={{ fontSize: '11px' }}>★</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: '#fbbf24' }}>THE VAULT</span>
                </div>
              )}
            </div>
          </div>

          {/* ── SUBMIT YOUR SCORE (backfill CTA) ── */}
          {m.scores_revealed && !myHasSubmitted && (
            <>
              <Divider />
              <div style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                padding: '16px',
              }}>
                <p style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.25)',
                  margin: '0 0 8px',
                }}>
                  Your Score
                </p>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: '#6b7280',
                  margin: '0 0 12px',
                }}>
                  You haven't scored this film yet.
                </p>
                <button
                  onClick={() => setShowScoreModal(true)}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                  }}
                >
                  Submit Score
                </button>
              </div>
            </>
          )}

          {/* ── SCORES ── */}
          <Divider />
          <div style={{ marginBottom: '0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: m.scores_revealed && recommendTotal > 0 ? '8px' : '16px' }}>
              <SectionLabel>Scores</SectionLabel>
              {groupAvg != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '2rem',
                    lineHeight: 1,
                    color: scoreColor(groupAvg),
                  }}>
                    {groupAvg.toFixed(2)}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>/10</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginLeft: '4px' }}>
                    avg ({scoredRatings.length})
                  </span>
                </div>
              )}
            </div>
            {/* Recommend stat — only after scores revealed and if any ratings have the field set */}
            {m.scores_revealed && recommendTotal > 0 && (
              <p style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.05em',
                margin: '0 0 16px',
              }}>
                {recommendYes}/{recommendTotal} would recommend outside the club
              </p>
            )}

            {detailLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} style={{ height: '44px', borderRadius: '8px' }} />
                ))}
              </div>
            ) : (
              <div>
                {/* Fix 3: always show own score row first, regardless of reveal state */}
                {scoresMessage && myRating && (
                  <MemberScoreRow
                    rating={myRating}
                    user={userById[myRating.user_id]}
                  />
                )}

                {scoresMessage ? (
                  <div style={{
                    padding: '18px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'center',
                    marginTop: myRating ? '12px' : 0,
                  }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', margin: 0 }}>
                      {scoresMessage}
                    </p>
                  </div>
                ) : (
                  <>
                    {visibleRatings.length === 0 ? (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
                        No scores submitted yet.
                      </p>
                    ) : (
                      visibleRatings
                        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                        .map(r => (
                          <MemberScoreRow
                            key={r.user_id}
                            rating={r}
                            user={userById[r.user_id]}
                          />
                        ))
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── AWARDS ── */}
          {filmAwards.length > 0 && (
            <>
              <Divider />
              <div>
                <SectionLabel>Awards</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filmAwards.map((a, i) => (
                    <div
                      key={`${a.scope}-${a.key}-${a.periodRef ?? i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>{a.emoji}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: '14px',
                          color: '#fff',
                          margin: 0,
                          lineHeight: 1.2,
                        }}>
                          {a.label}
                        </p>
                        {a.period && (
                          <p style={{
                            fontFamily: "'DM Mono', monospace",
                            fontSize: '10px',
                            letterSpacing: '0.08em',
                            color: 'rgba(255,255,255,0.3)',
                            margin: '3px 0 0',
                          }}>
                            {a.period}{a.metric ? ` · ${a.metric}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── PREDICTIONS ── */}
          <Divider />
          <PredictionsSection
            movie={m}
            profile={profile}
            users={users}
            ratings={ratings}
            predictions={predictions}
            onSaved={() => fetchDetails(movie.id, movie)}
          />

          {/* ── PICKER ── */}
          <Divider />
          <div>
            <SectionLabel>Picked By</SectionLabel>
            {m.picker_revealed ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {pickerName && (
                  <div style={{
                    flexShrink: 0,
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: avatarColor(pickerName),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#fff' }}>
                      {initials(pickerName)}
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>
                    {pickerName ?? 'Unknown'}
                  </p>
                  {m.pick_justification && (
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '13px',
                      lineHeight: 1.65,
                      color: 'rgba(255,255,255,0.5)',
                      margin: 0,
                      fontStyle: 'italic',
                    }}>
                      "{m.pick_justification}"
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', margin: 0 }}>
                Picker revealed at end of month
              </p>
            )}
          </div>

          {/* ── STREAMING ── */}
          <Divider />
          <StreamingSection providers={streamingProviders} />

          {/* ── PLOT ── */}
          {m.plot_summary && (
            <>
              <Divider />
              <PlotSummary text={m.plot_summary} />
            </>
          )}

          {/* ── RECOMMEND ── */}
          {m.scores_revealed && recommendTotal > 0 && (
            <>
              <Divider />
              <div>
                <SectionLabel>Outside Recommendation</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Pill bar */}
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    height: '6px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(recommendYes / recommendTotal) * 100}%`,
                      background: recommendYes / recommendTotal >= 0.6 ? '#86efac' : 'var(--accent)',
                      borderRadius: '999px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.55)',
                    flexShrink: 0,
                  }}>
                    {recommendYes}/{recommendTotal} would recommend
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── REVIEWS ── */}
          {m.scores_revealed && (
            <>
              <Divider />
              <div>
                <SectionLabel>Reviews</SectionLabel>

                {/* Existing reviews list */}
                {sortedReviews.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {sortedReviews.map(review => {
                      const reviewer = userById[review.user_id]
                      const reviewerName = reviewer?.name ?? 'Unknown'
                      const isMyReview = review.user_id === myUserId
                      const dateStr = review.created_at
                        ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : ''
                      return (
                        <div
                          key={review.id}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: '12px',
                            padding: '14px',
                          }}
                        >
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                              flexShrink: 0,
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: avatarColor(reviewerName),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#fff' }}>
                                {initials(reviewerName)}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                                {reviewerName}
                              </p>
                              {dateStr && (
                                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.25)', margin: '2px 0 0', letterSpacing: '0.04em' }}>
                                  {dateStr}
                                </p>
                              )}
                            </div>
                            {isMyReview && !editingReview && (
                              <button
                                onClick={() => { setEditingReview(true); setEditText(review.body); setReviewError('') }}
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: '10px',
                                  letterSpacing: '0.08em',
                                  color: 'rgba(255,255,255,0.5)',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </div>

                          {/* Body or edit textarea */}
                          {isMyReview && editingReview ? (
                            <div>
                              <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                placeholder="What did you think?"
                                style={{
                                  width: '100%',
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '8px',
                                  padding: '10px',
                                  color: 'white',
                                  fontFamily: "'DM Sans', sans-serif",
                                  fontSize: '14px',
                                  minHeight: '80px',
                                  resize: 'vertical',
                                  boxSizing: 'border-box',
                                  outline: 'none',
                                }}
                              />
                              {reviewError && (
                                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#f87171', margin: '6px 0 0' }}>
                                  {reviewError}
                                </p>
                              )}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                <button
                                  onClick={handleEditReview}
                                  disabled={reviewSubmitting}
                                  style={{
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                                    opacity: reviewSubmitting ? 0.6 : 1,
                                  }}
                                >
                                  {reviewSubmitting ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  onClick={() => { setEditingReview(false); setEditText(''); setReviewError('') }}
                                  disabled={reviewSubmitting}
                                  style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: '14px',
                                    color: 'rgba(255,255,255,0.5)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p style={{
                              fontFamily: "'DM Sans', sans-serif",
                              fontSize: '14px',
                              lineHeight: 1.7,
                              color: 'rgba(255,255,255,0.65)',
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                            }}>
                              {review.body}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Fix 2: prompt to score first if user has no score yet */}
                {!myReview && myRating?.score == null && (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', margin: 0 }}>
                    Submit your score first to leave a review.
                  </p>
                )}

                {/* New review form — only if current user has scored AND hasn't written a review */}
                {!myReview && myRating?.score != null && (
                  <div>
                    <textarea
                      value={reviewText}
                      onChange={e => setReviewText(e.target.value)}
                      placeholder="What did you think?"
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '10px',
                        color: 'white',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '14px',
                        minHeight: '80px',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    {reviewError && (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#f87171', margin: '6px 0 0' }}>
                        {reviewError}
                      </p>
                    )}
                    <button
                      onClick={handleSubmitReview}
                      disabled={reviewSubmitting}
                      style={{
                        marginTop: '10px',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 600,
                        fontSize: '14px',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                        opacity: reviewSubmitting ? 0.6 : 1,
                      }}
                    >
                      {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Score submission modal for backfill */}
      {showScoreModal && (
        <ScoreModal
          movie={m}
          existingRating={myRating}
          onClose={() => setShowScoreModal(false)}
          onSaved={() => {
            setShowScoreModal(false)
            if (movie) fetchDetails(movie.id, movie)
          }}
        />
      )}
    </>
  )
}

// ─── AllFilms tab ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: 'high', label: 'Highest Rated' },
  { key: 'low', label: 'Lowest Rated' },
  { key: 'picker', label: 'By Picker', requiresReveal: true },
]

function AllFilmsTab({ movies, loading, onSelect, userById, seasons }) {
  const [sort, setSort] = useState('recent')
  const [filterSeason, setFilterSeason] = useState('all')
  const [filterMinScore, setFilterMinScore] = useState('')
  const [filterMaxScore, setFilterMaxScore] = useState('')

  // Determine if any picker is revealed (to show "By Picker" option)
  const anyPickerRevealed = movies.some(m => m.picker_revealed)

  // Build season options from seasons prop
  const seasonOptions = seasons.map(s => ({ id: s.id, name: s.name }))

  // Apply filters first
  let filtered = [...movies]
  if (filterSeason !== 'all') {
    filtered = filtered.filter(m => m._seasonId === filterSeason)
  }
  const minScore = filterMinScore !== '' ? parseFloat(filterMinScore) : null
  const maxScore = filterMaxScore !== '' ? parseFloat(filterMaxScore) : null
  if (minScore != null && !isNaN(minScore)) {
    filtered = filtered.filter(m => m.historical_avg_score != null && m.historical_avg_score >= minScore)
  }
  if (maxScore != null && !isNaN(maxScore)) {
    filtered = filtered.filter(m => m.historical_avg_score != null && m.historical_avg_score <= maxScore)
  }

  // Apply sort
  const sorted = filtered.sort((a, b) => {
    if (sort === 'high') return (b.historical_avg_score ?? -1) - (a.historical_avg_score ?? -1)
    if (sort === 'low') return (a.historical_avg_score ?? 999) - (b.historical_avg_score ?? 999)
    if (sort === 'picker') {
      // Group by picker; nulls last
      const pa = a.picker_revealed ? (a.picked_by_user_id ?? '') : ''
      const pb = b.picker_revealed ? (b.picked_by_user_id ?? '') : ''
      if (pa < pb) return -1
      if (pa > pb) return 1
      return (a._monthOrder ?? 0) - (b._monthOrder ?? 0)
    }
    // recent: descending month order, id asc within month
    if ((b._monthOrder ?? 0) !== (a._monthOrder ?? 0)) return (b._monthOrder ?? 0) - (a._monthOrder ?? 0)
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const selectStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: '10px',
    letterSpacing: '0.06em',
    padding: '5px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#0e0f16',
    color: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    minWidth: 0,
  }

  const scoreInputStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: '10px',
    letterSpacing: '0.06em',
    padding: '5px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#0e0f16',
    color: 'rgba(255,255,255,0.55)',
    outline: 'none',
    width: '52px',
    flexShrink: 0,
  }

  return (
    <div>
      {/* Sort + filter bar */}
      <div style={{ marginBottom: '16px' }}>
        {/* Sort pills row */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px' }}>
          {SORT_OPTIONS
            .filter(s => !s.requiresReveal || anyPickerRevealed)
            .map(s => (
              <SortButton key={s.key} label={s.label} active={sort === s.key} onClick={() => setSort(s.key)} />
            ))}
        </div>
        {/* Filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Season dropdown */}
          {seasonOptions.length > 0 && (
            <select
              value={filterSeason}
              onChange={e => setFilterSeason(e.target.value === 'all' ? 'all' : e.target.value)}
              style={selectStyle}
            >
              <option value="all">All seasons</option>
              {seasonOptions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {/* Score range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="Min"
              value={filterMinScore}
              onChange={e => setFilterMinScore(e.target.value)}
              style={scoreInputStyle}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>–</span>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="Max"
              value={filterMaxScore}
              onChange={e => setFilterMaxScore(e.target.value)}
              style={scoreInputStyle}
            />
          </div>
          {/* Clear filters if any active */}
          {(filterSeason !== 'all' || filterMinScore !== '' || filterMaxScore !== '') && (
            <button
              onClick={() => { setFilterSeason('all'); setFilterMinScore(''); setFilterMaxScore('') }}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '9px',
                letterSpacing: '0.08em',
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <PosterGrid movies={sorted} loading={loading} onSelect={onSelect} userById={userById} />
    </div>
  )
}

// ─── VaultTab ─────────────────────────────────────────────────────────────────

function VaultTab({ movies, loading, onSelect, userById }) {
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
          userById={userById}
        />
      )}
    </div>
  )
}

// ─── BySeasonTab ──────────────────────────────────────────────────────────────

function BySeasonTab({ movies, seasons, loading, onSelect, userById }) {
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
    const seasonMovies = movies
      .filter(m => m._seasonId === season.id)
      .sort((a, b) => (a._monthOrder !== b._monthOrder ? a._monthOrder - b._monthOrder : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
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

          <PosterGrid movies={sMovies} loading={false} onSelect={onSelect} userById={userById} />
        </div>
      ))}
    </div>
  )
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryFilmCard({ movie, userById, onSelect }) {
  const [hovered, setHovered] = useState(false)

  // Compute avg score from ratings if present, else fall back to historical_avg_score
  const computedScore = movie._avgScore ?? movie.historical_avg_score
  const scored = computedScore != null

  const pickerName = movie.picker_revealed && movie.picked_by_user_id
    ? (userById[movie.picked_by_user_id]?.name ?? null)
    : null
  const borderColor = pickerName ? pickerColor(pickerName) : undefined

  const badgeColor = scored
    ? (computedScore >= 8.5 ? '#fbbf24' : computedScore >= 7 ? '#86efac' : computedScore <= 4 ? '#f87171' : 'var(--accent-light, #fca5a5)')
    : null

  return (
    <div
      onClick={() => onSelect(movie)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Poster */}
      <div style={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        aspectRatio: '2/3',
        background: '#111218',
        boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
        transition: 'transform 0.18s ease',
        transform: hovered ? 'translateY(-3px) scale(1.02)' : 'none',
        ...(borderColor ? { borderLeft: `3px solid ${borderColor}` } : {}),
      }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w342${movie.poster_url}`}
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

        {/* Score badge */}
        {scored && (
          <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(0,0,0,0.75)',
              color: badgeColor,
              border: `1px solid ${badgeColor}`,
              display: 'block',
            }}>
              {Number(computedScore).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <p style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '0.9rem',
        letterSpacing: '0.04em',
        color: '#fff',
        margin: '6px 0 2px',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {movie.title}
      </p>

      {/* Picker name */}
      {pickerName && (
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '9px',
          color: 'rgba(255,255,255,0.3)',
          margin: 0,
          letterSpacing: '0.04em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {pickerName}
        </p>
      )}
    </div>
  )
}

function HistoryTab({ userById, onSelect }) {
  const [months, setMonths] = useState([])
  const [moviesByMonth, setMoviesByMonth] = useState({})
  const [ratingsByMovie, setRatingsByMovie] = useState({})
  const [selectedMonthId, setSelectedMonthId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: monthsData } = await supabase
        .from('months')
        .select('id, month_year, status')
        .eq('status', 'revealed')
        .order('month_year', { ascending: false })

      if (!monthsData || monthsData.length === 0) {
        setLoading(false)
        return
      }

      // Fetch all movies for revealed months in one query
      const monthIds = monthsData.map(m => m.id)
      const { data: moviesData } = await supabase
        .from('movies_safe')
        .select('id, month_id, title, poster_url, year_released, director, genre, runtime_minutes, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id')
        .in('month_id', monthIds)

      const movieIds = (moviesData ?? []).map(m => m.id)
      let ratingsData = []
      if (movieIds.length > 0) {
        const { data } = await supabase
          .from('ratings')
          .select('movie_id, score')
          .in('movie_id', movieIds)
        ratingsData = data ?? []
      }

      // Build ratings lookup: movie_id → scores[]
      const ratingsLookup = {}
      for (const r of ratingsData) {
        if (!ratingsLookup[r.movie_id]) ratingsLookup[r.movie_id] = []
        if (r.score != null) ratingsLookup[r.movie_id].push(Number(r.score))
      }

      // Build movies by month with computed avg
      const byMonth = {}
      for (const m of (moviesData ?? [])) {
        const scores = ratingsLookup[m.id] ?? []
        const avgScore = scores.length > 0
          ? scores.reduce((s, v) => s + v, 0) / scores.length
          : null
        const enriched = { ...m, _avgScore: avgScore }
        if (!byMonth[m.month_id]) byMonth[m.month_id] = []
        byMonth[m.month_id].push(enriched)
      }

      // Sort movies within each month by id ascending
      for (const mid of Object.keys(byMonth)) {
        byMonth[mid].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      }

      setMonths(monthsData)
      setMoviesByMonth(byMonth)
      setSelectedMonthId(monthsData[0]?.id ?? null)
      setLoading(false)
    }
    load()
  }, [])

  const selectedMovies = selectedMonthId ? (moviesByMonth[selectedMonthId] ?? []) : []

  return (
    <div>
      {/* Month pills */}
      {loading ? (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} style={{ height: '30px', width: '90px', borderRadius: '999px' }} />
          ))}
        </div>
      ) : months.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
          No revealed months yet.
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: '2px',
          }}>
            {months.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMonthId(m.id)}
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: selectedMonthId === m.id ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedMonthId === m.id ? 'var(--accent)' : 'transparent',
                  color: selectedMonthId === m.id ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {formatMonthYear(m.month_year)}
              </button>
            ))}
          </div>

          {/* Film grid for selected month */}
          {selectedMovies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
              No films for this month.
            </div>
          ) : (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '14px',
              }}>
                {selectedMovies.map(m => (
                  <HistoryFilmCard
                    key={m.id}
                    movie={m}
                    userById={userById}
                    onSelect={onSelect}
                  />
                ))}
              </div>
              <PickerLegend movies={selectedMovies} userById={userById} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Films page ──────────────────────────────────────────────────────────

const TABS = ['All Films', 'The Vault', 'By Season', 'History']

export default function Films() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('All Films')
  const [loading, setLoading] = useState(true)
  const [movies, setMovies] = useState([])
  const [seasons, setSeasons] = useState([])
  const [userById, setUserById] = useState({})
  const [selectedMovie, setSelectedMovie] = useState(null)

  useEffect(() => {
    async function load() {
      const [
        { data: moviesData },
        { data: monthsData },
        { data: seasonsData },
        { data: usersData },
      ] = await Promise.all([
        supabase.from('movies_safe').select(
          'id, month_id, title, tmdb_id, poster_url, genre, director, runtime_minutes, year_released, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id'
        ),
        supabase.from('months').select('id, month_year, season_id, status').order('month_year', { ascending: true }),
        supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
        supabase.from('users').select('id, name'),
      ])

      // Build a lookup: month_id → { order, season_id, month_year }
      const monthLookup = {}
      ;(monthsData ?? []).forEach((m, idx) => {
        monthLookup[m.id] = { order: idx, seasonId: m.season_id, monthYear: m.month_year }
      })

      // Season lookup by id
      const seasonById = {}
      ;(seasonsData ?? []).forEach(s => { seasonById[s.id] = s })

      const enriched = (moviesData ?? []).map(m => {
        const monthInfo = monthLookup[m.month_id] ?? {}
        const season = seasonById[monthInfo.seasonId] ?? null
        // Format a human-readable month label e.g. "Feb 2026 · Season 1"
        let monthLabel = null
        if (monthInfo.monthYear) {
          const d = new Date(monthInfo.monthYear + '-01')
          monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          if (season) monthLabel += ` · ${season.name}`
        }
        return {
          ...m,
          _monthOrder: monthInfo.order ?? 0,
          _seasonId: monthInfo.seasonId ?? null,
          _monthLabel: monthLabel,
        }
      })

      // Build user lookup by id
      const userLookup = {}
      ;(usersData ?? []).forEach(u => { userLookup[u.id] = u })

      setMovies(enriched)
      setSeasons(seasonsData ?? [])
      setUserById(userLookup)
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
            <AllFilmsTab movies={movies} loading={loading} onSelect={handleSelect} userById={userById} seasons={seasons} />
          )}
          {activeTab === 'The Vault' && (
            <VaultTab movies={movies} loading={loading} onSelect={handleSelect} userById={userById} />
          )}
          {activeTab === 'By Season' && (
            <BySeasonTab movies={movies} seasons={seasons} loading={loading} onSelect={handleSelect} userById={userById} />
          )}
          {activeTab === 'History' && (
            <HistoryTab userById={userById} onSelect={handleSelect} />
          )}
        </div>

      </div>

      {/* Film detail overlay */}
      <FilmDetailOverlay movie={selectedMovie} onClose={handleClose} />

      <style>{`
        @media (min-width: 480px) { .films-grid { grid-template-columns: repeat(4, 1fr) !important; } }
        @media (min-width: 768px) { .films-grid { grid-template-columns: repeat(5, 1fr) !important; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
