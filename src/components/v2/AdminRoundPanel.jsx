// Movie Club 2.0 — admin controls, rendered at the top of the Admin Dashboard.
//   1. Club mode (live switch + device-local preview)
//   2. Start the first 2.0 month (only when no 2.0 month exists)
//   3. Round controls for the current phase (AdminRoundControls)
//   4. Vote weights
// All reads/writes go through src/lib/v2.js; the DB re-checks is_admin on every action.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRevealTick } from '../../lib/useRevealRefresh'
import { PHASE, loadV2State } from '../../lib/v2'
import { AdminButton, AdminCard, AdminHint, AdminLabel } from './AdminKit'
import AdminClubModeCard from './AdminClubModeCard'
import AdminRoundControls from './AdminRoundControls'
import AdminStartMonth from './AdminStartMonth'
import AdminVoteWeights from './AdminVoteWeights'
import { expectedMembersFallback, normalizeIdList } from './adminV2Helpers'

export default function AdminRoundPanel({ setError, setSuccess }) {
  const { profile } = useAuth()
  const tick = useRevealTick() // elections/months/film reveals broadcast on the reveal bus
  const [data, setData] = useState(null) // { state, names, users, months, seasons, expectedIds }
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(null) // key of the running action
  const [refreshing, setRefreshing] = useState(false)
  const userId = profile?.id

  const load = useCallback(async () => {
    try {
      const [state, usersRes, monthsRes, seasonsRes] = await Promise.all([
        loadV2State(userId),
        supabase.from('users').select('id, name, is_active, is_test, joined_at'),
        supabase.from('months').select('id, month_year, status, mode'),
        supabase.from('seasons').select('id, name, start_date, end_date'),
      ])
      const users = usersRes.data ?? []
      let expectedIds = []
      if (state.month && state.phase === PHASE.COLLECTING) {
        const { data: ids, error } = await supabase.rpc('expected_members', { p_month_id: state.month.id })
        expectedIds = error ? expectedMembersFallback(users, state.month.month_year) : normalizeIdList(ids)
      }
      setLoadError(state.error || usersRes.error?.message || monthsRes.error?.message || null)
      setData({
        state, users, expectedIds,
        names: new Map(users.map(u => [u.id, u.name])),
        months: monthsRes.data ?? [],
        seasons: seasonsRes.data ?? [],
        loadedAt: Date.now(), // "now" for deadline checks, as of this load (render stays pure)
      })
    } catch (e) {
      // Network / client failure: keep the last good state if any, and say so.
      setLoadError(e?.message ?? 'unknown error')
    }
  }, [userId])

  useEffect(() => { load() }, [load, tick])

  // One wrapper for every round action: busy → action → message → reload → idle.
  // DB messages are written for humans (e.g. "a 1.0 month is still active; close it first"),
  // so they're surfaced verbatim.
  const run = useCallback(async (key, action, successMsg) => {
    setBusy(key); setError(null)
    let ok = false
    try {
      const result = await action()
      setSuccess(typeof successMsg === 'function' ? successMsg(result) : successMsg)
      ok = true
    } catch (e) {
      setError(e?.message ?? String(e))
    } finally {
      await load()
      setBusy(null)
    }
    return ok
  }, [load, setError, setSuccess])

  async function manualRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (!data && loadError) {
    return (
      <AdminCard aria-labelledby="v2-load-failed">
        <AdminLabel as="h2" id="v2-load-failed">Movie Club 2.0</AdminLabel>
        <p role="alert" style={{ color: '#f87171', fontSize: '12px', margin: '8px 0 12px' }}>Couldn’t load the 2.0 controls: {loadError}</p>
        <AdminButton small variant="secondary" onClick={manualRefresh} busy={refreshing} busyLabel="Retrying…">Retry</AdminButton>
      </AdminCard>
    )
  }

  if (!data) {
    return (
      <AdminCard aria-busy="true" aria-label="Movie Club 2.0 controls loading">
        <AdminLabel>Movie Club 2.0</AdminLabel>
        <div className="animate-pulse" style={{ height: '64px', marginTop: '10px', borderRadius: '8px', background: 'rgba(var(--fg-rgb), 0.05)' }} />
      </AdminCard>
    )
  }

  const { state } = data
  const hasMonth = state.phase !== PHASE.NONE

  return (
    <div>
      <AdminClubModeCard hasV2Month={hasMonth} setError={setError} setSuccess={setSuccess} />

      <AdminCard aria-labelledby="v2-round-label">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AdminLabel as="h2" id="v2-round-label">{hasMonth ? '2.0 round' : 'Start the first 2.0 month'}</AdminLabel>
          {hasMonth && (
            <AdminButton small variant="secondary" style={{ marginLeft: 'auto' }}
              onClick={manualRefresh} busy={refreshing} busyLabel="Refreshing…" disabled={busy != null}>
              Refresh
            </AdminButton>
          )}
        </div>
        {loadError && <p role="alert" style={{ color: '#f87171', fontSize: '12px', margin: '8px 0 0' }}>Couldn’t load the 2.0 round: {loadError}</p>}

        {hasMonth ? (
          <AdminRoundControls
            state={state}
            names={data.names}
            expectedIds={data.expectedIds}
            now={data.loadedAt}
            months={data.months}
            seasons={data.seasons}
            busy={busy}
            run={run}
            onReload={load}
            setError={setError}
            setSuccess={setSuccess}
          />
        ) : (
          <>
            <AdminHint>
              Creates a 2.0 month in “collecting” state: members add up to 2 films to an anonymous list, then you close submissions to open the vote.
              Later months are created automatically when you close a month.
            </AdminHint>
            <AdminStartMonth months={data.months} seasons={data.seasons} onCreated={load} setError={setError} setSuccess={setSuccess} />
          </>
        )}
      </AdminCard>

      <AdminVoteWeights
        key={state.weights.join(',')}
        weights={state.weights}
        phase={state.phase}
        onSaved={load}
        setError={setError}
        setSuccess={setSuccess}
      />
    </div>
  )
}
