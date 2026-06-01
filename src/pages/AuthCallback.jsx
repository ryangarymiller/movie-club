import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let redirected = false

    // Wait for PKCE code exchange to complete before checking session.
    // getSession() called immediately races with the async exchange and returns null.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (redirected) return
      if (event === 'SIGNED_IN' && session) {
        redirected = true
        navigate('/', { replace: true })
      }
    })

    // Also handle the case where the session already exists (e.g. back navigation)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !redirected) {
        redirected = true
        navigate('/', { replace: true })
      }
    })

    // Fallback: if nothing fires in 8 seconds, go to login
    const timeout = setTimeout(() => {
      if (!redirected) {
        redirected = true
        navigate('/login', { replace: true })
      }
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-gray-400 text-sm">Signing you in…</div>
    </div>
  )
}
