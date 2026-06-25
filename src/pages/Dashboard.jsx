import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, CheckCircle2, XCircle, CalendarCheck2,
  ArrowRight, Clock, RefreshCw, Inbox,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Avatar } from '../components/ui/Avatar'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function toISO(d) {
  return d.toISOString().slice(0, 10)
}

/** Returns YYYY-MM-DD strings for Monday and Sunday of the current week. */
function thisWeekBounds() {
  const now = new Date()
  const day = now.getDay()                          // 0=Sun 1=Mon …
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { weekStart: toISO(mon), weekEnd: toISO(sun) }
}

function mapRow(row) {
  return {
    id:         row.id,
    vendorName: row.vendor_name       || '',
    equipment:  row.equipment_type    || 'Other',
    date:       row.requested_date    || '',
    startTime:  (row.start_time  || '').slice(0, 5),
    endTime:    (row.end_time    || '').slice(0, 5),
    staffName:  row.responsible_staff || '',
    status:     row.status            || 'Pending',
    priority:   row.priority          || 'Medium',
    createdAt:  row.created_at        || '',
  }
}

// Colour pill for each status in the distribution bar
const STATUS_COLORS = {
  'Pending':         'bg-slate-300',
  'Approved':        'bg-emerald-400',
  'Scheduled':       'bg-blue-400',
  'In Progress':     'bg-amber-400',
  '50% Finished':    'bg-orange-400',
  'Finished':        'bg-emerald-600',
  'Cancelled':       'bg-red-400',
  'Delayed':         'bg-rose-400',
  'Need More Info':  'bg-violet-400',
}

