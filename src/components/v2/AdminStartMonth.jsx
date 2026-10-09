// "Start the first 2.0 month": creates a v2 `months` row in `upcoming` (= collecting
// submissions). Later months are spawned by closeMonth; this is also the manual recovery
// path when a closed month couldn't spawn its successor (a row for that month existed).

import { useId, useMemo, useState } from 'react'
import { createV2Month } from '../../lib/v2'
import { useClubMode } from '../../context/ClubModeContext'
import { AdminButton, AdminHint, MONO, SANS } from './AdminKit'
import { fieldStyle, fieldLabelStyle as labelText, fmtLocal, fmtMonthYear, nextFreeMonthYear, pacificLocalToISO, seasonForMonth } from './adminV2Helpers'


export default function AdminStartMonth({ months = [], seasons = [], onCreated, setError, setSuccess }) {
  const { clubMode } = useClubMode()
  const ids = { month: useId(), theme: useId(), close: useId(), msg: useId() }
  const [monthYear, setMonthYear] = useState(() => nextFreeMonthYear(months))
  const [theme, setTheme] = useState('')
  const [closeLocal, setCloseLocal] = useState('')
  const [busy, setBusy] = useState(false)

  const validYm = /^\d{4}-\d{2}$/.test(monthYear)
  const existing = validYm ? months.find(m => m.month_year === monthYear) : null
  const season = useMemo(() => (validYm ? seasonForMonth(seasons, monthYear) : null), [seasons, monthYear, validYm])
  const closeISO = closeLocal ? pacificLocalToISO(closeLocal) : null
  const activeV1 = months.find(m => m.status === 'active' && (m.mode ?? 'v1') === 'v1')

  let problem = null
  if (!validYm) problem = 'Choose a month.'
  else if (existing) problem = `${fmtMonthYear(monthYear)} already has a months row (${existing.mode === 'v2' ? '2.0' : '1.0'}, ${existing.status}). Pick another month.`
  else if (!season) problem = `No season covers ${fmtMonthYear(monthYear)}. A seasons row whose dates include this month is needed first (Admin can’t create seasons here).`
  else if (closeLocal && !closeISO) problem = 'That submissions-close time isn’t valid.'

  async function create(e) {
    e.preventDefault()
    if (problem || busy) return
    setBusy(true); setError(null)
    try {
      await createV2Month({ seasonId: season.id, monthYear, theme: theme.trim(), submissionsCloseAt: closeISO })
      setSuccess(`${fmtMonthYear(monthYear)} is open for submissions (2.0).`)
      await onCreated?.()
    } catch (err) {
      setError(err?.message ?? 'Could not create the month.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={create} aria-describedby={ids.msg} noValidate>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <label htmlFor={ids.month} style={labelText}>Month</label>
          <input id={ids.month} type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)}
            style={{ ...fieldStyle, fontFamily: MONO }} required />
        </div>
        <div style={{ flex: '2 1 200px', minWidth: 0 }}>
          <label htmlFor={ids.theme} style={labelText}>Theme</label>
          <input id={ids.theme} type="text" value={theme} onChange={e => setTheme(e.target.value)}
            placeholder="e.g. Halloween / Horror" maxLength={120} style={fieldStyle} />
        </div>
      </div>
      <div style={{ marginTop: '10px' }}>
        <label htmlFor={ids.close} style={labelText}>Submissions close (US Pacific, optional)</label>
        <input id={ids.close} type="datetime-local" value={closeLocal} onChange={e => setCloseLocal(e.target.value)}
          style={{ ...fieldStyle, fontFamily: MONO, maxWidth: '260px' }} />
      </div>

      <div id={ids.msg} aria-live="polite">
        {problem && validYm ? (
          <p role="alert" style={{ color: '#f87171', fontSize: '12px', margin: '10px 0 0', fontFamily: SANS }}>{problem}</p>
        ) : (
          <AdminHint style={{ margin: '10px 0 0' }}>
            {season ? <>Season: {season.name}. </> : null}
            {closeISO
              ? <>Submissions hard-close at that time (checked hourly); that’s {fmtLocal(closeISO)} your time. </>
              : <>No deadline: you close submissions by hand. </>}
            Up to 2 films per member, anonymous until each film reveals.
          </AdminHint>
        )}
        {activeV1 && (
          <AdminHint style={{ margin: '8px 0 0', color: '#fbbf24' }}>
            Heads-up: 1.0 month {activeV1.month_year} is still active. Members can submit now, but closing submissions (opening the vote) is refused until that month is closed.
          </AdminHint>
        )}
        {clubMode !== 'v2' && (
          <AdminHint style={{ margin: '8px 0 0' }}>
            The club is on 1.0, so members won’t see this month until club mode is switched to 2.0 (preview shows it to you).
          </AdminHint>
        )}
      </div>

      <div style={{ marginTop: '14px' }}>
        <AdminButton type="submit" busy={busy} busyLabel="Creating…" disabled={!!problem}>
          Open submissions for {validYm ? fmtMonthYear(monthYear) : 'this month'}
        </AdminButton>
      </div>
    </form>
  )
}
