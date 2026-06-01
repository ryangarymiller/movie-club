import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WelcomeDialog from '../components/WelcomeDialog'
import { supabase } from '../lib/supabase'

// -- Mocks ------------------------------------------------------------------

// vi.mock is hoisted above imports; the factory runs instead of the real module.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
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

// -- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Re-attach the update chain after clearAllMocks resets `from`
  supabase.from.mockReturnValue({
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })
})

describe('WelcomeDialog — rendering', () => {
  test('renders "Welcome to Movie Club" headline', () => {
    render(<WelcomeDialog />)
    expect(screen.getByText('Welcome to Movie Club')).toBeInTheDocument()
  })

  test('renders the "Let\'s go" button', () => {
    render(<WelcomeDialog />)
    expect(screen.getByRole('button', { name: /let's go/i })).toBeInTheDocument()
  })

  test('renders at least one club rule', () => {
    render(<WelcomeDialog />)
    expect(
      screen.getByText("Pick a film you haven't personally seen")
    ).toBeInTheDocument()
  })

  test('renders all four rules', () => {
    render(<WelcomeDialog />)
    expect(screen.getByText("Pick a film you haven't personally seen")).toBeInTheDocument()
    expect(screen.getByText('Submit excitement score before watching')).toBeInTheDocument()
    expect(screen.getByText('Final scores locked after deadline')).toBeInTheDocument()
    expect(screen.getByText('Picker identity revealed end of month')).toBeInTheDocument()
  })
})

describe('WelcomeDialog — interaction', () => {
  test('clicking "Let\'s go" calls supabase update and fetchProfile', async () => {
    const user = userEvent.setup()
    render(<WelcomeDialog />)

    await user.click(screen.getByRole('button', { name: /let's go/i }))

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('users')
      const mockUpdate = supabase.from.mock.results[0].value.update
      expect(mockUpdate).toHaveBeenCalledWith({ has_completed_onboarding: true })
      expect(mockFetchProfile).toHaveBeenCalledWith('user-1')
    })
  })

  test('button shows loading state during async call', async () => {
    // Make fetchProfile hang so we can observe the mid-flight state
    let resolveProfile
    mockFetchProfile.mockReturnValueOnce(
      new Promise((resolve) => { resolveProfile = resolve })
    )

    const user = userEvent.setup()
    render(<WelcomeDialog />)

    await user.click(screen.getByRole('button', { name: /let's go/i }))

    // While the promise is still pending the button should show loading text
    expect(await screen.findByText(/one moment/i)).toBeInTheDocument()
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()

    // Clean up — resolve the hanging promise so React doesn't warn about state updates
    await act(async () => resolveProfile())
  })
})
