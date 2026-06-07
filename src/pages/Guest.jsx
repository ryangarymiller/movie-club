import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Public, read-only guest experience. Reads ONLY the anon-safe guest_* views
// (revealed films, abbreviated member names, test account excluded) — never the
// base tables (RLS blocks anon there). Hides everything member-only: profiles,
// watchlists, draft queues, predictions, guesses.

if (!document.getElementById('mc-fonts')) {
  const link = document.createElement('link')
  link.id = 'mc-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const SANS = "'DM Sans', sans-serif"
const MONO = "'DM Mono', monospace"
const DISPLAY = "'Bebas Neue', sans-serif"
const IMG = 'https://image.tmdb.org/t/p'

function fmtScore(s) { return s != null ? Number(s).toFixed(2) : '—' }
function scoreColor(s) {
  if (s == null) return 'var(--text-faint)'
  if (s >= 8.5) return '#fbbf24'
  if (s >= 7) return '#86efac'
  if (s <= 4) return '#f87171'
  return 'var(--accent)'
}
// "2026-01" → "January 2026"
function monthLabel(my) {
  if (!my) return ''
  const [y, m] = String(my).split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[(m || 1) - 1]} ${y}`
}

export default function Guest() {
  const [films, setFilms] = useState([])
  const [scores, setScores] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      const [f, s, r] = await Promise.all([
        supabase.from('guest_films').select('*'),
        supabase.from('guest_scores').select('*'),
        supabase.from('guest_reviews').select('*').order('created_at', { ascending: true }),
      ])
      if (!alive) return
      if (f.error) { setError('Could not load films.'); setLoading(false); return }
      setFilms(f.data ?? [])
      setScores(s.data ?? [])
      setReviews(r.data ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // Group revealed films by month, newest month first.
  const byMonth = useMemo(() => {
    const groups = new Map()
    for (const f of films) {
      const key = f.month_year ?? '—'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(f)
    }
    return [...groups.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])))
  }, [films])

  const openFilm = films.find(f => f.id === openId) || null
  const openScores = useMemo(
    () => scores.filter(s => s.movie_id === openId).sort((a, b) => b.score - a.score),
    [scores, openId],
  )
  const openReviews = useMemo(() => reviews.filter(r => r.movie_id === openId), [reviews, openId])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0a)', color: 'var(--text)' }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '14px 16px', background: 'var(--surface, #141414)',
        borderBottom: '1px solid rgba(var(--fg-rgb, 255,255,255), 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '20px' }}>🎬</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: DISPLAY, fontSize: '1.35rem', letterSpacing: '0.04em', color: 'var(--text-strong)', margin: 0, lineHeight: 1 }}>Movie Club</p>
            <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-faint)', margin: '2px 0 0' }}>Guest view · read-only</p>
          </div>
        </div>
        <Link to="/login" style={{
          flexShrink: 0, padding: '8px 14px', borderRadius: '10px', textDecoration: 'none',
          border: '1px solid var(--accent)', background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent)',
          fontFamily: SANS, fontSize: '13px', fontWeight: 600,
        }}>Sign in</Link>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px 64px' }}>
        {loading ? (
          <p style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--text-dim)' }}>Loading films…</p>
        ) : error ? (
          <p style={{ fontFamily: MONO, fontSize: '12px', color: '#f87171' }}>{error}</p>
        ) : films.length === 0 ? (
          <p style={{ fontFamily: SANS, fontSize: '14px', color: 'var(--text-dim)' }}>No films have been revealed yet.</p>
        ) : (
          byMonth.map(([my, list]) => (
            <section key={my} style={{ marginBottom: '28px' }}>
              <h2 style={{ fontFamily: MONO, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-dim)', margin: '0 0 12px' }}>
                {monthLabel(my)}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '14px' }}>
                {list.map(f => (
                  <button key={f.id} onClick={() => setOpenId(f.id)} style={{
                    display: 'block', textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                  }}>
                    <div style={{ position: 'relative', aspectRatio: '2 / 3', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface-2, #1c1c1c)', border: '1px solid rgba(var(--fg-rgb,255,255,255),0.08)' }}>
                      {f.poster_url
                        ? <img src={`${IMG}/w342${f.poster_url}`} alt={f.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: DISPLAY, color: 'var(--text-faint)', fontSize: '1.5rem' }}>{f.title?.[0] ?? '?'}</div>}
                      {f.club_avg != null && (
                        <span style={{
                          position: 'absolute', top: '6px', right: '6px', fontFamily: DISPLAY, fontSize: '0.95rem', lineHeight: 1,
                          padding: '4px 7px', borderRadius: '7px', background: 'rgba(0,0,0,0.7)', color: scoreColor(f.club_avg), border: `1px solid ${scoreColor(f.club_avg)}`,
                        }}>{fmtScore(f.club_avg)}</span>
                      )}
                    </div>
                    <p style={{ fontFamily: SANS, fontSize: '12.5px', color: 'var(--text-strong)', margin: '7px 0 0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</p>
                    <p style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)', margin: '1px 0 0' }}>{f.year_released ?? ''}{f.picker_label ? ` · ${f.picker_label}` : ''}</p>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}

        <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '32px', lineHeight: 1.6 }}>
          A public, read-only view of a private club. Member names are abbreviated.<br />
          <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in</Link> to participate.
        </p>
      </main>

      {/* Film detail */}
      {openFilm && (
        <div
          className="mc-modal-backdrop"
          onClick={() => setOpenId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px' }}
        >
          <div
            className="mc-modal-panel"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '560px', background: 'var(--surface, #141414)', border: '1px solid rgba(var(--fg-rgb,255,255,255),0.1)', borderRadius: '16px', padding: '18px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpenId(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{ flexShrink: 0, width: '92px', aspectRatio: '2 / 3', borderRadius: '9px', overflow: 'hidden', background: 'var(--surface-2,#1c1c1c)' }}>
                {openFilm.poster_url && <img src={`${IMG}/w342${openFilm.poster_url}`} alt={openFilm.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: DISPLAY, fontSize: '1.7rem', letterSpacing: '0.02em', color: 'var(--text-strong)', margin: '0 0 4px', lineHeight: 1.05 }}>{openFilm.title}</h3>
                <p style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-dim)', margin: '0 0 8px' }}>
                  {[openFilm.year_released, openFilm.runtime_minutes ? `${openFilm.runtime_minutes} min` : null, openFilm.director].filter(Boolean).join(' · ')}
                </p>
                {openFilm.genre && <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>{openFilm.genre}</p>}
                {openFilm.club_avg != null && (
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: '1.5rem', color: scoreColor(openFilm.club_avg), lineHeight: 1 }}>{fmtScore(openFilm.club_avg)}</span>
                    <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)' }}>club avg</span>
                  </div>
                )}
              </div>
            </div>

            {openFilm.picker_label && (
              <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', margin: '14px 0 0' }}>
                Picked by <strong style={{ color: 'var(--text-strong)' }}>{openFilm.picker_label}</strong>
              </p>
            )}
            {openFilm.pick_justification && (
              <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', margin: '6px 0 0', lineHeight: 1.5 }}>“{openFilm.pick_justification}”</p>
            )}
            {openFilm.plot_summary && (
              <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.55 }}>{openFilm.plot_summary}</p>
            )}

            {/* Scores */}
            {openScores.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', margin: '0 0 8px' }}>Scores</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {openScores.map((s, i) => (
                    <div key={`${s.member_label}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '8px', background: 'rgba(var(--fg-rgb,255,255,255),0.03)' }}>
                      <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)' }}>{s.member_label}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: '1.1rem', color: scoreColor(s.score), lineHeight: 1 }}>{fmtScore(s.score)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {openReviews.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', margin: '0 0 8px' }}>Reviews</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {openReviews.map(r => (
                    <div key={r.id} style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(var(--fg-rgb,255,255,255),0.03)', border: '1px solid rgba(var(--fg-rgb,255,255,255),0.07)' }}>
                      <p style={{ fontFamily: SANS, fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 4px' }}>{r.author_label}</p>
                      <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center', margin: '18px 0 0' }}>
              <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in</Link> to score, review, and discuss.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
