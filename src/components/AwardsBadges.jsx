// AwardsBadges.jsx
// Reusable collapsible grid of award badges used on Profile and the film overlay.
// Award object shape (from src/lib/awards.js):
//   { key, label, emoji, scope, period, periodRef, movieId?, userId?, pickerUserId?, metric? }
//
// Props:
//   awards        {array}    — array of award records
//   onAwardClick  {function} — called with the award object when a badge is clicked
//   title         {string}   — section heading (default "Awards")
//   collapsedCount{number}   — how many badges to show before "Show all" (default 6)
//   loading       {boolean}  — show skeleton tiles while data loads (default false)

import { useState } from 'react'

// ── Scope → human label ───────────────────────────────────────────────────────
function scopeLabel(scope) {
  switch (scope) {
    case 'monthly':  return 'Monthly'
    case 'season':   return 'Season'
    case 'annual':   return 'Annual'
    case 'alltime':  return 'All-Time'
    default:         return scope ?? ''
  }
}

// ── Scope → gold/silver/bronze accent color ───────────────────────────────────
function scopeGoldLevel(scope) {
  switch (scope) {
    case 'alltime':  return '#fbbf24' // gold
    case 'annual':   return '#d4a853' // warm gold
    case 'season':   return '#94a3b8' // silver-ish
    default:         return null       // monthly — use accent
  }
}

// ── Single badge ──────────────────────────────────────────────────────────────
function Badge({ award, onClick }) {
  const [hovered, setHovered] = useState(false)
  const goldColor = scopeGoldLevel(award.scope)
  const accentColor = goldColor ?? 'var(--accent)'
  const accentRgb = goldColor ? null : 'var(--accent-rgb)'

  const borderColor = hovered
    ? accentColor
    : goldColor
      ? `${goldColor}55`
      : 'rgba(var(--fg-rgb), 0.1)'

  const bgColor = hovered
    ? goldColor
      ? `${goldColor}18`
      : `rgba(var(--accent-rgb), 0.08)`
    : goldColor
      ? `${goldColor}0a`
      : 'rgba(var(--fg-rgb), 0.03)'

  // Period display: show period and optionally scope prefix if period doesn't already include scope
  const periodLine = award.period
    ? award.metric
      ? `${award.period} · ${award.metric}`
      : award.period
    : scopeLabel(award.scope)

  return (
    <button
      onClick={() => onClick(award)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={`${award.label} — ${periodLine}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 10px 12px',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        background: bgColor,
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'background 0.15s, border-color 0.15s, transform 0.12s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        outline: 'none',
      }}
    >
      {/* Emblem */}
      <span
        style={{
          fontSize: '28px',
          lineHeight: 1,
          filter: hovered ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' : 'none',
          transition: 'filter 0.15s',
        }}
        aria-hidden="true"
      >
        {award.emoji}
      </span>

      {/* Label */}
      <p
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-strong)',
          margin: 0,
          lineHeight: 1.25,
          wordBreak: 'break-word',
        }}
      >
        {award.label}
      </p>

      {/* Period / metric */}
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '9px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: goldColor
            ? goldColor
            : accentRgb
              ? `rgba(var(--accent-rgb), 0.8)`
              : 'var(--text-dim)',
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {periodLine}
      </p>
    </button>
  )
}

// ── Skeleton tile (same size as a badge) ─────────────────────────────────────
function SkeletonBadge() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(var(--fg-rgb), 0.07)',
        background: 'rgba(var(--fg-rgb), 0.03)',
        width: '100%',
        boxSizing: 'border-box',
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    >
      {/* emblem placeholder */}
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(var(--fg-rgb), 0.08)' }} />
      {/* label placeholder */}
      <div style={{ width: '72%', height: 10, borderRadius: 4, background: 'rgba(var(--fg-rgb), 0.07)' }} />
      {/* period placeholder */}
      <div style={{ width: '52%', height: 8, borderRadius: 4, background: 'rgba(var(--fg-rgb), 0.05)' }} />
    </div>
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function ToggleButton({ expanded, total, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '10px',
        padding: '7px 16px',
        borderRadius: '20px',
        border: '1px solid rgba(var(--fg-rgb), 0.1)',
        background: 'rgba(var(--fg-rgb), 0.04)',
        color: 'var(--text-muted)',
        fontFamily: "'DM Mono', monospace",
        fontSize: '11px',
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
        outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.1)'
        e.currentTarget.style.color = 'var(--accent)'
        e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(var(--fg-rgb), 0.04)'
        e.currentTarget.style.color = 'var(--text-muted)'
        e.currentTarget.style.borderColor = 'rgba(var(--fg-rgb), 0.1)'
      }}
    >
      <span style={{ fontSize: '13px' }}>{expanded ? '▲' : '▼'}</span>
      {expanded ? 'Show less' : `Show all (${total})`}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AwardsBadges({
  awards = [],
  onAwardClick,
  title = 'Awards',
  collapsedCount = 6,
  loading = false,
}) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = (award) => {
    if (typeof onAwardClick === 'function') onAwardClick(award)
  }

  const shown = expanded ? awards : awards.slice(0, collapsedCount)
  const hasMore = awards.length > collapsedCount

  // Number of skeleton tiles to show while loading (match collapsedCount, max 6)
  const skeletonCount = Math.min(collapsedCount, 6)

  // Grid style — responsive, auto-fill columns at ~150px each
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
    // Reserve a minimum height equal to one row so the page doesn't shift on load.
    // One badge row is approximately 110px; this prevents a large shift.
    minHeight: loading || awards.length === 0 ? '120px' : undefined,
    alignContent: 'start',
  }

  return (
    <div style={{ width: '100%' }}>
      {/* ── Header row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        {!loading && awards.length > 0 && (
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.08em',
              color: 'var(--text-faint)',
            }}
          >
            {awards.length} award{awards.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Grid area ── */}
      {loading ? (
        <div style={gridStyle}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonBadge key={i} />
          ))}
        </div>
      ) : awards.length === 0 ? (
        <div
          style={{
            ...gridStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
            border: '1px dashed rgba(var(--fg-rgb), 0.1)',
            background: 'rgba(var(--fg-rgb), 0.02)',
          }}
        >
          <p
            style={{
              color: 'var(--text-faint)',
              fontSize: '13px',
              fontFamily: "'DM Sans', sans-serif",
              margin: 0,
              padding: '16px',
              textAlign: 'center',
            }}
          >
            No awards yet
          </p>
        </div>
      ) : (
        <>
          <div style={gridStyle}>
            {shown.map((award, i) => (
              <Badge
                key={`${award.scope}-${award.key}-${award.periodRef ?? i}`}
                award={award}
                onClick={handleClick}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ToggleButton
                expanded={expanded}
                total={awards.length}
                collapsedCount={collapsedCount}
                onToggle={() => setExpanded(e => !e)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
