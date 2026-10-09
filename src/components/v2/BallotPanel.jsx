// VOTING phase: rank your top 3 (or all of them, when fewer than 3 remain). Tap a film to
// give it the next free rank; tap again to clear it; reorder with the arrows. No running
// tally is ever shown — elections_safe only carries one after the vote closes (Q3).

import { useState } from 'react'
import { ballotPoints, castBallot } from '../../lib/v2'
import ProgressRoster from './ProgressRoster'
import { friendlyError, genreText, ordinal } from './thisMonthHelpers'
import { Button, Card, EmptyState, ErrorNote, MONO, Poster, SANS, SectionLabel } from './thisMonthUi'

export default function BallotPanel({ election, candidates = [], myBallot = [], weights, voteProgress = [], users = [], profileId, onCast }) {
  // Only keep ballot ids that are still candidates (defensive against a stale list).
  const candidateIds = new Set(candidates.map(c => c.id))
  const existing = myBallot.filter(id => candidateIds.has(id))
  const [editing, setEditing] = useState(existing.length === 0)
  const [ranked, setRanked] = useState(existing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [announce, setAnnounce] = useState('')

  const maxRanks = Math.min(3, candidates.length)
  const byId = new Map(candidates.map(c => [c.id, c]))
  const titleOf = id => byId.get(id)?.title ?? 'A film'
  const pts = rank => ballotPoints(rank, weights)

  function toggle(id) {
    setError(null)
    if (ranked.includes(id)) {
      const next = ranked.filter(x => x !== id)
      setRanked(next)
      setAnnounce(`${titleOf(id)} removed from your ballot.${next.length ? ` ${describe(next)}` : ''}`)
      return
    }
    if (ranked.length >= maxRanks) {
      setAnnounce(`You've already ranked ${maxRanks}. Clear one to swap it.`)
      return
    }
    const next = [...ranked, id]
    setRanked(next)
    setAnnounce(`${titleOf(id)} ranked ${ordinal(next.length)}, worth ${pts(next.length)} points.`)
  }

  function move(index, dir) {
    const to = index + dir
    if (to < 0 || to >= ranked.length) return
    const next = ranked.slice()
    ;[next[index], next[to]] = [next[to], next[index]]
    setRanked(next)
    setAnnounce(`${titleOf(next[to])} moved to ${ordinal(to + 1)}. ${describe(next)}`)
  }

  function describe(list) {
    return `Your ranking: ${list.map((id, i) => `${ordinal(i + 1)} ${titleOf(id)}`).join(', ')}.`
  }

  async function submit() {
    if (!ranked.length || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await castBallot(election.id, ranked)
      setEditing(false)
      setAnnounce('Your ballot is in.')
      await onCast?.()
    } catch (e) {
      setError(friendlyError(e.message))
    } finally {
      setSubmitting(false)
    }
  }

  const roster = (
    <section aria-labelledby="v2-vote-progress">
      <SectionLabel id="v2-vote-progress">Who's voted</SectionLabel>
      <ProgressRoster
        label="Voting progress"
        verb="voted"
        viewerId={profileId}
        users={users}
        entries={voteProgress.map(v => ({ user_id: v.user_id, name: v.name, done: !!v.has_voted }))}
      />
    </section>
  )

  if (!candidates.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <EmptyState icon="🗳️" title="No films to vote on">The list is empty — an admin can close the month to start a new one.</EmptyState>
        {roster}
      </div>
    )
  }

  // ── Already voted ──
  if (!editing && existing.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <p aria-live="polite" className="sr-only">{announce}</p>
        <section aria-labelledby="v2-you-voted">
          <SectionLabel id="v2-you-voted">Your ballot</SectionLabel>
          <Card accent style={{ padding: '14px' }}>
            <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '15px', margin: '0 0 10px' }}>
              ✓ You voted
            </p>
            <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {existing.map((id, i) => (
                <li key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <RankBadge rank={i + 1} />
                  <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, color: 'var(--text)', fontSize: '14px' }}>{titleOf(id)}</span>
                  <span style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px' }}>{pts(i + 1)} pts</span>
                </li>
              ))}
            </ol>
            <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.5 }}>
              The results stay hidden until everyone has voted. You can change your ballot until then.
            </p>
            <Button tone="secondary" size="sm" onClick={() => { setRanked(existing); setEditing(true) }}>Change my vote</Button>
          </Card>
        </section>
        {roster}
      </div>
    )
  }

  // ── Ballot editor ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <p aria-live="polite" className="sr-only">{announce}</p>

      <section aria-labelledby="v2-ballot">
        <SectionLabel id="v2-ballot" right={
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-faint)' }}>{ranked.length}/{maxRanks} ranked</span>
        }>
          {maxRanks < 3 ? `Rank all ${maxRanks}` : 'Rank your top 3'}
        </SectionLabel>

        <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 12px', lineHeight: 1.5 }}>
          Tap films in the order you'd most like to watch them.{' '}
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-faint)' }}>
            {[1, 2, 3].slice(0, maxRanks).map(r => `${ordinal(r)} = ${pts(r)} pts`).join(' · ')}
          </span>
        </p>

        <ul aria-label="Candidates" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {candidates.map(c => {
            const rank = ranked.indexOf(c.id) + 1
            const meta = c.metadata ?? {}
            const yours = c.user_id && c.user_id === profileId
            const blocked = !rank && ranked.length >= maxRanks
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={rank > 0}
                  aria-label={rank
                    ? `${c.title}, ranked ${ordinal(rank)}. Tap to clear.`
                    : `Rank ${c.title}${blocked ? ' (clear a film first)' : ''}`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                    borderRadius: '14px', textAlign: 'left', cursor: 'pointer',
                    background: rank ? 'rgba(var(--accent-rgb), 0.09)' : 'rgba(var(--fg-rgb), 0.025)',
                    border: `1px solid ${rank ? 'rgba(var(--accent-rgb), 0.45)' : 'rgba(var(--fg-rgb), 0.07)'}`,
                    opacity: blocked ? 0.55 : 1,
                    transition: 'background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
                  }}
                >
                  <Poster path={c.poster_url} title={c.title} width={40} size="w92" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '14px', lineHeight: 1.25 }}>
                      {c.title}
                      {yours && <span style={{ marginLeft: '6px', fontFamily: MONO, fontSize: '9px', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-light)' }}>yours</span>}
                    </span>
                    <span style={{ display: 'block', fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', marginTop: '2px' }}>
                      {[meta.year, meta.director, genreText(meta.genre)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {rank ? (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <RankBadge rank={rank} />
                      <span style={{ fontFamily: MONO, color: 'var(--accent-light)', fontSize: '10px' }}>{pts(rank)} pts</span>
                    </span>
                  ) : (
                    <span aria-hidden="true" style={{
                      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                      border: '1.5px dashed rgba(var(--fg-rgb), 0.2)',
                    }} />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="v2-your-ranking">
        <SectionLabel id="v2-your-ranking">Your ranking</SectionLabel>
        {ranked.length === 0 ? (
          <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: '0 0 12px' }}>
            Nothing ranked yet — pick at least one film.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ranked.map((id, i) => (
              <li key={id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                borderRadius: '12px', background: 'rgba(var(--fg-rgb), 0.03)',
              }}>
                <RankBadge rank={i + 1} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, color: 'var(--text)', fontSize: '14px', overflowWrap: 'anywhere' }}>{titleOf(id)}</span>
                <IconBtn label={`Move ${titleOf(id)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                <IconBtn label={`Move ${titleOf(id)} down`} disabled={i === ranked.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                <IconBtn label={`Remove ${titleOf(id)}`} onClick={() => toggle(id)}>×</IconBtn>
              </li>
            ))}
          </ol>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ErrorNote error={error} onDismiss={() => setError(null)} />
          <div style={{ display: 'flex', gap: '8px' }}>
            {existing.length > 0 && (
              <Button tone="secondary" style={{ flex: 1 }} disabled={submitting} onClick={() => { setRanked(existing); setEditing(false); setError(null) }}>
                Cancel
              </Button>
            )}
            <Button size="lg" style={{ flex: 2 }} busy={submitting} disabled={!ranked.length} onClick={submit}>
              {submitting ? 'Submitting…' : existing.length ? 'Update my vote' : 'Submit my vote'}
            </Button>
          </div>
        </div>
      </section>

      {roster}
    </div>
  )
}

function RankBadge({ rank }) {
  return (
    <span aria-hidden="true" style={{
      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: rank === 1 ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.22)',
      color: 'var(--text-strong)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.05rem', letterSpacing: '0.02em',
    }}>
      {ordinal(rank)}
    </span>
  )
}

function IconBtn({ label, children, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
        border: '1px solid rgba(var(--fg-rgb), 0.1)', background: 'transparent',
        color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  )
}
