import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ScoreModal from '../components/ScoreModal'

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

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />
}

function PosterCard({ movie, pending }) {
  const score = movie.historical_avg_score
  return (
    <div className="relative shrink-0 w-28 cursor-pointer">
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
              {Number(score).toFixed(1)}
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

function ActionCard({ movie, existingRating, onScorePress }) {
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

function StatCard({ label, value, sub }) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03] min-w-0">
      <p className="text-gray-600 uppercase mb-1.5 truncate" style={{ fontSize: '9px', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>{label}</p>
      <p className="text-white font-black leading-none mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}>{value}</p>
      {sub && <p className="text-gray-500 leading-tight line-clamp-2" style={{ fontSize: '10px' }}>{sub}</p>}
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeMovies, setActiveMovies] = useState([])
  const [allMovies, setAllMovies] = useState([])
  const [myRatings, setMyRatings] = useState([])

  // Score modal state
  const [modalMovie, setModalMovie] = useState(null)
  const [modalRating, setModalRating] = useState(null)

  const load = useCallback(async () => {
    if (!profile) return
    const [{ data: activeMonth }, { data: movies }, { data: ratings }] = await Promise.all([
      supabase.from('months').select('id').eq('status', 'active').maybeSingle(),
      supabase.from('movies_safe').select('id, month_id, title, poster_url, historical_avg_score'),
      supabase.from('ratings').select('movie_id, score').eq('user_id', profile.id),
    ])
    const active = movies?.filter(m => m.month_id === activeMonth?.id) ?? []
    setActiveMovies(active)
    setAllMovies(movies ?? [])
    setMyRatings(ratings ?? [])
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
    <div style={{ background: 'linear-gradient(180deg,#07080d 0%,#0a0b10 60%,#09090f 100%)', fontFamily: "'DM Sans',sans-serif", minHeight: '100vh', paddingBottom: '6rem', width: '100%', boxSizing: 'border-box' }}>

      {/* Single padded container — everything inside */}
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div className="mb-8" style={{ animation: 'fadeUp 0.5s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4b5563', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>
            {formatDate()}
          </p>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '3rem', color: 'white', lineHeight: 1, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            Movie Club
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            Welcome back, <span style={{ color: 'white', fontWeight: 500 }}>{firstName}</span>
          </p>
        </div>

        {/* Your Turn */}
        <section className="mb-8" style={{ animation: 'fadeUp 0.5s 0.1s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4b5563', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Your Turn
          </p>
          {loading ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : pendingFilms.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10">
              <span style={{ fontSize: '20px' }}>✓</span>
              <div>
                <p className="text-white text-sm font-medium">You're all caught up</p>
                <p className="text-gray-500 text-xs">All scores submitted for this month</p>
              </div>
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
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4b5563', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            May 2026
          </p>
          {loading ? (
            <div className="flex gap-3 overflow-hidden">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="shrink-0 w-28 rounded-lg" style={{ aspectRatio: '2/3' }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
              {activeMovies.map(m => <PosterCard key={m.id} movie={m} pending={!scoredIds.has(m.id)} />)}
            </div>
          )}
        </section>

        {/* Stats */}
        <section style={{ animation: 'fadeUp 0.5s 0.3s ease both' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#4b5563', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: '12px' }}>
            Club Stats
          </p>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Top Film" value={topFilm ? Number(topFilm.historical_avg_score).toFixed(1) : '—'} sub={topFilm?.title} />
              <StatCard label="Films" value={allMovies.length} sub="watched" />
              <StatCard label="Days" value={daysSince(FOUNDING)} sub="of club" />
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

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
