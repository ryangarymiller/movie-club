import { createContext, useContext, useState, useCallback } from 'react'

// Lets any page (re)open the guided tour. The tour also opens itself for members
// who haven't completed onboarding — that's handled inside GuidedTour.
const TourContext = createContext({ tourOpen: false, startTour: () => {}, closeTour: () => {} })

export function TourProvider({ children }) {
  const [tourOpen, setTourOpen] = useState(false)
  const startTour = useCallback(() => setTourOpen(true), [])
  const closeTour = useCallback(() => setTourOpen(false), [])
  return (
    <TourContext.Provider value={{ tourOpen, startTour, closeTour }}>
      {children}
    </TourContext.Provider>
  )
}

export const useTour = () => useContext(TourContext)
