// Movie Club 2.0 — This Month. The round state machine (MOVIE_CLUB_2.0_PLAN.md §2.3) as one
// screen: Submit (0–2 films) → Vote (rank top 3) → Watch (one film; scoring = watched) →
// Reveal (submitter + tally + ballots) → next vote from the same list, or month close.
// Progression is people-gated, so every phase leads with who the club is waiting on.
//
// All round data comes from loadV2State() (src/lib/v2.js); writes go through its actions.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PHASE, closeMonth, liveCandidates, loadV2State, openElection } from '../lib/v2'
import { useRevealRefresh } from '../lib/useRevealRefresh'
import ScoreModal from '../components/ScoreModal'
import { FilmDetailOverlay } from './Films'
import SubmissionPanel from '../components/v2/SubmissionPanel'
import BallotPanel from '../components/v2/BallotPanel'
import NowWatching from '../components/v2/NowWatching'
import CycleReveal from '../components/v2/CycleReveal'
import MonthSoFar from '../components/v2/MonthSoFar'
import { countdown, formatDeadline, formatMonthLabel, friendlyError, loadClubAverages, loadClubUsers } from '../components/v2/thisMonthHelpers'
import { Button, Card, DISPLAY, EmptyState, ErrorNote, MONO, SANS, Skeleton } from '../components/v2/thisMonthUi'

const RAIL = [
  { phase: PHASE.COLLECTING, label: 'Submit' },
  { phase: PHASE.VOTING, label: 'Vote' },
  { phase: PHASE.WATCHING, label: 'Watch' },
  { phase: PHASE.BETWEEN, label: 'Reveal' },
]
const IN_PLAY = new Set([PHASE.VOTING, PHASE.WATCHING, PHASE.BETWEEN])

