import React, { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Search, Inbox, SlidersHorizontal } from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { RequestTable } from '../components/RequestTable'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { recordStatusChange } from '../lib/statusHistory'

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Scheduled', 'In Progress', '50% Finished', 'Finished', 'Cancelled', 'Delayed', 'Need More Info']

// Maps canonical English status values → i18n keys for display labels only.
// Internal state and Supabase values are never changed.
const STATUS_FILTER_LABEL_KEYS = {
  'All':            'common.all',
  'Pending':        'common.pending',
  'Approved':       'common.approved',
  'Scheduled':      'common.scheduled',
  'In Progress':    'common.inProgress',
  '50% Finished':   'common.halfFinished',
  'Finished':       'common.finished',
  'Cancelled':      'common.cancelled',
  'Delayed':        'common.delayed',
  'Need More Info': 'common.needMoreInfo',
}

function formatTime(timeString) {
  if (!timeString) return ''
  return timeString.slice(0, 5)
}

function makeInitials(name = '') {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function mapDbAppointmentToUi(row, index, approvedReportIds) {
  // Prefer the linked profile's display name when Assigned POC is a
  // structured link; fall back to the free-text column for legacy/unlinked
  // appointments. See supabase_sites_poc_linkage_migration.sql.
  const staffName = row.assigned_poc?.display_name || row.responsible_staff || ''
  const siteName = row.site?.name || null
  const contactName = row.contact_name || ''

  return {
    // True once at least one maintenance_report document for this
    // appointment has been approved — gates the Finished transition.
    hasApprovedMaintenanceReport: approvedReportIds?.has(row.id) ?? false,

    // Real Supabase UUID — used for updates and as React key
    id: row.id,

    // Stable human-readable code from the database
    displayId: row.appointment_code || `APT-${String(index + 1).padStart(3, '0')}`,

    // Vendor fields
    vendorName: row.vendor_name || '',
    vendorContact: contactName,
    contactName,

    // Equipment
    equipment: row.equipment_type || 'Other',
    equipmentType: row.equipment_type || 'Other',

    // Schedule
    date: row.requested_date || '',
    requestedDate: row.requested_date || '',
    startTime: formatTime(row.start_time),
    endTime: formatTime(row.end_time),
    time: `${formatTime(row.start_time)}–${formatTime(row.end_time)}`,

    // Staff — staffName drives both the Avatar initials and the label
    staffName,
    staffInitials: makeInitials(staffName),
    staff: staffName,
    responsibleStaff: staffName,
    siteName,

    // Meta
    priority: row.priority || 'Medium',
    status: row.status || 'Pending',
    description: row.description || '',
    createdAt: row.created_at,

    // D-2: target dates — Assigned POC is staffName/responsibleStaff above,
    // not a separate field
    startDate: row.start_date || null,
    targetCompletionDate: row.target_completion_date || null,
    progressPercent: row.progress_percent ?? 0,

    timeline: [
      {
        status: row.status || 'Pending',
        timestamp: row.created_at ? row.created_at.slice(0, 16).replace('T', ' ') : '',
        note: 'Loaded from Supabase',
      }
    ],

    raw: row,
  }
}

function TableEmptyState({ search, statusFilter }) {
  const { t } = useLanguage()

  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <Search size={20} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">{t('requests.noMatchTitle')}</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          {t('requests.noMatchDesc')}
        </p>
      </div>
    )
  }

  if (statusFilter !== 'All') {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <SlidersHorizontal size={20} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">{t('requests.noStatusTitle')}</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          {t('requests.noStatusDesc')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <Inbox size={20} className="text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{t('requests.noRequestsYet')}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">
        {t('requests.noRequestsYetDesc')}
      </p>
    </div>
  )
}

