// Phase-driven round controls for the current 2.0 month (MOVIE_CLUB_2.0_PLAN.md §2.3):
//   COLLECTING → close submissions · VOTING → force-close the vote · WATCHING → mark absent
//   BETWEEN → open the next vote / close the month · CLOSED → summary (+ manual start).
// Every action goes through `run(key, fn, successMsg)` from AdminRoundPanel, which owns the
// busy state, error/success reporting and the reload. Admins see submitters here because
// submissions_safe exposes user_id to is_admin(); members never see this panel.

import { useId, useState } from 'react'
import { PHASE, liveCandidates, closeSubmissions, closeElection, markAbsent, openElection, closeMonth } from '../../lib/v2'
import { posterUrl } from '../../lib/tmdb'
import { AdminButton, AdminHint, AdminLabel, MONO, PersonChip, ProgressBar, SANS } from './AdminKit'
import AdminConfirmDialog from './AdminConfirmDialog'
import AdminStartMonth from './AdminStartMonth'
import { addMonths, fieldLabelStyle, fieldStyle, fmtMonthYear, fmtPacific } from './adminV2Helpers'

const STEPS = [
  [PHASE.COLLECTING, 'List'],
  [PHASE.VOTING, 'Vote'],
  [PHASE.WATCHING, 'Watch'],
  [PHASE.BETWEEN, 'Next?'],
  [PHASE.CLOSED, 'Closed'],
]

