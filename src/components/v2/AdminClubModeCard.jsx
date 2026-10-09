// "Club mode" card: the live app_settings.club_mode switch (which flow MEMBERS see — flipping
// back to 1.0 is the 2.0 revert, R1) plus the admin-only, device-local "preview 2.0" toggle.

import { useState } from 'react'
import { useClubMode } from '../../context/ClubModeContext'
import { setClubMode } from '../../lib/v2'
import { AdminButton, AdminCard, AdminHint, AdminLabel, MONO, SANS } from './AdminKit'
import AdminConfirmDialog from './AdminConfirmDialog'

const MODE_NAME = { v1: '1.0', v2: '2.0' }

export default function AdminClubModeCard({ hasV2Month, setError, setSuccess }) {
  const { clubMode, preview, setPreview, refresh, loading } = useClubMode()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const next = clubMode === 'v2' ? 'v1' : 'v2'

  async function doSwitch() {
    setBusy(true); setError(null)
    try {
      await setClubMode(next)
      await refresh()
      setSuccess(next === 'v2'
        ? 'The club is now on Movie Club 2.0.'
        : 'The club is back on Movie Club 1.0. 2.0 data is kept, untouched.')
      setConfirming(false)
    } catch (e) {
      setError('Could not switch club mode: ' + (e?.message ?? 'unknown error'))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  const previewDisabled = clubMode === 'v2'

  return (
    <AdminCard aria-labelledby="v2-club-mode-label">
      <AdminLabel as="h2" id="v2-club-mode-label">Club mode</AdminLabel>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.4rem', lineHeight: 1, color: 'var(--accent)' }}>
            {loading ? '…' : MODE_NAME[clubMode]}
          </span>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-dim)' }}>live for the whole club</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <AdminButton
            variant={next === 'v1' ? 'secondary' : 'primary'}
            onClick={() => setConfirming(true)}
            disabled={loading || busy}
          >
            {next === 'v2' ? 'Switch the club to 2.0' : 'Revert the club to 1.0'}
          </AdminButton>
        </div>
      </div>

      <AdminHint>1.0 = one pick per member · 2.0 = list → vote → one film at a time</AdminHint>

      {/* Device-local preview (ClubModeContext stores it in localStorage, admins only). */}
      <div style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', paddingTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <button
          type="button"
          role="switch"
          id="v2-preview-switch"
          aria-checked={preview}
          aria-labelledby="v2-preview-label"
          aria-describedby="v2-preview-hint"
          disabled={previewDisabled}
          onClick={() => setPreview(!preview)}
          style={{
            flexShrink: 0, width: '42px', height: '24px', borderRadius: '999px', border: 'none', marginTop: '1px',
            background: preview ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.18)', position: 'relative',
            cursor: previewDisabled ? 'not-allowed' : 'pointer', opacity: previewDisabled ? 0.5 : 1, transition: 'background 0.15s ease',
          }}
        >
          <span style={{ position: 'absolute', top: '3px', left: preview ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }} />
        </button>
        <div style={{ minWidth: 0 }}>
          <label id="v2-preview-label" htmlFor="v2-preview-switch" style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', cursor: previewDisabled ? 'default' : 'pointer' }}>
            Preview 2.0 on this device
          </label>
          <p id="v2-preview-hint" style={{ margin: '2px 0 0', fontFamily: MONO, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {previewDisabled
              ? 'The club is already on 2.0, so there is nothing to preview.'
              : 'Admin-only and local to this browser: This Month and Home show you the 2.0 screens. The club still sees 1.0.'}
          </p>
        </div>
      </div>

      {confirming && (
        <AdminConfirmDialog
          title={next === 'v2' ? 'Switch the club to Movie Club 2.0?' : 'Revert the club to Movie Club 1.0?'}
          confirmLabel={next === 'v2' ? 'Switch to 2.0' : 'Revert to 1.0'}
          busyLabel="Switching…"
          busy={busy}
          onConfirm={doSwitch}
          onCancel={() => setConfirming(false)}
        >
          {next === 'v2' ? (
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' }}>
              <li>Every member’s <strong>This Month</strong> and <strong>Home</strong> switch to the 2.0 flow straight away: submit to the list, vote a top 3, watch one film at a time.</li>
              <li>1.0 months, picks, scores and history stay exactly as they are. The 1.0 automation (auto-activation, deadline reveals) only ever touches 1.0 months.</li>
              {!hasV2Month && <li><strong>No 2.0 month exists yet.</strong> Members will see an empty 2.0 round until you start one below.</li>}
              <li>Reversible: you can revert to 1.0 at any time from here.</li>
            </ul>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' }}>
              <li>Members go back to the 1.0 flow (one pick per member) straight away.</li>
              <li>Any 2.0 month in progress is left exactly as it is. Nothing is deleted, and switching back to 2.0 resumes it.</li>
              <li>Films already watched under 2.0 stay in Films, Stats and history.</li>
              <li>The 1.0 controls on this dashboard become active again.</li>
            </ul>
          )}
        </AdminConfirmDialog>
      )}
    </AdminCard>
  )
}
