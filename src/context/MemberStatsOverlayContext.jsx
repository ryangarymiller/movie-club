import { createContext, useContext, useState, useCallback } from 'react'

// Opens a member's FULL stats (their Me-tab breakdown) as an overlay on top of
// the current page — from the member profile overlay or the Stats Members tab —
// so closing returns you exactly where you were (not the Me tab).
const MemberStatsOverlayContext = createContext(null)

export function MemberStatsOverlayProvider({ children }) {
  const [memberId, setMemberId] = useState(null)
  const openStats = useCallback((id) => { if (id) setMemberId(id) }, [])
  const close = useCallback(() => setMemberId(null), [])
  return (
    <MemberStatsOverlayContext.Provider value={{ memberId, openStats, close }}>
      {children}
    </MemberStatsOverlayContext.Provider>
  )
}

export function useMemberStatsOverlay() {
  return useContext(MemberStatsOverlayContext) ?? { memberId: null, openStats: () => {}, close: () => {} }
}
