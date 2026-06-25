import React, { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Search, Inbox, SlidersHorizontal } from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { RequestTable } from '../components/RequestTable'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { recordStatusChange } from '../lib/statusHistory'

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Scheduled', 'In Progress', '50% Finished', 'Finished', 'Cancelled', 'Delayed', 'Need More Info']

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

function mapDbAppointmentToUi(row, index) {
  const staffName = row.responsible_staff || ''
  const contactName = row.contact_name || ''

  return {
    // Real Supabase UUID — used for updates and as React key
    id: row.id,

    // Human-readable sequential ID shown in the table
    displayId: `APT-${String(index + 1).padStart(3, '0')}`,

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

    // Meta
    priority: row.priority || 'Medium',
    status: row.status || 'Pending',
    description: row.description || '',
    createdAt: row.created_at,

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
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <Search size={20} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">No matching requests</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          No results for <span className="font-medium text-slate-600">"{search}"</span>. Try adjusting your search or status filter.
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
        <p className="text-sm font-semibold text-slate-700">No {statusFilter.toLowerCase()} requests</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          There are currently no vendor requests with status <span className="font-medium text-slate-600">{statusFilter}</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <Inbox size={20} className="text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700">No requests yet</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">
        Vendor appointment requests will appear here once submitted.
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

    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .order('requested_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching appointments:', error)
      showToast('Failed to load requests from Supabase', 'error')
      setApts([])
    } else {
      const mappedData = data.map(mapDbAppointmentToUi)
      setApts(mappedData)
    }

    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function updateStatus(id, newStatus) {
    const oldStatus = apts.find(a => a.id === id)?.status || null

    // 1. Update the main appointment record
    const { error } = await supabase
      .from('appointment_requests')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      console.error('Error updating status:', error)
      showToast('Failed to update status', 'error')
      return
    }

    // 2. Persist the history row (non-fatal — appointment update already succeeded)
    const { error: histErr } = await recordStatusChange(id, oldStatus, newStatus, user)
    if (histErr) {
      console.error('Status history insert error:', histErr)
      // Still show success toast for the main update, but warn about history
      showToast('Status updated — history log unavailable', 'error')
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
                placeholder={`${t('common.search')} vendor or ID…`}
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
                  {s} {counts[s] > 0 && <span className="ml-1 opacity-75">({counts[s]})</span>}
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
                {pendingCount} request{pendingCount > 1 ? 's' : ''} awaiting your review
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">All requests reviewed</p>
                <p className="text-xs text-emerald-600 mt-0.5">There are no pending vendor requests at this time.</p>
              </div>
            </div>
          )
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {loading ? 'Loading requests...' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </p>

            <button
              onClick={fetchAppointments}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              Refresh
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
                showToast(`Status updated → ${newStatus}`, isNegative ? 'error' : 'success')
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}