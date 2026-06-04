import { useNavigate } from 'react-router-dom'
import { useReadjustment } from '../context/ReadjustmentContext'

// Member-facing banner shown while a season's readjustment window is open.
// Links to that season's films so members can re-score them. Renders nothing
// when no window is open.
export default function ReadjustmentBanner({ style }) {
  const { openSeason } = useReadjustment()
  const navigate = useNavigate()
  if (!openSeason) return null

  const endsAt = openSeason.readjustment_ends_at ? new Date(openSeason.readjustment_ends_at) : null
  const endStr = endsAt
    ? endsAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <button
      onClick={() => navigate('/films?tab=By Season')}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: '12px',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: '14px',
        background: 'rgba(var(--accent-rgb), 0.1)',
        border: '1px solid rgba(var(--accent-rgb), 0.3)',
        cursor: 'pointer',
        fontFamily: "'DM Sans',sans-serif",
        ...style,
      }}
    >
      <span style={{ fontSize: '20px', flexShrink: 0 }}>🎚️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: 'var(--text-strong)', fontSize: '14px', fontWeight: 600 }}>
          {openSeason.name} readjustment is open
        </p>
        <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.4 }}>
          Update your scores for the season{endStr ? ` until ${endStr}` : ''} — they lock when it closes.
        </p>
      </div>
      <span style={{ color: 'var(--accent)', fontSize: '12px', fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
        Review →
      </span>
    </button>
  )
}
