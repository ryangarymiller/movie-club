import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function FilmDetailOverlay({ movie, onClose }) {
  const { profile, isAdmin } = useAuth()
  const [visible, setVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(true)
  const [ratings, setRatings] = useState([])
  const [users, setUsers] = useState([])
  const [fullMovie, setFullMovie] = useState(null)
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
  useEffect(() => {
    if (!movie) return

    setDetailLoading(true)
    setRatings([])
    setUsers([])
    setFullMovie(null)

    async function fetchDetails() {
      const [
        { data: movieData },
        { data: ratingsData },
        { data: usersData },
      ] = await Promise.all([
        supabase
          .from('movies_safe')
          .select('*')
          .eq('id', movie.id)
          .single(),
        supabase
          .from('ratings')
          .select('user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at')
          .eq('movie_id', movie.id),
        supabase
          .from('users')
          .select('id, name, role, joined_at'),
      ])

      setFullMovie(movieData ?? movie)
      setRatings(ratingsData ?? [])
      setUsers(usersData ?? [])
      setDetailLoading(false)
    }

    fetchDetails()
  }, [movie])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 300)
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
    scoresMessage = 'Scores revealed after the scoring deadline'
  }

  // Compute group average from visibleRatings that have a score
  const scoredRatings = visibleRatings.filter(r => r.score != null)
  const groupAvg = scoredRatings.length
    ? scoredRatings.reduce((s, r) => s + Number(r.score), 0) / scoredRatings.length
    : null

  // Recommend count
  const ratedWithRecommend = ratings.filter(r => r.recommend_outside_club != null)
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

          {/* ── SCORES ── */}
          <Divider />
          <div style={{ marginBottom: '0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
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

            {detailLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} style={{ height: '44px', borderRadius: '8px' }} />
                ))}
              </div>
            ) : scoresMessage ? (
              <div style={{
                padding: '18px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center',
              }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', margin: 0 }}>
                  {scoresMessage}
                </p>
              </div>
            ) : (
              <div>
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
              </div>
            )}
          </div>

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
          {recommendTotal > 0 && (
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
