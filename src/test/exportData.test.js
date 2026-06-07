import { describe, it, expect } from 'vitest'
import { buildFullCsv, buildPdfBlob, exportFilename } from '../lib/exportData'

const sample = {
  exportedAt: '2026-06-07T00:00:00.000Z',
  profile: { name: 'Ryan Miller', email: 'r@example.com' },
  scores: [{ film: 'Heat', score: 8.6, pre_watch_excitement: 7, recommend_outside_club: true, submitted_at: '2026-04-01' }],
  reviews: [{ film: 'Heat', body: 'Great, with a comma', created_at: '2026-04-02', updated_at: null }],
  comments: [],
  picks: [{ film: 'Heat', year_released: 1995, month: 'April 2026', justification: 'classic' }],
  upcomingPicks: [],
  draftQueue: [],
  watchlist: [{ title: 'Sicario', tmdb_id: 273481, year_released: 2015, created_at: '2026-05-01' }],
  guesses: [],
  predictions: [],
  awards: [{ award_key: 'pick_of_month', scope: 'monthly', period_ref: '2026-04', film: 'Heat', won_as_picker: true, metric: 8.6 }],
}

describe('buildFullCsv', () => {
  const csv = buildFullCsv(sample)

  it('includes every category section (not just scores)', () => {
    for (const title of ['PROFILE', 'SCORES', 'REVIEWS', 'COMMENTS', 'PICKS', 'UPCOMING PICKS', 'DRAFT QUEUE', 'WATCHLIST', 'GUESSES', 'PREDICTIONS', 'AWARDS']) {
      expect(csv).toContain(title)
    }
  })

  it('writes empty sections as "(none)" rather than dropping them', () => {
    // comments/guesses/predictions are empty in the sample.
    expect(csv).toContain('(none)')
  })

  it('escapes commas and renders booleans as yes/no', () => {
    expect(csv).toContain('"Great, with a comma"')
    expect(csv).toMatch(/Heat,8\.6,7,yes,/)
  })
})

describe('exportFilename', () => {
  it('slugs the first name + a .ext', () => {
    expect(exportFilename('Ryan Miller', 'csv')).toMatch(/^movie-club-ryan-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('buildPdfBlob', () => {
  it('produces a non-empty PDF blob (lazy-loads jsPDF)', async () => {
    const blob = await buildPdfBlob(sample)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toContain('pdf')
    expect(blob.size).toBeGreaterThan(500)
  })
})
