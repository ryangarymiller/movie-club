import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MemberOverlayProvider, useMemberOverlay } from './context/MemberOverlayContext'
import { MemberStatsOverlayProvider } from './context/MemberStatsOverlayContext'
import MemberStatsOverlay from './components/MemberStatsOverlay'
import { NotificationsProvider } from './context/NotificationsContext'
import { ReadjustmentProvider } from './context/ReadjustmentContext'
import { ThemeProvider } from './context/ThemeContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import NotApproved from './pages/NotApproved'
import Home from './pages/Home'
import ThisMonth from './pages/ThisMonth'
import Films from './pages/Films'
import Stats from './pages/Stats'
import Awards from './pages/Awards'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import WelcomeDialog from './components/WelcomeDialog'

function RequireAuth({ children }) {
  const { session, profile, profileLoaded, profileError, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-600 text-sm">Loading…</div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  // Profile fetch in progress
  if (!profileLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-600 text-sm">Loading…</div>
      </div>
    )
  }

  // Transient profile-load failure (network/DB blip) — do NOT treat this as
  // "not approved" / sign the user out. Offer a retry instead. This is the fix
  // for the intermittent "your account is pending" bounce-outs.
  if (profileError && !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
            We couldn't load your profile just now — usually a brief network hiccup.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'var(--accent, #b91c1c)', color: 'var(--text-strong)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Profile loaded but no matching user row, or account deactivated
  if (!profile || profile.is_active === false) return <Navigate to="/not-approved" replace />

  return (
    <>
      {!profile.has_completed_onboarding && <WelcomeDialog />}
      {children}
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/not-approved" element={<NotApproved />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="this-month/*" element={<ThisMonth />} />
        <Route path="films/*" element={<Films />} />
        <Route path="stats/*" element={<Stats />} />
        <Route path="awards/*" element={<Awards />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/:userId" element={<Profile />} />
        <Route path="admin/*" element={<Admin />} />
      </Route>
    </Routes>
  )
}

// Renders another member's profile as an overlay on top of the current page.
// Lives here (not in the context module) so it can import Profile without a cycle.
function MemberOverlayHost() {
  const { memberId, close } = useMemberOverlay()
  if (!memberId) return null
  return (
    <div
      className="mc-modal-backdrop"
      style={{ zIndex: 60, background: 'rgba(0,0,0,0.72)' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="mc-modal-panel"
        style={{ position: 'relative', background: 'var(--bg)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '18px', maxWidth: '560px', width: '100%' }}
      >
        <button
          onClick={close}
          aria-label="Close"
          style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 1, width: '32px', height: '32px', borderRadius: '999px', border: '1px solid rgba(var(--fg-rgb), 0.12)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}
        >
          ✕
        </button>
        <Profile overlayUserId={memberId} key={memberId} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationsProvider>
            <ReadjustmentProvider>
              <MemberOverlayProvider>
                <MemberStatsOverlayProvider>
                  <AppRoutes />
                  <MemberOverlayHost />
                  <MemberStatsOverlay />
                </MemberStatsOverlayProvider>
              </MemberOverlayProvider>
            </ReadjustmentProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
