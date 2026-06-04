import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Per-history-entry scroll restoration for the window scroller.
// ------------------------------------------------------------------
// The app scrolls the document (the <main> has no own scroll container), and we
// use BrowserRouter + <Routes> (not a data router), so React Router's built-in
// <ScrollRestoration> isn't available. This reproduces it:
//   · PUSH/REPLACE (a fresh navigation) → scroll to top, like a new page.
//   · POP (Android/browser Back or Forward) → restore the scroll position the
//     user had on that entry, instead of jumping to the top.
// Positions are keyed by location.key (stable per history entry) and recorded
// continuously as the user scrolls. Because pages stream in their data after
// mount (skeleton → content), we retry the restore over a short rAF window until
// the document is tall enough to actually reach the saved offset.

const positions = new Map()

export default function ScrollRestorer() {
  const location = useLocation()
  const navType = useNavigationType()
  const key = location.key
  const prevKey = useRef(key)
  const restoring = useRef(false)

  // Continuously record the scroll offset for the active entry — except while a
  // programmatic restore is in flight (so it can't clobber a saved position).
  useEffect(() => {
    const onScroll = () => { if (!restoring.current) positions.set(key, window.scrollY) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])

  useLayoutEffect(() => {
    if (prevKey.current === key) return   // same entry (e.g. overlay open/close) — leave scroll alone
    prevKey.current = key
    const target = navType === 'POP' ? (positions.get(key) ?? 0) : 0
    restoring.current = true
    let raf, n = 0
    const step = () => {
      window.scrollTo(0, target)
      // Keep nudging while the page grows (async data) and we haven't landed yet.
      if (++n < 75 && Math.abs(window.scrollY - target) > 2) {
        raf = requestAnimationFrame(step)
      } else {
        restoring.current = false
      }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); restoring.current = false }
  }, [key, navType])

  return null
}
