// Add a film to this month's 2.0 list: debounced TMDB search (or a draft-queue quick
// pick) → enrich → optional "why this film" → submitFilm(). The server is the authority
// on the rules (2 per member, one submitter per film, deadline) — we show its message
// verbatim under a friendlier headline.

import { useEffect, useRef, useState } from 'react'
import { searchMovies, enrichFilm, metadataFor } from '../../lib/tmdb'
import { submitFilm } from '../../lib/v2'
import { clubWatchedBefore, friendlyError, genreText, loadDraftQueue } from './thisMonthHelpers'
import { Button, Card, ErrorNote, MONO, Poster, SANS, Skeleton } from './thisMonthUi'

const QUEUE_PREVIEW = 3
const MAX_RESULTS = 8

export default function AddFilmFlow({ monthId, profileId, liveSubmissions = [], onAdded, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [queue, setQueue] = useState([])
  const [queueExpanded, setQueueExpanded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [watchedBefore, setWatchedBefore] = useState(false)
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const seqRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    loadDraftQueue(profileId).then(q => { if (!cancelled) setQueue(q) })
    return () => { cancelled = true }
  }, [profileId])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // tmdb_id → whose it is, from the live list (user_id is only unmasked for your own rows).
  const onList = new Map(liveSubmissions.map(s => [Number(s.tmdb_id), s.user_id === profileId ? 'yours' : 'taken']))

  // Debounce in the change handler (not an effect) so "No films found" never flashes
  // mid-debounce and stale responses are dropped by sequence number.
  function handleQuery(e) {
    const q = e.target.value
    setQuery(q)
    setSearchError(null)
    clearTimeout(timerRef.current)
    const seq = ++seqRef.current
    if (!q.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await searchMovies(q)
        if (seq === seqRef.current) setResults(r.slice(0, MAX_RESULTS))
      } catch {
        if (seq === seqRef.current) { setResults([]); setSearchError('Film search is unavailable right now.') }
      } finally {
        if (seq === seqRef.current) setSearching(false)
      }
    }, 400)
  }

  async function choose(result) {
    setError(null)
    setEnriching(true)
    setSelected(null)
    setWatchedBefore(false)
    const [film, seen] = await Promise.all([enrichFilm(result), clubWatchedBefore(result.id).catch(() => false)])
    setSelected(film)
    setWatchedBefore(seen)
    setEnriching(false)
  }

  const chooseFromQueue = item => choose({
    id: item.tmdb_id, title: item.title, poster_path: item.poster_url,
    release_date: item.year_released ? `${item.year_released}-01-01` : null,
  })

  async function confirm() {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    try {
      await submitFilm(monthId, selected, metadataFor(selected, justification), justification)
      onAdded?.(selected)
    } catch (e) {
      setError(friendlyError(e.message))
      setSaving(false)
    }
  }

  // ── Step 2: confirm the chosen film ──
  if (enriching || selected) {
    if (enriching) {
      return (
        <Card style={{ padding: '14px' }} aria-busy="true" aria-label="Loading film details">
          <div style={{ display: 'flex', gap: '14px' }}>
            <Skeleton style={{ width: '64px', height: '96px' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton style={{ height: '18px', width: '70%' }} />
              <Skeleton style={{ height: '12px', width: '45%' }} />
              <Skeleton style={{ height: '40px' }} />
            </div>
          </div>
        </Card>
      )
    }
    const already = onList.get(Number(selected.tmdb_id))
    return (
      <Card style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          <Poster path={selected.poster_path} title={selected.title} width={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '16px', margin: '0 0 4px', lineHeight: 1.25 }}>
              {selected.title}
            </p>
            <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: '0 0 4px' }}>
              {[selected.year, selected.director, selected.runtime_minutes ? `${selected.runtime_minutes}m` : null].filter(Boolean).join(' · ')}
            </p>
            {selected.genre && (
              <p style={{ fontFamily: MONO, color: 'var(--hairline)', fontSize: '10px', margin: 0 }}>{genreText(selected.genre)}</p>
            )}
          </div>
        </div>
        {selected.plot_summary && (
          <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.55, margin: 0 }}>
            {selected.plot_summary}
          </p>
        )}
        {watchedBefore && (
          <p role="note" style={{
            fontFamily: SANS, color: '#fbbf24', fontSize: '12px', margin: 0, lineHeight: 1.45,
            padding: '9px 12px', borderRadius: '10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)',
          }}>
            The club has watched this one before. You can still submit it — it's just discouraged.
          </p>
        )}
        {already === 'taken' && (
          <p role="note" style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '12px', margin: 0 }}>
            Heads up: this film is already on the list, so it can't be added twice.
          </p>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Why this film? <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional · revealed with the film)</span>
          </span>
          <textarea
            value={justification}
            onChange={e => setJustification(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Sell it to the club…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: '10px',
              border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'rgba(var(--fg-rgb), 0.03)',
              color: 'var(--text-strong)', fontFamily: SANS, fontSize: '13px', lineHeight: 1.5, resize: 'vertical',
            }}
          />
        </label>
        <ErrorNote error={error} onDismiss={() => setError(null)} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button tone="secondary" style={{ flex: 1 }} disabled={saving} onClick={() => { setSelected(null); setError(null) }}>
            Back
          </Button>
          <Button style={{ flex: 2 }} busy={saving} onClick={confirm}>
            {saving ? 'Adding…' : already === 'yours' ? 'Update my submission' : 'Add to the list'}
          </Button>
        </div>
      </Card>
    )
  }

  // ── Step 1: find a film ──
  const shownQueue = queueExpanded ? queue : queue.slice(0, QUEUE_PREVIEW)
  return (
    <Card style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="v2-film-search" className="sr-only">Search for a film</label>
        <input
          id="v2-film-search"
          type="search"
          value={query}
          onChange={handleQuery}
          placeholder="Search for a film…"
          autoComplete="off"
          autoFocus
          style={{
            flex: 1, minWidth: 0, padding: '11px 13px', borderRadius: '10px',
            border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'rgba(var(--fg-rgb), 0.03)',
            color: 'var(--text-strong)', fontFamily: SANS, fontSize: '14px',
          }}
        />
        {onCancel && <Button tone="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
      </div>

      {queue.length > 0 && !query.trim() && (
        <div>
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>★ </span>From your draft queue
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(var(--accent-rgb), 0.22)', background: 'rgba(var(--accent-rgb), 0.04)' }}>
            {shownQueue.map((item, i) => (
              <ResultRow
                key={item.id}
                rank={i + 1}
                title={item.title}
                year={item.year_released}
                poster={item.poster_url}
                status={onList.get(Number(item.tmdb_id))}
                last={i === shownQueue.length - 1}
                onPick={() => chooseFromQueue(item)}
              />
            ))}
          </ul>
          {queue.length > QUEUE_PREVIEW && (
            <Button tone="ghost" size="sm" onClick={() => setQueueExpanded(v => !v)} aria-expanded={queueExpanded} style={{ marginTop: '4px' }}>
              {queueExpanded ? 'Show fewer' : `Show all ${queue.length}`}
            </Button>
          )}
        </div>
      )}

      <div aria-live="polite" aria-busy={searching}>
        {searching && <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: 0 }}>Searching…</p>}
        {searchError && <p style={{ fontFamily: SANS, color: '#f87171', fontSize: '12px', margin: 0 }}>{searchError}</p>}
        {!searching && !searchError && query.trim() && results.length === 0 && (
          <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>No films found for “{query.trim()}”.</p>
        )}
        {!searching && results.length > 0 && (
          <ul aria-label="Search results" style={{ listStyle: 'none', margin: 0, padding: 0, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(var(--fg-rgb), 0.07)' }}>
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                title={r.title}
                year={r.release_date?.slice(0, 4)}
                poster={r.poster_path}
                status={onList.get(Number(r.id))}
                last={i === results.length - 1}
                onPick={() => choose(r)}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function ResultRow({ rank, title, year, poster, status, last, onPick }) {
  const taken = status === 'taken'
  const tag = status === 'yours' ? 'Yours' : taken ? 'On the list' : null
  return (
    <li style={{ borderBottom: last ? 'none' : '1px solid rgba(var(--fg-rgb), 0.05)' }}>
      <button
        type="button"
        onClick={onPick}
        disabled={taken}
        aria-label={`${title}${year ? ` (${year})` : ''}${tag ? ` — ${tag.toLowerCase()}` : ''}`}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px',
          background: 'transparent', border: 'none', textAlign: 'left',
          cursor: taken ? 'not-allowed' : 'pointer', opacity: taken ? 0.5 : 1,
        }}
      >
        {rank != null && (
          <span aria-hidden="true" style={{ width: '14px', textAlign: 'center', fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1rem' }}>{rank}</span>
        )}
        <Poster path={poster} title={title} width={34} size="w92" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 500, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          <span style={{ display: 'block', fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px' }}>{year ?? ''}</span>
        </span>
        {tag ? (
          <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: status === 'yours' ? 'var(--accent-light)' : 'var(--text-faint)' }}>{tag}</span>
        ) : (
          <span aria-hidden="true" style={{ color: 'var(--text-dim)' }}>→</span>
        )}
      </button>
    </li>
  )
}
