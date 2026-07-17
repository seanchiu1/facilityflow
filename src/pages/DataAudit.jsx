import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, AlertCircle, MapPinOff, UserX, FileWarning, ShieldAlert,
  ChevronRight, RefreshCw,
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

      <div className="p-6 space-y-5">
        {/* Counts */}
        <div className="grid grid-cols-4 gap-4">
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
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('dataAudit.searchPlaceholder')}
                className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-64"
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
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
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
            <div className="p-6 space-y-3 animate-pulse">
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
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('dataAudit.colLinkedPoc')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('roster.site')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('common.status')}</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(row => (
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
                      <td className="px-4 py-3 text-xs">
                        {row.pocProfileId ? (
                          <span className={row.pocIsActive === false ? 'text-red-600 font-medium' : 'text-emerald-700 font-medium'}>
                            {row.pocDisplayName || '—'}
                            {row.pocIsActive === false && <span className="ml-1 text-[10px] uppercase tracking-wide">({t('sites.inactive')})</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">{t('dataAudit.notLinked')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.siteName
                          ? <span className="text-slate-600">{row.siteName}</span>
                          : <span className="text-slate-300 italic">{t('appointment.notSet')}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
