import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderKanban, MapPin, Calendar, ChevronRight, AlertCircle } from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const STATUS_LABEL_KEYS = {
  Planning:  'projects.statusPlanning',
  Active:    'projects.statusActive',
  Blocked:   'projects.statusBlocked',
  Completed: 'projects.statusCompleted',
  Cancelled: 'projects.statusCancelled',
}
const STATUS_BADGE = {
  Planning:  'bg-slate-100 text-slate-600 border-slate-200',
  Active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Blocked:   'bg-red-50 text-red-700 border-red-200',
  Completed: 'bg-blue-50 text-blue-700 border-blue-200',
  Cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
}

// This deliberately does NOT reuse Projects.jsx/ProjectDetail.jsx with
// conditional rendering — a separate page means an internal-only section
// (members, tasks, activity, internal documents/comments) can never
// accidentally render for a vendor session because the code for it simply
// isn't present here. Data comes exclusively from get_my_vendor_projects(),
// a SECURITY DEFINER RPC that returns only id/name/status/site_name/
// start_date/target_completion_date — no description, owner, or
// created_by (see supabase_vendor_project_access_v1a_migration.sql §4).
export default function VendorProjects() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    async function fetchVendorProjects() {
      setLoading(true)
      setLoadError('')
      const { data, error } = await supabase.rpc('get_my_vendor_projects')
      if (error) {
        console.error('Vendor projects fetch error:', error)
        setLoadError(t('projects.loadError'))
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }
    fetchVendorProjects()
  }, [t])

  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase()
    if (q && !(r.name || '').toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('vendorProjects.title')} subtitle={t('vendorProjects.subtitle')} />

      <div className="p-6 space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('projects.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {loadError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <AlertCircle size={15} /> {loadError}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <FolderKanban size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">
              {rows.length === 0 ? t('vendorProjects.noProjects') : t('projects.noResults')}
            </p>
            {rows.length === 0 && <p className="text-xs text-slate-400 mt-1">{t('vendorProjects.noProjectsDesc')}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                data-testid="vendor-project-card"
                onClick={() => navigate(`/vendor-projects/${p.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-slate-800 font-display leading-tight">{p.name}</h3>
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-amber-500 transition-colors flex-shrink-0 mt-0.5" />
                </div>
                <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border mb-3 ${STATUS_BADGE[p.status] || STATUS_BADGE.Planning}`}>
                  {t(STATUS_LABEL_KEYS[p.status] || '') || p.status}
                </span>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-slate-400" />
                    <span className={p.site_name ? '' : 'italic text-slate-400'}>{p.site_name || t('appointment.notSet')}</span>
                  </div>
                  {p.target_completion_date && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      {p.target_completion_date}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
