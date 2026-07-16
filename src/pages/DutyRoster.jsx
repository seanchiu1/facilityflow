import React, { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Printer, Plus, Pencil, Trash2, X,
  Phone, Mail, StickyNote, User2, AlertCircle, CheckCircle2, Loader2,
  FileSpreadsheet, Upload, Download,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

// ── Excel import/export helpers ─────────────────────────────────────────────

// Accepted header variants (case-insensitive) → internal field name
const HEADER_MAP = {
  'date': 'date', 'roster date': 'date',
  'site': 'site',
  'duty staff': 'dutyStaff', 'duty staff name': 'dutyStaff',
  'phone': 'phone', 'mobile': 'phone',
  'email': 'email',
  'notes': 'notes',
}

function normalizeRawRow(raw) {
  const out = {}
  Object.entries(raw).forEach(([k, v]) => {
    const key = HEADER_MAP[String(k).trim().toLowerCase()]
    if (key) out[key] = v
  })
  return out
}

// Accepts a JS Date (from xlsx's cellDates option) or a text date in
// YYYY-MM-DD / YYYY/MM/DD / MM-DD-YYYY / MM/DD/YYYY form. Returns an ISO
// YYYY-MM-DD string, or null if unparseable.
function parseDateCell(val) {
  if (val === '' || val === null || val === undefined) return null
  if (val instanceof Date && !isNaN(val)) return toISO(val)

  const s = String(val).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return isNaN(d) ? null : toISO(d)
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]))
    return isNaN(d) ? null : toISO(d)
  }
  return null
}

// ── Date helpers ────────────────────────────────────────────────────────────

const DAY_HEADERS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// ── Empty edit-form state ────────────────────────────────────────────────

const emptyForm = { id: null, site: '', name: '', phone: '', email: '', notes: '' }

// ── Main page ────────────────────────────────────────────────────────────

