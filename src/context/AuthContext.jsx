import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAuthEvent, consumeUserInitiatedSignOut } from '../lib/authLog'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  // True when the most recent profile fetch FAILED (transient network/DB error),
  // as opposed to genuinely finding no user row. Lets the app show a retry screen
  // instead of bouncing the user to /not-approved on a momentary blip.
  const [profileError, setProfileError] = useState(false)
  // The user id whose profile is currently loaded/loading. Supabase fires
  // onAuthStateChange (TOKEN_REFRESHED / SIGNED_IN) every time the tab regains
  // focus; without this guard we'd refetch the profile each time, hand every
  // page a NEW `profile` object reference, and re-trigger their `[profile]` load
  // effects — which blanked the page and reloaded its data on every tab switch.
  // We only (re)fetch when the user actually changes.
  const loadedUserRef = useRef(null)

  useEffect(() => {
    let mounted = true

    // Load the profile only when the signed-in user changed (or on first load).
    // Same-user auth events (token refresh on refocus) keep the existing profile.
    function syncProfile(nextSession) {
      const uid = nextSession?.user?.id ?? null
      if (!uid) {
        loadedUserRef.current = null
        setProfile(null)
        setProfileLoaded(true)
        return
      }
      if (uid === loadedUserRef.current) return // same user — already loaded/loading
      loadedUserRef.current = uid
      fetchProfile(uid, nextSession.user.email)
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) logAuthEvent('get_session_error', { detail: { message: error.message } })
      if (!mounted) return
      setSession(session)
      if (session) syncProfile(session)
      else setProfileLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      // Capture unexpected sign-outs (token-refresh failure, session loss). A
      // deliberate sign-out is tagged via markUserInitiatedSignOut() at the call site.
      if (event === 'SIGNED_OUT') {
        logAuthEvent('SIGNED_OUT', {
          userInitiated: consumeUserInitiatedSignOut(),
          detail: {
            visibility: typeof document !== 'undefined' ? document.visibilityState : null,
            online: typeof navigator !== 'undefined' ? navigator.onLine : null,
          },
        })
      }
      setSession(session)
      syncProfile(session)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function fetchProfile(userId, email, attempt = 0) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error

      let row = data
      if (!row && email) {
        const { data: byEmail, error: emailErr } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .maybeSingle()
        if (emailErr) throw emailErr
        // An admin-invited row is pre-created with a placeholder id. On the
        // member's first login, claim it (reconcile id → auth.uid()) so every
        // own-row RLS check works for them; then re-read by the real id.
        if (byEmail && byEmail.id !== userId) {
          await supabase.rpc('claim_invited_user')
          const { data: claimed } = await supabase
            .from('users').select('*').eq('id', userId).maybeSingle()
          row = claimed ?? { ...byEmail, id: userId }
        } else {
          row = byEmail ?? null
        }
      }

      // Successful load — including a legitimate "no matching row" (row === null),
      // which the app correctly routes to /not-approved. Clear any prior error.
      setProfileError(false)
      setProfile(row)
      setProfileLoaded(true)
    } catch (err) {
      // Transient failure (network/DB). Retry once before giving up so a momentary
      // blip doesn't blank the profile and bounce the user to /not-approved.
      if (attempt < 1) {
        logAuthEvent('profile_fetch_retry', { userId, detail: { message: err?.message ?? String(err) } })
        setTimeout(() => fetchProfile(userId, email, attempt + 1), 800)
        return
      }
      console.error('[AuthContext] fetchProfile error:', err)
      logAuthEvent('profile_fetch_error', { userId, detail: { message: err?.message ?? String(err) } })
      // Do NOT null an existing profile on a transient error — keep the user in.
      setProfileError(true)
      setProfileLoaded(true)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, profileLoaded, profileError, isAdmin, loading, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
