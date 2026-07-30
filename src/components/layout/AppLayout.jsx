import React from 'react'
import Sidebar from './Sidebar'
import { SidebarProvider } from '../../context/SidebarContext'

export default function AppLayout({ children }) {
  return (
    <SidebarProvider>
      {/* min-w-0 is load-bearing — without it, a flex child containing
          wide content (a table, a long unbreakable string) refuses to
          shrink below its content width and forces the whole page to
          overflow horizontally, which is exactly the 320px bug this pass
          exists to fix. */}
      <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
        <Sidebar />
        <div className="flex-1 min-w-0 lg:ml-60 flex flex-col min-h-screen">
          {children}
        </div>
      </div>
    </SidebarProvider>
  )
}