// Quick-action links filtered by role so vendors never see manager-only routes
const ROLE_QUICK_ACTIONS = {
  manager: [
    { labelKey: 'dashboard.reviewRequests', path: '/requests', color: 'hover:bg-amber-50 hover:border-amber-200' },
    { labelKey: 'dashboard.manageSchedule', path: '/schedule', color: 'hover:bg-blue-50 hover:border-blue-200' },
    { labelKey: 'dashboard.generateReport', path: '/report',   color: 'hover:bg-emerald-50 hover:border-emerald-200' },
  ],
  staff: [
    { labelKey: 'dashboard.reviewRequests', path: '/requests', color: 'hover:bg-amber-50 hover:border-amber-200' },
    { labelKey: 'nav.calendar',             path: '/calendar', color: 'hover:bg-blue-50 hover:border-blue-200' },
  ],
  vendor: [
    { labelKey: 'nav.booking',  path: '/booking',  color: 'hover:bg-amber-50 hover:border-amber-200' },
    { labelKey: 'nav.calendar', path: '/calendar', color: 'hover:bg-blue-50 hover:border-blue-200' },
  ],
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton({ displayName, t }) {
  return (
    <div className="flex flex-col flex-1">
      <Topbar
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.greeting')}, ${displayName} — ${t('dashboard.subtitle')}`}
      />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="flex gap-4 items-start">
                <div className="w-11 h-11 bg-slate-100 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-2.5 bg-slate-100 rounded w-3/4" />
                  <div className="h-6 bg-slate-100 rounded w-1/3" />
                  <div className="h-2 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 h-72 animate-pulse" />
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 h-32 animate-pulse" />
            <div className="bg-white rounded-xl border border-slate-200 h-36 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Dashboard fetch error:', error)
      setRows([])
    } else {
      setRows((data || []).map(mapRow))
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ── Stat calculations ─────────────────────────────────────────────────────

  const { weekStart, weekEnd } = thisWeekBounds()

  /** Pending: any status === 'Pending', regardless of date. */
  const pendingCount = rows.filter(r => r.status === 'Pending').length

  /**
   * Approved this week: status is Approved / Scheduled / In Progress
   * AND requested_date falls within Mon–Sun of the current week.
   */
  const approvedWeekCount = rows.filter(r =>
    ['Approved', 'Scheduled', 'In Progress'].includes(r.status) &&
    r.date >= weekStart && r.date <= weekEnd
  ).length

  /**
   * Completed this week: status === 'Finished'
   * AND requested_date falls within Mon–Sun of the current week.
   */
  const completedWeekCount = rows.filter(r =>
    r.status === 'Finished' && r.date >= weekStart && r.date <= weekEnd
  ).length

  /** Cancelled / Delayed: either final-cancellation or temporary hold. */
  const cancelledDelayedCount = rows.filter(r =>
    ['Cancelled', 'Delayed'].includes(r.status)
  ).length

  /** Recent 5 — already ordered DESC by created_at from Supabase. */
  const recent = rows.slice(0, 5)

  /** Upcoming: Scheduled or Approved, sorted soonest first, max 4. */
  const upcoming = rows
    .filter(r => ['Scheduled', 'Approved'].includes(r.status))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  /** Status distribution: group by status, sort by count desc. */
  const statusCounts = {}
  rows.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1 })
  const statusDist = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])
  const totalRows = rows.length

  const displayName = t('common.today') === 'Today' ? user?.name : (user?.nameZh || user?.name)
  const quickActions = ROLE_QUICK_ACTIONS[user?.role] || []

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <DashboardSkeleton displayName={displayName} t={t} />

  return (
    <div className="flex flex-col flex-1">
      <Topbar
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.greeting')}, ${displayName} — ${t('dashboard.subtitle')}`}
      />

      <div className="p-6 space-y-6">
        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label={t('dashboard.pendingRequests')}
            value={pendingCount}
            sub={t('dashboard.awaitingApproval')}
            icon={ClipboardList}
            accent="bg-amber-100"
          />
          <StatCard
            label={t('dashboard.approvedThisWeek')}
            value={approvedWeekCount}
            sub={t('dashboard.visitsThisWeek')}
            icon={CalendarCheck2}
            accent="bg-blue-100"
          />
          <StatCard
            label={t('dashboard.completedThisWeek')}
            value={completedWeekCount}
            sub={t('dashboard.jobsCompleted')}
            icon={CheckCircle2}
            accent="bg-emerald-100"
          />
          <StatCard
            label={t('dashboard.cancelledDelayed')}
            value={cancelledDelayedCount}
            sub={t('dashboard.requireAttention')}
            icon={XCircle}
            accent="bg-red-100"
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* ── Recent requests ─────────────────────────────────────────── */}
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 font-display">{t('dashboard.recentRequests')}</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchData}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
                >
                  <RefreshCw size={11} />
                  Refresh
                </button>
                <button
                  onClick={() => navigate('/requests')}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                >
                  {t('common.viewAll')} <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <div className="px-6 py-2">
              {recent.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Inbox size={28} className="text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-500">No requests yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Vendor appointment requests will appear here once submitted.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 pr-4">Vendor</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 pr-4">Equipment</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 pr-4">Date</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recent.map(apt => (
                      <tr
                        key={apt.id}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/appointments/${apt.id}`)}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800 text-sm">{apt.vendorName}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs text-slate-600 font-medium">{apt.equipment}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs text-slate-500">{apt.date}</span>
                        </td>
                        <td className="py-3">
                          <StatusBadge status={apt.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 font-display mb-3">{t('dashboard.quickActions')}</h2>
              <div className="space-y-2">
                {quickActions.map(({ labelKey, path, color }) => (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 transition-all ${color}`}
                  >
                    {t(labelKey)}
                    <ArrowRight size={14} className="text-slate-400" />
                  </button>
                ))}
              </div>
            </div>

            {/* Status distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 font-display mb-4">{t('dashboard.statusOverview')}</h2>
              {totalRows === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">No data yet</p>
              ) : (
                <>
                  <div className="flex h-2 rounded-full overflow-hidden mb-3 gap-px">
                    {statusDist.map(([status, count]) => (
                      <div
                        key={status}
                        className={`${STATUS_COLORS[status] || 'bg-slate-300'} transition-all`}
                        style={{ width: `${(count / totalRows) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {statusDist.map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-slate-300'}`} />
                          <span className="text-xs text-slate-600">{status}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Upcoming visits — only render panel when there is data */}
            {upcoming.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="font-semibold text-slate-800 font-display mb-3">{t('dashboard.upcomingVisits')}</h2>
                <div className="space-y-3">
                  {upcoming.map(apt => (
                    <div
                      key={apt.id}
                      className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
                      onClick={() => navigate(`/appointments/${apt.id}`)}
                    >
                      <div className="w-8 h-8 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Clock size={13} className="text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{apt.vendorName}</p>
                        <p className="text-[10px] text-slate-400">{apt.date}  {apt.startTime}–{apt.endTime}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Avatar name={apt.staffName} size="xs" />
                          <span className="text-[10px] text-slate-500">{apt.staffName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
