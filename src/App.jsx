import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import VendorBooking from './pages/VendorBooking'
import MyBookings from './pages/MyBookings'
import ScheduleManagement from './pages/ScheduleManagement'
import Requests from './pages/Requests'
import Calendar from './pages/Calendar'
import AppointmentDetail from './pages/AppointmentDetail'
import WeeklyReport from './pages/WeeklyReport'
import Settings from './pages/Settings'

// Path prefixes each role is allowed to visit.
// '/appointments' covers '/appointments/:id'
// Vendor gets '/appointments' here; AppointmentDetail enforces ownership internally.
const ROLE_ALLOWED_PREFIXES = {
  manager: ['/dashboard', '/requests', '/schedule', '/calendar', '/report', '/settings', '/appointments'],
  staff:   ['/dashboard', '/requests', '/calendar', '/settings', '/appointments'],
  vendor:  ['/dashboard', '/booking', '/my-bookings', '/appointments', '/calendar', '/settings'],
}

// Where to land after login / after an unauthorized redirect
const ROLE_DEFAULT = {
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
  const { user } = useAuth()

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
