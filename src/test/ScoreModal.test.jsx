import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import ScoreModal from '../components/ScoreModal'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(() =>
        Promise.resolve({
          data: [{ id: 'r1', pre_watch_excitement: 7.5, score: null }],
          error: null,
        })
      ),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}))

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    profile: { id: 'user-1', name: 'Ryan Miller' },
  })),
}))

const movie = {
  id: 'movie-1',
  title: 'Inception',
  year_released: 2010,
  director: 'Christopher Nolan',
  poster_url: '/abc123.jpg',
}

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const utils = render(
    <ScoreModal
      movie={movie}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />
  )
  return { ...utils, onClose, onSaved }
}

// ─── Excitement mode ──────────────────────────────────────────────────────────

describe('Excitement mode (no existingRating)', () => {
  it('renders the film title', () => {
    renderModal()
    expect(screen.getByText('Inception')).toBeInTheDocument()
  })

  it('renders the Pre-watch excitement label', () => {
    renderModal()
    // The label text is rendered with mixed case; use case-insensitive matcher
    expect(
      screen.getByText(/pre-watch excitement/i)
    ).toBeInTheDocument()
  })

  it('renders the score input', () => {
    renderModal()
    const input = screen.getByRole('spinbutton')
    expect(input).toBeInTheDocument()
  })

  it('shows a validation error when submitted with an empty input', async () => {
    renderModal()
    const submitBtn = screen.getByRole('button', { name: /lock in excitement/i })
    await userEvent.click(submitBtn)
    await waitFor(() =>
      expect(screen.getByText('Score is required')).toBeInTheDocument()
    )
  })

  it('shows "Enter a valid number" for non-numeric input', async () => {
    renderModal()
    const input = screen.getByRole('spinbutton')

    // jsdom sanitises type="number" and ignores non-numeric values through
    // the normal value setter. Temporarily switch type to text, set the value,
    // fire the React change event, then restore — this is the most reliable way
    // to get a non-numeric string past the number input sanitisation.
    input.type = 'text'
    fireEvent.change(input, { target: { value: 'abc' } })
    input.type = 'number'

    const submitBtn = screen.getByRole('button', { name: /lock in excitement/i })
    await userEvent.click(submitBtn)
    await waitFor(() =>
      expect(screen.getByText('Enter a valid number')).toBeInTheDocument()
    )
  })

  it('shows a range error for a score above 10', async () => {
    renderModal()
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '11')
    const submitBtn = screen.getByRole('button', { name: /lock in excitement/i })
    await userEvent.click(submitBtn)
    await waitFor(() =>
      expect(
        screen.getByText('Score must be between 0.01 and 10.00')
      ).toBeInTheDocument()
    )
  })
})

// ─── Final score mode ─────────────────────────────────────────────────────────

describe('Final score mode (existingRating with pre_watch_excitement, no score)', () => {
  const existingRating = {
    id: 'r1',
    pre_watch_excitement: 7.5,
    score: null,
    movie_id: 'movie-1',
    user_id: 'user-1',
  }

  it('renders the "Your score" label', () => {
    renderModal({ existingRating })
    expect(screen.getByText(/your score/i)).toBeInTheDocument()
  })

  it('renders the score input', () => {
    renderModal({ existingRating })
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('displays the locked pre-watch excitement value', () => {
    renderModal({ existingRating })
    // The locked excitement row shows "Pre-watch excitement" label + formatted value
    expect(screen.getByText('7.50')).toBeInTheDocument()
  })
})

// ─── Confirmation dialog for extreme scores ───────────────────────────────────

describe('Confirmation dialog for extreme scores (final score mode)', () => {
  const existingRating = {
    id: 'r1',
    pre_watch_excitement: 7.5,
    score: null,
    movie_id: 'movie-1',
    user_id: 'user-1',
  }

  it('shows "Are you sure?" confirmation for a score above 8.99', async () => {
    renderModal({ existingRating })
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '9.5')
    const submitBtn = screen.getByRole('button', { name: /submit score/i })
    await userEvent.click(submitBtn)
    await waitFor(() =>
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    )
  })

  it('shows "Are you sure?" confirmation for a score below 2.01', async () => {
    renderModal({ existingRating })
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '1.5')
    const submitBtn = screen.getByRole('button', { name: /submit score/i })
    await userEvent.click(submitBtn)
    await waitFor(() =>
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    )
  })

  it('"Go Back" dismisses the confirmation and returns to the score input', async () => {
    renderModal({ existingRating })
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '9.5')
    await userEvent.click(screen.getByRole('button', { name: /submit score/i }))
    await waitFor(() => expect(screen.getByText('Are you sure?')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /go back/i }))
    await waitFor(() =>
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /submit score/i })).toBeInTheDocument()
  })

  it('"Yes, submit" in the dialog saves and calls onSaved', async () => {
    const { onSaved } = renderModal({ existingRating })
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '9.5')
    await userEvent.click(screen.getByRole('button', { name: /submit score/i }))
    await waitFor(() => expect(screen.getByText('Are you sure?')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /yes, submit/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('does NOT show confirmation for a score in the normal range (e.g. 7.0)', async () => {
    const { onSaved } = renderModal({ existingRating })
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '7')
    await userEvent.click(screen.getByRole('button', { name: /submit score/i }))
    // Confirmation should never appear
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
  })
})

// ─── onClose callback ─────────────────────────────────────────────────────────

describe('onClose callback', () => {
  it('clicking the backdrop calls onClose (after animation delay)', async () => {
    vi.useFakeTimers()
    const { onClose } = renderModal()

    // The backdrop is the first child of the outermost fixed container.
    // jsdom serialises rgba(0,0,0,0.72) with spaces, so query by position instead.
    const container = document.querySelector('[style*="position: fixed"]')
    expect(container).not.toBeNull()
    const backdrop = container.firstChild
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)

    // handleClose sets visible=false then calls onClose after 260 ms
    vi.advanceTimersByTime(300)
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

// ─── Recommend outside club checkbox ─────────────────────────────────────────

describe('Recommend outside club checkbox (final score mode)', () => {
  const existingRating = {
    id: 'r1',
    pre_watch_excitement: 7.5,
    score: null,
    movie_id: 'movie-1',
    user_id: 'user-1',
  }

  it('renders the recommend outside the club label', () => {
    renderModal({ existingRating })
    expect(
      screen.getByText(/recommend.*outside.*club/i)
    ).toBeInTheDocument()
  })

  it('toggling the custom checkbox changes its visual state', async () => {
    renderModal({ existingRating })
    const labelText = screen.getByText(/recommend.*outside.*club/i)

    // Walk up to the <label> element, then find its first child (the checkbox div)
    const labelEl = labelText.closest('label')
    expect(labelEl).not.toBeNull()
    const checkboxDiv = labelEl.firstChild
    expect(checkboxDiv).not.toBeNull()

    // Initially unchecked — no SVG checkmark present
    expect(checkboxDiv.querySelector('svg')).toBeNull()

    fireEvent.click(checkboxDiv)

    // Now checked — SVG checkmark should be rendered synchronously (no async needed)
    expect(checkboxDiv.querySelector('svg')).not.toBeNull()
  })

  it('does NOT render the recommend checkbox in excitement mode', () => {
    renderModal() // no existingRating
    expect(
      screen.queryByText(/recommend.*outside.*club/i)
    ).not.toBeInTheDocument()
  })
})
