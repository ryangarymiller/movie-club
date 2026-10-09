// Confirmation dialog for the 2.0 admin actions. Uses the app's modal-safety classes
// (.mc-modal-backdrop / .mc-modal-panel), portals to <body> like ScoreModal, focuses its
// first control on open (Cancel comes first in DOM order, so a stray Enter never fires a
// destructive action), traps Tab inside, closes on Esc / backdrop (not while busy), and
// returns focus to the trigger on close.

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AdminButton, SANS } from './AdminKit'

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export default function AdminConfirmDialog({
  title, children, confirmLabel = 'Confirm', busyLabel = 'Working…', tone = 'primary',
  busy = false, confirmDisabled = false, onConfirm, onCancel,
}) {
  const panelRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()

  // Focus the first control on open; restore focus to the trigger on close.
  useEffect(() => {
    const prev = document.activeElement
    panelRef.current?.querySelector(FOCUSABLE)?.focus()
    return () => { if (prev && typeof prev.focus === 'function' && prev.isConnected) prev.focus() }
  }, [])

  // Esc closes; Tab / Shift+Tab cycle inside the panel.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busy) onCancel?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return createPortal((
    <div className="mc-modal-backdrop" style={{ position: 'fixed', zIndex: 200 }}>
      <div
        aria-hidden="true"
        onClick={busy ? undefined : onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="mc-modal-panel"
        style={{
          position: 'relative', maxWidth: '460px', background: 'var(--surface)',
          border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '16px', padding: '20px',
          fontFamily: SANS, color: 'var(--text)',
        }}
      >
        <h2 id={titleId} style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 600, color: 'var(--text-strong)' }}>
          {title}
        </h2>
        <div id={bodyId} style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          <AdminButton variant="secondary" onClick={onCancel} disabled={busy}>Cancel</AdminButton>
          <AdminButton variant={tone} onClick={onConfirm} busy={busy} busyLabel={busyLabel} disabled={confirmDisabled}>
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  ), document.body)
}
