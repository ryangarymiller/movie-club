import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function dbLog(event, payload = {}) {
  try {
    await supabase.from('auth_debug_logs').insert({ event, payload })
  } catch (_) {}
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [lines, setLines] = useState([])

  function log(msg, data) {
    const entry = data ? `${msg}: ${JSON.stringify(data)}` : msg
    setLines(prev => [...prev, entry])
    dbLog(msg, data ?? {})
  }

  useEffect(() => {
    let redirected = false

    const url = window.location.href
    const search = window.location.search
    const hash = window.location.hash.slice(0, 60)
    log('mounted', { url: url.slice(0, 120), search, hash })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      log('authStateChange', { event, user: session?.user?.email ?? null })
      if (redirected) return
      if (event === 'SIGNED_IN' && session) {
        log('navigating to /')
        redirected = true
        navigate('/', { replace: true })
      }
    })

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      log('getSession', { user: session?.user?.email ?? null, error: error?.message ?? null })
      if (session && !redirected) {
        log('session found — navigating to /')
        redirected = true
        navigate('/', { replace: true })
      }
    })

    const timeout = setTimeout(() => {
      if (!redirected) {
        log('8s timeout — no session, going to /login')
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
    <div style={{ minHeight: '100vh', background: '#030712', padding: '24px', fontFamily: 'monospace' }}>
      <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '16px' }}>Signing you in…</div>
      {lines.map((line, i) => (
        <div key={i} style={{ color: '#4ade80', fontSize: '11px', marginBottom: '4px', wordBreak: 'break-all' }}>
          {line}
        </div>
      ))}
    </div>
  )
}
