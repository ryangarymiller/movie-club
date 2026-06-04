import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useMemberStatsOverlay } from '../context/MemberStatsOverlayContext'
import { useMemberOverlay } from '../context/MemberOverlayContext'
import { useBackClose } from '../lib/useBackClose'
import { userColor } from '../lib/colors'
import { MeTab, firstLast, isZackPreApril } from '../pages/Stats'
import { FilmDetailOverlay } from '../pages/Films'

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'

// "#a855f7" -> "168, 85, 247" for the --accent-rgb token.
function hexToRgbTriple(hex) {
  if (!hex) return null
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  if ([r, g, b].some(x => Number.isNaN(x))) return null
  return `${r}, ${g}, ${b}`
}

export default function MemberStatsOverlay() {
  const { memberId, close } = useMemberStatsOverlay()
  const { openMember } = useMemberOverlay()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [visible, setVisible] = useState(false)

  // Back button closes this overlay (top-of-stack first).
  useBackClose(!!memberId, close)

  useEffect(() => {
    if (memberId) requestAnimationFrame(() => setVisible(true))
    else { setVisible(false); setData(null) }
  }, [memberId])

  // Load shared data + slice the member's ratings. Mirrors the Stats page loader.
  useEffect(() => {
    if (!memberId) return
    let alive = true
    ;(async () => {
      const [{ data: movies }, { data: ratings }, { data: users }, { data: months }, { data: guesses }] = await Promise.all([
        supabase.from('movies_safe').select('id, month_id, title, tmdb_id, poster_url, year_released, director, tmdb_cast, tmdb_writers, genre, scores_revealed, picker_revealed, picked_by_user_id, historical_avg_score, runtime_minutes'),
        supabase.from('ratings').select('id, movie_id, user_id, score, pre_watch_excitement, recommend_outside_club, submitted_at'),
        supabase.from('users').select('id, name, email, role, joined_at, is_active, user_color').eq('is_active', true),
        supabase.from('months').select('id, month_year'),
        supabase.from('picker_guesses').select('movie_id, guessed_user_id').eq('guessing_user_id', memberId),
      ])
      if (!alive) return
      const mById = {}; for (const m of (months ?? [])) mById[m.id] = m
      const fUsers = (users ?? []).filter(u => u.email !== TEST_EMAIL)
      const testId = (users ?? []).find(u => u.email === TEST_EMAIL)?.id ?? null
      const movieMY = {}; for (const m of (movies ?? [])) movieMY[m.id] = mById[m.month_id]?.month_year ?? null
      const uName = {}; for (const u of (users ?? [])) uName[u.id] = u.name
      const clean = (ratings ?? []).filter(r => {
        if (testId && r.user_id === testId) return false
        if (isZackPreApril(uName[r.user_id], movieMY[r.movie_id])) return false
        return true
      })
      setData({
        movies: movies ?? [],
        allRatings: clean,
        monthsById: mById,
        member: fUsers.find(u => u.id === memberId) ?? null,
        ratings: clean.filter(r => r.user_id === memberId),
        guesses: guesses ?? [],
      })
    })()
    return () => { alive = false }
  }, [memberId])

  // While open, override the app accent with the viewed member's colour so every
  // accent-driven chart renders in *their* colour. Restored on close.
  useEffect(() => {
    const col = data?.member ? userColor(data.member) : null
    if (!memberId || !col) return
    const root = document.documentElement.style
    const prevA = root.getPropertyValue('--accent')
    const prevRgb = root.getPropertyValue('--accent-rgb')
    root.setProperty('--accent', col)
    const rgb = hexToRgbTriple(col)
    if (rgb) root.setProperty('--accent-rgb', rgb)
    return () => {
      if (prevA) root.setProperty('--accent', prevA); else root.removeProperty('--accent')
      if (prevRgb) root.setProperty('--accent-rgb', prevRgb); else root.removeProperty('--accent-rgb')
    }
  }, [memberId, data?.member])

  if (!memberId) return null

  const member = data?.member
  const fname = member ? firstLast(member.name).split(' ')[0] : 'Member'
  const onFilm = (m) => { if (m) setSelectedMovie(m) }
  const onGenre = (g) => { if (g) { close(); navigate('/films?tab=All Films&genre=' + encodeURIComponent(g)) } }

  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90, // below the film overlay (100) it opens
        background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease',
      }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '1.25rem 1rem', background: 'rgba(var(--bg-rgb, 10,10,12), 0.85)',
        backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(var(--fg-rgb),0.06)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--hairline)', margin: '0 0 3px' }}>
            Member stats
          </p>
          <h1
            onClick={() => { if (member) { close(); openMember(member.id) } }}
            style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.9rem', letterSpacing: '0.03em', color: 'var(--accent)', margin: 0, lineHeight: 1, cursor: member ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {member ? `${fname}'s Stats` : 'Member Stats'}
          </h1>
        </div>
        <button
          onClick={close}
          aria-label="Close member stats"
          style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(var(--fg-rgb),0.12)', background: 'rgba(var(--fg-rgb),0.06)', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '1rem 1rem 6rem', maxWidth: '900px', margin: '0 auto', boxSizing: 'border-box' }}>
        <MeTab
          movies={data?.movies ?? []}
          ratings={data?.ratings ?? []}
          allRatings={data?.allRatings ?? []}
          guesses={data?.guesses ?? []}
          loading={!data}
          monthsById={data?.monthsById ?? {}}
          onFilm={onFilm}
          onGenre={onGenre}
          subject={{ name: fname, possessive: `${fname}'s` }}
        />
      </div>

      {/* Film overlay opened from within the stats (its z-index 100 sits above this 90). */}
      <FilmDetailOverlay movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
    </div>
  ), document.body)
}
