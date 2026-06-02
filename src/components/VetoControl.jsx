import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"
const DISPLAY = "'Bebas Neue', sans-serif"

const AMBER = '#fbbf24'

export default function VetoControl({ movieId, currentUserId, totalActiveMembers, threshold }) {
  const vetoThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 3

  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true)
    if (!movieId) {
      setLoading(false)
      setError('No film specified.')
      return
    }
    setError(null)
    const { data, error: dbErr } = await supabase
      .from('veto_votes')
      .select('id, voting_user_id')
      .eq('movie_id', movieId)
    if (dbErr) {
      setError('Could not load veto votes.')
      setVotes([])
    } else {
      setVotes(data ?? [])
    }
    setLoading(false)
  }, [movieId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await load({ showSpinner: true })
      if (!alive) return
    })()
    return () => { alive = false }
  }, [load])

  const count = votes.length
  const hasVoted = votes.some(v => v.voting_user_id === currentUserId)
  const reached = count >= vetoThreshold

  async function toggleVeto() {
    if (submitting || !currentUserId || !movieId) return
    setSubmitting(true)
    setError(null)

    // Optimistic update
    const prev = votes
    if (hasVoted) {
      setVotes(votes.filter(v => v.voting_user_id !== currentUserId))
      const { error: dbErr } = await supabase
        .from('veto_votes')
        .delete()
        .eq('movie_id', movieId)
        .eq('voting_user_id', currentUserId)
      if (dbErr) {
        setVotes(prev)
        setError('Could not withdraw your veto. Try again.')
      } else {
        await load()
      }
    } else {
      const tempId = `temp-${currentUserId}`
      setVotes([...votes, { id: tempId, voting_user_id: currentUserId }])
      const { error: dbErr } = await supabase
        .from('veto_votes')
        .insert({ movie_id: movieId, voting_user_id: currentUserId })
      if (dbErr) {
        // UNIQUE conflict means it already exists — treat as success, just resync
        if (dbErr.code !== '23505') {
          setVotes(prev)
          setError('Could not submit your veto. Try again.')
        } else {
          await load()
        }
      } else {
        await load()
      }
    }
    setSubmitting(false)
  }

  // Progress bar fill ratio, capped at 1
  const fillRatio = Math.min(1, count / vetoThreshold)

  return (
    <section
      aria-label="Veto voting"
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${reached ? 'rgba(251,191,36,0.35)' : 'rgba(var(--fg-rgb),0.1)'}`,
        borderRadius: '14px',
        padding: '16px',
        maxWidth: '460px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
          Veto
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: '1.25rem', letterSpacing: '0.04em', color: reached ? AMBER : 'var(--text-strong)', lineHeight: 1 }}>
          {loading ? '—' : `${count} / ${vetoThreshold}`}
          <span style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-faint)', textTransform: 'uppercase', marginLeft: '6px' }}>
            {count === 1 ? 'veto' : 'vetoes'}
          </span>
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={vetoThreshold}
        aria-valuenow={count}
        aria-label={`${count} of ${vetoThreshold} vetoes`}
        style={{
          height: '6px',
          borderRadius: '999px',
          background: 'rgba(var(--fg-rgb),0.07)',
          overflow: 'hidden',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${fillRatio * 100}%`,
            borderRadius: '999px',
            background: reached ? AMBER : 'var(--accent)',
            transition: 'width 0.25s ease',
          }}
        />
      </div>

      {/* Threshold-reached banner */}
      {reached && !loading && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: '10px',
            padding: '10px 12px',
            marginBottom: '14px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M12 3 1.5 21h21L12 3Z" stroke={AMBER} strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 10v4" stroke={AMBER} strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17.5" r="1.1" fill={AMBER} />
          </svg>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
            Veto threshold reached — picker must resubmit.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: '#f87171', margin: '0 0 12px' }}>
          {error}
        </p>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={toggleVeto}
        disabled={loading || submitting || !currentUserId}
        aria-pressed={hasVoted}
        aria-label={hasVoted ? 'Withdraw veto' : 'Veto this pick'}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '12px',
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: '14px',
          letterSpacing: '0.01em',
          cursor: loading || submitting || !currentUserId ? 'not-allowed' : 'pointer',
          opacity: loading || submitting || !currentUserId ? 0.6 : 1,
          transition: 'opacity 0.15s ease, background 0.15s ease',
          border: hasVoted ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(var(--fg-rgb),0.12)',
          background: hasVoted ? 'rgba(248,113,113,0.12)' : 'rgba(var(--fg-rgb),0.05)',
          color: hasVoted ? '#f87171' : 'var(--text-strong)',
        }}
      >
        {submitting ? 'Saving…' : hasVoted ? 'Withdraw veto' : 'Veto this pick'}
      </button>

      {/* Helper line */}
      {Number.isFinite(totalActiveMembers) && totalActiveMembers > 0 && !loading && (
        <p style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', margin: '10px 0 0', textAlign: 'center' }}>
          {vetoThreshold} of {totalActiveMembers} members needed to force a resubmit
        </p>
      )}
    </section>
  )
}
