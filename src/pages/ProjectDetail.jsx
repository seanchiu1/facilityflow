import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Plus, X, Trash2, Loader2, AlertCircle, CheckCircle2,
  MapPin, Calendar, Users, ListChecks, Link2, ChevronRight, ChevronDown,
  MessageSquare, History, FolderPlus, RefreshCw, UserPlus, ClipboardList,
  Paperclip, FileText, ExternalLink, Upload, Truck, Share2,
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

// Activity feed rendering: type → localized label + timeline icon. The
// stored `summary` carries the specifics (names/values); the label itself
// is translated at render time so the feed reads correctly in both
// languages regardless of who performed the action.
const ACTIVITY_CONFIG = {
  project_created:     { labelKey: 'projects.activityProjectCreated',     icon: FolderPlus,    color: 'bg-emerald-400' },
  status_changed:      { labelKey: 'projects.activityStatusChanged',      icon: RefreshCw,     color: 'bg-blue-400' },
  member_added:        { labelKey: 'projects.activityMemberAdded',        icon: UserPlus,      color: 'bg-violet-400' },
  task_created:        { labelKey: 'projects.activityTaskCreated',        icon: ListChecks,    color: 'bg-amber-400' },
  task_status_changed: { labelKey: 'projects.activityTaskStatusChanged',  icon: CheckCircle2,  color: 'bg-amber-500' },
  appointment_linked:  { labelKey: 'projects.activityAppointmentLinked',  icon: ClipboardList, color: 'bg-sky-400' },
  document_uploaded:   { labelKey: 'projects.activityDocumentUploaded',  icon: Paperclip,     color: 'bg-teal-400' },
  vendor_task_created:        { labelKey: 'projects.activityVendorTaskCreated',       icon: Truck, color: 'bg-cyan-400' },
  vendor_task_status_changed: { labelKey: 'projects.activityVendorTaskStatusChanged', icon: Truck, color: 'bg-cyan-500' },
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Same accepted types/size limit as appointment document uploads
// (AppointmentDetail.jsx) — kept as an independent constant per this
// codebase's established pattern of small per-file duplication rather
// than a shared utils module.
const DOC_ACCEPTED_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' }
const DOC_MAX_SIZE_MB = 10
const DOC_MAX_SIZE = DOC_MAX_SIZE_MB * 1024 * 1024

const DOCUMENT_CATEGORIES = ['General', 'Drawing', 'Spec', 'Contract', 'Photo', 'Other']
const CATEGORY_LABEL_KEYS = {
  General:  'projects.categoryGeneral',
  Drawing:  'projects.categoryDrawing',
  Spec:     'projects.categorySpec',
  Contract: 'projects.categoryContract',
  Photo:    'projects.categoryPhoto',
  Other:    'projects.categoryOther',
}

const emptyProjectForm = {
  name: '', description: '', site_id: '', status: 'Active',
  owner_profile_id: '', start_date: '', target_completion_date: '',
}
const emptyTaskForm = { id: null, title: '', description: '', assignee_profile_id: '', status: 'Todo', due_date: '' }
const emptyVendorTaskForm = { id: null, vendor_profile_id: '', title: '', description: '', status: 'Todo', due_date: '' }

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
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [documents, setDocuments] = useState([])
  const [docUrls,   setDocUrls]   = useState({})   // { [doc.id]: signedUrl }

  const [activeSites,      setActiveSites]      = useState([])
  const [internalProfiles, setInternalProfiles] = useState([])

  // Vendor Project Access v1a — admin/manager only. vendorMembers is
  // project_vendor_members for THIS project; vendorDirectory is every
  // active vendor profile (id -> {display_name, vendor_name,
  // contact_name}), fetched once via get_vendor_directory() since
  // ordinary profiles SELECT excludes vendor rows for manager (and even
  // for admin, embedding profiles!vendor_profile_id in a project_vendor_
  // members query would depend on RLS resolving per-embedded-row, which
  // is unreliable for manager) — see the migration's §4 comment.
  const [vendorMembers,    setVendorMembers]    = useState([])
  const [vendorDirectory,  setVendorDirectory]  = useState({})
  const [newVendorId,      setNewVendorId]      = useState('')
  const [savingVendor,     setSavingVendor]     = useState(false)
  const [expandedVendorId, setExpandedVendorId] = useState(null)
  const [vendorReplyDraft, setVendorReplyDraft] = useState('')
  const [postingVendorReply, setPostingVendorReply] = useState(false)

  // Vendor Project Tasks v1b — same admin/manager-only gating as the rest
  // of the vendor UI (project_vendor_tasks grants staff DB-level read too,
  // see the migration, but the UI stays admin/manager-only in this pass
  // since staff can't resolve vendor_profile_id to a name anyway — same
  // call already made for the Vendors card and doc-sharing controls).
  const [vendorTasks,       setVendorTasks]       = useState([])
  const [editingVendorTask, setEditingVendorTask] = useState(false)
  const [vendorTaskForm,    setVendorTaskForm]    = useState(emptyVendorTaskForm)
  const [savingVendorTask,  setSavingVendorTask]  = useState(false)
  const [vendorTaskError,   setVendorTaskError]   = useState('')
  const [vendorTaskStatusSaving, setVendorTaskStatusSaving] = useState({})

  const [toast, setToast] = useState(null)
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Fire-and-forget activity logging for admin/manager actions — a failed
  // activity insert never blocks or reports failure for the action it
  // describes (the feed is a convenience, not a transaction log). Staff's
  // own-task status change is logged inside the
  // update_my_project_task_status RPC instead, so this helper is only ever
  // reached from canManage paths, matching the admin/manager-only INSERT
  // policy on project_activity.
  async function logActivity(activityType, summary, metadata = {}) {
    const { data, error } = await supabase
      .from('project_activity')
      .insert({
        project_id: id,
        actor_profile_id: user?.id || null,
        activity_type: activityType,
        summary,
        metadata,
      })
      .select('id, activity_type, summary, created_at, actor:profiles!actor_profile_id(display_name)')
      .single()

    if (error) { console.error('Activity log error (non-fatal):', error); return }
    setActivity(prev => [data, ...prev])
  }

  // Fire-and-forget in-app notification helpers — mirror logActivity's
  // failure model exactly (a failed notification never blocks or reports
  // failure for the action it describes). Both RPCs re-derive their own
  // recipient list/validity server-side rather than trusting the caller,
  // so there's nothing to pre-filter here (see the migration's header for
  // why this is an RPC rather than an INSERT policy).
  async function notifyMember(recipientProfileId, notificationType, title, body, related = {}) {
    const { error } = await supabase.rpc('create_project_notification', {
      p_project_id: id,
      p_recipient_profile_id: recipientProfileId,
      p_notification_type: notificationType,
      p_title: title,
      p_body: body,
      p_related_task_id: related.taskId || null,
      p_related_comment_id: related.commentId || null,
      p_related_document_id: related.documentId || null,
      p_related_appointment_id: related.appointmentId || null,
    })
    if (error) console.error('Notification create error (non-fatal):', error)
  }

  async function notifyMembers(notificationType, title, body, related = {}) {
    const { error } = await supabase.rpc('create_project_notifications_for_members', {
      p_project_id: id,
      p_notification_type: notificationType,
      p_title: title,
      p_body: body,
      p_related_task_id: related.taskId || null,
      p_related_comment_id: related.commentId || null,
      p_related_document_id: related.documentId || null,
      p_related_appointment_id: related.appointmentId || null,
    })
    if (error) console.error('Notification create error (non-fatal):', error)
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

    const [membersRes, tasksRes, apptsRes, commentsRes, activityRes, docsRes] = await Promise.all([
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
      supabase
        .from('project_comments')
        .select('id, body, created_at, visibility, vendor_profile_id, author_display_name, author:profiles!author_profile_id(display_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('project_activity')
        .select('id, activity_type, summary, created_at, actor:profiles!actor_profile_id(display_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('project_documents')
        .select('id, file_name, file_path, file_type, file_size, document_category, created_at, visibility, vendor_profile_id, uploaded_by_display_name, uploader:profiles!uploaded_by(display_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ])

    setMembers(membersRes.data || [])
    setTasks(tasksRes.data || [])
    setLinkedAppointments(apptsRes.data || [])
    setComments(commentsRes.data || [])
    setActivity(activityRes.data || [])
    setDocuments(docsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signed URLs — the bucket is private, so a plain getPublicUrl() would
  // 403. Same pattern as AppointmentDetail.jsx: resolved async into a
  // { [doc.id]: signedUrl } map once the document list is known, valid
  // for 1 hour.
  useEffect(() => {
    if (documents.length === 0) { setDocUrls({}); return }
    let cancelled = false
    Promise.all(
      documents.map(async doc => {
        const { data, error } = await supabase.storage
          .from('appointment-documents')
          .createSignedUrl(doc.file_path, 3600)
        return [doc.id, error ? null : data?.signedUrl]
      })
    ).then(entries => {
      if (cancelled) return
      setDocUrls(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [documents])

  useEffect(() => {
    if (!canManage) return
    supabase.from('sites').select('id, name').eq('is_active', true).order('name')
      .then(({ data, error }) => { if (!error) setActiveSites(data || []) })
    supabase.from('profiles').select('id, display_name, role')
      .in('role', ['admin', 'manager', 'staff']).eq('is_active', true).order('display_name')
      .then(({ data, error }) => { if (!error) setInternalProfiles(data || []) })
  }, [canManage])

  async function fetchVendorTasks() {
    const { data, error } = await supabase
      .from('project_vendor_tasks')
      .select('id, project_id, vendor_profile_id, title, description, status, due_date, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true })
    if (!error) setVendorTasks(data || [])
    else console.error('Vendor tasks fetch error:', error)
  }

  // Vendor roster + directory + tasks — admin/manager only in this UI
  // (project_vendor_members/project_vendor_tasks have no staff SELECT
  // policy for the roster, and get_vendor_directory() raises for
  // non-admin/manager callers). Fetched separately from fetchAll() since
  // it's gated by role, not by the project fetch succeeding.
  useEffect(() => {
    if (!canManage) return
    supabase.from('project_vendor_members').select('id, vendor_profile_id, created_at').eq('project_id', id).order('created_at')
      .then(({ data, error }) => { if (!error) setVendorMembers(data || []); else console.error('Vendor members fetch error:', error) })
    supabase.rpc('get_vendor_directory')
      .then(({ data, error }) => {
        if (error) { console.error('Vendor directory fetch error:', error); return }
        const map = {}
        ;(data || []).forEach(v => { map[v.id] = v })
        setVendorDirectory(map)
      })
    fetchVendorTasks()
  }, [canManage, id]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const oldStatus = project.status

    const { error } = await supabase.from('projects').update(payload).eq('id', id)
    setSavingProject(false)

    if (error) {
      console.error('Project update error:', error)
      setProjectError(t('projects.saveError'))
      return
    }

    if (payload.status !== oldStatus) {
      await logActivity('status_changed', `${oldStatus} → ${payload.status}`, { old_status: oldStatus, new_status: payload.status })
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
    const addedProfile = internalProfiles.find(p => p.id === newMemberId)
    if (addedProfile) {
      await logActivity('member_added', addedProfile.display_name, { profile_id: newMemberId })
      await notifyMember(newMemberId, 'member_added', `${t('notifications.projectMemberAdded')}: ${project.name}`, project.name)
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

  // ── Vendors (admin/manager, Vendor Project Access v1a) ──────────────────
  // Deliberately a SEPARATE table/roster from Members above — vendors are
  // never inserted into project_members, and is_project_vendor() (used by
  // every vendor-scoped policy) is a different check from
  // is_project_member(). See supabase_vendor_project_access_v1a_migration.sql.

  const availableVendorsToAdd = Object.values(vendorDirectory)
    .filter(v => !vendorMembers.some(m => m.vendor_profile_id === v.id))

  async function addVendor() {
    if (!newVendorId) return
    setSavingVendor(true)
    const { data, error } = await supabase
      .from('project_vendor_members')
      .insert({ project_id: id, vendor_profile_id: newVendorId, added_by: user?.id || null })
      .select('id, vendor_profile_id, created_at')
      .single()
    setSavingVendor(false)

    if (error) {
      console.error('Add vendor error:', error)
      showToast(error.code === '23505' ? t('projects.vendorAlreadyMember') : t('projects.vendorSaveError'), 'error')
      return
    }
    setVendorMembers(prev => [...prev, data])
    setNewVendorId('')
    showToast(t('projects.vendorAdded'))
  }

  async function removeVendor(memberRowId) {
    const { error } = await supabase.from('project_vendor_members').delete().eq('id', memberRowId)
    if (error) {
      console.error('Remove vendor error:', error)
      showToast(t('projects.vendorSaveError'), 'error')
      return
    }
    setVendorMembers(prev => prev.filter(v => v.id !== memberRowId))
    if (expandedVendorId === memberRowId) setExpandedVendorId(null)
    showToast(t('projects.vendorRemoved'))
  }

  // Reply into a specific vendor's shared thread. This inserts through the
  // SAME internal INSERT policy on project_comments that postComment()
  // below uses (admin/manager on any project) — the only difference is
  // visibility/vendor_profile_id are set here, tagging the row as part of
  // that vendor's shared thread instead of the internal-only thread.
  async function postVendorReply(vendorProfileId) {
    const body = vendorReplyDraft.trim()
    if (!body || postingVendorReply) return
    setPostingVendorReply(true)

    const { data, error } = await supabase
      .from('project_comments')
      .insert({
        project_id: id,
        author_profile_id: user?.id,
        author_display_name: user?.name || null,
        body,
        visibility: 'shared',
        vendor_profile_id: vendorProfileId,
      })
      .select('id, body, created_at, visibility, vendor_profile_id, author_display_name, author:profiles!author_profile_id(display_name)')
      .single()

    setPostingVendorReply(false)

    if (error) {
      console.error('Vendor reply post error:', error)
      showToast(t('projects.commentError'), 'error')
      return
    }
    setComments(prev => [...prev, data])
    setVendorReplyDraft('')
  }

  // ── Vendor Tasks (admin/manager, Vendor Project Tasks v1b) ──────────────
  // Separate table from project_tasks — never assigned to internal
  // profiles, never touches the internal task RPC. Vendor status changes
  // go through update_my_vendor_project_task_status() instead (called
  // from VendorProjectDetail.jsx, not here — this page never calls it).

  function openAddVendorTask() {
    setVendorTaskForm(emptyVendorTaskForm)
    setVendorTaskError('')
    setEditingVendorTask(true)
  }

  function openEditVendorTask(task) {
    setVendorTaskForm({
      id: task.id,
      vendor_profile_id: task.vendor_profile_id || '',
      title: task.title,
      description: task.description || '',
      status: task.status,
      due_date: task.due_date || '',
    })
    setVendorTaskError('')
    setEditingVendorTask(true)
  }

  async function saveVendorTask() {
    if (!vendorTaskForm.vendor_profile_id) { setVendorTaskError(t('projects.selectVendorRequired')); return }
    if (!vendorTaskForm.title.trim()) { setVendorTaskError(t('projects.titleRequired')); return }
    setSavingVendorTask(true)
    setVendorTaskError('')

    const payload = {
      vendor_profile_id: vendorTaskForm.vendor_profile_id,
      title: vendorTaskForm.title.trim(),
      description: vendorTaskForm.description.trim() || null,
      status: vendorTaskForm.status,
      due_date: vendorTaskForm.due_date || null,
    }

    let error
    if (vendorTaskForm.id) {
      ({ error } = await supabase.from('project_vendor_tasks').update(payload).eq('id', vendorTaskForm.id))
    } else {
      ({ error } = await supabase.from('project_vendor_tasks').insert({ ...payload, project_id: id, created_by: user?.id || null }))
    }

    setSavingVendorTask(false)

    if (error) {
      console.error('Vendor task save error:', error)
      setVendorTaskError(t('projects.saveError'))
      return
    }

    if (vendorTaskForm.id) {
      // Edit path: only log if the status actually changed — matches the
      // internal task edit's same "don't flood the feed" rule.
      const previous = vendorTasks.find(vt => vt.id === vendorTaskForm.id)
      if (previous && previous.status !== payload.status) {
        await logActivity('vendor_task_status_changed', `${payload.title} → ${payload.status}`, { task_id: vendorTaskForm.id, new_status: payload.status })
      }
    } else {
      await logActivity('vendor_task_created', payload.title, { vendor_profile_id: payload.vendor_profile_id })
    }

    await fetchVendorTasks()
    setEditingVendorTask(false)
    showToast(t('projects.taskSaved'))
  }

  // Inline quick status change — admin/manager only (a vendor's own status
  // change happens on VendorProjectDetail.jsx via the RPC, never here).
  async function quickUpdateVendorTaskStatus(task, newStatus) {
    setVendorTaskStatusSaving(prev => ({ ...prev, [task.id]: true }))
    const { error } = await supabase.from('project_vendor_tasks').update({ status: newStatus }).eq('id', task.id)
    setVendorTaskStatusSaving(prev => ({ ...prev, [task.id]: false }))

    if (error) {
      console.error('Vendor task status update error:', error)
      showToast(t('projects.saveError'), 'error')
      return
    }
    setVendorTasks(prev => prev.map(vt => vt.id === task.id ? { ...vt, status: newStatus } : vt))
    await logActivity('vendor_task_status_changed', `${task.title} → ${newStatus}`, { task_id: task.id, new_status: newStatus })
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
    let newTaskId = taskForm.id
    if (taskForm.id) {
      ({ error } = await supabase.from('project_tasks').update(payload).eq('id', taskForm.id))
    } else {
      const insertRes = await supabase.from('project_tasks').insert({ ...payload, project_id: id }).select('id').single()
      error = insertRes.error
      newTaskId = insertRes.data?.id || null
    }

    setSavingTask(false)

    if (error) {
      console.error('Task save error:', error)
      setTaskError(t('projects.saveError'))
      return
    }

    if (taskForm.id) {
      // Edit path: only log/notify if the status actually changed — routine
      // title/description tweaks would otherwise flood the feed/inbox.
      const previous = tasks.find(tsk => tsk.id === taskForm.id)
      if (previous && previous.status !== payload.status) {
        await logActivity('task_status_changed', `${payload.title} → ${payload.status}`, { task_id: taskForm.id, new_status: payload.status })
        await notifyMembers('task_status_changed', `${t('notifications.projectTaskStatusChanged')}: ${payload.title}`, `${payload.title} → ${payload.status}`, { taskId: taskForm.id })
      }
      // Reassignment — notify the new assignee only if it actually changed.
      if (previous && previous.assignee_profile_id !== payload.assignee_profile_id && payload.assignee_profile_id) {
        await notifyMember(payload.assignee_profile_id, 'task_assigned', `${t('notifications.projectTaskAssigned')}: ${payload.title}`, payload.title, { taskId: taskForm.id })
      }
    } else {
      await logActivity('task_created', payload.title, {})
      if (payload.assignee_profile_id && newTaskId) {
        await notifyMember(payload.assignee_profile_id, 'task_assigned', `${t('notifications.projectTaskAssigned')}: ${payload.title}`, payload.title, { taskId: newTaskId })
      }
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

    // Notification fan-out is not embedded in update_my_project_task_status()
    // (unlike activity logging) — it's called uniformly from here for both
    // paths, since create_project_notifications_for_members() independently
    // re-validates the caller's project access regardless of who calls it.
    await notifyMembers('task_status_changed', `${t('notifications.projectTaskStatusChanged')}: ${task.title}`, `${task.title} → ${newStatus}`, { taskId: task.id })

    if (canManage) {
      // Manager path logs from the frontend; the staff/RPC path already
      // logged inside update_my_project_task_status() atomically — logging
      // here too would double-count it, so only re-fetch the feed instead.
      await logActivity('task_status_changed', `${task.title} → ${newStatus}`, { task_id: task.id, new_status: newStatus })
    } else {
      const { data } = await supabase
        .from('project_activity')
        .select('id, activity_type, summary, created_at, actor:profiles!actor_profile_id(display_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setActivity(data)
    }
  }

  // ── Comments ────────────────────────────────────────────────────────────

  const [commentDraft,   setCommentDraft]   = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [commentError,   setCommentError]   = useState('')

  // Staff can only comment on projects they belong to (mirrors the RLS
  // INSERT policy). Non-member staff can't reach this page anyway — the
  // project fetch RLS-denies into the not-found state — so this is
  // belt-and-suspenders for the UI, not the enforcement.
  const isMember = members.some(m => m.profile_id === user?.id)
  const canComment = canManage || isMember

  // The Comments card below shows the internal-only thread. Shared
  // (per-vendor) comments live in the SAME table/query result but render
  // inside each vendor's own expandable thread in the Vendors card
  // instead — never merged into this list, so a vendor's messages never
  // appear mixed in with internal-only discussion.
  const internalComments = comments.filter(c => c.visibility !== 'shared')

  async function postComment() {
    const body = commentDraft.trim()
    if (!body || postingComment) return
    setPostingComment(true)
    setCommentError('')

    const { data, error } = await supabase
      .from('project_comments')
      .insert({ project_id: id, author_profile_id: user?.id, body })
      .select('id, body, created_at, author:profiles!author_profile_id(display_name)')
      .single()

    setPostingComment(false)

    if (error) {
      console.error('Comment post error:', error)
      setCommentError(t('projects.commentError'))
      return
    }

    setComments(prev => [...prev, data])
    setCommentDraft('')
    await notifyMembers('comment_added', t('notifications.projectCommentAdded'), body.slice(0, 140), { commentId: data.id })
  }

  // ── Documents ────────────────────────────────────────────────────────────
  // Upload is allowed for the same set of people who can comment: admin/
  // manager on any project, staff on projects they're a member of —
  // matches project_documents' INSERT policy exactly (canComment is
  // computed just above from the same isMember check).

  const [showDocUpload, setShowDocUpload] = useState(false)
  const [docCategory,   setDocCategory]   = useState('General')
  const [docFiles,      setDocFiles]      = useState([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [docUploadError, setDocUploadError] = useState('')
  // Sharing controls — admin/manager only (the vendor picker only ever
  // lists this project's OWN vendor roster, never the full directory, so
  // a share can't target a vendor who isn't actually on this project).
  const [docVisibility,     setDocVisibility]     = useState('internal')
  const [docShareVendorId,  setDocShareVendorId]  = useState('')

  function handleDocFileSelect(rawFiles) {
    const errs = []
    const valid = []
    Array.from(rawFiles).forEach(f => {
      if (!DOC_ACCEPTED_TYPES[f.type]) errs.push(`${f.name}: ${t('appointment.unsupportedFileType')}`)
      else if (f.size > DOC_MAX_SIZE)  errs.push(`${f.name}: ${t('appointment.exceedsFileSize')} (${DOC_MAX_SIZE_MB} MB)`)
      else                             valid.push(f)
    })
    if (valid.length > 0) setDocFiles(prev => [...prev, ...valid])
    setDocUploadError(errs.length > 0 ? errs.join(' · ') : '')
  }

  async function uploadDocs() {
    if (docFiles.length === 0) return
    if (docVisibility === 'vendor' && !docShareVendorId) {
      setDocUploadError(t('projects.selectVendorToShare'))
      return
    }
    setUploadingDocs(true)
    setDocUploadError('')

    const failedNames = []
    const inserted = []

    for (const file of docFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      // Internal docs stay namespaced under projects/ (unchanged from
      // before). Vendor-shared docs go under vendor-projects/{project}/
      // {vendor}/... instead — the exact prefix the vendor storage
      // policies and the project_documents visibility/path CHECK
      // constraint require (supabase_vendor_project_access_v1a_migration.sql
      // §5/§7). Neither prefix is ever readable by a vendor NOT named in
      // the path, and internal-role storage policies already cover both
      // (bucket-wide, no path condition) — no storage changes needed here.
      const filePath = docVisibility === 'vendor'
        ? `vendor-projects/${id}/${docShareVendorId}/${Date.now()}-${safeName}`
        : `projects/${id}/${Date.now()}-${safeName}`

      const { error: upErr } = await supabase.storage
        .from('appointment-documents')
        .upload(filePath, file)

      if (upErr) { failedNames.push(file.name); continue }

      const { data: docRow, error: insErr } = await supabase
        .from('project_documents')
        .insert({
          project_id: id,
          uploaded_by: user?.id || null,
          uploaded_by_display_name: user?.name || null,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          document_category: docCategory,
          visibility: docVisibility,
          vendor_profile_id: docVisibility === 'vendor' ? docShareVendorId : null,
        })
        .select('id, file_name, file_path, file_type, file_size, document_category, created_at, visibility, vendor_profile_id, uploaded_by_display_name, uploader:profiles!uploaded_by(display_name)')
        .single()

      if (insErr || !docRow) { failedNames.push(file.name); continue }
      inserted.push(docRow)
    }

    if (inserted.length > 0) {
      setDocuments(prev => [...inserted, ...prev])
      const fileNames = inserted.map(d => d.file_name).join(', ')
      await logActivity('document_uploaded', fileNames, { count: inserted.length })
      // Multiple files in one batch still produce a single notification
      // (not one per file) to avoid flooding the recipient's inbox;
      // related_document_id points at the first uploaded file.
      await notifyMembers('document_uploaded', t('notifications.projectDocumentUploaded'), fileNames, { documentId: inserted[0].id })
    }

    if (failedNames.length > 0) {
      setDocUploadError(`${t('appointment.uploadFailedPrefix')} ${failedNames.join(', ')}`)
    } else {
      setDocFiles([])
      setShowDocUpload(false)
      setDocVisibility('internal')
      setDocShareVendorId('')
    }
    setUploadingDocs(false)
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

            {/* Vendor Tasks — admin/manager only (Vendor Project Tasks v1b).
                Separate table/list from Tasks above: assigned to a vendor
                via project_vendor_tasks, never to an internal profile. */}
            {canManage && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Truck size={15} className="text-slate-400" />
                    <h2 className="font-semibold text-slate-800 font-display">{t('projects.vendorTasks')}</h2>
                  </div>
                  <button onClick={openAddVendorTask} className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
                    <Plus size={13} /> {t('projects.addVendorTask')}
                  </button>
                </div>

                {vendorTasks.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">{t('projects.noVendorTasks')}</p>
                ) : (
                  <div className="space-y-2">
                    {vendorTasks.map(task => {
                      const dir = vendorDirectory[task.vendor_profile_id]
                      const vendorLabel = dir?.vendor_name || dir?.display_name || task.vendor_profile_id?.slice(0, 8)
                      return (
                        <div key={task.id} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-700">{task.title}</p>
                              {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <Avatar name={vendorLabel || '?'} size="xs" />
                                  {vendorLabel}
                                </span>
                                {task.due_date && (
                                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Calendar size={10} /> {task.due_date}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <select
                                value={task.status}
                                disabled={!!vendorTaskStatusSaving[task.id]}
                                onChange={e => quickUpdateVendorTaskStatus(task, e.target.value)}
                                className={`text-[11px] font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 ${TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.Todo}`}
                              >
                                {TASK_STATUSES.map(s => <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>)}
                              </select>
                              <button onClick={() => openEditVendorTask(task)} className="text-slate-400 hover:text-amber-600 transition-colors">
                                <Pencil size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Paperclip size={15} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800 font-display">{t('projects.documents')}</h2>
                  <span className="text-xs text-slate-400">{documents.length}</span>
                </div>
                {canComment && !showDocUpload && (
                  <button onClick={() => setShowDocUpload(true)} className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
                    <Upload size={13} /> {t('projects.uploadDocument')}
                  </button>
                )}
              </div>

              {documents.length === 0 && !showDocUpload ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('projects.noDocuments')}</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => {
                    const signedUrl = docUrls[doc.id]
                    const resolving = !(doc.id in docUrls)
                    return (
                      <div key={doc.id} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <a
                            href={signedUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-disabled={!signedUrl}
                            onClick={e => { if (!signedUrl) e.preventDefault() }}
                            className={`flex items-center gap-3 flex-1 min-w-0 group ${signedUrl ? '' : 'opacity-60 cursor-not-allowed'}`}
                          >
                            <div className="w-7 h-7 bg-slate-200 group-hover:bg-amber-100 rounded flex items-center justify-center flex-shrink-0 transition-colors">
                              <FileText size={13} className="text-slate-500 group-hover:text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium text-slate-700 group-hover:text-amber-700 truncate transition-colors">{doc.file_name}</p>
                                {doc.visibility === 'vendor' && (
                                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
                                    <Share2 size={9} />
                                    {vendorDirectory[doc.vendor_profile_id]?.vendor_name || vendorDirectory[doc.vendor_profile_id]?.display_name || t('projects.sharedWithVendor')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {t(CATEGORY_LABEL_KEYS[doc.document_category] || '') || doc.document_category}
                                {doc.file_size > 0 ? ` · ${formatFileSize(doc.file_size)}` : ''}
                                {' · '}{t('projects.uploadedBy')} {doc.uploader?.display_name || doc.uploaded_by_display_name || '—'}
                                {' · '}{(doc.created_at || '').slice(0, 10)}
                              </p>
                              {resolving && <p className="text-[10px] text-slate-400">{t('projects.loadingLink')}</p>}
                              {!resolving && !signedUrl && <p className="text-[10px] text-red-500">{t('projects.linkUnavailable')}</p>}
                            </div>
                          </a>
                          <ExternalLink size={12} className="text-slate-300 flex-shrink-0" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {showDocUpload && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={docCategory}
                      onChange={e => setDocCategory(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {DOCUMENT_CATEGORIES.map(c => (
                        <option key={c} value={c}>{t(CATEGORY_LABEL_KEYS[c])}</option>
                      ))}
                    </select>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      onChange={e => { handleDocFileSelect(e.target.files); e.target.value = '' }}
                      className="text-xs flex-1"
                    />
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <select
                        value={docVisibility}
                        onChange={e => { setDocVisibility(e.target.value); setDocShareVendorId('') }}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="internal">{t('projects.visibilityInternal')}</option>
                        <option value="vendor">{t('projects.visibilityVendor')}</option>
                      </select>
                      {docVisibility === 'vendor' && (
                        <select
                          value={docShareVendorId}
                          onChange={e => setDocShareVendorId(e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="">{t('projects.selectVendor')}</option>
                          {vendorMembers.map(m => (
                            <option key={m.vendor_profile_id} value={m.vendor_profile_id}>
                              {vendorDirectory[m.vendor_profile_id]?.vendor_name || vendorDirectory[m.vendor_profile_id]?.display_name || m.vendor_profile_id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {docFiles.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      {docFiles.length} file{docFiles.length !== 1 ? 's' : ''}: {docFiles.map(f => f.name).join(', ')}
                    </p>
                  )}
                  {docUploadError && <p className="text-[11px] text-red-500">{docUploadError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={uploadDocs}
                      disabled={uploadingDocs || docFiles.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {uploadingDocs ? <><Loader2 size={12} className="animate-spin" /> {t('projects.uploading')}</> : t('projects.uploadDocument')}
                    </button>
                    <button
                      onClick={() => { setShowDocUpload(false); setDocFiles([]); setDocUploadError('') }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
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

            {/* Comments */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.comments')}</h2>
                <span className="ml-auto text-xs text-slate-400">{internalComments.length}</span>
              </div>

              {internalComments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('projects.noComments')}</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {internalComments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar name={c.author?.display_name || '?'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-xs font-semibold text-slate-700">{c.author?.display_name || '—'}</p>
                          <p className="text-[10px] text-slate-400">{(c.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canComment && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      value={commentDraft}
                      onChange={e => { setCommentDraft(e.target.value); setCommentError('') }}
                      placeholder={t('projects.commentPlaceholder')}
                      className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      onClick={postComment}
                      disabled={!commentDraft.trim() || postingComment}
                      className="self-end flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-xl transition-colors flex-shrink-0"
                    >
                      {postingComment ? <Loader2 size={13} className="animate-spin" /> : t('projects.postComment')}
                    </button>
                  </div>
                  {commentError && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={11} /> {commentError}
                    </p>
                  )}
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

            {/* Vendors — admin/manager only (Vendor Project Access v1a).
                Separate from Members above: adding someone here inserts
                into project_vendor_members, never project_members, and
                grants only the narrow vendor-scoped access described in
                supabase_vendor_project_access_v1a_migration.sql. */}
            {canManage && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Truck size={15} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800 font-display">{t('projects.vendors')}</h2>
                </div>

                {vendorMembers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">{t('projects.noVendors')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {vendorMembers.map(vm => {
                      const dir = vendorDirectory[vm.vendor_profile_id]
                      const vendorLabel = dir?.vendor_name || dir?.display_name || vm.vendor_profile_id.slice(0, 8)
                      const isExpanded = expandedVendorId === vm.id
                      const thread = comments.filter(c => c.visibility === 'shared' && c.vendor_profile_id === vm.vendor_profile_id)
                      return (
                        <div key={vm.id} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2.5 px-2.5 py-2">
                            <Avatar name={vendorLabel} size="sm" />
                            <button
                              onClick={() => setExpandedVendorId(isExpanded ? null : vm.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-sm font-medium text-slate-700 truncate">{vendorLabel}</p>
                              {dir?.contact_name && <p className="text-[10px] text-slate-400 truncate">{dir.contact_name}</p>}
                            </button>
                            <button
                              onClick={() => setExpandedVendorId(isExpanded ? null : vm.id)}
                              className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <button
                              onClick={() => removeVendor(vm.id)}
                              title={t('projects.removeVendor')}
                              className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('projects.sharedThread')}</p>
                              {thread.length === 0 ? (
                                <p className="text-xs text-slate-400 py-2">{t('projects.noComments')}</p>
                              ) : (
                                <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                                  {thread.map(c => (
                                    <div key={c.id} className="text-xs">
                                      <div className="flex items-baseline gap-1.5">
                                        <p className="font-semibold text-slate-700">{c.author_display_name || c.author?.display_name || '—'}</p>
                                        <p className="text-[9px] text-slate-400">{(c.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                                      </div>
                                      <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-1.5 pt-1">
                                <textarea
                                  rows={1}
                                  value={vendorReplyDraft}
                                  onChange={e => setVendorReplyDraft(e.target.value)}
                                  placeholder={t('projects.commentPlaceholder')}
                                  className="flex-1 resize-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <button
                                  onClick={() => postVendorReply(vm.vendor_profile_id)}
                                  disabled={!vendorReplyDraft.trim() || postingVendorReply}
                                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-[11px] font-medium rounded-lg transition-colors flex-shrink-0"
                                >
                                  {postingVendorReply ? <Loader2 size={11} className="animate-spin" /> : t('projects.postComment')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5">
                  <select
                    value={newVendorId}
                    onChange={e => setNewVendorId(e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">{t('projects.selectVendor')}</option>
                    {availableVendorsToAdd.map(v => (
                      <option key={v.id} value={v.id}>{v.vendor_name || v.display_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={addVendor}
                    disabled={!newVendorId || savingVendor}
                    className="flex items-center justify-center w-8 h-8 flex-shrink-0 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    {savingVendor ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  </button>
                </div>
              </div>
            )}

            {/* Activity timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <History size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.activity')}</h2>
              </div>

              {activity.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">{t('projects.noActivity')}</p>
              ) : (
                <div className="space-y-0 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                  {activity.map((a, i) => {
                    const cfg = ACTIVITY_CONFIG[a.activity_type] || ACTIVITY_CONFIG.project_created
                    const Icon = cfg.icon
                    const isLast = i === activity.length - 1
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full ${cfg.color} flex items-center justify-center flex-shrink-0 z-10`}>
                            <Icon size={11} className="text-white" />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-slate-200 my-0.5" />}
                        </div>
                        <div className="pb-4 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{t(cfg.labelKey)}</p>
                          <p className="text-xs text-slate-500 mt-0.5 break-words">{a.summary}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {a.actor?.display_name ? `${a.actor.display_name} · ` : ''}{(a.created_at || '').slice(0, 16).replace('T', ' ')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
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

      {/* Add/edit vendor task modal */}
      {editingVendorTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-800 font-display">{vendorTaskForm.id ? t('projects.editVendorTask') : t('projects.addVendorTask')}</h2>
              <button onClick={() => setEditingVendorTask(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.vendor')}</label>
                <select
                  value={vendorTaskForm.vendor_profile_id}
                  onChange={e => setVendorTaskForm(f => ({ ...f, vendor_profile_id: e.target.value }))}
                  disabled={!!vendorTaskForm.id}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:bg-slate-50"
                >
                  <option value="">{t('projects.selectVendor')}</option>
                  {vendorMembers.map(m => {
                    const dir = vendorDirectory[m.vendor_profile_id]
                    return (
                      <option key={m.vendor_profile_id} value={m.vendor_profile_id}>
                        {dir?.vendor_name || dir?.display_name || m.vendor_profile_id.slice(0, 8)}
                      </option>
                    )
                  })}
                </select>
                {vendorMembers.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">{t('projects.noVendorsToAssign')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.taskTitle')}</label>
                <input
                  type="text"
                  value={vendorTaskForm.title}
                  onChange={e => setVendorTaskForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.description')}</label>
                <textarea
                  rows={2}
                  value={vendorTaskForm.description}
                  onChange={e => setVendorTaskForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('common.status')}</label>
                  <select
                    value={vendorTaskForm.status}
                    onChange={e => setVendorTaskForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {TASK_STATUSES.map(s => <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('projects.dueDate')}</label>
                  <input
                    type="date"
                    value={vendorTaskForm.due_date}
                    onChange={e => setVendorTaskForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {vendorTaskError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {vendorTaskError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveVendorTask}
                  disabled={savingVendorTask}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {savingVendorTask ? <><Loader2 size={13} className="animate-spin" /> …</> : t('projects.saveTask')}
                </button>
                <button onClick={() => setEditingVendorTask(false)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
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
