import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { usePersonOverlay } from '../context/PersonOverlayContext'
import { useBackClose } from '../lib/useBackClose'
import { FilmDetailOverlay } from '../pages/Films'

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

// In-module cache of TMDB person lookups keyed by lowercased name, so reopening
// the same person (or re-rendering) never refetches.
const tmdbCache = new Map()

// Resolve a person name → TMDB bio/photo. Returns null on no match or error.
// Two calls: /search/person to get the id, then /person/{id} for the details.
async function fetchTmdbPerson(name) {
  const key = name.toLowerCase()
  if (tmdbCache.has(key)) return tmdbCache.get(key)
  if (!TMDB_TOKEN) { tmdbCache.set(key, null); return null }
  try {
    const headers = { Authorization: `Bearer ${TMDB_TOKEN}` }
    const searchResp = await fetch(
      `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&include_adult=false`,
      { headers }
    )
    if (!searchResp.ok) throw new Error('search failed')
    const searchData = await searchResp.json()
    const top = (searchData?.results ?? [])[0]
    if (!top?.id) { tmdbCache.set(key, null); return null }
    const detailResp = await fetch(
      `https://api.themoviedb.org/3/person/${top.id}`,
      { headers }
    )
    if (!detailResp.ok) throw new Error('detail failed')
    const d = await detailResp.json()
    const result = {
      id: d.id,
      biography: d.biography || '',
      birthday: d.birthday || null,
      placeOfBirth: d.place_of_birth || null,
      profilePath: d.profile_path || top.profile_path || null,
      knownFor: d.known_for_department || top.known_for_department || null,
    }
    tmdbCache.set(key, result)
    return result
  } catch {
    // Network/parse error → cache null so we don't hammer TMDB; filmography still shows.
    tmdbCache.set(key, null)
    return null
  }
}

// The club score to show on a filmography row — only once the film is revealed
// (mirrors displayAvg in Films.jsx). historical_avg_score is authoritative when set.
function filmScore(m) {
  if (m.scores_revealed && m.historical_avg_score != null) return Number(m.historical_avg_score)
  return null
}

