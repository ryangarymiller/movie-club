import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function clampScore(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return null
  return Math.min(10.0, Math.max(0.01, n))
}

function validateScore(val) {
  const n = parseFloat(val)
  if (val === '' || val === null || val === undefined) return 'Score is required'
  if (isNaN(n)) return 'Enter a valid number'
  if (n < 0.01 || n > 10.0) return 'Score must be between 0.01 and 10.00'
  return null
}

export default function ScoreModal({ movie, existingRating, onClose, onSaved }) {
  const { profile } = useAuth()
  const [scoreInput, setScoreInput] = useState('')
  const [recommendOutside, setRecommendOutside] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmBold, setConfirmBold] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)

  const isExcitementMode = !existingRating?.pre_watch_excitement
  const isFinalMode = existingRating?.pre_watch_excitement && !existingRating?.score

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Focus input after animation
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 180)
      return () => clearTimeout(t)
    }
  }, [visible])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 260)
  }

  function handleInput(e) {
    setScoreInput(e.target.value)
    setError(null)
    setConfirmBold(false)
  }

  async function handleSubmit() {
    const err = validateScore(scoreInput)
    if (err) { setError(err); return }

    const score = parseFloat(parseFloat(scoreInput).toFixed(2))

    // Bold score confirmation gate (final mode only)
    if (isFinalMode && !confirmBold && (score > 8.99 || score < 2.01)) {
      setConfirmBold(true)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = isExcitementMode
        ? { pre_watch_excitement: score }
        : { score, recommend_outside_club: recommendOutside, submitted_at: new Date().toISOString() }

      const { error: dbErr } = await supabase
        .from('ratings')
        .upsert(
          { movie_id: movie.id, user_id: profile.id, ...payload },
          { onConflict: 'movie_id,user_id' }
        )

      if (dbErr) throw dbErr
      onSaved()
      handleClose()
    } catch (e) {
      setError(e.message ?? 'Something went wrong. Try again.')
      setSaving(false)
    }
  }

  const excitementLocked = existingRating?.pre_watch_excitement
    ? Number(existingRating.pre_watch_excitement).toFixed(2)
    : null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.72)',
          transition: 'opacity 0.25s ease',
          opacity: visible ? 1 : 0,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'relative',
          background: '#0f1018',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px 20px 0 0',
          padding: '0 1rem 2rem',
          width: '100%',
          boxSizing: 'border-box',
          transition: 'transform 0.26s cubic-bezier(0.32,0.72,0,1)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          maxWidth: '560px',
          marginLeft: 'auto',
          marginRight: 'auto',
          willChange: 'transform',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', marginBottom: '20px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Film row */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ flexShrink: 0, width: '44px', height: '62px', borderRadius: '6px', overflow: 'hidden', background: '#1a1b25' }}>
            {movie.poster_url ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`}
                alt={movie.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(255,255,255,0.15)', fontSize: '14px' }}>
                  {movie.title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'white', fontSize: '1.25rem', letterSpacing: '0.03em', margin: 0, lineHeight: 1.1 }}>
              {movie.title}
            </p>
            {movie.year_released && (
              <p style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '11px', margin: '2px 0 0' }}>
                {movie.year_released}{movie.director ? ` · ${movie.director}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Locked excitement (shown in final score mode) */}
        {excitementLocked && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
          }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: '#4b5563', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Pre-watch excitement
            </span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
              {excitementLocked}
            </span>
          </div>
        )}

        {/* Bold score confirmation */}
        {confirmBold ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem', color: 'white', letterSpacing: '0.03em', margin: '0 0 6px' }}>
              Are you sure?
            </p>
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: '#9ca3af', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
              That's a bold score.{' '}
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1.1rem', verticalAlign: 'middle' }}>
                {parseFloat(scoreInput).toFixed(2)}
              </span>
              {' '}will be permanently locked once confirmed.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmBold(false)}
                style={{
                  flex: 1, padding: '13px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
                  fontSize: '14px', cursor: 'pointer',
                }}
              >
                Go Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 1, padding: '13px', borderRadius: '12px',
                  background: 'var(--accent)', border: 'none',
                  color: 'white', fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                  fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Score label */}
            <p style={{ fontFamily: "'DM Mono',monospace", color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
              {isExcitementMode ? 'Pre-watch excitement' : 'Your score'}
            </p>

            {/* Score input */}
            <div style={{ position: 'relative', marginBottom: error ? '8px' : '20px' }}>
              <input
                ref={inputRef}
                type="number"
                min="0.01"
                max="10.00"
                step="0.01"
                value={scoreInput}
                onChange={handleInput}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="0.00 – 10.00"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '12px', padding: '14px 16px',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: '2rem', letterSpacing: '0.05em',
                  color: 'white', outline: 'none',
                  transition: 'border-color 0.15s ease',
                  WebkitAppearance: 'none', MozAppearance: 'textfield',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>

            {/* Error */}
            {error && (
              <p style={{ color: '#ef4444', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', margin: '0 0 16px' }}>
                {error}
              </p>
            )}

            {/* Recommend checkbox (final mode only) */}
            {isFinalMode && (
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  marginBottom: '20px', cursor: 'pointer',
                }}
              >
                <div
                  onClick={() => setRecommendOutside(v => !v)}
                  style={{
                    width: '20px', height: '20px', flexShrink: 0,
                    borderRadius: '6px', border: `2px solid ${recommendOutside ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
                    background: recommendOutside ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {recommendOutside && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontFamily: "'DM Sans',sans-serif", color: '#9ca3af', fontSize: '14px', userSelect: 'none' }}>
                  Would recommend outside the club
                </span>
              </label>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                width: '100%', padding: '15px',
                borderRadius: '14px', border: 'none',
                background: 'var(--accent)', color: 'white',
                fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                fontSize: '15px', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'opacity 0.15s ease',
                letterSpacing: '0.01em',
              }}
            >
              {saving ? 'Saving…' : isExcitementMode ? 'Lock In Excitement' : 'Submit Score'}
            </button>
          </>
        )}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  )
}
