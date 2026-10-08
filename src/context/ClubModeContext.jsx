// Which club lifecycle the current-round UI serves: 1.0 (one pick per member, calendar months)
// or 2.0 (themed list → ranked vote → one film at a time). Source of truth is
// app_settings.club_mode — flipping it back to 'v1' is the 2.0 revert (R1).
//
// Admins can also turn on a local "preview 2.0" (localStorage only) to exercise the 2.0 screens
// before the club is switched over. Members never see 2.0 until club_mode = 'v2'.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useRevealTick } from '../lib/useRevealRefresh'

const PREVIEW_KEY = 'mc-v2-preview'
const ClubModeContext = createContext({ clubMode: 'v1', isV2: false, preview: false, setPreview: () => {}, refresh: () => {}, loading: true })

export function ClubModeProvider({ children }) {
  const { profile } = useAuth()
  const [clubMode, setClubMode] = useState('v1')
  const [loading, setLoading] = useState(true)
  const [preview, setPreviewState] = useState(() => {
    try { return localStorage.getItem(PREVIEW_KEY) === '1' } catch { return false }
  })
  const tick = useRevealTick()
  const isAdmin = profile?.role === 'admin'

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('club_mode').limit(1).maybeSingle()
    setClubMode(data?.club_mode === 'v2' ? 'v2' : 'v1')
    setLoading(false)
  }, [])

  useEffect(() => { if (profile) refresh() }, [profile, refresh, tick])

  const setPreview = useCallback(on => {
    setPreviewState(on)
    try { on ? localStorage.setItem(PREVIEW_KEY, '1') : localStorage.removeItem(PREVIEW_KEY) } catch { /* ignore */ }
  }, [])

  const value = useMemo(() => ({
    clubMode,
    isV2: clubMode === 'v2' || (isAdmin && preview),
    preview: isAdmin && preview,
    setPreview,
    refresh,
    loading,
  }), [clubMode, isAdmin, preview, setPreview, refresh, loading])

  return <ClubModeContext.Provider value={value}>{children}</ClubModeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useClubMode = () => useContext(ClubModeContext)