export default function DutyRoster() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const isReadOnly = user?.role === 'staff'

  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [siteFilter, setSiteFilter] = useState('all')
  const [sites,      setSites]      = useState([])

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const [openDate, setOpenDate] = useState(null)   // ISO date string, or null when modal closed
  const [form,     setForm]     = useState(emptyForm)
  const [saving,   setSaving]   = useState(false)
  const [formError, setFormError] = useState('')
  const [toast,    setToast]    = useState(null)

  // ── Excel import state ──────────────────────────────────────────────────
  const fileInputRef = useRef(null)
  const [showImport,    setShowImport]    = useState(false)
  const [previewRows,   setPreviewRows]   = useState([])
  const [parseError,    setParseError]    = useState('')
  const [importSaving,  setImportSaving]  = useState(false)
  const [importSaveError, setImportSaveError] = useState('')

  const monthStartStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
  const monthEndStr   = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth(viewYear, viewMonth)).padStart(2, '0')}`
  const todayStr      = toISO(today)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // ── Fetch month data + distinct site list ─────────────────────────────

  async function fetchMonth() {
    setLoading(true)
    const { data, error } = await supabase
      .from('duty_rosters')
      .select('*')
      .gte('roster_date', monthStartStr)
      .lte('roster_date', monthEndStr)
      .order('site', { ascending: true })

    if (error) {
      console.error('Duty roster fetch error:', error)
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  async function fetchSites() {
    const { data, error } = await supabase.from('duty_rosters').select('site')
    if (!error) {
      const distinct = Array.from(new Set((data || []).map(r => r.site))).sort()
      setSites(distinct)
    }
  }

  useEffect(() => { fetchMonth() }, [viewYear, viewMonth]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSites() }, [])

  // ── Export current month to Excel ───────────────────────────────────────

  function handleExportExcel() {
    const headers = [t('common.date'), t('roster.site'), t('roster.dutyStaff'), t('roster.phone'), t('roster.email'), t('roster.notes')]
    const data = [...rows]
      .sort((a, b) => a.roster_date.localeCompare(b.roster_date) || a.site.localeCompare(b.site))
      .map(r => ([
        r.roster_date,
        r.site,
        r.duty_staff_name,
        r.duty_staff_phone || '',
        r.duty_staff_email || '',
        r.notes || '',
      ]))

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Roster')
    const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
    XLSX.writeFile(wb, `facilityflow-duty-roster-${monthStr}.xlsx`)
  }

  // ── Download a blank import template ────────────────────────────────────

  function handleDownloadTemplate() {
    const headers = [t('common.date'), t('roster.site'), t('roster.dutyStaff'), t('roster.phone'), t('roster.email'), t('roster.notes')]
    const sample = [
      ['2026-08-01', 'Building A', 'Chen Wei-Ming', 'x3405', 'wm.chen@qualcomm.com', 'On-call for HVAC issues'],
      ['2026-08-02', 'Building B', 'Lin Mei-Hui', 'x3412', 'mh.lin@qualcomm.com', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Roster Template')
    XLSX.writeFile(wb, 'facilityflow-duty-roster-template.xlsx')
  }

  // ── Parse a selected .xlsx file into preview rows ───────────────────────

  function buildPreviewRow(raw, index) {
    const norm = normalizeRawRow(raw)
    const errors = []

    const dateRaw = norm.date
    const roster_date = parseDateCell(dateRaw)
    if (dateRaw === '' || dateRaw === undefined || dateRaw === null) errors.push(t('roster.missingDate'))
    else if (!roster_date) errors.push(t('roster.invalidDate'))

    const site = String(norm.site ?? '').trim()
    if (!site) errors.push(t('roster.missingSite'))

    const dutyStaffName = String(norm.dutyStaff ?? '').trim()
    if (!dutyStaffName) errors.push(t('roster.missingDutyStaff'))

    return {
      rowNum: index + 2,   // +2: header is row 1, data starts at row 2 in the spreadsheet
      roster_date,
      dateDisplay: dateRaw instanceof Date ? toISO(dateRaw) : String(dateRaw ?? ''),
      site,
      duty_staff_name: dutyStaffName,
      duty_staff_phone: String(norm.phone ?? '').trim() || null,
      duty_staff_email: String(norm.email ?? '').trim() || null,
      notes: String(norm.notes ?? '').trim() || null,
      errors,
      valid: errors.length === 0,
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setParseError('')
    setImportSaveError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      setPreviewRows(rawRows.map(buildPreviewRow))
      setShowImport(true)
    } catch (err) {
      console.error('Excel parse error:', err)
      setParseError(t('roster.parseError'))
      setShowImport(true)
      setPreviewRows([])
    }
  }

  function closeImport() {
    setShowImport(false)
    setPreviewRows([])
    setParseError('')
    setImportSaveError('')
  }

  // ── Save import: bulk upsert on (roster_date, site) ─────────────────────

  function dedupeByKey(list) {
    const map = new Map()
    list.forEach(r => map.set(`${r.roster_date}|${r.site}`, r))
    return Array.from(map.values())
  }

  async function saveImport() {
    const validRows = previewRows.filter(r => r.valid)
    if (validRows.length === 0) return

    setImportSaving(true)
    setImportSaveError('')

    const uniqueDates = Array.from(new Set(validRows.map(r => r.roster_date)))
    const { data: existing, error: fetchErr } = await supabase
      .from('duty_rosters')
      .select('roster_date, site')
      .in('roster_date', uniqueDates)

    if (fetchErr) {
      console.error('Import existing-rows fetch error:', fetchErr)
      setImportSaveError(t('roster.saveError'))
      setImportSaving(false)
      return
    }

    const existingSet = new Set((existing || []).map(r => `${r.roster_date}|${r.site}`))

    const toInsert = []
    const toUpdate = []
    validRows.forEach(r => {
      const key = `${r.roster_date}|${r.site}`
      const payload = {
        roster_date:      r.roster_date,
        site:              r.site,
        duty_staff_name:   r.duty_staff_name,
        duty_staff_phone:  r.duty_staff_phone,
        duty_staff_email:  r.duty_staff_email,
        notes:             r.notes,
      }
      if (existingSet.has(key)) toUpdate.push(payload)
      else toInsert.push({ ...payload, created_by: user?.id || null })
    })

    const insertRows = dedupeByKey(toInsert)
    const updateRows = dedupeByKey(toUpdate)

    if (insertRows.length > 0) {
      const { error } = await supabase.from('duty_rosters').upsert(insertRows, { onConflict: 'roster_date,site' })
      if (error) {
        console.error('Import insert error:', error)
        setImportSaveError(t('roster.saveError'))
        setImportSaving(false)
        return
      }
    }
    if (updateRows.length > 0) {
      const { error } = await supabase.from('duty_rosters').upsert(updateRows, { onConflict: 'roster_date,site' })
      if (error) {
        console.error('Import update error:', error)
        setImportSaveError(t('roster.saveError'))
        setImportSaving(false)
        return
      }
    }

    setImportSaving(false)
    closeImport()
    await Promise.all([fetchMonth(), fetchSites()])
    showToast(`${t('roster.importSuccess')} — ${insertRows.length} ${t('roster.inserted')}, ${updateRows.length} ${t('roster.updated')}`)
  }

  // Group rows by date, always across all sites — the site filter only
  // narrows what's shown in the grid cell preview, not what's loaded, so
  // the day-detail modal can always show every site's assignment for that day.
  const rosterByDate = {}
  rows.forEach(r => {
    if (!rosterByDate[r.roster_date]) rosterByDate[r.roster_date] = []
    rosterByDate[r.roster_date].push(r)
  })

  // ── Month navigation ───────────────────────────────────────────────────

  function goPrevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  // ── Day modal ──────────────────────────────────────────────────────────

  function openDay(dateStr) {
    setOpenDate(dateStr)
    setFormError('')
    setForm({ ...emptyForm, site: siteFilter !== 'all' ? siteFilter : '' })
  }

  function closeDay() {
    setOpenDate(null)
    setForm(emptyForm)
    setFormError('')
  }

  function startEditRow(row) {
    setForm({
      id:    row.id,
      site:  row.site,
      name:  row.duty_staff_name,
      phone: row.duty_staff_phone || '',
      email: row.duty_staff_email || '',
      notes: row.notes || '',
    })
    setFormError('')
  }

  function startNewInModal() {
    setForm({ ...emptyForm, site: siteFilter !== 'all' ? siteFilter : '' })
    setFormError('')
  }

  async function saveAssignment() {
    if (!form.site.trim())  { setFormError(t('roster.siteRequired'));  return }
    if (!form.name.trim())  { setFormError(t('roster.nameRequired'));  return }

    setSaving(true)
    setFormError('')

    const payload = {
      roster_date:      openDate,
      site:              form.site.trim(),
      duty_staff_name:   form.name.trim(),
      duty_staff_phone:  form.phone.trim() || null,
      duty_staff_email:  form.email.trim() || null,
      notes:             form.notes.trim() || null,
    }

    let error
    if (form.id) {
      ({ error } = await supabase.from('duty_rosters').update(payload).eq('id', form.id))
    } else {
      ({ error } = await supabase.from('duty_rosters').insert({ ...payload, created_by: user?.id || null }))
    }

    setSaving(false)

    if (error) {
      console.error('Duty roster save error:', error)
      // Postgres unique_violation
      if (error.code === '23505') setFormError(t('roster.duplicateError'))
      else setFormError(t('roster.saveError'))
      return
    }

    await Promise.all([fetchMonth(), fetchSites()])
    showToast(t('roster.rosterSaved'))
    startNewInModal()
  }

  async function deleteAssignment(id) {
    if (!window.confirm(t('roster.deleteConfirm'))) return

    const { error } = await supabase.from('duty_rosters').delete().eq('id', id)
    if (error) {
      console.error('Duty roster delete error:', error)
      showToast(t('roster.deleteError'), 'error')
      return
    }

    await fetchMonth()
    showToast(t('roster.rosterDeleted'))
    if (form.id === id) startNewInModal()
  }

  // ── Grid cells ─────────────────────────────────────────────────────────

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()   // 0=Sun
  const startOffset  = firstWeekday === 0 ? 6 : firstWeekday - 1   // Mon-anchored
  const totalDays    = daysInMonth(viewYear, viewMonth)

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  function dayToISO(day) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function visibleForCell(dateStr) {
    const all = rosterByDate[dateStr] || []
    if (siteFilter === 'all') return all
    return all.filter(r => r.site === siteFilter)
  }

  const openDayRows = openDate ? (rosterByDate[openDate] || []) : []

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('roster.title')} subtitle={t('roster.subtitle')} />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium print:hidden ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Controls bar */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <button onClick={goPrevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-slate-700 min-w-[160px] text-center">
              {FULL_MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={goNextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ChevronRight size={14} />
            </button>
            <button
              onClick={goToday}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              {t('common.today')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={siteFilter}
              onChange={e => setSiteFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">{t('roster.allSites')}</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Printer size={13} />
              {t('roster.printRoster')}
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              <FileSpreadsheet size={13} />
              {t('roster.exportExcel')}
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Download size={13} />
              {t('roster.downloadTemplate')}
            </button>
            {!isReadOnly && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Upload size={13} />
                  {t('roster.importExcel')}
                </button>
              </>
            )}
          </div>
        </div>

        {isReadOnly && (
          <p className="text-xs text-slate-400 print:hidden">{t('roster.readOnlyHint')}</p>
        )}

        {/* Grid */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {loading ? (
            <div className="grid grid-cols-7 gap-px animate-pulse">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-20 bg-slate-100" />
              ))}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-t-lg overflow-hidden border border-slate-200">
                {DAY_HEADERS.map(h => (
                  <div key={h} className="bg-slate-50 text-center text-xs font-semibold text-slate-500 py-2">{h}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-200 border border-t-0 border-slate-200 rounded-b-lg overflow-hidden">
                {cells.map((day, i) => {
                  const dateStr = day ? dayToISO(day) : null
                  const isToday = dateStr === todayStr
                  const dayRows = dateStr ? visibleForCell(dateStr) : []
                  return (
                    <div
                      key={i}
                      onClick={() => dateStr && openDay(dateStr)}
                      className={`bg-white min-h-[90px] p-1.5 ${isToday ? 'bg-amber-50' : ''} ${dateStr ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors`}
                    >
                      {day && (
                        <>
                          <span className={`text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full mb-1 ${
                            isToday ? 'bg-amber-500 text-white' : 'text-slate-600'
                          }`}>
                            {day}
                          </span>
                          {dayRows.length === 0 ? (
                            <p className="text-[10px] text-slate-300">{t('roster.noAssignment')}</p>
                          ) : (
                            <div className="space-y-1">
                              {dayRows.map(r => (
                                <div key={r.id} className="text-[9px] leading-tight bg-blue-50 border border-blue-200 rounded px-1 py-0.5">
                                  {siteFilter === 'all' && (
                                    <p className="font-semibold text-blue-800 truncate">{r.site}</p>
                                  )}
                                  <p className="text-blue-700 truncate flex items-center gap-0.5">
                                    <User2 size={8} className="flex-shrink-0" /> {r.duty_staff_name}
                                  </p>
                                  {(r.duty_staff_phone || r.duty_staff_email) && (
                                    <p className="text-blue-500 truncate">
                                      {r.duty_staff_phone || r.duty_staff_email}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day detail / edit modal */}
      {openDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{openDate}</h2>
              <button onClick={closeDay} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Existing assignments for this day */}
              {openDayRows.length > 0 && (
                <div className="space-y-2">
                  {openDayRows.map(r => (
                    <div key={r.id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-amber-600">{r.site}</p>
                          <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                            <User2 size={12} className="text-slate-400" /> {r.duty_staff_name}
                          </p>
                          {r.duty_staff_phone && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                              <Phone size={11} className="text-slate-400" /> {r.duty_staff_phone}
                            </p>
                          )}
                          {r.duty_staff_email && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                              <Mail size={11} className="text-slate-400" /> {r.duty_staff_email}
                            </p>
                          )}
                          {r.notes && (
                            <p className="text-xs text-slate-500 flex items-start gap-1.5 mt-1">
                              <StickyNote size={11} className="text-slate-400 mt-0.5 flex-shrink-0" /> {r.notes}
                            </p>
                          )}
                        </div>
                        {!isReadOnly && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEditRow(r)}
                              title={t('roster.editAssignment')}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteAssignment(r.id)}
                              title={t('roster.deleteAssignment')}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {openDayRows.length === 0 && isReadOnly && (
                <p className="text-sm text-slate-400 text-center py-4">{t('roster.noAssignment')}</p>
              )}

              {/* Add / edit form — internal roles only */}
              {!isReadOnly && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    {form.id ? <Pencil size={11} /> : <Plus size={11} />}
                    {form.id ? t('roster.editAssignment') : t('roster.addAssignment')}
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.site')}</label>
                    <input
                      type="text"
                      list="roster-sites"
                      value={form.site}
                      onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
                      placeholder={t('roster.newSite')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <datalist id="roster-sites">
                      {sites.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.dutyStaff')}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.phone')}</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.email')}</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.notes')}</label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  {formError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={11} /> {formError}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveAssignment}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {saving ? <><Loader2 size={13} className="animate-spin" /> …</> : t('common.save')}
                    </button>
                    {form.id && (
                      <button
                        onClick={startNewInModal}
                        className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import preview modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{t('roster.importPreview')}</h2>
              <button onClick={closeImport} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {parseError ? (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {parseError}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <CheckCircle2 size={14} />
                      {previewRows.filter(r => r.valid).length} {t('roster.validRows')}
                    </span>
                    <span className="flex items-center gap-1.5 text-red-600 font-medium">
                      <AlertCircle size={14} />
                      {previewRows.filter(r => !r.valid).length} {t('roster.invalidRows')}
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.row')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('common.date')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.site')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.dutyStaff')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.phone')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.email')}</th>
                          <th className="text-left font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">{t('roster.error')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {previewRows.map(r => (
                          <tr key={r.rowNum} className={r.valid ? '' : 'bg-red-50/60'}>
                            <td className="px-3 py-2 text-slate-400">{r.rowNum}</td>
                            <td className="px-3 py-2 text-slate-700">{r.roster_date || r.dateDisplay || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{r.site || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{r.duty_staff_name || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{r.duty_staff_phone || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{r.duty_staff_email || '—'}</td>
                            <td className="px-3 py-2 text-red-600">{r.errors.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {previewRows.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">{t('roster.noValidRows')}</p>
                  )}

                  {previewRows.some(r => !r.valid) && previewRows.length > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle size={11} /> {t('roster.fixErrorsHint')}
                    </p>
                  )}

                  {importSaveError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={11} /> {importSaveError}
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveImport}
                  disabled={
                    importSaving ||
                    !!parseError ||
                    previewRows.length === 0 ||
                    previewRows.some(r => !r.valid)
                  }
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {importSaving ? <><Loader2 size={13} className="animate-spin" /> …</> : t('common.save')}
                </button>
                <button
                  onClick={closeImport}
                  className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
