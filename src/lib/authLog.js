// Lightweight, fire-and-forget diagnostic logging for auth/session events.
// Writes to public.auth_events (admins can read it). Designed to NEVER throw or
// block the auth flow — diagnostics must not be able to break sign-in.

import { supabase } from './supabase'

// Set right before a deliberate supabase.auth.signOut() so the auth listener can
// tell an intentional sign-out apart from an unexpected one (token-refresh failure,
// session loss, etc.). Consumed once by the next SIGNED_OUT event.
let userInitiatedSignOut = false

export function markUserInitiatedSignOut() {
  userInitiatedSignOut = true
}

export function consumeUserInitiatedSignOut() {
  const v = userInitiatedSignOut
  userInitiatedSignOut = false
  return v
}

// Sign out deliberately: tag it so the auth listener logs it as user-initiated
// (not as an unexpected sign-out), then sign out. Use this EVERYWHERE instead of
// calling supabase.auth.signOut() directly, so no sign-out path can forget to tag
// itself and pollute the sign-out diagnostics.
export function deliberateSignOut() {
  markUserInitiatedSignOut()
  return supabase.auth.signOut()
}

// Fire-and-forget: insert a diagnostic row. Swallows all errors.
export function logAuthEvent(event, { userId = null, userInitiated = false, detail = null } = {}) {
  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
    // Intentionally not awaited — logging must not delay auth handling.
    const op = supabase.from('auth_events').insert({
      event,
      user_id: userId,
      user_initiated: userInitiated,
      detail,
      user_agent: userAgent,
    })
    // .insert may return a thenable; guard in case the client/mocks differ.
    if (op && typeof op.then === 'function') {
      op.then(({ error } = {}) => {
        if (error) console.warn('[authLog] insert failed:', error.message)
      }, () => {})
    }
  } catch (e) {
    console.warn('[authLog] unexpected:', e?.message ?? e)
  }
}
