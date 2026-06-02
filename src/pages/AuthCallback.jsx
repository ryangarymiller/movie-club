import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let redirected = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (redirected) return
      if (event === 'SIGNED_IN' && session) {
        redirected = true
        navigate('/', { replace: true })
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !redirected) {
        redirected = true
        navigate('/', { replace: true })
      }
    })

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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--text-muted)', fontSize: '15px' }}>Signing you in…</p>
    </div>
  )
}
