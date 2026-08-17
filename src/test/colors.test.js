import { describe, it, expect } from 'vitest'
import {
  MEMBER_COLORS,
  USER_COLOR_PALETTE,
  memberColor,
  userColor,
  genreColor,
  GENRE_COLORS,
  hexToRgbTriple,
  chartColorAt,
  CHART_CATEGORICAL,
} from '../lib/colors.js'

// Member colors thread through avatars, charts, and the Films member filter.
// The invariants that matter for actually using the app: a user's DB-chosen
// color wins over the fallback, colors are one-per-member (no confusable
// duplicates), and every genre resolves to a stable unique color.

describe('memberColor', () => {
  it('returns the anchor color for known members', () => {
    expect(memberColor('Ryan Miller')).toBe('#a855f7')
    expect(memberColor('Chris Deschenes')).toBe('#3b82f6')
  })
  it('returns undefined for unknown or empty names', () => {
    expect(memberColor('Nobody At All')).toBeUndefined()
    expect(memberColor('')).toBeUndefined()
    expect(memberColor(null)).toBeUndefined()
    expect(memberColor(undefined)).toBeUndefined()
  })
})

describe('userColor — DB color takes precedence over the fallback', () => {
  it('prefers the stored user_color', () => {
    expect(userColor({ name: 'Ryan Miller', user_color: '#123456' })).toBe('#123456')
  })
  it('falls back to the member anchor color when user_color is empty', () => {
    expect(userColor({ name: 'Ryan Bey', user_color: '' })).toBe('#ef4444')
    expect(userColor({ name: 'Ryan Bey' })).toBe('#ef4444')
  })
  it('returns undefined when neither is available', () => {
    expect(userColor({ name: 'Nobody' })).toBeUndefined()
    expect(userColor(null)).toBeUndefined()
    expect(userColor(undefined)).toBeUndefined()
  })
})

describe('color palettes are internally consistent (one-per-member)', () => {
  it('USER_COLOR_PALETTE has no duplicate swatches', () => {
    expect(new Set(USER_COLOR_PALETTE).size).toBe(USER_COLOR_PALETTE.length)
  })
  it('every member anchor color is selectable in the palette', () => {
    for (const hex of Object.values(MEMBER_COLORS)) {
      expect(USER_COLOR_PALETTE).toContain(hex)
    }
  })
  it('member anchor colors are mutually distinct', () => {
    const vals = Object.values(MEMBER_COLORS)
    expect(new Set(vals).size).toBe(vals.length)
  })
})

describe('genreColor — stable, unique per genre', () => {
  it('returns the fixed color for a known genre', () => {
    expect(genreColor('Drama')).toBe(GENRE_COLORS['Drama'])
    expect(genreColor('Science Fiction')).toBe(GENRE_COLORS['Science Fiction'])
  })
  it('trims whitespace before lookup', () => {
    expect(genreColor('  Action ')).toBe(GENRE_COLORS['Action'])
  })
  it('derives a stable hashed color for an unmapped genre', () => {
    const a = genreColor('Neo-Noir')
    const b = genreColor('Neo-Noir')
    expect(a).toBe(b) // deterministic
    expect(a).toMatch(/^hsl\(\d+, 70%, 60%\)$/)
  })
  it('gives different unmapped genres different colors', () => {
    expect(genreColor('Neo-Noir')).not.toBe(genreColor('Mockumentary'))
  })
  it('all mapped genre colors are unique', () => {
    const vals = Object.values(GENRE_COLORS)
    expect(new Set(vals).size).toBe(vals.length)
  })
})

describe('hexToRgbTriple', () => {
  it('converts 6-digit hex', () => {
    expect(hexToRgbTriple('#a855f7')).toBe('168, 85, 247')
    expect(hexToRgbTriple('#000000')).toBe('0, 0, 0')
  })
  it('expands 3-digit shorthand', () => {
    expect(hexToRgbTriple('#fff')).toBe('255, 255, 255')
  })
  it('returns null for non-hex input (e.g. a CSS var) so callers can fall back', () => {
    expect(hexToRgbTriple('var(--accent)')).toBeNull()
    expect(hexToRgbTriple('')).toBeNull()
    expect(hexToRgbTriple(null)).toBeNull()
  })
})

describe('chartColorAt wraps around the categorical palette', () => {
  it('indexes and wraps safely', () => {
    expect(chartColorAt(0)).toBe(CHART_CATEGORICAL[0])
    expect(chartColorAt(CHART_CATEGORICAL.length)).toBe(CHART_CATEGORICAL[0])
    expect(chartColorAt(CHART_CATEGORICAL.length + 2)).toBe(CHART_CATEGORICAL[2])
  })
})
