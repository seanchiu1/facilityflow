import React, { useState } from 'react'
import { Zap, Globe, ChevronRight, Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

const DEMO_ACCOUNTS = [
  { role: 'Manager', email: 'manager@facilityflow.demo' },
  { role: 'Staff',   email: 'staff@facilityflow.demo'   },
  { role: 'Vendor',  email: 'vendor@facilityflow.demo'  },
]

export default function Login() {
  const { login } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setLoading(true)
    const { error: authErr } = await login(email.trim(), password)
    setLoading(false)
    if (authErr) setError(authErr.message || 'Login failed. Check your credentials and try again.')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[42%] bg-brand-sidebar p-12 relative overflow-hidden">
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
            <p className="text-slate-400 text-sm">Enter your email and password to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@qualcomm.com"
                  autoComplete="email"
                  className="w-full pl-9 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo credential hints */}
          <div className="mt-8 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl">
            <p className="text-xs font-medium text-slate-400 mb-2.5">Demo accounts — click to fill email:</p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map(({ role, email: e }) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmail(e)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700/60 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-300">{role}</span>
                  <span className="text-xs text-slate-500 font-mono">{e}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-3 text-center">
              All demo accounts use the same password (see SUPABASE_SETUP.md)
            </p>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            Demo prototype — Qualcomm Facilities Dept. · Jun 2026
          </p>
        </div>
      </div>
    </div>
  )
}
