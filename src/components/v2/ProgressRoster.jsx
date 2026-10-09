// "Who are we waiting on?" — the social-pressure gate (A2). Shows WHO has acted, never
// WHAT they voted or scored: entries come from v2_vote_progress / v2_film_progress.

import Avatar from '../Avatar'
import { useMemberOverlay } from '../../context/MemberOverlayContext'
import { joinNames, shortNames } from './thisMonthHelpers'
import { MONO, SANS } from './thisMonthUi'

/**
 * @param {object}   props
 * @param {{user_id:string,name:string,done:boolean,absent?:boolean}[]} props.entries
 * @param {object[]} props.users      club roster (avatar/colour lookup)
 * @param {string}   props.verb       past-tense action, e.g. "voted" / "scored"
 * @param {string}   [props.viewerId] marks the viewer as "you"
 */
export default function ProgressRoster({ entries = [], users = [], verb, viewerId, label = 'Progress' }) {
  const { openMember } = useMemberOverlay()
  const names = shortNames(entries)
  const counted = entries.filter(e => !e.absent)
  const doneCount = counted.filter(e => e.done).length
  const waiting = counted.filter(e => !e.done)
  const allDone = counted.length > 0 && waiting.length === 0
  const nameOf = e => (e.user_id === viewerId ? 'you' : names.get(e.user_id))
  const pct = counted.length ? Math.round((doneCount / counted.length) * 100) : 0

  if (!entries.length) {
    return (
      <p style={{ fontFamily: SANS, color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>
        No one on this round's roster yet.
      </p>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
        <p style={{ fontFamily: SANS, color: 'var(--text-strong)', fontWeight: 600, fontSize: '14px', margin: 0, lineHeight: 1.35 }}>
          {allDone
            ? `Everyone has ${verb} 🎉`
            : <>Waiting on <span style={{ color: 'var(--accent-light)' }}>{joinNames(waiting.map(nameOf))}</span></>}
        </p>
        <span style={{ fontFamily: MONO, color: 'var(--text-faint)', fontSize: '11px', whiteSpace: 'nowrap' }}>
          {doneCount}/{counted.length} {verb}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={counted.length}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} of ${counted.length} ${verb}`}
        style={{ height: '4px', borderRadius: '2px', background: 'rgba(var(--fg-rgb), 0.08)', overflow: 'hidden', marginBottom: '14px' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease' }} />
      </div>

      <ul aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '10px 14px' }}>
        {entries.map(e => {
          const user = users.find(u => u.id === e.user_id) ?? { id: e.user_id, name: e.name }
          const status = e.absent ? 'excused' : e.done ? verb : 'waiting'
          const display = names.get(e.user_id)
          return (
            <li key={e.user_id}>
              <button
                type="button"
                onClick={() => openMember(e.user_id)}
                aria-label={`${e.name}${e.user_id === viewerId ? ' (you)' : ''} — ${status}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '54px',
                  opacity: e.absent ? 0.45 : 1,
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Avatar
                    user={user}
                    size={40}
                    style={{ filter: e.done || e.absent ? 'none' : 'grayscale(0.7)', opacity: e.done || e.absent ? 1 : 0.7 }}
                  />
                  <span aria-hidden="true" style={{
                    position: 'absolute', right: '-3px', bottom: '-3px',
                    width: '17px', height: '17px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700, fontFamily: SANS,
                    background: e.done ? 'var(--accent)' : 'var(--surface-3)',
                    color: e.done ? 'var(--text-strong)' : 'var(--text-faint)',
                    border: '2px solid var(--surface)',
                  }}>
                    {e.absent ? '–' : e.done ? '✓' : '…'}
                  </span>
                </span>
                <span style={{
                  fontFamily: SANS, fontSize: '11px', lineHeight: 1.1,
                  color: e.done ? 'var(--text)' : 'var(--text-faint)',
                  maxWidth: '54px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {display}
                </span>
                <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: e.done ? 'var(--accent-light)' : 'var(--text-faint)' }}>
                  {status}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
