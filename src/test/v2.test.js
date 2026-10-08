import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/supabase', () => ({ supabase: {} }))
import { derivePhase, PHASE, liveCandidates, ballotPoints, pickCurrentMonth } from '../lib/v2'

describe('derivePhase', () => {
  it('none without a month', () => expect(derivePhase({})).toBe(PHASE.NONE))
  it('collecting while upcoming', () => expect(derivePhase({ month: { status: 'upcoming' } })).toBe(PHASE.COLLECTING))
  it('voting when an election is open', () =>
    expect(derivePhase({ month: { status: 'active' }, elections: [{ status: 'open' }] })).toBe(PHASE.VOTING))
  it('watching when a film is unrevealed', () =>
    expect(derivePhase({ month: { status: 'active' }, elections: [{ status: 'closed' }], films: [{ scores_revealed: false }] })).toBe(PHASE.WATCHING))
  it('between when every film is revealed', () =>
    expect(derivePhase({ month: { status: 'active' }, elections: [{ status: 'closed' }], films: [{ scores_revealed: true }] })).toBe(PHASE.BETWEEN))
  it('closed when revealed', () => expect(derivePhase({ month: { status: 'revealed' } })).toBe(PHASE.CLOSED))
})

describe('helpers', () => {
  it('liveCandidates drops withdrawn and elected', () =>
    expect(liveCandidates([{ id: 1 }, { id: 2, withdrawn_at: 'x' }, { id: 3, elected: true }]).map(s => s.id)).toEqual([1]))
  it('ballotPoints uses club weights 6/4/3 by default', () =>
    expect([1, 2, 3, 4].map(r => ballotPoints(r))).toEqual([6, 4, 3, 0]))
  it('October 2026: Weapons 4+3+6 = 13', () =>
    expect(ballotPoints(2) + ballotPoints(3) + ballotPoints(1)).toBe(13))
  it('pickCurrentMonth prefers active, then newest upcoming', () => {
    expect(pickCurrentMonth([{ status: 'revealed', month_year: '2026-10' }, { status: 'active', month_year: '2026-11' }]).month_year).toBe('2026-11')
    expect(pickCurrentMonth([{ status: 'upcoming', month_year: '2026-11' }, { status: 'upcoming', month_year: '2026-12' }]).month_year).toBe('2026-12')
  })
})
