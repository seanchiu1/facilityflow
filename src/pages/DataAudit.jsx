import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, AlertCircle, MapPinOff, UserX, FileWarning, ShieldAlert,
  ChevronRight, RefreshCw, Loader2, CheckCircle2,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Scheduled', 'In Progress', '50% Finished', 'Finished', 'Cancelled', 'Delayed', 'Need More Info']

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

function formatTime(t) {
  if (!t) return ''
  return t.slice(0, 5)
}

function mapRow(row) {
  return {
    id:               row.id,
    displayId:        row.appointment_code || row.id.slice(0, 8),
    vendorName:       row.vendor_name || '',
    equipment:        row.equipment_type || 'Other',
    date:             row.requested_date || '',
    startTime:        formatTime(row.start_time),
    status:           row.status || 'Pending',
    responsibleStaff: row.responsible_staff || '',
    siteId:           row.site_id || null,
    siteName:         row.site?.name || null,
    pocProfileId:     row.assigned_poc_profile_id || null,
    pocDisplayName:   row.assigned_poc?.display_name || null,
    pocIsActive:      row.assigned_poc?.is_active ?? null,
  }
}

const CATEGORIES = [
  { key: 'all',            icon: FileWarning },
  { key: 'missingSite',    icon: MapPinOff },
  { key: 'missingPoc',     icon: UserX },
  { key: 'freeTextOnly',   icon: AlertCircle },
  { key: 'inactivePoc',    icon: ShieldAlert },
]

