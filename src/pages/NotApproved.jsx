import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deliberateSignOut } from '../lib/authLog'

export default function NotApproved() {
  const [email, setEmail] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email)
    })
  }, [])

  async function handleSignOut() {
    await deliberateSignOut() // tags the sign-out as user-initiated, then signs out
    window.location.href = '/login'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        background: 'rgba(var(--fg-rgb), 0.03)',
        border: '1px solid rgba(var(--fg-rgb), 0.08)',
        borderRadius: '16px',
        padding: '2rem 1.75rem',
        textAlign: 'center',
      }}>
        {/* Lock icon */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: 'rgba(185,28,28,0.15)',
          border: '1px solid rgba(185,28,28,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          fontSize: '22px',
        }}>
          🔒
        </div>

        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '2.5rem',
          color: 'var(--text-strong)',
          letterSpacing: '0.04em',
          lineHeight: 1,
          margin: '0 0 0.75rem',
        }}>
          Access Pending
        </h1>

        <p style={{
          color: 'var(--text-muted)',
          fontSize: '14px',
          lineHeight: '1.6',
          margin: '0 0 1rem',
        }}>
          Your account is waiting for admin approval. Once approved, you'll be
          able to sign in with Google.
        </p>

        {email && (
          <p style={{
            color: 'var(--text-dim)',
            fontSize: '12px',
            fontFamily: "'DM Mono', monospace",
            background: 'rgba(var(--fg-rgb), 0.04)',
            border: '1px solid rgba(var(--fg-rgb), 0.07)',
            borderRadius: '8px',
            padding: '8px 12px',
            margin: '0 0 1.5rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {email}
          </p>
        )}

        {!email && (
          <div style={{ marginBottom: '1.5rem' }} />
        )}

        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            padding: '11px 20px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent, #b91c1c)',
            color: 'var(--text-strong)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            marginBottom: '1rem',
          }}
        >
          Sign Out
        </button>

        <p style={{
          color: 'var(--text-dim)',
          fontSize: '12px',
          margin: 0,
        }}>
          Already approved?{' '}
          <button
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--accent, #b91c1c)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Try signing in again
          </button>
        </p>
      </div>
    </div>
  )
}
