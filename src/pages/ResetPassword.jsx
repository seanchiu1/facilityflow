import React, { useState } from 'react'
import { Zap, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'

export default function ResetPassword() {
  const { t } = useLanguage()

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword]  = useState('')
  const [showPass,        setShowPass]        = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [done,            setDone]            = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) { setError(t('resetPassword.tooShort')); return }
    if (password !== confirmPassword) { setError(t('resetPassword.mismatch')); return }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message || 'Failed to update password. Try again.')
      return
    }

    setDone(true)
    // Sign out of the temporary recovery session so the user re-enters
    // through the normal login form with their new password — this also
    // clears AuthContext's passwordRecovery flag via the SIGNED_OUT event.
    setTimeout(() => { supabase.auth.signOut() }, 2000)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <span className="text-white font-display font-bold text-lg">FacilityFlow</span>
        </div>

        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <p className="text-slate-200 text-sm">{t('resetPassword.success')}</p>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-white font-display mb-2">{t('resetPassword.title')}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('resetPassword.newPassword')}</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
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

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('resetPassword.confirmPassword')}</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
              >
                {loading ? '…' : t('resetPassword.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
