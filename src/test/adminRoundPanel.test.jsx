import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  tables: { users: [], months: [], seasons: [] },
  expected: [],
  clubMode: { clubMode: 'v1', preview: false, setPreview: () => {}, refresh: () => Promise.resolve(), loading: false },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(table => ({
      select: vi.fn(() => Promise.resolve({ data: db.tables[table] ?? [], error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: db.expected, error: null })),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'admin-1', role: 'admin', admin_mode_enabled: true }, isAdmin: true }),
}))

vi.mock('../context/ClubModeContext', () => ({
  useClubMode: () => db.clubMode,
}))

vi.mock('../lib/v2', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual, // real PHASE / liveCandidates
    loadV2State: vi.fn(),
    closeSubmissions: vi.fn(() => Promise.resolve('e1')),
    openElection: vi.fn(() => Promise.resolve('e2')),
    closeElection: vi.fn(() => Promise.resolve('mv1')),
    markAbsent: vi.fn(() => Promise.resolve(false)),
    closeMonth: vi.fn(() => Promise.resolve('m2')),
    setClubMode: vi.fn(() => Promise.resolve()),
    setVoteWeights: vi.fn(() => Promise.resolve()),
    createV2Month: vi.fn(() => Promise.resolve('m-new')),
  }
})

import * as v2 from '../lib/v2'
import AdminRoundPanel from '../components/v2/AdminRoundPanel'
import {
  pacificLocalToISO, validateWeights, seasonForMonth, nextFreeMonthYear, normalizeIdList, currentPacificMonthYear,
} from '../components/v2/adminV2Helpers'

const { PHASE } = v2

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'u1', name: 'Ryan Miller', is_active: true, is_test: false, joined_at: '2026-01-05' },
  { id: 'u2', name: 'Chris Deschenes', is_active: true, is_test: false, joined_at: '2026-01-05' },
  { id: 'u3', name: 'Zack', is_active: true, is_test: false, joined_at: '2026-04-01' },
]
const MONTH = { id: 'm1', month_year: '2026-10', status: 'active', mode: 'v2', theme: 'Halloween / Horror', submissions_close_at: null }
const SUBS = [
  { id: 's1', title: 'Weapons', user_id: 'u1', poster_url: null, metadata: { year: 2025 }, elected: false, withdrawn_at: null },
  { id: 's2', title: 'Primal Fear', user_id: 'u2', poster_url: null, metadata: { year: 1996 }, elected: false, withdrawn_at: null },
  { id: 's3', title: 'Hereditary', user_id: 'u1', poster_url: null, metadata: {}, elected: false, withdrawn_at: null },
]

const baseState = over => ({
  phase: PHASE.NONE, month: null, submissions: [], mySubmissions: [], elections: [], openElection: null,
  myBallot: [], films: [], currentFilm: null, myRating: null, voteProgress: [], filmProgress: [],
  weights: [6, 4, 3], error: null, ...over,
})

let setError, setSuccess
function renderPanel(state) {
  v2.loadV2State.mockResolvedValue(baseState(state))
  return render(<AdminRoundPanel setError={setError} setSuccess={setSuccess} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  setError = vi.fn()
  setSuccess = vi.fn()
  db.tables = { users: USERS, months: [], seasons: [] }
  db.expected = []
  db.clubMode = { clubMode: 'v1', preview: false, setPreview: vi.fn(), refresh: vi.fn(() => Promise.resolve()), loading: false }
})

// ── Load failure ─────────────────────────────────────────────────────────────

