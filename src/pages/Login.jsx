import React from 'react'
import { Zap, Globe, ChevronRight, Shield, Users, Truck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

const ROLES = [
  {
    key: 'manager',
    icon: Shield,
    color: 'from-amber-400 to-amber-600',
    iconBg: 'bg-amber-500',
    border: 'hover:border-amber-400 hover:shadow-amber-100',
    accent: 'text-amber-600',
  },
  {
    key: 'staff',
    icon: Users,
    color: 'from-blue-400 to-blue-600',
    iconBg: 'bg-blue-500',
    border: 'hover:border-blue-400 hover:shadow-blue-100',
    accent: 'text-blue-600',
  },
  {
    key: 'vendor',
    icon: Truck,
    color: 'from-violet-400 to-violet-600',
    iconBg: 'bg-violet-500',
    border: 'hover:border-violet-400 hover:shadow-violet-100',
    accent: 'text-violet-600',
  },
]

export default function Login() {
  const { login } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[42%] bg-brand-sidebar p-12 relative overflow-hidden">
        {/* Ambient circles */}
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-400/5 rounded-full blur-2xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center">
              <Zap size={18} className="text-white" fill="white" />
            </div>
            <span className="text-white font-display font-bold text-xl">FacilityFlow</span>
          </div>

          <div className="mt-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
              Enterprise Facilities Platform
            </div>
            <h2 className="text-3xl font-bold text-white font-display leading-tight mb-4">
              One platform for every<br />
              <span className="text-amber-400">vendor appointment.</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              {t('login.tagline')}
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="relative z-10 mt-auto pt-12 space-y-3">
          {[
            'Centralized appointment management',
            'Real-time status tracking',
            'English & Traditional Chinese support',
            'Automated weekly reporting',
          ].map(f => (
            <div key={f} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <ChevronRight size={10} className="text-amber-400" />
              </div>
              <p className="text-slate-400 text-sm">{f}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
        >
          <Globe size={13} />
          {language === 'en' ? '中文' : 'EN'}
        </button>

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <span className="text-white font-display font-bold text-lg">FacilityFlow</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white font-display mb-2">{t('login.subtitle')}</h1>
            <p className="text-slate-400 text-sm">{t('login.selectRole')}</p>
          </div>

          <div className="space-y-3">
            {ROLES.map(({ key, icon: Icon, iconBg, border, accent }) => (
              <button
                key={key}
                onClick={() => login(key)}
                className={`w-full flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-left transition-all hover:shadow-xl group ${border}`}
              >
                <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm text-slate-100 group-hover:${accent}`}>{t(`roles.${key}`)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t(`login.${key === 'manager' ? 'managerDesc' : key === 'staff' ? 'staffDesc' : 'vendorDesc'}`)}</p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-slate-600 mt-8">
            Demo prototype — Qualcomm Facilities Dept. · Jun 2026
          </p>
        </div>
      </div>
    </div>
  )
}
