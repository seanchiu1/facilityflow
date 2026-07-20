import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Calendar, Link2, ChevronRight, MessageSquare,
  Paperclip, FileText, ExternalLink, Upload, Loader2, AlertCircle, CheckCircle2,
  ListChecks,
} from 'lucide-react'
import Topbar from '../components/layout/Topbar'
import { Avatar } from '../components/ui/Avatar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useAuth } from '../context/AuthContext'
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

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Same accepted types/size limit as every other upload path in this app
// (AppointmentDetail.jsx, ProjectDetail.jsx) — independent constant per
// this codebase's established per-file duplication convention.
const DOC_ACCEPTED_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' }
const DOC_MAX_SIZE_MB = 10
const DOC_MAX_SIZE = DOC_MAX_SIZE_MB * 1024 * 1024

// Separate page, not a conditional branch inside the internal
// ProjectDetail.jsx — see VendorProjects.jsx for why. Every read here
// either goes through a SECURITY DEFINER RPC (project summary) or a plain
// table query that RLS narrows down to exactly this vendor's own rows
// (documents/comments scoped by vendor_profile_id = auth.uid(), linked
// appointments scoped by vendor_user_id = auth.uid()) — there is no
// internal-only data path reachable from this component at all.
export default function VendorProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()

  const [project,  setProject]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [documents, setDocuments] = useState([])
  const [docUrls,   setDocUrls]   = useState({})
  const [comments,  setComments]  = useState([])
  const [linkedAppointments, setLinkedAppointments] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskStatusSaving, setTaskStatusSaving] = useState({})

  const [toast, setToast] = useState(null)
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  async function fetchAll() {
    setLoading(true)
    setNotFound(false)

    const { data: projectRows, error: projectErr } = await supabase.rpc('get_my_vendor_project', { p_project_id: id })

    if (projectErr || !projectRows || projectRows.length === 0) {
      setProject(null)
      setNotFound(true)
      setLoading(false)
      return
    }
    setProject(projectRows[0])

    const [docsRes, commentsRes, apptsRes, tasksRes] = await Promise.all([
      supabase
        .from('project_documents')
        .select('id, file_name, file_path, file_type, file_size, document_category, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_comments')
        .select('id, body, created_at, author_display_name')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('appointment_requests')
        .select('id, appointment_code, equipment_type, status, requested_date')
        .eq('project_id', id)
        .order('requested_date', { ascending: false }),
      supabase
        .from('project_vendor_tasks')
        .select('id, title, description, status, due_date, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
    ])

    setDocuments(docsRes.data || [])
    setComments(commentsRes.data || [])
    setLinkedAppointments(apptsRes.data || [])
    setTasks(tasksRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signed URLs — same pattern as AppointmentDetail.jsx/ProjectDetail.jsx.
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

  // ── Documents ────────────────────────────────────────────────────────────

  const [showDocUpload, setShowDocUpload] = useState(false)
  const [docFiles,      setDocFiles]      = useState([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [docUploadError, setDocUploadError] = useState('')

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
    setUploadingDocs(true)
    setDocUploadError('')

    const failedNames = []
    const inserted = []

    for (const file of docFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      // vendor-projects/{project_id}/{vendor_profile_id}/... — the exact
      // prefix the storage + project_documents RLS policies match against
      // (supabase_vendor_project_access_v1a_migration.sql §5/§7). Any
      // other path is rejected by both the storage policy and the table's
      // visibility/path CHECK constraint.
      const filePath = `vendor-projects/${id}/${user.id}/${Date.now()}-${safeName}`

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
          document_category: 'General',
          visibility: 'vendor',
          vendor_profile_id: user?.id || null,
        })
        .select('id, file_name, file_path, file_type, file_size, document_category, created_at')
        .single()

      if (insErr || !docRow) { failedNames.push(file.name); continue }
      inserted.push(docRow)
    }

    if (inserted.length > 0) {
      setDocuments(prev => [...inserted, ...prev])
    }

    if (failedNames.length > 0) {
      setDocUploadError(`${t('appointment.uploadFailedPrefix')} ${failedNames.join(', ')}`)
    } else {
      setDocFiles([])
      setShowDocUpload(false)
    }
    setUploadingDocs(false)
  }

  // ── Comments ────────────────────────────────────────────────────────────

  const [commentDraft,   setCommentDraft]   = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [commentError,   setCommentError]   = useState('')

  async function postComment() {
    const body = commentDraft.trim()
    if (!body || postingComment) return
    setPostingComment(true)
    setCommentError('')

    const { data, error } = await supabase
      .from('project_comments')
      .insert({
        project_id: id,
        author_profile_id: user?.id,
        author_display_name: user?.name || null,
        body,
        visibility: 'shared',
        vendor_profile_id: user?.id,
      })
      .select('id, body, created_at, author_display_name')
      .single()

    setPostingComment(false)

    if (error) {
      console.error('Comment post error:', error)
      setCommentError(t('projects.commentError'))
      return
    }

    setComments(prev => [...prev, data])
    setCommentDraft('')
  }

  // ── My Tasks ─────────────────────────────────────────────────────────────
  // Status-only, via RPC — there is no UPDATE policy on project_vendor_tasks
  // for vendors at all, so this RPC is the ONLY write path this page has.
  // Title/description/due date are admin/manager-set and read-only here.
  async function updateTaskStatus(task, newStatus) {
    setTaskStatusSaving(prev => ({ ...prev, [task.id]: true }))
    const { error } = await supabase.rpc('update_my_vendor_project_task_status', { task_id: task.id, new_status: newStatus })
    setTaskStatusSaving(prev => ({ ...prev, [task.id]: false }))

    if (error) {
      console.error('Vendor task status update error:', error)
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
        <Topbar title={t('vendorProjects.title')} />
        <div className="p-6 text-center py-24">
          <p className="text-slate-500">{t('projects.notFound')}</p>
          <button onClick={() => navigate('/vendor-projects')} className="mt-4 text-amber-600 text-sm font-medium">
            {t('vendorProjects.backToProjects')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={project.name} subtitle={t('vendorProjects.title')} />

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
          onClick={() => navigate('/vendor-projects')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={15} /> {t('vendorProjects.backToProjects')}
        </button>

        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            {/* Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900 font-display text-lg">{t('projects.summary')}</h2>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE[project.status] || STATUS_BADGE.Planning}`}>
                  {t(STATUS_LABEL_KEYS[project.status] || '') || project.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t('roster.site')}</p>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-slate-400" />
                    <span className={project.site_name ? '' : 'text-slate-400 italic'}>{project.site_name || t('appointment.notSet')}</span>
                  </div>
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

            {/* My Tasks — status-only via RPC; title/description/due date
                are set by the internal team and read-only here. */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ListChecks size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.myTasks')}</h2>
                <span className="text-xs text-slate-400">{tasks.length}</span>
              </div>

              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('projects.noVendorTasks')}</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700">{task.title}</p>
                          {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                          {task.due_date && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-1.5">
                              <Calendar size={10} /> {task.due_date}
                            </span>
                          )}
                        </div>
                        <select
                          value={task.status}
                          disabled={!!taskStatusSaving[task.id]}
                          onChange={e => updateTaskStatus(task, e.target.value)}
                          className={`text-[11px] font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 flex-shrink-0 ${TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.Todo}`}
                        >
                          {TASK_STATUSES.map(s => <option key={s} value={s}>{t(TASK_STATUS_LABEL_KEYS[s])}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Paperclip size={15} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800 font-display">{t('projects.documents')}</h2>
                  <span className="text-xs text-slate-400">{documents.length}</span>
                </div>
                {!showDocUpload && (
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
                              <p className="text-xs font-medium text-slate-700 group-hover:text-amber-700 truncate transition-colors">{doc.file_name}</p>
                              <p className="text-[10px] text-slate-400">
                                {doc.file_size > 0 ? `${formatFileSize(doc.file_size)} · ` : ''}{(doc.created_at || '').slice(0, 10)}
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
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    onChange={e => { handleDocFileSelect(e.target.files); e.target.value = '' }}
                    className="text-xs w-full"
                  />
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

            {/* Linked appointments (own only, via existing vendor RLS) */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Link2 size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.linkedAppointments')}</h2>
              </div>

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
                      <span className="text-xs text-slate-400 flex-shrink-0">{apt.equipment_type}</span>
                      <span className="flex-1" />
                      <StatusBadge status={apt.status} />
                      <ChevronRight size={13} className="text-slate-300 group-hover:text-amber-500 transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right col: shared thread */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('projects.comments')}</h2>
                <span className="ml-auto text-xs text-slate-400">{comments.length}</span>
              </div>

              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">{t('projects.noComments')}</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-1">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar name={c.author_display_name || '?'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-xs font-semibold text-slate-700">{c.author_display_name || '—'}</p>
                          <p className="text-[10px] text-slate-400">{(c.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
