import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Seasonal readjustment window (Phase 6).
//
// An admin opens a window at a season's end; while it's open members may freely
// re-score that season's films. This context loads the window state for every
// season plus a month→season map, and exposes whether a given film (by its
// month) is currently re-scorable. It subscribes to `seasons` realtime so a
// member's UI flips the moment an admin opens/closes a window.
const ReadjustmentContext = createContext(null)

// A window counts as open only while flagged AND (no end set OR before the end).
// Treating a past-end window as closed gives a soft auto-close without pg_cron.
function seasonWindowOpen(season) {
  if (!season?.readjustment_open) return false
  if (!season.readjustment_ends_at) return true
  return Date.now() < Date.parse(season.readjustment_ends_at)
}

export function ReadjustmentProvider({ children }) {
  const [seasons, setSeasons] = useState([])
  const [monthSeason, setMonthSeason] = useState({}) // monthId -> seasonId

  const load = useCallback(async () => {
    const [{ data: s }, { data: mo }] = await Promise.all([
      supabase.from('seasons').select('id, name, start_date, end_date, readjustment_open, readjustment_ends_at'),
      supabase.from('months').select('id, season_id'),
    ])
    setSeasons(s ?? [])
    const map = {}
    for (const m of (mo ?? [])) map[m.id] = m.season_id
    setMonthSeason(map)
  }, [])

  useEffect(() => { load() }, [load])

  // Live updates when an admin opens/closes a window.
  useEffect(() => {
    const ch = supabase
      .channel('seasons-readjust')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seasons' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // The single season whose window is currently open (if any).
  const openSeason = useMemo(() => seasons.find(seasonWindowOpen) || null, [seasons])

  const isMonthReadjustable = useCallback((monthId) => {
    const sid = monthSeason[monthId]
    if (!sid) return false
    return seasonWindowOpen(seasons.find(x => x.id === sid))
  }, [monthSeason, seasons])

  const value = useMemo(() => ({
    seasons,
    openSeason,
    isMonthReadjustable,
    isSeasonOpen: seasonWindowOpen,
    refresh: load,
  }), [seasons, openSeason, isMonthReadjustable, load])

  return <ReadjustmentContext.Provider value={value}>{children}</ReadjustmentContext.Provider>
}

// Safe defaults when no provider is mounted (e.g. isolated component tests).
const FALLBACK = {
  seasons: [],
  openSeason: null,
  isMonthReadjustable: () => false,
  isSeasonOpen: () => false,
  refresh: () => {},
}

export const useReadjustment = () => useContext(ReadjustmentContext) || FALLBACK
