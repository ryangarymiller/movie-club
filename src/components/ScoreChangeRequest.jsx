import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"
const DISPLAY = "'Bebas Neue', sans-serif"

const GREEN = '#86efac'
const AMBER = '#fbbf24'
const RED = '#f87171'

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'

// --- shared helpers (inlined for consistency) ---
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
const AVATAR_COLORS = ['#e11d48', '#db2777', '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#ca8a04']
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function fmtScore(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function Label({ children, style }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)', ...style }}>
      {children}
    </span>
  )
}

function Avatar({ name, size = 28 }) {
  const color = avatarColor(name || '')
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'rgba(var(--fg-rgb),0.05)',
        border: `2px solid ${color}`,
        color,
        fontFamily: MONO,
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        letterSpacing: '0.02em',
        lineHeight: 1,
      }}
    >
      {initials(name) || '?'}
    </span>
  )
}

const STATUS_META = {
  pending: { label: 'Pending', color: AMBER, fill: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)' },
  approved: { label: 'Approved', color: GREEN, fill: 'rgba(134,239,172,0.12)', border: 'rgba(134,239,172,0.4)' },
  denied: { label: 'Denied', color: RED, fill: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.35)' },
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status || 'Unknown', color: 'var(--text-muted)', fill: 'rgba(var(--fg-rgb),0.05)', border: 'rgba(var(--fg-rgb),0.12)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: MONO,
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: meta.color,
        background: meta.fill,
        border: `1px solid ${meta.border}`,
        borderRadius: '999px',
        padding: '3px 9px',
        lineHeight: 1,
      }}
    >
      {meta.label}
    </span>
  )
}

