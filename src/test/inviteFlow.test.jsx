import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      signOut: vi.fn(() => Promise.resolve()),
    },
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    profile: { id: 'admin-1', name: 'Ryan Miller', admin_mode_enabled: true },
    isAdmin: true,
  })),
}))

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------
// Mirrors the exact fetch chains in Admin.jsx fetchAll():
//   movies:  .select(...).order('id')          → { data: [], error: null }
//   ratings: .select(...)                       → { data: [], error: null }  (no .order)
//   users:   .select(...).order('joined_at')   → { data: [], error: null }
//   months:  .select(...).order('month_year')  → { data: [], error: null }

let insertMock

function setupMocks({ insertError = null } = {}) {
  insertMock = vi.fn(() => Promise.resolve({ error: insertError }))

  supabase.from.mockImplementation((table) => {
    switch (table) {
      case 'movies':
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }),
        }

      case 'ratings':
        // No .order() call — select itself is awaited
        return {
          select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          upsert: vi.fn(() => Promise.resolve({ error: null })),
        }

      case 'users':
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          }),
          insert: insertMock,
          update: vi.fn().mockReturnValue({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }),
        }

      case 'months':
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          }),
        }

      case 'seasons':
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }),
        }

      case 'app_settings':
        // SeasonReadjustmentPanel: .select().limit().maybeSingle() + .update().eq()
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { readjustment_length_days: 7 }, error: null })),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          }),
        }

      case 'pick_change_requests':
      case 'score_change_requests':
        // Admin request panels: .select().eq('status','pending').order(...)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn(() => Promise.resolve({ error: null })) }),
        }

      default:
        return {
          select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
    }
  })
}

// ---------------------------------------------------------------------------
// Import Admin lazily so vi.mock hoisting runs first
// ---------------------------------------------------------------------------

let Admin

beforeAll(async () => {
  setupMocks()
  const mod = await import('../pages/Admin.jsx')
  Admin = mod.default
})

beforeEach(() => {
  // Re-install mocks and reset call history each test
  setupMocks()
})

// ---------------------------------------------------------------------------
// Helper: render Admin page on the Members tab, wait for InviteCard
// ---------------------------------------------------------------------------

async function renderMembersTab() {
  const user = userEvent.setup()
  render(<Admin />)

  // Click the Members tab button (always visible in tab bar)
  const membersBtn = await screen.findByRole('button', { name: /^members$/i })
  await user.click(membersBtn)

  // Wait until loading completes and InviteCard appears (up to 5s)
  await screen.findByRole('button', { name: /add member/i }, { timeout: 5000 })

  return user
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InviteCard — rendering', () => {
  test('renders Name input, Email input, and Send Invite button', async () => {
    await renderMembersTab()

    expect(screen.getByRole('textbox', { name: /^name$/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^email$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument()
  })
})

describe('InviteCard — validation', () => {
  test('shows validation error when Name is empty', async () => {
    const user = await renderMembersTab()

    // Fill email only, leave name blank
    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'test@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  test('shows validation error when Email is empty', async () => {
    const user = await renderMembersTab()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Alex')
    // leave email blank
    await user.click(screen.getByRole('button', { name: /add member/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
  })

  test('shows validation error for email without @', async () => {
    const user = await renderMembersTab()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Alex')
    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'notanemail')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
  })
})

describe('InviteCard — valid submission', () => {
  test('valid submit calls supabase insert with correct fields (is_active: true, role: member)', async () => {
    const user = await renderMembersTab()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Alex Jones')
    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alex Jones',
          email: 'alex@example.com',
          is_active: true,
          role: 'member',
        })
      )
    })
  })

  test('success clears the form inputs', async () => {
    const user = await renderMembersTab()

    const nameInput = screen.getByRole('textbox', { name: /^name$/i })
    const emailInput = screen.getByRole('textbox', { name: /^email$/i })

    await user.type(nameInput, 'Alex Jones')
    await user.type(emailInput, 'alex@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    await waitFor(() => {
      expect(nameInput.value).toBe('')
      expect(emailInput.value).toBe('')
    })
  })

  test('success shows green confirmation message with name and email', async () => {
    const user = await renderMembersTab()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Alex Jones')
    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    expect(
      await screen.findByText(/member added.*alex@example\.com/i)
    ).toBeInTheDocument()
  })

  test('supabase insert error shows red error message', async () => {
    setupMocks({ insertError: { message: 'duplicate key value violates unique constraint' } })
    const user = await renderMembersTab()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Alex Jones')
    await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    expect(
      await screen.findByText(/is already in the system/i)
    ).toBeInTheDocument()
  })
})
