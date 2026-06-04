import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Phase 7 — private per-member lists rendered on a member's OWN profile:
//   • Watchlist   — films you want to watch (saved, unordered)
//   • Draft Queue — films you plan to PICK next, ranked (reorder up/down or drag)
// Both add films via a debounced TMDB search and are RLS-scoped to the owner.

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

async function tmdbSearch(query) {
  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&page=1`,
    { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } },
  )
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return (await res.json()).results ?? []
}

const yearOf = (release_date) => {
  const y = release_date ? parseInt(String(release_date).slice(0, 4), 10) : null
  return Number.isFinite(y) ? y : null
}

const POSTER = (path, w = 'w92') => (path ? `https://image.tmdb.org/t/p/${w}${path}` : null)

const LABEL = {
  fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text-faint)',
}

// ── Poster thumbnail (graceful fallback to initials) ─────────────────────────
function Poster({ path, title, w = 36, h = 52 }) {
  const url = POSTER(path)
  return (
    <div style={{ flexShrink: 0, width: w, height: h, borderRadius: '5px', overflow: 'hidden', background: 'var(--surface-2, rgba(var(--fg-rgb),0.06))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url ? (
        <img src={url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
      ) : (
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb),0.25)', fontSize: '12px' }}>
          {(title || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}
        </span>
      )}
    </div>
  )
}

