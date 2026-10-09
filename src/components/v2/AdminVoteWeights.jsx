// Ballot weights editor (app_settings.vote_points). The tally reads the weights when a vote
// closes, so editing them during an open vote changes how that vote is counted — flagged.
// Mounted with key={weights.join()} by the parent so it resets to the saved values on reload.

import { useId, useState } from 'react'
import { PHASE, setVoteWeights } from '../../lib/v2'
import { AdminButton, AdminCard, AdminHint, AdminLabel, MONO } from './AdminKit'
import { validateWeights } from './adminV2Helpers'

const PLACES = ['1st', '2nd', '3rd']

export default function AdminVoteWeights({ weights = [6, 4, 3], phase, onSaved, setError, setSuccess }) {
  const baseId = useId()
  const [values, setValues] = useState(() => weights.map(String))
  const [busy, setBusy] = useState(false)
  const problem = validateWeights(values)
  const unchanged = values.every((v, i) => Number(v) === weights[i])

  async function save(e) {
    e.preventDefault()
    if (problem || unchanged || busy) return
    const next = values.map(Number)
    setBusy(true); setError(null)
    try {
      await setVoteWeights(next)
      setSuccess(`Vote weights set to ${next.join(' / ')}.`)
      await onSaved?.()
    } catch (err) {
      setError('Could not save vote weights: ' + (err?.message ?? 'unknown error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard aria-labelledby={`${baseId}-h`}>
      <AdminLabel as="h2" id={`${baseId}-h`}>Vote weights</AdminLabel>
      <AdminHint>
        Points a ballot gives its 1st / 2nd / 3rd choice. Current: <strong style={{ color: 'var(--text-strong)' }}>{weights.join(' / ')}</strong>. Club practice: 6 / 4 / 3.
      </AdminHint>
      <form onSubmit={save} noValidate>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {PLACES.map((place, i) => (
            <div key={place}>
              <label htmlFor={`${baseId}-${i}`} style={{ display: 'block', fontFamily: MONO, fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {place} place
              </label>
              <input
                id={`${baseId}-${i}`} type="number" inputMode="numeric" min="0" step="1" value={values[i]}
                aria-invalid={problem ? true : undefined} aria-describedby={`${baseId}-msg`}
                onChange={e => setValues(v => v.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ width: '72px', background: 'rgba(var(--fg-rgb), 0.05)', border: '1px solid rgba(var(--fg-rgb), 0.1)', borderRadius: '8px', padding: '7px 9px', color: 'var(--text-strong)', fontFamily: MONO, fontSize: '13px' }}
              />
            </div>
          ))}
          <AdminButton type="submit" busy={busy} busyLabel="Saving…" disabled={!!problem || unchanged}>Save weights</AdminButton>
        </div>
        <div id={`${baseId}-msg`} aria-live="polite">
          {problem
            ? <p role="alert" style={{ color: '#f87171', fontSize: '12px', margin: '10px 0 0' }}>{problem}</p>
            : phase === PHASE.VOTING && !unchanged
              ? <AdminHint style={{ margin: '10px 0 0', color: '#fbbf24' }}>A vote is open: it’s tallied with whatever weights are set when it closes.</AdminHint>
              : null}
        </div>
      </form>
    </AdminCard>
  )
}
