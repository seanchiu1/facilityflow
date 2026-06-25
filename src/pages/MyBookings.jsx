import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, Clock, ArrowRight, RefreshCw, BookOpen, Inbox, User2,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Avatar } from '../components/ui/Avatar'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'

const VENDOR_PROFILE_KEY = 'facilityflow_vendor_profile'

const EQUIP_COLORS = {
  Elevator:      'bg-sky-100 text-sky-700',
  HVAC:          'bg-teal-100 text-teal-700',
  Chiller:       'bg-cyan-100 text-cyan-700',
  AED:           'bg-red-100 text-red-700',
  UPS:           'bg-indigo-100 text-indigo-700',
  Electrical:    'bg-yellow-100 text-yellow-700',
  'Fire Safety': 'bg-orange-100 text-orange-700',
  Other:         'bg-slate-100 text-slate-600',
}

function mapRow(row, i) {
  return {
    id:          row.id,
    displayId:   `APT-${String(i + 1).padStart(3, '0')}`,
    equipment:   row.equipment_type    || 'Other',
    date:        row.requested_date    || '',
    startTime:   (row.start_time  || '').slice(0, 5),
    endTime:     (row.end_time    || '').slice(0, 5),
    staffName:   row.responsible_staff || '',
    status:      row.status            || 'Pending',
    description: row.description       || '',
  }
}

// ── Empty / loading sub-components ────────────────────────────────────────────

function NoProfileState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mb-5">
        <BookOpen size={24} className="text-amber-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 font-display mb-2">No bookings yet</h2>
      <p className="text-sm text-slate-500 max-w-xs mb-6 leading-relaxed">
        Submit your first appointment request. Your bookings will appear here so you can track status and send messages to the facilities team.
      </p>
      <button
        onClick={() => navigate('/booking')}
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <BookOpen size={15} />
        Submit a Booking
      </button>
    </div>
  )
}

function EmptyBookingsState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-5">
        <Inbox size={24} className="text-slate-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 font-display mb-2">No bookings found</h2>
      <p className="text-sm text-slate-500 max-w-xs mb-6 leading-relaxed">
        No appointment requests matched your vendor profile. They may have been removed, or try submitting a new one.
      </p>
      <button
        onClick={() => navigate('/booking')}
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        Submit a Booking
      </button>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="h-11 bg-slate-50 border-b border-slate-100" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-6 px-6 py-4 border-b border-slate-50 last:border-0">
          <div className="h-3 w-16 bg-slate-100 rounded" />
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-3 w-20 bg-slate-100 rounded" />
          <div className="h-3 w-28 bg-slate-100 rounded" />
          <div className="h-5 w-20 bg-slate-100 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MyBookings() {
  const { t }    = useLanguage()
  const navigate = useNavigate()

  const [profile,      setProfile]      = useState(null)
  const [hasProfile,   setHasProfile]   = useState(false)
  const [bookings,     setBookings]     = useState([])
  const [loading,      setLoading]      = useState(true)

  // ── Load profile + fetch ─────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VENDOR_PROFILE_KEY)
      if (stored) {
        const p = JSON.parse(stored)
        setProfile(p)
        setHasProfile(true)
        fetchBookings(p)
      } else {
        setHasProfile(false)
        setLoading(false)
      }
    } catch {
      setHasProfile(false)
      setLoading(false)
    }
  }, [])

  async function fetchBookings(p) {
    setLoading(true)
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('vendor_name',  p.vendorName)
      .eq('contact_name', p.contactName)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('MyBookings fetch error:', error)
      setBookings([])
    } else {
      setBookings((data || []).map(mapRow))
    }
    setLoading(false)
  }

  const refresh = () => { if (profile) fetchBookings(profile) }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1">
      <Topbar
        title={t('nav.myBookings')}
        subtitle={profile
          ? `${profile.vendorName} · ${profile.contactName}`
          : 'Submit a booking to start tracking your appointments'}
      />

      <div className="p-6 space-y-5">
        {/* Vendor identity chip */}
        {profile && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-5 py-3.5">
            <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User2 size={15} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{profile.vendorName}</p>
              <p className="text-xs text-slate-500">{profile.contactName}</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
              Vendor
            </span>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 ml-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}

        {/* Content states */}
        {!hasProfile && !loading ? (
          <NoProfileState />
        ) : loading ? (
          <LoadingSkeleton />
        ) : bookings.length === 0 ? (
          <EmptyBookingsState />
        ) : (
          <>
            <p className="text-xs text-slate-400">
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''} — click any row to view details and send messages
            </p>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3 w-20">#</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Equipment</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Time</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Assigned Staff</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="w-8 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bookings.map(apt => (
                    <tr
                      key={apt.id}
                      onClick={() => navigate(`/appointments/${apt.id}`)}
                      className="hover:bg-amber-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-400">{apt.displayId}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${EQUIP_COLORS[apt.equipment] || EQUIP_COLORS.Other}`}>
                          {apt.equipment}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Calendar size={11} className="text-slate-400 flex-shrink-0" />
                          {apt.date}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock size={11} className="text-slate-400 flex-shrink-0" />
                          {apt.startTime && apt.endTime ? `${apt.startTime}–${apt.endTime}` : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {apt.staffName
                            ? <><Avatar name={apt.staffName} size="xs" /><span className="text-xs text-slate-600">{apt.staffName}</span></>
                            : <span className="text-xs text-slate-400">—</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={apt.status} />
                      </td>
                      <td className="px-4 py-4">
                        <ArrowRight size={14} className="text-slate-300 group-hover:text-amber-400 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Contact the Qualcomm Facilities team via the message thread inside each booking.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
