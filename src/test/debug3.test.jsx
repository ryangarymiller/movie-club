import { render, screen, waitFor } from '@testing-library/react'
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

function setupMocks() {
  supabase.from.mockImplementation((table) => {
    switch (table) {
      case 'movies': return { select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }) }
      case 'ratings': return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      case 'users': return { select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }), insert: vi.fn() }
      case 'months': return { select: vi.fn().mockReturnValue({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) }) }
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

afterEach(() => {
  vi.clearAllMocks()  // This is the problematic line
})

test('test 1 - loading resolves WITH clearAllMocks', async () => {
  render(<Admin />)
  await waitFor(() => {
    const skeletons = document.querySelectorAll('.animate-pulse')
    if (skeletons.length > 0) throw new Error('still loading')
  }, { timeout: 5000 })
})

test('test 2 - loading resolves WITH clearAllMocks', async () => {
  render(<Admin />)
  await waitFor(() => {
    const skeletons = document.querySelectorAll('.animate-pulse')
    if (skeletons.length > 0) throw new Error('still loading')
  }, { timeout: 5000 })
})
