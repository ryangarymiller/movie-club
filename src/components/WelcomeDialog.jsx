import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const rules = [
  'Pick a film you haven\'t personally seen',
  'Submit excitement score before watching',
  'Final scores locked after deadline',
  'Picker identity revealed end of month',
]

export default function WelcomeDialog() {
  const { profile, fetchProfile } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleComplete() {
    if (!profile) return
    setLoading(true)
    await supabase
      .from('users')
      .update({ has_completed_onboarding: true })
      .eq('id', profile.id)
    await fetchProfile(profile.id)
    setLoading(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          background: '#0d0e16',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '2rem',
          width: '100%',
          maxWidth: '380px',
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '2.5rem', lineHeight: 1 }}>
          🎬
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2rem',
            color: '#ffffff',
            margin: '0 0 0.5rem 0',
            textAlign: 'center',
            letterSpacing: '0.04em',
            lineHeight: 1.1,
          }}
        >
          Welcome to Movie Club
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: '#9ca3af',
            margin: '0 0 1.5rem 0',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Every month, each member picks a film no one&rsquo;s seen. Watch, score, compete. No spoilers.
        </p>

        {/* Rules list */}
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 1.75rem 0',
          }}
        >
          {rules.map((rule) => (
            <li
              key={rule}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '11px',
                color: '#4b5563',
                margin: '4px 0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                lineHeight: 1.5,
              }}
            >
              <span style={{ flexShrink: 0, marginTop: '1px' }}>·</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        {/* CTA button */}
        <button
          onClick={handleComplete}
          disabled={loading}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '14px',
            width: '100%',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1.2rem',
            letterSpacing: '0.05em',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {loading ? 'One moment…' : "Let's go →"}
        </button>
      </div>
    </div>
  )
}
