import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id, session.user.email)
      else setProfileLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id, session.user.email)
      else { setProfile(null); setProfileLoaded(true) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, email) {
    try {
      let { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!data && email) {
        const { data: byEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .maybeSingle()
        data = byEmail ?? null
      }

      setProfile(data)
    } catch (err) {
      console.error('[AuthContext] fetchProfile error:', err)
      setProfile(null)
    } finally {
      setProfileLoaded(true)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, profileLoaded, isAdmin, loading, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
