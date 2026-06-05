import { useRef, useLayoutEffect } from 'react'

// Smart scroll for show-more / show-less lists.
//
// Expanding a list grows it downward, so the scroll position is already correct —
// we leave it alone. COLLAPSING removes rows above the toggle, which yanks the
// toggle (and everything below it) upward; without help the viewer is left
// stranded far below the now-shorter list. This hook keeps the toggle button at
// the same viewport position across a collapse, so the viewer stays looking at the
// bottom of the shortened list.
//
// It measures the anchor's viewport position just before collapsing, then — after
// React commits the shorter layout — scrolls the nearest scroll container (or the
// window) by the difference so the anchor lands back where it was.
//
// Usage:
//   const { anchorRef, beforeCollapse } = useCollapseScroll()
//   <button
//     ref={anchorRef}
//     onClick={() => { if (expanded) beforeCollapse(); setExpanded(v => !v) }}
//   >
//     {expanded ? 'Show less' : 'Show all'}
//   </button>
export function useCollapseScroll() {
  const anchorRef = useRef(null)
  const prevTop = useRef(null) // anchor's viewport top captured right before collapse

  // Call this immediately before flipping expanded → collapsed.
  const beforeCollapse = () => {
    prevTop.current = anchorRef.current
      ? anchorRef.current.getBoundingClientRect().top
      : null
  }

  useLayoutEffect(() => {
    if (prevTop.current == null || !anchorRef.current) return
    const delta = anchorRef.current.getBoundingClientRect().top - prevTop.current
    prevTop.current = null
    if (!delta) return
    // Scroll whichever element actually scrolls this list (an overlay panel, or
    // the window) so the anchor returns to its prior viewport position.
    const scroller = getScrollParent(anchorRef.current)
    if (scroller) scroller.scrollTop += delta
    else window.scrollBy(0, delta)
  })

  return { anchorRef, beforeCollapse }
}

// Nearest ancestor that actually scrolls vertically; null → use the window.
function getScrollParent(el) {
  let node = el?.parentElement
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}
