import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true })
      else navigate('/login', { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-gray-400 text-sm">Signing you in…</div>
    </div>
  )
}
