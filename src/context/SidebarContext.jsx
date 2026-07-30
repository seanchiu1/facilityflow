import React, { createContext, useContext, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Mobile nav state only — on lg+ screens the sidebar is always visible via
// CSS (see Sidebar.jsx's lg:translate-x-0) and this state is simply unused.
// Kept as a small dedicated context rather than prop-drilling because
// Sidebar and every page's own Topbar are siblings-of-a-sort (both
// descendants of AppLayout, not of each other) — see AppLayout.jsx.
const SidebarContext = createContext(null)

export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer on every navigation — otherwise it stays open
  // over the new page after tapping a nav link.
  useEffect(() => { setIsOpen(false) }, [location.pathname])

  return (
    <SidebarContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false), toggle: () => setIsOpen(v => !v) }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider')
  return ctx
}
