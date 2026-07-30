import React, { useEffect, useState } from 'react'
import { Filter, ChevronLeft, ChevronRight, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { ScheduleGrid } from '../components/ScheduleGrid'
import { staff } from '../data/staff'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'

const EQUIPMENT_OPTS = ['All Equipment', 'Elevator', 'HVAC', 'Chiller', 'AED', 'UPS', 'Electrical', 'Fire Safety', 'Other']
const SHORT_MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS           = ['Mon','Tue','Wed','Thu','Fri']

// ── Date helpers ────────────────────────────────────────────────────────────

function toISO(d) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getMonday(date) {
  const d   = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// ── Supabase row → UI slot ──────────────────────────────────────────────────

function mapRow(row) {
  return {
    id:             row.id,
    date:           row.schedule_date,
    startTime:      (row.start_time || '').slice(0, 5),
    endTime:        (row.end_time   || '').slice(0, 5),
    staffName:      row.staff_name    || '',
    staffProfileId: row.staff_profile_id || null,
    equipment:      row.equipment_type || 'Other',
    capacity:       row.capacity       || 3,
    booked:         0,   // resolved in ScheduleGrid via appointment counts
    notes:          row.notes || '',
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ScheduleManagement() {
  const { t } = useLanguage()

  const [weekStartStr, setWeekStartStr] = useState(() => toISO(getMonday(new Date())))
  const [slots,        setSlots]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterStaff,  setFilterStaff]  = useState('all')
  const [filterEquip,  setFilterEquip]  = useState('All Equipment')
  const [toast,        setToast]        = useState(null)

  // Real, active internal accounts a shift can be assigned to — replaces
  // the old hardcoded 5-person src/data/staff.js list, which had no
  // connection to the actual profiles table. That gap was the real reason
  // a pilot admin could add a genuine staff member via Admin → Users but
  // never actually make them selectable here, so no bookable slot could
  // ever exist for them (see BOOKING_AVAILABILITY_DEBUG.md).
  const [internalProfiles, setInternalProfiles] = useState([])
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'manager', 'staff'])
      .eq('is_active', true)
      .order('display_name', { ascending: true })
      .then(({ data, error }) => { if (!error) setInternalProfiles(data || []) })
  }, [])

  // Derived week values
  const weekStart   = new Date(weekStartStr + 'T00:00:00')
  const weekEndStr  = toISO(addDays(weekStart, 4))   // Friday
  const weekDates   = Object.fromEntries(
    DAYS.map((d, i) => [d, toISO(addDays(weekStart, i))])
  )
  const label = (() => {
    const fri = addDays(weekStart, 4)
    return weekStart.getMonth() === fri.getMonth()
      ? `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${fri.getDate()}, ${weekStart.getFullYear()}`
      : `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${SHORT_MONTHS[fri.getMonth()]} ${fri.getDate()}, ${fri.getFullYear()}`
  })()

  // ── Fetch ────────────────────────────────────────────────────────────────

  async function fetchSlots() {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff_schedules')
      .select('*')
      .gte('schedule_date', weekStartStr)
      .lte('schedule_date', weekEndStr)
      .order('schedule_date', { ascending: true })
      .order('start_time',    { ascending: true })

    if (error) { console.error('Schedule fetch error:', error); setSlots([]) }
    else        { setSlots((data || []).map(mapRow)) }
    setLoading(false)
  }

  useEffect(() => { fetchSlots() }, [weekStartStr])

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Callbacks ────────────────────────────────────────────────────────────

  async function handleAddShift(formData) {
    const { error } = await supabase
      .from('staff_schedules')
      .insert({
        staff_name:       formData.staffName,
        staff_profile_id: formData.staffProfileId || null,
        equipment_type:   formData.equipment,
        schedule_date:    formData.date,
        start_time:       formData.startTime,
        end_time:         formData.endTime,
        capacity:         formData.capacity,
        notes:            formData.notes || null,
      })

    if (error) { console.error('Insert error:', error); showToast(t('schedule.shiftAddFailed'), 'error'); return }
    showToast(t('schedule.shiftAdded'))
    fetchSlots()
  }

  async function handleDeleteSlot(id) {
    const { error } = await supabase
      .from('staff_schedules')
      .delete()
      .eq('id', id)

    if (error) { console.error('Delete error:', error); showToast(t('schedule.shiftDeleteFailed'), 'error'); return }
    showToast(t('schedule.shiftDeleted'), 'error')
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = slots.filter(s => {
    const staffMatch = filterStaff === 'all' || s.staffName === filterStaff
    const equipMatch = filterEquip === 'All Equipment' || s.equipment === filterEquip
    return staffMatch && equipMatch
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('schedule.title')} subtitle={t('schedule.subtitle')} />

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
        {/* ── Controls bar ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Week navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekStartStr(toISO(addDays(weekStart, -7)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-sm font-semibold text-slate-700 px-2 min-w-[160px] text-center">{label}</span>
              <button
                data-testid="schedule-next-week"
                onClick={() => setWeekStartStr(toISO(addDays(weekStart, 7)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="h-5 w-px bg-slate-200" />

            {/* Staff filter */}
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              <label className="text-xs text-slate-500">{t('schedule.filterByStaff')}</label>
              <select
                value={filterStaff}
                onChange={e => setFilterStaff(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="all">{t('schedule.allStaff')}</option>
                {/* Derived from the staff names actually present in this
                    week's slots, not a separate static/live list — a
                    filter should only ever offer names that exist in the
                    data being filtered. */}
                {Array.from(new Set(slots.map(s => s.staffName).filter(Boolean))).sort().map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Equipment filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">{t('schedule.filterByEquipment')}</label>
              <select
                value={filterEquip}
                onChange={e => setFilterEquip(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {EQUIPMENT_OPTS.map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </div>

            <button
              onClick={fetchSlots}
              disabled={loading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* ── Staff coverage summary ─────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3">
          {staff.map(member => {
            const memberSlots = slots.filter(s => s.staffName === member.name)
            return (
              <div key={member.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-7 h-7 ${member.color} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {member.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {member.name.split(' ')[0]} {member.name.split(' ')[1]?.[0]}.
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mb-1">{member.role}</p>
                <div className="flex flex-wrap gap-1">
                  {member.expertise.map(e => (
                    <span key={e} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{e}</span>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400">
                    {loading ? '…' : memberSlots.length} {t(memberSlots.length !== 1 ? 'schedule.shiftsSuffixPlural' : 'schedule.shiftsSuffixSingular')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Schedule grid ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {loading ? (
            <div className="grid grid-cols-5 gap-3 animate-pulse">
              {DAYS.map(d => (
                <div key={d}>
                  <div className="h-4 bg-slate-100 rounded mb-3" />
                  <div className="space-y-2">
                    <div className="h-20 bg-slate-100 rounded-lg" />
                    <div className="h-16 bg-slate-100 rounded-lg opacity-60" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ScheduleGrid
              slots={filtered}
              weekDates={weekDates}
              onAddShift={handleAddShift}
              onDeleteSlot={handleDeleteSlot}
              staffOptions={internalProfiles}
            />
          )}
        </div>
      </div>
    </div>
  )
}
