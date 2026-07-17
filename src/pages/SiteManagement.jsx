import React, { useEffect, useState } from 'react'
import {
  Search, X, Plus, Pencil, CheckCircle2, AlertCircle, Loader2, MapPin,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

function formatDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

const emptyForm = { id: null, name: '', code: '', is_active: true }

export default function SiteManagement() {
  const { t } = useLanguage()

  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [editing,   setEditing]   = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast,     setToast]     = useState(null)

  async function fetchSites() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Sites fetch error:', error)
      setLoadError(t('sites.loadError'))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchSites() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const filtered = rows.filter(r => {
    const statusMatch = statusFilter === 'all'
      || (statusFilter === 'active'   && r.is_active)
      || (statusFilter === 'inactive' && !r.is_active)

    const q = search.trim().toLowerCase()
    const searchMatch = !q ||
      (r.name || '').toLowerCase().includes(q) ||
      (r.code || '').toLowerCase().includes(q)

    return statusMatch && searchMatch
  })

  function openAdd() {
    setForm(emptyForm)
    setSaveError('')
    setEditing(true)
  }

  function openEdit(row) {
    setForm({ id: row.id, name: row.name, code: row.code || '', is_active: row.is_active })
    setSaveError('')
    setEditing(true)
  }

  function closeEdit() {
    setEditing(false)
    setForm(emptyForm)
    setSaveError('')
  }

  async function saveSite() {
    if (!form.name.trim()) { setSaveError(t('sites.nameRequired')); return }

    setSaving(true)
    setSaveError('')

    const payload = {
      name:      form.name.trim(),
      code:      form.code.trim() || null,
      is_active: form.is_active,
    }

    let error
    if (form.id) {
      ({ error } = await supabase.from('sites').update(payload).eq('id', form.id))
    } else {
      ({ error } = await supabase.from('sites').insert(payload))
    }

    setSaving(false)

    if (error) {
      console.error('Site save error:', error)
      if (error.code === '23505') setSaveError(t('sites.duplicateNameError'))
      else setSaveError(t('sites.saveError'))
      return
    }

    await fetchSites()
    showToast(t('sites.siteSaved'))
    closeEdit()
  }

  async function toggleActive(row) {
    const { error } = await supabase
      .from('sites')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)

    if (error) {
      console.error('Site toggle error:', error)
      showToast(t('sites.saveError'), 'error')
      return
    }

    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r))
    showToast(row.is_active ? t('sites.siteDeactivated') : t('sites.siteReactivated'))
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('sites.title')} subtitle={t('sites.subtitle')} />

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
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
                placeholder={t('sites.searchPlaceholder')}
                className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-64"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="all">{t('sites.allStatuses')}</option>
                <option value="active">{t('sites.active')}</option>
                <option value="inactive">{t('sites.inactive')}</option>
              </select>
            </div>

            <button
              onClick={openAdd}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />
              {t('sites.addSite')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[0, 1, 2].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg" />)}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <AlertCircle size={20} className="text-red-400" />
              <p className="text-sm text-slate-500">{loadError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <MapPin size={22} className="text-slate-300" />
              <p className="text-sm text-slate-400">{rows.length === 0 ? t('sites.noSitesYet') : t('sites.noResults')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">{t('sites.colName')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('sites.colCode')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('sites.colStatus')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('sites.colCreated')}</th>
                  <th className="w-40 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.code || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {row.is_active ? t('sites.active') : t('sites.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(row)}
                          title={t('sites.editSite')}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleActive(row)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          {row.is_active ? t('sites.deactivate') : t('sites.reactivate')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 font-display">{form.id ? t('sites.editSite') : t('sites.addSite')}</h2>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('sites.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('sites.code')}</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <label className="text-xs font-medium text-slate-600">{t('sites.active')}</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_active}
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.is_active ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>

              {saveError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={11} /> {saveError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveSite}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? <><Loader2 size={13} className="animate-spin" /> …</> : t('sites.saveSite')}
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