// ── Debounced TMDB search → onAdd(film) ──────────────────────────────────────
function FilmSearchAdd({ onAdd, existingIds, placeholder }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const debounce = useRef(null)

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try { setResults((await tmdbSearch(query.trim())).slice(0, 8)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(debounce.current)
  }, [query])

  async function pick(r) {
    if (existingIds.has(r.id) || busyId) return
    setBusyId(r.id)
    try {
      await onAdd({ tmdb_id: r.id, title: r.title, poster_url: r.poster_path ?? null, year_released: yearOf(r.release_date) })
      setQuery(''); setResults([])
    } finally {
      setBusyId(null)
    }
  }

  const showDrop = query.trim().length >= 2
  return (
    <div style={{ position: 'relative', marginBottom: '12px' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px',
          background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.12)',
          color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', outline: 'none',
        }}
      />
      {showDrop && (
        <div style={{
          marginTop: '6px', borderRadius: '10px', overflow: 'hidden',
          background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
        }}>
          {searching && results.length === 0 ? (
            <p style={{ ...LABEL, padding: '12px 14px', margin: 0, textTransform: 'none' }}>Searching…</p>
          ) : results.length === 0 ? (
            <p style={{ ...LABEL, padding: '12px 14px', margin: 0, textTransform: 'none' }}>No films found.</p>
          ) : (
            results.map((r, i) => {
              const added = existingIds.has(r.id)
              return (
                <button
                  key={r.id}
                  onClick={() => pick(r)}
                  disabled={added || busyId === r.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
                    padding: '8px 12px', background: 'none',
                    borderBottom: i < results.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
                    border: 'none', cursor: added ? 'default' : 'pointer', opacity: added ? 0.5 : 1,
                  }}
                >
                  <Poster path={r.poster_path} title={r.title} w={30} h={44} />
                  <span style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans',sans-serif", fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}{r.release_date ? ` (${yearOf(r.release_date)})` : ''}
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: "'DM Mono',monospace", fontSize: '14px', color: added ? 'var(--text-faint)' : 'var(--accent)' }}>
                    {added ? '✓' : busyId === r.id ? '…' : '+'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function IconBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        flexShrink: 0, width: '26px', height: '26px', borderRadius: '7px',
        border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function EmptyState({ children }) {
  return (
    <div style={{ padding: '16px 14px', borderRadius: '12px', background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.06)' }}>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13px', color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
        {children}
      </p>
    </div>
  )
}

// ── Watchlist ────────────────────────────────────────────────────────────────
function WatchlistSection({ userId }) {
  const [items, setItems] = useState(null) // null = loading

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('watchlist')
      .select('id, tmdb_id, title, poster_url, year_released')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
  }, [userId])

  useEffect(() => { load() }, [load])

  async function add(film) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ...film })
      .select('id, tmdb_id, title, poster_url, year_released')
      .single()
    if (!error && data) setItems(prev => [data, ...(prev ?? [])])
  }

  async function remove(id) {
    setItems(prev => (prev ?? []).filter(i => i.id !== id))
    await supabase.from('watchlist').delete().eq('id', id)
  }

  const existingIds = new Set((items ?? []).map(i => i.tmdb_id))

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <span style={LABEL}>My Watchlist</span>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', color: 'var(--text-dim)', margin: '4px 0 12px' }}>
        Films you want to watch — private to you.
      </p>
      <FilmSearchAdd onAdd={add} existingIds={existingIds} placeholder="Search to add a film…" />
      {items === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Nothing saved yet. Search above to add films.</EmptyState>
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(var(--fg-rgb), 0.06)' }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', background: 'rgba(var(--fg-rgb), 0.02)', borderBottom: i < items.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none' }}>
              <Poster path={it.poster_url} title={it.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                {it.year_released && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{it.year_released}</p>}
              </div>
              <IconBtn onClick={() => remove(it.id)} title="Remove from watchlist">✕</IconBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Draft Queue (ranked) ─────────────────────────────────────────────────────
function DraftQueueSection({ userId }) {
  const [items, setItems] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('draft_queue')
      .select('id, tmdb_id, title, poster_url, year_released, position')
      .eq('user_id', userId)
      .order('position', { ascending: true })
    setItems(data ?? [])
  }, [userId])

  useEffect(() => { load() }, [load])

  // Persist the current order as position = index.
  async function persistOrder(ordered) {
    await Promise.all(ordered.map((it, i) =>
      it.position === i ? Promise.resolve() : supabase.from('draft_queue').update({ position: i }).eq('id', it.id),
    ))
  }

  function move(from, to) {
    setItems(prev => {
      if (!prev) return prev
      if (to < 0 || to >= prev.length) return prev
      const next = prev.slice()
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      const reindexed = next.map((it, i) => ({ ...it, position: i }))
      persistOrder(reindexed)
      return reindexed
    })
  }

  async function add(film) {
    const nextPos = (items ?? []).length
    const { data, error } = await supabase
      .from('draft_queue')
      .insert({ user_id: userId, position: nextPos, ...film })
      .select('id, tmdb_id, title, poster_url, year_released, position')
      .single()
    if (!error && data) setItems(prev => [...(prev ?? []), data])
  }

  async function remove(id) {
    setItems(prev => {
      const next = (prev ?? []).filter(i => i.id !== id).map((it, i) => ({ ...it, position: i }))
      persistOrder(next)
      return next
    })
    await supabase.from('draft_queue').delete().eq('id', id)
  }

  const existingIds = new Set((items ?? []).map(i => i.tmdb_id))

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <span style={LABEL}>Draft Queue</span>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', color: 'var(--text-dim)', margin: '4px 0 12px' }}>
        Films you’re planning to pick, ranked — drag the handle or use the arrows. Private to you.
      </p>
      <FilmSearchAdd onAdd={add} existingIds={existingIds} placeholder="Search to queue a pick idea…" />
      {items === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Your draft queue is empty. Queue up pick ideas above.</EmptyState>
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(var(--fg-rgb), 0.06)' }}>
          {items.map((it, i) => (
            <div
              key={it.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIdx != null && dragIdx !== i) move(dragIdx, i); setDragIdx(null) }}
              onDragEnd={() => setDragIdx(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px 9px 12px',
                background: dragIdx === i ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--fg-rgb), 0.02)',
                borderBottom: i < items.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
              }}
            >
              <span title="Drag to reorder" style={{ flexShrink: 0, cursor: 'grab', color: 'var(--text-faint)', fontSize: '14px', lineHeight: 1, userSelect: 'none' }}>⠿</span>
              <span style={{ flexShrink: 0, width: '18px', textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.05rem', color: 'var(--accent)' }}>{i + 1}</span>
              <Poster path={it.poster_url} title={it.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                {it.year_released && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{it.year_released}</p>}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <IconBtn onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up">▲</IconBtn>
                <IconBtn onClick={() => move(i, i + 1)} disabled={i === items.length - 1} title="Move down">▼</IconBtn>
                <IconBtn onClick={() => remove(it.id)} title="Remove from queue">✕</IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PersonalLists({ userId }) {
  if (!userId) return null
  return (
    <div>
      <WatchlistSection userId={userId} />
      <DraftQueueSection userId={userId} />
    </div>
  )
}
