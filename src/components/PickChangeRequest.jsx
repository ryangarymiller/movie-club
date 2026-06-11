import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Member-facing "request a different pick" (for a locked active-month pick, only
// while the film has no scores — the admin enforces that on approval) + an admin
// approval panel. Mirrors ScoreChangeRequest.

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"
const GREEN = '#86efac'
const AMBER = '#fbbf24'
const RED = '#f87171'
const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'
const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

const STATUS_META = {
  pending: { label: 'Pending', color: AMBER, fill: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)' },
  approved: { label: 'Approved', color: GREEN, fill: 'rgba(134,239,172,0.12)', border: 'rgba(134,239,172,0.4)' },
  denied: { label: 'Denied', color: RED, fill: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.35)' },
}

function Label({ children }) {
  return <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>{children}</span>
}
function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'var(--text-muted)', fill: 'rgba(var(--fg-rgb),0.05)', border: 'rgba(var(--fg-rgb),0.12)' }
  return <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: m.color, background: m.fill, border: `1px solid ${m.border}`, borderRadius: '999px', padding: '3px 9px', lineHeight: 1 }}>{m.label}</span>
}
const yearOf = (rd) => { const y = rd ? parseInt(String(rd).slice(0, 4), 10) : null; return Number.isFinite(y) ? y : null }