// ============================================================
// Export A — member-facing button + inline request form
// ============================================================
export function ScoreChangeRequestButton({ rating, currentUserId, movieTitle }) {
  const ratingId = rating?.id || null
  const currentScore = rating?.score

  const [latest, setLatest] = useState(null) // most recent request row for this rating (this user)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [scoreInput, setScoreInput] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = useCallback(async () => {
    if (!ratingId || !currentUserId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('score_change_requests')
      .select('id, requested_score, reason, status, admin_note, created_at, resolved_at')
      .eq('rating_id', ratingId)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) {
      setLoadError('Could not load your request status.')
      setLatest(null)
    } else {
      setLatest(data && data.length ? data[0] : null)
    }
    setLoading(false)
  }, [ratingId, currentUserId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await load()
      if (!alive) return
    })()
    return () => { alive = false }
  }, [load])

  const hasPending = latest?.status === 'pending'

  function openForm() {
    setScoreInput(Number.isFinite(Number(currentScore)) ? Number(currentScore).toFixed(2) : '')
    setReason('')
    setFormError(null)
    setOpen(true)
  }

  function closeForm() {
    setOpen(false)
    setFormError(null)
  }

  async function submit(e) {
    e?.preventDefault?.()
    if (submitting || hasPending) return

    const parsed = parseFloat(scoreInput)
    if (!Number.isFinite(parsed)) {
      setFormError('Enter a score between 0.01 and 10.00.')
      return
    }
    const rounded = parseFloat(parsed.toFixed(2))
    if (rounded < 0.01 || rounded > 10.0) {
      setFormError('Score must be between 0.01 and 10.00.')
      return
    }
    if (!ratingId || !currentUserId) {
      setFormError('Missing rating reference.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    const trimmedReason = reason.trim()
    const { error } = await supabase
      .from('score_change_requests')
      .insert({
        rating_id: ratingId,
        user_id: currentUserId,
        requested_score: rounded,
        reason: trimmedReason ? trimmedReason : null,
      })
    if (error) {
      setFormError('Could not submit your request. Please try again.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setOpen(false)
    await load()
  }

  const cardStyle = {
    background: 'var(--surface-2)',
    border: '1px solid rgba(var(--fg-rgb),0.1)',
    borderRadius: '14px',
    padding: '16px',
    maxWidth: '460px',
  }

  if (!ratingId) {
    return (
      <section aria-label="Request score change" style={cardStyle}>
        <Label>Score Change</Label>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Submit a score before requesting a change.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section aria-label="Request score change" aria-busy="true" style={cardStyle}>
        <Label>Score Change</Label>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '10px 0 0' }}>Loading…</p>
      </section>
    )
  }

  const inputId = `scr-input-${ratingId}`
  const reasonId = `scr-reason-${ratingId}`

  return (
    <section aria-label="Request score change" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <Label>Score Change</Label>
        {latest && <StatusPill status={latest.status} />}
      </div>

      {movieTitle && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
          Your locked score for <strong style={{ color: 'var(--text-strong)' }}>{movieTitle}</strong> is{' '}
          <span style={{ fontFamily: MONO, color: 'var(--text-strong)' }}>{fmtScore(currentScore)}</span>.
        </p>
      )}

      {loadError && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 12px' }}>{loadError}</p>
      )}

      {/* Existing latest-request status */}
      {latest && (
        <div
          role="status"
          style={{
            background: (STATUS_META[latest.status] || {}).fill || 'rgba(var(--fg-rgb),0.04)',
            border: `1px solid ${(STATUS_META[latest.status] || {}).border || 'rgba(var(--fg-rgb),0.1)'}`,
            borderRadius: '10px',
            padding: '11px 12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', lineHeight: 1.45 }}>
            {hasPending && <>Request pending admin approval.</>}
            {latest.status === 'approved' && (
              <>Your change to <strong style={{ color: 'var(--text-strong)', fontFamily: MONO }}>{fmtScore(latest.requested_score)}</strong> was approved.</>
            )}
            {latest.status === 'denied' && (
              <>Your request for <strong style={{ color: 'var(--text-strong)', fontFamily: MONO }}>{fmtScore(latest.requested_score)}</strong> was denied.</>
            )}
          </div>
          {(hasPending && Number.isFinite(Number(latest.requested_score))) && (
            <div style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-faint)', marginTop: '5px' }}>
              {fmtScore(currentScore)} → {fmtScore(latest.requested_score)}
            </div>
          )}
          {latest.admin_note && (
            <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', fontStyle: 'italic', lineHeight: 1.4 }}>
              Admin note: {latest.admin_note}
            </div>
          )}
        </div>
      )}

      {/* Inline form */}
      {open ? (
        <form onSubmit={submit}>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor={inputId} style={{ display: 'block', marginBottom: '6px' }}>
              <Label>New score (0.01–10.00)</Label>
            </label>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0.01"
              max="10"
              step="0.01"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              disabled={submitting}
              autoFocus
              aria-label="Requested new score"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '12px',
                fontFamily: MONO,
                fontSize: '15px',
                color: 'var(--text-strong)',
                background: 'rgba(var(--fg-rgb),0.05)',
                border: '1px solid rgba(var(--fg-rgb),0.12)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label htmlFor={reasonId} style={{ display: 'block', marginBottom: '6px' }}>
              <Label>Reason (optional)</Label>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Why are you requesting this change?"
              aria-label="Reason for the score change (optional)"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '12px',
                fontFamily: SANS,
                fontSize: '13px',
                lineHeight: 1.45,
                color: 'var(--text-strong)',
                background: 'rgba(var(--fg-rgb),0.05)',
                border: '1px solid rgba(var(--fg-rgb),0.12)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {formError && (
            <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 12px' }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '12px',
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: '14px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              style={{
                padding: '11px 16px',
                borderRadius: '12px',
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: '14px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                border: '1px solid rgba(var(--fg-rgb),0.12)',
                background: 'rgba(var(--fg-rgb),0.05)',
                color: 'var(--text-strong)',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        hasPending ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'not-allowed',
              opacity: 0.6,
              border: '1px solid rgba(var(--fg-rgb),0.12)',
              background: 'rgba(var(--fg-rgb),0.05)',
              color: 'var(--text-muted)',
            }}
          >
            Request pending approval
          </button>
        ) : (
          <button
            type="button"
            onClick={openForm}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              border: '1px solid rgba(var(--fg-rgb),0.12)',
              background: 'rgba(var(--fg-rgb),0.05)',
              color: 'var(--text-strong)',
            }}
          >
            Request score change
          </button>
        )
      )}
    </section>
  )
}

