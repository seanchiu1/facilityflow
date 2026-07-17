import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Plus, X, Trash2, Loader2, AlertCircle, CheckCircle2,
  MapPin, Calendar, Users, ListChecks, Link2, ChevronRight,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { Avatar } from '../components/ui/Avatar'
import { StatusBadge } from '../components/ui/StatusBadge'
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

const TASK_STATUSES = ['Todo', 'In Progress', 'Blocked', 'Done']
const TASK_STATUS_LABEL_KEYS = {
  'Todo':        'projects.taskStatusTodo',
  'In Progress': 'projects.taskStatusInProgress',
  'Blocked':     'projects.taskStatusBlocked',
  'Done':        'projects.taskStatusDone',
}
const TASK_STATUS_BADGE = {
  'Todo':        'bg-slate-100 text-slate-600',
  'In Progress': 'bg-amber-50 text-amber-700',
  'Blocked':     'bg-red-50 text-red-700',
  'Done':        'bg-emerald-50 text-emerald-700',
}

const emptyProjectForm = {
  name: '', description: '', site_id: '', status: 'Active',
  owner_profile_id: '', start_date: '', target_completion_date: '',
}
const emptyTaskForm = { id: null, title: '', description: '', assignee_profile_id: '', status: 'Todo', due_date: '' }

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'manager'

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [members, setMembers] = useState([])
  const [tasks,   setTasks]   = useState([])
  const [linkedAppointments, setLinkedAppointments] = useState([])

  const [activeSites,      setActiveSites]      = useState([])
  const [internalProfiles, setInternalProfiles] = useState([])

  const [toast, setToast] = useState(null)
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  async function fetchAll() {
    setLoading(true)
    setNotFound(false)

    const { data: projectData, error: projectErr } = await supabase
      .from('projects')
      .select('*, site:sites!site_id(name), owner:profiles!owner_profile_id(display_name)')
      .eq('id', id)
      .single()

    if (projectErr || !projectData) {
      // RLS denies (not a member, not internal) or the row doesn't exist —
      // either way, show the same not-found state rather than leaking which.
      setProject(null)
      setNotFound(true)
      setLoading(false)
      return
    }
    setProject(projectData)

    const [membersRes, tasksRes, apptsRes] = await Promise.all([
      supabase
        .from('project_members')
        .select('id, profile_id, project_role, profile:profiles!profile_id(display_name, role, email)')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('project_tasks')
        .select('id, title, description, assignee_profile_id, status, due_date, assignee:profiles!assignee_profile_id(display_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('appointment_requests')
        .select('id, appointment_code, vendor_name, equipment_type, status, requested_date')
        .eq('project_id', id)
        .order('requested_date', { ascending: false }),
    ])

    setMembers(membersRes.data || [])
    setTasks(tasksRes.data || [])
    setLinkedAppointments(apptsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canManage) return
    supabase.from('sites').select('id, name').eq('is_active', true).order('name')
      .then(({ data, error }) => { if (!error) setActiveSites(data || []) })
    supabase.from('profiles').select('id, display_name, role')
      .in('role', ['admin', 'manager', 'staff']).eq('is_active', true).order('display_name')
      .then(({ data, error }) => { if (!error) setInternalProfiles(data || []) })
  }, [canManage])

  // ── Project summary edit (admin/manager) ────────────────────────────────

  const [editingProject, setEditingProject] = useState(false)
  const [projectForm,    setProjectForm]    = useState(emptyProjectForm)
  const [savingProject,  setSavingProject]  = useState(false)
  const [projectError,   setProjectError]   = useState('')

  function openEditProject() {
    setProjectForm({
      name: project.name || '',
      description: project.description || '',
      site_id: project.site_id || '',
      status: project.status,
      owner_profile_id: project.owner_profile_id || '',
      start_date: project.start_date || '',
      target_completion_date: project.target_completion_date || '',
    })
    setProjectError('')
    setEditingProject(true)
  }

  async function saveProjectEdit() {
    if (!projectForm.name.trim()) { setProjectError(t('projects.nameRequired')); return }
    setSavingProject(true)
    setProjectError('')

    const payload = {
      name: projectForm.name.trim(),
      description: projectForm.description.trim() || null,
      site_id: projectForm.site_id || null,
      status: projectForm.status,
      owner_profile_id: projectForm.owner_profile_id || null,
      start_date: projectForm.start_date || null,
      target_completion_date: projectForm.target_completion_date || null,
    }

    const { error } = await supabase.from('projects').update(payload).eq('id', id)
    setSavingProject(false)

    if (error) {
      console.error('Project update error:', error)
      setProjectError(t('projects.saveError'))
      return
    }

    await fetchAll()
    setEditingProject(false)
    showToast(t('projects.projectSaved'))
  }

  // ── Members (admin/manager) ─────────────────────────────────────────────

  const [newMemberId, setNewMemberId] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  const availableToAdd = internalProfiles.filter(p => !members.some(m => m.profile_id === p.id))

  async function addMember() {
    if (!newMemberId) return
    setSavingMember(true)
    const { error } = await supabase.from('project_members').insert({ project_id: id, profile_id: newMemberId })
    setSavingMember(false)

    if (error) {
      console.error('Add member error:', error)
      showToast(error.code === '23505' ? t('projects.alreadyMember') : t('projects.memberSaveError'), 'error')
      return
    }
    setNewMemberId('')
    await fetchAll()
    showToast(t('projects.memberAdded'))
  }

  async function removeMember(memberRowId) {
    const { error } = await supabase.from('project_members').delete().eq('id', memberRowId)
    if (error) {
      console.error('Remove member error:', error)
      showToast(t('projects.memberSaveError'), 'error')
      return
    }
    setMembers(prev => prev.filter(m => m.id !== memberRowId))
    showToast(t('projects.memberRemoved'))
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  const [editingTask, setEditingTask] = useState(false)
  const [taskForm,    setTaskForm]    = useState(emptyTaskForm)
  const [savingTask,  setSavingTask]  = useState(false)
  const [taskError,   setTaskError]   = useState('')
  const [taskStatusSaving, setTaskStatusSaving] = useState({})

  function openAddTask() {
    setTaskForm(emptyTaskForm)
    setTaskError('')
    setEditingTask(true)
  }

  function openEditTask(task) {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || '',
      assignee_profile_id: task.assignee_profile_id || '',
      status: task.status,
      due_date: task.due_date || '',
    })
    setTaskError('')
    setEditingTask(true)
  }

  async function saveTask() {
    if (!taskForm.title.trim()) { setTaskError(t('projects.titleRequired')); return }
    setSavingTask(true)
    setTaskError('')

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      assignee_profile_id: taskForm.assignee_profile_id || null,
      status: taskForm.status,
      due_date: taskForm.due_date || null,
    }

    let error
    if (taskForm.id) {
      ({ error } = await supabase.from('project_tasks').update(payload).eq('id', taskForm.id))
    } else {
      ({ error } = await supabase.from('project_tasks').insert({ ...payload, project_id: id }))
    }

    setSavingTask(false)

    if (error) {
      console.error('Task save error:', error)
      setTaskError(t('projects.saveError'))
      return
    }

    await fetchAll()
    setEditingTask(false)
    showToast(t('projects.taskSaved'))
  }

  // Inline quick status change — used both by admin/manager (any task) and
  // by a staff member on a task assigned to them. The dropdown itself is
  // only rendered when one of those is true, so there's no dead control
  // shown to someone who can't use it.
  //
  // Admin/manager go through the normal table update, covered by the
  // "admins and managers manage project tasks" policy. A staff member
  // updating their OWN task instead calls update_my_project_task_status() —
  // there is no staff UPDATE policy on project_tasks at all (RLS is
  // row-level, not column-level, so a policy scoped to "your own task"
  // would still let a staff member's browser rewrite title/description/
  // due_date, not just status). The RPC is column-scoped by construction.
  async function quickUpdateTaskStatus(task, newStatus) {
    setTaskStatusSaving(prev => ({ ...prev, [task.id]: true }))

    const { error } = canManage
      ? await supabase.from('project_tasks').update({ status: newStatus }).eq('id', task.id)
      : await supabase.rpc('update_my_project_task_status', { task_id: task.id, new_status: newStatus })

    setTaskStatusSaving(prev => ({ ...prev, [task.id]: false }))

    if (error) {
      console.error('Task status update error:', error)
      showToast(t('projects.saveError'), 'error')
      return
    }
    setTasks(prev => prev.map(tsk => tsk.id === task.id ? { ...tsk, status: newStatus } : tsk))
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        <Topbar title={t('common.loading')} />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-7 bg-slate-100 rounded-lg w-48" />
          <div className="h-40 bg-slate-100 rounded-xl" />
          <div className="h-40 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (notFound || !project) {
    return (
      <div className="flex flex-col flex-1">
        <Topbar title={t('projects.title')} />
        <div className="p-6 text-center py-24">
          <p className="text-slate-500">{t('projects.notFound')}</p>
          <button onClick={() => navigate('/projects')} className="mt-4 text-amber-600 text-sm font-medium">
            {t('projects.backToProjects')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={project.name} subtitle={t('projects.title')} />

      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-5">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} /> {t('projects.backToProjects')}
        </button>

        <div className="grid grid-cols-3 gap-5">
          {/* Left col */}
          <div className="col-span-2 space-y-5">
            {/* Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900 font-display text-lg">{t('projects.summary')}</h2>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE[project.status] || STATUS_BADGE.Planning}`}>
                    {t(STATUS_LABEL_KEYS[project.status] || '') || project.status}
                  </span>
                  {canManage && (
                    <button onClick={openEditProject} className="text-slate-400 hover:text-amber-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>

              {project.description && (
                <p className="text-sm text-slate-600 leading-relaxed mb-4">{project.description}</p>
              )}

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t('roster.site')}</p>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-slate-400" />
                    <span className={project.site?.name ? '' : 'text-slate-400 italic'}>{project.site?.name || t('appointment.notSet')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t('projects.owner')}</p>
                  {project.owner?.display_name ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={project.owner.display_name} size="xs" />
                      <span>{project.owner.display_name}</span>
                    </div>
                  ) : <span className="text-slate-400 italic">{t('appointment.notSet')}</span>}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t('appointment.startDate')}</p>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span className={project.start_date ? '' : 'text-slate-400 italic'}>{project.start_date || t('appointment.notSet')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t('appointment.targetCompletionDate')}</p>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span className={project.target_completion_date ? '' : 'text-slate-400 italic'}>{project.target_completion_date || t('appointment.notSet')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tasks */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ListChecks size={15} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800 font-display">{t('projects.tasks')}</h2>
                </div>
                {canManage && (
                  <button onClick={openAddTask} className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
                    <Plus size={13} /> {t('projects.addTask')}
                  </button>
                )}
              </div>

              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('projects.noTasks')}</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => {
                    const isOwnTask = task.assignee_profile_id === user?.id
                    const canEditStatus = canManage || isOwnTask
                    return (
                      <div key={task.id} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700">{task.title}</p>
                            {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Avatar name={task.assignee?.display_name || '?'} size="xs" />
                                {task.assignee?.display_name || t('projects.unassigned')}
                                {isOwnTask && <span className="text-amber-600 font-medium">· {t('projects.yourTask')}</span>}
                              </span>
                              {task.due_date && (
                                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <Calendar size={10} /> {task.due_date}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {canEditStatus ? (
                              <select
                                value={task.status}
                                disabled={!!taskStatusSaving[task.id]}
                                onChange={e => quickUpdateTaskStatus(task, e.target.value)}
                                className={`text-[11px] font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 ${TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.Todo}`}
                              >
                                {TASK_STATUSES.map(s => <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>)}
                              </select>
                            ) : (
                              <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.Todo}`}>
                                {t(TASK_STATUS_LABEL_KEYS[task.status] || '') || task.status}
                              </span>
                            )}
                            {canManage && (
                              <button onClick={() => openEditTask(task)} className="text-slate-400 hover:text-amber-600 transition-colors">
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Linked appointments */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-1">
                <Link2 size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.linkedAppointments')}</h2>
              </div>
              <p className="text-[11px] text-slate-400 mb-4">{t('projects.linkFromAppointment')}</p>

              {linkedAppointments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('projects.noLinkedAppointments')}</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedAppointments.map(apt => (
                    <div
                      key={apt.id}
                      onClick={() => navigate(`/appointments/${apt.id}`)}
                      className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-amber-50/40 hover:border-amber-200 transition-colors group"
                    >
                      <span className="font-mono text-xs text-slate-400 flex-shrink-0">{apt.appointment_code || apt.id.slice(0, 8)}</span>
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{apt.vendor_name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{apt.equipment_type}</span>
                      <StatusBadge status={apt.status} />
                      <ChevronRight size={13} className="text-slate-300 group-hover:text-amber-500 transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right col: Members */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.members')}</h2>
              </div>

              {members.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">{t('projects.noMembers')}</p>
              ) : (
                <div className="space-y-2.5">
                  {members.map(m => {
                    // The owner's project_members row is kept in sync by a
                    // DB trigger (sync_project_owner_membership) so they can
                    // always see their own project under the same
                    // is_project_member() check every other member relies
                    // on — removing them here would just have the trigger
                    // silently re-add them on the next owner_profile_id
                    // write, so the remove control is disabled instead of
                    // letting that happen invisibly.
                    const isOwner = m.profile_id === project.owner_profile_id
                    return (
                      <div key={m.id} className="flex items-center gap-2.5">
                        <Avatar name={m.profile?.display_name || '?'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-700 truncate">{m.profile?.display_name || '—'}</p>
                            {isOwner && (
                              <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                {t('projects.ownerBadge')}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">{t(`roles.${m.profile?.role}`)}</p>
                        </div>
                        {canManage && !isOwner && (
                          <button
                            onClick={() => removeMember(m.id)}
                            title={t('projects.removeMember')}
                            className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {canManage && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5">
                  <select
                    value={newMemberId}
                    onChange={e => setNewMemberId(e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">{t('projects.selectMember')}</option>
                    {availableToAdd.map(p => (
                      <option key={p.id} value={p.id}>{p.display_name} ({t(`roles.${p.role}`)})</option>
                    ))}
                  </select>
                  <button
                    onClick={addMember}
                    disabled={!newMemberId || savingMember}
                    className="flex items-center justify-center w-8 h-8 flex-shrink-0 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    {savingMember ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit project modal */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{t('projects.editProject')}</h2>
              <button onClick={() => setEditingProject(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.description')}</label>
                <textarea
                  rows={2}
                  value={projectForm.description}
                  onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('roster.site')}</label>
                  <select
                    value={projectForm.site_id}
                    onChange={e => setProjectForm(f => ({ ...f, site_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">{t('appointment.selectSite')}</option>
                    {activeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('common.status')}</label>
                  <select
                    value={projectForm.status}
                    onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.owner')}</label>
                <select
                  value={projectForm.owner_profile_id}
                  onChange={e => setProjectForm(f => ({ ...f, owner_profile_id: e.target.value }))}
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
                    value={projectForm.start_date}
                    onChange={e => setProjectForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('appointment.targetCompletionDate')}</label>
                  <input
                    type="date"
                    value={projectForm.target_completion_date}
                    onChange={e => setProjectForm(f => ({ ...f, target_completion_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {projectError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {projectError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveProjectEdit}
                  disabled={savingProject}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {savingProject ? <><Loader2 size={13} className="animate-spin" /> …</> : t('common.save')}
                </button>
                <button onClick={() => setEditingProject(false)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/edit task modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{taskForm.id ? t('projects.editTask') : t('projects.addTask')}</h2>
              <button onClick={() => setEditingTask(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.taskTitle')}</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.description')}</label>
                <textarea
                  rows={2}
                  value={taskForm.description}
                  onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.assignee')}</label>
                <select
                  value={taskForm.assignee_profile_id}
                  onChange={e => setTaskForm(f => ({ ...f, assignee_profile_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">{t('projects.selectAssignee')}</option>
                  {internalProfiles.map(p => <option key={p.id} value={p.id}>{p.display_name} ({t(`roles.${p.role}`)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('common.status')}</label>
                  <select
                    value={taskForm.status}
                    onChange={e => setTaskForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {TASK_STATUSES.map(s => <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.dueDate')}</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {taskError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {taskError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveTask}
                  disabled={savingTask}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {savingTask ? <><Loader2 size={13} className="animate-spin" /> …</> : t('projects.saveTask')}
                </button>
                <button onClick={() => setEditingTask(false)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
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
