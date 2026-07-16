import React, { useState, useEffect, useRef } from 'react'
import { Bell, Globe, X, Clock, Calendar, AlertCircle, AlertTriangle, CheckCircle2, AlarmClock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Avatar } from '../ui/Avatar'
import { supabase } from '../../lib/supabaseClient'

const ROLE_COLORS = {
  admin:   'bg-rose-100 text-rose-700 border-rose-200',
  manager: 'bg-amber-100 text-amber-700 border-amber-200',
  staff:   'bg-blue-100 text-blue-700 border-blue-200',
  vendor:  'bg-violet-100 text-violet-700 border-violet-200',
}

// ── Date helpers (kept local to this file, matching the rest of the
// codebase's convention of small per-file formatters rather than a
// shared utils module) ──────────────────────────────────────────────────

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Combines a `date` column and a `time` column into a JS Date, treating
// both as plain local wall-clock values — matches how the rest of the app
// (BookingForm, Calendar, ScheduleManagement) already treats these columns.
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number)
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(h, m, 0, 0)
  return d
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Notification fetch ────────────────────────────────────────────────────
// Three independent categories, each capped and de-duplicated by
// appointment id + category suffix so the same appointment can never
// appear twice within the same category.

const NOTIF_COLS = 'id, appointment_code, vendor_name, equipment_type, status, requested_date, start_time, target_completion_date, responsible_staff'

async function fetchOverdueItems(user, t) {
  const nowIso = new Date().toISOString()
  let query = supabase
    .from('appointment_requests')
    .select(NOTIF_COLS)
    .lt('target_completion_date', nowIso)
    .not('status', 'in', '("Finished","Cancelled")')
    .order('target_completion_date', { ascending: true })
    .limit(5)
  if (user.role === 'vendor') query = query.eq('vendor_user_id', user.id)

  const { data, error } = await query
  if (error) { console.error('Overdue notifications fetch error:', error); return [] }

  return (data || []).map(r => ({
    id:    `${r.id}-overdue`,
    link:  `/appointments/${r.id}`,
    label: `${r.appointment_code || r.id.slice(0, 8)} — ${r.vendor_name}`,
    sub:   `${r.equipment_type} · ${t('notifications.targetCompletionOverdue')}: ${formatDateTime(r.target_completion_date)} · ${t('appointment.assignedPOC')}: ${r.responsible_staff || '—'}`,
    tag:      t('notifications.overdueAlert'),
    tagClass: 'bg-red-100 text-red-700',
    iconBg:   'bg-red-100',
    icon:     <AlertTriangle size={14} className="text-red-600" />,
  }))
}

async function fetchReminderItems(user, t) {
  const todayStr    = toISO(new Date())
  const tomorrowStr = toISO(new Date(Date.now() + 24 * 60 * 60 * 1000))

  let query = supabase
    .from('appointment_requests')
    .select(NOTIF_COLS)
    .in('requested_date', [todayStr, tomorrowStr])
    .not('status', 'in', '("Finished","Cancelled")')
    .order('requested_date', { ascending: true })
    .limit(20) // filtered precisely below; fetch a bit more than the display cap
  if (user.role === 'vendor') query = query.eq('vendor_user_id', user.id)

  const { data, error } = await query
  if (error) { console.error('Reminder notifications fetch error:', error); return [] }

  const now = Date.now()
  return (data || [])
    .map(r => ({ r, start: combineDateTime(r.requested_date, r.start_time) }))
    .filter(({ start }) => start && (start.getTime() - now) > 0 && (start.getTime() - now) <= 60 * 60 * 1000)
    .slice(0, 5)
    .map(({ r }) => ({
      id:    `${r.id}-reminder`,
      link:  `/appointments/${r.id}`,
      label: `${r.appointment_code || r.id.slice(0, 8)} — ${r.vendor_name}`,
      sub:   `${r.equipment_type} · ${t('notifications.startsInOneHour')} (${(r.start_time || '').slice(0, 5)}) · ${t('appointment.assignedPOC')}: ${r.responsible_staff || '—'}`,
      tag:      t('notifications.reminder'),
      tagClass: 'bg-amber-100 text-amber-700',
      iconBg:   'bg-amber-100',
      icon:     <AlarmClock size={14} className="text-amber-600" />,
    }))
}