/** Re-render on an interval so countdowns tick (Date.now() stays out of render). */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export default function ThisMonthV2() {
  const { profile, isAdmin } = useAuth()
  const profileId = profile?.id ?? null
  const [state, setState] = useState(null)       // loadV2State() result; null until first load
  const [loadError, setLoadError] = useState(null)
  const [users, setUsers] = useState([])
  const [avgs, setAvgs] = useState({})           // movie_id → { avg, count } for revealed films
  const [scoreOpen, setScoreOpen] = useState(null) // null | { skipExcitement }
  const [overlayMovie, setOverlayMovie] = useState(null)
  const seqRef = useRef(0)
  const now = useNow()

  // Silent after the first load: refreshes never blank the page (no skeleton flash on a
  // reveal broadcast or tab refocus). A sequence guard drops out-of-order responses.
  const reload = useCallback(async () => {
    if (!profileId) return
    const seq = ++seqRef.current
    try {
      const s = await loadV2State(profileId)
      const revealedIds = (s.films ?? []).filter(f => f.scores_revealed).map(f => f.id)
      const a = await loadClubAverages(revealedIds).catch(() => ({}))
      if (seq !== seqRef.current) return
      setState(s)
      setAvgs(a)
      setLoadError(s.error ?? null)
    } catch (e) {
      if (seq === seqRef.current) setLoadError(e.message ?? 'Could not load this round.')
    }
  }, [profileId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!profileId) return undefined
    let cancelled = false
    loadClubUsers().then(u => { if (!cancelled) setUsers(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [profileId])

  // Server-side transitions (film reveals, month status) arrive on the reveal bus.
  useRevealRefresh(reload)

  // Ballots aren't in the realtime publication, and others' ratings only reach viewers who
  // have scored (RLS) — so also refetch quietly whenever the tab comes back into view.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  // Live "waiting on…" while watching: any score on the current film refreshes progress.
  const watchingId = state?.phase === PHASE.WATCHING ? state.currentFilm?.id ?? null : null
  useEffect(() => {
    if (!watchingId) return undefined
    const channel = supabase
      .channel(`v2-ratings-${watchingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings', filter: `movie_id=eq.${watchingId}` }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [watchingId, reload])

  const phase = state?.phase ?? PHASE.NONE
  const month = state?.month ?? null
  const films = state?.films ?? []
  const revealedFilms = films.filter(f => f.scores_revealed)

  return (
    <div style={{
      background: 'linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 60%,var(--bg-3) 100%)',
      fontFamily: SANS, minHeight: '100vh', paddingBottom: '6rem', width: '100%', boxSizing: 'border-box', overflowX: 'hidden',
    }}>
      <div style={{ padding: '2.5rem 1rem 0', boxSizing: 'border-box', width: '100%', maxWidth: '720px', margin: '0 auto' }}>
        {state === null && !loadError ? (
          <LoadingSkeleton />
        ) : (
          <>
            <Header month={month} phase={phase} now={now} />

            {loadError && (
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ErrorNote error={{ headline: "Couldn't load this round.", detail: loadError }} />
                <Button tone="secondary" size="sm" onClick={reload} style={{ alignSelf: 'flex-start' }}>Try again</Button>
              </div>
            )}

            {state && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '34px', animation: 'v2FadeUp 0.35s ease both' }}>
                <PhaseBody
                  state={state}
                  phase={phase}
                  users={users}
                  avgs={avgs}
                  profileId={profileId}
                  isAdmin={isAdmin}
                  now={now}
                  reload={reload}
                  onScore={opts => setScoreOpen(opts)}
                  onOpenFilm={setOverlayMovie}
                />

                {IN_PLAY.has(phase) && (
                  <MonthSoFar films={revealedFilms} avgs={avgs} onOpenFilm={setOverlayMovie} />
                )}
                {phase === PHASE.CLOSED && revealedFilms.length > 0 && (
                  <MonthSoFar
                    title={`${month?.theme ? `${month.theme} · ` : ''}${formatMonthLabel(month?.month_year)} — watched`}
                    films={revealedFilms}
                    avgs={avgs}
                    onOpenFilm={setOverlayMovie}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {scoreOpen && state?.currentFilm && (
        <ScoreModal
          movie={state.currentFilm}
          existingRating={state.myRating}
          skipExcitementStep={scoreOpen.skipExcitement}
          onClose={() => setScoreOpen(null)}
          onSaved={reload}
        />
      )}

      <FilmDetailOverlay movie={overlayMovie} onClose={() => setOverlayMovie(null)} onScored={reload} />

      <style>{`
        @keyframes v2FadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @media (prefers-reduced-motion: reduce) { [style*="v2FadeUp"] { animation: none !important; } }
      `}</style>
    </div>
  )
}

// ── Header: month · theme · phase rail · submission countdown ────────────────
function Header({ month, phase, now }) {
  const label = month ? formatMonthLabel(month.month_year) : 'Movie Club'
  const railIndex = RAIL.findIndex(r => r.phase === phase)
  const cd = phase === PHASE.COLLECTING ? countdown(month?.submissions_close_at, now) : null

  return (
    <header style={{ marginBottom: '26px', animation: 'v2FadeUp 0.45s ease both' }}>
      <p style={{ fontFamily: MONO, color: 'var(--hairline)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 4px' }}>
        {label}{month?.theme ? ' · This month’s theme' : ''}
      </p>
      <h1 style={{ fontFamily: DISPLAY, fontSize: '2.6rem', color: 'var(--text-strong)', lineHeight: 1, margin: 0, letterSpacing: '0.03em', overflowWrap: 'anywhere' }}>
        {month?.theme || 'This Month'}
      </h1>

      {railIndex >= 0 && (
        <ol aria-label="Round progress" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', gap: '6px' }}>
          {RAIL.map((r, i) => {
            const current = i === railIndex
            const done = i < railIndex
            return (
              <li key={r.phase} aria-current={current ? 'step' : undefined} style={{ flex: 1, minWidth: 0 }}>
                <div aria-hidden="true" style={{
                  height: '3px', borderRadius: '2px', marginBottom: '6px',
                  background: current ? 'var(--accent)' : done ? 'rgba(var(--accent-rgb), 0.45)' : 'rgba(var(--fg-rgb), 0.1)',
                }} />
                <span style={{
                  fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: current ? 'var(--accent-light)' : done ? 'var(--text-dim)' : 'var(--text-faint)',
                }}>
                  {r.label}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {phase === PHASE.COLLECTING && (
        <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: '14px 0 0', lineHeight: 1.5 }}>
          {!month?.submissions_close_at
            ? 'Submissions are open — no deadline set yet.'
            : cd?.past
              ? 'Submissions have closed — the vote opens shortly.'
              : (
                <>
                  Submissions close <span style={{ color: 'var(--text)' }}>{formatDeadline(month.submissions_close_at)}</span>
                  {' · '}
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: cd?.urgent ? '#fbbf24' : 'var(--accent-light)' }}>{cd?.text}</span>
                </>
              )}
        </p>
      )}
    </header>
  )
}

// ── Phase router ─────────────────────────────────────────────────────────────
function PhaseBody({ state, phase, users, avgs, profileId, isAdmin, now, reload, onScore, onOpenFilm }) {
  const { month, films } = state

  if (phase === PHASE.NONE || phase === PHASE.CLOSED) {
    return (
      <EmptyState icon="🍿" title="The next round hasn't started yet">
        {phase === PHASE.CLOSED
          ? "This month's list is wrapped up. You'll get a nudge when the next list opens for submissions."
          : "Movie Club 2.0 kicks off soon. You'll get a nudge when the first list opens for submissions."}
      </EmptyState>
    )
  }

  if (phase === PHASE.COLLECTING) {
    const deadlinePassed = countdown(month.submissions_close_at, now)?.past ?? false
    return (
      <SubmissionPanel
        month={month}
        submissions={state.submissions}
        mySubmissions={state.mySubmissions}
        profileId={profileId}
        locked={deadlinePassed}
        onChanged={reload}
      />
    )
  }

  if (phase === PHASE.VOTING && state.openElection) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-strong)' }}>Vote {state.openElection.sequence ?? films.length + 1}</strong>
          {' '}— the winner is the next film the club watches. Voting closes itself the moment the last ballot is in.
        </p>
        <BallotPanel
          key={state.openElection.id}
          election={state.openElection}
          candidates={liveCandidates(state.submissions)}
          myBallot={state.myBallot}
          weights={state.weights}
          voteProgress={state.voteProgress}
          users={users}
          profileId={profileId}
          onCast={reload}
        />
      </div>
    )
  }

  if (phase === PHASE.WATCHING && state.currentFilm) {
    const idx = films.findIndex(f => f.id === state.currentFilm.id)
    return (
      <NowWatching
        film={state.currentFilm}
        filmNumber={idx >= 0 ? idx + 1 : films.length}
        myRating={state.myRating}
        filmProgress={state.filmProgress}
        users={users}
        profileId={profileId}
        onScore={onScore}
        onOpenFilm={() => onOpenFilm(state.currentFilm)}
      />
    )
  }

  // BETWEEN (or a transient VOTING/WATCHING row mismatch — show the latest reveal).
  const latest = films.filter(f => f.scores_revealed).at(-1) ?? null
  const election = latest ? state.elections.find(e => e.movie_id === latest.id) ?? null : null
  const left = liveCandidates(state.submissions).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <p style={{ fontFamily: DISPLAY, color: 'var(--text-strong)', fontSize: '1.8rem', lineHeight: 1, letterSpacing: '0.02em', margin: '0 0 4px' }}>
          Everyone's watched it <span aria-hidden="true">🎉</span>
        </p>
        <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: 0 }}>
          Scores, the submitter and every ballot are out.
        </p>
      </div>

      {latest ? (
        <CycleReveal
          film={latest}
          election={election}
          submissions={state.submissions}
          users={users}
          clubAvg={avgs[latest.id]}
          onOpenFilm={() => onOpenFilm(latest)}
        />
      ) : (
        <EmptyState icon="🎞️" title="No film revealed yet" />
      )}

      <NextUp monthId={month.id} left={left} isAdmin={isAdmin} onDone={reload} />
    </div>
  )
}

// ── Between films: waiting for the next vote (+ admin one-taps) ──────────────
function NextUp({ monthId, left, isAdmin, onDone }) {
  const [confirm, setConfirm] = useState(null) // 'open' | 'close' | null
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(kind) {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'open') await openElection(monthId)
      else await closeMonth(monthId)
      setConfirm(null)
      await onDone?.()
    } catch (e) {
      setError(friendlyError(e.message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '15px', margin: '0 0 3px' }}>
          Waiting for the next vote
        </p>
        <p style={{ fontFamily: SANS, color: 'var(--text-dim)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
          {left > 0
            ? `${left} ${left === 1 ? 'film is' : 'films are'} left on this month's list. The next vote will be opened from those — or the month wraps up and a new list begins.`
            : "This month's list is used up. Next comes a new list with a new theme."}
        </p>
      </div>

      {isAdmin && (
        <div style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Admin</p>
          {confirm ? (
            <div role="group" aria-label="Confirm admin action" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontFamily: SANS, color: 'var(--text)', fontSize: '13px', margin: 0, lineHeight: 1.45 }}>
                {confirm === 'open'
                  ? `Open the next vote from the ${left} remaining ${left === 1 ? 'film' : 'films'}? Everyone gets notified.${left === 1 ? ' With one film left it’s elected straight away.' : ''}`
                  : 'Close the month? Leftover films are discarded and next month’s list opens for submissions.'}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button tone={confirm === 'close' ? 'danger' : 'primary'} size="sm" busy={busy === confirm} onClick={() => run(confirm)}>
                  {busy ? 'Working…' : confirm === 'open' ? 'Yes, open the vote' : 'Yes, close the month'}
                </Button>
                <Button tone="secondary" size="sm" disabled={!!busy} onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button size="sm" disabled={left === 0} onClick={() => { setConfirm('open'); setError(null) }}>Open next vote</Button>
              <Button tone="secondary" size="sm" onClick={() => { setConfirm('close'); setError(null) }}>Close month</Button>
            </div>
          )}
          <ErrorNote error={error} onDismiss={() => setError(null)} />
        </div>
      )}
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading this month" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Skeleton style={{ height: '12px', width: '30%' }} />
      <Skeleton style={{ height: '40px', width: '70%' }} />
      <Skeleton style={{ height: '6px' }} />
      <Skeleton style={{ height: '180px', marginTop: '12px' }} />
      <Skeleton style={{ height: '70px' }} />
    </div>
  )
}
