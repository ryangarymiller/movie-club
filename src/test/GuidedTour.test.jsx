import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuidedTour from '../components/GuidedTour'
import { supabase } from '../lib/supabase'

// -- Mocks ------------------------------------------------------------------

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
  },
}))

const mockFetchProfile = vi.fn(() => Promise.resolve())
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    profile: { id: 'user-1', name: 'Ryan Miller', has_completed_onboarding: false },
    fetchProfile: mockFetchProfile,
  })),
}))

const mockCloseTour = vi.fn()
vi.mock('../context/TourContext', () => ({
  useTour: vi.fn(() => ({ tourOpen: false, startTour: vi.fn(), closeTour: mockCloseTour })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  supabase.from.mockReturnValue({
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  })
})

// -- Tests ------------------------------------------------------------------

describe('GuidedTour', () => {
  test('opens for an un-onboarded member at the first step', () => {
    render(<GuidedTour />)
    expect(screen.getByText('Welcome to Movie Club')).toBeInTheDocument()
    expect(screen.getByText('1 / 7')).toBeInTheDocument()
  })

  test('Next advances to the second step', async () => {
    const user = userEvent.setup()
    render(<GuidedTour />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('This Month')).toBeInTheDocument()
    expect(screen.getByText('2 / 7')).toBeInTheDocument()
  })

  test('Skip marks onboarding complete, refetches, and closes the tour', async () => {
    const user = userEvent.setup()
    render(<GuidedTour />)
    await user.click(screen.getByRole('button', { name: /skip/i }))
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('users')
      const mockUpdate = supabase.from.mock.results[0].value.update
      expect(mockUpdate).toHaveBeenCalledWith({ has_completed_onboarding: true })
      expect(mockFetchProfile).toHaveBeenCalledWith('user-1')
      expect(mockCloseTour).toHaveBeenCalled()
    })
  })
})