// ============================================================
// Export B — admin panel: pending requests with approve/deny
// ============================================================
export function ScoreChangeRequestsAdminPanel() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null) // request id currently being resolved
  const [actionError, setActionError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Join users(name) and ratings(score, movie_id -> movies(title)).
    const { data, error: dbErr } = await supabase
      .from('score_change_requests')
      .select(`
        id,
        requested_score,
        reason,
        status,
        created_at,
        rating_id,
        user_id,
        users:user_id ( name, email ),
        ratings:rating_id ( score, movie_id, movies:movie_id ( title ) )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (dbErr) {
      setError('Could not load pending requests.')
      setRequests([])
    } else {
      setRequests(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await load()
      if (!alive) return
    })()
    return () => { alive = false }
  }, [load])

  // Hide the invisible test account entirely.
  const visible = useMemo(
    () => requests.filter(r => !(r.users?.email && r.users.email.toLowerCase() === TEST_EMAIL)),
    [requests]
  )

  async function approve(req) {
    if (busyId) return
    setBusyId(req.id)
    setActionError(null)

    const newScore = parseFloat(Number(req.requested_score).toFixed(2))
    if (!Number.isFinite(newScore) || newScore < 0.01 || newScore > 10.0) {
      setActionError('Requested score is out of range; cannot approve.')
      setBusyId(null)
      return
    }

    // 1) Apply the new score to the underlying rating.
    const { error: ratingErr } = await supabase
      .from('ratings')
      .update({ score: newScore })
      .eq('id', req.rating_id)
    if (ratingErr) {
      setActionError('Could not update the score. No changes were made.')
      setBusyId(null)
      return
    }

    // 2) Mark the request approved.
    const { error: reqErr } = await supabase
      .from('score_change_requests')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', req.id)
    if (reqErr) {
      setActionError('Score updated, but the request status could not be saved. Please refresh.')
    }

    setBusyId(null)
    await load()
  }

  async function deny(req) {
    if (busyId) return
    const note = window.prompt('Optional note to the member explaining the denial (leave blank to skip):', '')
    // A null return means the admin cancelled the prompt — abort the action.
    if (note === null) return

    setBusyId(req.id)
    setActionError(null)
    const trimmed = note.trim()
    const { error: reqErr } = await supabase
      .from('score_change_requests')
      .update({
        status: 'denied',
        admin_note: trimmed ? trimmed : null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.id)
    if (reqErr) {
      setActionError('Could not deny the request. Please try again.')
    }
    setBusyId(null)
    await load()
  }

  const cardStyle = {
    background: 'var(--surface-2)',
    border: '1px solid rgba(var(--fg-rgb),0.1)',
    borderRadius: '14px',
    padding: '16px',
  }

  if (loading) {
    return (
      <section aria-label="Score change requests" aria-busy="true" style={cardStyle}>
        <Label>Score Change Requests</Label>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '10px 0 0' }}>Loading…</p>
      </section>
    )
  }

  return (
    <section aria-label="Score change requests" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <Label>Score Change Requests</Label>
        <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
          {visible.length} pending
        </span>
      </div>

      {error && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 12px' }}>{error}</p>
      )}
      {actionError && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '0 0 12px' }}>{actionError}</p>
      )}

      {visible.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          No pending score change requests.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visible.map(req => {
            const name = req.users?.name || 'Unknown member'
            const title = req.ratings?.movies?.title || 'Unknown film'
            const currentScore = req.ratings?.score
            const isBusy = busyId === req.id
            return (
              <li
                key={req.id}
                style={{
                  background: 'rgba(var(--fg-rgb),0.04)',
                  border: '1px solid rgba(var(--fg-rgb),0.1)',
                  borderRadius: '12px',
                  padding: '12px',
                }}
              >
                {/* Header: member + film */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <Avatar name={name} size={30} />
                  <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                    <div style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      {name}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </div>
                  </div>
                </div>

                {/* Score change */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: req.reason ? '10px' : '12px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                    {fmtScore(currentScore)}
                  </span>
                  <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--text-faint)' }}>→</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: '1.5rem', letterSpacing: '0.03em', color: 'var(--text-strong)', lineHeight: 1 }}>
                    {fmtScore(req.requested_score)}
                  </span>
                </div>

                {/* Reason */}
                {req.reason && (
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: '13px',
                      color: 'var(--text)',
                      lineHeight: 1.45,
                      background: 'rgba(var(--fg-rgb),0.04)',
                      border: '1px solid rgba(var(--fg-rgb),0.08)',
                      borderRadius: '10px',
                      padding: '9px 11px',
                      marginBottom: '12px',
                    }}
                  >
                    {req.reason}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => approve(req)}
                    disabled={isBusy || !!busyId}
                    aria-label={`Approve score change for ${name} on ${title}`}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      fontFamily: SANS,
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: isBusy || busyId ? 'not-allowed' : 'pointer',
                      opacity: busyId && !isBusy ? 0.5 : 1,
                      border: '1px solid rgba(134,239,172,0.4)',
                      background: 'rgba(134,239,172,0.12)',
                      color: GREEN,
                    }}
                  >
                    {isBusy ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deny(req)}
                    disabled={isBusy || !!busyId}
                    aria-label={`Deny score change for ${name} on ${title}`}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      fontFamily: SANS,
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: isBusy || busyId ? 'not-allowed' : 'pointer',
                      opacity: busyId && !isBusy ? 0.5 : 1,
                      border: '1px solid rgba(248,113,113,0.4)',
                      background: 'rgba(248,113,113,0.1)',
                      color: RED,
                    }}
                  >
                    {isBusy ? 'Working…' : 'Deny'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ScoreChangeRequestButton
