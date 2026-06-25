import React, { useState } from 'react'
import { User, Bell, Globe, Lock, Save, Check, RotateCcw, AlertTriangle } from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

const VENDOR_PROFILE_KEY = 'facilityflow_vendor_profile'

const TABS = [
  { key: 'profile',       icon: User,       label: 'profile' },
  { key: 'notifications', icon: Bell,       label: 'notifications' },
  { key: 'display',       icon: Globe,      label: 'display' },
  { key: 'security',      icon: Lock,       label: 'security' },
  { key: 'demo',          icon: RotateCcw,  label: 'demo' },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-amber-500' : 'bg-slate-200'}`}
      style={{ height: '22px' }}
    >
      <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function NotifRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const [activeTab, setActiveTab] = useState('profile')

  const handleDemoReset = () => {
    localStorage.removeItem(VENDOR_PROFILE_KEY)
    logout()   // clears facilityflow_user → app re-renders Login screen
  }
  const [saved, setSaved] = useState(false)
  const [notifs, setNotifs] = useState({
    emailNotif: true,
    pushNotif: false,
    newRequest: true,
    statusChange: true,
  })

  const toggleNotif = (key) => setNotifs(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('settings.title')} />

      <div className="p-6">
        <div className="flex gap-6">
          {/* Side tabs */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {TABS.map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    activeTab === key
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <Icon size={15} />
                  {t(`settings.${label}`)}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 max-w-xl">
            {activeTab === 'profile' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-bold text-slate-900 font-display mb-6">{t('settings.profile')}</h2>

                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                  <Avatar name={user?.name} size="xl" />
                  <div>
                    <p className="font-semibold text-slate-800">{user?.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t(`roles.${user?.role}`)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: t('settings.fullName'), value: user?.name, type: 'text' },
                    { label: t('settings.email'),    value: user?.email, type: 'email' },
                    { label: t('settings.company'),  value: user?.department || user?.company, type: 'text' },
                    { label: t('settings.phone'),    value: user?.phone, type: 'tel' },
                  ].map(({ label, value, type }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                      <input
                        type={type}
                        defaultValue={value}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('settings.role')}</label>
                    <input
                      disabled
                      value={t(`roles.${user?.role}`)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Save size={14} />
                    {t('settings.saveProfile')}
                  </button>
                  {saved && (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                      <Check size={14} />
                      {t('settings.profileSaved')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-bold text-slate-900 font-display mb-6">{t('settings.notifications')}</h2>
                <div>
                  <NotifRow label={t('settings.emailNotif')} desc={t('settings.emailNotifDesc')} checked={notifs.emailNotif} onChange={() => toggleNotif('emailNotif')} />
                  <NotifRow label={t('settings.pushNotif')} desc={t('settings.pushNotifDesc')} checked={notifs.pushNotif} onChange={() => toggleNotif('pushNotif')} />
                  <NotifRow label={t('settings.newRequest')} desc={t('settings.newRequestDesc')} checked={notifs.newRequest} onChange={() => toggleNotif('newRequest')} />
                  <NotifRow label={t('settings.statusChange')} desc={t('settings.statusChangeDesc')} checked={notifs.statusChange} onChange={() => toggleNotif('statusChange')} />
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-bold text-slate-900 font-display mb-6">{t('settings.display')}</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-3">{t('settings.language')}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { code: 'en',    label: 'English', sub: 'English (US)' },
                        { code: 'zh-TW', label: '繁體中文', sub: 'Traditional Chinese' },
                      ].map(({ code, label, sub }) => (
                        <button
                          key={code}
                          onClick={() => setLanguage(code)}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            language === code
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <p className="font-semibold text-slate-800 text-sm">{label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                          {language === code && (
                            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Check size={9} /> Active
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('settings.timezone')}</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                      <option>Asia/Taipei (UTC+8)</option>
                      <option>Asia/Tokyo (UTC+9)</option>
                      <option>America/Los_Angeles (UTC-7)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-bold text-slate-900 font-display mb-6">{t('settings.security')}</h2>
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('settings.changePassword')}</p>
                  {[
                    { label: t('settings.currentPassword'), id: 'cur' },
                    { label: t('settings.newPassword'),     id: 'new' },
                    { label: t('settings.confirmPassword'), id: 'con' },
                  ].map(({ label, id }) => (
                    <div key={id}>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  ))}
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors mt-2">
                    <Lock size={13} />
                    {t('settings.changePassword')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'demo' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h2 className="font-bold text-slate-900 font-display mb-2">Demo Session</h2>
                  <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                    This app uses demo role selection instead of real Supabase Auth.
                    Use the controls below to reset your session state.
                  </p>

                  <div className="border border-red-200 rounded-xl p-5 bg-red-50/40">
                    <p className="text-sm font-semibold text-slate-800 mb-1">Reset Demo Session</p>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      Clears your role login (<code className="font-mono bg-slate-100 px-1 rounded">facilityflow_user</code>)
                      and vendor profile (<code className="font-mono bg-slate-100 px-1 rounded">facilityflow_vendor_profile</code>)
                      from localStorage. Returns you to the role selection screen.
                      No Supabase data is deleted.
                    </p>
                    <button
                      onClick={handleDemoReset}
                      className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <RotateCcw size={14} />
                      Reset &amp; Return to Login
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-1">TODO: Real Authentication</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Replace demo role selection with Supabase Auth (email + password).
                        Vendors will no longer be able to click Manager. Row-level security
                        (RLS) policies on <code className="font-mono bg-slate-100 px-1 rounded">appointment_requests</code> and{' '}
                        <code className="font-mono bg-slate-100 px-1 rounded">appointment_messages</code> will enforce
                        data visibility per authenticated user. Planned for a future phase.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
