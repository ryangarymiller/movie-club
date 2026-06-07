import { createContext, useContext, useState, useCallback } from 'react'
import { useBackClose } from '../lib/useBackClose'

// Opens a film-person (cast / crew) popup as an overlay on top of the current
// page — from a tappable cast/crew name in the film overlay — so closing it
// returns you exactly where you were. The "person" is identified by NAME only:
// cast/writers are stored as text[] of names and `director` as a string; there
// is no TMDB person id persisted. So openPerson takes `{ name }`.
const PersonOverlayContext = createContext(null)

export function PersonOverlayProvider({ children }) {
  const [person, setPerson] = useState(null)

  const openPerson = useCallback((p) => {
    const name = typeof p === 'string' ? p : p?.name
    if (!name || !name.trim()) return
    setPerson({ name: name.trim() })
  }, [])

  const close = useCallback(() => setPerson(null), [])

  // Android/browser Back closes the person overlay instead of navigating away.
  useBackClose(!!person, close)

  return (
    <PersonOverlayContext.Provider value={{ person, openPerson, close }}>
      {children}
    </PersonOverlayContext.Provider>
  )
}

// Safe default so components can call openPerson even if the provider is absent
// (e.g. in tests that render a page in isolation).
export function usePersonOverlay() {
  return useContext(PersonOverlayContext) ?? { person: null, openPerson: () => {}, close: () => {} }
}
