import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import ScoreModal from '../components/ScoreModal'
import CommentThread from '../components/CommentThread'
import GuessThePicker from '../components/GuessThePicker'
import VetoControl from '../components/VetoControl'
import ScoreChangeRequestButton from '../components/ScoreChangeRequest'
import AwardsBadges from '../components/AwardsBadges'
import { getAwardsForFilm, fetchAwardsForFilm } from '../lib/awards'
import { memberColor, MEMBER_COLORS } from '../lib/colors'

// ─── helpers ──────────────────────────────────────────────────────────────────

// Re-export the shared member-color map so existing imports keep working.
export { MEMBER_COLORS }

export function pickerColor(pickerName) {
  return memberColor(pickerName)
}

export function sortMonthsDescending(months) {
  return [...months].sort((a, b) => {
    if (a.month_year < b.month_year) return 1
    if (a.month_year > b.month_year) return -1
    return 0
  })
}

function formatMonthYear(monthYear) {
  // Parse at local noon, not UTC midnight — a bare 'YYYY-MM-01' is parsed as UTC,
  // which in ET/PT rolls back to the previous day → previous month label.
  const d = new Date(monthYear + '-01T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// The group average to DISPLAY for a film on the Films page (All Films / By Season).
// Imported historical months carry an authoritative `historical_avg_score`. Real
// (non-imported) revealed months — like May 2026 — leave it NULL, so fall back to the
// average computed from the film's actual ratings (`_avgScore`, already test-filtered
// and loaded in the page query). Never surface an average before the scores reveal.
function displayAvg(movie) {
  if (movie.historical_avg_score != null) return Number(movie.historical_avg_score)
  if (movie.scores_revealed && movie._avgScore != null) return Number(movie._avgScore)
  return null
}

function isVault(movie) {
  const avg = displayAvg(movie)
  return avg != null && avg >= 8.5
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
      style={{ background: 'rgba(var(--fg-rgb), 0.05)', ...style }}
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
        border: active ? 'none' : '1px solid rgba(var(--fg-rgb), 0.1)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--text-strong)' : 'rgba(var(--fg-rgb), 0.4)',
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
        border: active ? '1px solid var(--accent)' : '1px solid rgba(var(--fg-rgb), 0.1)',
        background: active ? 'rgba(var(--accent-rgb,185,28,28),0.15)' : 'transparent',
        color: active ? 'var(--accent-light, #fca5a5)' : 'rgba(var(--fg-rgb), 0.35)',
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

function PosterCard({ movie, vault = false, onClick, pickerBorderColor, showStddev = false, hideScores = false }) {
  const score = displayAvg(movie)
  const [hovered, setHovered] = useState(false)
  const scored = score != null
  // In divisive/unanimous context, surface the film's score spread (σ) on the card.
  // Suppressed when the hide-scores toggle is on so posters/titles aren't obscured.
  const stddev = showStddev && !hideScores ? filmStddev(movie) : null

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
          background: 'var(--surface)',
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
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: 'rgba(var(--fg-rgb), 0.12)' }}>
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
          <p style={{ color: 'var(--text-strong)', fontSize: '11px', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, lineHeight: 1.3, margin: 0 }}>
            {movie.title}
            {movie.year_released ? (
              <span style={{ color: 'rgba(var(--fg-rgb), 0.5)', fontWeight: 400 }}> {movie.year_released}</span>
            ) : null}
          </p>
        </div>

        {/* Score badge — hidden when the hide-scores toggle is on */}
        {!hideScores && (
          <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
            {scored ? (
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '999px',
                background: 'var(--accent)',
                color: 'var(--text-strong)',
                display: 'block',
              }}>
                {Number(score).toFixed(2)}
              </span>
            ) : (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '999px',
                background: 'rgba(0,0,0,0.65)',
                color: 'rgba(var(--fg-rgb), 0.35)',
                border: '1px solid rgba(var(--fg-rgb), 0.1)',
                display: 'block',
                fontFamily: "'DM Mono', monospace",
              }}>?</span>
            )}
          </div>
        )}

        {/* Stddev (σ) badge — shown only in the divisive/unanimous sort context */}
        {stddev != null && (
          <div style={{ position: 'absolute', bottom: '6px', left: '6px' }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(0,0,0,0.65)',
              color: 'rgba(var(--fg-rgb), 0.55)',
              border: '1px solid rgba(var(--fg-rgb), 0.12)',
              display: 'block',
            }}>
              σ {stddev.toFixed(2)}
            </span>
          </div>
        )}

        {/* Vault star badge — hidden when the hide-scores toggle is on */}
        {vault && !hideScores && (
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

      {/* Title label underneath the poster — always legible, never covered by the
          score overlay. Fixed two-line height so every card stays the same height
          and the grid rows stay aligned. */}
      <p style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '11px',
        fontWeight: 500,
        lineHeight: 1.25,
        color: 'var(--text-muted)',
        margin: '6px 0 0',
        height: '28px',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        wordBreak: 'break-word',
      }}>
        {movie.title}
      </p>
    </div>
  )
}

// ─── PickerLegend ─────────────────────────────────────────────────────────────