export default function PersonOverlay() {
  const { person, close } = usePersonOverlay()
  const name = person?.name ?? null

  const [visible, setVisible] = useState(false)
  const [films, setFilms] = useState(null)   // null = loading
  const [tmdb, setTmdb] = useState(undefined) // undefined = loading, null = no match
  const [bioExpanded, setBioExpanded] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState(null)

  // Back button closes this overlay (top-of-stack first).
  useBackClose(!!name, close)

  // Fade in on open; reset on close.
  useEffect(() => {
    if (name) requestAnimationFrame(() => setVisible(true))
    else { setVisible(false); setFilms(null); setTmdb(undefined); setBioExpanded(false) }
  }, [name])

  // Load this person's in-club filmography: every film where they appear as
  // director (exact), a writer (array contains), or cast (array contains).
  // Three OR'd queries merged + de-duped by movie id (a person can hold multiple
  // roles on one film — e.g. writer-director).
  useEffect(() => {
    if (!name) return
    let alive = true
    setFilms(null)
    ;(async () => {
      const cols = 'id, month_id, title, tmdb_id, poster_url, year_released, director, tmdb_cast, tmdb_writers, genre, scores_revealed, picker_revealed, historical_avg_score, picked_by_user_id, runtime_minutes'
      const [dirRes, wrRes, castRes] = await Promise.all([
        supabase.from('movies_safe').select(cols).eq('director', name),
        supabase.from('movies_safe').select(cols).contains('tmdb_writers', [name]),
        supabase.from('movies_safe').select(cols).contains('tmdb_cast', [name]),
      ])
      if (!alive) return
      const byId = new Map()
      const add = (rows, role) => {
        for (const m of (rows ?? [])) {
          const existing = byId.get(m.id)
          if (existing) { if (!existing._roles.includes(role)) existing._roles.push(role) }
          else byId.set(m.id, { ...m, _roles: [role] })
        }
      }
      add(dirRes.data, 'Director')
      add(wrRes.data, 'Writer')
      add(castRes.data, 'Cast')
      // Sort newest first (by month_year would need a join; year_released is a good proxy).
      const list = [...byId.values()].sort((a, b) => (b.year_released ?? 0) - (a.year_released ?? 0))
      setFilms(list)
    })()
    return () => { alive = false }
  }, [name])

  // Enrich with a TMDB bio + photo (cached). Filmography renders regardless.
  useEffect(() => {
    if (!name) return
    let alive = true
    setTmdb(undefined)
    ;(async () => {
      const result = await fetchTmdbPerson(name)
      if (alive) setTmdb(result)
    })()
    return () => { alive = false }
  }, [name])

  if (!name) return null

  // Role label for the header: TMDB's known_for_department, else inferred from
  // their in-club roles (Director / Writer / Cast).
  const inClubRoles = films ? [...new Set(films.flatMap(f => f._roles))] : []
  const roleLabel = (tmdb && tmdb.knownFor) || (inClubRoles.length ? inClubRoles.join(' · ') : null)
  const photoUrl = tmdb?.profilePath ? `https://image.tmdb.org/t/p/w185${tmdb.profilePath}` : null

  const bio = tmdb?.biography || ''
  const BIO_PREVIEW = 320
  const bioIsLong = bio.length > BIO_PREVIEW
  const bioShown = bioExpanded || !bioIsLong ? bio : bio.slice(0, BIO_PREVIEW).trimEnd() + '…'

  const fmtBirth = () => {
    if (!tmdb) return null
    const parts = []
    if (tmdb.birthday) {
      try {
        parts.push(new Date(tmdb.birthday + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
      } catch { parts.push(tmdb.birthday) }
    }
    if (tmdb.placeOfBirth) parts.push(tmdb.placeOfBirth)
    return parts.length ? parts.join(' · ') : null
  }
  const birthLine = fmtBirth()

  const labelStyle = { fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--hairline)' }

  return createPortal((
    <div
      className="mc-modal-backdrop"
      // Above the film overlay (z100) so a person opened from a film sits on top of
      // it; Back then closes the person and reveals the film underneath.
      style={{ zIndex: 120, background: 'rgba(0,0,0,0.72)', opacity: visible ? 1 : 0, transition: 'opacity 0.18s ease' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="mc-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} — film person`}
        style={{ position: 'relative', background: 'var(--bg)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '18px', maxWidth: '560px', width: '100%' }}
      >
        <button
          onClick={close}
          aria-label="Close person details"
          style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, width: '32px', height: '32px', borderRadius: '999px', border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}
        >
          ✕
        </button>

        <div style={{ padding: '1.5rem 1.25rem 2rem' }}>
          {/* ── HEADER ── */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', paddingRight: '40px', marginBottom: '18px' }}>
            {photoUrl && (
              <img
                src={photoUrl}
                alt={name}
                style={{ flexShrink: 0, width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover', background: 'var(--surface-2)', border: '1px solid rgba(var(--fg-rgb),0.08)' }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ ...labelStyle, margin: '0 0 4px' }}>Film person</p>
              <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2rem', letterSpacing: '0.02em', color: 'var(--text)', margin: 0, lineHeight: 1.02 }}>
                {name}
              </h1>
              {roleLabel && (
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12.5px', color: 'var(--accent)', margin: '5px 0 0' }}>
                  {roleLabel}
                </p>
              )}
              {birthLine && (
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', color: 'var(--text-faint)', margin: '3px 0 0' }}>
                  {birthLine}
                </p>
              )}
            </div>
          </div>

          {/* ── TMDB BIO ── */}
          {tmdb === undefined ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 18px' }}>Loading bio…</p>
          ) : bio ? (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-line' }}>
                {bioShown}
              </p>
              {bioIsLong && (
                <button
                  onClick={() => setBioExpanded(v => !v)}
                  style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontFamily: "'DM Mono',monospace", fontSize: '11px', letterSpacing: '0.04em', cursor: 'pointer' }}
                >
                  {bioExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          ) : null}

          {/* ── IN-CLUB FILMOGRAPHY ── */}
          <p style={{ ...labelStyle, margin: '0 0 10px' }}>In the club</p>
          {films === null ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12.5px', color: 'var(--text-faint)', margin: 0 }}>Loading filmography…</p>
          ) : films.length === 0 ? (
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12.5px', color: 'var(--text-faint)', margin: 0 }}>
              No club films found for {name}.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {films.map(m => {
                const score = filmScore(m)
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMovie(m)}
                    aria-label={`Open ${m.title}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left',
                      padding: '8px', borderRadius: '12px',
                      background: 'rgba(var(--fg-rgb), 0.03)',
                      border: '1px solid rgba(var(--fg-rgb), 0.07)',
                      color: 'var(--text)', cursor: 'pointer',
                    }}
                  >
                    <div style={{ flexShrink: 0, width: '40px', aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)' }}>
                      {m.poster_url && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${m.poster_url}`}
                          alt={m.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', fontWeight: 500, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title}
                      </p>
                      <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10.5px', color: 'var(--text-faint)', margin: '3px 0 0', letterSpacing: '0.03em' }}>
                        {m.year_released ? `${m.year_released} · ` : ''}{m._roles.join(' · ')}
                      </p>
                    </div>
                    {score != null && (
                      <span style={{ flexShrink: 0, fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                        {score.toFixed(2)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Film overlay opened from a filmography row — rides above this person overlay
          (FilmDetailOverlay uses its own backdrop). Back closes it first. */}
      <FilmDetailOverlay movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
    </div>
  ), document.body)
}
