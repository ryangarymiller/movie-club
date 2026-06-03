import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// ─── SVG Icon Component ───────────────────────────────────────────────────────

function NavIcon({ children, active }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? 'var(--accent)' : 'var(--text-dim)'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

// ─── Icon definitions ─────────────────────────────────────────────────────────

function HomeIcon({ active }) {
  return (
    <NavIcon active={active}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </NavIcon>
  )
}

function ThisMonthIcon({ active }) {
  return (
    <NavIcon active={active}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </NavIcon>
  )
}

function FilmsIcon({ active }) {
  return (
    <NavIcon active={active}>
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>
    </NavIcon>
  )
}

function StatsIcon({ active }) {
  return (
    <NavIcon active={active}>
      <path d="M3 20h18M8 20V10M12 20V4M16 20v-6"/>
    </NavIcon>
  )
}

function AwardsIcon({ active }) {
  return (
    <NavIcon active={active}>
      <path d="M6 4h12v7a6 6 0 01-12 0V4z"/>
      <path d="M4 4h2M18 4h2M4 7H2M20 7h2M12 17v4M8 21h8"/>
    </NavIcon>
  )
}

function ProfileIcon({ active }) {
  return (
    <NavIcon active={active}>
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </NavIcon>
  )
}

function AdminIcon({ active }) {
  return (
    <NavIcon active={active}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </NavIcon>
  )
}

const ICON_MAP = {
  Home: HomeIcon,
  'This Month': ThisMonthIcon,
  Films: FilmsIcon,
  Stats: StatsIcon,
  Awards: AwardsIcon,
  Profile: ProfileIcon,
  Admin: AdminIcon,
}

// ─── Nav data ─────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/',            label: 'Home'       },
  { to: '/this-month', label: 'This Month'  },
  { to: '/films',      label: 'Films'       },
  { to: '/stats',      label: 'Stats'       },
  { to: '/awards',     label: 'Awards'      },
  { to: '/profile',    label: 'Profile'     },
]

const adminItem = { to: '/admin', label: 'Admin' }

// ─── Mobile tab item ──────────────────────────────────────────────────────────

function NavItem({ to, label, end }) {
  const Icon = ICON_MAP[label]
  return (
    <NavLink
      to={to}
      end={end}
      className="w-full flex flex-col items-center justify-center gap-0.5 px-1 py-2 font-medium transition-colors relative"
    >
      {({ isActive }) => (
        <>
          <Icon active={isActive} />
          <span
            className="whitespace-nowrap text-center transition-colors"
            style={{ fontSize: '10px', color: isActive ? 'var(--accent)' : 'var(--text-dim)' }}
          >
            {label}
          </span>
          {/* Accent dot below active icon on mobile */}
          {isActive && (
            <span style={{
              position: 'absolute',
              bottom: '3px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              background: 'var(--accent)',
            }} />
          )}
        </>
      )}
    </NavLink>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { profile, isAdmin } = useAuth()
  const adminModeOn = isAdmin && profile?.admin_mode_enabled

  const items = adminModeOn ? [...navItems, adminItem] : navItems

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-gray-800 p-4 gap-1 shrink-0">
        <div className="text-lg font-bold tracking-tight text-white px-3 py-4 mb-2 flex items-center gap-2">
          <FilmsIcon active={true} />
          Movie Club
        </div>
        {items.map(item => {
          const Icon = ICON_MAP[item.label]
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                 ${isActive
                   ? 'bg-gray-800 text-white'
                   : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen pb-20 md:pb-0 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t border-gray-800 flex items-stretch z-50 w-full pb-safe"
        style={{
          background: 'rgba(9,9,15,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {items.map(item => (
          <div key={item.to} className="flex-1">
            <NavItem to={item.to} label={item.label} end={item.to === '/'} />
          </div>
        ))}
      </nav>
    </div>
  )
}
