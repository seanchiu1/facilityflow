import React, { useEffect, useState } from 'react'
import {
  Search, X, Pencil, CheckCircle2, AlertCircle, Loader2, UserCog,
  ShieldAlert, Mail,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const ROLES = ['admin', 'manager', 'staff', 'vendor']

const ROLE_BADGE = {
  admin:   'bg-rose-50 text-rose-700 border-rose-200',
  manager: 'bg-amber-50 text-amber-700 border-amber-200',
  staff:   'bg-blue-50 text-blue-700 border-blue-200',
  vendor:  'bg-violet-50 text-violet-700 border-violet-200',
}

function formatDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-amber-500' : 'bg-slate-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

const emptyForm = {
  id: null, display_name: '', role: 'staff', is_active: true, is_conductor: false,
  vendor_name: '', contact_name: '',
}

export default function AdminUsers() {
  const { t } = useLanguage()
  const { user } = useAuth()

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [editing,  setEditing]  = useState(false)
  const [form,     setForm]     = useState(emptyForm)
  const [saving,   setSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast,    setToast]    = useState(null)

  async function fetchUsers() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin users fetch error:', error)
      setLoadError(t('adminUsers.loadError'))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const filtered = rows.filter(r => {
    const roleMatch   = roleFilter === 'all' || r.role === roleFilter
    const statusMatch = statusFilter === 'all'
      || (statusFilter === 'active'   && r.is_active)
      || (statusFilter === 'inactive' && !r.is_active)

    const q = search.trim().toLowerCase()
    const searchMatch = !q ||
      (r.display_name || '').toLowerCase().includes(q) ||
      (r.email        || '').toLowerCase().includes(q) ||
      (r.vendor_name  || '').toLowerCase().includes(q) ||
      (r.contact_name || '').toLowerCase().includes(q)

    return roleMatch && statusMatch && searchMatch
  })

  function openEdit(row) {
    setForm({
      id:           row.id,
      display_name: row.display_name || '',
      role:         row.role,
      is_active:    row.is_active,
      is_conductor: row.is_conductor,
      vendor_name:  row.vendor_name  || '',
      contact_name: row.contact_name || '',
    })
    setSaveError('')
    setEditing(true)
  }

  function closeEdit() {
    setEditing(false)
    setForm(emptyForm)
    setSaveError('')
  }

  const isSelf = form.id === user?.id

  async function saveUser() {
    setSaving(true)
    setSaveError('')

    const payload = {
      display_name: form.display_name.trim(),
      role:         form.role,
      is_active:    form.is_active,
      is_conductor: form.is_conductor,
      vendor_name:  form.vendor_name.trim()  || null,
      contact_name: form.contact_name.trim() || null,
    }

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', form.id)

    setSaving(false)

    if (error) {
      console.error('Admin user update error:', error)
      setSaveError(t('adminUsers.saveError'))
      return
    }

    setRows(prev => prev.map(r => r.id === form.id ? { ...r, ...payload } : r))
    showToast(t('adminUsers.userUpdated'))
    closeEdit()
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('adminUsers.title')} subtitle={t('adminUsers.subtitle')} />

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Invite helper — account creation itself stays a Supabase Dashboard
            step; no service-role key is ever used from the browser. */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-3">
          <div className="w-9 h-9 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <Mail size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{t('adminUsers.inviteTitle')}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{t('adminUsers.inviteBody')}</p>
          </div>
        </div>

        {/* Filters bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('adminUsers.searchPlaceholder')}
                className="pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-64"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">{t('adminUsers.filterRole')}</label>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="all">{t('adminUsers.allRoles')}</option>
                {ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">{t('adminUsers.filterStatus')}</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="all">{t('adminUsers.allStatuses')}</option>
                <option value="active">{t('adminUsers.active')}</option>
                <option value="inactive">{t('adminUsers.inactive')}</option>
              </select>
            </div>

            <span className="ml-auto text-xs text-slate-400">
              {loading ? t('common.loading') : `${filtered.length}`}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
              <UserCog size={22} className="text-slate-300" />
              <p className="text-sm text-slate-400">{t('adminUsers.noResults')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">{t('adminUsers.colName')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colEmail')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colRole')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colVendor')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colContact')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colStatus')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colConductor')}</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{t('adminUsers.colCreated')}</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(row => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                      onClick={() => openEdit(row)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.display_name} size="xs" />
                          <span className="font-medium text-slate-800">
                            {row.display_name}
                            {row.id === user?.id && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">({t('common.you')})</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500">{row.email || <em className="text-slate-300 not-italic">{t('adminUsers.noEmail')}</em>}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${ROLE_BADGE[row.role] || ROLE_BADGE.staff}`}>
                          {t(`roles.${row.role}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.vendor_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.contact_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {row.is_active ? t('adminUsers.active') : t('adminUsers.deactivated')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {row.is_conductor ? <span className="text-amber-600 font-medium">{t('adminUsers.conductor')}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <Pencil size={13} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{t('adminUsers.editUser')}</h2>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {isSelf && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <ShieldAlert size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{t('adminUsers.selfEditNote')}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('adminUsers.displayName')}</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('adminUsers.colRole')}</label>
                <select
                  value={form.role}
                  disabled={isSelf}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ROLES.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between py-1">
                <label className="text-xs font-medium text-slate-600">{t('adminUsers.active')}</label>
                <Toggle
                  checked={form.is_active}
                  disabled={isSelf}
                  onChange={v => setForm(f => ({ ...f, is_active: v }))}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <label className="text-xs font-medium text-slate-600">{t('adminUsers.conductor')}</label>
                <Toggle
                  checked={form.is_conductor}
                  onChange={v => setForm(f => ({ ...f, is_conductor: v }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('adminUsers.vendorCompany')}</label>
                <input
                  type="text"
                  value={form.vendor_name}
                  onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('adminUsers.contactName')}</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {saveError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={11} /> {saveError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveUser}
                  disabled={saving || !form.display_name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? <><Loader2 size={13} className="animate-spin" /> …</> : t('adminUsers.saveUser')}
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
