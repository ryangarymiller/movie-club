import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import ScoreModal from '../components/ScoreModal'
import ReadjustmentBanner from '../components/ReadjustmentBanner'
import { FilmDetailOverlay } from './Films'
import { MEMBER_COLORS, memberColor } from '../lib/colors'

if (!document.getElementById('mc-fonts')) {
  const link = document.createElement('link')
  link.id = 'mc-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const FOUNDING = new Date('2026-01-05')

function daysSince(d) {
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function initials(title) {
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.floor((Date.now() - then) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />
}

function PosterCard({ movie, pending, pickerName }) {
  const score = movie.historical_avg_score
  const borderColor = pickerName ? MEMBER_COLORS[pickerName] : undefined
  return (
    <div
      className="relative shrink-0 w-28 cursor-pointer"
      style={borderColor ? { borderBottom: `3px solid ${borderColor}` } : undefined}
    >
      <div className="relative overflow-hidden rounded-lg bg-gray-900 shadow-xl shadow-black/60" style={{ aspectRatio: '2/3' }}>
        {movie.poster_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${movie.poster_url}`}
            alt={movie.title}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-black text-white/20" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {initials(movie.title)}
            </span>
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5">
          {score ? (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ background: 'var(--accent)', fontFamily: "'DM Mono', monospace", fontSize: '10px' }}>
              {Number(score).toFixed(2)}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-black/60 text-white/40 border border-white/10"
              style={{ fontSize: '10px' }}>?</span>
          )}
        </div>
        {pending && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white/60 border border-white/20 rounded px-2 py-0.5" style={{ fontSize: '10px' }}>Unscored</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-gray-400 leading-tight line-clamp-2" style={{ fontSize: '11px' }}>{movie.title}</p>
    </div>
  )
}

// "2026-05" → "May 2026". Falls back to "this month" when no month is set.
function monthName(monthYear) {
  if (!monthYear) return 'this month'
  return new Date(monthYear + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Compact deadline label for the Your-Turn cards. Shows the remaining time when
// the deadline is in the future, or the date once it's passed.
function deadlineLabel(iso) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const date = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diff <= 0) return { text: `Due ${date}`, past: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return { text: `${days}d ${hours}h left · ${date}`, past: false }
  if (hours > 0) return { text: `${hours}h left · ${date}`, past: false }
  const mins = Math.floor((diff % 3600000) / 60000)
  return { text: `${mins}m left`, past: false }
}

function ActionCard({ movie, existingRating, onScorePress }) {
  const dl = deadlineLabel(movie.scoring_deadline)
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="shrink-0 w-10 h-14 rounded-md overflow-hidden bg-gray-900">
        {movie.poster_url ? (
          <img src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`} alt={movie.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs font-black text-white/20" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{initials(movie.title)}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-500 uppercase mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', fontFamily: "'DM Mono', monospace" }}>Score needed</p>
        <p className="text-white font-medium text-sm leading-tight truncate">{movie.title}</p>
        {dl && (
          <p className="mt-0.5 truncate" style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: dl.past ? '#f87171' : 'var(--text-dim)' }}>
            ⏱ {dl.text}
          </p>
        )}
      </div>
      <button
        onClick={() => onScorePress(movie, existingRating ?? null)}
        className="shrink-0 font-semibold px-3 py-1.5 rounded-lg text-white whitespace-nowrap"
        style={{ background: 'var(--accent)', fontSize: '12px', fontFamily: "'DM Mono', monospace" }}
      >
        Score it
      </button>
    </div>
  )
}

function StatCard({ label, value, sub, onClick }) {
  return (
    <div
      className="p-3 rounded-xl border border-white/10 bg-white/[0.03] min-w-0 transition-colors"
      style={onClick ? { cursor: 'pointer' } : undefined}
      onClick={onClick}
      onMouseEnter={onClick ? e => { e.currentTarget.style.background = 'rgba(var(--fg-rgb),0.06)' } : undefined}
      onMouseLeave={onClick ? e => { e.currentTarget.style.background = 'rgba(var(--fg-rgb),0.03)' } : undefined}
    >
      <p className="text-gray-600 uppercase mb-1.5 truncate" style={{ fontSize: '9px', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>{label}</p>
      <p className="text-white font-black leading-none mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}>{value}</p>
      {sub && <p className="leading-tight line-clamp-2" style={{ fontSize: '10px', color: onClick ? 'var(--accent-light)' : 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function ActivityRow({ item, onFilmPress, isLast }) {
  const color = MEMBER_COLORS[item.memberName] ?? 'var(--accent)'
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb),0.08)' }}>
      <div
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{ width: '32px', height: '32px', background: 'rgba(var(--fg-rgb),0.03)', border: `1.5px solid ${color}` }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color, fontFamily: "'DM Mono',monospace" }}>
          {initials(item.memberName)}
        </span>
      </div>
      <p className="flex-1 min-w-0" style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.35, margin: 0 }}>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.memberName}</span>
        {' '}{item.verb}{' '}
        {item.movie ? (
          <span
            onClick={() => onFilmPress(item.movie)}
            style={{ color: 'var(--text)', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(var(--fg-rgb),0.2)' }}
          >
            {item.filmTitle}
          </span>
        ) : (
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.filmTitle}</span>
        )}
        {item.suffix ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}> {item.suffix}</span> : null}
      </p>
      <span className="shrink-0" style={{ color: 'var(--text-dim)', fontSize: '11px', fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap' }}>
        {timeAgo(item.at)}
      </span>
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { openMember } = useMemberOverlay()
  const [loading, setLoading] = useState(true)
  const [activeMovies, setActiveMovies] = useState([])
  const [activeMonthYear, setActiveMonthYear] = useState(null)
  const [allMovies, setAllMovies] = useState([])
  const [myRatings, setMyRatings] = useState([])
  const [users, setUsers] = useState([])
  const [activity, setActivity] = useState([])

  // Score modal state
  const [modalMovie, setModalMovie] = useState(null)
  const [modalRating, setModalRating] = useState(null)

  // Film detail overlay state
  const [selectedMovie, setSelectedMovie] = useState(null)

  // Recent Activity collapse state
  const [activityExpanded, setActivityExpanded] = useState(false)

  const ACTIVITY_COLLAPSED_COUNT = 4

  const load = useCallback(async () => {
    if (!profile) return
    const [
      { data: activeMonth },
      { data: movies },
      { data: ratings },
      { data: usersData },
      { data: recentRatings },
      { data: recentReviews },
      { data: recentComments },
    ] = await Promise.all([
      supabase.from('months').select('id, month_year').eq('status', 'active').maybeSingle(),
      supabase.from('movies_safe').select('id, month_id, title, poster_url, historical_avg_score, picked_by_user_id, picker_revealed, scoring_deadline'),
      supabase.from('ratings').select('movie_id, score').eq('user_id', profile.id),
      supabase.from('users').select('id, name, email, is_active, user_color'),
      supabase.from('ratings').select('id, movie_id, user_id, score, submitted_at').order('submitted_at', { ascending: false }).limit(12),
      supabase.from('reviews').select('id, movie_id, user_id, created_at').order('created_at', { ascending: false }).limit(12),
      supabase.from('comments').select('id, movie_id, user_id, created_at').order('created_at', { ascending: false }).limit(12),
    ])
    const active = movies?.filter(m => m.month_id === activeMonth?.id) ?? []
    setActiveMovies(active)
    setActiveMonthYear(activeMonth?.month_year ?? null)
    setAllMovies(movies ?? [])
    setMyRatings(ratings ?? [])
    // Test account must be invisible in all UI — filter by email. Also exclude inactive members.
    const visibleUsers = (usersData ?? []).filter(u => u.email !== 'i.am.ryan.the.miller@gmail.com' && u.is_active !== false)
    setUsers(visibleUsers)

    // Build the Recent Activity feed: merge ratings, reviews, comments into one list.
    const userMap = Object.fromEntries(visibleUsers.map(u => [u.id, u.name]))
    const movieMap = Object.fromEntries((movies ?? []).map(m => [m.id, m]))
    const events = []
    for (const r of recentRatings ?? []) {
      if (!userMap[r.user_id] || r.score == null) continue
      events.push({
        key: `rating-${r.id}`, at: r.submitted_at, userId: r.user_id, memberName: userMap[r.user_id],
        movie: movieMap[r.movie_id] ?? null, filmTitle: movieMap[r.movie_id]?.title ?? 'a film',
        verb: 'scored', suffix: Number(r.score).toFixed(2),
      })
    }
    for (const r of recentReviews ?? []) {
      if (!userMap[r.user_id]) continue
      events.push({
        key: `review-${r.id}`, at: r.created_at, userId: r.user_id, memberName: userMap[r.user_id],
        movie: movieMap[r.movie_id] ?? null, filmTitle: movieMap[r.movie_id]?.title ?? 'a film',
        verb: 'reviewed', suffix: null,
      })
    }
    for (const c of recentComments ?? []) {
      if (!userMap[c.user_id]) continue
      events.push({
        key: `comment-${c.id}`, at: c.created_at, userId: c.user_id, memberName: userMap[c.user_id],
        movie: movieMap[c.movie_id] ?? null, filmTitle: movieMap[c.movie_id]?.title ?? 'a film',
        verb: 'commented on', suffix: null,
      })
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    setActivity(events.slice(0, 12))
    setLoading(false)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  function openModal(movie, rating) {
    setModalMovie(movie)
    setModalRating(rating ?? null)
  }

  function closeModal() {
    setModalMovie(null)
    setModalRating(null)
  }

  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const ratingsMap = Object.fromEntries(myRatings.map(r => [r.movie_id, r]))
  const scoredIds = new Set(myRatings.filter(r => r.score).map(r => r.movie_id))
  const pendingFilms = activeMovies.filter(m => !scoredIds.has(m.id))
  const topFilm = [...allMovies].filter(m => m.historical_avg_score).sort((a, b) => b.historical_avg_score - a.historical_avg_score)[0]

  return (
    <div style={{ background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)', fontFamily: "'DM Sans',sans-serif", minHeight: '100vh', paddingBottom: '6rem', width: '100%', boxSizing: 'border-box' }}>

      {/* Single padded container — everything inside */}
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div className="mb-8" style={{ animation: 'fadeUp 0.5s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>
            {formatDate()}
          </p>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '3rem', color: 'var(--text-strong)', lineHeight: 1, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            Movie Club
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Welcome back, <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{firstName}</span>
          </p>
        </div>

        {/* Seasonal readjustment window (only while open) */}
        <ReadjustmentBanner style={{ marginBottom: '2rem', animation: 'fadeUp 0.5s 0.05s ease both' }} />

        {/* Your Turn */}
        <section className="mb-8" style={{ animation: 'fadeUp 0.5s 0.1s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Your Turn
          </p>
          {loading ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : pendingFilms.length === 0 ? (
            <div
              onClick={() => navigate('/this-month')}
              className="flex items-center gap-3 p-4 rounded-xl border border-white/10 transition-colors"
              style={{ cursor: 'pointer', background: 'rgba(var(--fg-rgb),0.03)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--fg-rgb),0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--fg-rgb),0.03)' }}
            >
              <span style={{ fontSize: '20px' }}>{activeMovies.length === 0 ? '🎬' : '✓'}</span>
              <div className="flex-1 min-w-0">
                {activeMovies.length === 0 ? (
                  <>
                    <p className="text-white text-sm font-medium">No films to score right now</p>
                    <p className="text-gray-500 text-xs">
                      {activeMonthYear
                        ? `${monthName(activeMonthYear)} has no films yet`
                        : 'No active month — check back when the next one starts'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white text-sm font-medium">You're all caught up</p>
                    <p className="text-gray-500 text-xs">All {monthName(activeMonthYear)} scores submitted</p>
                  </>
                )}
              </div>
              <span style={{ color: 'var(--accent)', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>View this month →</span>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingFilms.map(m => (
                <ActionCard
                  key={m.id}
                  movie={m}
                  existingRating={ratingsMap[m.id] ?? null}
                  onScorePress={openModal}
                />
              ))}
            </div>
          )}
        </section>

        {/* This Month's Films */}
        <section className="mb-8" style={{ animation: 'fadeUp 0.5s 0.2s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            {activeMonthYear ? monthName(activeMonthYear) : 'This Month'}
          </p>
          {loading ? (
            <div className="flex gap-3 overflow-hidden">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="shrink-0 w-28 rounded-lg" style={{ aspectRatio: '2/3' }} />)}
            </div>
          ) : activeMovies.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: 0 }}>
              No picks yet for {monthName(activeMonthYear)}.
            </p>
          ) : (
            <>
              {/* Vertical padding so the cards' drop shadow isn't clipped by the
                  horizontal-scroll container (overflowX:auto also clips overflow-y). */}
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '8px 2px 26px', scrollbarWidth: 'none' }}>
                {activeMovies.map(m => {
                  const pickerName = m.picker_revealed
                    ? (users.find(u => u.id === m.picked_by_user_id)?.name ?? undefined)
                    : undefined
                  return (
                    <div key={m.id} onClick={() => setSelectedMovie(m)} style={{ cursor: 'pointer' }}>
                      <PosterCard movie={m} pending={!scoredIds.has(m.id)} pickerName={pickerName} />
                    </div>
                  )
                })}
              </div>
              {/* Show submitted scores when all films are scored */}
              {pendingFilms.length === 0 && activeMovies.length > 0 && (
                <div className="mt-4 rounded-xl px-3 py-1" style={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}>
                  {activeMovies.map((m, i) => {
                    const r = ratingsMap[m.id]
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 py-2.5"
                        style={{ borderBottom: i === activeMovies.length - 1 ? 'none' : '1px solid rgba(var(--fg-rgb),0.08)' }}
                      >
                        <div className="shrink-0 w-6 h-9 rounded overflow-hidden bg-gray-900">
                          {m.poster_url ? (
                            <img src={`https://image.tmdb.org/t/p/w92${m.poster_url}`} alt={m.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span style={{ fontSize: '7px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: "'Bebas Neue',sans-serif" }}>{initials(m.title)}</span>
                            </div>
                          )}
                        </div>
                        <p
                          className="flex-1 min-w-0 truncate"
                          style={{ color: 'var(--text)', fontSize: '13px', margin: 0, cursor: 'pointer', fontWeight: 400 }}
                          onClick={() => setSelectedMovie(m)}
                        >
                          {m.title}
                        </p>
                        {r?.score != null ? (
                          <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 700, fontFamily: "'DM Mono',monospace", whiteSpace: 'nowrap' }}>
                            {Number(r.score).toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>—</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {/* Stats */}
        <section style={{ animation: 'fadeUp 0.5s 0.3s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Club Stats
          </p>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Top Film"
                value={topFilm ? Number(topFilm.historical_avg_score).toFixed(2) : '—'}
                sub={topFilm?.title}
                onClick={topFilm ? () => setSelectedMovie(topFilm) : undefined}
              />
              <StatCard
                label="Films"
                value={allMovies.length}
                sub={`watched`}
                onClick={() => navigate('/films')}
              />
              <StatCard label="Days" value={daysSince(FOUNDING)} sub="of club" />
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section className="mt-8" style={{ animation: 'fadeUp 0.5s 0.4s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Recent Activity
          </p>
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : activity.length === 0 ? (
            <div className="p-4 rounded-xl" style={{ background: 'rgba(var(--fg-rgb),0.03)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}>
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: 0 }}>No recent activity yet.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl px-3" style={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}>
                {(activityExpanded ? activity : activity.slice(0, ACTIVITY_COLLAPSED_COUNT)).map((item, i, arr) => (
                  <ActivityRow key={item.key} item={item} onFilmPress={setSelectedMovie} isLast={i === arr.length - 1} />
                ))}
              </div>
              {activity.length > ACTIVITY_COLLAPSED_COUNT && (
                <button
                  onClick={() => setActivityExpanded(prev => !prev)}
                  style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace", background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'block' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  {activityExpanded ? '▲ Show less' : `▼ Show ${activity.length - ACTIVITY_COLLAPSED_COUNT} more`}
                </button>
              )}
            </>
          )}
        </section>

        {/* Club Members strip */}
        <section className="mt-8 mb-4" style={{ animation: 'fadeUp 0.5s 0.5s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Club Members
          </p>
          {loading ? (
            <div className="flex gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-14 h-14 rounded-full" />)}</div>
          ) : (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {users.map(u => {
                const color = u.user_color || memberColor(u.name) || 'var(--accent)'
                const nameParts = (u.name ?? '').split(' ')
                const displayName = nameParts.length >= 2
                  ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
                  : nameParts[0] ?? ''
                const initStr = nameParts.map(p => p[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <button
                    key={u.id}
                    onClick={() => openMember(u.id)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <div
                      style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        border: `2.5px solid ${color}`,
                        background: 'rgba(var(--fg-rgb),0.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color, fontFamily: "'DM Mono',monospace" }}>
                        {initStr}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap', maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayName}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* Score Modal */}
      {modalMovie && (
        <ScoreModal
          movie={modalMovie}
          existingRating={modalRating}
          onClose={closeModal}
          onSaved={() => {
            closeModal()
            load()
          }}
        />
      )}

      {/* Film Detail Overlay */}
      <FilmDetailOverlay
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
      />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
