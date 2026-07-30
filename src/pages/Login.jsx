import React, { useState } from 'react'
import { Zap, Globe, ChevronRight, Eye, EyeOff, Mail, Lock, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

// Supabase Auth's own message is shown as-is only for the one case a user
// can actually act on (wrong email/password) — anything else (network
// blips, rate limiting, unexpected upstream errors) falls back to a
// generic, translated message instead of leaking raw Auth/JS error text.
// The real error always still reaches the console either way.
function friendlyAuthErrorKey(rawMessage) {
  if (/invalid login credentials/i.test(rawMessage || '')) return 'login.invalidCredentials'
  return 'login.loginFailedGeneric'
}

export default function Login() {
  const { login, deactivated } = useAuth()
  const { language, toggleLanguage, t } = useLanguage()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Forgot-password mode — a small inline toggle rather than a separate route,
  // since it's just requesting the reset email (setting the new password
  // happens on /reset-password after the user clicks the emailed link).
  const [forgotMode,  setForgotMode]  = useState(false)
  const [resetEmail,  setResetEmail]  = useState('')
  const [resetSent,   setResetSent]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError,  setResetError]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError(t('login.enterCredentials')); return }
    setLoading(true)
    const { error: authErr } = await login(email.trim(), password)
    setLoading(false)
    if (authErr?.deactivated) {
      setError(t('login.inactiveAccountMessage'))
    } else if (authErr) {
      console.error('Login error:', authErr)
      setError(t(friendlyAuthErrorKey(authErr.message)))
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setResetError('')
    if (!resetEmail.trim()) { setResetError(t('login.enterEmail')); return }
    setResetLoading(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (resetErr) {
      console.error('Password reset request error:', resetErr)
      setResetError(t('login.resetFailedGeneric'))
    } else {
      setResetSent(true)
    }
  }

  function backToSignIn() {
    setForgotMode(false)
    setResetSent(false)
    setResetError('')
    setResetEmail('')
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
            'login.featureCentralized',
            'login.featureRealtime',
            'login.featureBilingual',
            'login.featureReporting',
          ].map(key => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <ChevronRight size={10} className="text-amber-400" />
              </div>
              <p className="text-slate-400 text-sm">{t(key)}</p>
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
          {forgotMode ? (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-white font-display mb-2">{t('login.forgotPasswordTitle')}</h1>
                {!resetSent && <p className="text-slate-400 text-sm">{t('login.forgotPasswordHint')}</p>}
              </div>

              {resetSent ? (
                <div className="text-center">
                  <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={24} className="text-emerald-400" />
                  </div>
                  <p className="text-slate-200 text-sm mb-6">{t('login.resetLinkSent')}</p>
                  <button
                    onClick={backToSignIn}
                    className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
                  >
                    {t('login.backToSignIn')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('login.emailLabel')}</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="you@qualcomm.com"
                        autoComplete="email"
                        className="w-full pl-9 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                      />
                    </div>
                  </div>

                  {resetError && (
                    <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                      {resetError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                  >
                    {resetLoading ? '…' : t('login.sendResetLink')}
                  </button>

                  <button
                    type="button"
                    onClick={backToSignIn}
                    className="w-full text-center text-slate-400 hover:text-slate-200 text-sm transition-colors"
                  >
                    {t('login.backToSignIn')}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-white font-display mb-2">{t('login.subtitle')}</h1>
                <p className="text-slate-400 text-sm">{t('login.signInSubtitle')}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('login.emailLabel')}</label>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-400">{t('login.passwordLabel')}</label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      {t('login.forgotPassword')}
                    </button>
                  </div>
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

                {/* Error / deactivated banner */}
                {(error || deactivated) && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                    {deactivated ? t('login.inactiveAccountMessage') : error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  {loading ? t('login.signingIn') : t('login.signIn')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
