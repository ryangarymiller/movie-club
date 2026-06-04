import { useEffect, useRef } from 'react'

// Back-button popup coordinator.
// ------------------------------------------------------------------
// Makes the Android/browser Back button CLOSE the top open popup (overlay, modal,
// sheet) instead of navigating to the previous route — and closes nested popups
// one at a time, top-first.
//
// One history entry is pushed per open popup (URL unchanged, so react-router
// never navigates). A single global popstate listener pops the TOP popup's close
// handler. A UI-driven close (X / backdrop) consumes its own entry via
// history.back(), guarded by a suppress flag so it doesn't cascade into closing
// the popup beneath it.

const stack = []          // array of close callbacks, top = last
let suppressPops = 0      // number of upcoming programmatic-back popstates to ignore
let listening = false

function onPopState() {
  if (suppressPops > 0) { suppressPops -= 1; return }
  // A real Back press: close the top popup. Its history entry is already gone.
  const close = stack.pop()
  if (close) close()
  if (stack.length === 0) teardown()
}

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

function register(close) {
  setup()
  stack.push(close)
  window.history.pushState({ mcPopup: true }, '')
}

function unregister(close) {
  const idx = stack.lastIndexOf(close)
  if (idx === -1) return
  stack.splice(idx, 1)
  // Consume the one history entry this popup pushed, without our popstate
  // listener interpreting it as a Back press (which would close the next popup).
  suppressPops += 1
  window.history.back()
  if (stack.length === 0) teardown()
}

// useBackClose(open, onClose)
// Pass open=true for components mounted only while open (modals); pass a real
// boolean for always-mounted overlays toggled via a prop. onClose may change
// identity freely — the latest is always used.
export function useBackClose(open, onClose) {
  const onCloseRef = useRef(onClose)
  // Keep the ref current without touching it during render (lint: no refs in render).
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const close = () => onCloseRef.current?.()
    register(close)
    return () => unregister(close)
  }, [open])
}
