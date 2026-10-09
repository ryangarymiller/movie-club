// Home "Your Turn" for Movie Club 2.0 — exactly ONE card for the viewer's current
// obligation in the round (add films → vote → watch & score), or who the club is
// waiting on once they've done their part. 2.0 is people-gated: nobody advances until
// everyone has acted, so this card's job is "what do I owe, and who are we waiting on".
//
// Anonymity: we render WHO has acted (progress RPCs), never WHAT — no ballot contents,
// no other member's score, no submitter. All of that is also masked server-side.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useRevealRefresh } from '../../lib/useRevealRefresh'
import { loadV2State, PHASE, liveCandidates } from '../../lib/v2'

const MAX_SUBMISSIONS = 2
const MONO = "'DM Mono',monospace"

function monthLabel(monthYear) {
  if (!monthYear) return null
  return new Date(monthYear + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long' })
}

// Remaining time until the submission window closes (or the date once passed).
function deadlineLabel(iso) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const date = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (Number.isNaN(diff)) return null
  if (diff <= 0) return { text: `List closed ${date}`, past: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return { text: `List closes in ${days}d ${hours}h · ${date}`, past: false }
  if (hours > 0) return { text: `List closes in ${hours}h · ${date}`, past: false }
  return { text: `List closes in ${Math.max(1, Math.floor(diff / 60000))}m`, past: false }
}

// First names, except where two roster members share one (the two Ryans) → "First L.".
function displayNamer(roster) {
  const firstOf = n => (n ?? '').trim().split(/\s+/)[0] || 'Someone'
  const counts = {}
  for (const r of roster) counts[firstOf(r.name)] = (counts[firstOf(r.name)] ?? 0) + 1
  return name => {
    const parts = (name ?? '').trim().split(/\s+/)
    const first = firstOf(name)
    return counts[first] > 1 && parts.length > 1 ? `${first} ${parts[parts.length - 1][0]}.` : first
  }
}

// "A" · "A and B" · "A, B and C"
function joinNames(names) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// ── Presentation ──────────────────────────────────────────────────────────────

function Pips({ done, total, label }) {
  if (!total) return null
  return (
    <span role="img" aria-label={label} style={{ display: 'inline-flex', gap: '4px', verticalAlign: 'middle' }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: '7px', height: '7px', borderRadius: '999px',
            background: i < done ? 'var(--accent)' : 'transparent',
            border: `1px solid ${i < done ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.25)'}`,
          }}
        />
      ))}
    </span>
  )
}

function Thumb({ film, glyph }) {
  if (film) {
    return (
      <div className="shrink-0 w-10 h-14 rounded-md overflow-hidden" style={{ background: 'rgba(var(--fg-rgb),0.06)' }}>
        {film.poster_url ? (
          <img src={`https://image.tmdb.org/t/p/w92${film.poster_url}`} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: '16px' }} aria-hidden="true">🎬</div>
        )}
      </div>
    )
  }
  return <span className="shrink-0" style={{ fontSize: '20px', lineHeight: 1, width: '28px', textAlign: 'center' }} aria-hidden="true">{glyph}</span>
}

/**
 * One Your-Turn card. `tone`: 'primary' (you owe something) | 'quiet' (waiting / done).
 * The body links to /this-month; an optional `onCta` renders a separate action button.
 */
