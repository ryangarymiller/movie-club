// Pure helper functions copied verbatim from source files (not exported, so copied here)

// From src/pages/ThisMonth.jsx
function formatDeadline(isoString) {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(isoString))
}

function countdownLabel(isoString) {
  if (!isoString) return null
  const diff = new Date(isoString).getTime() - Date.now()
  if (diff <= 0) return { text: 'PAST DUE', past: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return { text: `${days}d ${hours}h remaining`, past: false }
  if (hours > 0) return { text: `${hours}h remaining`, past: false }
  const mins = Math.floor((diff % 3600000) / 60000)
  return { text: `${mins}m remaining`, past: false }
}

function scoreStatus(rating) {
  if (!rating) return 'excitement'
  if (!rating.pre_watch_excitement) return 'excitement'
  if (!rating.score) return 'final'
  return 'done'
}

function initials(title) {
  return title.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// From src/components/ScoreModal.jsx
function clampScore(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return null
  return Math.min(10.0, Math.max(0.01, n))
}

function validateScore(val) {
  const n = parseFloat(val)
  if (val === '' || val === null || val === undefined) return 'Score is required'
  if (isNaN(n)) return 'Enter a valid number'
  if (n < 0.01 || n > 10.0) return 'Score must be between 0.01 and 10.00'
  return null
}

// From src/pages/Stats.jsx
function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr) {
  if (arr.length < 2) return null
  const mean = avg(arr)
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('formatDeadline', () => {
  it('returns "—" for null', () => {
    expect(formatDeadline(null)).toBe('—')
  })

  it('returns "—" for undefined', () => {
    expect(formatDeadline(undefined)).toBe('—')
  })

  it('returns "—" for empty string', () => {
    expect(formatDeadline('')).toBe('—')
  })

  it('returns a non-empty string for a valid ISO date string', () => {
    const result = formatDeadline('2026-06-15T20:00:00.000Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toBe('—')
  })
})

describe('countdownLabel', () => {
  it('returns null for null input', () => {
    expect(countdownLabel(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(countdownLabel(undefined)).toBeNull()
  })

  it('returns { text: "PAST DUE", past: true } for a date in the past', () => {
    const pastDate = new Date(Date.now() - 60000).toISOString()
    expect(countdownLabel(pastDate)).toEqual({ text: 'PAST DUE', past: true })
  })

  it('returns past: false and text containing "d" for a date 3+ days away', () => {
    const futureDate = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString()
    const result = countdownLabel(futureDate)
    expect(result.past).toBe(false)
    expect(result.text).toMatch(/d/)
  })

  it('returns past: false and text containing "h" for a date 2 hours away', () => {
    const futureDate = new Date(Date.now() + 2 * 3600000).toISOString()
    const result = countdownLabel(futureDate)
    expect(result.past).toBe(false)
    expect(result.text).toMatch(/h/)
  })

  it('returns past: false and text containing "m" for a date 30 minutes away', () => {
    const futureDate = new Date(Date.now() + 30 * 60000).toISOString()
    const result = countdownLabel(futureDate)
    expect(result.past).toBe(false)
    expect(result.text).toMatch(/m/)
  })
})

describe('scoreStatus', () => {
  it('returns "excitement" for null rating', () => {
    expect(scoreStatus(null)).toBe('excitement')
  })

  it('returns "excitement" for rating with no pre_watch_excitement', () => {
    expect(scoreStatus({ score: null, pre_watch_excitement: null })).toBe('excitement')
  })

  it('returns "final" for rating with pre_watch_excitement but no score', () => {
    expect(scoreStatus({ pre_watch_excitement: 7.5, score: null })).toBe('final')
  })

  it('returns "done" for rating with both pre_watch_excitement and score', () => {
    expect(scoreStatus({ pre_watch_excitement: 7.5, score: 8.0 })).toBe('done')
  })
})

describe('initials', () => {
  it('"The Dark Knight" → "TD"', () => {
    expect(initials('The Dark Knight')).toBe('TD')
  })

  it('"Inception" → "I"', () => {
    expect(initials('Inception')).toBe('I')
  })

  it('"A Beautiful Mind" → "AB"', () => {
    expect(initials('A Beautiful Mind')).toBe('AB')
  })

  it('handles empty string without crashing', () => {
    expect(() => initials('')).not.toThrow()
  })

  it('handles whitespace-only string without crashing', () => {
    expect(() => initials('   ')).not.toThrow()
  })
})

describe('clampScore', () => {
  it('"5.5" → 5.5', () => {
    expect(clampScore('5.5')).toBe(5.5)
  })

  it('"0" → 0.01 (min clamp)', () => {
    expect(clampScore('0')).toBe(0.01)
  })

  it('"11" → 10.0 (max clamp)', () => {
    expect(clampScore('11')).toBe(10.0)
  })

  it('"abc" → null', () => {
    expect(clampScore('abc')).toBeNull()
  })
})

describe('validateScore', () => {
  it('returns error for empty string', () => {
    expect(validateScore('')).toBe('Score is required')
  })

  it('returns error for null', () => {
    expect(validateScore(null)).toBe('Score is required')
  })

  it('returns error for undefined', () => {
    expect(validateScore(undefined)).toBe('Score is required')
  })

  it('returns error for non-numeric string', () => {
    expect(validateScore('abc')).toBe('Enter a valid number')
  })

  it('returns error for "0" (out of range)', () => {
    expect(validateScore('0')).toBe('Score must be between 0.01 and 10.00')
  })

  it('returns error for "10.01" (out of range)', () => {
    expect(validateScore('10.01')).toBe('Score must be between 0.01 and 10.00')
  })

  it('returns null for "5.5" (valid)', () => {
    expect(validateScore('5.5')).toBeNull()
  })

  it('returns null for "0.01" (valid, lower bound)', () => {
    expect(validateScore('0.01')).toBeNull()
  })

  it('returns null for "10" (valid, upper bound)', () => {
    expect(validateScore('10')).toBeNull()
  })

  it('returns null for "10.00" (valid, upper bound with decimals)', () => {
    expect(validateScore('10.00')).toBeNull()
  })
})

describe('avg', () => {
  it('returns null for an empty array', () => {
    expect(avg([])).toBeNull()
  })

  it('[5, 7, 9] → 7', () => {
    expect(avg([5, 7, 9])).toBe(7)
  })

  it('[8.5] → 8.5', () => {
    expect(avg([8.5])).toBe(8.5)
  })
})

describe('stddev', () => {
  it('returns null for an array with fewer than 2 elements', () => {
    expect(stddev([])).toBeNull()
    expect(stddev([5])).toBeNull()
  })

  it('[5, 5, 5] → 0', () => {
    expect(stddev([5, 5, 5])).toBe(0)
  })

  it('[2, 4, 4, 4, 5, 5, 7, 9] → ~2.0', () => {
    const result = stddev([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2.0, 5)
  })
})

describe('fmt', () => {
  it('null → "—"', () => {
    expect(fmt(null)).toBe('—')
  })

  it('NaN → "—"', () => {
    expect(fmt(NaN)).toBe('—')
  })

  it('7.5 → "7.50"', () => {
    expect(fmt(7.5)).toBe('7.50')
  })

  it('10 → "10.00"', () => {
    expect(fmt(10)).toBe('10.00')
  })

  it('0 → "0.00"', () => {
    expect(fmt(0)).toBe('0.00')
  })
})