function PickerLegend({ movies, userById }) {
  const { openMember } = useMemberOverlay()
  // Collect unique pickers that are revealed
  const seen = new Set()
  const entries = []
  for (const m of movies) {
    if (m.picker_revealed && m.picked_by_user_id) {
      const id = m.picked_by_user_id
      const name = userById[id]?.name
      if (name && !seen.has(id)) {
        seen.add(id)
        const color = pickerColor(name)
        if (color) entries.push({ id, name, color })
      }
    }
  }
  if (entries.length === 0) return null

  return (
    <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(var(--fg-rgb), 0.05)' }}>
      <p style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '10px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(var(--fg-rgb), 0.2)',
        margin: '0 0 10px',
      }}>
        Club Members
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
        {entries.map(({ id, name, color }) => (
          <button
            key={id}
            onClick={() => openMember(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
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
              color: 'rgba(var(--fg-rgb), 0.4)',
              letterSpacing: '0.04em',
            }}>
              {name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── PosterGrid ───────────────────────────────────────────────────────────────

function PosterGrid({ movies, vault = false, loading, skeletonCount = 15, onSelect, userById = {}, showStddev = false, hideScores = false }) {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '10px',
        }}
        className="films-grid"
      >
        {loading
          ? [...Array(skeletonCount)].map((_, i) => (
              <div key={i}>
                <Skeleton style={{ aspectRatio: '2/3', borderRadius: '8px' }} />
                <Skeleton style={{ height: '12px', width: '80%', borderRadius: '4px', marginTop: '8px' }} />
              </div>
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
                  showStddev={showStddev}
                  hideScores={hideScores}
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

function MemberScoreRow({ rating, user, onNameClick }) {
  const name = user?.name ?? 'Unknown'
  const score = rating?.score
  const excitement = rating?.pre_watch_excitement
  const clickable = typeof onNameClick === 'function' && user?.id
  const handleClick = clickable ? () => onNameClick(user.id) : undefined

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 0',
      borderBottom: '1px solid rgba(var(--fg-rgb), 0.04)',
    }}>
      {/* Avatar */}
      <div
        onClick={handleClick}
        style={{
          flexShrink: 0,
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: avatarColor(name),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: clickable ? 'pointer' : 'default',
        }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>
          {initials(name)}
        </span>
      </div>

      {/* Name */}
      <span
        onClick={handleClick}
        style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: 'rgba(var(--fg-rgb), 0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: clickable ? 'pointer' : 'default' }}>
        {name}
      </span>

      {/* Pre-watch excitement */}
      {excitement != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px', marginRight: '4px' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(var(--fg-rgb), 0.25)', letterSpacing: '0.06em' }}>
            HYPED
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(var(--fg-rgb), 0.35)' }}>
            {Number(excitement).toFixed(2)}
          </span>
        </div>
      )}

      {/* Final score */}
      <div style={{
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: '8px',
        background: score != null ? 'rgba(var(--fg-rgb), 0.06)' : 'transparent',
        border: score != null ? '1px solid rgba(var(--fg-rgb), 0.08)' : 'none',
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
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '13px', color: 'rgba(var(--fg-rgb), 0.2)' }}>—</span>
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
      color: 'rgba(var(--fg-rgb), 0.25)',
      margin: '0 0 10px',
    }}>
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: 'rgba(var(--fg-rgb), 0.06)', margin: '24px 0' }} />
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
          color: 'rgba(var(--fg-rgb), 0.6)',
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

// Resolve a clickable "where to watch" URL for a provider.
//  - Prefer the TMDB/JustWatch deep link for the film (passed as `watchLink`).
//  - Otherwise fall back to a sensible search URL for the provider + film title.
function providerWatchUrl(provider, watchLink, title) {
  if (watchLink) return watchLink
  const name = (provider?.provider_name ?? '').toLowerCase()
  const t = title ?? ''
  const q = encodeURIComponent(t)
  // Known platforms get a direct in-app search; everything else gets a Google
  // "<provider> <title>" search so the link always lands somewhere useful.
  if (name.includes('netflix')) return `https://www.netflix.com/search?q=${q}`
  if (name.includes('disney')) return `https://www.disneyplus.com/search?q=${q}`
  if (name.includes('hulu')) return `https://www.hulu.com/search?q=${q}`
  if (name.includes('max') || name.includes('hbo')) return `https://play.max.com/search?q=${q}`
  if (name.includes('paramount')) return `https://www.paramountplus.com/search/?query=${q}`
  if (name.includes('peacock')) return `https://www.peacocktv.com/search?q=${q}`
  if (name.includes('apple')) return `https://tv.apple.com/search?term=${q}`
  if (name.includes('prime') || name.includes('amazon')) return `https://www.amazon.com/s?k=${q}&i=instant-video`
  return `https://www.google.com/search?q=${encodeURIComponent(`${provider?.provider_name ?? ''} ${t}`.trim())}`
}

// Hoisted out of StreamingSection so it isn't recreated on every render.
function ProviderRow({ label, items, watchLink, title }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(var(--fg-rgb), 0.2)', margin: '0 0 8px', textTransform: 'uppercase' }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.map(p => (
          <a
            key={p.provider_id ?? p.provider_name}
            href={providerWatchUrl(p, watchLink, title)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Watch on ${p.provider_name}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
          >
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
                color: 'rgba(var(--fg-rgb), 0.55)',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(var(--fg-rgb), 0.06)',
                border: '1px solid rgba(var(--fg-rgb), 0.08)',
              }}>
                {p.provider_name}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