export default function DataAudit() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  const [category,     setCategory]     = useState('all')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search,       setSearch]       = useState('')

  // ── Quick-edit: Site / Assigned POC dropdown options ────────────────────
  // Same fetch shape as AppointmentDetail.jsx's edit form — active sites,
  // active internal (admin/manager/staff) profiles only.
  const [activeSites,      setActiveSites]      = useState([])
  const [internalProfiles, setInternalProfiles] = useState([])

  useEffect(() => {
    supabase
      .from('sites')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data, error }) => { if (!error) setActiveSites(data || []) })
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'manager', 'staff'])
      .eq('is_active', true)
      .order('display_name', { ascending: true })
      .then(({ data, error }) => { if (!error) setInternalProfiles(data || []) })
  }, [])

  // Per-row draft selections, keyed by appointment id — only populated for
  // rows the user has actually touched; untouched rows read straight from
  // `rows` itself, so no draft bookkeeping is needed until an edit starts.
  const [edits,     setEdits]     = useState({})
  // Per-row save feedback: { saving, error, saved }
  const [rowStatus, setRowStatus] = useState({})

  function getDraft(row) {
    return edits[row.id] || { siteId: row.siteId || '', pocProfileId: row.pocProfileId || '' }
  }

  function isDirty(row) {
    const d = getDraft(row)
    return (d.siteId || null) !== row.siteId || (d.pocProfileId || null) !== row.pocProfileId
  }

  function setDraftField(row, field, value) {
    const current = getDraft(row)
    setEdits(prev => ({ ...prev, [row.id]: { ...current, [field]: value } }))
    setRowStatus(prev => ({ ...prev, [row.id]: { ...prev[row.id], saved: false, error: '' } }))
  }

  async function saveRow(row) {
    const draft = getDraft(row)
    if (!isDirty(row)) return   // Save is disabled in this state anyway; defensive no-op.

    setRowStatus(prev => ({ ...prev, [row.id]: { saving: true, error: '', saved: false } }))

    const newSiteId = draft.siteId || null
    const newPocId  = draft.pocProfileId || null

    const payload = { site_id: newSiteId, assigned_poc_profile_id: newPocId }
    // Sync responsible_staff to the newly linked profile's display name —
    // backward-compatible fallback text stays correct going forward.
    // Clearing the POC link does NOT touch responsible_staff: the free-text
    // value is left exactly as it was, per the "don't erase legacy text"
    // requirement — the dropdown's own "— Clear selection —" option is the
    // explicit signal that only the *link* is being removed.
    const newProfile = newPocId ? internalProfiles.find(p => p.id === newPocId) : null
    if (newProfile) payload.responsible_staff = newProfile.display_name

    const { error } = await supabase
      .from('appointment_requests')
      .update(payload)
      .eq('id', row.id)

    if (error) {
      console.error('Data audit quick-edit save error:', error)
      setRowStatus(prev => ({ ...prev, [row.id]: { saving: false, error: t('dataAudit.saveFailed'), saved: false } }))
      return
    }

    const newSite = newSiteId ? activeSites.find(s => s.id === newSiteId) : null

    setRows(prev => prev.map(r => {
      if (r.id !== row.id) return r
      return {
        ...r,
        siteId:           newSiteId,
        siteName:         newSite?.name || null,
        pocProfileId:     newPocId,
        pocDisplayName:   newProfile?.display_name || null,
        pocIsActive:      newPocId ? true : null,   // internalProfiles is already active-only
        responsibleStaff: payload.responsible_staff ?? r.responsibleStaff,
      }
    }))

    setEdits(prev => { const next = { ...prev }; delete next[row.id]; return next })
    setRowStatus(prev => ({ ...prev, [row.id]: { saving: false, error: '', saved: true } }))
    setTimeout(() => {
      setRowStatus(prev => ({ ...prev, [row.id]: { ...prev[row.id], saved: false } }))
    }, 2500)
  }

  async function fetchRows() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('id, appointment_code, vendor_name, equipment_type, requested_date, start_time, responsible_staff, status, site_id, assigned_poc_profile_id, assigned_poc:profiles!assigned_poc_profile_id(display_name, is_active), site:sites!site_id(name)')
      .order('requested_date', { ascending: false })

    if (error) {
      console.error('Data audit fetch error:', error)
      setLoadError(t('dataAudit.loadError'))
      setRows([])
    } else {
      setRows((data || []).map(mapRow))
    }
    setLoading(false)
  }

  useEffect(() => { fetchRows() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Category membership (each row can belong to more than one) ─────────

  const isMissingSite  = r => !r.siteId
  const isMissingPoc   = r => !r.pocProfileId
  const isFreeTextOnly = r => !r.pocProfileId && !!r.responsibleStaff.trim()
  const isInactivePoc  = r => !!r.pocProfileId && r.pocIsActive === false

  const counts = {
    missingSite:  rows.filter(isMissingSite).length,
    missingPoc:   rows.filter(isMissingPoc).length,
    freeTextOnly: rows.filter(isFreeTextOnly).length,
    inactivePoc:  rows.filter(isInactivePoc).length,
  }

  const categoryPredicate = {
    all:          () => true,
    missingSite:  isMissingSite,
    missingPoc:   isMissingPoc,
    freeTextOnly: isFreeTextOnly,
    inactivePoc:  isInactivePoc,
  }

  const filtered = rows.filter(r => {
    if (!categoryPredicate[category](r)) return false
    if (statusFilter !== 'All' && r.status !== statusFilter) return false

    const q = search.trim().toLowerCase()
    if (q && !(r.vendorName.toLowerCase().includes(q) || r.equipment.toLowerCase().includes(q) || r.displayId.toLowerCase().includes(q))) {
      return false
    }
    return true
  })

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('dataAudit.title')} subtitle={t('dataAudit.subtitle')} />

      <div className="p-4 sm:p-6 space-y-5">
        {/* Counts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('dataAudit.missingSite')}
            value={counts.missingSite}
            sub={t('dataAudit.missingSiteSub')}
            icon={MapPinOff}
            accent="bg-amber-100"
          />
          <StatCard
            label={t('dataAudit.missingPoc')}
            value={counts.missingPoc}
            sub={t('dataAudit.missingPocSub')}
            icon={UserX}
            accent="bg-red-100"
          />
          <StatCard
            label={t('dataAudit.freeTextOnly')}
            value={counts.freeTextOnly}
            sub={t('dataAudit.freeTextOnlySub')}
            icon={AlertCircle}
            accent="bg-blue-100"
          />
          <StatCard
            label={t('dataAudit.inactivePoc')}
            value={counts.inactivePoc}
            sub={t('dataAudit.inactivePocSub')}
            icon={ShieldAlert}
            accent="bg-violet-100"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  category === key
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon size={12} />
                {t(`dataAudit.${key}`)}
                {key !== 'all' && <span className="opacity-75">({counts[key]})</span>}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-slate-100">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('dataAudit.searchPlaceholder')}
                className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {STATUS_FILTERS.map(s => (
                <option key={s} value={s}>{t(STATUS_FILTER_LABEL_KEYS[s])}</option>
              ))}
            </select>

            <button
              onClick={fetchRows}
              disabled={loading}
              className="sm:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-500">
              {loading ? t('common.loading') : `${filtered.length} ${filtered.length !== 1 ? t('requests.results') : t('requests.result')}`}
            </p>
          </div>

          {loading ? (
            <div className="p-4 sm:p-6 space-y-3 animate-pulse">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg" />)}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <AlertCircle size={20} className="text-red-400" />
              <p className="text-sm text-slate-500">{loadError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <FileWarning size={22} className="text-slate-300" />
              <p className="text-sm text-slate-400">{t('dataAudit.noResults')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">{t('requests.colId')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('common.vendor')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('common.equipment')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('requests.colDateTime')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('dataAudit.colFreeTextPoc')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 min-w-[180px]">{t('dataAudit.assignPoc')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 min-w-[150px]">{t('dataAudit.assignSite')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('common.status')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 min-w-[110px]">{t('dataAudit.save')}</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(row => {
                    const draft   = getDraft(row)
                    const status  = rowStatus[row.id] || {}
                    const dirty   = isDirty(row)
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/appointments/${row.id}`)}
                      >
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-slate-400">{row.displayId}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.vendorName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{row.equipment}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {row.date} {row.startTime}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.responsibleStaff
                            ? <span className="text-slate-600">{row.responsibleStaff}</span>
                            : <span className="text-slate-300 italic">{t('dataAudit.none')}</span>}
                        </td>

                        {/* Quick-edit: Assigned POC — the dropdown only lists
                            active profiles, so a row currently linked to a
                            now-inactive profile won't show that person as a
                            selected option (browsers show it blank instead).
                            The name is surfaced as a note underneath so the
                            admin isn't left guessing who it was. */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={draft.pocProfileId}
                            onChange={e => setDraftField(row, 'pocProfileId', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <option value="">{t('dataAudit.clearSelection')}</option>
                            {internalProfiles.map(p => (
                              <option key={p.id} value={p.id}>{p.display_name} ({t(`roles.${p.role}`)})</option>
                            ))}
                          </select>
                          {row.pocIsActive === false && !dirty && (
                            <p className="mt-1 text-[10px] text-red-500">
                              {row.pocDisplayName} ({t('sites.inactive')})
                            </p>
                          )}
                        </td>

                        {/* Quick-edit: Site */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={draft.siteId}
                            onChange={e => setDraftField(row, 'siteId', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <option value="">{t('dataAudit.clearSelection')}</option>
                            {activeSites.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>

                        {/* Save action + feedback */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveRow(row)}
                              disabled={!dirty || status.saving}
                              title={!dirty ? t('dataAudit.noChange') : undefined}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                              {status.saving
                                ? <><Loader2 size={11} className="animate-spin" /> {t('dataAudit.saving')}</>
                                : t('dataAudit.save')}
                            </button>
                            {status.saved && (
                              <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                          {status.error && (
                            <p className="mt-1 text-[10px] text-red-500 flex items-center gap-1">
                              <AlertCircle size={9} /> {status.error}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
