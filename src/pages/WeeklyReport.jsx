import React, { useEffect, useState } from 'react'
import {
  FileText, Download, ClipboardCopy, TrendingUp, Users, Package,
  ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Check, Inbox,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Avatar } from '../components/ui/Avatar'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'

// ── Date helpers ────────────────────────────────────────────────────────────

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getMonday(date) {
  const d = new Date(date)
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

function weekRangeLabel(monday) {
  const sun = addDays(monday, 6)
  return monday.getMonth() === sun.getMonth()
    ? `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()}–${sun.getDate()}, ${monday.getFullYear()}`
    : `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()} – ${SHORT_MONTHS[sun.getMonth()]} ${sun.getDate()}, ${monday.getFullYear()}`
}

// ── Data helpers ────────────────────────────────────────────────────────────

function calcHours(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.slice(0, 5).split(':').map(Number)
  const [eh, em] = endTime.slice(0, 5).split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? +(diff / 60).toFixed(1) : 0
}

function mapRow(row, i) {
  return {
    id:          row.id,
    code:        row.appointment_code || `RPT-${String(i + 1).padStart(3, '0')}`,
    vendorName:  row.vendor_name       || '',
    contactName: row.contact_name      || '',
    equipment:   row.equipment_type    || 'Other',
    date:        row.requested_date    || '',
    startTime:   (row.start_time  || '').slice(0, 5),
    endTime:     (row.end_time    || '').slice(0, 5),
    staffName:   row.responsible_staff || '',
    priority:    row.priority          || 'Medium',
    status:      row.status            || 'Pending',
    description: row.description       || '',
    hours:       calcHours(row.start_time, row.end_time),
    startDate:            row.start_date              || null,
    targetCompletionDate: row.target_completion_date   || null,
    progressPercent:      row.progress_percent         ?? 0,
  }
}

// Compact date+time formatter for CSV export, local time.
function formatCsvDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function escapeCSVField(value) {
  const str = String(value ?? '')
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// ── Style maps ──────────────────────────────────────────────────────────────

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

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
        <Icon size={14} className="text-amber-600" />
      </div>
      <h2 className="font-bold text-slate-800 font-display">{title}</h2>
    </div>
  )
}

