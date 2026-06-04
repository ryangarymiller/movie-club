import { createContext, useContext, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useBackClose } from '../lib/useBackClose'

// Opens another member's profile as an overlay on top of the current page, so
// closing it returns you exactly where you were. Your OWN profile stays a real
// page (the bottom-bar Profile tab) — openMember routes there instead of
// popping a modal of yourself.
const MemberOverlayContext = createContext(null)

export function MemberOverlayProvider({ children }) {
  const [memberId, setMemberId] = useState(null)
  const navigate = useNavigate()
  const { profile } = useAuth()

  const openMember = useCallback((id) => {
    if (!id) return
    if (profile && id === profile.id) { navigate('/profile'); return } // own profile = the page
    setMemberId(id)
  }, [navigate, profile])

  const close = useCallback(() => setMemberId(null), [])

  // Android/browser Back closes the member overlay instead of navigating away.
  useBackClose(!!memberId, close)

  return (
    <MemberOverlayContext.Provider value={{ memberId, openMember, close }}>
      {children}
    </MemberOverlayContext.Provider>
  )
}

// Safe default so components can call openMember even if the provider is absent
// (e.g. in tests that render a page in isolation).
export function useMemberOverlay() {
  return useContext(MemberOverlayContext) ?? { memberId: null, openMember: () => {}, close: () => {} }
}
