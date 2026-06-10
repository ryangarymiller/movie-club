import { act, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../context/ThemeContext'

// Helper component that exposes theme values as readable text
function ThemeConsumer() {
  const { mode, accent } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="accent">{accent}</span>
    </div>
  )
}

// Helper component that also exposes setters
function ThemeController() {
  const { mode, accent, setAccent, toggleMode } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="accent">{accent}</span>
      <button onClick={() => setAccent('indigo')}>Set Indigo</button>
      <button onClick={toggleMode}>Toggle Mode</button>
    </div>
  )
}

function renderWithProvider(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

beforeEach(() => localStorage.clear())

describe('ThemeContext — defaults', () => {
  test('default accent is crimson when localStorage is empty', () => {
    renderWithProvider(<ThemeConsumer />)
    expect(screen.getByTestId('accent')).toHaveTextContent('crimson')
  })

  test('default mode is dark when localStorage is empty', () => {
    renderWithProvider(<ThemeConsumer />)
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })
})

describe('ThemeContext — setAccent', () => {
  test('setAccent updates the accent value', () => {
    renderWithProvider(<ThemeController />)
    act(() => {
      screen.getByText('Set Indigo').click()
    })
    expect(screen.getByTestId('accent')).toHaveTextContent('indigo')
  })
})

describe('ThemeContext — toggleMode', () => {
  test('toggleMode advances dark → amoled (cycle wraps at the end)', () => {
    renderWithProvider(<ThemeController />)
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    act(() => {
      screen.getByText('Toggle Mode').click()
    })
    // Cycle is light → sepia → grey → dark → amoled → (light). Default is dark.
    expect(screen.getByTestId('mode')).toHaveTextContent('amoled')
  })
})

describe('ThemeContext — localStorage persistence', () => {
  test('accent is persisted to localStorage after change', () => {
    renderWithProvider(<ThemeController />)
    act(() => {
      screen.getByText('Set Indigo').click()
    })
    expect(localStorage.getItem('theme-accent')).toBe('indigo')
  })

  test('mode is persisted to localStorage after change', () => {
    renderWithProvider(<ThemeController />)
    act(() => {
      screen.getByText('Toggle Mode').click()
    })
    expect(localStorage.getItem('theme-mode')).toBe('amoled')
  })
})

describe('ThemeContext — document attributes', () => {
  test('data-accent is set on documentElement when accent changes', () => {
    renderWithProvider(<ThemeController />)
    act(() => {
      screen.getByText('Set Indigo').click()
    })
    expect(document.documentElement.getAttribute('data-accent')).toBe('indigo')
  })

  test('data-theme is set on documentElement when mode changes', () => {
    renderWithProvider(<ThemeController />)
    act(() => {
      screen.getByText('Toggle Mode').click()
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('amoled')
  })
})