function StreamingSection({ providers, title }) {
  // providers may be stored in three shapes:
  //  1. full TMDB response: { results: { US: {flatrate,rent,buy} } }
  //  2. region-keyed:       { US: {flatrate,rent,buy} }
  //  3. flat US object:     { flatrate, rent, buy }  ← how fetchDetails caches it
  // Accept all three so cached providers actually render.
  const us =
    providers?.results?.US ??
    providers?.US ??
    (providers && (('flatrate' in providers) || ('rent' in providers) || ('buy' in providers)) ? providers : null)

  const flatrate = us?.flatrate ?? []
  const rent = us?.rent ?? []
  const buy = us?.buy ?? []
  // TMDB exposes a JustWatch deep link for the film at the region level.
  const watchLink = us?.link ?? null

  const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0

  if (!providers || !hasAny) {
    return (
      <div>
        <SectionLabel>Where to Watch</SectionLabel>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(var(--fg-rgb), 0.25)', margin: 0 }}>
          No streaming info available
        </p>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>Where to Watch</SectionLabel>
      <ProviderRow label="Stream" items={flatrate} watchLink={watchLink} title={title} />
      <ProviderRow label="Rent" items={rent} watchLink={watchLink} title={title} />
      <ProviderRow label="Buy" items={buy} watchLink={watchLink} title={title} />
    </div>
  )
}

// ─── Prediction helpers (exported for tests) ─────────────────────────────────

export function predictionDelta(predicted, actual) {
  if (predicted == null || actual == null) return null
  return Math.abs(Number(predicted) - Number(actual))
}

export function deltaColor(delta) {
  if (delta == null) return 'rgba(var(--fg-rgb), 0.4)'
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

function PredictionsSection({ movie, profile, users, ratings, predictions, isPicker, onSaved }) {
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

    // Predictions are picker-only, so every row here belongs to this film's picker.
    // Show them to everyone after the scores reveal (the predictor stays anonymous
    // until the end-of-month picker reveal).
    if (!predictions.length) return null

    const acc = avgAccuracy(predictions, ratings)
    const accLabel = isPicker ? 'Your avg accuracy' : "Picker's avg accuracy"

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
          <SectionLabel>{isPicker ? 'Your Predictions' : "Picker's Predictions"}</SectionLabel>
          {acc != null && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: deltaColor(acc),
              letterSpacing: '0.06em',
            }}>
              {accLabel}: ±{acc.toFixed(2)}
            </span>
          )}
        </div>
        {predictions.map(p => {
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
                borderBottom: '1px solid rgba(var(--fg-rgb), 0.04)',
              }}
            >
              <span style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: 'rgba(var(--fg-rgb), 0.7)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {targetUser?.name ?? 'Unknown'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'rgba(var(--fg-rgb), 0.3)' }}>
                {p.predicted_score != null ? Number(p.predicted_score).toFixed(2) : '—'}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(var(--fg-rgb), 0.2)', margin: '0 2px' }}>→</span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '13px',
                fontWeight: 600,
                color: actual != null ? scoreColor(Number(actual)) : 'rgba(var(--fg-rgb), 0.2)',
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

  // Predictions are picker-only: only the film's picker predicts the other members'
  // scores for their own pick. Non-pickers just see a note until the reveal.
  if (!isPicker) {
    return (
      <div>
        <SectionLabel>Predictions</SectionLabel>
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '11px',
          color: 'rgba(var(--fg-rgb), 0.25)',
          letterSpacing: '0.06em',
          margin: 0,
          lineHeight: 1.6,
        }}>
          The picker is predicting everyone's scores for this film — revealed when scores are.
        </p>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>Predictions</SectionLabel>
      <p style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        color: 'rgba(var(--fg-rgb), 0.3)',
        margin: '0 0 14px',
        lineHeight: 1.5,
      }}>
        Predict each member's score for your pick. Revealed when scores are shown.
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
              borderBottom: '1px solid rgba(var(--fg-rgb), 0.04)',
              opacity: isLocked ? 0.55 : 1,
            }}
          >
            <span style={{
              flex: 1,
              minWidth: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: 'rgba(var(--fg-rgb), 0.7)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {u.name}
              {isLocked && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(var(--fg-rgb), 0.3)', marginLeft: '6px', letterSpacing: '0.08em' }}>
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
                border: isLocked ? '1px solid rgba(var(--fg-rgb), 0.06)' : '1px solid rgba(var(--fg-rgb), 0.1)',
                background: isLocked ? 'rgba(var(--fg-rgb), 0.02)' : 'rgba(var(--fg-rgb), 0.04)',
                color: isLocked ? 'rgba(var(--fg-rgb), 0.3)' : 'var(--text-strong)',
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
          background: saving ? 'rgba(var(--fg-rgb), 0.06)' : 'var(--accent)',
          color: saving ? 'var(--text-faint)' : 'var(--text-strong)',
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
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(true)
  const [ratings, setRatings] = useState([])
  const [users, setUsers] = useState([])
  const [fullMovie, setFullMovie] = useState(null)
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [isPicker, setIsPicker] = useState(false) // is the current user the picker of THIS film?
  const [awardData, setAwardData] = useState(null) // { movies, ratings, users, months, seasons }
  const [filmAwardsState, setFilmAwardsState] = useState(null) // null = not yet loaded
  const scrollRef = useRef(null)

  // Determine whether the viewer picked this film. Querying with the picked_by_user_id
  // filter only ever returns the viewer's own pick, so it never leaks other pickers.
  useEffect(() => {
    if (!movie || !profile) { setIsPicker(false); return }
    let cancelled = false
    supabase
      .from('movies')
      .select('id')
      .eq('id', movie.id)
      .eq('picked_by_user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsPicker(!!data) })
    return () => { cancelled = true }
  }, [movie, profile])

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
      { data: predictionsData },
    ] = await Promise.all([
      supabase
        .from('movies_safe')
        .select('*')
        .eq('id', movieId)
        .single(),
      supabase
        .from('ratings')
        .select('id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
        .eq('movie_id', movieId),
      supabase
        .from('users')
        .select('id, name, email, role, joined_at'),
      supabase
        .from('score_predictions')
        .select('id, predicting_user_id, target_user_id, predicted_score')
        .eq('movie_id', movieId),
    ])

    let resolvedMovie = movieData ?? movieFallback

    // Resolve the film's calendar month (YYYY-MM) so the recommend stat can be
    // computed out of the members who were in the club that month (pre-Zack 4,
    // post-Zack 5, test excluded).
    if (resolvedMovie && resolvedMovie.month_id && resolvedMovie._monthYear == null) {
      const { data: monthRow } = await supabase
        .from('months')
        .select('month_year')
        .eq('id', resolvedMovie.month_id)
        .maybeSingle()
      if (monthRow?.month_year) resolvedMovie = { ...resolvedMovie, _monthYear: monthRow.month_year }
    }

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
      } catch {
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
        } catch {
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

    // Exclude the test account from every list shown in the overlay (scores,
    // prediction targets). Spec: filter by email in all queries/displays.
    const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
    const testId = (usersData ?? []).find(u => u.email === TEST_EMAIL)?.id ?? null

    setFullMovie(resolvedMovie)
    setRatings((ratingsData ?? []).filter(r => r.user_id !== testId))
    setUsers((usersData ?? []).filter(u => u.email !== TEST_EMAIL))
    setPredictions((predictionsData ?? []).filter(p => p.predicting_user_id !== testId && p.target_user_id !== testId))
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    if (!movie) return

    setDetailLoading(true)
    setRatings([])
    setUsers([])
    setPredictions([])
    setFullMovie(null)
    setShowScoreModal(false)
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

  const { openMember } = useMemberOverlay()
  // Open a member's profile overlay, closing the film overlay first.
  const goToProfile = useCallback((userId) => {
    if (!userId) return
    setVisible(false)
    setTimeout(() => { onClose(); openMember(userId) }, 240)
  }, [openMember, onClose])

  // Navigate to a tab on the Films page (genre filter / vault), closing the overlay.
  const goToFilms = useCallback((params) => {
    setVisible(false)
    const qs = params ? `?${new URLSearchParams(params).toString()}` : ''
    setTimeout(() => { onClose(); navigate(`/films${qs}`) }, 240)
  }, [navigate, onClose])

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
  // A rating row can exist with ONLY a pre-watch excitement value and score=NULL.
  // The backfill CTA must gate on the FINAL SCORE, not on row existence, so an
  // excitement-only row never traps the viewer out of submitting their score.
  const myHasFinalScore = myRating?.score != null
  const myHasExcitementOnly = !myHasFinalScore && myRating?.pre_watch_excitement != null

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
  const computedAvg = scoredRatings.length
    ? scoredRatings.reduce((s, r) => s + Number(r.score), 0) / scoredRatings.length
    : null
  // For revealed historical films, prefer the authoritative imported average (from the
  // Movie Club Google Sheet, stored in historical_avg_score) — the individual rows are an
  // incomplete backfill. Only used post-reveal so it never leaks before the deadline; live
  // films (no historical avg) fall back to the computed average of visible scores.
  const groupAvg = (m.scores_revealed && m.historical_avg_score != null)
    ? Number(m.historical_avg_score)
    : computedAvg

  // Recommend count — "X/Y would recommend" out of the members who were in the
  // club that month (pre-Zack 4, post-Zack 5, test excluded), not out of however
  // many filled the recommend field. The denominator is the expected member count
  // for the film's calendar month, derived from each member's joined_at.
  // `users` is already test-filtered in fetchDetails.
  const recommendYes = ratings.filter(r => r.recommend_outside_club === true).length
  const hasRecommendData = ratings.some(r => r.recommend_outside_club != null)
  const filmMonthEnd = (() => {
    if (!m._monthYear) return null
    const [y, mo] = m._monthYear.split('-').map(Number)
    // Day 0 of the next month == last day of the target month
    const lastDay = new Date(y, mo, 0).getDate()
    return `${m._monthYear}-${String(lastDay).padStart(2, '0')}`
  })()
  const expectedMemberCount = filmMonthEnd
    ? users.filter(u => u.joined_at != null && u.joined_at <= filmMonthEnd).length
    : users.length
  const recommendTotal = expectedMemberCount

  // Month label
  const monthLabel = m._monthLabel ?? null

  // Streaming providers
  const streamingProviders = m.streaming_providers ?? null

  // Picker name + id (for member links)
  let pickerName = null
  const pickerUserId = (m.picker_revealed && m.picked_by_user_id) ? m.picked_by_user_id : null
  if (pickerUserId) {
    const pickerUser = users.find(u => u.id === pickerUserId)
    pickerName = pickerUser?.name ?? null
  }

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
          background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
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
            background: 'rgba(var(--fg-rgb), 0.08)',
            border: '1px solid rgba(var(--fg-rgb), 0.12)',
            color: 'rgba(var(--fg-rgb), 0.7)',
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
              background: 'var(--surface-2)',
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
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', color: 'rgba(var(--fg-rgb), 0.15)' }}>
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
                color: 'var(--text-strong)',
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
                color: 'rgba(var(--fg-rgb), 0.35)',
                margin: '0 0 10px',
                lineHeight: 1.4,
              }}>
                {[m.year_released, runtime].filter(Boolean).join(' · ')}
                {monthLabel ? <><br /><span style={{ color: 'rgba(var(--fg-rgb), 0.2)' }}>{monthLabel}</span></> : null}
              </p>

              {/* Director */}
              {m.director && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: 'rgba(var(--fg-rgb), 0.55)',
                  margin: '0 0 10px',
                }}>
                  dir. <span style={{ color: 'rgba(var(--fg-rgb), 0.8)' }}>{m.director}</span>
                </p>
              )}

              {/* Genre tags — clicking jumps to All Films filtered to that genre */}
              {genres.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {genres.map(g => (
                    <button
                      key={g}
                      onClick={() => goToFilms({ tab: 'All Films', genre: g })}
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: 'rgba(var(--fg-rgb), 0.06)',
                        color: 'rgba(var(--fg-rgb), 0.5)',
                        border: '1px solid rgba(var(--fg-rgb), 0.08)',
                        cursor: 'pointer',
                      }}>
                      {g}
                    </button>
                  ))}
                </div>
              )}

              {/* Vault badge — links to the Vault tab */}
              {vault && (
                <button
                  onClick={() => goToFilms({ tab: 'The Vault' })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', cursor: 'pointer' }}>
                  <span style={{ fontSize: '11px' }}>★</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: '#fbbf24' }}>THE VAULT</span>
                </button>
              )}
            </div>
          </div>

          {/* ── SUBMIT YOUR SCORE (backfill CTA) ──
              Only after the detail load confirms there's genuinely no score for the
              viewer — never while the overlay is still loading (ratings empty mid-fetch). */}
          {!detailLoading && m.scores_revealed && !myHasFinalScore && (
            <>
              <Divider />
              <div style={{
                background: 'rgba(var(--fg-rgb), 0.025)',
                border: '1px solid rgba(var(--fg-rgb), 0.07)',
                borderRadius: '14px',
                padding: '16px',
              }}>
                <p style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(var(--fg-rgb), 0.25)',
                  margin: '0 0 8px',
                }}>
                  Your Score
                </p>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: 'var(--text-dim)',
                  margin: '0 0 12px',
                }}>
                  {myHasExcitementOnly
                    ? 'You set your excitement — submit your final score.'
                    : "You haven't scored this film yet."}
                </p>
                <button
                  onClick={() => setShowScoreModal(true)}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--text-strong)',
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: m.scores_revealed && hasRecommendData ? '8px' : '16px' }}>
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
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(var(--fg-rgb), 0.2)' }}>/10</span>
                  {!(m.scores_revealed && m.historical_avg_score != null) && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(var(--fg-rgb), 0.2)', marginLeft: '4px' }}>
                      avg ({scoredRatings.length})
                    </span>
                  )}
                </div>
              )}
            </div>
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
                    onNameClick={goToProfile}
                  />
                )}

                {scoresMessage ? (
                  <div style={{
                    padding: '18px',
                    borderRadius: '12px',
                    background: 'rgba(var(--fg-rgb), 0.03)',
                    border: '1px solid rgba(var(--fg-rgb), 0.06)',
                    textAlign: 'center',
                    marginTop: myRating ? '12px' : 0,
                  }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(var(--fg-rgb), 0.25)', letterSpacing: '0.08em', margin: 0 }}>
                      {scoresMessage}
                    </p>
                  </div>
                ) : (
                  <>
                    {visibleRatings.length === 0 ? (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(var(--fg-rgb), 0.25)', margin: 0 }}>
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
                            onNameClick={goToProfile}
                          />
                        ))
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── REQUEST SCORE CHANGE (member's own locked score) ── */}
          {profile && myRating?.score != null && (
            <div style={{ marginTop: '14px' }}>
              <ScoreChangeRequestButton
                rating={{ id: myRating.id, score: myRating.score, movie_id: m.id }}
                currentUserId={profile.id}
                movieTitle={m.title}
              />
            </div>
          )}

          {/* ── AWARDS ── */}
          {filmAwards.length > 0 && (
            <>
              <Divider />
              <AwardsBadges
                awards={filmAwards}
                onAwardClick={(award) => {
                  const scope = award.scope ?? ''
                  const key = award.award_key ?? award.key ?? ''
                  const ref = award.period_ref ?? award.periodRef ?? ''
                  navigate(`/awards?scope=${scope}&key=${key}&ref=${encodeURIComponent(ref || '')}`)
                }}
              />
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
            isPicker={isPicker}
            onSaved={() => fetchDetails(movie.id, movie)}
          />

          {/* ── PICKER ── */}
          <Divider />
          <div>
            <SectionLabel>Picked By</SectionLabel>
            {m.picker_revealed ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {pickerName && (
                  <div
                    onClick={pickerUserId ? () => goToProfile(pickerUserId) : undefined}
                    style={{
                      flexShrink: 0,
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: avatarColor(pickerName),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: pickerUserId ? 'pointer' : 'default',
                    }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      {initials(pickerName)}
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    onClick={pickerUserId ? () => goToProfile(pickerUserId) : undefined}
                    style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 6px', cursor: pickerUserId ? 'pointer' : 'default', display: 'inline-block' }}>
                    {pickerName ?? 'Unknown'}
                  </p>
                  {m.pick_justification && (
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '13px',
                      lineHeight: 1.65,
                      color: 'rgba(var(--fg-rgb), 0.5)',
                      margin: 0,
                      fontStyle: 'italic',
                    }}>
                      "{m.pick_justification}"
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(var(--fg-rgb), 0.25)', letterSpacing: '0.08em', margin: 0 }}>
                Picker revealed at end of month
              </p>
            )}
          </div>

          {/* ── GUESS THE PICKER (active guessing window; you can't guess your own pick) ── */}
          {profile && !isPicker && !m.picker_revealed && (
            <>
              <Divider />
              <SectionLabel>Guess the Picker</SectionLabel>
              <div style={{ marginTop: '4px' }}>
                <GuessThePicker
                  movieId={m.id}
                  currentUserId={profile.id}
                  users={users}
                  pickerRevealed={m.picker_revealed}
                  pickedByUserId={m.picked_by_user_id ?? null}
                />
              </div>
            </>
          )}

          {/* ── VETO (current pick, before scores are in) ── */}
          {profile && !m.scores_revealed && !m.picker_revealed && (
            <>
              <Divider />
              <SectionLabel>Veto</SectionLabel>
              <div style={{ marginTop: '4px' }}>
                <VetoControl
                  movieId={m.id}
                  currentUserId={profile.id}
                  totalActiveMembers={users.length}
                  threshold={3}
                />
              </div>
            </>
          )}

          {/* ── STREAMING ── */}
          <Divider />
          <StreamingSection providers={streamingProviders} title={m.title} />

          {/* ── PLOT ── */}
          {m.plot_summary && (
            <>
              <Divider />
              <PlotSummary text={m.plot_summary} />
            </>
          )}

          {/* ── RECOMMEND ── */}
          {m.scores_revealed && hasRecommendData && recommendTotal > 0 && (
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
                    background: 'rgba(var(--fg-rgb), 0.08)',
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
                    color: 'rgba(var(--fg-rgb), 0.55)',
                    flexShrink: 0,
                  }}>
                    {recommendYes}/{recommendTotal} would recommend
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── DISCUSSION (threaded comments + reactions + @mentions) ──
              The CommentThread renders its own "Discussion · N" header, so no
              SectionLabel here (avoids a duplicate "Discussion" label). */}
          {profile && (
            <>
              <Divider />
              <div style={{ marginTop: '4px' }}>
                <CommentThread
                  movieId={m.id}
                  currentUserId={profile.id}
                  isAdmin={isAdmin}
                  users={users}
                  canParticipate={myRating?.score != null}
                />
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

// ─── Sorting (shared across AllFilms + BySeason) ──────────────────────────────

// Within a month, DB insertion order (id ASC) is WATCH order (earliest-watched
// first). "Most recent" must surface the LATEST-watched film first, so months go
// descending AND films within a month are reversed (id DESC). "Least recent" is
// the exact inverse: months ascending, films id ASC.
function idCompareAsc(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// Population standard deviation of a film's revealed scores — higher = more divisive.
function filmStddev(movie) {
  const scores = Array.isArray(movie._scores) ? movie._scores.filter(s => s != null) : []
  if (scores.length < 2) return null
  const mean = scores.reduce((s, v) => s + Number(v), 0) / scores.length
  const variance = scores.reduce((s, v) => s + (Number(v) - mean) ** 2, 0) / scores.length
  return Math.sqrt(variance)
}

export const SORT_OPTIONS = [
  { key: 'recent', label: 'Most Recent' },
  { key: 'oldest', label: 'Least Recent' },
  { key: 'high', label: 'Highest Rated' },
  { key: 'low', label: 'Lowest Rated' },
  { key: 'divisive', label: 'Most Divisive' },
  { key: 'unanimous', label: 'Least Divisive' },
  { key: 'picker', label: 'By Member', requiresReveal: true },
]

// Sort a list of enriched movies by a SORT_OPTIONS key. Always returns a new array.
export function sortMovies(movies, sort) {
  const list = [...movies]
  return list.sort((a, b) => {
    if (sort === 'high') return (displayAvg(b) ?? -1) - (displayAvg(a) ?? -1)
    if (sort === 'low') return (displayAvg(a) ?? 999) - (displayAvg(b) ?? 999)
    if (sort === 'divisive' || sort === 'unanimous') {
      const sa = filmStddev(a)
      const sb = filmStddev(b)
      // Films without enough data sink to the bottom of either ordering.
      if (sa == null && sb == null) {
        if ((b._monthOrder ?? 0) !== (a._monthOrder ?? 0)) return (b._monthOrder ?? 0) - (a._monthOrder ?? 0)
        return -idCompareAsc(a, b)
      }
      if (sa == null) return 1
      if (sb == null) return -1
      return sort === 'divisive' ? sb - sa : sa - sb
    }
    if (sort === 'picker') {
      // Group by picker; nulls last
      const pa = a.picker_revealed ? (a.picked_by_user_id ?? '') : ''
      const pb = b.picker_revealed ? (b.picked_by_user_id ?? '') : ''
      if (pa < pb) return -1
      if (pa > pb) return 1
      return (a._monthOrder ?? 0) - (b._monthOrder ?? 0)
    }
    if (sort === 'oldest') {
      // Least recent: months ascending, watch order (id ASC) within a month.
      if ((a._monthOrder ?? 0) !== (b._monthOrder ?? 0)) return (a._monthOrder ?? 0) - (b._monthOrder ?? 0)
      return idCompareAsc(a, b)
    }
    // recent: months descending, REVERSED watch order (id DESC) within a month so
    // the latest-watched film in a month sits on top.
    if ((b._monthOrder ?? 0) !== (a._monthOrder ?? 0)) return (b._monthOrder ?? 0) - (a._monthOrder ?? 0)
    return -idCompareAsc(a, b)
  })
}

// ─── AllFilms tab ─────────────────────────────────────────────────────────────

function AllFilmsTab({ movies, loading, onSelect, userById, seasons, initialGenre = '', hideScores = false }) {
  const [sort, setSort] = useState('recent')
  const [filterSeason, setFilterSeason] = useState('all')
  const [filterMinScore, setFilterMinScore] = useState('')
  const [filterMaxScore, setFilterMaxScore] = useState('')
  const [filterGenre, setFilterGenre] = useState(initialGenre || 'all')

  // Apply an incoming genre filter (e.g. from clicking a genre tag in the overlay).
  useEffect(() => {
    if (initialGenre) setFilterGenre(initialGenre)
  }, [initialGenre])

  // Determine if any picker is revealed (to show "By Picker" option)
  const anyPickerRevealed = movies.some(m => m.picker_revealed)

  // Build season options from seasons prop
  const seasonOptions = seasons.map(s => ({ id: s.id, name: s.name }))

  // Build the distinct genre list from the films present.
  const genreOptions = (() => {
    const set = new Set()
    for (const m of movies) {
      if (Array.isArray(m.genre)) for (const g of m.genre) if (g) set.add(g)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  })()

  // Apply filters first
  let filtered = [...movies]
  if (filterSeason !== 'all') {
    filtered = filtered.filter(m => m._seasonId === filterSeason)
  }
  if (filterGenre !== 'all') {
    filtered = filtered.filter(m => Array.isArray(m.genre) && m.genre.includes(filterGenre))
  }
  const minScore = filterMinScore !== '' ? parseFloat(filterMinScore) : null
  const maxScore = filterMaxScore !== '' ? parseFloat(filterMaxScore) : null
  if (minScore != null && !isNaN(minScore)) {
    filtered = filtered.filter(m => { const a = displayAvg(m); return a != null && a >= minScore })
  }
  if (maxScore != null && !isNaN(maxScore)) {
    filtered = filtered.filter(m => { const a = displayAvg(m); return a != null && a <= maxScore })
  }

  // Apply sort (shared recency rule)
  const sorted = sortMovies(filtered, sort)

  const selectStyle = {
    fontFamily: "'DM Mono', monospace",
    fontSize: '10px',
    letterSpacing: '0.06em',
    padding: '5px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(var(--fg-rgb), 0.1)',
    background: 'var(--surface-3)',
    color: 'rgba(var(--fg-rgb), 0.55)',
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
    border: '1px solid rgba(var(--fg-rgb), 0.1)',
    background: 'var(--surface-3)',
    color: 'rgba(var(--fg-rgb), 0.55)',
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
          {/* Genre dropdown */}
          {genreOptions.length > 0 && (
            <select
              value={filterGenre}
              onChange={e => setFilterGenre(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All genres</option>
              {genreOptions.map(g => (
                <option key={g} value={g}>{g}</option>
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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'rgba(var(--fg-rgb), 0.2)' }}>–</span>
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
          {(filterSeason !== 'all' || filterGenre !== 'all' || filterMinScore !== '' || filterMaxScore !== '') && (
            <button
              onClick={() => { setFilterSeason('all'); setFilterGenre('all'); setFilterMinScore(''); setFilterMaxScore('') }}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '9px',
                letterSpacing: '0.08em',
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(var(--fg-rgb), 0.1)',
                background: 'transparent',
                color: 'rgba(var(--fg-rgb), 0.3)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <PosterGrid
        movies={sorted}
        loading={loading}
        onSelect={onSelect}
        userById={userById}
        showStddev={sort === 'divisive' || sort === 'unanimous'}
        hideScores={hideScores}
      />
    </div>
  )
}

// ─── VaultTab ─────────────────────────────────────────────────────────────────

function VaultTab({ movies, loading, onSelect, userById, hideScores = false }) {
  const vaultMovies = [...movies]
    .filter(isVault)
    .sort((a, b) => (displayAvg(b) ?? 0) - (displayAvg(a) ?? 0))

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
          color: 'rgba(var(--fg-rgb), 0.25)',
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
          color: 'rgba(var(--fg-rgb), 0.25)',
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
          hideScores={hideScores}
        />
      )}
    </div>
  )
}

// ─── BySeasonTab ──────────────────────────────────────────────────────────────

// Sort options that read a film's average (and stddev) — only meaningful per season.
const SEASON_FILM_SORTS = SORT_OPTIONS.filter(s => !s.requiresReveal)

function BySeasonTab({ movies, seasons, loading, onSelect, userById, hideScores = false }) {
  // Film ordering within every season (same options + recency rule as All Films).
  const [filmSort, setFilmSort] = useState('recent')
  // Order of the seasons themselves: 'recent' (latest first) or 'oldest'.
  const [seasonOrder, setSeasonOrder] = useState('recent')

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

  // Order the seasons by start_date (recent = latest first).
  const orderedSeasons = [...seasons].sort((a, b) => {
    const da = a.start_date ?? ''
    const db = b.start_date ?? ''
    if (da === db) return 0
    return seasonOrder === 'recent' ? (da < db ? 1 : -1) : (da < db ? -1 : 1)
  })

  // Group movies by season, applying the chosen film sort within each.
  const bySeason = orderedSeasons.map(season => {
    const seasonMovies = sortMovies(movies.filter(m => m._seasonId === season.id), filmSort)
    const scored = seasonMovies.map(displayAvg).filter(a => a != null)
    const avg = scored.length
      ? (scored.reduce((s, a) => s + a, 0) / scored.length)
      : null
    return { season, movies: seasonMovies, avg }
  }).filter(g => g.movies.length > 0)

  if (bySeason.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(var(--fg-rgb), 0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
        No films yet.
      </div>
    )
  }

  return (
    <div>
      {/* Sort controls — film order (applies to every season) + season order */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px' }}>
          {SEASON_FILM_SORTS.map(s => (
            <SortButton key={s.key} label={s.label} active={filmSort === s.key} onClick={() => setFilmSort(s.key)} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--fg-rgb), 0.25)' }}>
            Seasons
          </span>
          <SortButton label="Newest first" active={seasonOrder === 'recent'} onClick={() => setSeasonOrder('recent')} />
          <SortButton label="Oldest first" active={seasonOrder === 'oldest'} onClick={() => setSeasonOrder('oldest')} />
        </div>
      </div>

      {bySeason.map(({ season, movies: sMovies, avg }) => (
        <div key={season.id} style={{ marginBottom: '36px' }}>
          {/* Season header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '1.4rem',
              color: 'var(--text-strong)',
              letterSpacing: '0.05em',
              margin: 0,
            }}>
              {season.name}
            </h3>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: 'rgba(var(--fg-rgb), 0.3)',
              letterSpacing: '0.08em',
            }}>
              {sMovies.length} film{sMovies.length !== 1 ? 's' : ''}
            </span>
            {avg != null && !hideScores && (
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

          <PosterGrid
            movies={sMovies}
            loading={false}
            onSelect={onSelect}
            userById={userById}
            showStddev={filmSort === 'divisive' || filmSort === 'unanimous'}
            hideScores={hideScores}
          />
        </div>
      ))}
    </div>
  )
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryFilmCard({ movie, userById, onSelect, hideScores = false }) {
  const [hovered, setHovered] = useState(false)

  // historical_avg_score is the authoritative complete average for historical films;
  // individual ratings are an incomplete backfill, so prefer it. Fall back to the
  // computed average only for films with no historical avg (live/current films).
  const computedScore = movie.historical_avg_score ?? movie._avgScore
  const scored = computedScore != null && !hideScores

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
      style={{ cursor: 'pointer', minWidth: 0 }}
    >
      {/* Poster */}
      <div style={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        aspectRatio: '2/3',
        background: 'var(--surface)',
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
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: 'rgba(var(--fg-rgb), 0.12)' }}>
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
              {Number(computedScore).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <p style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '0.9rem',
        letterSpacing: '0.04em',
        color: 'var(--text-strong)',
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
          color: 'rgba(var(--fg-rgb), 0.3)',
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

function HistoryTab({ userById, onSelect, hideScores = false }) {
  const [months, setMonths] = useState([])
  const [moviesByMonth, setMoviesByMonth] = useState({})
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
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(var(--fg-rgb), 0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
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
                  border: selectedMonthId === m.id ? 'none' : '1px solid rgba(var(--fg-rgb), 0.1)',
                  background: selectedMonthId === m.id ? 'var(--accent)' : 'transparent',
                  color: selectedMonthId === m.id ? 'var(--text-strong)' : 'rgba(var(--fg-rgb), 0.4)',
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
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(var(--fg-rgb), 0.25)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
              No films for this month.
            </div>
          ) : (
            <div>
              <div
                className="history-grid"
                style={{
                  display: 'grid',
                  // minmax(0,1fr) lets columns shrink below their content width so the
                  // nowrap titles (ellipsis) never force the grid past the viewport. A
                  // 5-film month (April) now wraps cleanly instead of bleeding right.
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '14px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {selectedMovies.map(m => (
                  <HistoryFilmCard
                    key={m.id}
                    movie={m}
                    userById={userById}
                    onSelect={onSelect}
                    hideScores={hideScores}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab')
  const urlGenre = searchParams.get('genre') ?? ''
  const [activeTab, setActiveTab] = useState(TABS.includes(urlTab) ? urlTab : 'All Films')
  const [genreFilter, setGenreFilter] = useState(urlGenre)
  const [loading, setLoading] = useState(true)
  const [movies, setMovies] = useState([])
  const [seasons, setSeasons] = useState([])
  const [userById, setUserById] = useState({})
  const [selectedMovie, setSelectedMovie] = useState(null)
  // Hide-scores toggle: suppresses score numbers, σ (divisive sort) and the vault star
  // on poster cards so posters/titles stay unobscured. Floating control, persists state
  // across tab switches within the page.
  const [hideScores, setHideScores] = useState(false)

  // Respond to URL changes (e.g. a genre tag / vault badge clicked in the overlay).
  useEffect(() => {
    if (TABS.includes(urlTab)) setActiveTab(urlTab)
    setGenreFilter(urlGenre)
  }, [urlTab, urlGenre])

  useEffect(() => {
    async function load() {
      const [
        { data: moviesData },
        { data: monthsData },
        { data: seasonsData },
        { data: usersData },
        { data: ratingsData },
      ] = await Promise.all([
        supabase.from('movies_safe').select(
          'id, month_id, title, tmdb_id, poster_url, genre, director, runtime_minutes, year_released, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id'
        ),
        supabase.from('months').select('id, month_year, season_id, status').order('month_year', { ascending: true }),
        supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
        supabase.from('users').select('id, name, email'),
        supabase.from('ratings').select('movie_id, user_id, score'),
      ])

      // Build a lookup: month_id → { order, season_id, month_year, status }
      const monthLookup = {}
      ;(monthsData ?? []).forEach((m, idx) => {
        monthLookup[m.id] = { order: idx, seasonId: m.season_id, monthYear: m.month_year, status: m.status }
      })

      // Season lookup by id
      const seasonById = {}
      ;(seasonsData ?? []).forEach(s => { seasonById[s.id] = s })

      // Scores per movie (for stddev-based "divisive" sorting + computed fallback avg).
      // Exclude the test account by user id.
      const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
      const testUserId = (usersData ?? []).find(u => u.email === TEST_EMAIL)?.id ?? null
      const scoresByMovie = {}
      for (const r of (ratingsData ?? [])) {
        if (r.user_id === testUserId) continue
        if (r.score == null) continue
        if (!scoresByMovie[r.movie_id]) scoresByMovie[r.movie_id] = []
        scoresByMovie[r.movie_id].push(Number(r.score))
      }

      const enriched = (moviesData ?? [])
        // Exclude films from months that are still 'upcoming' (not yet activated/
        // revealed) — showing them on the Films page would leak picks before activation.
        // Only films from active/revealed months should appear here.
        .filter(m => monthLookup[m.month_id]?.status && monthLookup[m.month_id].status !== 'upcoming')
        .map(m => {
        const monthInfo = monthLookup[m.month_id] ?? {}
        const season = seasonById[monthInfo.seasonId] ?? null
        // Format a human-readable month label e.g. "Feb 2026 · Season 1"
        let monthLabel = null
        if (monthInfo.monthYear) {
          const d = new Date(monthInfo.monthYear + '-01T12:00:00')
          monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          if (season) monthLabel += ` · ${season.name}`
        }
        const scores = scoresByMovie[m.id] ?? []
        const avgScore = scores.length
          ? scores.reduce((s, v) => s + v, 0) / scores.length
          : null
        return {
          ...m,
          _monthOrder: monthInfo.order ?? 0,
          _seasonId: monthInfo.seasonId ?? null,
          _monthLabel: monthLabel,
          _scores: scores,
          _avgScore: avgScore,
        }
        })

      // Build user lookup by id (exclude the test account — must be invisible in all UI)
      const userLookup = {}
      ;(usersData ?? []).forEach(u => { if (u.email !== TEST_EMAIL) userLookup[u.id] = u })

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
        background: 'var(--bg)',
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
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            Collection
          </p>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2.8rem',
            color: 'var(--text-strong)',
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
              onClick={() => {
                setActiveTab(tab)
                // Switching tabs clears any genre deep-link so it doesn't linger.
                if (searchParams.has('tab') || searchParams.has('genre')) setSearchParams({}, { replace: true })
                if (tab !== 'All Films') setGenreFilter('')
              }}
            />
          ))}
        </div>

        {/* Tab content */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'All Films' && (
            <AllFilmsTab movies={movies} loading={loading} onSelect={handleSelect} userById={userById} seasons={seasons} initialGenre={genreFilter} hideScores={hideScores} />
          )}
          {activeTab === 'The Vault' && (
            <VaultTab movies={movies} loading={loading} onSelect={handleSelect} userById={userById} hideScores={hideScores} />
          )}
          {activeTab === 'By Season' && (
            <BySeasonTab movies={movies} seasons={seasons} loading={loading} onSelect={handleSelect} userById={userById} hideScores={hideScores} />
          )}
          {activeTab === 'History' && (
            <HistoryTab userById={userById} onSelect={handleSelect} hideScores={hideScores} />
          )}
        </div>

      </div>

      {/* Floating hide-scores toggle — stays visible while scrolling. Hidden while the
          film overlay is open (it covers the page). Eye / eye-off affordance. */}
      {!selectedMovie && (
        <button
          onClick={() => setHideScores(h => !h)}
          aria-pressed={hideScores}
          aria-label={hideScores ? 'Show scores' : 'Hide scores'}
          title={hideScores ? 'Show scores' : 'Hide scores'}
          style={{
            position: 'fixed',
            right: '16px',
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 14px',
            borderRadius: '999px',
            border: hideScores ? '1px solid var(--accent)' : '1px solid var(--hairline)',
            background: hideScores ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--surface)',
            color: hideScores ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            transition: 'all 0.15s ease',
          }}
        >
          {hideScores ? (
            /* eye-off */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            /* eye */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
          <span>{hideScores ? 'Scores Off' : 'Scores On'}</span>
        </button>
      )}

      {/* Film detail overlay */}
      <FilmDetailOverlay movie={selectedMovie} onClose={handleClose} />

      <style>{`
        @media (min-width: 480px) { .films-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } }
        @media (min-width: 768px) { .films-grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; } }
        @media (min-width: 560px) { .history-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
