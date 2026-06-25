import React, { useState, useEffect, useRef } from 'react'
import { Bell, Globe, X, Clock, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Avatar } from '../ui/Avatar'
import { supabase } from '../../lib/supabaseClient'

const ROLE_COLORS = {
  manager: 'bg-amber-100 text-amber-700 border-amber-200',
  staff:   'bg-blue-100 text-blue-700 border-blue-200',
  vendor:  'bg-violet-100 text-violet-700 border-violet-200',
}

// ── Notification item ─────────────────────────────────────────────────────────

function NotifItem({ item, onNavigate }) {
  return (
    <button
      onClick={() => item.link && onNavigate(item.link)}
      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${item.iconBg}`}>
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 leading-tight">{item.label}</p>
        {item.sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.sub}</p>}
      </div>
    </button>
  )
}

// ── Notification dropdown ─────────────────────────────────────────────────────

function NotificationsDropdown({ user, t, onNavigate, onClose }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const today = new Date().toISOString().slice(0, 10)
    const notifs = []

    if (user.role === 'manager') {
      const { data } = await supabase
        .from('appointment_requests')
        .select('id, vendor_name, status, requested_date, equipment_type')
        .order('created_at', { ascending: false })
        .limit(50)

      const all = data || []
      const pending = all.filter(r => r.status === 'Pending')
      const todayApts = all.filter(r =>
        ['Approved', 'Scheduled', 'In Progress'].includes(r.status) && r.requested_date === today
      )
      const attention = all.filter(r => ['Delayed', 'Cancelled'].includes(r.status))

      if (pending.length > 0) {
        notifs.push({
          id: 'pending', link: '/requests',
          label: `${pending.length} ${t('notifications.pendingApproval')}`,
          sub:   t('notifications.viewRequests'),
          iconBg: 'bg-amber-100', icon: <Clock size={14} className="text-amber-600" />,
        })
      }
      if (todayApts.length > 0) {
        notifs.push({
          id: 'today', link: '/requests',
          label: `${todayApts.length} ${t('notifications.todayCount')}`,
          sub:   todayApts.map(r => r.vendor_name).slice(0, 2).join(', '),
          iconBg: 'bg-blue-100', icon: <Calendar size={14} className="text-blue-600" />,
        })
      }
      attention.slice(0, 3).forEach(r => {
        notifs.push({
          id: r.id, link: `/appointments/${r.id}`,
          label: `${r.vendor_name} — ${r.status}`,
          sub:   r.equipment_type,
          iconBg: 'bg-rose-100', icon: <AlertCircle size={14} className="text-rose-500" />,
        })
      })

    } else if (user.role === 'staff') {
      const { data } = await supabase
        .from('appointment_requests')
        .select('id, vendor_name, status, requested_date, equipment_type')
        .in('status', ['Approved', 'Scheduled', 'In Progress', 'Delayed'])
        .order('requested_date', { ascending: true })
        .limit(20)

      const all = data || []
      const todayApts = all.filter(r => r.requested_date === today)
      const inProgress = all.filter(r => r.status === 'In Progress')
      const delayed    = all.filter(r => r.status === 'Delayed')

      if (todayApts.length > 0) {
        notifs.push({
          id: 'today', link: '/requests',
          label: `${todayApts.length} ${t('notifications.todayCount')}`,
          sub:   todayApts.map(r => r.vendor_name).slice(0, 2).join(', '),
          iconBg: 'bg-blue-100', icon: <Calendar size={14} className="text-blue-600" />,
        })
      }
      inProgress.slice(0, 2).forEach(r => {
        notifs.push({
          id: r.id, link: `/appointments/${r.id}`,
          label: `${r.vendor_name} — ${t('common.inProgress')}`,
          sub:   r.equipment_type,
          iconBg: 'bg-amber-100', icon: <CheckCircle2 size={14} className="text-amber-600" />,
        })
      })
      delayed.slice(0, 2).forEach(r => {
        notifs.push({
          id: r.id + '-d', link: `/appointments/${r.id}`,
          label: `${r.vendor_name} — ${t('common.delayed')}`,
          sub:   r.equipment_type,
          iconBg: 'bg-rose-100', icon: <AlertCircle size={14} className="text-rose-500" />,
        })
      })

    } else if (user.role === 'vendor') {
      const { data } = await supabase
        .from('appointment_requests')
        .select('id, equipment_type, status, requested_date')
        .eq('vendor_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      const all = data || []
      const upcoming = all.filter(r => ['Approved', 'Scheduled'].includes(r.status))
      const active   = all.filter(r => ['In Progress', '50% Finished'].includes(r.status))

      upcoming.slice(0, 2).forEach(r => {
        notifs.push({
          id: r.id, link: `/appointments/${r.id}`,
          label: `${r.equipment_type} — ${r.status}`,
          sub:   r.requested_date,
          iconBg: 'bg-emerald-100', icon: <Calendar size={14} className="text-emerald-600" />,
        })
      })
      active.slice(0, 2).forEach(r => {
        notifs.push({
          id: r.id + '-a', link: `/appointments/${r.id}`,
          label: `${r.equipment_type} — ${r.status}`,
          sub:   r.requested_date,
          iconBg: 'bg-amber-100', icon: <CheckCircle2 size={14} className="text-amber-600" />,
        })
      })
    }

    setItems(notifs)
    setLoading(false)
  }

  return (
    <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{t('notifications.title')}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-10 text-center px-6">
          <Bell size={20} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t('notifications.empty')}</p>
          <p className="text-xs text-slate-400">{t('notifications.emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {items.map(item => (
            <NotifItem key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────

export default function Topbar({ title, subtitle }) {
  const { user }                       = useAuth()
  const { language, toggleLanguage, t } = useLanguage()
  const navigate                        = useNavigate()

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  function handleNavigate(path) {
    setNotifOpen(false)
    navigate(path)
  }

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
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className={`relative w-9 h-9 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50 transition-colors ${notifOpen ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
          >
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
          </button>

          {notifOpen && user && (
            <NotificationsDropdown
              user={user}
              t={t}
              onNavigate={handleNavigate}
              onClose={() => setNotifOpen(false)}
            />
          )}
        </div>

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
