// Shared presentational pieces for the 2.0 This Month screen. Token-only colours
// (var(--…)) so every theme mode + accent renders correctly.

import { posterUrl } from '../../lib/tmdb'

export const MONO = "'DM Mono',monospace"
export const SANS = "'DM Sans',sans-serif"
export const DISPLAY = "'Bebas Neue',sans-serif"

export function SectionLabel({ children, right = null, id }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', margin: '0 0 12px' }}>
      <h2 id={id} style={{
        fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0,
      }}>
        {children}
      </h2>
      {right}
    </div>
  )
}

export function Card({ children, style, accent = false, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      style={{
        borderRadius: '16px',
        background: accent ? 'rgba(var(--accent-rgb), 0.07)' : 'rgba(var(--fg-rgb), 0.025)',
        border: `1px solid ${accent ? 'rgba(var(--accent-rgb), 0.28)' : 'rgba(var(--fg-rgb), 0.07)'}`,
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function initials(title = '') {
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/** Poster with an initials fallback. `alt` is empty when the title is printed beside it. */
export function Poster({ path, title = '', width = 56, ratio = 1.5, size = 'w185', decorative = true, style }) {
  const src = posterUrl(path, size)
  const fixed = typeof width === 'number'
  return (
    <div style={{
      flexShrink: 0, width,
      height: fixed ? Math.round(width * ratio) : 'auto',
      aspectRatio: fixed ? undefined : `1 / ${ratio}`,
      borderRadius: fixed && width > 90 ? '12px' : '7px',
      overflow: 'hidden', background: 'var(--surface-2)', position: 'relative', ...style,
    }}>
      {src ? (
        <img
          src={src}
          alt={decorative ? '' : `Poster for ${title}`}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div aria-hidden="true" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: DISPLAY, color: 'rgba(var(--fg-rgb), 0.18)', fontSize: Math.max(10, width / 4) }}>{initials(title)}</span>
        </div>
      )}
    </div>
  )
}

const BUTTON_TONES = {
  primary: { background: 'var(--accent)', color: 'var(--text-strong)', border: 'none' },
  secondary: { background: 'transparent', color: 'var(--text-dim)', border: '1px solid rgba(var(--fg-rgb), 0.12)' },
  danger: { background: 'rgba(239,68,68,0.14)', color: '#f87171', border: 'none' },
  ghost: { background: 'transparent', color: 'var(--text-muted)', border: 'none' },
}

export function Button({ tone = 'primary', busy = false, disabled = false, children, style, size = 'md', ...rest }) {
  const t = BUTTON_TONES[tone] ?? BUTTON_TONES.primary
  const off = disabled || busy
  return (
    <button
      type="button"
      disabled={off}
      aria-busy={busy || undefined}
      style={{
        ...t,
        padding: size === 'sm' ? '7px 12px' : size === 'lg' ? '14px 18px' : '10px 14px',
        borderRadius: size === 'lg' ? '14px' : '10px',
        fontFamily: SANS, fontWeight: tone === 'primary' || tone === 'danger' ? 600 : 500,
        fontSize: size === 'sm' ? '12px' : size === 'lg' ? '15px' : '13px',
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.55 : 1,
        transition: 'opacity 0.15s ease, transform 0.12s ease',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Error box: a kind headline + the verbatim server message. Pass the output of friendlyError(). */
export function ErrorNote({ error, onDismiss }) {
  if (!error) return null
  return (
    <div role="alert" style={{
      padding: '10px 12px', borderRadius: '10px',
      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
      display: 'flex', gap: '10px', alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: SANS, color: '#f87171', fontSize: '13px', margin: 0, lineHeight: 1.45 }}>{error.headline}</p>
        {error.detail && error.detail !== error.headline && (
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: '4px 0 0', wordBreak: 'break-word' }}>
            {error.detail}
          </p>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error"
          style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px' }}>
          ×
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon = '🎬', title, children, style }) {
  return (
    <div style={{
      textAlign: 'center', padding: '28px 18px', borderRadius: '16px',
      border: '1px dashed rgba(var(--fg-rgb), 0.12)', ...style,
    }}>
      <div aria-hidden="true" style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
      <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '15px', margin: '0 0 4px' }}>{title}</p>
      {children && <div style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5 }}>{children}</div>}
    </div>
  )
}

export function Skeleton({ style }) {
  return <div className="animate-pulse" style={{ background: 'rgba(var(--fg-rgb), 0.05)', borderRadius: '10px', ...style }} />
}
