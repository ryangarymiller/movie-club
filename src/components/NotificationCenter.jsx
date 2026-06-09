import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import { useBackClose, releaseGuardForNavigation } from '../lib/useBackClose'

// ─────────────────────────────────────────────────────────────────────────────
// In-app notification center.
//
//   <NotificationBell />  → a bell icon + unread badge that opens a panel.
//     · Desktop (≥ md): a popover anchored to the bell (sidebar).
//     · Mobile  (< md): a full-width bottom sheet using the global modal classes.
//
// Aesthetic: this reads like a film bulletin / call sheet — a condensed "Bulletin"
// marquee header, DM Mono reel-code timestamps, a per-type glyph, and unread rows
// flagged with an accent rail + tinted wash instead of a generic blue dot. Theme
// tokens only, so light + dark both land.
// ─────────────────────────────────────────────────────────────────────────────

// Relative time — same ladder as Home.jsx's timeAgo, kept in sync here so the
// notification center is self-contained.
function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.floor((Date.now() - then) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// Per-type presentation. Glyphs are emoji so they read instantly without bundling
// an icon set; copy is a short fallback label when a row has no title.
const TYPE_META = {
  scores_revealed: { glyph: '🎬', fallback: 'Scores revealed' },
  month_reveal:    { glyph: '🎭', fallback: 'The month is revealed' },
  month_active:    { glyph: '📅', fallback: 'A new month is live' },
  reply:           { glyph: '💬', fallback: 'New reply' },
  mention:         { glyph: '@',  fallback: 'You were mentioned' },
  score_change:    { glyph: '✏️', fallback: 'Score change' },
  late_score:      { glyph: '⏰', fallback: 'A late score came in' },
  pick_change:     { glyph: '🎬', fallback: 'Pick change' },
  veto:            { glyph: '🚫', fallback: 'Your pick was vetoed' },
}
const DEFAULT_META = { glyph: '🔔', fallback: 'Notification' }

function metaFor(type) {
  return TYPE_META[type] ?? DEFAULT_META
}

// ─── Bell icon (matches the line-icon language used in AppLayout nav) ──────────

function BellGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

// ─── A single notification row ─────────────────────────────────────────────────

function NotificationRow({ n, onOpen, onMarkRead, isLast }) {
  const meta = metaFor(n.type)
  const unread = !n.read_at
  const [hover, setHover] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Clicking a row EXPANDS it in place (and marks it read) rather than navigating
  // away + closing the bulletin — so a long notification's full text is readable.
  // The "Open" button inside the expanded row is what navigates.
  function handleClick() {
    if (unread) onMarkRead?.(n.id)
    setExpanded(e => !e)
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        textAlign: 'left',
        borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb),0.07)',
      }}
    >
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '11px',
        width: '100%',
        textAlign: 'left',
        padding: '13px 16px 13px 18px',
        border: 'none',
        // Unread wash is accent-tinted via a layered linear-gradient: the accent
        // overlay sits at low opacity over a neutral base, so it reads correctly
        // for every accent token without needing an --accent-rgb triple.
        background: unread
          ? 'linear-gradient(0deg, color-mix(in srgb, var(--accent) 9%, transparent), color-mix(in srgb, var(--accent) 9%, transparent)), rgba(var(--fg-rgb),0.02)'
          : hover
            ? 'rgba(var(--fg-rgb),0.04)'
            : 'transparent',
        cursor: 'pointer',
        fontFamily: "'DM Sans',sans-serif",
        transition: 'background 120ms ease',
      }}
    >
      {/* Accent rail for unread */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: '10px',
          bottom: '10px',
          width: '3px',
          borderRadius: '0 3px 3px 0',
          background: unread ? 'var(--accent)' : 'transparent',
        }}
      />
      {/* Type glyph */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: n.type === 'mention' ? '16px' : '15px',
          fontWeight: n.type === 'mention' ? 700 : 400,
          borderRadius: '9px',
          background: 'rgba(var(--fg-rgb),0.05)',
          border: '1px solid rgba(var(--fg-rgb),0.06)',
          color: n.type === 'mention' ? 'var(--accent)' : undefined,
          fontFamily: n.type === 'mention' ? "'DM Mono',monospace" : undefined,
          lineHeight: 1,
        }}
      >
        {meta.glyph}
      </span>

      {/* Text */}
      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: '13.5px',
              lineHeight: 1.3,
              fontWeight: unread ? 600 : 500,
              color: unread ? 'var(--text-strong)' : 'var(--text)',
              overflow: 'hidden',
              textOverflow: expanded ? 'clip' : 'ellipsis',
              whiteSpace: expanded ? 'normal' : 'nowrap',
            }}
          >
            {n.title || meta.fallback}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: '10px',
              color: 'var(--text-dim)',
              fontFamily: "'DM Mono',monospace",
              whiteSpace: 'nowrap',
            }}
          >
            {timeAgo(n.created_at)}
          </span>
        </span>
        {n.body && (
          <span
            style={{
              display: expanded ? 'block' : '-webkit-box',
              WebkitLineClamp: expanded ? 'none' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginTop: '3px',
              fontSize: '12px',
              lineHeight: 1.4,
              color: 'var(--text-muted)',
            }}
          >
            {n.body}
          </span>
        )}
      </span>
    </button>
    {/* Expanded: a button to actually navigate to the linked page (and close). */}
    {expanded && n.link && (
      <div style={{ padding: '0 16px 12px 61px' }}>
        <button
          type="button"
          onClick={() => onOpen?.(n)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '6px 12px', borderRadius: '999px',
            border: '1px solid var(--accent)', background: 'rgba(var(--accent-rgb),0.1)',
            color: 'var(--accent)', fontFamily: "'DM Mono',monospace", fontSize: '11px', cursor: 'pointer',
          }}
        >
          Open →
        </button>
      </div>
    )}
    </div>
  )
}

