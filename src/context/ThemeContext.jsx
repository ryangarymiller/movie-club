import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const ACCENT_OPTIONS = ['crimson', 'ember', 'amber', 'sage', 'slate-blue', 'indigo', 'violet', 'hot-pink']

// Four modes from lightest → darkest. Sepia is a warm light theme; grey is a soft
// dark theme — the two "in-between" options between stark light and near-black dark.
const MODE_OPTIONS = ['light', 'sepia', 'grey', 'dark']
// Which modes are dark-family (get the .dark class + dark Tailwind utilities) vs
// light-family (get data-base="light" + the light utility remaps).
const DARK_MODES = new Set(['dark', 'grey'])

// Mobile browser chrome colour per mode (matches each theme's --bg in index.css).
const THEME_COLORS = { light: '#f3f4f6', sepia: '#f3ead4', grey: '#2a2c32', dark: '#07080d' }

export function ThemeProvider({ children }) {
  const [mode, setModeRaw] = useState(() => {
    const saved = localStorage.getItem('theme-mode')
    return MODE_OPTIONS.includes(saved) ? saved : 'dark'
  })
  const [accent, setAccent] = useState(() => localStorage.getItem('theme-accent') || 'crimson')

  // Guard against a stale/invalid stored mode.
  const setMode = (m) => setModeRaw(MODE_OPTIONS.includes(m) ? m : 'dark')

  useEffect(() => {
    const isDark = DARK_MODES.has(mode)
    document.documentElement.setAttribute('data-theme', mode)
    document.documentElement.setAttribute('data-base', isDark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-accent', accent)
    localStorage.setItem('theme-mode', mode)
    localStorage.setItem('theme-accent', accent)

    document.documentElement.classList.toggle('dark', isDark)

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta && THEME_COLORS[mode]) meta.setAttribute('content', THEME_COLORS[mode])
  }, [mode, accent])

  // Cycle light → sepia → grey → dark → light (used by the simple toggle button).
  const toggleMode = () => setModeRaw(m => {
    const i = MODE_OPTIONS.indexOf(m)
    return MODE_OPTIONS[(i + 1) % MODE_OPTIONS.length]
  })

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent, toggleMode, ACCENT_OPTIONS, MODE_OPTIONS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
