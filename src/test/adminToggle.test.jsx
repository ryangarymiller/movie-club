import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Profile from '../pages/Profile'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockEq = vi.fn(() => Promise.resolve({ error: null }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockRatingsOrder = vi.fn(() => Promise.resolve({ data: [], error: null }))
const mockRatingsNot = vi.fn(() => ({ order: mockRatingsOrder }))
const mockRatingsEq = vi.fn(() => ({ not: mockRatingsNot }))
const mockMoviesIn = vi.fn(() => Promise.resolve({ data: [], error: null }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(() => Promise.resolve()),
    },
    from: vi.fn((table) => {
      if (table === 'users') {
        return { update: mockUpdate }
      }
      if (table === 'ratings') {
        return {
          select: vi.fn(() => ({
            eq: mockRatingsEq,
          })),
        }
      }
      // movies_safe
      return {
        select: vi.fn(() => ({
          in: mockMoviesIn,
        })),
      }
    }),
  },
}))

const mockFetchProfile = vi.fn(() => Promise.resolve())

// Mutable refs so individual tests can override them
let _profile = {
  id: 'user-1',
  name: 'Ryan Miller',
  role: 'admin',
  joined_at: '2026-01-05T00:00:00Z',
  admin_mode_enabled: false,
}
let _isAdmin = true

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    profile: _profile,
    isAdmin: _isAdmin,
    fetchProfile: mockFetchProfile,
  })),
}))

vi.mock('../context/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    accent: 'crimson',
    setAccent: vi.fn(),
  })),
}))

// ── Import after mock registration ────────────────────────────────────────────
import { useAuth } from '../context/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderProfile() {
  return render(<Profile />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin section visibility', () => {
  beforeEach(() => {
    _profile = { id: 'user-1', name: 'Ryan Miller', role: 'admin', joined_at: '2026-01-05T00:00:00Z', admin_mode_enabled: false }
    _isAdmin = true
    useAuth.mockReturnValue({ profile: _profile, isAdmin: _isAdmin, fetchProfile: mockFetchProfile })
    vi.clearAllMocks()
    mockFetchProfile.mockResolvedValue(undefined)
  })

  it('renders the "Admin Mode" row when isAdmin is true', () => {
    renderProfile()
    expect(screen.getByText('Admin Mode')).toBeInTheDocument()
  })

  it('renders the navigation note when isAdmin is true', () => {
    renderProfile()
    expect(screen.getByText('Shows the Admin tab in navigation')).toBeInTheDocument()
  })

  it('renders the admin toggle button when isAdmin is true', () => {
    renderProfile()
    expect(screen.getByRole('button', { name: /toggle admin mode/i })).toBeInTheDocument()
  })

  it('does NOT render Admin Mode row when isAdmin is false', () => {
    useAuth.mockReturnValue({
      profile: { ..._profile, role: 'member' },
      isAdmin: false,
      fetchProfile: mockFetchProfile,
    })
    renderProfile()
    expect(screen.queryByText('Admin Mode')).not.toBeInTheDocument()
    expect(screen.queryByText('Shows the Admin tab in navigation')).not.toBeInTheDocument()
  })
})

describe('Admin mode toggle', () => {
  beforeEach(() => {
    _profile = { id: 'user-1', name: 'Ryan Miller', role: 'admin', joined_at: '2026-01-05T00:00:00Z', admin_mode_enabled: false }
    _isAdmin = true
    useAuth.mockReturnValue({ profile: _profile, isAdmin: _isAdmin, fetchProfile: mockFetchProfile })
    vi.clearAllMocks()
    mockFetchProfile.mockResolvedValue(undefined)
    mockEq.mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
  })

  it('toggle has aria-pressed=false when admin_mode_enabled is false', () => {
    renderProfile()
    const toggle = screen.getByRole('button', { name: /toggle admin mode/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggle has aria-pressed=true when admin_mode_enabled is true', () => {
    useAuth.mockReturnValue({
      profile: { ..._profile, admin_mode_enabled: true },
      isAdmin: true,
      fetchProfile: mockFetchProfile,
    })
    renderProfile()
    const toggle = screen.getByRole('button', { name: /toggle admin mode/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the toggle calls supabase update with the toggled value', async () => {
    const { supabase } = await import('../lib/supabase')
    renderProfile()
    const toggle = screen.getByRole('button', { name: /toggle admin mode/i })
    await userEvent.click(toggle)

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('users')
      expect(mockUpdate).toHaveBeenCalledWith({ admin_mode_enabled: true })
    })
  })

  it('clicking the toggle calls fetchProfile with the user id after update', async () => {
    renderProfile()
    const toggle = screen.getByRole('button', { name: /toggle admin mode/i })
    await userEvent.click(toggle)

    await waitFor(() => {
      expect(mockFetchProfile).toHaveBeenCalledWith('user-1')
    })
  })
})
