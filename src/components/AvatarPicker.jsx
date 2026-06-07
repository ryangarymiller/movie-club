import { useState, useEffect } from 'react'
import { AVATAR_PACKS, avatarSrc } from '../lib/avatars'

// Avatar library picker. Grouped by pack, scrollable; selecting a tile calls
// onSelect(id); the "No avatar" tile calls onSelect(null) to fall back to initials.
export default function AvatarPicker({ currentId, color, onSelect, busy }) {
  const ring = color || 'var(--accent)'
  // Optimistic selection so the tile highlights INSTANTLY on tap, rather than
  // waiting for the DB save + profile refetch round-trip to update currentId.
  const [picked, setPicked] = useState(currentId ?? null)
  useEffect(() => { setPicked(currentId ?? null) }, [currentId])
  const choose = (id) => { setPicked(id); onSelect(id) }

  const tile = (selected, child, key, label, onClick) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      disabled={busy}
      style={{
        width: 50, height: 50, borderRadius: '50%', padding: 2, flexShrink: 0,
        border: selected ? `2px solid ${ring}` : '1px solid rgba(var(--fg-rgb),0.12)',
        background: selected ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--fg-rgb),0.04)',
        cursor: busy ? 'default' : 'pointer', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: selected ? `0 0 0 2px rgba(var(--accent-rgb),0.18)` : 'none',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    >
      {child}
    </button>
  )

  return (
    <div>
      <div style={{
        maxHeight: '440px', overflowY: 'auto', padding: '4px 2px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* No avatar (initials) */}
        <p style={packLabel}>No avatar</p>
        <div style={grid}>
          {tile(
            !picked,
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.1 }}>
              initials
            </span>,
            '__none__', 'No avatar (use initials)', () => choose(null),
          )}
        </div>

        {AVATAR_PACKS.map(pack => (
          <div key={pack.slug} style={{ marginTop: '14px' }}>
            <p style={packLabel}>{pack.name}</p>
            <div style={grid}>
              {pack.icons.map(ic => tile(
                ic.id === picked,
                <img src={avatarSrc(ic.id)} alt={ic.label} loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />,
                ic.id, ic.label, () => choose(ic.id),
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const packLabel = {
  fontFamily: "'DM Mono',monospace", fontSize: '9px', textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--text-faint)', margin: '0 0 8px',
}
const grid = { display: 'flex', flexWrap: 'wrap', gap: '8px' }