function TurnCard({ tone = 'primary', glyph, film, kicker, title, sub, meta, cta, onCta, testId }) {
  const primary = tone === 'primary'
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        background: primary ? 'rgba(var(--accent-rgb),0.10)' : 'rgba(var(--fg-rgb),0.03)',
        border: primary ? '1px solid rgba(var(--accent-rgb),0.30)' : '1px solid rgba(var(--fg-rgb),0.10)',
      }}
    >
      <Link to="/this-month" className="flex items-center gap-3 flex-1 min-w-0" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Thumb film={film} glyph={glyph} />
        <div className="flex-1 min-w-0">
          {kicker && (
            <p className="uppercase truncate" style={{ fontSize: '10px', letterSpacing: '0.1em', fontFamily: MONO, color: primary ? 'var(--accent-light)' : 'var(--text-faint)', margin: '0 0 2px' }}>
              {kicker}
            </p>
          )}
          <p style={{ color: 'var(--text-strong)', fontSize: '14px', fontWeight: 600, lineHeight: 1.25, margin: 0 }}>{title}</p>
          {sub && <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.35, margin: '2px 0 0' }}>{sub}</p>}
          {meta && <div style={{ marginTop: '5px', fontSize: '10px', fontFamily: MONO, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{meta}</div>}
        </div>
        {!onCta && cta && (
          <span className="shrink-0" style={{ color: 'var(--accent)', fontSize: '11px', fontFamily: MONO, whiteSpace: 'nowrap' }}>{cta}</span>
        )}
      </Link>
      {onCta && (
        <button
          type="button"
          onClick={onCta}
          className="shrink-0 font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
          style={{ background: 'var(--accent)', color: '#fff', fontSize: '12px', fontFamily: MONO, border: 'none', cursor: 'pointer' }}
        >
          {cta}
        </button>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {{ onScore?: (film:object, rating:object|null) => void, refreshKey?: any }} props
 *   onScore    — open the score flow in place (Home passes its ScoreModal opener); without it
 *                "Score it" just links to This Month.
 *   refreshKey — bump to force a reload (e.g. after a score save / ratings realtime event).
 */
export default function YourTurnV2({ onScore, refreshKey }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const [state, setState] = useState(null)
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    if (!userId) return
    const req = ++reqRef.current
    try {
      const next = await loadV2State(userId)
      if (req === reqRef.current) setState(next)
    } catch (e) {
      if (req === reqRef.current) setState({ phase: PHASE.NONE, error: e?.message ?? 'Failed to load' })
    }
  }, [userId])

  useEffect(() => { load() }, [load, refreshKey])
  useRevealRefresh(load)

  if (!state) {
    return <div className="animate-pulse rounded-xl h-16" style={{ background: 'rgba(var(--fg-rgb),0.05)' }} aria-label="Loading your turn" />
  }

  if (state.error) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(var(--fg-rgb),0.03)', border: '1px solid rgba(var(--fg-rgb),0.10)' }}>
        <span aria-hidden="true" style={{ fontSize: '18px' }}>⚠️</span>
        <p className="flex-1" style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Couldn’t load this round.</p>
        <button type="button" onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontFamily: MONO, fontSize: '11px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  const { phase, month } = state
  const mLabel = monthLabel(month?.month_year)
  const themeKicker = [mLabel, month?.theme].filter(Boolean).join(' · ')

  // ── Collecting: add up to 2 films to the anonymous list ──
  if (phase === PHASE.COLLECTING) {
    const n = Math.min(state.mySubmissions?.length ?? 0, MAX_SUBMISSIONS)
    const dl = deadlineLabel(month?.submissions_close_at)
    const deadline = dl && <span style={{ color: dl.past ? '#f87171' : 'var(--text-dim)' }}>⏱ {dl.text}</span>
    if (n >= MAX_SUBMISSIONS) {
      return (
        <TurnCard
          testId="yt2-collecting-done" tone="quiet" glyph="✓"
          kicker={themeKicker || 'The list'}
          title={`You’re in — ${MAX_SUBMISSIONS} films on the list`}
          sub="You can still swap them until the list closes."
          meta={deadline} cta="View list →"
        />
      )
    }
    return (
      <TurnCard
        testId="yt2-collecting" glyph="🎬"
        kicker={themeKicker || 'Submissions open'}
        title="Add films to the list"
        sub={month?.theme ? `This month’s theme: ${month.theme}` : 'Add up to 2 films for the club to vote on.'}
        meta={<><span>{n}/{MAX_SUBMISSIONS} added</span>{deadline}</>}
        cta="Add films →"
      />
    )
  }

  // ── Voting: rank your top 3 ──
  if (phase === PHASE.VOTING) {
    const roster = state.voteProgress ?? []
    const nameOf = displayNamer(roster)
    const votedCount = roster.filter(r => r.has_voted).length
    const pips = <Pips done={votedCount} total={roster.length} label={`${votedCount} of ${roster.length} have voted`} />
    const countText = roster.length ? <span>{votedCount}/{roster.length} voted</span> : null
    const voted = (state.myBallot?.length ?? 0) > 0
    if (voted) {
      const waiting = roster.filter(r => !r.has_voted && r.user_id !== userId).map(r => nameOf(r.name))
      return (
        <TurnCard
          testId="yt2-voted" tone="quiet" glyph="🗳️"
          kicker={themeKicker || 'Vote open'}
          title={waiting.length ? `Voted — waiting on ${joinNames(waiting)}` : 'Voted — counting the ballots'}
          sub="The next film is picked the moment the last ballot is in."
          meta={<>{pips}{countText}</>} cta="View →"
        />
      )
    }
    const nCands = liveCandidates(state.submissions ?? []).length
    return (
      <TurnCard
        testId="yt2-vote" glyph="🗳️"
        kicker={themeKicker || 'Vote open'}
        title="Vote for the next film"
        sub={nCands > 0 && nCands < 3 ? `Rank the ${nCands} films left on the list.` : 'Rank your top 3 from the list.'}
        meta={<>{pips}{countText}</>} cta="Vote →"
      />
    )
  }

  // ── Watching: one elected film; scoring it = "I've watched it" ──
  if (phase === PHASE.WATCHING && state.currentFilm) {
    const film = state.currentFilm
    const roster = (state.filmProgress ?? []).filter(r => !r.absent)
    const nameOf = displayNamer(roster)
    const scoredCount = roster.filter(r => r.has_scored).length
    const remaining = roster.length - scoredCount
    const pips = <Pips done={scoredCount} total={roster.length} label={`${scoredCount} of ${roster.length} have watched`} />
    const meAbsent = (state.filmProgress ?? []).some(r => r.user_id === userId && r.absent)
    const scored = state.myRating?.score != null

    if (!scored && !meAbsent) {
      const toGo = !roster.length ? null
        : remaining <= 1 ? 'You’re the last one — everyone’s waiting on you'
        : `${remaining} of ${roster.length} still to watch`
      return (
        <TurnCard
          testId="yt2-watch" film={film}
          kicker={mLabel ? `Now watching · ${mLabel}` : 'Now watching'}
          title={`Watch ${film.title}`}
          sub="Score it when you’re done — that’s your “I’ve watched it”."
          meta={<>{pips}{toGo && <span>{toGo}</span>}</>}
          cta="Score it"
          onCta={onScore ? () => onScore(film, state.myRating ?? null) : undefined}
        />
      )
    }
    const waiting = roster.filter(r => !r.has_scored && r.user_id !== userId).map(r => nameOf(r.name))
    return (
      <TurnCard
        testId="yt2-watched" tone="quiet" film={film}
        kicker={meAbsent ? 'Sitting this one out' : 'You’ve watched it'}
        title={waiting.length ? `Waiting on ${joinNames(waiting)}` : 'Everyone’s in — revealing'}
        sub={`${film.title} reveals the moment the last member scores it.`}
        meta={pips} cta="View →"
      />
    )
  }

  // ── Between films: the latest film just revealed ──
  if (phase === PHASE.BETWEEN || phase === PHASE.WATCHING) {
    const last = [...(state.films ?? [])].filter(f => f.scores_revealed).at(-1)
    return (
      <TurnCard
        testId="yt2-between" film={last} glyph="🎭"
        kicker={mLabel ? `Revealed · ${mLabel}` : 'Revealed'}
        title={last ? `Everyone’s watched ${last.title} — see the reveal` : 'Everyone’s watched — see the reveal'}
        sub="Who put it on the list, how everyone voted, and the scores."
        cta="See reveal →"
      />
    )
  }

  // ── None / closed: soft placeholder ──
  return (
    <TurnCard
      testId="yt2-idle" tone="quiet" glyph="⏳"
      title="Next round starting soon"
      sub="You’ll get a heads-up when the next list opens."
      cta="This month →"
    />
  )
}
