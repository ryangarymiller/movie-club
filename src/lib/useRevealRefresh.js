// Live reveal bus.
// ---------------------------------------------------------------------------
// The DB broadcasts a minimal {table, id} payload on the public 'reveals'
// realtime topic whenever a reveal-ish transition happens server-side (a film's
// scores_revealed / picker_revealed flips, a veto threshold trips, or a month's
// status changes — including the pg_cron deadline + activation paths, where no
// client initiated the write). movies itself can't be in the realtime
// publication (postgres_changes would leak picked_by_user_id pre-reveal), so
// <RevealBus> (App.jsx) holds the single channel subscription and re-dispatches
// each message as a window event; pages refetch through their normal RLS-gated
// queries.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const REVEAL_EVENT = 'mc-reveal'

// One app-wide subscription (mounted once in App.jsx). Dispatches REVEAL_EVENT.
export function RevealBus() {
  useEffect(() => {
    const channel = supabase
      .channel('reveals')
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: payload ?? null }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])
  return null
}

// Call `cb` whenever a reveal event lands (pages with a reload callback).
export function useRevealRefresh(cb) {
  useEffect(() => {
    if (typeof cb !== 'function') return undefined
    const handler = () => cb()
    window.addEventListener(REVEAL_EVENT, handler)
    return () => window.removeEventListener(REVEAL_EVENT, handler)
  }, [cb])
}

// Counter that bumps on each reveal event — for pages whose data load lives in
// an inline useEffect: add the tick to the effect's deps to re-run it.
export function useRevealTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const handler = () => setTick(t => t + 1)
    window.addEventListener(REVEAL_EVENT, handler)
    return () => window.removeEventListener(REVEAL_EVENT, handler)
  }, [])
  return tick
}