function EmptySection({ message }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <Inbox size={24} className="text-slate-300 mb-2" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="flex gap-3">
        <div className="h-10 w-32 bg-slate-100 rounded-lg" />
        <div className="h-10 w-32 bg-slate-100 rounded-lg" />
        <div className="h-10 w-32 bg-slate-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-xl" />)}
      </div>
      <div className="h-16 bg-slate-100 rounded-xl" />
      <div className="grid grid-cols-2 gap-5">
        <div className="h-48 bg-slate-100 rounded-xl" />
        <div className="h-48 bg-slate-100 rounded-xl" />
      </div>
      <div className="h-64 bg-slate-100 rounded-xl" />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function WeeklyReport() {
  const { t, language } = useLanguage()

  // weekStartStr is the canonical state: ISO date of the Monday
  const [weekStartStr, setWeekStartStr] = useState(() => toISO(getMonday(new Date())))
  const [rows, setRows]                 = useState([])
  const [loading, setLoading]           = useState(true)
  const [copied, setCopied]             = useState(false)
  const [exported, setExported]         = useState(false)

  // Derived date objects
  const weekStart   = new Date(weekStartStr + 'T00:00:00')
  const weekEnd     = addDays(weekStart, 6)
  const weekEndStr  = toISO(weekEnd)
  const weekLabel   = weekRangeLabel(weekStart)
  const todayMonStr = toISO(getMonday(new Date()))
  const isCurrentWeek = weekStartStr === todayMonStr

  // ── Fetch ──────────────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .gte('requested_date', weekStartStr)
      .lte('requested_date', weekEndStr)
      .order('requested_date', { ascending: true })
      .order('start_time',     { ascending: true })

    if (error) {
      console.error('Report fetch error:', error)
      setRows([])
    } else {
      setRows((data || []).map(mapRow))
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [weekStartStr])

  // ── Stats ──────────────────────────────────────────────────────────────

  const total         = rows.length
  const completedList = rows.filter(r => r.status === 'Finished')
  const inProgList    = rows.filter(r => ['In Progress', '50% Finished', 'Approved', 'Scheduled'].includes(r.status))
  const cancelledList = rows.filter(r => ['Cancelled', 'Delayed'].includes(r.status))
  const rate          = total > 0 ? Math.round((completedList.length / total) * 100) : 0

  // Equipment breakdown
  const byEquip = {}
  rows.forEach(r => {
    if (!byEquip[r.equipment]) byEquip[r.equipment] = { total: 0, finished: 0 }
    byEquip[r.equipment].total++
    if (r.status === 'Finished') byEquip[r.equipment].finished++
  })
  const equipEntries = Object.entries(byEquip).sort((a, b) => b[1].total - a[1].total)

  // Staff breakdown — key by name since Supabase only stores the string
  const byStaff = {}
  rows.forEach(r => {
    const key = r.staffName || 'Unassigned'
    if (!byStaff[key]) byStaff[key] = { count: 0, hours: 0 }
    byStaff[key].count++
    byStaff[key].hours += r.hours
  })
  const staffEntries = Object.entries(byStaff).sort((a, b) => b[1].count - a[1].count)

  // ── Copy summary ───────────────────────────────────────────────────────

  async function handleCopy() {
    const lines = [
      `FacilityFlow — Weekly Report`,
      `Week: ${weekLabel}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '── Summary ───────────────────────────────',
      `Total Visits:      ${total}`,
      `Completed:         ${completedList.length} (${rate}%)`,
      `In Progress:       ${inProgList.length}`,
      `Cancelled/Delayed: ${cancelledList.length}`,
      '',
      '── By Equipment ──────────────────────────',
    ]
    equipEntries.forEach(([eq, d]) => {
      const r = d.total > 0 ? Math.round((d.finished / d.total) * 100) : 0
      lines.push(`  ${eq.padEnd(14)} ${d.total} visit(s)  ${d.finished} done  ${r}%`)
    })
    lines.push('', '── By Staff ──────────────────────────────')
    staffEntries.forEach(([name, d]) => {
      lines.push(`  ${name.padEnd(22)} ${d.count} visit(s)  ${d.hours.toFixed(1)}h`)
    })
    lines.push('', '── Vendor Visit Log ──────────────────────')
    rows.forEach(r => {
      lines.push(
        `  ${r.code}  ${r.vendorName} | ${r.equipment} | ` +
        `${r.date} ${r.startTime}–${r.endTime} | ${r.staffName} | ${r.status}`
      )
    })
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Clipboard write failed:', err)
    }
  }

  // ── Export CSV ─────────────────────────────────────────────────────────

  function exportCSV() {
    try {
      const HEADERS = [
        t('report.csvColCode'),
        t('report.csvColVendor'),
        t('report.csvColContact'),
        t('report.csvColEquipment'),
        t('report.csvColDate'),
        t('report.csvColStartTime'),
        t('report.csvColEndTime'),
        t('report.csvColStartDate'),
        t('report.csvColTargetCompletionDate'),
        t('report.csvColStaff'),
        t('report.csvColPriority'),
        t('report.csvColStatus'),
        t('report.csvColProgress'),
        t('report.csvColDescription'),
      ]

      const STATUS_DISPLAY = {
        'Pending':        t('common.pending'),
        'Approved':       t('common.approved'),
        'Scheduled':      t('common.scheduled'),
        'In Progress':    t('common.inProgress'),
        '50% Finished':   t('common.halfFinished'),
        'Finished':       t('common.finished'),
        'Cancelled':      t('common.cancelled'),
        'Delayed':        t('common.delayed'),
        'Need More Info': t('common.needMoreInfo'),
      }
      const PRIORITY_DISPLAY = {
        'High':   t('common.high'),
        'Medium': t('common.medium'),
        'Low':    t('common.low'),
      }

      const dataRows = rows.map(r => [
        r.code,
        r.vendorName,
        r.contactName,
        r.equipment,
        r.date,
        r.startTime,
        r.endTime,
        formatCsvDateTime(r.startDate),
        formatCsvDateTime(r.targetCompletionDate),
        r.staffName,
        PRIORITY_DISPLAY[r.priority] || r.priority,
        STATUS_DISPLAY[r.status]     || r.status,
        r.progressPercent,
        r.description,
      ].map(escapeCSVField).join(','))

      const csv      = [HEADERS.join(','), ...dataRows].join('\r\n')
      const blob     = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      const langSuffix = language === 'zh-TW' ? '-zh' : ''
      a.href         = url
      a.download     = `facilityflow-weekly-report-${weekStartStr}-to-${weekEndStr}${langSuffix}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExported(true)
      setTimeout(() => setExported(false), 2000)
    } catch (err) {
      console.error('CSV export failed:', err)
    }
  }

  // ── Export PDF ─────────────────────────────────────────────────────────

  function handlePrint() {
    window.print()
  }

  // ── Nav helpers ────────────────────────────────────────────────────────

  const goBack    = () => setWeekStartStr(toISO(addDays(weekStart, -7)))
  const goForward = () => setWeekStartStr(toISO(addDays(weekStart, 7)))
  const goToday   = () => setWeekStartStr(todayMonStr)

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1">
      <Topbar
        title={t('report.title')}
        subtitle={`${t('report.subtitle')} ${weekLabel}`}
      />

      <div className="p-6 space-y-5">

        {/* ── Controls bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-slate-700 min-w-[160px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={goForward}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={goToday}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <CalendarDays size={11} />
                Current Week
              </button>
            )}
            {isCurrentWeek && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full uppercase tracking-wide">
                This Week
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-xs font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Download size={13} />
              {t('report.exportPDF')}
            </button>
            <button
              onClick={exportCSV}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                exported
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              {exported ? <Check size={13} /> : <FileText size={13} />}
              {exported ? '✓ ' : ''}{t('report.exportCSV')}
            </button>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                copied
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white'
              }`}
            >
              {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
              {copied ? 'Copied!' : t('report.copySummary')}
            </button>
          </div>
        </div>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {loading && <ReportSkeleton />}

        {!loading && (
          <>
            {/* ── Summary stat cards ─────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: t('report.totalVisits'),    value: total,             sub: 'this week',     color: 'bg-slate-100',   tc: 'text-slate-600' },
                { label: t('report.completedJobs'),  value: completedList.length, sub: `${rate}% rate`, color: 'bg-emerald-100', tc: 'text-emerald-700' },
                { label: t('report.inProgressJobs'), value: inProgList.length,  sub: 'active',        color: 'bg-amber-100',   tc: 'text-amber-700' },
                { label: t('report.cancelledJobs'),  value: cancelledList.length, sub: 'require action', color: 'bg-red-100', tc: 'text-red-700' },
              ].map(({ label, value, sub, color, tc }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">{label}</p>
                  <p className="text-3xl font-bold text-slate-900 font-display">{value}</p>
                  <span className={`inline-flex mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${color} ${tc}`}>{sub}</span>
                </div>
              ))}
            </div>

            {/* ── Completion rate bar ────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-amber-500" />
                  <h3 className="font-semibold text-slate-800 font-display">{t('report.completionRate')}</h3>
                </div>
                <span className="text-2xl font-bold text-slate-900 font-display">{rate}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${rate}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>0%</span>
                <span className={rate >= 85 ? 'text-emerald-600 font-medium' : ''}>
                  Target: 85%{rate >= 85 ? ' ✓' : ''}
                </span>
                <span>100%</span>
              </div>
            </div>

            {/* ── Equipment + Staff ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-5">

              {/* Equipment breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <SectionHeader icon={Package} title={t('report.equipmentSummary')} />
                {equipEntries.length === 0 ? (
                  <EmptySection message="No equipment data for this week" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2">{t('report.category')}</th>
                        <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2">{t('report.count')}</th>
                        <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2">Done</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {equipEntries.map(([eq, data]) => {
                        const r = data.total > 0 ? Math.round((data.finished / data.total) * 100) : 0
                        return (
                          <tr key={eq}>
                            <td className="py-2.5">
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${EQUIP_COLORS[eq] || EQUIP_COLORS.Other}`}>{eq}</span>
                            </td>
                            <td className="py-2.5 text-center text-sm font-semibold text-slate-700">{data.total}</td>
                            <td className="py-2.5 text-center text-sm text-slate-500">{data.finished}</td>
                            <td className="py-2.5 text-right">
                              <span className={`text-xs font-semibold ${r === 100 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {r}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Staff summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <SectionHeader icon={Users} title={t('report.staffSummary')} />
                {staffEntries.length === 0 ? (
                  <EmptySection message="No staff assignments for this week" />
                ) : (
                  <div className="space-y-3">
                    {staffEntries.map(([name, data]) => (
                      <div key={name} className="flex items-center gap-3">
                        <Avatar name={name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{name}</p>
                          <div className="w-full mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${Math.min((data.count / total) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-slate-800">{data.count}</p>
                          <p className="text-xs text-slate-400">{data.hours.toFixed(1)}h</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Vendor visit log ───────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <SectionHeader icon={FileText} title={t('report.vendorLog')} />
              {rows.length === 0 ? (
                <EmptySection message={`No vendor visits scheduled for ${weekLabel}`} />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-6">Code</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">{t('report.vendorName')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">{t('common.equipment')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">{t('common.date')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">Time</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">{t('common.staff')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">{t('common.status')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2">{t('appointment.progress')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((apt, i) => (
                      <tr key={apt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-6">
                          <span className="font-mono text-xs text-slate-400">{apt.code}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-700 text-sm">{apt.vendorName}</p>
                          {apt.contactName && (
                            <p className="text-xs text-slate-400">{apt.contactName}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${EQUIP_COLORS[apt.equipment] || EQUIP_COLORS.Other}`}>
                            {apt.equipment}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600">{apt.date}</td>
                        <td className="py-3 pr-4 text-xs text-slate-500">
                          {apt.startTime && apt.endTime ? `${apt.startTime}–${apt.endTime}` : '—'}
                          {apt.hours > 0 && (
                            <span className="text-slate-400 ml-1">({apt.hours}h)</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Avatar name={apt.staffName} size="xs" />
                            <span className="text-xs text-slate-600">{apt.staffName || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={apt.status} />
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5 w-16">
                            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full"
                                style={{ width: `${apt.progressPercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{apt.progressPercent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
