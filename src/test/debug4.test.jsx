import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../lib/supabase'

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

let insertMock

function setupMocks({ insertError = null } = {}) {
  insertMock = vi.fn(() => Promise.resolve({ error: insertError }))

  supabase.from.mockImplementation((table) => {
    switch (table) {
      case 'movies':
        return { select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }) }
      case 'ratings':
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })), upsert: vi.fn(() => Promise.resolve({ error: null })) }
      case 'users':
        return {
          select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }),
          insert: insertMock,
          update: vi.fn().mockReturnValue({ eq: vi.fn(() => Promise.resolve({ error: null })) }),
        }
      case 'months':
        return { select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }) }
      default:
        console.warn('Unhandled table:', table)
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
    }
  })
}

let Admin

beforeAll(async () => {
  setupMocks()
  const mod = await import('../pages/Admin.jsx')
  Admin = mod.default
})

beforeEach(() => {
  setupMocks()
})

async function renderMembersTab() {
  const user = userEvent.setup()
  render(<Admin />)

  const membersBtn = await screen.findByRole('button', { name: /^members$/i })
  await user.click(membersBtn)

  await screen.findByRole('button', { name: /send invite/i }, { timeout: 5000 })

  return user
}

test('renders invite form', async () => {
  await renderMembersTab()
  expect(screen.getByRole('textbox', { name: /^name$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /send invite/i })).toBeInTheDocument()
})

test('validation - empty name', async () => {
  const user = await renderMembersTab()
  await user.type(screen.getByRole('textbox', { name: /^email$/i }), 'test@example.com')
  await user.click(screen.getByRole('button', { name: /send invite/i }))
  expect(await screen.findByText('Name is required')).toBeInTheDocument()
})

test('success clears form', async () => {
  const user = await renderMembersTab()
  const nameInput = screen.getByRole('textbox', { name: /^name$/i })
  const emailInput = screen.getByRole('textbox', { name: /^email$/i })
  await user.type(nameInput, 'Alex Jones')
  await user.type(emailInput, 'alex@example.com')
  await user.click(screen.getByRole('button', { name: /send invite/i }))
  await waitFor(() => {
    expect(nameInput.value).toBe('')
    expect(emailInput.value).toBe('')
  })
})
