import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import YourTurnV2 from '../components/v2/YourTurnV2'
import { loadV2State, PHASE } from '../lib/v2'
import { REVEAL_EVENT } from '../lib/useRevealRefresh'

// -- Mocks ------------------------------------------------------------------

vi.mock('../lib/supabase', () => ({ supabase: {} }))

// Keep the real PHASE / liveCandidates; only the network loader is faked.
vi.mock('../lib/v2', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, loadV2State: vi.fn() }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ profile: { id: 'me', name: 'Ryan Miller' } })),
}))

// -- Fixtures ---------------------------------------------------------------

const MONTH_UP = { id: 'm1', month_year: '2026-10', status: 'upcoming', theme: 'Halloween/Horror', submissions_close_at: null }
const MONTH_ACTIVE = { ...MONTH_UP, status: 'active' }
const FILM = { id: 'f1', title: 'Weapons', poster_url: '/weapons.jpg', scores_revealed: false, month_id: 'm1' }
// Anonymous list — titles must never surface on Home.
const SUBS = [
  { id: 's1', title: 'Primal Fear' }, { id: 's2', title: 'The Thing' }, { id: 's3', title: 'Hereditary' },
]

const ROSTER = [
  ['me', 'Ryan Miller'], ['rb', 'Ryan Bey'], ['cd', 'Chris Deschenes'], ['zk', 'Zack Smith'], ['mk', 'Mike Jones'],
]

function base(over = {}) {
  return {
    phase: PHASE.NONE, month: null, submissions: [], mySubmissions: [], elections: [], openElection: null,
    myBallot: [], films: [], currentFilm: null, myRating: null, voteProgress: [], filmProgress: [],
    weights: [6, 4, 3], error: null, ...over,
  }
}

const voteRoster = votedIds => ROSTER.map(([user_id, name]) => ({ user_id, name, has_voted: votedIds.includes(user_id) }))
const filmRoster = (scoredIds, absentIds = []) =>
  ROSTER.map(([user_id, name]) => ({ user_id, name, has_scored: scoredIds.includes(user_id), absent: absentIds.includes(user_id) }))

async function renderWith(state, props = {}) {
  loadV2State.mockResolvedValue(state)
  const utils = render(<MemoryRouter><YourTurnV2 {...props} /></MemoryRouter>)
  await waitFor(() => expect(loadV2State).toHaveBeenCalled())
  return utils
}

beforeEach(() => { vi.clearAllMocks() })

// Nothing anonymous (list titles, ballot picks) or score-ish (any X.XX number) may render.
function expectNoSecrets(container) {
  for (const s of SUBS) expect(screen.queryByText(new RegExp(s.title))).toBeNull()
  expect(container.textContent).not.toMatch(/\d+\.\d{2}/)
}

// -- Tests ------------------------------------------------------------------

describe('YourTurnV2 — collecting', () => {
  test('0 of 2 submitted → primary "Add films to the list" with theme', async () => {
    const { container } = await renderWith(base({ phase: PHASE.COLLECTING, month: MONTH_UP, submissions: SUBS }))
    expect(await screen.findByText('Add films to the list')).toBeInTheDocument()
    expect(screen.getByText('0/2 added')).toBeInTheDocument()
    expect(screen.getByText(/Halloween\/Horror/, { selector: 'p:not(.uppercase)' })).toBeInTheDocument()
    expect(screen.getByTestId('yt2-collecting')).toHaveAttribute('data-tone', 'primary')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/this-month')
    expectNoSecrets(container)
  })

  test('1 of 2 with a deadline shows the countdown', async () => {
    const close = new Date(Date.now() + 3 * 86400000).toISOString()
    await renderWith(base({ phase: PHASE.COLLECTING, month: { ...MONTH_UP, submissions_close_at: close }, mySubmissions: [{ id: 's1' }] }))
    expect(await screen.findByText('1/2 added')).toBeInTheDocument()
    expect(screen.getByText(/List closes in 2d|List closes in 3d/)).toBeInTheDocument()
  })

  test('2 of 2 → quiet "You\'re in"', async () => {
    await renderWith(base({ phase: PHASE.COLLECTING, month: MONTH_UP, mySubmissions: [{ id: 's1' }, { id: 's2' }] }))
    expect(await screen.findByText(/You.re in — 2 films on the list/)).toBeInTheDocument()
    expect(screen.getByTestId('yt2-collecting-done')).toHaveAttribute('data-tone', 'quiet')
    expect(screen.queryByText('Add films to the list')).toBeNull()
  })
})

