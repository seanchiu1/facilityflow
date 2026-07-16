import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Clock, Calendar, AlertTriangle,
  CheckCircle2, PlayCircle, Pause, XCircle, AlertCircle, ChevronRight,
  Building2, StickyNote, Paperclip, FileText, ExternalLink, Upload, Loader2,
} from 'lucide-react'

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACCEPTED_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' }
const MAX_SIZE_MB = 10
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024

const DOC_TYPE_LABEL_KEYS = {
  supporting_doc:     'appointment.supportingDocument',
  maintenance_report: 'appointment.maintenanceReport',
}

const APPROVAL_LABEL_KEYS = {
  pending:  'appointment.pendingReview',
  approved: 'common.approved',
  rejected: 'appointment.rejected',
}

const APPROVAL_BADGE_CLASSES = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}
import Topbar from '../components/layout/Topbar'
import { StatusBadge, PriorityBadge } from '../components/ui/StatusBadge'
import { Avatar } from '../components/ui/Avatar'
import { MessageThread } from '../components/MessageThread'
import { supabase } from '../lib/supabaseClient'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { recordStatusChange } from '../lib/statusHistory'


const STATUS_ACTIONS = [
  { status: 'Scheduled',    icon: Calendar,     color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
  { status: 'In Progress',  icon: PlayCircle,   color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
  { status: '50% Finished', icon: Pause,        color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { status: 'Finished',     icon: CheckCircle2, color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' },
  { status: 'Delayed',      icon: AlertCircle,  color: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' },
  { status: 'Cancelled',    icon: XCircle,      color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' },
]

const STATUS_LABEL_KEYS = {
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

const TIMELINE_ICONS = {
  Pending:          { color: 'bg-slate-300',   icon: Clock },
  Approved:         { color: 'bg-emerald-400', icon: CheckCircle2 },
  Scheduled:        { color: 'bg-blue-400',    icon: Calendar },
  'In Progress':    { color: 'bg-amber-400',   icon: PlayCircle },
  '50% Finished':   { color: 'bg-orange-400',  icon: Pause },
  Finished:         { color: 'bg-emerald-600', icon: CheckCircle2 },
  Cancelled:        { color: 'bg-red-400',     icon: XCircle },
  Delayed:          { color: 'bg-rose-400',    icon: AlertCircle },
  'Need More Info': { color: 'bg-violet-400',  icon: AlertTriangle },
}

function InfoBlock({ label, children }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  )
}

function formatTime(t) {
  if (!t) return ''
  return t.slice(0, 5)
}

function mapDbToDetail(row) {
  const createdAt = row.created_at ? row.created_at.slice(0, 16).replace('T', ' ') : ''
  return {
    id:              row.id,
    appointmentCode: row.appointment_code || null,
    vendorName:    row.vendor_name       || '',
    vendorContact: row.contact_name      || '',
    vendorUserId:  row.vendor_user_id    || null,
    vendorEmail:   '',
    vendorPhone:   '',
    equipment:     row.equipment_type    || 'Other',
    date:          row.requested_date    || '',
    startTime:     formatTime(row.start_time),
    endTime:       formatTime(row.end_time),
    staffName:     row.responsible_staff || '',
    priority:      row.priority          || 'Medium',
    status:        row.status            || 'Pending',
    description:   row.description       || '',
    floor:         '',
    notes:         '',
    createdAt,   // used as the seed timestamp for the timeline's first entry
  }
}

export default function AppointmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()

  const [apt,           setApt]           = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [note,          setNote]          = useState('')
  const [noteSaved,     setNoteSaved]     = useState(false)
  const [statusError,   setStatusError]   = useState('')
  const [docs,          setDocs]          = useState([])
  const [docUrls,       setDocUrls]       = useState({})   // { [doc.id]: signedUrl }
  const [docUrlsError,  setDocUrlsError]  = useState(false)
  const [statusHistory, setStatusHistory] = useState([])

  // Upload-from-detail state
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadType,     setUploadType]     = useState('supporting_doc')
  const [uploadFiles,    setUploadFiles]    = useState([])
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState('')

  // QC review state — per-document draft note, keyed by doc.id
  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewingId, setReviewingId] = useState(null)

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true)
      const { data, error } = await supabase
        .from('appointment_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setApt(null)
      } else {
        const mapped = mapDbToDetail(data)
        setApt(mapped)
        setNote(mapped.notes)
      }
      setLoading(false)
    }
    fetchDetail()
  }, [id])

  // Fetch uploaded documents for this appointment (silently ignore if table doesn't exist yet)
  useEffect(() => {
    if (!id) return
    supabase
      .from('appointment_documents')
      .select('id, file_name, file_path, file_type, file_size, document_type, approval_status, reviewed_by, reviewed_at, review_note')
      .eq('appointment_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setDocs(data || []))
  }, [id])

  // Once documents load, fetch a signed URL for each — the bucket is
  // private, so a plain getPublicUrl() would 403. Signed URLs are valid
  // for 1 hour, which comfortably covers a normal viewing session.
  useEffect(() => {
    if (docs.length === 0) { setDocUrls({}); return }

    let cancelled = false
    setDocUrlsError(false)

    Promise.all(
      docs.map(async doc => {
        const { data, error } = await supabase.storage
          .from('appointment-documents')
          .createSignedUrl(doc.file_path, 3600)
        return [doc.id, error ? null : data?.signedUrl]
      })
    ).then(entries => {
      if (cancelled) return
      const urls = Object.fromEntries(entries)
      setDocUrls(urls)
      if (Object.values(urls).some(url => !url)) setDocUrlsError(true)
    })

    return () => { cancelled = true }
  }, [docs])

  // Fetch persisted status history for this appointment
  useEffect(() => {
    if (!id) return
    supabase
      .from('status_updates')
      .select('*')
      .eq('appointment_id', id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setStatusHistory(data || [])
      })
  }, [id])

  // True once at least one maintenance_report document has been approved.
  // A rejected or still-pending report does not satisfy the gate; the
  // uploader can add a fresh report, which re-evaluates this on its own.
  const hasApprovedMaintenanceReport = docs.some(
    d => d.document_type === 'maintenance_report' && d.approval_status === 'approved'
  )

  const updateStatus = async (newStatus) => {
    // Closure gate — enforced here too (not just via the disabled button)
    // so a stale UI state can't slip a Finished transition through.
    if (newStatus === 'Finished' && !hasApprovedMaintenanceReport) {
      setStatusError(t('appointment.maintenanceReportRequired'))
      return
    }

    const oldStatus = apt.status  // capture before updating

    // 1. Update the main appointment record
    const { error } = await supabase
      .from('appointment_requests')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      console.error('Status update error:', error)
      setStatusError('Failed to update status. Try again.')
      return
    }

    // 2. Persist the history row (non-fatal)
    const { error: histErr } = await recordStatusChange(id, oldStatus, newStatus, user)
    if (histErr) {
      console.error('Status history error:', histErr)
      setStatusError('Status updated — history log unavailable.')
    } else {
      setStatusError('')
    }

    // 3. Optimistic local updates
    const now = new Date()
    setApt(prev => ({ ...prev, status: newStatus }))
    setStatusHistory(prev => [...prev, {
      id:              `opt-${now.getTime()}`,
      appointment_id:  id,
      old_status:      oldStatus,
      new_status:      newStatus,
      changed_by:      user?.name     || '',
      changed_by_role: user?.role     || '',
      note:            null,
      created_at:      now.toISOString(),
    }])
  }

  const saveNote = () => {
    setApt(prev => ({ ...prev, notes: note }))
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
  }

  // ── Upload from detail (any role) ─────────────────────────────────────

  function handleFileSelect(rawFiles) {
    const errs = []
    const valid = []
    Array.from(rawFiles).forEach(f => {
      if (!ACCEPTED_TYPES[f.type]) errs.push(`${f.name}: unsupported type (PDF, JPG, PNG only)`)
      else if (f.size > MAX_SIZE)  errs.push(`${f.name}: exceeds ${MAX_SIZE_MB} MB`)
      else                         valid.push(f)
    })
    if (valid.length > 0) setUploadFiles(prev => [...prev, ...valid])
    setUploadError(errs.length > 0 ? errs.join(' · ') : '')
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return
    setUploading(true)
    setUploadError('')

    const failedNames = []
    const inserted = []

    for (const file of uploadFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${id}/${Date.now()}-${safeName}`

      const { error: upErr } = await supabase.storage
        .from('appointment-documents')
        .upload(filePath, file)

      if (upErr) { failedNames.push(file.name); continue }

      const { data: docRow, error: insErr } = await supabase
        .from('appointment_documents')
        .insert({
          appointment_id:  id,
          file_name:       file.name,
          file_path:       filePath,
          file_type:       file.type,
          file_size:       file.size,
          uploaded_by:     user?.name || '',
          document_type:   uploadType,
          approval_status: uploadType === 'maintenance_report' ? 'pending' : null,
        })
        .select('id, file_name, file_path, file_type, file_size, document_type, approval_status, reviewed_by, reviewed_at, review_note')
        .single()

      if (insErr || !docRow) { failedNames.push(file.name); continue }
      inserted.push(docRow)
    }

    if (inserted.length > 0) setDocs(prev => [...prev, ...inserted])

    if (failedNames.length > 0) {
      setUploadError(`Failed to upload: ${failedNames.join(', ')}`)
    } else {
      setUploadFiles([])
      setShowUploadForm(false)
    }
    setUploading(false)
  }

  // ── QC review (internal roles only) ───────────────────────────────────

  async function reviewDoc(docId, newApprovalStatus) {
    setReviewingId(docId)
    const note = reviewNotes[docId]?.trim() || null
    const reviewedAt = new Date().toISOString()

    const { error } = await supabase
      .from('appointment_documents')
      .update({
        approval_status: newApprovalStatus,
        reviewed_by:      user?.id || null,
        reviewed_at:       reviewedAt,
        review_note:       note,
      })
      .eq('id', docId)

    if (!error) {
      setDocs(prev => prev.map(d => d.id === docId
        ? { ...d, approval_status: newApprovalStatus, reviewed_by: user?.id || null, reviewed_at: reviewedAt, review_note: note }
        : d
      ))
      setReviewNotes(prev => { const next = { ...prev }; delete next[docId]; return next })
    } else {
      console.error('Document review error:', error)
    }
    setReviewingId(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        <Topbar title={t('common.loading')} />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-7 bg-slate-100 rounded-lg w-48" />
          <div className="h-56 bg-slate-100 rounded-xl" />
          <div className="h-32 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!apt) {
    return (
      <div className="flex flex-col flex-1">
        <Topbar title={t('appointment.title')} />
        <div className="p-6 text-center py-24">
          <p className="text-slate-500">{t('appointment.noAppointment')}</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-amber-600 text-sm font-medium">
            {t('appointment.goBack')}
          </button>
        </div>
      </div>
    )
  }

  // Vendor ownership gate — vendors may only view their own appointments
  const isVendor = user?.role === 'vendor'
  if (isVendor) {
    // Primary check: vendor_user_id (set on all new bookings)
    const isOwner = apt.vendorUserId === user.id ||
      // Legacy fallback: name match for rows that predate vendor_user_id
      (!apt.vendorUserId && user?.vendorName &&
       apt.vendorName    === user.vendorName &&
       apt.vendorContact === user.contactName)
    if (!isOwner) {
      return (
        <div className="flex flex-col flex-1">
          <Topbar title={t('appointment.unauthorized')} />
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 font-display mb-2">{t('appointment.unauthorized')}</h2>
            <p className="text-sm text-slate-500 max-w-xs mb-6">
              {t('appointment.unauthorizedDesc')}
            </p>
            <button
              onClick={() => navigate('/my-bookings')}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <ArrowLeft size={14} />
              {t('appointment.viewMyBookings')}
            </button>
          </div>
        </div>
      )
    }
  }

  // Build the status timeline: always-first seed entry + all persisted history rows.
  // If no history exists yet, the timeline shows just the initial "Pending" entry.
  const timelineEntries = [
    {
      status:        'Pending',
      timestamp:     apt.createdAt,
      note:          t('appointment.requestSubmitted'),
      changedBy:     '',
      changedByRole: '',
    },
    ...statusHistory.map(h => ({
      status:        h.new_status,
      timestamp:     (h.created_at || '').slice(0, 16).replace('T', ' '),
      note:          h.note            || '',
      changedBy:     h.changed_by      || '',
      changedByRole: h.changed_by_role || '',
    })),
  ]

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('appointment.title')} subtitle={`${apt.vendorName} — ${apt.equipment}`} />

      <div className="p-6 space-y-5">
        {/* Back + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={15} /> {t('common.back')}
          </button>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-xs font-mono text-slate-500">{apt.appointmentCode || apt.id.slice(0, 8) + '…'}</span>
          <div className="ml-auto flex items-center gap-2">
            <PriorityBadge priority={apt.priority} />
            <StatusBadge status={apt.status} size="lg" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Left col */}
          <div className="col-span-2 space-y-5">
            {/* Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 font-display text-lg mb-5">{t('appointment.summary')}</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <InfoBlock label={t('common.vendor')}>
                  <p className="font-semibold">{apt.vendorName}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{apt.vendorContact}</p>
                </InfoBlock>
                <InfoBlock label={t('common.equipment')}>
                  <span className="font-semibold">{apt.equipment}</span>
                </InfoBlock>
                <InfoBlock label={t('common.date')}>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{apt.date}</span>
                  </div>
                </InfoBlock>
                <InfoBlock label={t('common.time')}>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>{apt.startTime}–{apt.endTime}</span>
                  </div>
                </InfoBlock>
                {apt.floor && (
                  <InfoBlock label={t('appointment.floor')}>
                    <div className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-slate-400" />
                      <span>{apt.floor}</span>
                    </div>
                  </InfoBlock>
                )}
                <InfoBlock label={t('common.staff')}>
                  <div className="flex items-center gap-2">
                    <Avatar name={apt.staffName} size="xs" />
                    <span>{apt.staffName}</span>
                  </div>
                </InfoBlock>
              </div>
              {apt.description && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{t('common.description')}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{apt.description}</p>
                </div>
              )}
            </div>

            {/* Documents — supporting docs + maintenance reports (all roles) */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Paperclip size={15} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800 font-display">{t('appointment.supportingDocs')}</h2>
                <span className="ml-auto text-xs text-slate-400">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
              </div>

              {docs.length === 0 && !showUploadForm && (
                <p className="text-xs text-slate-400">No documents yet.</p>
              )}

              <div className="space-y-2">
                {docs.map(doc => {
                  const signedUrl = docUrls[doc.id]
                  const resolving = !(doc.id in docUrls)
                  const isMaintenanceReport = doc.document_type === 'maintenance_report'
                  const canReview = isMaintenanceReport && !isVendor && doc.approval_status === 'pending'
                  return (
                    <div key={doc.id} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <a
                          href={signedUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-disabled={!signedUrl}
                          onClick={e => { if (!signedUrl) e.preventDefault() }}
                          className={`flex items-center gap-3 flex-1 min-w-0 group ${
                            signedUrl ? '' : 'opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <div className="w-7 h-7 bg-slate-200 group-hover:bg-amber-100 rounded flex items-center justify-center flex-shrink-0 transition-colors">
                            <FileText size={13} className="text-slate-500 group-hover:text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 group-hover:text-amber-700 truncate transition-colors">
                              {doc.file_name}
                            </p>
                            {doc.file_size > 0 && (
                              <p className="text-[10px] text-slate-400">{formatFileSize(doc.file_size)}</p>
                            )}
                            {resolving && (
                              <p className="text-[10px] text-slate-400">Loading link…</p>
                            )}
                            {!resolving && !signedUrl && (
                              <p className="text-[10px] text-red-500">Link unavailable</p>
                            )}
                          </div>
                        </a>
                        <ExternalLink size={12} className="text-slate-300 flex-shrink-0" />
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          {t(DOC_TYPE_LABEL_KEYS[doc.document_type] || '') || doc.document_type}
                        </span>
                        {isMaintenanceReport && doc.approval_status && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${APPROVAL_BADGE_CLASSES[doc.approval_status] || 'bg-slate-100 text-slate-500'}`}>
                            {t(APPROVAL_LABEL_KEYS[doc.approval_status] || '') || doc.approval_status}
                          </span>
                        )}
                      </div>

                      {doc.review_note && (
                        <p className="text-[10px] text-slate-500 mt-1.5 italic">"{doc.review_note}"</p>
                      )}

                      {canReview && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <input
                            type="text"
                            value={reviewNotes[doc.id] || ''}
                            onChange={e => setReviewNotes(prev => ({ ...prev, [doc.id]: e.target.value }))}
                            placeholder="Review note (optional)"
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <button
                            onClick={() => reviewDoc(doc.id, 'approved')}
                            disabled={reviewingId === doc.id}
                            className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors flex-shrink-0"
                          >
                            {t('appointment.approveReport')}
                          </button>
                          <button
                            onClick={() => reviewDoc(doc.id, 'rejected')}
                            disabled={reviewingId === doc.id}
                            className="px-2.5 py-1.5 text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex-shrink-0"
                          >
                            {t('appointment.rejectReport')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {docUrlsError && (
                <p className="mt-3 text-xs text-red-500 flex items-center gap-1.5">
                  <AlertCircle size={11} className="flex-shrink-0" />
                  Some document links could not be generated. Refresh the page to retry.
                </p>
              )}

              {/* Upload from detail — any role */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                {!showUploadForm ? (
                  <button
                    onClick={() => setShowUploadForm(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    <Upload size={12} /> Add Document
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={uploadType}
                        onChange={e => setUploadType(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="supporting_doc">{t('appointment.supportingDocument')}</option>
                        <option value="maintenance_report">{t('appointment.maintenanceReport')}</option>
                      </select>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
                        className="text-xs flex-1"
                      />
                    </div>
                    {uploadFiles.length > 0 && (
                      <p className="text-[11px] text-slate-500">
                        {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected: {uploadFiles.map(f => f.name).join(', ')}
                      </p>
                    )}
                    {uploadError && (
                      <p className="text-[11px] text-red-500">{uploadError}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleUpload}
                        disabled={uploading || uploadFiles.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : 'Upload'}
                      </button>
                      <button
                        onClick={() => { setShowUploadForm(false); setUploadFiles([]); setUploadError('') }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Status update — manager/staff only */}
            {!isVendor && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-semibold text-slate-800 font-display mb-4">{t('appointment.updateStatus')}</h2>
                <div className="flex flex-wrap gap-2">
                  {STATUS_ACTIONS.map(({ status, icon: Icon, color }) => {
                    const blocked = status === 'Finished' && !hasApprovedMaintenanceReport
                    return (
                      <button
                        key={status}
                        onClick={() => updateStatus(status)}
                        disabled={apt.status === status || blocked}
                        title={blocked ? t('appointment.maintenanceReportRequired') : undefined}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-default ${color}`}
                      >
                        <Icon size={13} />
                        {t(STATUS_LABEL_KEYS[status] || '') || status}
                      </button>
                    )
                  })}
                </div>
                {apt.status !== 'Finished' && !hasApprovedMaintenanceReport && (
                  <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle size={11} className="flex-shrink-0" /> {t('appointment.maintenanceReportRequired')}
                  </p>
                )}
                {statusError && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={11} /> {statusError}
                  </p>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-800 font-display mb-4">{t('appointment.messages')}</h2>
              <MessageThread appointmentId={apt.id} />
            </div>

            {/* Notes — manager/staff only (internal field not stored in DB) */}
            {!isVendor && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <StickyNote size={15} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800 font-display">{t('appointment.addNote')}</h2>
                </div>
                <textarea
                  rows={3}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('appointment.notePlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={saveNote}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {t('appointment.saveNote')}
                  </button>
                  {noteSaved && <span className="text-xs text-emerald-600 font-medium">✓ {t('appointment.saved')}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Right col */}
          <div className="space-y-5">
            {/* Vendor info */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 font-display mb-4">{t('appointment.vendorInfo')}</h2>
              <div className="flex items-center gap-3 mb-4">
                <Avatar name={apt.vendorName} size="lg" />
                <div>
                  <p className="font-semibold text-slate-800">{apt.vendorName}</p>
                  <p className="text-xs text-slate-500">{apt.equipment} {t('appointment.specialist')}</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {apt.vendorEmail && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail size={12} className="text-slate-400" />
                    </div>
                    <span className="text-slate-600 text-xs truncate">{apt.vendorEmail}</span>
                  </div>
                )}
                {apt.vendorPhone && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone size={12} className="text-slate-400" />
                    </div>
                    <span className="text-slate-600 text-xs">{apt.vendorPhone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-sm">
                  <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={12} className="text-slate-400" />
                  </div>
                  <span className="text-slate-600 text-xs">{apt.vendorContact || '—'}</span>
                </div>
              </div>
              <button className="w-full mt-4 py-2 border border-amber-300 text-amber-600 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors">
                {t('appointment.contactVendor')}
              </button>
            </div>

            {/* Status timeline — sourced from status_updates table */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 font-display mb-4">{t('appointment.statusTimeline')}</h2>
              <div className="space-y-0">
                {timelineEntries.map((entry, i) => {
                  const cfg  = TIMELINE_ICONS[entry.status] || TIMELINE_ICONS.Pending
                  const Icon = cfg.icon
                  const isLast = i === timelineEntries.length - 1
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full ${cfg.color} flex items-center justify-center flex-shrink-0 z-10`}>
                          <Icon size={11} className="text-white" />
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-slate-200 my-0.5" />}
                      </div>
                      <div className="pb-4">
                        <p className="text-xs font-semibold text-slate-700">{t(STATUS_LABEL_KEYS[entry.status] || '') || entry.status}</p>
                        <p className="text-[10px] text-slate-400">{entry.timestamp}</p>
                        {entry.note     && <p className="text-[10px] text-slate-500 mt-0.5">{entry.note}</p>}
                        {entry.changedBy && <p className="text-[10px] text-slate-400 mt-0.5">{t('appointment.by')} {entry.changedBy}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
