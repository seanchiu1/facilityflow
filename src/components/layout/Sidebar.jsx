import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, ClipboardList, Settings,
  FileBarChart2, CalendarCheck2, BookOpen, Zap, LogOut,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Avatar } from '../ui/Avatar'

const ROLE_NAV = {
  manager: [
    { key: 'dashboard',  path: '/dashboard', icon: LayoutDashboard },
    { key: 'requests',   path: '/requests',  icon: ClipboardList },
    { key: 'schedule',   path: '/schedule',  icon: CalendarCheck2 },
    { key: 'calendar',   path: '/calendar',  icon: CalendarDays },
    { key: 'report',     path: '/report',    icon: FileBarChart2 },
  ],
  staff: [
    { key: 'dashboard', path: '/dashboard', icon: LayoutDashboard },
    { key: 'requests',  path: '/requests',  icon: ClipboardList },
    { key: 'calendar',  path: '/calendar',  icon: CalendarDays },
  ],
  vendor: [
    { key: 'dashboard',  path: '/dashboard',   icon: LayoutDashboard },
    { key: 'booking',    path: '/booking',      icon: BookOpen },
    { key: 'myBookings', path: '/my-bookings',  icon: ClipboardList },
    { key: 'calendar',   path: '/calendar',     icon: CalendarDays },
  ],
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const items = ROLE_NAV[user?.role] || []

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <aside className="w-60 flex-shrink-0 h-screen bg-brand-sidebar flex flex-col fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <div>
            <p className="text-white font-display font-bold text-base leading-none">FacilityFlow</p>
            <p className="text-slate-400 text-[10px] mt-0.5 leading-none">by Qualcomm Facilities</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest px-2 mb-2">
          {t('common.thisWeek')}
        </p>
        {items.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'} />
                {t(`nav.${key}`)}
              </>
            )}
          </NavLink>
        ))}

        <div className="border-t border-slate-700/50 my-3" />
        <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest px-2 mb-2">
          Account
        </p>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
              isActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Settings size={16} className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'} />
              {t('nav.settings')}
            </>
          )}
        </NavLink>
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-700/50 space-y-1">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <Avatar name={user?.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
            <p className="text-[11px] text-slate-500 truncate">{t(`roles.${user?.role}`)}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={13} />
          Logout
        </button>
      </div>
    </aside>
  )
}
