import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import VendorBooking from './pages/VendorBooking'
import MyBookings from './pages/MyBookings'
import ScheduleManagement from './pages/ScheduleManagement'
import Requests from './pages/Requests'
import Calendar from './pages/Calendar'
import AppointmentDetail from './pages/AppointmentDetail'
import WeeklyReport from './pages/WeeklyReport'
import DutyRoster from './pages/DutyRoster'
import Settings from './pages/Settings'

// Path prefixes each role is allowed to visit.
// '/appointments' covers '/appointments/:id'
// Vendor gets '/appointments' here; AppointmentDetail enforces ownership internally.
// Admin gets everything Manager has, plus '/admin' reserved for a future
// admin UI — no /admin/* routes are registered yet (see PHASE2_ROADMAP.md
// M-5), this just ensures non-admin roles are blocked from them on arrival.
const ROLE_ALLOWED_PREFIXES = {
  admin:   ['/dashboard', '/requests', '/schedule', '/calendar', '/report', '/roster', '/settings', '/appointments', '/admin'],
  manager: ['/dashboard', '/requests', '/schedule', '/calendar', '/report', '/roster', '/settings', '/appointments'],
  staff:   ['/dashboard', '/requests', '/calendar', '/roster', '/settings', '/appointments'],
  vendor:  ['/dashboard', '/booking', '/my-bookings', '/appointments', '/calendar', '/settings'],
}

// Where to land after login / after an unauthorized redirect
const ROLE_DEFAULT = {
  admin:   '/dashboard',
  manager: '/dashboard',
  staff:   '/requests',
  vendor:  '/booking',
}

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/" replace />

  const allowed = ROLE_ALLOWED_PREFIXES[user.role] || []
  const canAccess = allowed.some(prefix => location.pathname.startsWith(prefix))

  if (!canAccess) {
    return <Navigate to={ROLE_DEFAULT[user.role] || '/dashboard'} replace />
  }

  return children
}

function AppRoutes() {
  const { user, loading, passwordRecovery } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // A password-recovery link establishes a temporary Supabase session —
  // always show the reset form for it, regardless of path or normal
  // user/role state, so the recovery link never accidentally routes into
  // the main app.
  if (passwordRecovery) {
    return (
      <Routes>
        <Route path="*" element={<ResetPassword />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  const defaultPath = ROLE_DEFAULT[user.role] || '/dashboard'

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/dashboard"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/booking"           element={<ProtectedRoute><VendorBooking /></ProtectedRoute>} />
        <Route path="/my-bookings"       element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="/schedule"          element={<ProtectedRoute><ScheduleManagement /></ProtectedRoute>} />
        <Route path="/requests"          element={<ProtectedRoute><Requests /></ProtectedRoute>} />
        <Route path="/calendar"          element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
        <Route path="/appointments/:id"  element={<ProtectedRoute><AppointmentDetail /></ProtectedRoute>} />
        <Route path="/report"            element={<ProtectedRoute><WeeklyReport /></ProtectedRoute>} />
        <Route path="/roster"            element={<ProtectedRoute><DutyRoster /></ProtectedRoute>} />
        <Route path="/settings"          element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*"                  element={<Navigate to={defaultPath} replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  )
}