function PhaseStepper({ phase }) {
  const at = STEPS.findIndex(([p]) => p === phase)
  return (
    <ol aria-label="Round phase" style={{ display: 'flex', gap: '4px', listStyle: 'none', padding: 0, margin: '12px 0 14px', flexWrap: 'wrap' }}>
      {STEPS.map(([p, label], i) => {
        const current = i === at
        return (
          <li key={p} aria-current={current ? 'step' : undefined}
            style={{
              flex: '1 1 0', minWidth: '56px', textAlign: 'center', padding: '5px 4px', borderRadius: '6px',
              fontFamily: MONO, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: current ? 'var(--accent)' : i < at ? 'rgba(var(--accent-rgb), 0.14)' : 'rgba(var(--fg-rgb), 0.04)',
              color: current ? 'var(--text-strong)' : i < at ? 'var(--text-muted)' : 'var(--text-faint)',
              fontWeight: current ? 600 : 400,
            }}>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

function Poster({ src, size = 40 }) {
  const url = posterUrl(src, 'w92')
  const box = { width: size, height: Math.round(size * 1.5), borderRadius: '4px', flexShrink: 0, background: 'rgba(var(--fg-rgb), 0.06)' }
  return url ? <img src={url} alt="" loading="lazy" style={{ ...box, objectFit: 'cover' }} /> : <span aria-hidden="true" style={box} />
}

function FilmRow({ title, poster, sub, right }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(var(--fg-rgb), 0.08)', background: 'rgba(var(--fg-rgb), 0.02)' }}>
      <Poster src={poster} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: 'var(--text-strong)', fontSize: '13px', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {sub && <p style={{ margin: '2px 0 0', color: 'var(--text-dim)', fontSize: '11px', fontFamily: MONO }}>{sub}</p>}
      </div>
      {right}
    </li>
  )
}

const listStyle = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }
const subhead = { margin: '14px 0 8px', display: 'block' }
const filmSub = s => [s.metadata?.year, s.metadata?.director].filter(Boolean).join(' · ')
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

export default function AdminRoundControls({ state, names, expectedIds = [], now = 0, months, seasons, busy, run, onReload, setError, setSuccess }) {
  const { phase, month, submissions = [], elections = [], openElection: openElec, films = [], currentFilm, voteProgress = [], filmProgress = [], weights = [6, 4, 3] } = state
  const [dialog, setDialog] = useState(null) // { kind, member? }
  const [reason, setReason] = useState('')
  const [showStart, setShowStart] = useState(false)
  const reasonId = useId()
  const anyBusy = busy != null
  const nameOf = id => names.get(id) ?? 'Unknown member'
  const live = liveCandidates(submissions)

  async function confirmRun(key, fn, msg) {
    await run(key, fn, msg)
    setDialog(null)
    setReason('')
  }
  const closeDialog = () => { if (!anyBusy) { setDialog(null); setReason('') } }

  if (!month) return null

  const header = (
    <>
      <p style={{ margin: '8px 0 0', color: 'var(--text-strong)', fontSize: '15px', fontWeight: 500, fontFamily: SANS }}>
        {fmtMonthYear(month.month_year)}
        {month.theme && <span style={{ color: 'var(--accent)', fontWeight: 400 }}> · {month.theme}</span>}
      </p>
      <PhaseStepper phase={phase} />
    </>
  )

  // ── COLLECTING ─────────────────────────────────────────────────────────────
  if (phase === PHASE.COLLECTING) {
    const counts = new Map(expectedIds.map(id => [id, 0]))
    for (const s of live) if (s.user_id) counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1)
    const deadline = month.submissions_close_at
    const deadlinePassed = deadline && now > 0 && new Date(deadline).getTime() <= now
    return (
      <div>
        {header}
        <AdminHint style={{ marginTop: 0 }}>
          {deadline
            ? <>Submissions close {fmtPacific(deadline)}{deadlinePassed ? ' (passed; the hourly job closes it, or close now)' : ''}.</>
            : <>No submissions deadline set; close submissions by hand.</>}
        </AdminHint>

        <AdminLabel as="h3" style={subhead}>Candidate list · {plural(live.length, 'film')}</AdminLabel>
        {live.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: 0 }}>Nobody has submitted yet.</p>
        ) : (
          <ul style={listStyle}>
            {live.map(s => (
              <FilmRow key={s.id} title={s.title} poster={s.poster_url} sub={filmSub(s) || null}
                right={<span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{s.user_id ? nameOf(s.user_id) : 'hidden'}</span>} />
            ))}
          </ul>
        )}

        <AdminLabel as="h3" style={subhead}>Films per member (0–2)</AdminLabel>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[...counts.entries()].map(([id, n]) => (
            <PersonChip key={id} name={nameOf(id)} tone={n > 0 ? 'done' : 'waiting'} suffix={`${n}/2`} />
          ))}
        </div>
        <AdminHint>0 is allowed (rule 2). Submitters stay anonymous to members until each film reveals.</AdminHint>

        <AdminButton onClick={() => setDialog({ kind: 'closeSubs' })} disabled={anyBusy || live.length === 0}>
          Close submissions &amp; open the vote
        </AdminButton>
        {live.length === 0 && <AdminHint style={{ marginBottom: 0 }}>Needs at least one film on the list.</AdminHint>}

        {dialog?.kind === 'closeSubs' && (
          <AdminConfirmDialog
            title="Close submissions and open the vote?"
            confirmLabel="Close & open vote"
            busyLabel="Opening the vote…"
            busy={busy === 'closeSubs'}
            onCancel={closeDialog}
            onConfirm={() => confirmRun('closeSubs', () => closeSubmissions(month.id), 'Submissions closed. Vote #1 is open.')}
          >
            <p style={{ margin: 0 }}>
              The list locks at <strong>{plural(live.length, 'film')}</strong>. Members can no longer add, change or withdraw films, and {fmtMonthYear(month.month_year)} goes into play.
              Everyone is asked to rank their top 3; the vote closes itself when the last member votes.
            </p>
          </AdminConfirmDialog>
        )}
      </div>
    )
  }

  // ── VOTING ─────────────────────────────────────────────────────────────────
  if (phase === PHASE.VOTING && openElec) {
    const voted = voteProgress.filter(v => v.has_voted)
    const waiting = voteProgress.filter(v => !v.has_voted)
    return (
      <div>
        {header}
        <AdminLabel as="h3" style={{ ...subhead, marginTop: 0 }}>Vote #{openElec.sequence} · {voted.length} of {voteProgress.length} voted</AdminLabel>
        <ProgressBar value={voted.length} max={voteProgress.length} label="Votes cast" />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {voted.map(v => <PersonChip key={v.user_id} name={v.name} tone="done" />)}
          {waiting.map(v => <PersonChip key={v.user_id} name={v.name} tone="waiting" suffix="waiting" />)}
        </div>
        <AdminHint>The vote closes itself when the last member votes. Ballots stay secret until the elected film reveals.</AdminHint>

        <AdminLabel as="h3" style={subhead}>On the ballot · {plural(live.length, 'film')}</AdminLabel>
        <ul style={listStyle}>
          {live.map(s => <FilmRow key={s.id} title={s.title} poster={s.poster_url} sub={filmSub(s) || null} />)}
        </ul>

        <div style={{ marginTop: '14px' }}>
          <AdminButton variant="danger" onClick={() => setDialog({ kind: 'closeVote' })} disabled={anyBusy || voted.length === 0}>
            Close the vote now
          </AdminButton>
          {voted.length === 0 && <AdminHint style={{ marginBottom: 0 }}>No ballots yet; at least one vote is needed to pick a winner.</AdminHint>}
        </div>

        {dialog?.kind === 'closeVote' && (
          <AdminConfirmDialog
            title={`Close vote #${openElec.sequence} now?`}
            confirmLabel="Close the vote"
            busyLabel="Tallying…"
            tone="danger"
            busy={busy === 'closeVote'}
            onCancel={closeDialog}
            onConfirm={() => confirmRun('closeVote', () => closeElection(openElec.id), 'Vote closed. The winner is now the film everyone watches.')}
          >
            <p style={{ margin: '0 0 8px' }}>
              The {plural(voted.length, 'ballot')} cast so far are tallied at {weights.join(' / ')} points for 1st / 2nd / 3rd.
            </p>
            {waiting.length > 0 && (
              <p style={{ margin: '0 0 8px' }}>
                <strong>{waiting.map(w => w.name).join(', ')}</strong> {waiting.length === 1 ? 'hasn’t' : 'haven’t'} voted; non-voters simply don’t count.
              </p>
            )}
            <p style={{ margin: 0 }}>
              If the top spot is tied, the winner is drawn at random (rule 9) and the draw is recorded. The winner becomes the one film the club watches next. This can’t be undone.
            </p>
          </AdminConfirmDialog>
        )}
      </div>
    )
  }

  // ── WATCHING ───────────────────────────────────────────────────────────────
  if (phase === PHASE.WATCHING && currentFilm) {
    const seq = elections.find(e => e.id === currentFilm.election_id)?.sequence
    const counted = filmProgress.filter(p => !p.absent)
    const scored = counted.filter(p => p.has_scored)
    const target = dialog?.kind === 'absent' ? dialog.member : null
    return (
      <div>
        {header}
        <ul style={listStyle}>
          <FilmRow title={currentFilm.title} poster={currentFilm.poster_url}
            sub={[seq ? `Elected in vote #${seq}` : null, currentFilm.year_released].filter(Boolean).join(' · ') || null} />
        </ul>
        <AdminLabel as="h3" style={subhead}>Now watching · {scored.length} of {counted.length} scored</AdminLabel>
        <ProgressBar value={scored.length} max={counted.length} label="Members who have scored" />
        <ul style={listStyle}>
          {filmProgress.map(p => {
            const status = p.absent ? 'absent' : p.has_scored ? 'done' : 'waiting'
            return (
              <li key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <PersonChip name={p.name} tone={status} suffix={{ absent: 'absent', done: 'scored', waiting: 'waiting' }[status]} />
                {status === 'waiting' && (
                  <AdminButton small variant="secondary" disabled={anyBusy}
                    onClick={() => { setReason(''); setDialog({ kind: 'absent', member: p }) }}
                    aria-label={`Mark ${p.name} absent for this film`}>
                    Mark absent for this film
                  </AdminButton>
                )}
              </li>
            )
          })}
        </ul>
        <AdminHint style={{ marginBottom: 0 }}>The film reveals itself (scores, submitter and ballots) the moment the last member scores. Marking someone absent is the escape hatch for rule 1.</AdminHint>

        {target && (
          <AdminConfirmDialog
            title={`Mark ${target.name} absent for ${currentFilm.title}?`}
            confirmLabel="Mark absent"
            busyLabel="Marking…"
            tone="danger"
            busy={busy === 'absent'}
            onCancel={closeDialog}
            onConfirm={() => confirmRun('absent', () => markAbsent(currentFilm.id, target.user_id, reason.trim() || null),
              revealed => revealed
                ? `${target.name} marked absent. That was the last blocker, so ${currentFilm.title} has revealed.`
                : `${target.name} marked absent for ${currentFilm.title}.`)}
          >
            <p style={{ margin: '0 0 10px' }}>
              {target.name} stops blocking the club for this film only; they’re still expected for the next vote and film.
              If they were the last one left, the film reveals right away. This can’t be undone from the app.
            </p>
            <label htmlFor={reasonId} style={fieldLabelStyle}>Reason (optional)</label>
            <textarea id={reasonId} rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
              placeholder="e.g. travelling, can’t get hold of the film" style={{ ...fieldStyle, resize: 'vertical' }} />
          </AdminConfirmDialog>
        )}
      </div>
    )
  }

  // ── BETWEEN ────────────────────────────────────────────────────────────────
  if (phase === PHASE.BETWEEN) {
    const lastClosed = [...elections].filter(e => e.status === 'closed').sort((a, b) => b.sequence - a.sequence)[0]
    const lastFilm = lastClosed ? films.find(f => f.id === lastClosed.movie_id) : null
    const nextYm = addMonths(month.month_year, 1)
    return (
      <div>
        {header}
        {lastFilm && (
          <AdminHint style={{ marginTop: 0 }}>
            {lastFilm.title} has revealed (vote #{lastClosed.sequence}{lastClosed.tie_broken_randomly ? ', tie broken at random' : ''}). {plural(films.length, 'film')} watched this month.
          </AdminHint>
        )}
        <AdminLabel as="h3" style={subhead}>Left on the list · {plural(live.length, 'film')}</AdminLabel>
        {live.length === 0
          ? <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: 0 }}>Every film on the list has been watched.</p>
          : (
            <ul style={listStyle}>
              {live.map(s => <FilmRow key={s.id} title={s.title} poster={s.poster_url} sub={filmSub(s) || null} />)}
            </ul>
          )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          <AdminButton
            onClick={() => run('openVote', () => openElection(month.id), `Vote #${(lastClosed?.sequence ?? 0) + 1} is open.`)}
            busy={busy === 'openVote'} busyLabel="Opening…"
            disabled={anyBusy || live.length === 0}
            aria-describedby={live.length === 0 ? 'v2-no-candidates' : undefined}
          >
            Open the next vote
          </AdminButton>
          <AdminButton variant="danger" onClick={() => setDialog({ kind: 'closeMonth' })} disabled={anyBusy}>
            Close the month
          </AdminButton>
        </div>
        {live.length === 0 && (
          <AdminHint style={{ marginBottom: 0 }}>
            <span id="v2-no-candidates">No candidates remain, so there’s nothing to vote on. Close the month to start a new list.</span>
          </AdminHint>
        )}

        {dialog?.kind === 'closeMonth' && (
          <AdminConfirmDialog
            title={`Close ${fmtMonthYear(month.month_year)}?`}
            confirmLabel="Close the month"
            busyLabel="Closing…"
            tone="danger"
            busy={busy === 'closeMonth'}
            onCancel={closeDialog}
            onConfirm={() => confirmRun('closeMonth', () => closeMonth(month.id), `${fmtMonthYear(month.month_year)} closed. The next month is open for submissions.`)}
          >
            {live.length > 0 ? (
              <>
                <p style={{ margin: '0 0 6px' }}>These {plural(live.length, 'film')} will be <strong>discarded</strong> (members may resubmit them next month):</p>
                <ul style={{ margin: '0 0 10px', paddingLeft: '18px' }}>
                  {live.map(s => <li key={s.id}>{s.title}</li>)}
                </ul>
              </>
            ) : (
              <p style={{ margin: '0 0 8px' }}>No films are left on the list, so nothing is discarded.</p>
            )}
            <p style={{ margin: 0 }}>
              {fmtMonthYear(month.month_year)} is revealed in full, and {fmtMonthYear(nextYm)} is created as the next 2.0 month and opens for submissions. Members are notified. This can’t be undone.
            </p>
          </AdminConfirmDialog>
        )}
      </div>
    )
  }

  // ── CLOSED ─────────────────────────────────────────────────────────────────
  if (phase === PHASE.CLOSED) {
    const nextYm = addMonths(month.month_year, 1)
    return (
      <div>
        {header}
        <p style={{ margin: '0 0 6px', color: 'var(--text-strong)', fontSize: '14px', fontFamily: SANS }}>
          The next month is open for submissions once it exists.
        </p>
        <AdminHint style={{ marginTop: 0 }}>
          {fmtMonthYear(month.month_year)} is closed and fully revealed ({plural(films.length, 'film')} watched). Closing a month normally opens the next one straight away;
          no 2.0 month is collecting yet, which usually means a {fmtMonthYear(nextYm)} row already existed (e.g. under 1.0). Start the next 2.0 month by hand:
        </AdminHint>
        {showStart
          ? <AdminStartMonth months={months} seasons={seasons} onCreated={onReload} setError={setError} setSuccess={setSuccess} />
          : <AdminButton variant="secondary" onClick={() => setShowStart(true)}>Start the next 2.0 month</AdminButton>}
      </div>
    )
  }

  // Data mid-transition (e.g. VOTING without its election row yet): wait for the next load.
  return <div>{header}<AdminHint>Loading round…</AdminHint></div>
}