describe('load failure', () => {
  it('shows an error with Retry instead of hanging on the skeleton', async () => {
    v2.loadV2State.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(baseState({}))
    const user = userEvent.setup()
    render(<AdminRoundPanel setError={setError} setSuccess={setSuccess} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Switch the club to 2.0' })).toBeInTheDocument()
  })
})

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('adminV2Helpers', () => {
  it('reads a datetime-local value as US Pacific (PDT and PST)', () => {
    expect(pacificLocalToISO('2026-09-28T23:59')).toBe('2026-09-29T06:59:00.000Z')
    expect(pacificLocalToISO('2026-12-01T00:00')).toBe('2026-12-01T08:00:00.000Z')
    expect(pacificLocalToISO('')).toBeNull()
  })
  it('validates weights: whole, non-negative, strictly decreasing', () => {
    expect(validateWeights(['6', '4', '3'])).toBeNull()
    expect(validateWeights(['3', '2', '0'])).toBeNull()
    expect(validateWeights(['6', '6', '3'])).toMatch(/strictly decreasing/)
    expect(validateWeights(['6', '4', '-1'])).toMatch(/negative/)
    expect(validateWeights(['6', '4.5', '3'])).toMatch(/whole/)
    expect(validateWeights(['6', '', '3'])).toMatch(/whole/)
  })
  it('finds the season covering a month, incl. the partial Winter 2026 (starts Jan 5)', () => {
    const seasons = [
      { id: 'w', name: 'Winter 2026', start_date: '2026-01-05', end_date: '2026-02-28' },
      { id: 'a', name: 'Autumn 2026', start_date: '2026-09-01', end_date: '2026-11-30' },
    ]
    expect(seasonForMonth(seasons, '2026-10').id).toBe('a')
    expect(seasonForMonth(seasons, '2026-01').id).toBe('w')
    expect(seasonForMonth(seasons, '2026-12')).toBeNull()
  })
  it('defaults to the soonest month without a months row', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    expect(nextFreeMonthYear([], now)).toBe('2026-10')
    expect(nextFreeMonthYear([{ month_year: '2026-10' }, { month_year: '2026-11' }], now)).toBe('2026-12')
  })
  it('normalizes both PostgREST shapes of a setof-uuid RPC', () => {
    expect(normalizeIdList(['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeIdList([{ expected_members: 'a' }])).toEqual(['a'])
    expect(normalizeIdList(null)).toEqual([])
  })
})

// ── Club mode ────────────────────────────────────────────────────────────────

describe('Club mode card', () => {
  it('shows the live mode and gates setClubMode behind a confirm dialog', async () => {
    const user = userEvent.setup()
    renderPanel({})
    await user.click(await screen.findByRole('button', { name: 'Switch the club to 2.0' }))

    const dialog = screen.getByRole('dialog', { name: /switch the club to movie club 2\.0/i })
    expect(within(dialog).getByText(/no 2\.0 month exists yet/i)).toBeInTheDocument()
    // Focus lands on the first control (Cancel), never the destructive action.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(v2.setClubMode).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Switch to 2.0' }))
    await waitFor(() => expect(v2.setClubMode).toHaveBeenCalledWith('v2'))
    expect(db.clubMode.refresh).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Esc closes the dialog without switching', async () => {
    const user = userEvent.setup()
    renderPanel({})
    await user.click(await screen.findByRole('button', { name: 'Switch the club to 2.0' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(v2.setClubMode).not.toHaveBeenCalled()
  })

  it('offers the revert when the club is on 2.0 and disables the preview toggle', async () => {
    db.clubMode.clubMode = 'v2'
    const user = userEvent.setup()
    renderPanel({})
    await user.click(await screen.findByRole('button', { name: 'Revert the club to 1.0' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/nothing is deleted/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Revert to 1.0' }))
    await waitFor(() => expect(v2.setClubMode).toHaveBeenCalledWith('v1'))
    expect(screen.getByRole('switch', { name: 'Preview 2.0 on this device' })).toBeDisabled()
  })

  it('preview toggle is local (setPreview), not a club-wide write', async () => {
    const user = userEvent.setup()
    renderPanel({})
    await user.click(await screen.findByRole('switch', { name: 'Preview 2.0 on this device' }))
    expect(db.clubMode.setPreview).toHaveBeenCalledWith(true)
    expect(v2.setClubMode).not.toHaveBeenCalled()
  })
})

// ── NONE: start the first 2.0 month ──────────────────────────────────────────

describe('PHASE.NONE — start the first 2.0 month', () => {
  it('defaults to the next free month and creates it with the covering season + PT deadline', async () => {
    const ym = currentPacificMonthYear()
    const [y] = ym.split('-').map(Number)
    db.tables.seasons = [{ id: 'season-1', name: 'Any', start_date: `${y - 1}-01-01`, end_date: `${y + 1}-12-31` }]
    const user = userEvent.setup()
    renderPanel({ phase: PHASE.NONE })

    const monthInput = await screen.findByLabelText('Month')
    expect(monthInput).toHaveValue(ym)
    expect(screen.queryByRole('button', { name: /close submissions/i })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Theme'), 'Halloween / Horror')
    fireEvent.change(monthInput, { target: { value: '2027-10' } })
    fireEvent.change(screen.getByLabelText(/submissions close/i), { target: { value: '2027-09-28T23:59' } })
    await user.click(screen.getByRole('button', { name: /open submissions for october 2027/i }))

    await waitFor(() => expect(v2.createV2Month).toHaveBeenCalledWith({
      seasonId: 'season-1', monthYear: '2027-10', theme: 'Halloween / Horror', submissionsCloseAt: '2027-09-29T06:59:00.000Z',
    }))
    expect(setSuccess).toHaveBeenCalled()
  })

  it('blocks creation with a clear error when no season covers the month', async () => {
    renderPanel({ phase: PHASE.NONE })
    expect(await screen.findByRole('alert')).toHaveTextContent(/no season covers/i)
    expect(screen.getByRole('button', { name: /open submissions/i })).toBeDisabled()
  })

  it('flags a month that already has a row', async () => {
    const ym = currentPacificMonthYear()
    db.tables.months = [{ id: 'x', month_year: '2027-01', status: 'upcoming', mode: 'v1' }]
    renderPanel({ phase: PHASE.NONE })
    const monthInput = await screen.findByLabelText('Month')
    expect(monthInput).toHaveValue(ym)
    fireEvent.change(monthInput, { target: { value: '2027-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/already has a months row/i)
  })
})

// ── COLLECTING ───────────────────────────────────────────────────────────────

describe('PHASE.COLLECTING', () => {
  const collecting = { phase: PHASE.COLLECTING, month: { ...MONTH, status: 'upcoming' }, submissions: SUBS }

  it('lists candidates with submitters and per-member counts', async () => {
    db.expected = ['u1', 'u2', 'u3']
    renderPanel(collecting)
    expect(await screen.findByText('Weapons')).toBeInTheDocument()
    expect(screen.getByText(/candidate list · 3 films/i)).toBeInTheDocument()
    expect(screen.getAllByText('Ryan Miller').length).toBeGreaterThan(0)
    expect(screen.getByText('2/2')).toBeInTheDocument() // Ryan
    expect(screen.getByText('1/2')).toBeInTheDocument() // Chris
    expect(screen.getByText('0/2')).toBeInTheDocument() // Zack
  })

  it('close submissions is confirm-gated and calls closeSubmissions(month.id)', async () => {
    const user = userEvent.setup()
    renderPanel(collecting)
    await user.click(await screen.findByRole('button', { name: /close submissions & open the vote/i }))
    const dialog = screen.getByRole('dialog')
    expect(v2.closeSubmissions).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Close & open vote' }))
    await waitFor(() => expect(v2.closeSubmissions).toHaveBeenCalledWith('m1'))
  })

  it('surfaces the 1.0-still-active refusal verbatim', async () => {
    v2.closeSubmissions.mockRejectedValueOnce(new Error('a 1.0 month is still active; close it first'))
    const user = userEvent.setup()
    renderPanel(collecting)
    await user.click(await screen.findByRole('button', { name: /close submissions & open the vote/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close & open vote' }))
    await waitFor(() => expect(setError).toHaveBeenCalledWith('a 1.0 month is still active; close it first'))
  })

  it('is disabled with an empty list', async () => {
    renderPanel({ ...collecting, submissions: [] })
    expect(await screen.findByRole('button', { name: /close submissions & open the vote/i })).toBeDisabled()
  })
})

// ── VOTING ───────────────────────────────────────────────────────────────────

describe('PHASE.VOTING', () => {
  const voting = {
    phase: PHASE.VOTING, month: MONTH, submissions: SUBS,
    openElection: { id: 'e1', sequence: 1, status: 'open' },
    voteProgress: [
      { user_id: 'u1', name: 'Ryan Miller', has_voted: true },
      { user_id: 'u2', name: 'Chris Deschenes', has_voted: false },
    ],
  }

  it('shows who has voted / is waiting', async () => {
    renderPanel(voting)
    expect(await screen.findByText(/vote #1 · 1 of 2 voted/i)).toBeInTheDocument()
    expect(screen.getByText('waiting')).toBeInTheDocument()
  })

  it('cancel does not close the vote; confirm calls closeElection(openElection.id)', async () => {
    const user = userEvent.setup()
    renderPanel(voting)
    await user.click(await screen.findByRole('button', { name: 'Close the vote now' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/random/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/chris deschenes/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(v2.closeElection).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close the vote now' }))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close the vote' }))
    await waitFor(() => expect(v2.closeElection).toHaveBeenCalledWith('e1'))
  })

  it('cannot force-close with zero ballots', async () => {
    renderPanel({ ...voting, voteProgress: voting.voteProgress.map(v => ({ ...v, has_voted: false })) })
    expect(await screen.findByRole('button', { name: 'Close the vote now' })).toBeDisabled()
  })
})

// ── WATCHING ─────────────────────────────────────────────────────────────────

describe('PHASE.WATCHING', () => {
  const watching = {
    phase: PHASE.WATCHING, month: MONTH, submissions: SUBS,
    elections: [{ id: 'e1', sequence: 1, status: 'closed', movie_id: 'mv1' }],
    films: [{ id: 'mv1', title: 'Weapons', scores_revealed: false, election_id: 'e1' }],
    currentFilm: { id: 'mv1', title: 'Weapons', scores_revealed: false, election_id: 'e1' },
    filmProgress: [
      { user_id: 'u1', name: 'Ryan Miller', has_scored: true, absent: false },
      { user_id: 'u2', name: 'Chris Deschenes', has_scored: false, absent: false },
      { user_id: 'u3', name: 'Zack', has_scored: false, absent: true },
    ],
  }

  it('offers "Mark absent" only for members still waiting', async () => {
    renderPanel(watching)
    expect(await screen.findByText(/now watching · 1 of 2 scored/i)).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /mark .* absent for this film/i })
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('Mark Chris Deschenes absent for this film')
  })

  it('confirm + optional reason → markAbsent(film, user, reason)', async () => {
    const user = userEvent.setup()
    renderPanel(watching)
    await user.click(await screen.findByRole('button', { name: 'Mark Chris Deschenes absent for this film' }))
    const dialog = screen.getByRole('dialog')
    const reason = within(dialog).getByLabelText(/reason/i)
    expect(reason).toHaveFocus()
    expect(v2.markAbsent).not.toHaveBeenCalled()
    await user.type(reason, 'travelling')
    await user.click(within(dialog).getByRole('button', { name: 'Mark absent' }))
    await waitFor(() => expect(v2.markAbsent).toHaveBeenCalledWith('mv1', 'u2', 'travelling'))
  })
})

// ── BETWEEN ──────────────────────────────────────────────────────────────────

describe('PHASE.BETWEEN', () => {
  const between = {
    phase: PHASE.BETWEEN, month: MONTH,
    submissions: SUBS.map(s => (s.id === 's1' ? { ...s, elected: true } : s)),
    elections: [{ id: 'e1', sequence: 1, status: 'closed', movie_id: 'mv1', tie_broken_randomly: false }],
    films: [{ id: 'mv1', title: 'Weapons', scores_revealed: true }],
  }

  it('opens the next vote directly', async () => {
    const user = userEvent.setup()
    renderPanel(between)
    await user.click(await screen.findByRole('button', { name: 'Open the next vote' }))
    await waitFor(() => expect(v2.openElection).toHaveBeenCalledWith('m1'))
  })

  it('disables the next vote with an explanation when no candidates remain', async () => {
    renderPanel({ ...between, submissions: between.submissions.map(s => ({ ...s, elected: true })) })
    expect(await screen.findByRole('button', { name: 'Open the next vote' })).toBeDisabled()
    expect(screen.getByText(/no candidates remain/i)).toBeInTheDocument()
  })

  it('close month is confirm-gated and lists the leftovers that will be discarded', async () => {
    const user = userEvent.setup()
    renderPanel(between)
    await user.click(await screen.findByRole('button', { name: 'Close the month' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Primal Fear')).toBeInTheDocument()
    expect(within(dialog).getByText('Hereditary')).toBeInTheDocument()
    expect(within(dialog).queryByText('Weapons')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/november 2026/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(v2.closeMonth).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close the month' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close the month' }))
    await waitFor(() => expect(v2.closeMonth).toHaveBeenCalledWith('m1'))
  })
})

// ── CLOSED ───────────────────────────────────────────────────────────────────

describe('PHASE.CLOSED', () => {
  it('shows the summary and a manual start path', async () => {
    renderPanel({ phase: PHASE.CLOSED, month: { ...MONTH, status: 'revealed' }, films: [{ id: 'mv1' }] })
    expect(await screen.findByText(/next month is open for submissions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start the next 2\.0 month/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close the month/i })).not.toBeInTheDocument()
  })
})

// ── Vote weights ─────────────────────────────────────────────────────────────

describe('Vote weights', () => {
  it('shows current values, rejects non-decreasing weights, saves valid ones', async () => {
    const user = userEvent.setup()
    renderPanel({})
    const first = await screen.findByLabelText('1st place')
    expect(first).toHaveValue(6)
    expect(screen.getByText(/club practice: 6 \/ 4 \/ 3/i)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save weights' })
    expect(save).toBeDisabled() // unchanged

    await user.clear(screen.getByLabelText('2nd place'))
    await user.type(screen.getByLabelText('2nd place'), '6')
    // (scoped by text: the NONE-phase start form shows its own "no season" alert too)
    expect(screen.getByText(/strictly decreasing/i)).toHaveAttribute('role', 'alert')
    expect(save).toBeDisabled()

    await user.clear(first); await user.type(first, '5')
    await user.clear(screen.getByLabelText('2nd place')); await user.type(screen.getByLabelText('2nd place'), '3')
    await user.clear(screen.getByLabelText('3rd place')); await user.type(screen.getByLabelText('3rd place'), '1')
    await user.click(save)
    await waitFor(() => expect(v2.setVoteWeights).toHaveBeenCalledWith([5, 3, 1]))
  })
})
