import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ThisMonthV2 from '../pages/ThisMonthV2'
import { loadV2State, castBallot, submitFilm, withdrawSubmission, openElection, PHASE } from '../lib/v2'
import { searchMovies, enrichFilm } from '../lib/tmdb'
import { useAuth } from '../context/AuthContext'

// -- Mocks ------------------------------------------------------------------

// Chainable, thenable query builder: every filter returns the builder; awaiting it resolves
// to the fixture rows for that table. Covers the screen's few direct reads (roster, draft
// queue, club averages, revealed ballots, "watched before") + the realtime channel.
const tables = vi.hoisted(() => ({ current: {} }))
vi.mock('../lib/supabase', () => {
  const builder = table => {
    const result = () => Promise.resolve({ data: tables.current[table] ?? [], error: null })
    const b = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'delete']) b[m] = () => b
    b.maybeSingle = () => Promise.resolve({ data: (tables.current[table] ?? [])[0] ?? null, error: null })
    b.then = (res, rej) => result().then(res, rej)
    return b
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return { supabase: { from: vi.fn(builder), channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

vi.mock('../lib/v2', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadV2State: vi.fn(),
    castBallot: vi.fn(() => Promise.resolve()),
    submitFilm: vi.fn(() => Promise.resolve('new-sub')),
    withdrawSubmission: vi.fn(() => Promise.resolve()),
    openElection: vi.fn(() => Promise.resolve('e2')),
    closeMonth: vi.fn(() => Promise.resolve('m2')),
  }
})

vi.mock('../lib/tmdb', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, searchMovies: vi.fn(() => Promise.resolve([])), enrichFilm: vi.fn() }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ profile: { id: 'me', name: 'Ryan Miller', role: 'member' }, isAdmin: false })),
}))

// The heavy film overlay + score modal are exercised by their own suites.
vi.mock('../pages/Films', () => ({ FilmDetailOverlay: () => null }))
vi.mock('../components/ScoreModal', () => ({
  default: props => <div data-testid="score-modal" data-skip={String(props.skipExcitementStep)}>{props.movie.title}</div>,
}))

// -- Fixtures ---------------------------------------------------------------

const ROSTER = [
  ['me', 'Ryan Miller'], ['rb', 'Ryan Bey'], ['cd', 'Chris Deschenes'], ['zk', 'Zack Smith'], ['mk', 'Mike Jones'],
]
const USERS = ROSTER.map(([id, name]) => ({ id, name, is_test: false, is_active: true }))

const MONTH_UP = { id: 'm1', month_year: '2026-10', status: 'upcoming', mode: 'v2', theme: 'Halloween/Horror', submissions_close_at: null }
const MONTH_ACTIVE = { ...MONTH_UP, status: 'active' }

// submissions_safe: user_id is masked (null) for everyone but the viewer.
const SUBS = [
  { id: 'sA', tmdb_id: 1, title: 'Primal Fear', poster_url: null, user_id: null, metadata: { year: '1996' } },
  { id: 'sB', tmdb_id: 2, title: 'Weapons', poster_url: null, user_id: null, metadata: { year: '2025' } },
  { id: 'sC', tmdb_id: 3, title: 'The Thing', poster_url: null, user_id: 'me', metadata: { year: '1982' }, justification: 'Practical effects!' },
  { id: 'sD', tmdb_id: 4, title: 'Hereditary', poster_url: null, user_id: 'me', metadata: { year: '2018' } },
]

const FILM = {
  id: 'f1', month_id: 'm1', title: 'Weapons', poster_url: null, year_released: 2025, director: 'Zach Cregger',
  runtime_minutes: 128, genre: ['Horror', 'Mystery'], plot_summary: 'A class of kids vanishes.', scores_revealed: false,
  picked_by_user_id: null, submission_id: 'sB',
}

function base(over = {}) {
  return {
    phase: PHASE.NONE, month: null, submissions: [], mySubmissions: [], elections: [], openElection: null,
    myBallot: [], films: [], currentFilm: null, myRating: null, voteProgress: [], filmProgress: [],
    weights: [6, 4, 3], error: null, ...over,
  }
}
const voteRoster = voted => ROSTER.map(([user_id, name]) => ({ user_id, name, has_voted: voted.includes(user_id) }))
const filmRoster = (scored, absent = []) =>
  ROSTER.map(([user_id, name]) => ({ user_id, name, has_scored: scored.includes(user_id), absent: absent.includes(user_id) }))

async function renderWith(state, extraTables = {}) {
  tables.current = { users: USERS, draft_queue: [], ratings: [], ballots_safe: [], movies: [], ...extraTables }
  loadV2State.mockResolvedValue(state)
  const utils = render(<MemoryRouter><ThisMonthV2 /></MemoryRouter>)
  await waitFor(() => expect(loadV2State).toHaveBeenCalledWith('me'))
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockImplementation(() => ({ profile: { id: 'me', name: 'Ryan Miller', role: 'member' }, isAdmin: false }))
})

