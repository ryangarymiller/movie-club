import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let redirected = false

    console.log('[AuthCallback] mounted — URL:', window.location.href)
    console.log('[AuthCallback] hash:', window.location.hash)
    console.log('[AuthCallback] search:', window.location.search)

    // Wait for PKCE code exchange to complete before checking session.
    // getSession() called immediately races with the async exchange and returns null.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthCallback] onAuthStateChange event:', event, '| user:', session?.user?.email ?? null)
      if (redirected) return
      if (event === 'SIGNED_IN' && session) {
        console.log('[AuthCallback] SIGNED_IN — navigating to /')
        redirected = true
        navigate('/', { replace: true })
      }
    })

    // Also handle the case where the session already exists (e.g. back navigation)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[AuthCallback] getSession — user:', session?.user?.email ?? null, '| error:', error?.message ?? null)
      if (session && !redirected) {
        console.log('[AuthCallback] existing session — navigating to /')
        redirected = true
        navigate('/', { replace: true })
      }
    })

    // Fallback: if nothing fires in 8 seconds, go to login
    const timeout = setTimeout(() => {
      if (!redirected) {
        console.log('[AuthCallback] 8s timeout — no session received, redirecting to /login')
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
