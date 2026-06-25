import React from 'react'
import { Bell, Globe } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Avatar } from '../ui/Avatar'

const ROLE_COLORS = {
  manager: 'bg-amber-100 text-amber-700 border-amber-200',
  staff:   'bg-blue-100 text-blue-700 border-blue-200',
  vendor:  'bg-violet-100 text-violet-700 border-violet-200',
}

export default function Topbar({ title, subtitle }) {
  const { user } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 sticky top-0 z-20">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-slate-900 font-display leading-none truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Globe size={13} />
          {language === 'en' ? '中文' : 'EN'}
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
        </button>

        {/* Role badge + avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ROLE_COLORS[user?.role] || ROLE_COLORS.staff}`}>
            {t(`roles.${user?.role}`)}
          </span>
          <Avatar name={user?.name} size="sm" />
        </div>
      </div>
    </header>
  )
}
