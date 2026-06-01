import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/',            label: 'Home',       icon: '🏠' },
  { to: '/this-month', label: 'This Month',  icon: '📅' },
  { to: '/films',      label: 'Films',       icon: '🎬' },
  { to: '/stats',      label: 'Stats',       icon: '📊' },
  { to: '/awards',     label: 'Awards',      icon: '🏆' },
  { to: '/profile',    label: 'Profile',     icon: '👤' },
]

const adminItem = { to: '/admin', label: 'Admin', icon: '⚙️' }

function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex flex-col items-center justify-center gap-0.5 px-1 py-2 font-medium transition-colors
         ${isActive
           ? 'text-white'
           : 'text-gray-500 hover:text-gray-300'}`
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="whitespace-nowrap text-center" style={{ fontSize: '10px' }}>{label}</span>
    </NavLink>
  )
}

export default function AppLayout() {
  const { profile, isAdmin } = useAuth()
  const adminModeOn = isAdmin && profile?.admin_mode_enabled

  const items = adminModeOn ? [...navItems, adminItem] : navItems

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-gray-800 p-4 gap-1 shrink-0">
        <div className="text-lg font-bold tracking-tight text-white px-3 py-4 mb-2">
          🎬 Movie Club
        </div>
        {items.map(item => (
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
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen pb-20 md:pb-0 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex items-stretch z-50 w-full pb-safe">
        {items.map(item => (
          <div key={item.to} className="flex-1">
            <NavItem to={item.to} label={item.label} icon={item.icon} end={item.to === '/'} />
          </div>
        ))}
      </nav>
    </div>
  )
}
