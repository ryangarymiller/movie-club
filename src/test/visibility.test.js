import { describe, it, expect } from 'vitest'
import { canSeeScores, visibleAvg } from '../lib/visibility.js'

// The rolling-reveal / anonymity model is the app's most architecturally
// significant system: during the active month a viewer must NOT see a film's
// club average or other members' scores until they have submitted their own
// final score for it (or the film is revealed). These helpers mirror the
// `ratings` RLS on the client so the UI never paints a misleading partial
// average for a film it cannot actually see. A regression here is a privacy
// leak, so it is worth locking down precisely.

describe('canSeeScores — rolling visibility gate', () => {
  it('is false with no film', () => {
    expect(canSeeScores(null, { score: 8 })).toBe(false)
    expect(canSeeScores(undefined, { score: 8 })).toBe(false)
  })

  it('is true for a revealed film regardless of the viewer having scored', () => {
    expect(canSeeScores({ scores_revealed: true }, null)).toBe(true)
    expect(canSeeScores({ scores_revealed: true }, undefined)).toBe(true)
    expect(canSeeScores({ scores_revealed: true }, { score: null })).toBe(true)
  })

  it('is false for an unrevealed film the viewer has not scored', () => {
    expect(canSeeScores({ scores_revealed: false }, null)).toBe(false)
    expect(canSeeScores({ scores_revealed: false }, undefined)).toBe(false)
  })

  it('is false when the viewer has only an excitement row (no final score yet)', () => {
    // An excitement-only rating row has score == null — it must NOT unlock the
    // club average (that would leak scores before the member commits a score).
    expect(canSeeScores({ scores_revealed: false }, { score: null, pre_watch_excitement: 7 })).toBe(false)
  })

  it('is true once the viewer has submitted a final score on an unrevealed film', () => {
    expect(canSeeScores({ scores_revealed: false }, { score: 6.5 })).toBe(true)
  })

  it('treats a 0-ish score as a real submitted score (not falsy-null)', () => {
    // Scores range 0.01–10.00, but the gate is `score != null`, so even an
    // (impossible) 0 must count as scored — the guard must not use truthiness.
    expect(canSeeScores({ scores_revealed: false }, { score: 0 })).toBe(true)
  })
})

describe('visibleAvg — the average the UI should paint', () => {
  const revealed = { scores_revealed: true }
  const hidden = { scores_revealed: false }

  it('returns null when the viewer cannot see the film', () => {
    expect(visibleAvg(hidden, null, 7.2, null)).toBeNull()
    expect(visibleAvg(hidden, { score: null }, 7.2, 8.6)).toBeNull()
    expect(visibleAvg(null, { score: 9 }, 7.2, null)).toBeNull()
  })

  it('prefers the authoritative historical average for a revealed film', () => {
    // e.g. Eternal Sunshine must read its stored 8.60, not a recomputed value.
    expect(visibleAvg(revealed, null, 9.5, 8.6)).toBe(8.6)
    expect(visibleAvg(revealed, null, 9.5, '8.60')).toBe(8.6) // coerces strings
  })

  it('falls back to the computed average when revealed but no historical avg', () => {
    expect(visibleAvg(revealed, null, 7.25, null)).toBe(7.25)
  })

  it('uses the computed average once the viewer has scored an unrevealed film', () => {
    // Historical avg is ignored while unrevealed — only the rolling computed
    // average (from RLS-visible ratings) is shown.
    expect(visibleAvg(hidden, { score: 7 }, 6.8, 8.6)).toBe(6.8)
  })

  it('returns null (not NaN/undefined) when visible but the computed avg is missing', () => {
    expect(visibleAvg(revealed, null, undefined, null)).toBeNull()
    expect(visibleAvg(hidden, { score: 7 }, null, null)).toBeNull()
  })
})
