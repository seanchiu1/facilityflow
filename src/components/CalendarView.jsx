import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, CalendarX } from 'lucide-react'
import { StatusBadge } from './ui/StatusBadge'
import { useLanguage } from '../context/LanguageContext'

const EQUIP_COLORS = {
  Elevator:      'bg-sky-100 border-sky-300 text-sky-800',
  HVAC:          'bg-teal-100 border-teal-300 text-teal-800',
  Chiller:       'bg-cyan-100 border-cyan-300 text-cyan-800',
  AED:           'bg-red-100 border-red-300 text-red-800',
  UPS:           'bg-indigo-100 border-indigo-300 text-indigo-800',
  Electrical:    'bg-yellow-100 border-yellow-300 text-yellow-800',
  'Fire Safety': 'bg-orange-100 border-orange-300 text-orange-800',
  Other:         'bg-slate-100 border-slate-300 text-slate-700',
}

const SHORT_DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FULL_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Return ISO date string YYYY-MM-DD from a Date
function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Return the Monday of the week containing `date`
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()                    // 0=Sun, 1=Mon …
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function EventCard({ apt }) {
  const color = EQUIP_COLORS[apt.equipment] || EQUIP_COLORS.Other
  return (
    <div className={`border rounded-lg p-2 mb-1.5 text-xs ${color}`}>
      <p className="font-semibold truncate">{apt.vendorName}</p>
      <p className="text-[10px] opacity-75 mt-0.5">{apt.startTime}–{apt.endTime}</p>
      <p className="text-[10px] opacity-75 truncate">{apt.staffName}</p>
      <div className="mt-1.5">
        <StatusBadge status={apt.status} />
      </div>
    </div>
  )
}

function WeekSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-3">
      {SHORT_DAYS.map(day => (
        <div key={day} className="min-h-[200px]">
          <div className="text-xs font-semibold mb-2 pb-2 border-b border-slate-200 text-slate-300 uppercase tracking-wider">
            {day}
          </div>
          <div className="space-y-2 animate-pulse">
            <div className="h-16 bg-slate-100 rounded-lg" />
            <div className="h-10 bg-slate-100 rounded-lg opacity-60" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyCalendar({ onRefresh }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <CalendarX size={22} className="text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700">No scheduled appointments</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">
        Approved and scheduled vendor appointments will appear here. Pending requests must be approved first.
      </p>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="mt-4 flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      )}
    </div>
  )
}

export function CalendarView({ appointments, loading, onRefresh }) {
  const { t } = useLanguage()
  const [view, setView] = useState('weekly')
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [refreshing, setRefreshing] = useState(false)

  const todayStr = toISO(new Date())

  // Compute the 5 weekday cells from weekStart
  const weekDays = SHORT_DAYS.map((label, i) => {
    const d = addDays(weekStart, i)
    return {
      label:   `${label} ${d.getDate()}`,
      date:    toISO(d),
      isToday: toISO(d) === todayStr,
    }
  })

  // Header range string
  const endOfWeek = addDays(weekStart, 4)
  const sameMonth  = weekStart.getMonth() === endOfWeek.getMonth()
  const weekLabel  = sameMonth
    ? `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${endOfWeek.getDate()}, ${weekStart.getFullYear()}`
    : `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${SHORT_MONTHS[endOfWeek.getMonth()]} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`

  const viewYear  = weekStart.getFullYear()
  const viewMonth = weekStart.getMonth()
  const monthLabel = `${FULL_MONTHS[viewMonth]} ${viewYear}`
  const headerLabel = view === 'monthly' ? monthLabel : weekLabel

  // Navigation: weekly = ±7 days, monthly = ±1 calendar month
  function handlePrev() {
    if (view === 'monthly') {
      setWeekStart(prev => getMonday(new Date(prev.getFullYear(), prev.getMonth() - 1, 1)))
    } else {
      setWeekStart(prev => addDays(prev, -7))
    }
  }
  function handleNext() {
    if (view === 'monthly') {
      setWeekStart(prev => getMonday(new Date(prev.getFullYear(), prev.getMonth() + 1, 1)))
    } else {
      setWeekStart(prev => addDays(prev, 7))
    }
  }

  async function handleRefresh() {
    if (!onRefresh) return
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  // Group appointments by ISO date for weekly view
  const byDate = {}
  weekDays.forEach(d => { byDate[d.date] = [] })
  appointments.forEach(apt => {
    if (byDate[apt.date] !== undefined) byDate[apt.date].push(apt)
  })

  return (
    <div>
      {/* Control bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {['weekly', 'monthly'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            title="Refresh calendar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-sm font-semibold text-slate-700 px-2 min-w-[160px] text-center">
              {headerLabel}
            </span>
            <button
              onClick={handleNext}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <WeekSkeleton />
      ) : appointments.length === 0 ? (
        <EmptyCalendar onRefresh={handleRefresh} />
      ) : view === 'weekly' ? (
        <div className="grid grid-cols-5 gap-3">
          {weekDays.map(day => (
            <div key={day.date} className="min-h-[200px]">
              <div className={`text-xs font-semibold mb-2 pb-2 border-b ${
                day.isToday
                  ? 'text-amber-600 border-amber-200'
                  : 'text-slate-500 border-slate-200'
              }`}>
                <span className="uppercase tracking-wider">{day.label}</span>
                {day.isToday && (
                  <span className="ml-1.5 text-[9px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Today
                  </span>
                )}
              </div>
              {byDate[day.date].length === 0 ? (
                <p className="text-xs text-slate-300 text-center pt-4">{t('calendar.noAppointments')}</p>
              ) : (
                byDate[day.date].map(apt => <EventCard key={apt.id} apt={apt} />)
              )}
            </div>
          ))}
        </div>
      ) : (
        <MonthlyView
          appointments={appointments}
          viewYear={viewYear}
          viewMonth={viewMonth}
          todayStr={todayStr}
        />
      )}
    </div>
  )
}

function MonthlyView({ appointments, viewYear, viewMonth, todayStr }) {
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()     // 0=Sun
  const startOffset  = firstWeekday === 0 ? 6 : firstWeekday - 1    // Mon-anchored grid

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // Build ISO date for each cell day
  const dayToISO = (day) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const aptsByDate = {}
  appointments.forEach(apt => {
    if (!apt.date) return
    if (!aptsByDate[apt.date]) aptsByDate[apt.date] = []
    aptsByDate[apt.date].push(apt)
  })

  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-t-lg overflow-hidden border border-slate-200">
        {DAY_HEADERS.map(h => (
          <div key={h} className="bg-slate-50 text-center text-xs font-semibold text-slate-500 py-2">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-t-0 border-slate-200 rounded-b-lg overflow-hidden">
        {cells.map((day, i) => {
          const dateStr  = day ? dayToISO(day) : null
          const isToday  = dateStr === todayStr
          const dayApts  = dateStr ? (aptsByDate[dateStr] || []) : []
          return (
            <div key={i} className={`bg-white min-h-[80px] p-1.5 ${isToday ? 'bg-amber-50' : ''}`}>
              {day && (
                <>
                  <span className={`text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full mb-1 ${
                    isToday ? 'bg-amber-500 text-white' : 'text-slate-600'
                  }`}>
                    {day}
                  </span>
                  {dayApts.map(apt => (
                    <div
                      key={apt.id}
                      className={`text-[9px] font-medium px-1 py-0.5 rounded mb-0.5 truncate border ${EQUIP_COLORS[apt.equipment] || EQUIP_COLORS.Other}`}
                    >
                      {(apt.vendorName || '').split(' ')[0]}
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
