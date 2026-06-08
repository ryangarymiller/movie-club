import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useReadjustment } from '../context/ReadjustmentContext'
import { useBackClose } from '../lib/useBackClose'
import FilmTags from './FilmTags'

function validateScore(val) {
  const n = parseFloat(val)
  if (val === '' || val === null || val === undefined) return 'Score is required'
  if (isNaN(n)) return 'Enter a valid number'
  if (n < 0.01 || n > 10.0) return 'Score must be between 0.01 and 10.00'
  return null
}

export default function ScoreModal({ movie, existingRating, onClose, onSaved }) {
  const { profile } = useAuth()
  const { isMonthReadjustable } = useReadjustment()
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
  // Excitement mode only applies to CURRENT (unrevealed) films the user hasn't
  // watched yet. For historical/revealed films (scores_revealed === true) we go
  // straight to final-score entry so a backfilling user never accidentally writes
  // their intended score into pre_watch_excitement.
  const isExcitementMode =
    !finalScoreAlreadySubmitted &&
    !existingRating?.pre_watch_excitement &&
    !movie.scores_revealed
  const isFinalMode =
    !finalScoreAlreadySubmitted &&
    (existingRating?.pre_watch_excitement || movie.scores_revealed) &&
    !existingRating?.score
  // Seasonal readjustment: while the film's season window is open a member may
  // overwrite an already-submitted final score directly (no change request).
  const canReadjust = movie?.month_id ? isMonthReadjustable(movie.month_id) : false
  const isReadjustMode = finalScoreAlreadySubmitted && canReadjust

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Focus input after animation and scroll it into view so it isn't hidden
  // behind the mobile keyboard.
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, 180)
      return () => clearTimeout(t)
    }
  }, [visible])

  // Prefill the input with the current score when readjusting, so the member
  // edits from their existing value rather than a blank field.
  useEffect(() => {
    if (isReadjustMode && existingRating?.score != null) {
      setScoreInput(String(Number(existingRating.score)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadjustMode])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 260)
  }

  // Android/browser Back closes the modal instead of navigating away.
  useBackClose(true, handleClose)

  // Normalize free-text decimal entry instead of relying on <input type=number>,
  // which hands back an empty string for comma-decimal keyboards/locales and
  // various intermediate states — the cause of spurious "value invalid" errors.
  // Accept a comma OR dot as the separator, keep only digits + one separator, and
  // cap to two decimal places.
  function handleInput(e) {
    let v = String(e.target.value).replace(',', '.').replace(/[^\d.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) {
      // keep the first dot, drop any others, and limit to 2 decimals
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2)
    }
    setScoreInput(v)
    setError(null)
    setConfirmBold(false)
  }

  async function handleSubmit() {
    const err = validateScore(scoreInput)
    if (err) { setError(err); return }

    const score = parseFloat(parseFloat(scoreInput).toFixed(2))

    // Bold score confirmation gate (final + readjust modes)
    if ((isFinalMode || isReadjustMode) && !confirmBold && (score > 8.99 || score < 2.01)) {
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

  // Portal to <body> so the modal escapes any transformed/scrolled ancestor
  // (e.g. the film overlay panel, which uses transform: translateY and so would
  // otherwise capture this position:fixed and drop the modal "beneath" the page).
  // zIndex 200 sits above the film overlay (100) and the mobile nav.
  return createPortal((
    <div
      className="mc-modal-backdrop"
      // Inline position:fixed kept so the backdrop is always pinned to the
      // viewport even if the global class is unavailable; the class also adds
      // overflow-y:auto + align-items:flex-start so a focused input stays in
      // view above the mobile keyboard instead of being pushed off the top.
      style={{ position: 'fixed', zIndex: 200 }}
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

        {/* Final score already submitted — locked, UNLESS the season's
            readjustment window is open (then fall through to editable mode). */}
        {(finalScoreAlreadySubmitted && !canReadjust) ? (
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
              {isExcitementMode ? 'Pre-watch excitement' : isReadjustMode ? 'Update your score' : 'Your score'}
            </p>

            {isReadjustMode && (
              <p style={{ fontFamily: "'DM Sans',sans-serif", color: 'var(--accent)', fontSize: '12.5px', margin: '0 0 12px', lineHeight: 1.45 }}>
                Season readjustment is open — change your score freely. It locks again when the window closes.
              </p>
            )}

            {/* Large live echo — always visible above the keyboard on mobile */}
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'center',
              minHeight: '72px', marginBottom: '12px',
              borderRadius: '14px',
              background: scoreInput ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--fg-rgb), 0.03)',
              border: `1px solid ${scoreInput ? 'rgba(var(--accent-rgb), 0.25)' : 'rgba(var(--fg-rgb), 0.06)'}`,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              padding: '12px 16px',
            }}>
              {scoreInput ? (
                <span style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: 'clamp(3rem, 18vw, 5rem)',
                  lineHeight: 1,
                  color: 'var(--accent)',
                  letterSpacing: '0.04em',
                  userSelect: 'none',
                }}>
                  {scoreInput}
                </span>
              ) : (
                <span style={{
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: 'clamp(2rem, 12vw, 3.5rem)',
                  lineHeight: 1,
                  color: 'rgba(var(--fg-rgb), 0.18)',
                  letterSpacing: '0.04em',
                  userSelect: 'none',
                }}>
                  0.00 – 10.00
                </span>
              )}
            </div>

            {/* Score input */}
            <div style={{ position: 'relative', marginBottom: error ? '8px' : '20px' }}>
              <label
                htmlFor="score-input"
                style={{
                  display: 'block',
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  letterSpacing: '0.01em',
                  userSelect: 'none',
                }}
              >
                Tap to enter a score
              </label>
              <input
                id="score-input"
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={scoreInput}
                onChange={handleInput}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="e.g. 7.50"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(var(--fg-rgb), 0.08)',
                  border: `2px solid ${error ? '#ef4444' : 'rgba(var(--fg-rgb), 0.28)'}`,
                  borderRadius: '12px', padding: '15px 16px',
                  fontFamily: "'DM Mono','DM Sans',monospace", fontSize: '18px', letterSpacing: '0.06em',
                  color: 'var(--text-strong)',
                  caretColor: 'var(--accent)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                  WebkitAppearance: 'none', MozAppearance: 'textfield',
                }}
                onFocus={e => {
                  if (!error) e.target.style.borderColor = 'var(--accent)'
                  e.target.style.background = 'rgba(var(--fg-rgb), 0.11)'
                  // Keep input above the mobile keyboard.
                  e.target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
                }}
                onBlur={e => {
                  if (!error) e.target.style.borderColor = 'rgba(var(--fg-rgb), 0.28)'
                  e.target.style.background = 'rgba(var(--fg-rgb), 0.08)'
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <p style={{ color: '#ef4444', fontFamily: "'DM Sans',sans-serif", fontSize: '13px', margin: '0 0 16px' }}>
                {error}
              </p>
            )}

            {/* Recommend outside the club — Yes / No toggle (final + readjust) */}
            {(isFinalMode || isReadjustMode) && (
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

            {/* Tag this film — applied at rating time, aggregated on the film page */}
            {(isFinalMode || isReadjustMode) && profile && (
              <div style={{ marginBottom: '20px' }}>
                <FilmTags movieId={movie.id} userId={profile.id} canEdit compact />
              </div>
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
              {saving ? 'Saving…' : isExcitementMode ? 'Lock In Excitement' : isReadjustMode ? 'Update Score' : 'Submit Score'}
            </button>
          </>
        )}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  ), document.body)
}
