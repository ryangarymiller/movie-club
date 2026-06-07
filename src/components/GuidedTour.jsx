import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTour } from '../context/TourContext'

// A skippable, replayable guided tour. Opens automatically for members who haven't
// completed onboarding, and on demand via useTour().startTour() (Profile → replay).
// A modal carousel (no DOM anchoring) so it works identically on mobile + desktop
// and regardless of which page you're on.

const STEPS = [
  {
    glyph: '🎬',
    title: 'Welcome to Movie Club',
    body: 'Every month, each member picks a film no one has seen. Everyone watches all of them, scores them, and talks it out — no spoilers before the reveal.',
  },
  {
    glyph: '🗓️',
    title: 'This Month',
    body: 'Pick your movie for next month and submit scores for this one. Submit a pre-watch excitement score first; your final score locks once you submit it. Picker identities stay secret until the end-of-month reveal.',
  },
  {
    glyph: '🎞️',
    title: 'Films',
    body: 'Browse every film the club has watched — sort and filter, and open any film for its scores, reviews, cast & crew, and discussion. Flip on the “To score” filter to find films you still need to rate.',
  },
  {
    glyph: '📊',
    title: 'Stats',
    body: 'See your taste vs. the club: score trends, genre breakdowns, head-to-head, and the Connection Web that links films by shared cast, writers, and directors.',
  },
  {
    glyph: '🏆',
    title: 'Awards',
    body: 'Monthly, seasonal, annual, and all-time honors — Pick of the Month, Most Divisive, the Auteur, and more — plus an AI recap and Best Review each month.',
  },
  {
    glyph: '🔔',
    title: 'Stay in the loop',
    body: 'The bell flags new months, reveals, replies, and @mentions. Fine-tune what you get (and quiet hours) under Profile → Notifications.',
  },
  {
    glyph: '⚙️',
    title: 'Make it yours',
    body: 'Set your color, avatar, theme, timezone, and default film sort in Profile — and export your data anytime. You can replay this tour from Profile → Preferences whenever you like.',
  },
]

export default function GuidedTour() {
  const { profile, fetchProfile } = useAuth()
  const { tourOpen, closeTour } = useTour()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const needsOnboarding = !!profile && !profile.has_completed_onboarding
  const open = !!profile && (needsOnboarding || tourOpen)

  // Restart at step 0 each time the tour (re)opens.
  useEffect(() => { if (open) setStep(0) }, [open])

  // Keyboard nav (Esc skips, arrows move) while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setStep(s => Math.min(STEPS.length - 1, s + 1))
      else if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  async function finish() {
    if (busy) return
    setBusy(true)
    if (needsOnboarding && profile) {
      await supabase.from('users').update({ has_completed_onboarding: true }).eq('id', profile.id)
      await fetchProfile(profile.id)
    }
    setBusy(false)
    setStep(0)
    closeTour()
  }

  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guided tour"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div
        key={step}
        style={{
          background: 'var(--surface)', border: '1px solid rgba(var(--fg-rgb), 0.08)',
          borderRadius: '20px', padding: '2rem 1.75rem 1.5rem', width: '100%', maxWidth: '400px',
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)', animation: 'fadeUp 0.28s ease both',
        }}
      >
        {/* Step counter + skip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={finish}
            disabled={busy}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontFamily: "'DM Mono',monospace", fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer' }}
          >
            {needsOnboarding ? 'Skip' : 'Close'}
          </button>
        </div>

        {/* Glyph */}
        <div style={{ textAlign: 'center', fontSize: '2.6rem', lineHeight: 1, marginBottom: '0.85rem' }} aria-hidden="true">{s.glyph}</div>

        {/* Title */}
        <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2rem', color: 'var(--text-strong)', margin: '0 0 0.6rem', textAlign: 'center', letterSpacing: '0.04em', lineHeight: 1.1 }}>
          {s.title}
        </h1>

        {/* Body */}
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 1.5rem', textAlign: 'center', lineHeight: 1.55, minHeight: '4.2em' }}>
          {s.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '1.25rem' }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              style={{
                width: i === step ? '20px' : '7px', height: '7px', borderRadius: '999px', border: 'none', padding: 0,
                background: i === step ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.18)',
                cursor: 'pointer', transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              style={{ flex: '0 0 auto', padding: '13px 18px', borderRadius: '11px', border: '1px solid rgba(var(--fg-rgb), 0.14)', background: 'transparent', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setStep(s => s + 1))}
            disabled={busy}
            style={{ flex: 1, padding: '13px', borderRadius: '11px', border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: '0.05em', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'One moment…' : isLast ? (needsOnboarding ? "Let's go →" : 'Done') : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
