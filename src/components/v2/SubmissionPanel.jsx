// COLLECTING phase: your 0–2 films on the list + the anonymous list so far.
// submissions_safe masks every other submitter's user_id, so the list only ever marks
// "yours" — we never try to infer anyone else's.

import { useState } from 'react'
import { withdrawSubmission } from '../../lib/v2'
import AddFilmFlow from './AddFilmFlow'
import { friendlyError, genreText } from './thisMonthHelpers'
import { Button, Card, EmptyState, ErrorNote, MONO, Poster, SANS, SectionLabel } from './thisMonthUi'

const MAX_PER_MEMBER = 2

export default function SubmissionPanel({ month, submissions = [], mySubmissions = [], profileId, locked = false, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [announce, setAnnounce] = useState('')

  const live = submissions.filter(s => !s.withdrawn_at)
  const mine = mySubmissions.filter(s => !s.withdrawn_at)
  const full = mine.length >= MAX_PER_MEMBER

  async function withdraw(sub) {
    setBusyId(sub.id)
    setError(null)
    try {
      await withdrawSubmission(sub.id)
      setConfirmId(null)
      setAnnounce(`${sub.title} withdrawn from the list.`)
      await onChanged?.()
    } catch (e) {
      setError(friendlyError(e.message))
    } finally {
      setBusyId(null)
    }
  }

  async function handleAdded(film) {
    setAdding(false)
    setAnnounce(`${film.title} added to the list.`)
    await onChanged?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <p aria-live="polite" className="sr-only">{announce}</p>

      <section aria-labelledby="v2-your-films">
        <SectionLabel id="v2-your-films" right={
          <span style={{ fontFamily: MONO, fontSize: '11px', color: full ? 'var(--accent-light)' : 'var(--text-faint)' }}>
            {mine.length}/{MAX_PER_MEMBER}
          </span>
        }>
          Your films
        </SectionLabel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {mine.length === 0 && !adding && (
            <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
              {locked
                ? "You didn't put anything on the list this time — that's allowed."
                : 'You can put up to two films on the list — or none at all. Nobody sees who submitted what until the film is watched.'}
            </p>
          )}

          {mine.map(sub => {
            const meta = sub.metadata ?? {}
            const confirming = confirmId === sub.id
            return (
              <Card key={sub.id} style={{ padding: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Poster path={sub.poster_url} title={sub.title} width={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '15px', margin: '0 0 3px', lineHeight: 1.25 }}>
                    {sub.title}
                  </p>
                  <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', margin: 0 }}>
                    {[meta.year, meta.director, genreText(meta.genre)].filter(Boolean).join(' · ')}
                  </p>
                  {sub.justification && (
                    <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic', margin: '6px 0 0', lineHeight: 1.45 }}>
                      “{sub.justification}”
                    </p>
                  )}
                  {confirming && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <Button tone="danger" size="sm" busy={busyId === sub.id} onClick={() => withdraw(sub)}>
                        {busyId === sub.id ? 'Withdrawing…' : 'Yes, withdraw'}
                      </Button>
                      <Button tone="secondary" size="sm" disabled={busyId === sub.id} onClick={() => setConfirmId(null)}>Keep it</Button>
                    </div>
                  )}
                </div>
                {!locked && !confirming && (
                  <Button tone="secondary" size="sm" onClick={() => { setConfirmId(sub.id); setError(null) }} aria-label={`Withdraw ${sub.title}`}>
                    Withdraw
                  </Button>
                )}
              </Card>
            )
          })}

          <ErrorNote error={error} onDismiss={() => setError(null)} />

          {!locked && !full && (adding ? (
            <AddFilmFlow
              monthId={month.id}
              profileId={profileId}
              liveSubmissions={live}
              onAdded={handleAdded}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button size="lg" onClick={() => setAdding(true)} style={{ width: '100%' }}>
              + Add a film {mine.length === 1 ? '(1 slot left)' : ''}
            </Button>
          ))}
          {!locked && full && (
            <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '12px', margin: 0 }}>
              Both slots used. Withdraw one to swap it for something else.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="v2-list-so-far">
        <SectionLabel id="v2-list-so-far" right={
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-faint)' }}>
            {live.length} {live.length === 1 ? 'film' : 'films'}
          </span>
        }>
          The list so far
        </SectionLabel>
        {live.length === 0 ? (
          <EmptyState icon="📝" title="Nothing on the list yet">
            {locked ? 'No films were submitted this round.' : 'Be the first to put a film up for the vote.'}
          </EmptyState>
        ) : (
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '14px 10px',
          }}>
            {live.map(s => {
              const yours = s.user_id === profileId
              return (
                <li key={s.id} style={{ minWidth: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <Poster path={s.poster_url} title={s.title} width="100%" size="w342" style={{ borderRadius: '9px', outline: yours ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px' }} />
                    {yours && (
                      <span style={{
                        position: 'absolute', top: '6px', left: '6px', padding: '2px 6px', borderRadius: '6px',
                        background: 'var(--accent)', color: 'var(--text-strong)',
                        fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>
                        Yours
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: SANS, color: 'var(--text)', fontSize: '12px', lineHeight: 1.3, margin: '6px 0 0', overflowWrap: 'anywhere' }}>
                    {s.title}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