async function tmdbSearch(q) {
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&page=1`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } })
  if (!res.ok) throw new Error('tmdb')
  return (await res.json()).results ?? []
}

// ============================================================
// Member-facing: request a different pick for this (locked) film
// ============================================================
export function PickChangeRequestButton({ movie, currentUserId }) {
  const movieId = movie?.id || null
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const debounce = useRef(null)

  const load = useCallback(async () => {
    if (!movieId || !currentUserId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('pick_change_requests')
      .select('id, requested_title, status, admin_note, created_at')
      .eq('movie_id', movieId).eq('user_id', currentUserId)
      .order('created_at', { ascending: false }).limit(1)
    setLatest(data && data.length ? data[0] : null)
    setLoading(false)
  }, [movieId, currentUserId])

  useEffect(() => { load() }, [load])

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

  async function submit() {
    if (!selected || submitting) return
    setSubmitting(true); setErr(null)
    const { error } = await supabase.from('pick_change_requests').insert({
      movie_id: movieId, user_id: currentUserId,
      requested_tmdb_id: selected.id, requested_title: selected.title,
      requested_poster_url: selected.poster_path ?? null, requested_year: yearOf(selected.release_date),
      reason: reason.trim() || null,
    })
    if (error) { setErr('Could not submit your request. Try again.'); setSubmitting(false); return }
    setSubmitting(false); setOpen(false); setSelected(null); setQuery(''); setReason('')
    await load()
  }

  if (!movieId || loading) return null

  const card = { background: 'var(--surface-2)', border: '1px solid rgba(var(--fg-rgb),0.1)', borderRadius: '14px', padding: '16px' }
  const hasPending = latest?.status === 'pending'

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <Label>Change this pick</Label>
        {latest && <StatusPill status={latest.status} />}
      </div>
      <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
        This month is active, so your pick is locked. You can request to swap it for a different film — an admin can approve only while no one has scored it yet.
      </p>

      {latest && (
        <div style={{ background: (STATUS_META[latest.status] || {}).fill, border: `1px solid ${(STATUS_META[latest.status] || {}).border}`, borderRadius: '10px', padding: '11px 12px', marginBottom: '12px' }}>
          <div style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', lineHeight: 1.45 }}>
            {hasPending && <>Request to change to <strong style={{ color: 'var(--text-strong)' }}>{latest.requested_title}</strong> is pending admin approval.</>}
            {latest.status === 'approved' && <>Your change to <strong style={{ color: 'var(--text-strong)' }}>{latest.requested_title}</strong> was approved.</>}
            {latest.status === 'denied' && <>Your request for <strong style={{ color: 'var(--text-strong)' }}>{latest.requested_title}</strong> was denied.</>}
          </div>
          {latest.admin_note && <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', fontStyle: 'italic' }}>Admin note: {latest.admin_note}</div>}
        </div>
      )}

      {!hasPending && (open ? (
        <div>
          {selected ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)', marginBottom: '10px' }}>
                <span style={{ flex: 1, fontFamily: SANS, fontSize: '13.5px', color: 'var(--text-strong)' }}>
                  {selected.title}{selected.release_date ? ` (${yearOf(selected.release_date)})` : ''}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: MONO, fontSize: '11px' }}>change</button>
              </div>
              <textarea
                value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="Reason for the swap (optional)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', fontFamily: SANS, fontSize: '13px', color: 'var(--text-strong)', background: 'rgba(var(--fg-rgb),0.05)', border: '1px solid rgba(var(--fg-rgb),0.12)', resize: 'vertical', marginBottom: '10px' }}
              />
              {err && <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 10px' }}>{err}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: '11px', borderRadius: '11px', border: 'none', background: 'var(--accent)', color: 'var(--text-strong)', fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Submitting…' : 'Submit request'}
                </button>
                <button onClick={() => { setOpen(false); setSelected(null) }} disabled={submitting} style={{ padding: '11px 16px', borderRadius: '11px', border: '1px solid rgba(var(--fg-rgb),0.12)', background: 'rgba(var(--fg-rgb),0.05)', color: 'var(--text-strong)', fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <input
                value={query} onChange={e => setQuery(e.target.value)} autoFocus
                placeholder="Search for the new film…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: '11px', fontFamily: SANS, fontSize: '14px', color: 'var(--text-strong)', background: 'rgba(var(--fg-rgb),0.05)', border: '1px solid rgba(var(--fg-rgb),0.12)', outline: 'none', marginBottom: '8px' }}
              />
              {query.trim().length >= 2 && (
                <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(var(--fg-rgb),0.1)', marginBottom: '10px' }}>
                  {searching && results.length === 0 ? (
                    <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-dim)', padding: '12px', margin: 0 }}>Searching…</p>
                  ) : results.length === 0 ? (
                    <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-dim)', padding: '12px', margin: 0 }}>No films found.</p>
                  ) : results.map((r, i) => (
                    <button key={r.id} onClick={() => { setSelected(r); setResults([]); setQuery('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid rgba(var(--fg-rgb),0.06)' : 'none', cursor: 'pointer', fontFamily: SANS, fontSize: '13px', color: 'var(--text)' }}>
                      {r.title}{r.release_date ? ` (${yearOf(r.release_date)})` : ''}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setOpen(false)} style={{ width: '100%', padding: '10px', borderRadius: '11px', border: '1px solid rgba(var(--fg-rgb),0.12)', background: 'rgba(var(--fg-rgb),0.05)', color: 'var(--text-muted)', fontFamily: SANS, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '11px', borderRadius: '11px', border: '1px solid rgba(var(--fg-rgb),0.12)', background: 'rgba(var(--fg-rgb),0.05)', color: 'var(--text-strong)', fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
          Request a different pick
        </button>
      ))}
    </section>
  )
}

// ============================================================
// Admin: pending pick-change requests with approve/deny
// ============================================================
export function PickChangeRequestsAdminPanel() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('pick_change_requests')
      .select('id, requested_tmdb_id, requested_title, requested_poster_url, requested_year, reason, status, created_at, movie_id, user_id, users:user_id ( name, email ), movies:movie_id ( title, month_id )')
      .eq('status', 'pending').order('created_at', { ascending: true })
    setRequests(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => requests.filter(r => (r.users?.email || '').toLowerCase() !== TEST_EMAIL), [requests])

  async function approve(req) {
    if (busyId) return
    setBusyId(req.id); setActionError(null)
    try {
      // Guard: only swap while the film has zero scores (admin can read all).
      const { count } = await supabase.from('ratings').select('id', { count: 'exact', head: true })
        .eq('movie_id', req.movie_id).not('score', 'is', null)
      if ((count ?? 0) > 0) {
        setActionError(`Can't approve — "${req.movies?.title}" already has ${count} score${count === 1 ? '' : 's'}. Changing it now would orphan them.`)
        setBusyId(null); return
      }
      // Fetch fresh metadata for the new film, then swap the movie row wholesale.
      // genre must be a text[] (the column is an array — a joined string fails),
      // and the credits we already fetch populate cast/writers/vote stats so the
      // swapped film keeps its Connection Web / Cast & Crew data.
      let meta = {
        year_released: req.requested_year ?? null, director: null, runtime_minutes: null,
        genre: null, plot_summary: null, streaming_providers: null,
        tmdb_cast: null, tmdb_writers: null, tmdb_vote_average: null, tmdb_vote_count: null, tmdb_popularity: null,
      }
      try {
        const [detRes, provRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/${req.requested_tmdb_id}?append_to_response=credits`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }),
          fetch(`https://api.themoviedb.org/3/movie/${req.requested_tmdb_id}/watch/providers`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }),
        ])
        if (detRes.ok) {
          const d = await detRes.json()
          meta = {
            year_released: d.release_date ? parseInt(d.release_date.slice(0, 4), 10) : (req.requested_year ?? null),
            director: d.credits?.crew?.find(c => c.job === 'Director')?.name ?? null,
            runtime_minutes: d.runtime ?? null,
            genre: (d.genres ?? []).map(g => g.name),
            plot_summary: d.overview ?? null,
            streaming_providers: null,
            tmdb_cast: (d.credits?.cast ?? []).map(c => c.name).filter(Boolean),
            tmdb_writers: [...new Set((d.credits?.crew ?? []).filter(c => c.department === 'Writing').map(c => c.name).filter(Boolean))],
            tmdb_vote_average: d.vote_average ?? null,
            tmdb_vote_count: d.vote_count ?? null,
            tmdb_popularity: d.popularity ?? null,
          }
        }
        if (provRes.ok) {
          const us = (await provRes.json())?.results?.US ?? null
          if (us) meta.streaming_providers = { flatrate: us.flatrate ?? [], rent: us.rent ?? [], buy: us.buy ?? [], link: us.link ?? null }
        }
      } catch { /* fall back to the basic metadata */ }

      const { error: mvErr } = await supabase.from('movies').update({
        title: req.requested_title, tmdb_id: req.requested_tmdb_id, poster_url: req.requested_poster_url,
        year_released: meta.year_released, director: meta.director, runtime_minutes: meta.runtime_minutes,
        genre: meta.genre, plot_summary: meta.plot_summary, streaming_providers: meta.streaming_providers,
        pick_justification: null,
        tmdb_cast: meta.tmdb_cast, tmdb_writers: meta.tmdb_writers,
        tmdb_vote_average: meta.tmdb_vote_average, tmdb_vote_count: meta.tmdb_vote_count, tmdb_popularity: meta.tmdb_popularity,
      }).eq('id', req.movie_id)
      if (mvErr) { setActionError('Could not swap the film. No changes were made.'); setBusyId(null); return }

      await supabase.from('pick_change_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', req.id)
    } catch {
      setActionError('Something went wrong approving the request.')
    }
    setBusyId(null); await load()
  }

  async function deny(req) {
    if (busyId) return
    const note = window.prompt('Optional note to the member (leave blank to skip):', '')
    if (note === null) return
    setBusyId(req.id); setActionError(null)
    await supabase.from('pick_change_requests').update({ status: 'denied', admin_note: note.trim() || null, resolved_at: new Date().toISOString() }).eq('id', req.id)
    setBusyId(null); await load()
  }

  const card = { background: 'var(--surface-2)', border: '1px solid rgba(var(--fg-rgb),0.1)', borderRadius: '14px', padding: '16px' }
  if (loading) return <section style={card}><Label>Pick Change Requests</Label><p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '10px 0 0' }}>Loading…</p></section>

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <Label>Pick Change Requests</Label>
        <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>{visible.length} pending</span>
      </div>
      {actionError && <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 12px' }}>{actionError}</p>}
      {visible.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>No pending pick change requests.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visible.map(req => {
            const isBusy = busyId === req.id
            return (
              <li key={req.id} style={{ background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)', borderRadius: '12px', padding: '12px' }}>
                <div style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '6px' }}>{req.users?.name || 'Unknown member'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SANS, fontSize: '13px', color: 'var(--text)', marginBottom: req.reason ? '8px' : '12px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{req.movies?.title || 'Current pick'}</span>
                  <span style={{ color: 'var(--text-faint)', fontFamily: MONO }}>→</span>
                  <strong style={{ color: 'var(--text-strong)' }}>{req.requested_title}{req.requested_year ? ` (${req.requested_year})` : ''}</strong>
                </div>
                {req.reason && <div style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.08)', borderRadius: '10px', padding: '9px 11px', marginBottom: '12px', lineHeight: 1.45 }}>{req.reason}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => approve(req)} disabled={isBusy || !!busyId} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(134,239,172,0.4)', background: 'rgba(134,239,172,0.12)', color: GREEN, fontFamily: SANS, fontWeight: 600, fontSize: '13px', cursor: isBusy || busyId ? 'not-allowed' : 'pointer', opacity: busyId && !isBusy ? 0.5 : 1 }}>{isBusy ? 'Working…' : 'Approve'}</button>
                  <button onClick={() => deny(req)} disabled={isBusy || !!busyId} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.1)', color: RED, fontFamily: SANS, fontWeight: 600, fontSize: '13px', cursor: isBusy || busyId ? 'not-allowed' : 'pointer', opacity: busyId && !isBusy ? 0.5 : 1 }}>{isBusy ? 'Working…' : 'Deny'}</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default PickChangeRequestButton
