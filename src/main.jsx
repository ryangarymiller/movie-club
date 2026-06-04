import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// We restore scroll position ourselves (see ScrollRestorer) — turn off the
// browser's native heuristic so the two don't fight.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'var(--text-strong)', background: 'var(--bg)', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171', marginBottom: '1rem' }}>App crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5', fontSize: '13px' }}>
            {this.state.error.toString()}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
