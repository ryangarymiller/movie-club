import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuidedTour from '../components/GuidedTour'
import { useClubMode } from '../context/ClubModeContext'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ profile: { id: 'u1', name: 'Ryan Miller', has_completed_onboarding: false }, fetchProfile: vi.fn() })),
}))
vi.mock('../context/TourContext', () => ({
  useTour: vi.fn(() => ({ tourOpen: false, startTour: vi.fn(), closeTour: vi.fn() })),
}))
vi.mock('../context/ClubModeContext', () => ({ useClubMode: vi.fn(() => ({ isV2: false })) }))

describe('GuidedTour copy is mode-aware', () => {
  test('1.0 keeps the original This Month copy', async () => {
    useClubMode.mockReturnValue({ isV2: false })
    render(<GuidedTour />)
    await userEvent.setup().click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/Pick your movie for next month/)).toBeInTheDocument()
    expect(screen.getByText('2 / 7')).toBeInTheDocument()
  })

  test('2.0 explains list → vote → watch → reveal, same step count', async () => {
    useClubMode.mockReturnValue({ isV2: true })
    render(<GuidedTour />)
    expect(screen.getByText(/Each month has a theme/)).toBeInTheDocument()
    expect(screen.getByText('1 / 7')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('This Month')).toBeInTheDocument()
    expect(screen.getByText(/Add up to 2 films.*rank your top 3.*Nobody moves on until everyone has watched/)).toBeInTheDocument()
    expect(screen.queryByText(/Pick your movie for next month/)).toBeNull()
  })
})
