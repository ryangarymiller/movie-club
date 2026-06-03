import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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
  // null = unanswered, true = yes, false = no. Seeded from any existing rating.
  const [recommendOutside, setRecommendOutside] = useState(
    existingRating?.recommend_outside_club != null
      ? !!existingRating.recommend_outside_club
      : null
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmBold, setConfirmBold] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)

  // If the final score is already submitted, excitement scoring is no longer available.
  // Skip excitement step and go straight to final score (or locked) mode.
  const finalScoreAlreadySubmitted = existingRating?.score != null
  const isExcitementMode = !finalScoreAlreadySubmitted && !existingRating?.pre_watch_excitement
  const isFinalMode = !finalScoreAlreadySubmitted && existingRating?.pre_watch_excitement && !existingRating?.score

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
      // Fire onSaved so the parent film page refetches (revealing the
      // review/discussion section) before the modal unmounts.
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
      className="mc-modal-backdrop"
      // Inline position:fixed kept so the backdrop is always pinned to the
      // viewport even if the global class is unavailable; the class also adds
      // overflow-y:auto + align-items:flex-start so a focused input stays in
      // view above the mobile keyboard instead of being pushed off the top.
      style={{ position: 'fixed', zIndex: 50 }}
    >
      {/* Backdrop (click-to-close) */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.72)',
          transition: 'opacity 0.25s ease',
          opacity: visible ? 1 : 0,
        }}
      />

      {/* Panel */}
      <div
        className="mc-modal-panel"
        style={{
          position: 'relative',
          background: 'var(--surface)',
          border: '1px solid rgba(var(--fg-rgb), 0.08)',
          borderRadius: '20px',
          padding: '0 1rem 1.5rem',
          boxSizing: 'border-box',
          transition: 'transform 0.26s cubic-bezier(0.32,0.72,0,1), opacity 0.26s ease',
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          opacity: visible ? 1 : 0,
          maxWidth: '480px',
          willChange: 'transform, opacity',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', marginBottom: '20px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(var(--fg-rgb), 0.12)' }} />
        </div>

        {/* Film row */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ flexShrink: 0, width: '44px', height: '62px', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)' }}>
            {movie.poster_url ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${movie.poster_url}`}
                alt={movie.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'rgba(var(--fg-rgb), 0.15)', fontSize: '14px' }}>
                  {movie.title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-strong)', fontSize: '1.25rem', letterSpacing: '0.03em', margin: 0, lineHeight: 1.1 }}>
              {movie.title}
            </p>
            {movie.year_released && (
              <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '11px', margin: '2px 0 0' }}>
                {movie.year_released}{movie.director ? ` · ${movie.director}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Locked excitement (shown in final score mode) */}
        {excitementLocked && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(var(--fg-rgb), 0.03)', border: '1px solid rgba(var(--fg-rgb), 0.07)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
          }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Pre-watch excitement
            </span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', color: 'rgba(var(--fg-rgb), 0.35)', letterSpacing: '0.05em' }}>
              {excitementLocked}
            </span>
          </div>
        )}

        {/* Final score already submitted — excitement scoring locked */}
        {finalScoreAlreadySubmitted ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem', color: 'var(--text-strong)', letterSpacing: '0.03em', margin: '0 0 8px' }}>
              Score Locked
            </p>
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-dim)', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.5 }}>
              Your final score has already been submitted.{' '}
              Pre-watch excitement scoring is no longer available.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              {excitementLocked && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                    Excitement
                  </p>
                  <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.5rem', color: 'rgba(var(--fg-rgb), 0.4)', margin: 0 }}>
                    {excitementLocked}
                  </p>
                </div>
              )}
              {excitementLocked && (
                <span style={{ color: 'rgba(var(--fg-rgb), 0.2)', fontSize: '18px' }}>→</span>
              )}
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                  Final Score
                </p>
                <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.5rem', color: 'var(--accent)', margin: 0 }}>
                  {Number(existingRating.score).toFixed(2)}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: '100%', padding: '13px',
                borderRadius: '12px', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                background: 'rgba(var(--fg-rgb), 0.06)', color: 'var(--text-strong)',
                fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
                fontSize: '14px', cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        ) : confirmBold ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem', color: 'var(--text-strong)', letterSpacing: '0.03em', margin: '0 0 6px' }}>
              Are you sure?
            </p>
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
              That's a {parseFloat(scoreInput) >= 9 ? 'very high' : 'very low'} score.{' '}
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)', fontSize: '1.1rem', verticalAlign: 'middle' }}>
                {parseFloat(scoreInput).toFixed(2)}
              </span>
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmBold(false)}
                style={{
                  flex: 1, padding: '13px', borderRadius: '12px',
                  background: 'rgba(var(--fg-rgb), 0.06)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                  color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
                  fontSize: '14px', cursor: 'pointer',
                }}
              >
                Wait, go back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 1, padding: '13px', borderRadius: '12px',
                  background: 'var(--accent)', border: 'none',
                  color: 'var(--text-strong)', fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                  fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : `Yes, submit ${parseFloat(scoreInput).toFixed(2)}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Score label */}
            <p style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
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
                  background: 'rgba(var(--fg-rgb), 0.04)', border: `1px solid ${error ? '#ef4444' : 'rgba(var(--fg-rgb), 0.1)'}`,
                  borderRadius: '12px', padding: '14px 16px',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: '2rem', letterSpacing: '0.05em',
                  color: 'var(--text-strong)', outline: 'none',
                  transition: 'border-color 0.15s ease',
                  WebkitAppearance: 'none', MozAppearance: 'textfield',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(var(--fg-rgb), 0.1)' }}
              />
            </div>

            {/* Error */}
            {error && (
              <p style={{ color: '#ef4444', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', margin: '0 0 16px' }}>
                {error}
              </p>
            )}

            {/* Recommend outside the club — Yes / No toggle (final mode only) */}
            {isFinalMode && (
              <label
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
                  marginBottom: '20px', cursor: 'default',
                }}
              >
                {/* Yes pill is the label's firstChild so its checkmark reflects state */}
                <button
                  type="button"
                  onClick={() => { setRecommendOutside(true); setError(null) }}
                  style={{
                    flex: '1 1 0', minWidth: '90px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '11px', borderRadius: '10px',
                    border: `1px solid ${recommendOutside === true ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.12)'}`,
                    background: recommendOutside === true ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.04)',
                    color: recommendOutside === true ? 'white' : 'var(--text-muted)',
                    fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: '14px',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {recommendOutside === true && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => { setRecommendOutside(false); setError(null) }}
                  style={{
                    flex: '1 1 0', minWidth: '90px',
                    padding: '11px', borderRadius: '10px',
                    border: `1px solid ${recommendOutside === false ? 'var(--accent)' : 'rgba(var(--fg-rgb), 0.12)'}`,
                    background: recommendOutside === false ? 'rgba(var(--fg-rgb), 0.12)' : 'rgba(var(--fg-rgb), 0.04)',
                    color: recommendOutside === false ? 'var(--text-strong)' : 'var(--text-muted)',
                    fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: '14px',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  No
                </button>
                <span style={{ flexBasis: '100%', fontFamily: "'DM Sans',sans-serif", color: 'var(--text-faint)', fontSize: '12px', userSelect: 'none' }}>
                  Would you recommend this outside the club?
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
                background: 'var(--accent)', color: 'var(--text-strong)',
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
