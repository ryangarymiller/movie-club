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
const WATCHLIST_PREVIEW = 3 // films shown collapsed; the rest reveal on "Show all"

function WatchlistSection({ userId, queueTmdbIds, onAddToQueue }) {
  const [items, setItems] = useState(null) // null = loading
  const [expanded, setExpanded] = useState(false) // false = preview (first few)
  const [sortDesc, setSortDesc] = useState(false) // false = least recent (curated order) first

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('watchlist')
      .select('id, tmdb_id, title, poster_url, year_released')
      .eq('user_id', userId)
      // Ascending so the list keeps its curated order with new adds at the bottom.
      .order('created_at', { ascending: true })
    setItems(data ?? [])
  }, [userId])

  useEffect(() => { load() }, [load])

  async function add(film) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ...film })
      .select('id, tmdb_id, title, poster_url, year_released')
      .single()
    // Append — newly added films land at the bottom (matches the ascending order).
    if (!error && data) setItems(prev => [...(prev ?? []), data])
  }

  async function remove(id) {
    setItems(prev => (prev ?? []).filter(i => i.id !== id))
    await supabase.from('watchlist').delete().eq('id', id)
  }

  const existingIds = new Set((items ?? []).map(i => i.tmdb_id))
  const list = items ?? []
  const count = list.length
  const hasMore = count > WATCHLIST_PREVIEW
  // Rows load created_at-ascending (curated order), so reversing gives most-recent
  // first — no re-query needed.
  const ordered = sortDesc ? [...list].reverse() : list
  // Collapsed shows the first few; expanded shows all. The add box stays visible
  // either way, so you can add a film without expanding the whole list.
  const visible = expanded ? ordered : ordered.slice(0, WATCHLIST_PREVIEW)

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* Header — label + count on the left, a date-added sort toggle on the right
          (no full collapse, so the add box and the preview are always reachable). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={LABEL}>My Watchlist</span>
        {items !== null && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: 'var(--text-faint)' }}>· {count}</span>}
        {count > 1 && (
          <button
            onClick={() => setSortDesc(s => !s)}
            title="Sort by date added"
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '4px 9px', borderRadius: '999px', cursor: 'pointer',
              background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
              color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace",
              fontSize: '10px', letterSpacing: '0.04em', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '11px' }}>⇅</span>
            {sortDesc ? 'Most recent' : 'Least recent'}
          </button>
        )}
      </div>

      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', color: 'var(--text-dim)', margin: '0 0 12px' }}>
        Films you want to watch — private to you.
      </p>
      <FilmSearchAdd onAdd={add} existingIds={existingIds} placeholder="Search to add a film…" />

      {items === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : count === 0 ? (
        <EmptyState>Nothing saved yet. Search above to add films.</EmptyState>
      ) : (
        <>
          <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(var(--fg-rgb), 0.06)' }}>
            {visible.map((it, i) => {
              const queued = queueTmdbIds?.has(it.tmdb_id)
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', background: 'rgba(var(--fg-rgb), 0.02)', borderBottom: i < visible.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none' }}>
                  <Poster path={it.poster_url} title={it.title} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                    {it.year_released && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{it.year_released}</p>}
                  </div>
                  {/* Add to draft queue (or show it's already queued) */}
                  <button
                    onClick={() => !queued && onAddToQueue?.({ tmdb_id: it.tmdb_id, title: it.title, poster_url: it.poster_url, year_released: it.year_released })}
                    disabled={queued}
                    title={queued ? 'Already in your draft queue' : 'Add to draft queue'}
                    style={{
                      flexShrink: 0, padding: '5px 10px', borderRadius: '999px',
                      border: `1px solid ${queued ? 'rgba(var(--fg-rgb),0.12)' : 'var(--accent)'}`,
                      background: queued ? 'transparent' : 'rgba(var(--accent-rgb),0.1)',
                      color: queued ? 'var(--text-faint)' : 'var(--accent)',
                      fontFamily: "'DM Mono',monospace", fontSize: '10px', letterSpacing: '0.04em',
                      cursor: queued ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {queued ? '✓ Queued' : '+ Queue'}
                  </button>
                  <IconBtn onClick={() => remove(it.id)} title="Remove from watchlist">✕</IconBtn>
                </div>
              )
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                width: '100%', marginTop: '8px', padding: '8px', background: 'none',
                border: 'none', cursor: 'pointer', fontFamily: "'DM Mono',monospace",
                fontSize: '11px', letterSpacing: '0.04em', color: 'var(--accent)',
              }}
            >
              {expanded ? 'Show less' : `Show all ${count}`}
              <span style={{ fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Draft Queue (ranked) — presentational; state is owned by PersonalLists ────
function DraftQueueSection({ items, onAdd, onRemove, onMove }) {
  // Pointer-based "lift and follow" drag (works on touch, unlike native HTML5
  // drag). The grabbed row tracks the finger continuously via translateY; the
  // other rows slide to open a gap; the target slot is the grabbed row's origin
  // shifted by whole row-heights (so it snaps once you pass the half-row
  // threshold). The data only reorders on release — keeping the drag smooth.
  const containerRef = useRef(null)
  const [drag, setDrag] = useState(null) // { id, from, startY, dy, over, rowH }

  function handlePointerDown(e, idx) {
    const rows = Array.from(containerRef.current?.children ?? [])
    const rowH = rows[idx]?.getBoundingClientRect().height ?? 56
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* unsupported */ }
    setDrag({ id: items[idx].id, from: idx, startY: e.clientY, dy: 0, over: idx, rowH })
  }
  function handlePointerMove(e) {
    setDrag(d => {
      if (!d) return d
      const dy = e.clientY - d.startY
      let over = d.from + Math.round(dy / d.rowH)
      over = Math.max(0, Math.min(items.length - 1, over))
      return { ...d, dy, over }
    })
  }
  function handlePointerUp(e) {
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    setDrag(d => {
      if (d && d.over !== d.from) onMove(d.from, d.over)
      return null
    })
  }

  // How far row i should shift while a drag is in flight (opens the gap).
  function rowShift(i) {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    if (drag.over > drag.from && i > drag.from && i <= drag.over) return -drag.rowH
    if (drag.over < drag.from && i < drag.from && i >= drag.over) return drag.rowH
    return 0
  }

  const existingIds = new Set((items ?? []).map(i => i.tmdb_id))

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <span style={LABEL}>Draft Queue</span>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11.5px', color: 'var(--text-dim)', margin: '4px 0 12px' }}>
        Films you’re planning to pick, ranked — drag the handle or use the arrows. Private to you.
      </p>
      <FilmSearchAdd onAdd={onAdd} existingIds={existingIds} placeholder="Search to queue a pick idea…" />
      {items === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Your draft queue is empty. Queue up pick ideas above.</EmptyState>
      ) : (
        <div ref={containerRef} style={{ borderRadius: '12px', border: '1px solid rgba(var(--fg-rgb), 0.06)', position: 'relative' }}>
          {items.map((it, i) => {
            const dragging = drag?.id === it.id
            return (
            <div
              key={it.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px 9px 12px',
                background: dragging ? 'rgba(var(--accent-rgb), 0.14)' : 'rgba(var(--fg-rgb), 0.02)',
                borderBottom: i < items.length - 1 ? '1px solid rgba(var(--fg-rgb), 0.05)' : 'none',
                borderRadius: i === 0 ? '12px 12px 0 0' : i === items.length - 1 ? '0 0 12px 12px' : 0,
                transform: `translateY(${rowShift(i)}px)`,
                transition: dragging ? 'none' : 'transform 0.16s ease, background 0.12s ease',
                position: 'relative',
                zIndex: dragging ? 5 : 1,
                boxShadow: dragging ? '0 8px 24px rgba(0,0,0,0.45)' : 'none',
              }}
            >
              <span
                title="Drag to reorder"
                onPointerDown={e => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  flexShrink: 0, cursor: 'grab', color: 'var(--text-faint)', fontSize: '16px',
                  lineHeight: 1, userSelect: 'none', touchAction: 'none', padding: '6px 4px',
                }}
              >
                ⠿
              </span>
              <span style={{ flexShrink: 0, width: '18px', textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.05rem', color: 'var(--accent)' }}>{i + 1}</span>
              <Poster path={it.poster_url} title={it.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                {it.year_released && <p style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{it.year_released}</p>}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <IconBtn onClick={() => onMove(i, i - 1)} disabled={i === 0} title="Move up">▲</IconBtn>
                <IconBtn onClick={() => onMove(i, i + 1)} disabled={i === items.length - 1} title="Move down">▼</IconBtn>
                <IconBtn onClick={() => onRemove(it.id)} title="Remove from queue">✕</IconBtn>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PersonalLists({ userId }) {
  // Draft-queue state lives here so the watchlist can push films into it and the
  // queue reflects the change immediately.
  const [queue, setQueue] = useState(null)

  const loadQueue = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('draft_queue')
      .select('id, tmdb_id, title, poster_url, year_released, position')
      .eq('user_id', userId)
      .order('position', { ascending: true })
    setQueue(data ?? [])
  }, [userId])

  useEffect(() => { loadQueue() }, [loadQueue])

  async function persistOrder(ordered) {
    await Promise.all(ordered.map((it, i) =>
      it.position === i ? Promise.resolve() : supabase.from('draft_queue').update({ position: i }).eq('id', it.id),
    ))
  }

  function move(from, to) {
    setQueue(prev => {
      if (!prev) return prev
      if (to < 0 || to >= prev.length || from === to) return prev
      const next = prev.slice()
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      const reindexed = next.map((it, i) => ({ ...it, position: i }))
      persistOrder(reindexed)
      return reindexed
    })
  }

  async function addToQueue(film) {
    if ((queue ?? []).some(q => q.tmdb_id === film.tmdb_id)) return // no dupes
    const nextPos = (queue ?? []).length
    const { data, error } = await supabase
      .from('draft_queue')
      .insert({ user_id: userId, position: nextPos, tmdb_id: film.tmdb_id, title: film.title, poster_url: film.poster_url ?? null, year_released: film.year_released ?? null })
      .select('id, tmdb_id, title, poster_url, year_released, position')
      .single()
    if (!error && data) setQueue(prev => [...(prev ?? []), data])
  }

  async function removeFromQueue(id) {
    setQueue(prev => {
      const next = (prev ?? []).filter(i => i.id !== id).map((it, i) => ({ ...it, position: i }))
      persistOrder(next)
      return next
    })
    await supabase.from('draft_queue').delete().eq('id', id)
  }

  if (!userId) return null

  const queueTmdbIds = new Set((queue ?? []).map(q => q.tmdb_id))

  return (
    <div>
      <WatchlistSection userId={userId} queueTmdbIds={queueTmdbIds} onAddToQueue={addToQueue} />
      <DraftQueueSection items={queue} onAdd={addToQueue} onRemove={removeFromQueue} onMove={move} />
    </div>
  )
}
