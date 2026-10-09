// The cycle reveal (B7 / C6b / C7b): once the last member scores, the submitter, the frozen
// tally and every member's ballot become visible together, alongside the club average.

import { useEffect, useState } from 'react'
import Avatar from '../Avatar'
import { useMemberOverlay } from '../../context/MemberOverlayContext'
import { formatScore, groupBallots, loadElectionBallots, ordinal } from './thisMonthHelpers'
import { Card, DISPLAY, MONO, Poster, SANS, SectionLabel, Skeleton } from './thisMonthUi'

export default function CycleReveal({ film, election, submissions = [], users = [], clubAvg, onOpenFilm }) {
  const { openMember } = useMemberOverlay()
  const electionId = election?.id ?? null
  const [ballots, setBallots] = useState({ id: null, rows: [], error: null })

  useEffect(() => {
    if (!electionId) return undefined
    let cancelled = false
    loadElectionBallots(electionId)
      .then(rows => { if (!cancelled) setBallots({ id: electionId, rows, error: null }) })
      .catch(e => { if (!cancelled) setBallots({ id: electionId, rows: [], error: e.message }) })
    return () => { cancelled = true }
  }, [electionId])

  const ballotsLoading = !!electionId && ballots.id !== electionId
  const submitter = users.find(u => u.id === film.picked_by_user_id) ?? null
  const tally = Array.isArray(election?.tally) ? election.tally : []
  const maxPts = Math.max(1, ...tally.map(t => t.points ?? 0))
  const winnerId = election?.winner_submission_id ?? film.submission_id
  const titles = new Map([...submissions.map(s => [s.id, s.title]), ...tally.map(t => [t.submission_id, t.title])])
  const grouped = groupBallots(ballots.rows)
    .map(b => ({ ...b, user: users.find(u => u.id === b.user_id) }))
    .sort((a, b) => String(a.user?.name ?? '').localeCompare(String(b.user?.name ?? '')))
  const unopposed = !ballotsLoading && tally.length <= 1 && grouped.length === 0

  return (
    <Card as="section" aria-labelledby="v2-reveal-title" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Film + club average */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <button type="button" onClick={onOpenFilm} disabled={!onOpenFilm} aria-label={`Open ${film.title}`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenFilm ? 'pointer' : 'default' }}>
          <Poster path={film.poster_url} title={film.title} width={64} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id="v2-reveal-title" style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '16px', margin: '0 0 4px', lineHeight: 1.25 }}>
            {film.title}
          </h3>
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: 0 }}>
            {[film.year_released, film.director].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            <span aria-hidden="true">👥 </span>Club avg
          </p>
          <p style={{ fontFamily: DISPLAY, color: 'var(--accent-light)', fontSize: '2.1rem', lineHeight: 1, margin: '2px 0 0' }}>
            {clubAvg ? formatScore(clubAvg.avg) : '—'}
          </p>
          {clubAvg && <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', margin: 0 }}>{clubAvg.count} scores</p>}
        </div>
      </div>

      {/* Who submitted it */}
      <div>
        <SectionLabel>Put on the list by</SectionLabel>
        {submitter ? (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <button type="button" onClick={() => openMember(submitter.id)} aria-label={`Open ${submitter.name}'s profile`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <Avatar user={submitter} size={40} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button type="button" onClick={() => openMember(submitter.id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '15px' }}>
                {submitter.name}
              </button>
              {film.pick_justification && (
                <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', fontStyle: 'italic', lineHeight: 1.5, margin: '4px 0 0' }}>
                  “{film.pick_justification}”
                </p>
              )}
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>Submitter not available.</p>
        )}
      </div>

      {/* Frozen tally */}
      <div>
        <SectionLabel>How the vote went</SectionLabel>
        {tally.length === 0 ? (
          <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>No tally recorded for this vote.</p>
        ) : (
          <ol aria-label="Final tally" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tally.map((t, i) => {
              const win = t.submission_id === winnerId
              return (
                <li key={t.submission_id ?? i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: SANS, fontSize: '13px', color: win ? 'var(--text-strong)' : 'var(--text-dim)', fontWeight: win ? 600 : 400, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {win && <span aria-hidden="true">🏆 </span>}{t.title}{win && <span className="sr-only"> (winner)</span>}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: '11px', color: win ? 'var(--accent-light)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {t.points} pts{t.firsts ? ` · ${t.firsts}× 1st` : ''}
                    </span>
                  </div>
                  <div aria-hidden="true" style={{ height: '8px', borderRadius: '4px', background: 'rgba(var(--fg-rgb), 0.06)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(2, ((t.points ?? 0) / maxPts) * 100)}%`, height: '100%', borderRadius: '4px',
                      background: win ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.35)',
                    }} />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {election?.tie_broken_randomly && (
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: '8px 0 0' }}>
            <span aria-hidden="true">🎲 </span>Tie at the top — broken at random (rule 9).
          </p>
        )}
        {unopposed && (
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: '8px 0 0' }}>
            Last film on the list — elected without a vote.
          </p>
        )}
      </div>

      {/* Every member's ballot */}
      <div>
        <SectionLabel>Everyone's ballot</SectionLabel>
        {ballotsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} aria-busy="true" aria-label="Loading ballots">
            <Skeleton style={{ height: '34px' }} /><Skeleton style={{ height: '34px' }} />
          </div>
        ) : ballots.error ? (
          <p role="alert" style={{ fontFamily: SANS, color: '#f87171', fontSize: '13px', margin: 0 }}>Couldn't load ballots: {ballots.error}</p>
        ) : grouped.length === 0 ? (
          <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>No ballots were cast for this film.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {grouped.map(b => (
              <li key={b.user_id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <button type="button" onClick={() => openMember(b.user_id)} aria-label={`Open ${b.user?.name ?? 'member'}'s profile`}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <Avatar user={b.user ?? { id: b.user_id }} size={28} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: SANS, color: 'var(--text)', fontWeight: 600, fontSize: '13px', margin: '0 0 4px' }}>{b.user?.name ?? 'Member'}</p>
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {b.ranks.map((sid, i) => (
                      <li key={sid} style={{
                        fontFamily: SANS, fontSize: '12px', padding: '3px 8px', borderRadius: '999px',
                        background: sid === winnerId ? 'rgba(var(--accent-rgb), 0.18)' : 'rgba(var(--fg-rgb), 0.05)',
                        color: sid === winnerId ? 'var(--text-strong)' : 'var(--text-dim)',
                      }}>
                        <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)' }}>{ordinal(i + 1)} </span>
                        {titles.get(sid) ?? 'A film'}
                      </li>
                    ))}
                  </ol>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