export default function Requests() {
  const { t }    = useLanguage()
  const { user } = useAuth()

  const [apts, setApts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchAppointments()
  }, [])

  async function fetchAppointments() {
    setLoading(true)

    const [aptRes, reportsRes] = await Promise.all([
      supabase
        .from('appointment_requests')
        .select('*, assigned_poc:profiles!assigned_poc_profile_id(display_name), site:sites!site_id(name)')
        .order('requested_date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('appointment_documents')
        .select('appointment_id')
        .eq('document_type', 'maintenance_report')
        .eq('approval_status', 'approved'),
    ])

    if (aptRes.error) {
      console.error('Error fetching appointments:', aptRes.error)
      showToast(t('requests.loadError'), 'error')
      setApts([])
    } else {
      const approvedReportIds = new Set((reportsRes.data || []).map(r => r.appointment_id))
      const mappedData = aptRes.data.map((row, i) => mapDbAppointmentToUi(row, i, approvedReportIds))
      setApts(mappedData)
    }

    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function updateStatus(id, newStatus) {
    const target = apts.find(a => a.id === id)
    const oldStatus = target?.status || null

    // Closure gate — enforced here too (not just via the disabled dropdown
    // item), so a stale UI state can't slip a Finished transition through.
    if (newStatus === 'Finished' && !target?.hasApprovedMaintenanceReport) {
      showToast(t('appointment.maintenanceReportRequired'), 'error')
      return
    }

    // 1. Update the main appointment record
    const { error } = await supabase
      .from('appointment_requests')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      console.error('Error updating status:', error)
      showToast(t('requests.statusUpdateError'), 'error')
      return
    }

    // 2. Persist the history row (non-fatal — appointment update already succeeded)
    const { error: histErr } = await recordStatusChange(id, oldStatus, newStatus, user)
    if (histErr) {
      console.error('Status history insert error:', histErr)
      // Still show success toast for the main update, but warn about history
      showToast(t('requests.historyUnavailable'), 'error')
    }

    // 3. Optimistic local update (status only — timeline lives in AppointmentDetail)
    setApts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
  }

  const filtered = apts.filter(a => {
    const statusMatch = statusFilter === 'All' || a.status === statusFilter

    const searchText = search.toLowerCase()
    const searchMatch =
      !search ||
      a.vendorName?.toLowerCase().includes(searchText) ||
      a.contactName?.toLowerCase().includes(searchText) ||
      a.equipment?.toLowerCase().includes(searchText) ||
      a.id?.toLowerCase().includes(searchText) ||
      a.displayId?.toLowerCase().includes(searchText)

    return statusMatch && searchMatch
  })

  const counts = {}
  STATUS_FILTERS.forEach(s => {
    counts[s] = s === 'All' ? apts.length : apts.filter(a => a.status === s).length
  })

  const pendingCount = apts.filter(a => a.status === 'Pending').length

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('requests.title')} subtitle={t('requests.subtitle')} />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Filters bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('requests.searchPlaceholder')}
                className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-56"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === s
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t(STATUS_FILTER_LABEL_KEYS[s] || '')} {counts[s] > 0 && <span className="ml-1 opacity-75">({counts[s]})</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pending alert / all-reviewed badge */}
        {!loading && apts.length > 0 && (
          pendingCount > 0 ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 animate-pulse" />
              <p className="text-sm text-amber-800 font-medium">
                {pendingCount} {t('requests.awaitingReview')}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">{t('requests.allReviewed')}</p>
                <p className="text-xs text-emerald-600 mt-0.5">{t('requests.allReviewedDesc')}</p>
              </div>
            </div>
          )
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {loading
                ? t('requests.loading')
                : `${filtered.length} ${filtered.length !== 1 ? t('requests.results') : t('requests.result')}`}
            </p>

            <button
              onClick={fetchAppointments}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              {t('common.refresh')}
            </button>
          </div>

          {!loading && filtered.length === 0 ? (
            <TableEmptyState search={search} statusFilter={statusFilter} />
          ) : !loading ? (
            <RequestTable
              appointments={filtered}
              showActions
              onApprove={async (id) => {
                await updateStatus(id, 'Approved')
                showToast(t('requests.approveSuccess'))
              }}
              onReject={async (id) => {
                await updateStatus(id, 'Cancelled')
                showToast(t('requests.rejectSuccess'), 'error')
              }}
              onMoreInfo={async (id) => {
                await updateStatus(id, 'Need More Info')
                showToast(t('requests.moreInfoSent'))
              }}
              onStatusUpdate={async (id, newStatus) => {
                await updateStatus(id, newStatus)
                const isNegative = newStatus === 'Cancelled' || newStatus === 'Delayed'
                const label = t(STATUS_FILTER_LABEL_KEYS[newStatus] || '') || newStatus
                showToast(`${t('requests.statusUpdatedTo')} ${label}`, isNegative ? 'error' : 'success')
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}