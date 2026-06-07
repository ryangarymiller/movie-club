import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Shown to the PICKER on their own active-month film once the club has vetoed it
// (movies.veto_resubmit_required = true, set by the veto-threshold trigger). Lets
// them swap the vetoed pick for a replacement: TMDB search → fetch fresh metadata
// → resubmit_vetoed_pick RPC (privileged swap; the picker has no direct UPDATE on
// movies). The RPC re-guards: caller is the picker, the film is flagged, no scores.
//
// Streaming providers are intentionally NOT passed — the film overlay's existing
// lazy provider fetch repopulates them on the post-resubmit refresh.

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"
const AMBER = '#fbbf24'
const RED = '#f87171'
const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN

const yearOf = (rd) => { const y = rd ? parseInt(String(rd).slice(0, 4), 10) : null; return Number.isFinite(y) ? y : null }

async function tmdbSearch(q) {
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&page=1`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } })
  if (!res.ok) throw new Error('tmdb')
  return (await res.json()).results ?? []
}

// Pull the full metadata we cache on a movie row from TMDB (credits appended).
async function tmdbDetails(tmdbId) {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=credits`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } })
  if (!res.ok) throw new Error('tmdb-detail')
  const d = await res.json()
  const crew = d.credits?.crew ?? []
  const cast = (d.credits?.cast ?? []).map(c => c.name).filter(Boolean)
  const writers = [...new Set(crew.filter(c => c.department === 'Writing').map(c => c.name).filter(Boolean))]
  return {
    year: d.release_date ? yearOf(d.release_date) : null,
    director: crew.find(c => c.job === 'Director')?.name ?? null,
    runtime: Number.isFinite(d.runtime) ? d.runtime : null,
    genre: d.genres?.map(g => g.name).join(', ') || null,
    plot: d.overview || null,
    cast: cast.length ? cast : null,
    writers: writers.length ? writers : null,
    vote_average: Number.isFinite(d.vote_average) ? d.vote_average : null,
    vote_count: Number.isFinite(d.vote_count) ? d.vote_count : null,
    popularity: Number.isFinite(d.popularity) ? d.popularity : null,
  }
}

export default function VetoResubmit({ movie, onResubmitted }) {
  const movieId = movie?.id || null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
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

  async function submit() {
    if (!selected || submitting || !movieId) return
    setSubmitting(true); setErr(null)
    // Best-effort fresh metadata; the swap still succeeds with the basics if TMDB fails.
    let meta = { year: yearOf(selected.release_date), director: null, runtime: null, genre: null, plot: selected.overview || null, cast: null, writers: null, vote_average: null, vote_count: null, popularity: null }
    try { meta = { ...meta, ...(await tmdbDetails(selected.id)) } } catch { /* keep basics */ }

    const { error } = await supabase.rpc('resubmit_vetoed_pick', {
      p_movie_id: movieId,
      p_tmdb_id: selected.id,
      p_title: selected.title,
      p_poster_url: selected.poster_path ?? null,
      p_year: meta.year,
      p_director: meta.director,
      p_runtime: meta.runtime,
      p_genre: meta.genre,
      p_plot: meta.plot,
      p_streaming: null,
      p_cast: meta.cast,
      p_writers: meta.writers,
      p_vote_average: meta.vote_average,
      p_vote_count: meta.vote_count,
      p_popularity: meta.popularity,
    })
    if (error) { setErr('Could not resubmit your pick. Try again.'); setSubmitting(false); return }
    setSubmitting(false); setOpen(false); setSelected(null); setQuery(''); setResults([])
    onResubmitted?.()
  }

  if (!movieId) return null

  return (
    <section
      aria-label="Resubmit vetoed pick"
      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: '14px', padding: '16px', maxWidth: '460px', marginBottom: '12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M12 3 1.5 21h21L12 3Z" stroke={AMBER} strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 10v4" stroke={AMBER} strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17.5" r="1.1" fill={AMBER} />
        </svg>
        <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: AMBER }}>
          Your pick was vetoed
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.45 }}>
        The club voted to veto <strong style={{ color: 'var(--text-strong)' }}>{movie.title}</strong>. Choose a replacement film for this slot — it swaps in immediately.
      </p>

      {open ? (
        selected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(var(--fg-rgb),0.04)', border: '1px solid rgba(var(--fg-rgb),0.1)', marginBottom: '10px' }}>
              <span style={{ flex: 1, fontFamily: SANS, fontSize: '13.5px', color: 'var(--text-strong)' }}>
                {selected.title}{selected.release_date ? ` (${yearOf(selected.release_date)})` : ''}
              </span>
              <button onClick={() => setSelected(null)} disabled={submitting} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: submitting ? 'default' : 'pointer', fontFamily: MONO, fontSize: '11px' }}>change</button>
            </div>
            {err && <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 10px' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={submit} disabled={submitting} style={{ flex: 1, padding: '11px', borderRadius: '11px', border: 'none', background: 'var(--accent)', color: 'var(--text-strong)', fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Swapping…' : 'Resubmit this pick'}
              </button>
              <button onClick={() => { setOpen(false); setSelected(null); setErr(null) }} disabled={submitting} style={{ padding: '11px 16px', borderRadius: '11px', border: '1px solid rgba(var(--fg-rgb),0.12)', background: 'rgba(var(--fg-rgb),0.05)', color: 'var(--text-strong)', fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: submitting ? 'default' : 'pointer' }}>Cancel</button>
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
        )
      ) : (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '11px', borderRadius: '11px', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.14)', color: AMBER, fontFamily: SANS, fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
          Choose a replacement pick
        </button>
      )}
    </section>
  )
}
