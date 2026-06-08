import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import ScoreModal from '../components/ScoreModal'
import ReadjustmentBanner from '../components/ReadjustmentBanner'
import Avatar from '../components/Avatar'
import { FilmDetailOverlay } from './Films'
import { MEMBER_COLORS, userColor } from '../lib/colors'
import { useCollapseScroll } from '../lib/useCollapseScroll'
import { clubAge, roundMilestone, memberAnniversaries, inDaysLabel } from '../lib/milestones'

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

function PosterCard({ movie, pending, pickerName, pickerColor, clubAvg = null }) {
  // Rolling club average (visible only once the viewer has scored, RLS-gated) takes
  // precedence; otherwise the authoritative historical average for revealed films.
  const score = clubAvg ?? movie.historical_avg_score
  const borderColor = pickerName ? (pickerColor ?? MEMBER_COLORS[pickerName]) : undefined
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
            // Club average (👥), distinct from "your score" in the list below.
            <span className="font-bold px-1.5 py-0.5 rounded-full text-white inline-flex items-center gap-0.5"
              style={{ background: 'var(--accent)', fontFamily: "'DM Mono', monospace", fontSize: '10px' }}>
              <span style={{ fontSize: '8px' }}>👥</span>{Number(score).toFixed(2)}
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

function ActionCard({ movie, existingRating, onScorePress, onOpen }) {
  const dl = deadlineLabel(movie.scoring_deadline)
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <div
        className="shrink-0 w-10 h-14 rounded-md overflow-hidden bg-gray-900"
        onClick={() => onOpen?.(movie)}
        style={{ cursor: onOpen ? 'pointer' : 'default' }}
      >
        {movie.poster_url ? (
          <img src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`} alt={movie.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs font-black text-white/20" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{initials(movie.title)}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0" onClick={() => onOpen?.(movie)} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
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
      <p className="text-gray-600 uppercase mb-1.5 leading-tight" style={{ fontSize: '9px', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>{label}</p>
      <p className="text-white font-black leading-none mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}>{value}</p>
      {sub && <p className="leading-tight line-clamp-2" style={{ fontSize: '10px', color: onClick ? 'var(--accent-light)' : 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function ActivityRow({ item, user, onFilmPress, isLast }) {
  // Prefer the full user object (carries avatar_id) so the avatar image shows;
  // fall back to a minimal object built from the activity item (name + color)
  // so the row still renders colored initials if no match was found.
  const avatarUser = user ?? { name: item.memberName, user_color: item.memberColor }
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb),0.08)' }}>
      <Avatar user={avatarUser} size={32} />
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
  const [activeClubAvgs, setActiveClubAvgs] = useState({}) // movie_id → rolling club avg (RLS-gated)
  const [activeMonthYear, setActiveMonthYear] = useState(null)
  const [allMovies, setAllMovies] = useState([])
  // Club "films watched" = revealed OR active-month films (excludes the upcoming
  // month's not-yet-watched picks, e.g. June's Juno/Gattaca).
  const [clubFilmsWatched, setClubFilmsWatched] = useState(0)
  const [myRatings, setMyRatings] = useState([])
  const [users, setUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [pickPrompt, setPickPrompt] = useState(null) // {reminder} when the viewer hasn't picked next month
  // Milestone totals (test account excluded). null until loaded.
  const [milestoneCounts, setMilestoneCounts] = useState(null)
  // "Now" snapshot for live age/countdowns — refreshed on each load() so it stays
  // current without calling the impure Date.now() during render.
  const [now, setNow] = useState(() => Date.now())

  // Score modal state
  const [modalMovie, setModalMovie] = useState(null)
  const [modalRating, setModalRating] = useState(null)

  // Film detail overlay state
  const [selectedMovie, setSelectedMovie] = useState(null)

  // Recent Activity collapse state
  const [activityExpanded, setActivityExpanded] = useState(false)
  const { anchorRef: activityAnchorRef, beforeCollapse: activityBeforeCollapse } = useCollapseScroll()

  const ACTIVITY_COLLAPSED_COUNT = 4

  const load = useCallback(async () => {
    if (!profile) return
    setNow(Date.now()) // refresh the live-clock snapshot used by milestone countdowns
    const [
      { data: activeMonth },
      { data: movies },
      { data: ratings },
      { data: usersData },
      { data: recentRatings },
      { data: recentReviews },
      { data: recentComments },
      { data: upcoming },
    ] = await Promise.all([
      supabase.from('months').select('id, month_year').eq('status', 'active').maybeSingle(),
      supabase.from('movies_safe').select('id, month_id, title, poster_url, historical_avg_score, picked_by_user_id, picker_revealed, scores_revealed, scoring_deadline'),
      supabase.from('ratings').select('id, movie_id, score, pre_watch_excitement, recommend_outside_club, submitted_at').eq('user_id', profile.id),
      supabase.from('users').select('id, name, email, is_active, user_color, avatar_id'),
      supabase.from('ratings').select('id, movie_id, user_id, score, submitted_at').order('submitted_at', { ascending: false }).limit(12),
      supabase.from('reviews').select('id, movie_id, user_id, created_at').order('created_at', { ascending: false }).limit(12),
      supabase.from('comments').select('id, movie_id, user_id, created_at').order('created_at', { ascending: false }).limit(12),
      supabase.from('months').select('id, month_year, active_date, auto_activate').eq('status', 'upcoming').order('month_year', { ascending: true }).limit(1).maybeSingle(),
    ])

    // Pick reminder: does the viewer still need to pick for the upcoming month?
    let nextPick = null
    if (upcoming) {
      const { data: myPick } = await supabase.from('upcoming_picks')
        .select('id').eq('user_id', profile.id).eq('month_target', upcoming.month_year).maybeSingle()
      if (!myPick) {
        const label = monthName(upcoming.month_year)
        let reminder
        if (upcoming.auto_activate && upcoming.active_date) {
          const when = new Date(`${upcoming.active_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          reminder = `Pick before ${when}, when ${label} starts.`
        } else {
          reminder = `Make sure you pick before ${label} starts.`
        }
        nextPick = { reminder }
      }
    }
    setPickPrompt(nextPick)
    const active = movies?.filter(m => m.month_id === activeMonth?.id) ?? []
    setActiveMovies(active)

    // Rolling club average per active film — computed from the RLS-gated ratings
    // the viewer may see (so a film's average shows only once they've scored it).
    const activeIds = active.map(m => m.id)
    const avgs = {}
    if (activeIds.length) {
      const { data: activeR } = await supabase.from('ratings').select('movie_id, score').in('movie_id', activeIds)
      const acc = {}
      for (const r of (activeR ?? [])) {
        if (r.score == null) continue
        ;(acc[r.movie_id] ??= []).push(Number(r.score))
      }
      for (const [mid, arr] of Object.entries(acc)) avgs[mid] = arr.reduce((s, v) => s + v, 0) / arr.length
    }
    setActiveClubAvgs(avgs)
    setActiveMonthYear(activeMonth?.month_year ?? null)
    setAllMovies(movies ?? [])
    setClubFilmsWatched((movies ?? []).filter(m => m.scores_revealed || m.month_id === activeMonth?.id).length)
    setMyRatings(ratings ?? [])
    // Test account must be invisible in all UI — filter by email. Also exclude inactive members.
    const visibleUsers = (usersData ?? []).filter(u => u.email !== 'i.am.ryan.the.miller@gmail.com' && u.is_active !== false)
    setUsers(visibleUsers)

    // ── Milestone stats — PERSONAL to the viewer (their own journey on their home) ──
    // Films watched = films YOU have a final score for; avg = your mean score; posts
    // = your reviews + comments. (Head-only count queries avoid pulling rows.)
    const myScored = (ratings ?? []).filter(r => r.score != null)
    const myAvg = myScored.length
      ? myScored.reduce((s, r) => s + Number(r.score), 0) / myScored.length
      : null
    const [myReviewsCount, myCommentsCount] = await Promise.all([
      supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
    ])
    setMilestoneCounts({
      filmsWatched: myScored.length,
      avgScore: myAvg,
      reviews: myReviewsCount.count ?? 0,
      comments: myCommentsCount.count ?? 0,
    })

    // Build the Recent Activity feed: merge ratings, reviews, comments into one list.
    const userMap = Object.fromEntries(visibleUsers.map(u => [u.id, u.name]))
    const colorById = Object.fromEntries(visibleUsers.map(u => [u.id, userColor(u)]))
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
    for (const e of events) e.memberColor = colorById[e.userId]
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    setActivity(events.slice(0, 12))
    setLoading(false)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  // Live-refresh when any rating changes (e.g. you score from the movie page, or
  // another member scores) so "Your Turn" / activity update without a refresh.
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('home-ratings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile, load])

  function openModal(movie, rating) {
    setModalMovie(movie)
    setModalRating(rating ?? null)
  }

  function closeModal() {
    setModalMovie(null)
    setModalRating(null)
  }

  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const usersById = Object.fromEntries(users.map(u => [u.id, u]))
  const ratingsMap = Object.fromEntries(myRatings.map(r => [r.movie_id, r]))
  const scoredIds = new Set(myRatings.filter(r => r.score).map(r => r.movie_id))
  const pendingFilms = activeMovies.filter(m => !scoredIds.has(m.id))
  const topFilm = [...allMovies].filter(m => m.historical_avg_score).sort((a, b) => b.historical_avg_score - a.historical_avg_score)[0]

  // ── Milestones / Anniversaries (live `now` snapshot keeps age + countdowns current) ──
  const age = clubAge(now)
  // The single most relevant active milestone banner: prefer a "just reached" round
  // number, otherwise the closest "approaching" one (fewest remaining). Films use a
  // step of 10, scores a step of 25 (scores accrue far faster than films).
  const milestoneBanner = (() => {
    if (!milestoneCounts) return null
    const candidates = [
      { ...roundMilestone(milestoneCounts.filmsWatched, { step: 10 }), noun: 'films watched', glyph: '🎬' },
      { ...roundMilestone(milestoneCounts.reviews + milestoneCounts.comments, { step: 25 }), noun: 'discussion posts', glyph: '💬' },
    ].filter(c => c.kind)
    const reached = candidates.filter(c => c.kind === 'reached').sort((a, b) => b.value - a.value)[0]
    if (reached) return reached
    return candidates.filter(c => c.kind === 'approaching').sort((a, b) => a.remaining - b.remaining)[0] ?? null
  })()
  const anniversaries = memberAnniversaries(users, now, 7)
  const showMilestones = !loading && milestoneCounts != null

  return (
    <div style={{ background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)', fontFamily: "'DM Sans',sans-serif", minHeight: '100vh', paddingBottom: '5rem', width: '100%', boxSizing: 'border-box' }}>

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
          {!loading && pickPrompt && (
            <div
              onClick={() => navigate('/this-month')}
              className="flex items-center gap-3 p-4 rounded-xl mb-3 transition-colors"
              style={{ cursor: 'pointer', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)' }}
            >
              <span style={{ fontSize: '20px' }}>⏰</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">Pick your next movie</p>
                <p className="text-gray-500 text-xs">{pickPrompt.reminder}</p>
              </div>
              <span style={{ color: 'var(--accent)', fontSize: '11px', fontFamily: "'DM Mono',monospace" }}>Pick now →</span>
            </div>
          )}
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
                  onOpen={setSelectedMovie}
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
                  const picker = m.picker_revealed ? users.find(u => u.id === m.picked_by_user_id) : null
                  const pickerName = picker?.name ?? undefined
                  return (
                    <div key={m.id} onClick={() => setSelectedMovie(m)} style={{ cursor: 'pointer' }}>
                      <PosterCard movie={m} pending={!scoredIds.has(m.id)} pickerName={pickerName} pickerColor={userColor(picker)} clubAvg={activeClubAvgs[m.id] ?? null} />
                    </div>
                  )
                })}
              </div>
              {/* Legend: posters carry the CLUB average (visible once you've scored). */}
              {activeMovies.some(m => (activeClubAvgs[m.id] ?? m.historical_avg_score) != null) && (
                <p style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)', margin: '-14px 2px 0' }}>
                  <span style={{ fontSize: '9px' }}>👥</span> = club average
                </p>
              )}
              {/* Show submitted scores when all films are scored */}
              {pendingFilms.length === 0 && activeMovies.length > 0 && (
                <div className="mt-4 rounded-xl px-3 py-1" style={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '8px 0 2px' }}>
                    Your scores
                  </p>
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
                value={clubFilmsWatched}
                sub={`watched`}
                onClick={() => navigate('/films')}
              />
              <StatCard label="Days" value={daysSince(FOUNDING)} sub="of club" />
            </div>
          )}
        </section>

        {/* Milestones / Anniversaries */}
        <section className="mt-8" style={{ animation: 'fadeUp 0.5s 0.35s ease both' }} aria-label="Milestones and anniversaries">
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Milestones
          </p>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : !showMilestones ? null : (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}>
              {/* Active round-number milestone banner */}
              {milestoneBanner && (
                <div
                  className="flex items-center gap-3 p-3 rounded-xl mb-4"
                  style={{ background: 'rgba(var(--accent-rgb),0.10)', border: '1px solid rgba(var(--accent-rgb),0.28)' }}
                >
                  <span style={{ fontSize: '22px', lineHeight: 1 }} aria-hidden="true">{milestoneBanner.glyph}</span>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600, margin: 0, lineHeight: 1.25 }}>
                      {milestoneBanner.kind === 'approaching'
                        ? `${milestoneBanner.remaining} away from ${milestoneBanner.value} ${milestoneBanner.noun}`
                        : `${milestoneBanner.value} ${milestoneBanner.noun} 🎉`}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '2px 0 0', fontFamily: "'DM Mono',monospace" }}>
                      {milestoneBanner.kind === 'reached' ? 'Milestone reached' : 'Milestone coming up'}
                    </p>
                  </div>
                </div>
              )}

              {/* Member join anniversaries (next ~7 days) */}
              {anniversaries.length > 0 && (
                <div className="mb-4">
                  <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 6px' }}>
                    Join anniversaries
                  </p>
                  <div className="space-y-1.5">
                    {anniversaries.map(({ user: u, months, days }) => (
                      <button
                        key={u.id}
                        onClick={() => openMember(u.id)}
                        className="flex items-center gap-3 w-full text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                      >
                        <Avatar user={u} size={32} />
                        <p style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: 1.3 }}>
                          <span style={{ color: userColor(u), fontWeight: 600 }}>{(u.name ?? '').split(' ')[0]}</span>
                          {' '}joined{' '}
                          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{months === 1 ? '1 month' : `${months} months`}</span>
                          {' '}ago{' '}
                          <span style={{ color: 'var(--accent)', fontFamily: "'DM Mono',monospace", fontSize: '11px' }}>· {inDaysLabel(days)}</span>
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestone stat tiles */}
              <div className="grid grid-cols-3 gap-2">
                <StatCard
                  label="Club Age"
                  value={age.months}
                  sub={age.months === 1 ? 'month old' : 'months old'}
                />
                <StatCard
                  label="Next Versary"
                  value={age.nextVersary.days === 0 ? '🎂' : `${age.nextVersary.days}d`}
                  sub={age.nextVersary.days === 0 ? 'today!' : `to ${age.nextVersary.ordinal}-mo mark`}
                />
                <StatCard
                  label="1-Year"
                  value={age.oneYear.reached ? '🎉' : `${age.oneYear.days}d`}
                  sub={age.oneYear.reached ? 'anniversary!' : 'until Jan 5'}
                />
                {milestoneCounts.filmsWatched > 0 && (
                  <StatCard
                    label="Films Watched"
                    value={milestoneCounts.filmsWatched}
                    sub="by you"
                    onClick={() => navigate('/films')}
                  />
                )}
                {milestoneCounts.avgScore != null && (
                  <StatCard
                    label="Your Avg Score"
                    value={milestoneCounts.avgScore.toFixed(2)}
                    sub="across your scores"
                  />
                )}
                {(milestoneCounts.reviews + milestoneCounts.comments) > 0 && (
                  <StatCard
                    label="Your Posts"
                    value={milestoneCounts.reviews + milestoneCounts.comments}
                    sub="reviews + comments"
                  />
                )}
              </div>
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
                  <ActivityRow key={item.key} item={item} user={usersById[item.userId]} onFilmPress={setSelectedMovie} isLast={i === arr.length - 1} />
                ))}
              </div>
              {activity.length > ACTIVITY_COLLAPSED_COUNT && (
                <button
                  ref={activityAnchorRef}
                  onClick={() => { if (activityExpanded) activityBeforeCollapse(); setActivityExpanded(prev => !prev) }}
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

        {/* Club Members strip — last section, no trailing margin (page paddingBottom clears the nav) */}
        <section className="mt-8" style={{ animation: 'fadeUp 0.5s 0.5s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Club Members
          </p>
          {loading ? (
            <div className="flex gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-14 h-14 rounded-full" />)}</div>
          ) : (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {users.map(u => {
                const nameParts = (u.name ?? '').split(' ')
                const displayName = nameParts.length >= 2
                  ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
                  : nameParts[0] ?? ''
                return (
                  <button
                    key={u.id}
                    onClick={() => openMember(u.id)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Avatar user={u} size={48} />
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