// ─── Panel body (shared between popover + sheet) ───────────────────────────────

function PanelInner({ notifications, unreadCount, loading, onActivate, onMarkRead, onMarkAll, onClose, variant }) {
  return (
    <>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: variant === 'sheet' ? '16px 16px 12px' : '14px 16px 11px',
          borderBottom: '1px solid rgba(var(--fg-rgb),0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', minWidth: 0 }}>
          <h2
            style={{
              fontFamily: "'Bebas Neue',sans-serif",
              fontSize: variant === 'sheet' ? '1.7rem' : '1.45rem',
              letterSpacing: '0.04em',
              color: 'var(--text-strong)',
              margin: 0,
              lineHeight: 1,
            }}
          >
            Bulletin
          </h2>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: "'DM Mono',monospace",
                color: 'var(--accent)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'DM Mono',monospace",
                fontSize: '11px',
                color: 'var(--text-dim)',
                padding: '4px 6px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              Mark all read
            </button>
          )}
          {variant === 'sheet' && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '999px',
                border: '1px solid rgba(var(--fg-rgb),0.12)',
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                fontSize: '14px',
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div
        style={{
          overflowY: 'auto',
          // Sheet: flex-fill the capped-height panel (min-height:0 lets a flex
          // child actually scroll). Popover: a simple max-height cap.
          ...(variant === 'sheet'
            ? { flex: 1, minHeight: 0, paddingBottom: 'env(safe-area-inset-bottom)' }
            : { maxHeight: '60vh' }),
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {loading && notifications.length === 0 ? (
          <div style={{ padding: '14px 16px' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: '46px',
                  marginBottom: '8px',
                  borderRadius: '10px',
                  background: 'rgba(var(--fg-rgb),0.04)',
                  animation: 'mcNotifPulse 1.4s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: '38px 24px 42px',
              textAlign: 'center',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <div style={{ fontSize: '26px', marginBottom: '10px', opacity: 0.7 }} aria-hidden="true">📭</div>
            <p
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: "'Bebas Neue',sans-serif",
                letterSpacing: '0.05em',
              }}
            >
              You&rsquo;re all caught up
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-dim)' }}>
              New activity will show up here.
            </p>
          </div>
        ) : (
          notifications.map((n, i) => (
            <NotificationRow
              key={n.id}
              n={n}
              onOpen={onActivate}
              onMarkRead={onMarkRead}
              isLast={i === notifications.length - 1}
            />
          ))
        )}
      </div>
    </>
  )
}

// ─── The bell + its panel ──────────────────────────────────────────────────────