// -- NONE / CLOSED ------------------------------------------------------------

describe('ThisMonthV2 — no round', () => {
  it('NONE shows the friendly empty state', async () => {
    await renderWith(base())
    expect(await screen.findByText("The next round hasn't started yet")).toBeInTheDocument()
  })

  it('CLOSED shows the empty state too', async () => {
    await renderWith(base({ phase: PHASE.CLOSED, month: { ...MONTH_ACTIVE, status: 'revealed' } }))
    expect(await screen.findByText("The next round hasn't started yet")).toBeInTheDocument()
  })

  it('surfaces a load error with a retry', async () => {
    await renderWith(base({ error: 'permission denied' }))
    expect(await screen.findByText('permission denied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

// -- COLLECTING ---------------------------------------------------------------

describe('ThisMonthV2 — collecting submissions', () => {
  const collecting = (mine, over = {}) => base({
    phase: PHASE.COLLECTING, month: MONTH_UP, submissions: SUBS,
    mySubmissions: SUBS.filter(s => mine.includes(s.id)), ...over,
  })

  it('shows the theme as the header and the round rail on Submit', async () => {
    await renderWith(collecting(['sC', 'sD']))
    expect(await screen.findByRole('heading', { level: 1, name: 'Halloween/Horror' })).toBeInTheDocument()
    const rail = screen.getByRole('list', { name: 'Round progress' })
    expect(within(rail).getByText('Submit').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('hides the add flow at 2/2 and offers Withdraw on each of yours', async () => {
    await renderWith(collecting(['sC', 'sD']))
    expect(await screen.findByText('2/2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add a film/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Withdraw The Thing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw Hereditary' })).toBeInTheDocument()
  })

  it('withdraw asks to confirm, then calls withdrawSubmission and reloads', async () => {
    const user = userEvent.setup()
    await renderWith(collecting(['sC', 'sD']))
    await user.click(await screen.findByRole('button', { name: 'Withdraw The Thing' }))
    expect(withdrawSubmission).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, withdraw' }))
    await waitFor(() => expect(withdrawSubmission).toHaveBeenCalledWith('sC'))
    await waitFor(() => expect(loadV2State).toHaveBeenCalledTimes(2))
  })

  it('the list so far shows every live film, marks only yours, and never names a submitter', async () => {
    const { container } = await renderWith(collecting(['sC', 'sD']))
    const list = await screen.findByRole('heading', { name: 'The list so far' })
    const section = list.closest('section')
    for (const s of SUBS) expect(within(section).getByText(s.title)).toBeInTheDocument()
    expect(within(section).getAllByText('Yours')).toHaveLength(2)
    expect(within(section).getByText('4 films')).toBeInTheDocument()
    for (const [, name] of ROSTER.slice(1)) expect(container.textContent).not.toContain(name)
  })

  it('empty list shows an empty state and the add CTA', async () => {
    await renderWith(collecting([], { submissions: [] }))
    expect(await screen.findByText('Nothing on the list yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add a film/ })).toBeInTheDocument()
  })

  it('search → pick → submitFilm with enriched metadata + justification', async () => {
    const user = userEvent.setup()
    searchMovies.mockResolvedValue([{ id: 99, title: 'The Descent', release_date: '2005-07-08', poster_path: '/d.jpg' }])
    enrichFilm.mockResolvedValue({
      tmdb_id: 99, title: 'The Descent', poster_path: '/d.jpg', year: '2005', director: 'Neil Marshall',
      runtime_minutes: 99, genre: 'Horror', plot_summary: 'Cavers.', streaming_providers: null, tmdb_cast: [], tmdb_writers: [],
    })
    await renderWith(collecting(['sC']))
    await user.click(await screen.findByRole('button', { name: /Add a film/ }))
    await user.type(screen.getByLabelText('Search for a film'), 'descent')
    await user.click(await screen.findByRole('button', { name: /The Descent \(2005\)/ }, { timeout: 2000 }))
    await user.type(await screen.findByPlaceholderText('Sell it to the club…'), 'Claustrophobic perfection')
    await user.click(screen.getByRole('button', { name: 'Add to the list' }))
    await waitFor(() => expect(submitFilm).toHaveBeenCalledTimes(1))
    const [monthId, selected, metadata, justification] = submitFilm.mock.calls[0]
    expect(monthId).toBe('m1')
    expect(selected.tmdb_id).toBe(99)
    expect(metadata).toMatchObject({ director: 'Neil Marshall', justification: 'Claustrophobic perfection' })
    expect(justification).toBe('Claustrophobic perfection')
  })

  it('films already on the list are flagged in search and cannot be picked', async () => {
    const user = userEvent.setup()
    searchMovies.mockResolvedValue([{ id: 2, title: 'Weapons', release_date: '2025-08-08' }])
    await renderWith(collecting(['sC']))
    await user.click(await screen.findByRole('button', { name: /Add a film/ }))
    await user.type(screen.getByLabelText('Search for a film'), 'weapons')
    const row = await screen.findByRole('button', { name: /Weapons \(2025\) — on the list/ }, { timeout: 2000 })
    expect(row).toBeDisabled()
  })

  it('shows a server rejection verbatim under a kind headline', async () => {
    const user = userEvent.setup()
    searchMovies.mockResolvedValue([{ id: 77, title: 'Scream', release_date: '1996-12-20' }])
    enrichFilm.mockResolvedValue({ tmdb_id: 77, title: 'Scream', poster_path: null, year: '1996' })
    submitFilm.mockRejectedValueOnce(new Error('already on the list'))
    await renderWith(collecting([]))
    await user.click(await screen.findByRole('button', { name: /Add a film/ }))
    await user.type(screen.getByLabelText('Search for a film'), 'scream')
    await user.click(await screen.findByRole('button', { name: /Scream \(1996\)/ }, { timeout: 2000 }))
    await user.click(await screen.findByRole('button', { name: 'Add to the list' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Someone beat you to it/)
    expect(alert).toHaveTextContent('already on the list')
  })
})

// -- VOTING -------------------------------------------------------------------

describe('ThisMonthV2 — voting', () => {
  const ELECTION = { id: 'e1', month_id: 'm1', sequence: 1, status: 'open', tally: null }
  const voting = over => base({
    phase: PHASE.VOTING, month: MONTH_ACTIVE, submissions: SUBS, openElection: ELECTION, elections: [ELECTION],
    voteProgress: voteRoster(['rb', 'cd']), ...over,
  })

  it("can't submit with zero picks", async () => {
    await renderWith(voting())
    const submit = await screen.findByRole('button', { name: 'Submit my vote' })
    expect(submit).toBeDisabled()
    expect(castBallot).not.toHaveBeenCalled()
  })

  it('submits the ranked ids in tap order, reordered by the arrows', async () => {
    const user = userEvent.setup()
    await renderWith(voting())
    await user.click(await screen.findByRole('button', { name: 'Rank Weapons' }))
    await user.click(screen.getByRole('button', { name: 'Rank Primal Fear' }))
    await user.click(screen.getByRole('button', { name: 'Rank The Thing' }))
    // a 4th can't be added once 3 are ranked
    await user.click(screen.getByRole('button', { name: /Rank Hereditary/ }))
    expect(screen.getByText('3/3 ranked')).toBeInTheDocument()
    // swap 1st and 2nd
    await user.click(screen.getByRole('button', { name: 'Move Primal Fear up' }))
    await user.click(screen.getByRole('button', { name: 'Submit my vote' }))
    await waitFor(() => expect(castBallot).toHaveBeenCalledWith('e1', ['sA', 'sB', 'sC']))
  })

  it('shows rank points from the weights and announces changes', async () => {
    const user = userEvent.setup()
    await renderWith(voting({ weights: [5, 3, 1] }))
    await user.click(await screen.findByRole('button', { name: 'Rank Weapons' }))
    expect(await screen.findByText('Weapons ranked 1st, worth 5 points.')).toBeInTheDocument()
    expect(screen.getByText(/1st = 5 pts · 2nd = 3 pts · 3rd = 1 pts/)).toBeInTheDocument()
  })

  it('roster shows who we are waiting on — never ballot contents, never a tally', async () => {
    const { container } = await renderWith(voting())
    expect(await screen.findByText(/Waiting on/)).toHaveTextContent('Waiting on you, Zack and Mike')
    expect(screen.getByText('2/5 voted')).toBeInTheDocument()
    expect(screen.queryByText('How the vote went')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Final tally' })).toBeNull()
    expect(container.textContent).not.toMatch(/×\s*1st/)
  })

  it('after voting: shows your ranking with a Change button that reopens the editor', async () => {
    const user = userEvent.setup()
    await renderWith(voting({ myBallot: ['sB', 'sA'], voteProgress: voteRoster(['me', 'rb']) }))
    expect(await screen.findByText('✓ You voted')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change my vote' }))
    const update = screen.getByRole('button', { name: 'Update my vote' })
    expect(update).toBeEnabled()
    await user.click(update)
    await waitFor(() => expect(castBallot).toHaveBeenCalledWith('e1', ['sB', 'sA']))
  })
})

// -- WATCHING -----------------------------------------------------------------

describe('ThisMonthV2 — watching', () => {
  const watching = over => base({
    phase: PHASE.WATCHING, month: MONTH_ACTIVE, submissions: SUBS, films: [FILM], currentFilm: FILM,
    filmProgress: filmRoster(['rb'], ['mk']), ...over,
  })

  it('hero card + primary CTA opens the score modal straight on the final score', async () => {
    const user = userEvent.setup()
    await renderWith(watching())
    expect(await screen.findByRole('heading', { name: 'Weapons' })).toBeInTheDocument()
    expect(screen.getByText(/Film 1 this month/)).toBeInTheDocument()
    expect(screen.getByText('Horror, Mystery')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'I watched it — score it' }))
    expect(screen.getByTestId('score-modal')).toHaveAttribute('data-skip', 'true')
  })

  it('roster lists who has not scored and marks the excused member', async () => {
    await renderWith(watching())
    expect(await screen.findByText(/Waiting on/)).toHaveTextContent('Waiting on you, Chris and Zack')
    expect(screen.getByRole('button', { name: 'Mike Jones — excused' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ryan Bey — scored' })).toBeInTheDocument()
    expect(screen.getByText('1/4 scored')).toBeInTheDocument()
  })

  it('once you have scored: shows your X.XX score and that the club is waiting on the others', async () => {
    await renderWith(watching({ myRating: { id: 'r1', score: 7.5 }, filmProgress: filmRoster(['me', 'rb']) }))
    expect(await screen.findByText('7.50')).toBeInTheDocument()
    expect(screen.getByText(/Waiting on the others/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I watched it — score it' })).toBeNull()
  })
})

// -- BETWEEN ------------------------------------------------------------------

describe('ThisMonthV2 — between films', () => {
  const REVEALED = { ...FILM, scores_revealed: true, picker_revealed: true, picked_by_user_id: 'cd', pick_justification: 'Best horror of the decade.' }
  const CLOSED_ELECTION = {
    id: 'e1', month_id: 'm1', sequence: 1, status: 'closed', movie_id: 'f1', winner_submission_id: 'sB', tie_broken_randomly: false,
    tally: [
      { submission_id: 'sB', title: 'Weapons', points: 13, firsts: 2 },
      { submission_id: 'sA', title: 'Primal Fear', points: 12, firsts: 1 },
    ],
  }
  const between = over => base({
    phase: PHASE.BETWEEN, month: MONTH_ACTIVE,
    submissions: SUBS.map(s => (s.id === 'sB' ? { ...s, elected: true } : s)),
    films: [REVEALED], elections: [CLOSED_ELECTION], ...over,
  })
  const revealTables = {
    ratings: [{ movie_id: 'f1', score: 8 }, { movie_id: 'f1', score: 7 }],
    ballots_safe: [
      { user_id: 'rb', submission_id: 'sB', rank: 1 }, { user_id: 'rb', submission_id: 'sA', rank: 2 },
      { user_id: 'cd', submission_id: 'sA', rank: 1 },
    ],
  }

  it('reveals the submitter, the frozen tally, every ballot and the club average', async () => {
    await renderWith(between(), revealTables)
    expect(await screen.findByText(/Everyone's watched it/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Chris Deschenes' })).toBeInTheDocument()
    expect(screen.getByText('“Best horror of the decade.”')).toBeInTheDocument()
    const tally = screen.getByRole('list', { name: 'Final tally' })
    expect(within(tally).getByText('13 pts · 2× 1st')).toBeInTheDocument()
    expect(within(tally).getByText('12 pts · 1× 1st')).toBeInTheDocument()
    expect(await screen.findByText('Ryan Bey')).toBeInTheDocument()
    expect(screen.getAllByText('7.50').length).toBeGreaterThan(0) // (8 + 7) / 2
    expect(screen.getByText('Waiting for the next vote')).toBeInTheDocument()
  })

  it('members get no admin controls', async () => {
    await renderWith(between(), revealTables)
    await screen.findByText('Waiting for the next vote')
    expect(screen.queryByRole('button', { name: 'Open next vote' })).toBeNull()
  })

  it('admins can open the next vote after confirming', async () => {
    const user = userEvent.setup()
    useAuth.mockImplementation(() => ({ profile: { id: 'me', name: 'Ryan Miller', role: 'admin' }, isAdmin: true }))
    await renderWith(between(), revealTables)
    await user.click(await screen.findByRole('button', { name: 'Open next vote' }))
    expect(openElection).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, open the vote' }))
    await waitFor(() => expect(openElection).toHaveBeenCalledWith('m1'))
  })

  it('the "this month so far" strip lists watched films with their club average', async () => {
    await renderWith(between(), revealTables)
    expect(await screen.findByRole('button', { name: 'Film 1: Weapons, club average 7.50' })).toBeInTheDocument()
  })
})
