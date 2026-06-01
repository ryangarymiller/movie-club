import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_SWATCHES = [
  { name: 'crimson',    hex: '#dc2626', label: 'Crimson'    },
  { name: 'ember',      hex: '#ea580c', label: 'Ember'      },
  { name: 'amber',      hex: '#d97706', label: 'Amber'      },
  { name: 'sage',       hex: '#16a34a', label: 'Sage'       },
  { name: 'slate-blue', hex: '#2563eb', label: 'Slate Blue' },
  { name: 'indigo',     hex: '#4f46e5', label: 'Indigo'     },
  { name: 'violet',     hex: '#7c3aed', label: 'Violet'     },
]

const TMDB_IMG = 'https://image.tmdb.org/t/p/w300'

// ─── Style helpers ──────────────────────────────────────────────────────────────

const CARD = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '14px',
}

const LABEL_STYLE = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#374151',
}

const SECTION_LABEL = {
  ...LABEL_STYLE,
  color: '#4b5563',
  marginBottom: '12px',
  display: 'block',
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Skeleton({ style = {} }) {
  return (
    <div
      className="animate-pulse"
      style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', ...style }}
    />
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ ...CARD, padding: '14px 12px' }}>
      <p style={LABEL_STYLE}>{label}</p>
      <p
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '2rem',
          color: 'white',
          lineHeight: 1,
          margin: '6px 0 4px',
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            color: '#6b7280',
            fontSize: '11px',
            lineHeight: 1.3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function RecentRow({ rating, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
        <Skeleton style={{ width: 48, height: 68, borderRadius: '6px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton style={{ height: 14, width: '60%', marginBottom: 6 }} />
          <Skeleton style={{ height: 11, width: '30%' }} />
        </div>
        <Skeleton style={{ width: 40, height: 28 }} />
      </div>
    )
  }

  const { movie, score } = rating
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Poster */}
      <div
        style={{
          width: 48,
          height: 68,
          borderRadius: '6px',
          overflow: 'hidden',
          background: '#111',
          flexShrink: 0,
        }}
      >
        {movie?.poster_url ? (
          <img
            src={`${TMDB_IMG}${movie.poster_url}`}
            alt={movie?.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '18px',
                color: 'rgba(255,255,255,0.15)',
              }}
            >
              {(movie?.title || '?').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Title + year */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            color: 'white',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            margin: 0,
          }}
        >
          {movie?.title ?? '—'}
        </p>
        {movie?.year_released && (
          <p style={{ color: '#6b7280', fontSize: '12px', margin: '2px 0 0' }}>
            {movie.year_released}
          </p>
        )}
      </div>

      {/* Score */}
      <p
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '1.75rem',
          color: 'var(--accent)',
          lineHeight: 1,
          flexShrink: 0,
          margin: 0,
        }}
      >
        {score != null ? Number(score).toFixed(2) : '—'}
      </p>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatMemberSince(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return 'Member since ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function Profile() {
  const { profile, isAdmin, fetchProfile } = useAuth()
  const { accent, setAccent } = useTheme()

  const [statsLoading, setStatsLoading] = useState(true)
  const [stats, setStats] = useState(null)          // { count, avg, highest, lowest }
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentRatings, setRecentRatings] = useState([]) // [{movie, score, submitted_at}]
  const [signingOut, setSigningOut] = useState(false)
  const [adminToggling, setAdminToggling] = useState(false)

  // ── Fetch stats + recent scores ──────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return

    async function load() {
      const { data: ratings } = await supabase
        .from('ratings')
        .select('id, movie_id, score, pre_watch_excitement, submitted_at')
        .eq('user_id', profile.id)
        .not('score', 'is', null)
        .order('submitted_at', { ascending: false })

      if (!ratings || ratings.length === 0) {
        setStats({ count: 0, avg: null, highest: null, lowest: null })
        setRecentRatings([])
        setStatsLoading(false)
        setRecentLoading(false)
        return
      }

      // Compute stats
      const scores = ratings.map(r => Number(r.score))
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const maxScore = Math.max(...scores)
      const minScore = Math.min(...scores)
      const highestRating = ratings.find(r => Number(r.score) === maxScore)
      const lowestRating = ratings.find(r => Number(r.score) === minScore)

      // Fetch movie titles for highest/lowest + recent 5
      const neededIds = new Set([
        ...ratings.slice(0, 5).map(r => r.movie_id),
        highestRating?.movie_id,
        lowestRating?.movie_id,
      ].filter(Boolean))

      const { data: movies } = await supabase
        .from('movies_safe')
        .select('id, title, poster_url, year_released, director')
        .in('id', [...neededIds])

      const movieMap = Object.fromEntries((movies ?? []).map(m => [m.id, m]))

      setStats({
        count: ratings.length,
        avg,
        highest: { score: maxScore, movie: movieMap[highestRating?.movie_id] },
        lowest:  { score: minScore, movie: movieMap[lowestRating?.movie_id] },
      })
      setStatsLoading(false)

      setRecentRatings(
        ratings.slice(0, 5).map(r => ({
          ...r,
          movie: movieMap[r.movie_id] ?? null,
        }))
      )
      setRecentLoading(false)
    }

    load()
  }, [profile])

  // ── Sign out ─────────────────────────────────────────────────────────────────
  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  // ── Admin mode toggle ────────────────────────────────────────────────────────
  async function handleAdminModeToggle() {
    if (!profile || adminToggling) return
    setAdminToggling(true)
    await supabase
      .from('users')
      .update({ admin_mode_enabled: !profile.admin_mode_enabled })
      .eq('id', profile.id)
    await fetchProfile(profile.id)
    setAdminToggling(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const initials = getInitials(profile?.name)
  const memberSince = formatMemberSince(profile?.joined_at)

  return (
    <div
      style={{
        background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)',
        fontFamily: "'DM Sans', sans-serif",
        minHeight: '100vh',
        paddingBottom: '6rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* ── Section 1: Profile Header ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Avatar */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '2px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '1.6rem',
                  color: 'var(--accent)',
                  letterSpacing: '0.05em',
                }}
              >
                {initials}
              </span>
            </div>

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '2rem',
                    color: 'white',
                    margin: 0,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {profile?.name ?? '—'}
                </h1>
                {isAdmin && (
                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '9px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: '100px',
                      padding: '2px 8px',
                      lineHeight: 1.6,
                    }}
                  >
                    Admin
                  </span>
                )}
              </div>
              <p
                style={{
                  color: '#6b7280',
                  fontSize: '13px',
                  margin: '4px 0 0',
                }}
              >
                {memberSince}
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 2: Personal Stats Snapshot ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.08s ease both' }}>
          <span style={SECTION_LABEL}>Your Stats</span>

          {statsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} style={{ height: '88px', borderRadius: '14px' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <StatCard
                label="Films Scored"
                value={stats?.count ?? 0}
                sub={stats?.count === 1 ? 'film rated' : 'films rated'}
              />
              <StatCard
                label="Avg Score Given"
                value={stats?.avg != null ? Number(stats.avg).toFixed(2) : '—'}
                sub="across all films"
              />
              <StatCard
                label="Highest Score"
                value={stats?.highest?.score != null ? Number(stats.highest.score).toFixed(2) : '—'}
                sub={stats?.highest?.movie?.title}
              />
              <StatCard
                label="Lowest Score"
                value={stats?.lowest?.score != null ? Number(stats.lowest.score).toFixed(2) : '—'}
                sub={stats?.lowest?.movie?.title}
              />
            </div>
          )}
        </section>

        {/* ── Section 3: Recent Scores ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.16s ease both' }}>
          <span style={SECTION_LABEL}>Recent Scores</span>

          <div style={{ ...CARD, padding: '4px 14px' }}>
            {recentLoading ? (
              [...Array(5)].map((_, i) => <RecentRow key={i} loading />)
            ) : recentRatings.length === 0 ? (
              <p style={{ color: '#4b5563', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                No scores submitted yet.
              </p>
            ) : (
              recentRatings.map((r, i) => (
                <div
                  key={r.id}
                  style={i === recentRatings.length - 1 ? { borderBottom: 'none' } : undefined}
                >
                  <RecentRow rating={r} loading={false} />
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Section 4: Appearance Settings ── */}
        <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.24s ease both' }}>
          <span style={SECTION_LABEL}>Appearance</span>

          <div style={{ ...CARD, padding: '16px' }}>
            <p
              style={{
                ...LABEL_STYLE,
                marginBottom: '14px',
                display: 'block',
              }}
            >
              Accent Color
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {ACCENT_SWATCHES.map(swatch => {
                const active = accent === swatch.name
                return (
                  <button
                    key={swatch.name}
                    onClick={() => setAccent(swatch.name)}
                    title={swatch.label}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: swatch.hex,
                      border: active ? '2px solid white' : '2px solid transparent',
                      boxShadow: active ? `0 0 0 2px ${swatch.hex}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      outline: 'none',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                      flexShrink: 0,
                    }}
                    aria-label={swatch.label}
                    aria-pressed={active}
                  />
                )
              })}
            </div>

            <p
              style={{
                color: '#4b5563',
                fontSize: '12px',
                marginTop: '12px',
                margin: '12px 0 0',
              }}
            >
              {ACCENT_SWATCHES.find(s => s.name === accent)?.label ?? ''}
            </p>
          </div>
        </section>

        {/* ── Section 5: Admin ── */}
        {isAdmin && (
          <section style={{ marginBottom: '2rem', animation: 'fadeUp 0.45s 0.30s ease both' }}>
            <span style={SECTION_LABEL}>Admin</span>

            <div style={{ ...CARD, padding: '16px' }}>
              {/* Admin Mode row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  Admin Mode
                </span>

                {/* Toggle switch */}
                <button
                  onClick={handleAdminModeToggle}
                  disabled={adminToggling}
                  aria-pressed={!!profile?.admin_mode_enabled}
                  aria-label="Toggle admin mode"
                  style={{
                    position: 'relative',
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    border: 'none',
                    padding: 0,
                    cursor: adminToggling ? 'not-allowed' : 'pointer',
                    background: profile?.admin_mode_enabled
                      ? 'var(--accent)'
                      : 'rgba(255,255,255,0.12)',
                    transition: 'background 0.2s ease',
                    flexShrink: 0,
                    outline: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: profile?.admin_mode_enabled ? '22px' : '3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </button>
              </div>

              {/* Note */}
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  color: '#4b5563',
                  margin: '10px 0 0',
                  letterSpacing: '0.04em',
                }}
              >
                Shows the Admin tab in navigation
              </p>
            </div>
          </section>
        )}

        {/* ── Section 6: Sign Out ── */}
        <section style={{ animation: 'fadeUp 0.45s 0.32s ease both', paddingBottom: '1rem' }}>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              color: signingOut ? '#6b7280' : '#f87171',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              fontWeight: 500,
              cursor: signingOut ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </section>

      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