// Pre-existing per-role summary notifications (pending count, today count,
// attention items for manager/admin/staff; upcoming/active for vendor) —
// unchanged in substance from before D-3/D-4, just extracted into its own
// function and extended to include the `admin` role (previously only
// `manager` got this branch, which meant an admin user saw nothing here).
async function fetchLegacyItems(user, t) {
  const today = new Date().toISOString().slice(0, 10)
  const notifs = []

  if (user.role === 'manager' || user.role === 'admin') {
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

  return notifs
}

// ── Notification item ─────────────────────────────────────────────────────

function NotifItem({ item, onNavigate, t }) {
  return (
    <button
      onClick={() => item.link && onNavigate(item.link)}
      title={item.link ? t('notifications.viewAppointment') : undefined}
      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${item.iconBg}`}>
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-700 leading-tight truncate">{item.label}</p>
          {item.tag && (
            <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${item.tagClass}`}>
              {item.tag}
            </span>
          )}
        </div>
        {item.sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.sub}</p>}
      </div>
    </button>
  )
}

function NotifSection({ title, titleClass, items, onNavigate, t }) {
  if (items.length === 0) return null
  return (
    <div>
      {title && (
        <p className={`px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${titleClass}`}>
          {title}
        </p>
      )}
      {items.map(item => (
        <NotifItem key={item.id} item={item} onNavigate={onNavigate} t={t} />
      ))}
    </div>
  )
}

// ── Notification dropdown (presentational — fetch lives in Topbar so the
// bell's count badge is accurate even while the dropdown is closed) ────────

function NotificationsDropdown({ overdueItems, reminderItems, otherItems, loading, t, onNavigate, onClose }) {
  const isEmpty = !loading && overdueItems.length === 0 && reminderItems.length === 0 && otherItems.length === 0

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
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-1.5 py-10 text-center px-6">
          <Bell size={20} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t('notifications.empty')}</p>
          <p className="text-xs text-slate-400">{t('notifications.emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {/* Most urgent first: overdue, then starting soon, then everything else. */}
          <NotifSection title={t('notifications.overdueAlert')}  titleClass="text-red-500"   items={overdueItems}  onNavigate={onNavigate} t={t} />
          <NotifSection title={t('notifications.startingSoon')}  titleClass="text-amber-500" items={reminderItems} onNavigate={onNavigate} t={t} />
          <NotifSection title={null} titleClass="" items={otherItems} onNavigate={onNavigate} t={t} />
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

  const [overdueItems,  setOverdueItems]  = useState([])
  const [reminderItems, setReminderItems] = useState([])
  const [otherItems,    setOtherItems]    = useState([])
  const [notifLoading,  setNotifLoading]  = useState(true)

  async function loadNotifications() {
    if (!user) return
    setNotifLoading(true)
    const [overdue, reminder, other] = await Promise.all([
      fetchOverdueItems(user, t),
      fetchReminderItems(user, t),
      fetchLegacyItems(user, t),
    ])
    setOverdueItems(overdue)
    setReminderItems(reminder)
    setOtherItems(other)
    setNotifLoading(false)
  }

  // Fetch on mount / user change / language change (so labels re-translate
  // and the bell's count badge is correct even before the dropdown opens).
  // No polling — this app has no background jobs; opening the bell also
  // triggers a fresh fetch below.
  useEffect(() => { loadNotifications() }, [user?.id, language]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function toggleNotif() {
    setNotifOpen(v => {
      const next = !v
      if (next) loadNotifications() // refresh on open — cheap, no poller needed
      return next
    })
  }

  const notifCount = overdueItems.length + reminderItems.length + otherItems.length

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
            onClick={toggleNotif}
            className={`relative w-9 h-9 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50 transition-colors ${notifOpen ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}
          >
            <Bell size={15} />
            {notifCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          {notifOpen && user && (
            <NotificationsDropdown
              overdueItems={overdueItems}
              reminderItems={reminderItems}
              otherItems={otherItems}
              loading={notifLoading}
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
