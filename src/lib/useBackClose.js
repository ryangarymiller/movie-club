import { useEffect, useRef } from 'react'

// Back-button popup coordinator.
// ------------------------------------------------------------------
// Makes the Android/browser Back button CLOSE the top open popup (overlay, modal,
// sheet) instead of navigating to the previous route — closing nested popups one
// at a time, top-first.
//
// Design: ONE history "guard" entry covers the whole popup stack (not one per
// popup). Back pops the guard → we close the top popup and, if any remain, push a
// fresh guard. A UI-driven close that empties the stack consumes the guard via
// history.back() — but DEFERRED to a microtask so an overlay→overlay handoff
// (close A + open B in the same tick) cancels the consume and B simply reuses the
// existing guard. This fixes the race where the handoff left B unguarded and Back
// navigated the page instead of closing B.

const stack = []          // close callbacks, top = last
let guardLive = false     // is a guard history entry currently pushed
let suppressPops = 0      // programmatic-back popstates to ignore
let consumeScheduled = false
let listening = false

function setup() {
  if (listening) return
  window.addEventListener('popstate', onPopState)
  listening = true
}
function teardown() {
  if (!listening) return
  window.removeEventListener('popstate', onPopState)
  listening = false
}
function ensureGuard() {
  if (!guardLive) {
    window.history.pushState({ mcPopup: true }, '')
    guardLive = true
    setup()
  }
}
function onPopState() {
  if (suppressPops > 0) { suppressPops -= 1; return }
  // A real Back press consumed the guard entry.
  guardLive = false
  const close = stack.pop()
  if (close) close()
  if (stack.length > 0) ensureGuard()   // re-guard the popups still open
  else teardown()
}
function scheduleConsume() {
  consumeScheduled = true
  queueMicrotask(() => {
    if (!consumeScheduled) return       // a register cancelled it (handoff)
    consumeScheduled = false
    if (stack.length === 0 && guardLive) {
      suppressPops += 1
      guardLive = false
      window.history.back()
    }
    if (stack.length === 0) teardown()
  })
}
function register(close) {
  consumeScheduled = false              // reuse the live guard across a handoff
  stack.push(close)
  ensureGuard()
}
function unregister(close) {
  const i = stack.lastIndexOf(close)
  if (i === -1) return
  stack.splice(i, 1)
  if (stack.length === 0) scheduleConsume()
}

// Call right BEFORE navigating the router away from inside an open popup. Drops the
// back-guard + popup stack WITHOUT a history.back() — the caller's navigation should
// REPLACE the guard history entry. Without this, closing the popup (which does a
// history.back to consume its guard) reverts the navigation, so "Open" appeared to
// do nothing. Pair with navigate(to, { replace: true }).
export function releaseGuardForNavigation() {
  stack.length = 0
  consumeScheduled = false
  guardLive = false
  teardown()
}

// useBackClose(open, onClose). Pass open=true for components mounted only while
// open (modals); pass a real boolean for always-mounted overlays toggled via a
// prop. onClose may change identity freely — the latest is always used.
export function useBackClose(open, onClose) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const close = () => onCloseRef.current?.()
    register(close)
    return () => unregister(close)
  }, [open])
}
