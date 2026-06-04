import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Phase 7 — film tags. Members tag a film with descriptive labels at rating time;
// tags display in aggregate (tag · count) on the film page. Backed by `film_tags`
// (one row per member+tag+film, RLS own-write). Used in two places:
//   • compact  — inside ScoreModal at rating time ("Tag this film")
//   • full     — in the film overlay (renders its own leading divider + "Tags" label)
// Self-contained: loads on mount, writes immediately, optimistic UI. Returns null
// when there's nothing to show and the viewer can't edit (keeps the overlay clean).

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'

// Curated suggestions — lower friction + nudge a shared vocabulary.
const SUGGESTED = [
  'slow burn', 'rewatchable', 'arthouse', 'mind-bending', 'feel-good',
  'tearjerker', 'visually stunning', 'underrated', 'overrated', 'funny',
  'violent', 'long',
]

// Normalize a raw tag so "Slow Burn " and "slow  burn" collapse to one tag.
function normalizeTag(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 30)
}

export default function FilmTags({ movieId, userId, canEdit = false, compact = false }) {
  const [rows, setRows] = useState(null) // null = loading
  const [input, setInput] = useState('')

  const load = useCallback(async () => {
    if (!movieId) return
    const { data } = await supabase
      .from('film_tags')
      .select('id, tag, user_id, users(email)')
      .eq('movie_id', movieId)
    // Test account must be invisible everywhere.
    setRows((data ?? []).filter(r => r.users?.email !== TEST_EMAIL))
  }, [movieId])

  useEffect(() => { load() }, [load])

  // Aggregate: tag -> { tag, count, mineId }
  const agg = new Map()
  for (const r of rows ?? []) {
    const cur = agg.get(r.tag) ?? { tag: r.tag, count: 0, mineId: null }
    cur.count += 1
    if (r.user_id === userId) cur.mineId = r.id
    agg.set(r.tag, cur)
  }
  const tags = [...agg.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  const mineSet = new Set(tags.filter(t => t.mineId).map(t => t.tag))

  async function addTag(raw) {
    const tag = normalizeTag(raw)
    if (!tag || mineSet.has(tag)) { setInput(''); return }
    const tmpId = `tmp-${tag}`
    setRows(prev => [...(prev ?? []), { id: tmpId, tag, user_id: userId, users: {} }])
    setInput('')
    const { data, error } = await supabase
      .from('film_tags')
      .insert({ movie_id: movieId, user_id: userId, tag })
      .select('id, tag, user_id')
      .single()
    if (error) {
      setRows(prev => (prev ?? []).filter(r => r.id !== tmpId)) // rollback
    } else if (data) {
      setRows(prev => (prev ?? []).map(r => (r.id === tmpId ? { ...data, users: {} } : r)))
    }
  }

  async function removeTag(tag) {
    const entry = agg.get(tag)
    if (!entry?.mineId) return
    setRows(prev => (prev ?? []).filter(r => !(r.tag === tag && r.user_id === userId)))
    await supabase.from('film_tags').delete().eq('id', entry.mineId)
  }

  if (rows === null) return null
  if (tags.length === 0 && !canEdit) return null

  const suggestions = SUGGESTED.filter(s => !mineSet.has(s)).slice(0, 8)
  const canSubmit = !!normalizeTag(input)

  return (
    <div>
      {/* Full variant draws its own leading divider + label so it never orphans. */}
      {!compact && (
        <>
          <div style={{ height: '1px', background: 'rgba(var(--fg-rgb), 0.06)', margin: '24px 0' }} />
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'rgba(var(--fg-rgb), 0.25)', margin: '0 0 10px',
          }}>
            Tags
          </p>
        </>
      )}
      {compact && (
        <p style={{
          fontFamily: "'DM Mono',monospace", color: 'var(--text-dim)', fontSize: '11px',
          textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px',
        }}>
          Tag this film (optional)
        </p>
      )}

      {/* Applied tags, aggregated with counts. Your own are accent-highlighted + removable. */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: canEdit ? '10px' : 0 }}>
          {tags.map(t => {
            const mine = !!t.mineId
            const removable = mine && canEdit
            return (
              <button
                key={t.tag}
                onClick={removable ? () => removeTag(t.tag) : undefined}
                title={removable ? 'Remove your tag' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '4px 9px', borderRadius: '999px',
                  border: `1px solid ${mine ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.12)'}`,
                  background: mine ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(var(--fg-rgb),0.04)',
                  color: mine ? 'var(--accent)' : 'var(--text-muted)',
                  fontFamily: "'DM Sans',sans-serif", fontSize: '12px',
                  cursor: removable ? 'pointer' : 'default',
                }}
              >
                <span>{t.tag}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', opacity: 0.7 }}>{t.count}</span>
                {removable && <span style={{ fontSize: '11px', opacity: 0.7 }}>✕</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Add UI — only when the viewer can edit (they've scored / are rating now). */}
      {canEdit && (
        <div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: suggestions.length ? '8px' : 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input) } }}
              placeholder="Add a tag…"
              maxLength={30}
              style={{
                flex: 1, minWidth: 0, boxSizing: 'border-box',
                padding: '8px 11px', borderRadius: '9px',
                background: 'rgba(var(--fg-rgb),0.05)', border: '1px solid rgba(var(--fg-rgb),0.12)',
                color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', outline: 'none',
              }}
            />
            <button
              onClick={() => addTag(input)}
              disabled={!canSubmit}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: '9px', border: 'none',
                background: canSubmit ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.08)',
                color: canSubmit ? 'var(--text-strong)' : 'var(--text-faint)',
                fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: '13px',
                cursor: canSubmit ? 'pointer' : 'default',
              }}
            >
              Add
            </button>
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => addTag(s)}
                  style={{
                    padding: '4px 9px', borderRadius: '999px',
                    border: '1px dashed rgba(var(--fg-rgb),0.18)', background: 'transparent',
                    color: 'var(--text-faint)', fontFamily: "'DM Sans',sans-serif", fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
