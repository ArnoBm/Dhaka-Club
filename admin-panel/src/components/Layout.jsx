import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  BarChart3,
  CreditCard,
  FileClock,
  Gavel,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  QrCode,
  Send,
  ShieldCheck,
  UserCog,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { disconnectAdminSocket } from '../api/socket'
import { ADMIN_ROLES, SECURITY_ROLES, getStoredAdmin, hasRole, normalizeRole } from '../utils/accessControl'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ADMIN_ROLES },
  { to: '/members', label: 'Members', icon: Users, roles: ADMIN_ROLES },
  { to: '/notices', label: 'Notices', icon: Megaphone, roles: ADMIN_ROLES },
  { to: '/events', label: 'Events', icon: CalendarDays, roles: ADMIN_ROLES },
  { to: '/venues', label: 'Venues', icon: MapPin, roles: ADMIN_ROLES },
  { to: '/auctions', label: 'Auctions', icon: Gavel, roles: ADMIN_ROLES },
  { to: '/renewals', label: 'Card Renewals', icon: CreditCard, roles: ADMIN_ROLES },
  { to: '/community', label: 'Community Requests', icon: HeartHandshake, roles: ADMIN_ROLES },
  { to: '/qr-scanner', label: 'QR Verification', icon: QrCode, roles: SECURITY_ROLES },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ADMIN_ROLES },
  { to: '/broadcasts', label: 'Broadcast Center', icon: Send, roles: ADMIN_ROLES },
  { to: '/guests', label: 'Guest Approval', icon: UserCheck, roles: ADMIN_ROLES },
  { to: '/audit-logs', label: 'Audit Logs', icon: FileClock, roles: ADMIN_ROLES },
  { to: '/facility-analytics', label: 'Facility Analytics', icon: MapPin, roles: ADMIN_ROLES },
  { to: '/payments', label: 'Payments', icon: CreditCard, roles: ADMIN_ROLES },
  { to: '/security-gate', label: 'Security Gate', icon: ShieldCheck, roles: SECURITY_ROLES },
  { to: '/admin-users', label: 'Admin Users', icon: UserCog, roles: ['Super Admin'] },
]

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const admin = getStoredAdmin()
  const role = normalizeRole(admin?.role)
  const visibleNavItems = navItems.filter((item) => hasRole(item.roles, role))

  const handleLogout = () => {
    disconnectAdminSocket()
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#1e2a45] text-white shadow-xl transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div>
            <p className="text-lg font-semibold">Dhaka Club</p>
            <p className="text-xs text-slate-300">Management System</p>
          </div>
          <button
            type="button"
            aria-label="Close sidebar"
            className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="scrollbar-hidden flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-white text-[#1e2a45] shadow-sm'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white',
                  ].join(' ')
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open sidebar"
              className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">
              Dhaka Club Admin
            </h1>
            {role && <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">{role}</span>}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <LogOut size={16} />
            Logout
          </button>
        </header>

        <main className="min-h-[calc(100vh-4rem)] bg-white p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
