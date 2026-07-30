import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, X, FolderKanban, Loader2, AlertCircle, MapPin, Calendar,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const STATUSES = ['Planning', 'Active', 'Blocked', 'Completed', 'Cancelled']

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

const emptyForm = {
  id: null, name: '', description: '', site_id: '', status: 'Active',
  owner_profile_id: '', start_date: '', target_completion_date: '',
}

export default function Projects() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'admin' || user?.role === 'manager'

  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [siteFilter,   setSiteFilter]   = useState('all')

  const [activeSites,      setActiveSites]      = useState([])
  const [internalProfiles, setInternalProfiles] = useState([])

  const [editing,   setEditing]   = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')

  async function fetchProjects() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, status, site_id, owner_profile_id, start_date, target_completion_date, site:sites!site_id(name), owner:profiles!owner_profile_id(display_name)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Projects fetch error:', error)
      setLoadError(t('projects.loadError'))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchProjects() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('sites').select('id, name').eq('is_active', true).order('name')
      .then(({ data, error }) => { if (!error) setActiveSites(data || []) })
    supabase.from('profiles').select('id, display_name, role')
      .in('role', ['admin', 'manager', 'staff']).eq('is_active', true).order('display_name')
      .then(({ data, error }) => { if (!error) setInternalProfiles(data || []) })
  }, [])

  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (siteFilter !== 'all' && r.site_id !== siteFilter) return false
    const q = search.trim().toLowerCase()
    if (q && !(r.name || '').toLowerCase().includes(q)) return false
    return true
  })

  function openCreate() {
    setForm(emptyForm)
    setSaveError('')
    setEditing(true)
  }

  function closeEdit() {
    setEditing(false)
    setForm(emptyForm)
    setSaveError('')
  }

  async function saveProject() {
    if (!form.name.trim()) { setSaveError(t('projects.nameRequired')); return }

    setSaving(true)
    setSaveError('')

    const payload = {
      name:                   form.name.trim(),
      description:            form.description.trim() || null,
      site_id:                form.site_id || null,
      status:                 form.status,
      owner_profile_id:       form.owner_profile_id || null,
      start_date:             form.start_date || null,
      target_completion_date: form.target_completion_date || null,
    }

    const { data: created, error } = await supabase
      .from('projects')
      .insert({ ...payload, created_by: user?.id || null })
      .select('id, name')
      .single()

    setSaving(false)

    if (error) {
      console.error('Project save error:', error)
      setSaveError(t('projects.saveError'))
      return
    }

    // Fire-and-forget activity log — a failure here never blocks creation.
    if (created) {
      const { error: actErr } = await supabase.from('project_activity').insert({
        project_id: created.id,
        actor_profile_id: user?.id || null,
        activity_type: 'project_created',
        summary: created.name,
        metadata: {},
      })
      if (actErr) console.error('Activity log error (non-fatal):', actErr)
    }

    await fetchProjects()
    closeEdit()
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('projects.title')} subtitle={t('projects.subtitle')} />

      <div className="p-4 sm:p-6 space-y-5">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative w-full sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('projects.searchPlaceholder')}
                className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">{t('projects.allStatuses')}</option>
              {STATUSES.map(s => <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>)}
            </select>

            <select
              value={siteFilter}
              onChange={e => setSiteFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">{t('projects.allSites')}</option>
              {activeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {canManage && (
              <button
                onClick={openCreate}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                {t('projects.createProject')}
              </button>
            )}
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => <div key={i} className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center bg-white border border-slate-200 rounded-xl">
            <AlertCircle size={20} className="text-red-400" />
            <p className="text-sm text-slate-500">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center bg-white border border-slate-200 rounded-xl">
            <FolderKanban size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">{rows.length === 0 ? t('projects.noProjects') : t('projects.noResults')}</p>
            {rows.length === 0 && <p className="text-xs text-slate-400 max-w-xs">{t('projects.noProjectsDesc')}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                data-testid="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:shadow-card-hover hover:border-amber-200 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-800 font-display leading-snug">{p.name}</h3>
                  <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE[p.status] || STATUS_BADGE.Planning}`}>
                    {t(STATUS_LABEL_KEYS[p.status] || '') || p.status}
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.description}</p>
                )}
                <div className="space-y-1.5">
                  {p.site?.name && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                      {p.site.name}
                    </div>
                  )}
                  {p.target_completion_date && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar size={11} className="text-slate-400 flex-shrink-0" />
                      {p.target_completion_date}
                    </div>
                  )}
                  {p.owner?.display_name && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                      <Avatar name={p.owner.display_name} size="xs" />
                      <span className="text-xs text-slate-600">{p.owner.display_name}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{t('projects.createProject')}</h2>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.description')}</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.site')}</label>
                  <select
                    value={form.site_id}
                    onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">{t('appointment.selectSite')}</option>
                    {activeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('common.status')}</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.owner')}</label>
                <select
                  value={form.owner_profile_id}
                  onChange={e => setForm(f => ({ ...f, owner_profile_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">{t('projects.selectOwner')}</option>
                  {internalProfiles.map(p => <option key={p.id} value={p.id}>{p.display_name} ({t(`roles.${p.role}`)})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('appointment.startDate')}</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('appointment.targetCompletionDate')}</label>
                  <input
                    type="date"
                    value={form.target_completion_date}
                    onChange={e => setForm(f => ({ ...f, target_completion_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {saveError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={11} /> {saveError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveProject}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? <><Loader2 size={13} className="animate-spin" /> …</> : t('projects.saveProject')}
                </button>
                <button
                  onClick={closeEdit}
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
