import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const ACCENT_OPTIONS = ['crimson', 'ember', 'amber', 'sage', 'slate-blue', 'indigo', 'violet']

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('theme-mode') || 'dark')
  const [accent, setAccent] = useState(() => localStorage.getItem('theme-accent') || 'crimson')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    document.documentElement.setAttribute('data-accent', accent)
    localStorage.setItem('theme-mode', mode)
    localStorage.setItem('theme-accent', accent)

    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [mode, accent])

  const toggleMode = () => setMode(m => m === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent, toggleMode, ACCENT_OPTIONS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
