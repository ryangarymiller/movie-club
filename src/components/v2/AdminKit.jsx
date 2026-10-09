// Small visual primitives for the 2.0 admin cards — the same look as Admin.jsx's panels
// (DM Mono caps labels, rgba(var(--fg-rgb)) surfaces, accent primary buttons).

export const MONO = "'DM Mono',monospace"
export const SANS = "'DM Sans',sans-serif"

export function AdminCard({ children, as: Tag = 'section', style, ...rest }) {
  return (
    <Tag
      {...rest}
      style={{
        background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.08)',
        borderRadius: '12px', padding: '16px', marginBottom: '20px', ...style,
      }}
    >
      {children}
    </Tag>
  )
}

export function AdminLabel({ children, as: Tag = 'span', id, style }) {
  return (
    <Tag id={id} style={{ fontSize: '9px', letterSpacing: '0.14em', fontFamily: MONO, color: 'var(--text-faint)', textTransform: 'uppercase', margin: 0, fontWeight: 400, ...style }}>
      {children}
    </Tag>
  )
}

export function AdminHint({ children, style }) {
  return (
    <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '8px 0 12px', fontFamily: MONO, lineHeight: 1.5, ...style }}>
      {children}
    </p>
  )
}

export function Spinner({ size = 12 }) {
  return (
    <span
      aria-hidden="true"
      className="animate-spin"
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: '2px solid currentColor', borderRightColor: 'transparent', verticalAlign: '-2px',
      }}
    />
  )
}

const VARIANTS = {
  primary: { border: 'none', background: 'var(--accent)', color: 'var(--text-strong)' },
  secondary: { border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'transparent', color: 'var(--text-muted)' },
  danger: { border: '1px solid #7f1d1d', background: '#450a0a', color: '#f87171' },
}

/** A real <button> with busy (spinner + label) and disabled handling. */
export function AdminButton({ variant = 'primary', busy = false, busyLabel, disabled, children, small, style, ...rest }) {
  const off = disabled || busy
  return (
    <button
      type="button"
      {...rest}
      disabled={off}
      aria-busy={busy || undefined}
      style={{
        ...VARIANTS[variant],
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: small ? '5px 10px' : '9px 16px', borderRadius: small ? '6px' : '8px',
        fontSize: small ? '12px' : '13px', fontWeight: 500, fontFamily: SANS,
        cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.6 : 1, ...style,
      }}
    >
      {busy && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
}

/** Member chip used in the progress rosters. tone: done | waiting | absent | neutral. */
export function PersonChip({ name, tone = 'neutral', suffix }) {
  const tones = {
    done: { border: '1px solid rgba(var(--accent-rgb), 0.45)', background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--text-strong)' },
    waiting: { border: '1px dashed rgba(var(--fg-rgb), 0.25)', background: 'transparent', color: 'var(--text-muted)' },
    absent: { border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'rgba(var(--fg-rgb), 0.04)', color: 'var(--text-faint)', textDecoration: 'line-through' },
    neutral: { border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'rgba(var(--fg-rgb), 0.04)', color: 'var(--text)' },
  }
  const glyph = { done: '✓', waiting: '…', absent: '—', neutral: '' }[tone]
  return (
    <span style={{ ...tones[tone], display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontFamily: SANS }}>
      {glyph && <span aria-hidden="true">{glyph}</span>}
      <span>{name}</span>
      {suffix && <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-dim)' }}>{suffix}</span>}
    </span>
  )
}

/** Thin progress bar with an accessible label. */
export function ProgressBar({ value, max, label }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
      style={{ height: '6px', borderRadius: '999px', background: 'rgba(var(--fg-rgb), 0.08)', overflow: 'hidden', margin: '8px 0 12px' }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
    </div>
  )
}