describe('YourTurnV2 — voting', () => {
  test('not voted → "Vote for the next film" with how many have voted', async () => {
    const { container } = await renderWith(base({
      phase: PHASE.VOTING, month: MONTH_ACTIVE, submissions: SUBS, openElection: { id: 'e1' },
      voteProgress: voteRoster(['rb', 'cd']),
    }))
    expect(await screen.findByText('Vote for the next film')).toBeInTheDocument()
    expect(screen.getByText('2/5 voted')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 of 5 have voted' })).toBeInTheDocument()
    expectNoSecrets(container)
  })

  test('fewer than 3 films left → rank them all', async () => {
    await renderWith(base({ phase: PHASE.VOTING, month: MONTH_ACTIVE, submissions: SUBS.slice(0, 2), voteProgress: voteRoster([]) }))
    expect(await screen.findByText('Rank the 2 films left on the list.')).toBeInTheDocument()
  })

  test('voted → "Voted — waiting on" names, never the ballot', async () => {
    const { container } = await renderWith(base({
      phase: PHASE.VOTING, month: MONTH_ACTIVE, submissions: SUBS, openElection: { id: 'e1' },
      myBallot: ['s2', 's1', 's3'], voteProgress: voteRoster(['me', 'mk']),
    }))
    // Two Ryans in the roster → disambiguated as "Ryan B."; the viewer is never listed.
    expect(await screen.findByText('Voted — waiting on Ryan B., Chris and Zack')).toBeInTheDocument()
    expect(screen.queryByText('Vote for the next film')).toBeNull()
    expect(container.textContent).not.toMatch(/s1|s2|s3/)
    expectNoSecrets(container)
  })
})

describe('YourTurnV2 — watching', () => {
  test('not scored → "Watch {film}" with poster, members to go, and Score it', async () => {
    const onScore = vi.fn()
    const rating = { id: 'r1', score: null, pre_watch_excitement: 6.5 }
    const { container } = await renderWith(base({
      phase: PHASE.WATCHING, month: MONTH_ACTIVE, films: [FILM], currentFilm: FILM, myRating: rating,
      filmProgress: filmRoster(['rb', 'cd']),
    }), { onScore })
    expect(await screen.findByText('Watch Weapons')).toBeInTheDocument()
    expect(screen.getByText('3 of 5 still to watch')).toBeInTheDocument()
    expect(container.querySelector('img').getAttribute('src')).toContain('/weapons.jpg')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Score it' }))
    expect(onScore).toHaveBeenCalledWith(FILM, rating)
    // The viewer's own excitement score isn't echoed either.
    expect(container.textContent).not.toMatch(/6\.5/)
  })

  test('last one left → pressure copy', async () => {
    await renderWith(base({
      phase: PHASE.WATCHING, month: MONTH_ACTIVE, films: [FILM], currentFilm: FILM,
      filmProgress: filmRoster(['rb', 'cd', 'zk', 'mk']),
    }))
    expect(await screen.findByText(/You.re the last one/)).toBeInTheDocument()
  })

  test('scored → "Waiting on" names (absent excluded), no scores shown', async () => {
    const { container } = await renderWith(base({
      phase: PHASE.WATCHING, month: MONTH_ACTIVE, films: [FILM], currentFilm: FILM,
      myRating: { id: 'r1', score: 7.25 },
      filmProgress: filmRoster(['me', 'rb'], ['mk']),
    }))
    expect(await screen.findByText('Waiting on Chris and Zack')).toBeInTheDocument()
    expect(screen.queryByText(/Mike/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Score it' })).toBeNull()
    expect(container.textContent).not.toMatch(/7\.25/)
    expectNoSecrets(container)
  })

  test('viewer marked absent → owes nothing, sees who the club is waiting on', async () => {
    await renderWith(base({
      phase: PHASE.WATCHING, month: MONTH_ACTIVE, films: [FILM], currentFilm: FILM,
      filmProgress: filmRoster(['rb', 'cd', 'zk'], ['me']),
    }))
    expect(await screen.findByText('Waiting on Mike')).toBeInTheDocument()
    expect(screen.getByText('Sitting this one out')).toBeInTheDocument()
  })
})

describe('YourTurnV2 — between / idle / error', () => {
  test('between → "Everyone\'s watched {last film} — see the reveal"', async () => {
    await renderWith(base({
      phase: PHASE.BETWEEN, month: MONTH_ACTIVE,
      films: [{ ...FILM, id: 'f0', title: 'Nope', scores_revealed: true }, { ...FILM, scores_revealed: true }],
    }))
    expect(await screen.findByText(/Everyone.s watched Weapons — see the reveal/)).toBeInTheDocument()
  })

  test.each([PHASE.CLOSED, PHASE.NONE])('%s → soft "Next round starting soon"', async phase => {
    await renderWith(base({ phase, month: phase === PHASE.CLOSED ? { ...MONTH_UP, status: 'revealed' } : null }))
    expect(await screen.findByText('Next round starting soon')).toBeInTheDocument()
  })

  test('load error → retry', async () => {
    await renderWith(base({ error: 'boom' }))
    expect(await screen.findByText(/Couldn.t load this round/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(loadV2State).toHaveBeenCalledTimes(2)
  })
})

describe('YourTurnV2 — refresh', () => {
  test('reloads on a reveal broadcast and when refreshKey changes', async () => {
    const state = base({ phase: PHASE.COLLECTING, month: MONTH_UP })
    loadV2State.mockResolvedValue(state)
    const { rerender } = render(<MemoryRouter><YourTurnV2 refreshKey={0} /></MemoryRouter>)
    await screen.findByText('Add films to the list')
    expect(loadV2State).toHaveBeenCalledWith('me')
    act(() => { window.dispatchEvent(new CustomEvent(REVEAL_EVENT)) })
    await waitFor(() => expect(loadV2State).toHaveBeenCalledTimes(2))
    rerender(<MemoryRouter><YourTurnV2 refreshKey={1} /></MemoryRouter>)
    await waitFor(() => expect(loadV2State).toHaveBeenCalledTimes(3))
  })
})
