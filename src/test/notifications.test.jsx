import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { NotificationsProvider, useNotifications } from '../context/NotificationsContext'
import NotificationBell from '../components/NotificationCenter'

// ─── Supabase mock ──────────────────────────────────────────────────────────
// A chainable query builder whose terminal `.limit()` resolves to the seeded
// rows, plus capturable `update().eq().is()` for read-marking, and a no-op
// realtime channel.

let seededRows = []
const updateCalls = []

function makeQuery() {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    is: vi.fn(() => Promise.resolve({ data: null, error: null })),
    order: vi.fn(() => q),
    limit: vi.fn(() => Promise.resolve({ data: seededRows, error: null })),
    update: vi.fn((vals) => {
      updateCalls.push(vals)
      return q
    }),
  }
  return q
}

const channelStub = {
  on: vi.fn(function () { return this }),
  subscribe: vi.fn(function () { return this }),
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => makeQuery()),
    channel: vi.fn(() => channelStub),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ profile: { id: 'user-1', name: 'Ryan Miller' } })),
}))

// ─── Navigation spy ───────────────────────────────────────────────────────────
const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateSpy }
})

function seed(rows) { seededRows = rows }

beforeEach(() => {
  seededRows = []
  updateCalls.length = 0
  navigateSpy.mockClear()
})

// A tiny consumer that surfaces context values as text/buttons.
function Consumer() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications()
  return (
    <div>
      <span data-testid="count">{unreadCount}</span>
      <span data-testid="total">{notifications.length}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => markRead(notifications[0]?.id)}>mark-first</button>
      <button onClick={markAllRead}>mark-all</button>
    </div>
  )
}

function renderProvider(ui) {
  return render(
    <MemoryRouter>
      <NotificationsProvider>{ui}</NotificationsProvider>
    </MemoryRouter>
  )
}

describe('NotificationsContext', () => {
  it('loads notifications and computes the unread count', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'mention', title: 'A', body: 'b', read_at: null, created_at: new Date().toISOString() },
      { id: 'n2', user_id: 'user-1', type: 'reply', title: 'B', body: 'b', read_at: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: 'n3', user_id: 'user-1', type: 'reply', title: 'C', body: 'b', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('3'))
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('markRead decrements the unread count and persists', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'mention', title: 'A', body: 'b', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    await act(async () => { fireEvent.click(screen.getByText('mark-first')) })
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    expect(updateCalls.some((c) => 'read_at' in c)).toBe(true)
  })

  it('markAllRead zeroes the unread count', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'mention', title: 'A', read_at: null, created_at: new Date().toISOString() },
      { id: 'n2', user_id: 'user-1', type: 'reply', title: 'B', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    await act(async () => { fireEvent.click(screen.getByText('mark-all')) })
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
  })
})

describe('NotificationBell', () => {
  it('shows the unread badge', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'mention', title: 'You were mentioned', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<NotificationBell />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument()
    )
  })

  it('opens the panel and renders a notification title', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'reply', title: 'Chris replied to your review', body: 'Nice take', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<NotificationBell />)
    await waitFor(() => expect(screen.getByRole('button', { name: /unread/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /unread/i }))
    // Title appears in both the popover and the (display:none) sheet — getAllByText.
    expect(screen.getAllByText('Chris replied to your review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bulletin').length).toBeGreaterThan(0)
  })

  it('navigates to the link and marks read when a row is clicked', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'scores_revealed', title: 'Scores are in', link: '/films', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<NotificationBell />)
    await waitFor(() => expect(screen.getByRole('button', { name: /unread/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /unread/i }))
    const rows = screen.getAllByText('Scores are in')
    await act(async () => { fireEvent.click(rows[0]) })
    expect(navigateSpy).toHaveBeenCalledWith('/films')
    expect(updateCalls.some((c) => 'read_at' in c)).toBe(true)
  })

  it('shows the empty state when there are no notifications', async () => {
    seed([])
    renderProvider(<NotificationBell />)
    // No badge → label is just "Notifications".
    await waitFor(() => expect(screen.getByRole('button', { name: /^Notifications$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Notifications$/i }))
    expect(screen.getAllByText(/all caught up/i).length).toBeGreaterThan(0)
  })
})
