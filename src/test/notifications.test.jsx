import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { NotificationsProvider, useNotifications } from '../context/NotificationsContext'
import NotificationBell from '../components/NotificationCenter'

// ─── Supabase mock ──────────────────────────────────────────────────────────
// A table-aware chainable query builder:
//   · notifications  → terminal `.limit()` resolves to the seeded rows;
//                      capturable `update().eq().is()[.in()]` for read-marking.
//   · notification_preferences → terminal `.maybeSingle()` resolves to the seeded
//                      prefs row (or null = all defaults); `.upsert()` is captured.
// Plus a no-op realtime channel.

let seededRows = []
let seededPrefs = null
const updateCalls = []
const upsertCalls = []

function makeQuery() {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    is: vi.fn(() => Promise.resolve({ data: null, error: null })),
    order: vi.fn(() => q),
    limit: vi.fn(() => Promise.resolve({ data: seededRows, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: seededPrefs, error: null })),
    update: vi.fn((vals) => {
      updateCalls.push(vals)
      return q
    }),
    upsert: vi.fn((vals) => {
      upsertCalls.push(vals)
      return Promise.resolve({ data: null, error: null })
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
function seedPrefs(row) { seededPrefs = row }

beforeEach(() => {
  seededRows = []
  seededPrefs = null
  updateCalls.length = 0
  upsertCalls.length = 0
  navigateSpy.mockClear()
})

// A tiny consumer that surfaces context values as text/buttons.
function Consumer() {
  const { notifications, unreadCount, loading, markRead, markAllRead, prefs, updatePrefs } = useNotifications()
  return (
    <div>
      <span data-testid="count">{unreadCount}</span>
      <span data-testid="total">{notifications.length}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="muted">{(prefs?.muted_types ?? []).join(',')}</span>
      <button onClick={() => markRead(notifications[0]?.id)}>mark-first</button>
      <button onClick={markAllRead}>mark-all</button>
      <button onClick={() => updatePrefs({ muted_types: ['reply'] })}>mute-reply</button>
      <button onClick={() => updatePrefs({ muted_types: [] })}>unmute-all</button>
      <button onClick={() => updatePrefs({ quiet_start: '22:00:00', quiet_end: '07:00:00' })}>set-quiet</button>
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

describe('NotificationsContext — preferences & muting', () => {
  it('hides muted types from the exposed list and unread count', async () => {
    seedPrefs({ user_id: 'user-1', muted_types: ['reply'], channel_push: false, channel_email: false, quiet_start: null, quiet_end: null })
    seed([
      { id: 'n1', user_id: 'user-1', type: 'mention', title: 'A', read_at: null, created_at: new Date().toISOString() },
      { id: 'n2', user_id: 'user-1', type: 'reply', title: 'B', read_at: null, created_at: new Date().toISOString() },
      { id: 'n3', user_id: 'user-1', type: 'reply', title: 'C', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    // Only the mention survives the filter → total 1, unread 1.
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('1'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(screen.getByTestId('muted')).toHaveTextContent('reply')
  })

  it('defaults to nothing muted when no prefs row exists', async () => {
    seedPrefs(null)
    seed([
      { id: 'n1', user_id: 'user-1', type: 'reply', title: 'A', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('1'))
    expect(screen.getByTestId('muted')).toHaveTextContent('')
  })

  it('updatePrefs upserts and mutes a type in-app immediately', async () => {
    seed([
      { id: 'n1', user_id: 'user-1', type: 'reply', title: 'A', read_at: null, created_at: new Date().toISOString() },
      { id: 'n2', user_id: 'user-1', type: 'mention', title: 'B', read_at: null, created_at: new Date().toISOString() },
    ])
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'))
    await act(async () => { fireEvent.click(screen.getByText('mute-reply')) })
    // Reply hidden immediately, no re-fetch needed.
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('1'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    // Persisted via upsert with user_id + muted_types + updated_at.
    expect(upsertCalls.length).toBeGreaterThan(0)
    const last = upsertCalls[upsertCalls.length - 1]
    expect(last.user_id).toBe('user-1')
    expect(last.muted_types).toEqual(['reply'])
    expect('updated_at' in last).toBe(true)
  })

  it('updatePrefs persists quiet hours', async () => {
    renderProvider(<Consumer />)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await act(async () => { fireEvent.click(screen.getByText('set-quiet')) })
    await waitFor(() => expect(upsertCalls.length).toBeGreaterThan(0))
    const last = upsertCalls[upsertCalls.length - 1]
    expect(last.quiet_start).toBe('22:00:00')
    expect(last.quiet_end).toBe('07:00:00')
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