export default function NotificationBell({ className = '', style }) {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  // Drag-to-dismiss for the mobile sheet's grab handle.
  const [sheetDragY, setSheetDragY] = useState(0)
  const dragStartRef = useRef(null)

  // Android/browser Back closes the notifications popover/sheet instead of navigating.
  useBackClose(open, () => setOpen(false))

  // Close the desktop popover on outside-click / Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function activate(n) {
    markRead(n.id)
    setOpen(false)
    if (n.link) {
      // Release the back-guard and REPLACE the guard history entry with the
      // destination. Otherwise closing the bulletin does a history.back() that
      // reverts this navigation, so "Open" looked like it did nothing.
      releaseGuardForNavigation()
      navigate(n.link, { replace: true })
    }
  }

  const badge = unreadCount > 0 && (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '-3px',
        right: '-4px',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        borderRadius: '999px',
        background: 'var(--accent)',
        color: '#fff',
        fontFamily: "'DM Mono',monospace",
        fontSize: '9.5px',
        fontWeight: 700,
        lineHeight: '16px',
        textAlign: 'center',
        boxShadow: '0 0 0 2px var(--bg)',
        boxSizing: 'border-box',
      }}
    >
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  )

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '11px',
          border: '1px solid rgba(var(--fg-rgb),0.08)',
          background: open ? 'rgba(var(--fg-rgb),0.07)' : 'var(--surface)',
          color: open || unreadCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'background 120ms ease, color 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--fg-rgb),0.07)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? 'rgba(var(--fg-rgb),0.07)' : 'var(--surface)' }}
      >
        <BellGlyph />
        {badge}
      </button>

      {open && (
        <>
          {/* ── Desktop: anchored popover (md and up) ── */}
          <div
            className="mc-notif-popover"
            role="dialog"
            aria-label="Notifications"
            style={{
              position: 'absolute',
              zIndex: 70,
              width: '360px',
              maxWidth: 'calc(100vw - 24px)',
              background: 'var(--surface)',
              border: '1px solid rgba(var(--fg-rgb),0.1)',
              borderRadius: '16px',
              boxShadow: '0 18px 48px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(var(--fg-rgb),0.02)',
              overflow: 'hidden',
              animation: 'mcNotifPop 140ms cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            <PanelInner
              notifications={notifications}
              unreadCount={unreadCount}
              loading={loading}
              onActivate={activate}
              onMarkRead={markRead}
              onMarkAll={markAllRead}
              onClose={() => setOpen(false)}
              variant="popover"
            />
          </div>

          {/* ── Mobile: full-width bottom sheet (below md) ── */}
          <div
            className="mc-modal-backdrop mc-notif-sheet"
            // Override the generic modal backdrop for a bottom sheet: no padding
            // (so the panel sits flush to the bottom — otherwise the 0.75rem gap
            // shows dark backdrop beneath it) and no backdrop scroll/rubber-band
            // (only the inner list scrolls).
            style={{ zIndex: 80, background: 'rgba(0,0,0,0.6)', alignItems: 'flex-end', padding: 0, overflowY: 'hidden', overscrollBehavior: 'contain' }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          >
            <div
              className="mc-modal-panel"
              role="dialog"
              aria-label="Notifications"
              style={{
                background: 'var(--surface)',
                border: '1px solid rgba(var(--fg-rgb),0.1)',
                borderRadius: '20px 20px 0 0',
                maxWidth: '560px',
                margin: '0 auto',
                overflow: 'hidden',
                // Flex column capped to the visible viewport so the inner list is a
                // real scroll area (dvh, not vh — vh overshoots on mobile and pushed
                // the list below the screen with no way to scroll to it).
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '85dvh',
                transform: sheetDragY ? `translateY(${sheetDragY}px)` : undefined,
                transition: sheetDragY ? 'none' : 'transform 0.22s ease',
                animation: sheetDragY ? 'none' : 'mcNotifSheet 200ms cubic-bezier(0.16,1,0.3,1) both',
              }}
            >
              {/* Grab handle — drag it down to dismiss the sheet. */}
              <div
                onPointerDown={(e) => { dragStartRef.current = e.clientY; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* unsupported */ } }}
                onPointerMove={(e) => { if (dragStartRef.current != null) { const d = e.clientY - dragStartRef.current; setSheetDragY(d > 0 ? d : 0) } }}
                onPointerUp={(e) => { const d = sheetDragY; dragStartRef.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ } if (d > 90) { setSheetDragY(0); setOpen(false) } else setSheetDragY(0) }}
                onPointerCancel={() => { dragStartRef.current = null; setSheetDragY(0) }}
                style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '8px', cursor: 'grab', touchAction: 'none' }}
              >
                <span style={{ width: '36px', height: '4px', borderRadius: '999px', background: 'rgba(var(--fg-rgb),0.22)' }} />
              </div>
              <PanelInner
                notifications={notifications}
                unreadCount={unreadCount}
                loading={loading}
                onActivate={activate}
              onMarkRead={markRead}
                onMarkAll={markAllRead}
                onClose={() => setOpen(false)}
                variant="sheet"
              />
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes mcNotifPop { from { opacity: 0; transform: translateY(-6px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mcNotifSheet { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes mcNotifPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        .mc-notif-sheet { display: none; }
        @media (max-width: 767px) {
          .mc-notif-popover { display: none; }
          .mc-notif-sheet { display: flex; }
        }
      `}</style>
    </div>
  )
}
