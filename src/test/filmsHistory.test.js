import { describe, it, expect } from 'vitest'
import { MEMBER_COLORS, pickerColor, sortMonthsDescending } from '../pages/Films.jsx'

// ─── MEMBER_COLORS lookup ──────────────────────────────────────────────────────

describe('MEMBER_COLORS', () => {
  it('returns correct color for Ryan Miller', () => {
    expect(MEMBER_COLORS['Ryan Miller']).toBe('#a855f7')
  })

  it('returns correct color for Ryan Bey', () => {
    expect(MEMBER_COLORS['Ryan Bey']).toBe('#f43f5e')
  })

  it('returns correct color for Andrew Bond', () => {
    expect(MEMBER_COLORS['Andrew Bond']).toBe('#10b981')
  })

  it('returns correct color for Zack Anjoorian', () => {
    expect(MEMBER_COLORS['Zack Anjoorian']).toBe('#f59e0b')
  })

  it('returns correct color for Chris Deschenes', () => {
    expect(MEMBER_COLORS['Chris Deschenes']).toBe('#3b82f6')
  })
})

// ─── pickerColor helper ────────────────────────────────────────────────────────

describe('pickerColor', () => {
  it('returns the correct color for a known member', () => {
    expect(pickerColor('Andrew Bond')).toBe('#10b981')
  })

  it('returns undefined for an unknown member name', () => {
    expect(pickerColor('Unknown Person')).toBeUndefined()
  })

  it('returns undefined when called with null', () => {
    expect(pickerColor(null)).toBeUndefined()
  })

  it('returns undefined when called with empty string', () => {
    expect(pickerColor('')).toBeUndefined()
  })
})

// ─── sortMonthsDescending ──────────────────────────────────────────────────────

describe('sortMonthsDescending', () => {
  it('sorts months most-recent-first', () => {
    const months = [
      { id: 1, month_year: '2026-01' },
      { id: 3, month_year: '2026-03' },
      { id: 2, month_year: '2026-02' },
    ]
    const sorted = sortMonthsDescending(months)
    expect(sorted.map(m => m.month_year)).toEqual(['2026-03', '2026-02', '2026-01'])
  })

  it('does not mutate the original array', () => {
    const months = [
      { id: 1, month_year: '2026-01' },
      { id: 2, month_year: '2026-05' },
    ]
    const original = [...months]
    sortMonthsDescending(months)
    expect(months).toEqual(original)
  })
})

// ─── Picker border logic ───────────────────────────────────────────────────────

describe('picker border', () => {
  it('returns no border color when picker_revealed is false', () => {
    const movie = { picker_revealed: false, picked_by_user_id: 'user-1' }
    const pickerName = movie.picker_revealed ? 'Ryan Miller' : null
    const borderColor = pickerName ? pickerColor(pickerName) : undefined
    expect(borderColor).toBeUndefined()
  })

  it('returns a border color when picker_revealed is true and picker is known', () => {
    const movie = { picker_revealed: true, picked_by_user_id: 'user-1' }
    const pickerName = movie.picker_revealed ? 'Ryan Miller' : null
    const borderColor = pickerName ? pickerColor(pickerName) : undefined
    expect(borderColor).toBe('#a855f7')
  })
})
