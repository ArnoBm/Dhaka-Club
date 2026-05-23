import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import { ADMIN_ROLES, SECURITY_ROLES, getDefaultPath, getStoredAdmin, hasRole } from './utils/accessControl'
import Auctions from './pages/Auctions'
import Analytics from './pages/Analytics'
import AuditLogs from './pages/AuditLogs'
import BroadcastCenter from './pages/BroadcastCenter'
import Community from './pages/Community'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import FacilityAnalytics from './pages/FacilityAnalytics'
import Guests from './pages/Guests'
import Login from './pages/Login'
import AdminUsers from './pages/AdminUsers'
import Members from './pages/Members'
import Notices from './pages/Notices'
import Payments from './pages/Payments'
import QRScanner from './pages/QRScanner'
import Renewals from './pages/Renewals'
import SecurityGate from './pages/SecurityGate'
import Venues from './pages/Venues'

function PrivateRoute() {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function RoleRoute({ allowedRoles }) {
  const admin = getStoredAdmin()

  if (!hasRole(allowedRoles, admin?.role)) {
    return <Navigate to={getDefaultPath(admin)} replace />
  }

  return <Outlet />
}

function HomeRedirect() {
  const admin = getStoredAdmin()

  if (admin?.role === 'Security Staff' || admin?.role === 'Staff') {
    return <Navigate to="/security-gate" replace />
  }

  return <Dashboard />
}

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route element={<RoleRoute allowedRoles={ADMIN_ROLES} />}>
              <Route path="members" element={<Members />} />
              <Route path="notices" element={<Notices />} />
              <Route path="events" element={<Events />} />
              <Route path="venues" element={<Venues />} />
              <Route path="auctions" element={<Auctions />} />
              <Route path="renewals" element={<Renewals />} />
              <Route path="community" element={<Community />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="broadcasts" element={<BroadcastCenter />} />
              <Route path="guests" element={<Guests />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="facility-analytics" element={<FacilityAnalytics />} />
              <Route path="payments" element={<Payments />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['Super Admin']} />}>
              <Route path="admin-users" element={<AdminUsers />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={SECURITY_ROLES} />}>
              <Route path="qr-scanner" element={<QRScanner />} />
              <Route path="security-gate" element={<SecurityGate />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  )
}

export default App
