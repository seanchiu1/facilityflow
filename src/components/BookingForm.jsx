import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown, Wind, Waves, Heart, Zap, BatteryFull, Flame, HelpCircle,
  Upload, CheckCircle2, User, Loader2, AlertCircle, CalendarSearch,
  FileText, X,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui/Avatar'
import { supabase } from '../lib/supabaseClient'

// ── Static config ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'Elevator',    icon: ArrowUpDown, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { key: 'HVAC',        icon: Wind,        color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { key: 'Chiller',     icon: Waves,       color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  { key: 'AED',         icon: Heart,       color: 'text-red-600 bg-red-50 border-red-200' },
  { key: 'UPS',         icon: BatteryFull, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { key: 'Electrical',  icon: Zap,         color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  { key: 'Fire Safety', icon: Flame,       color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { key: 'Other',       icon: HelpCircle,  color: 'text-slate-600 bg-slate-50 border-slate-200' },
]

const DURATIONS = [
  { value: 1, labelKey: 'booking.hr1' },
  { value: 2, labelKey: 'booking.hr2' },
  { value: 3, labelKey: 'booking.hr3' },
  { value: 4, labelKey: 'booking.hr4' },
  { value: 6, labelKey: 'booking.hr6' },
  { value: 8, labelKey: 'booking.hr8' },
]

// Day label from ISO date
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayName(iso) {
  return DAY_NAMES[new Date(iso + 'T00:00:00').getDay()]
}

// File upload constants & helpers
const ACCEPTED_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' }
const MAX_SIZE_MB = 10
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate({ vendorName, contactName, category, date, slotId, description }, t) {
  const errs = {}
  if (!vendorName.trim())  errs.vendorName  = t('booking.vendorNameRequired')
  if (!contactName.trim()) errs.contactName = t('booking.contactNameRequired')
  if (!category)           errs.category    = t('booking.categoryRequired')
  if (!date)               errs.date        = t('booking.dateRequired')
  if (!slotId)             errs.slotId      = t('booking.slotRequired')
  if (!description.trim()) errs.description = t('booking.descriptionRequired')
  return errs
}

// ── Main component ────────────────────────────────────────────────────────────

export function BookingForm() {
  const { t } = useLanguage()
  const { user } = useAuth()

  const [vendorName,      setVendorName]      = useState(() => user?.vendorName  || '')
  const [contactName,     setContactName]     = useState(() => user?.contactName || '')

  // Safety prefill: if auth resolved after initial render (edge case), fill empty fields
  useEffect(() => {
    if (user?.role === 'vendor') {
      if (user.vendorName  && !vendorName)  setVendorName(user.vendorName)
      if (user.contactName && !contactName) setContactName(user.contactName)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
  const [category,        setCategory]        = useState('')
  const [date,            setDate]            = useState('')
  const [slotId,          setSlotId]          = useState('')
  const [duration,        setDuration]        = useState(2)
  const [description,     setDescription]     = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [submitError,      setSubmitError]      = useState('')
  const [submitted,        setSubmitted]        = useState(false)
  const [newCode,          setNewCode]          = useState('')
  const [errors,           setErrors]           = useState({})

  // File upload state
  const [files,         setFiles]         = useState([])
  const [dragOver,      setDragOver]      = useState(false)
  const [uploadWarning, setUploadWarning] = useState('')
  const fileInputRef = useRef(null)

  // Schedule slots fetched from Supabase
  const [availableSlots,  setAvailableSlots]  = useState([])
  const [slotsLoading,    setSlotsLoading]    = useState(false)

  // ── Fetch slots when category + date are both set ────────────────────────

  useEffect(() => {
    if (!category || !date) { setAvailableSlots([]); setSlotId(''); return }

    async function loadSlots() {
      setSlotsLoading(true)
      // Run both queries in parallel: schedule slots + existing booking counts.
      // Booking counts come from the slot_booking_counts view, not
      // appointment_requests directly — the view exposes only the
      // aggregate count (no vendor identity), so this keeps working
      // once appointment_requests gets a vendor-scoped RLS policy.
      //
      // Slots come from the get_available_schedule_slots() RPC, not a
      // direct staff_schedules select — the table itself no longer grants
      // vendors blanket read access (a vendor querying it directly used to
      // get every equipment type/date/staff name in the system, not just
      // the one slot picker they're looking at). The RPC returns exactly
      // this equipment_type + date combination, same shape as before.
      const [slotsRes, bookingsRes] = await Promise.all([
        supabase
          .rpc('get_available_schedule_slots', { p_equipment_type: category, p_schedule_date: date }),
        supabase
          .from('slot_booking_counts')
          .select('responsible_staff, start_time, booked_count')
          .eq('requested_date', date),
      ])

      // Build booked-count map: "staff|HH:MM" → count
      const countMap = {}
      ;(bookingsRes.data || []).forEach(r => {
        const key = `${r.responsible_staff}|${(r.start_time || '').slice(0, 5)}`
        countMap[key] = r.booked_count || 0
      })

      const mapped = (slotsRes.data || []).map(row => ({
        id:        row.id,
        staffName: row.staff_name     || '',
        startTime: (row.start_time    || '').slice(0, 5),
        endTime:   (row.end_time      || '').slice(0, 5),
        capacity:  row.capacity       ?? 3,
        booked:    countMap[`${row.staff_name}|${(row.start_time || '').slice(0, 5)}`] || 0,
        notes:     row.notes          || '',
      }))

      setAvailableSlots(mapped)
      setSlotId('')   // reset selection when slots change
      setSlotsLoading(false)
    }

    loadSlots()
  }, [category, date])

  const selectedSlot = availableSlots.find(s => s.id === slotId)

  // ── File helpers ──────────────────────────────────────────────────────────

  function handleFileSelect(rawFiles) {
    const errs = []
    const valid = []
    Array.from(rawFiles).forEach(f => {
      if (!ACCEPTED_TYPES[f.type])  errs.push(`${f.name}: ${t('appointment.unsupportedFileType')}`)
      else if (f.size > MAX_SIZE)   errs.push(`${f.name}: ${t('appointment.exceedsFileSize')} (${MAX_SIZE_MB} MB)`)
      else if (files.some(x => x.name === f.name && x.size === f.size)) { /* skip duplicate */ }
      else                          valid.push(f)
    })
    if (valid.length > 0) setFiles(prev => [...prev, ...valid])
    setUploadWarning(errs.length > 0 ? errs.join(' · ') : '')
  }

  function removeFile(idx) { setFiles(prev => prev.filter((_, i) => i !== idx)) }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function resetForm() {
    setVendorName(user?.vendorName || ''); setContactName(user?.contactName || ''); setCategory('')
    setDate(''); setSlotId(''); setDuration(2); setDescription('')
    setErrors({}); setSubmitError(''); setSubmitted(false); setNewCode('')
    setAvailableSlots([]); setFiles([]); setUploadWarning('')
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    setUploadWarning('')
    const errs = validate({ vendorName, contactName, category, date, slotId, description }, t)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSubmitting(true)

    // 1. Insert appointment request and get back the new ID
    const { data: insertData, error } = await supabase
      .from('appointment_requests')
      .insert({
        vendor_name:       vendorName.trim(),
        contact_name:      contactName.trim(),
        vendor_user_id:    user?.id || null,
        equipment_type:    category,
        requested_date:    date,
        start_time:        selectedSlot.startTime,
        end_time:          selectedSlot.endTime,
        responsible_staff: selectedSlot.staffName,
        priority:          'Medium',
        status:            'Pending',
        description:       description.trim(),
      })
      .select('id, appointment_code')
      .single()

    if (error) {
      console.error('Insert error:', error)
      setSubmitError(t('booking.submitError'))
      setSubmitting(false)
      return
    }

    // 2. Upload any selected files to Supabase Storage (non-fatal if they fail)
    if (files.length > 0) {
      const failedNames = []
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `${insertData.id}/${Date.now()}-${safeName}`

        const { error: upErr } = await supabase.storage
          .from('appointment-documents')
          .upload(filePath, file)

        if (upErr) { failedNames.push(file.name); continue }

        await supabase.from('appointment_documents').insert({
          appointment_id: insertData.id,
          file_name:      file.name,
          file_path:      filePath,
          file_type:      file.type,
          file_size:      file.size,
          uploaded_by:    user?.name || '',
        })
      }

      if (failedNames.length > 0) {
        setUploadWarning(
          `${t('booking.someFilesFailedPrefix')} ${failedNames.join(', ')}. ${t('booking.stillSubmittedSuffix')}`
        )
      }
    }

    setNewCode(insertData.appointment_code || '')
    setSubmitting(false)
    setSubmitted(true)
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 font-display mb-2">{t('booking.successTitle')}</h2>
        <p className="text-slate-500 max-w-sm">{t('booking.successMsg')}</p>
        {newCode && (
          <div className="mt-4 px-5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <span className="text-xs text-amber-600 font-medium">{t('booking.appointmentCode')}</span>
            <span className="font-mono text-base font-bold text-amber-700">{newCode}</span>
          </div>
        )}
        <div className="mt-3 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 space-y-1 text-left">
          <p><span className="text-slate-400">{t('common.vendor')}:</span>      <span className="font-medium">{vendorName}</span></p>
          <p><span className="text-slate-400">{t('common.equipment')}:</span>   <span className="font-medium">{category}</span></p>
          <p><span className="text-slate-400">{t('common.date')}:</span>        <span className="font-medium">{date}  {selectedSlot?.startTime}–{selectedSlot?.endTime}</span></p>
          <p><span className="text-slate-400">{t('booking.summaryAssignedTo')}:</span> <span className="font-medium">{selectedSlot?.staffName}</span></p>
        </div>
        {uploadWarning && (
          <div className="mt-3 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left max-w-sm">
            <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">{uploadWarning}</p>
          </div>
        )}
        <button onClick={resetForm} className="mt-6 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
          {t('booking.submitAnother')}
        </button>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-3 gap-6">
      {/* Left: form fields */}
      <div className="col-span-2 space-y-6">

        {/* Vendor information */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 font-display mb-4">{t('booking.vendorInformation')}</h3>
          {user?.role === 'vendor' && user?.vendorName && (
            <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-4">
              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full flex-shrink-0" />
              {t('myBookings.signedInAs')} <span className="font-semibold ml-0.5">{user.vendorName}</span>
              {user.contactName && <><span className="text-violet-400 mx-1">·</span><span className="font-semibold">{user.contactName}</span></>}
              <span className="ml-auto text-violet-400">{t('myBookings.editHint')}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('booking.vendorCompanyName')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={e => { setVendorName(e.target.value); setErrors(p => ({ ...p, vendorName: '' })) }}
                placeholder={t('booking.vendorNamePlaceholder')}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${errors.vendorName ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.vendorName  && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.vendorName}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('booking.contactName')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={e => { setContactName(e.target.value); setErrors(p => ({ ...p, contactName: '' })) }}
                placeholder={t('booking.contactNamePlaceholder')}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${errors.contactName ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.contactName && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.contactName}</p>}
            </div>
          </div>
        </div>

        {/* Equipment category */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 font-display mb-1">
            {t('booking.selectCategory')} <span className="text-red-400">*</span>
          </h3>
          <p className="text-xs text-slate-400 mb-4">{t('booking.selectCategoryHint')}</p>
          <div className="grid grid-cols-4 gap-2.5">
            {CATEGORIES.map(({ key, icon: Icon, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setCategory(key); setErrors(p => ({ ...p, category: '', slotId: '' })) }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                  category === key
                    ? `${color} border-current shadow-sm scale-[1.02]`
                    : errors.category
                    ? 'border-red-200 text-slate-500 hover:border-red-300'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon size={20} />
                {key}
              </button>
            ))}
          </div>
          {errors.category && <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.category}</p>}
        </div>

        {/* Date & Time slots */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 font-display mb-4">
            {t('booking.selectDate')} &amp; {t('booking.selectTime')}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('booking.selectDate')} <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setErrors(p => ({ ...p, date: '' })) }}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${errors.date ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.date && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.date}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('booking.estimatedDuration')}</label>
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{t(d.labelKey)}</option>)}
              </select>
            </div>
          </div>

          {/* Available slots section */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              {t('booking.availableSlots')} <span className="text-red-400">*</span>
            </label>

            {/* Prompt when category or date is missing */}
            {(!category || !date) && (
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                <CalendarSearch size={18} className="flex-shrink-0" />
                <p className="text-sm">
                  {!category && !date
                    ? t('booking.selectCategoryDateBoth')
                    : !category
                    ? t('booking.selectCategoryOnly')
                    : t('booking.selectDateOnly')}
                </p>
              </div>
            )}

            {/* Loading */}
            {category && date && slotsLoading && (
              <div className="flex items-center gap-3 p-4 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">{t('booking.loadingSlots')}</span>
              </div>
            )}

            {/* No slots found */}
            {category && date && !slotsLoading && availableSlots.length === 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-700 font-medium">{t('booking.noSlotsAvailable')}</p>
                <p className="text-xs text-amber-600 mt-1">
                  {t('booking.contactManagerHint')}
                </p>
              </div>
            )}

            {/* Slot list */}
            {category && date && !slotsLoading && availableSlots.length > 0 && (
              <div className="space-y-2">
                {availableSlots.map(slot => {
                  const pct      = slot.capacity > 0 ? slot.booked / slot.capacity : 0
                  const isFull   = slot.booked >= slot.capacity
                  const isSelected = slotId === slot.id
                  return (
                    <label
                      key={slot.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        isFull
                          ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                          : isSelected
                          ? 'border-amber-400 bg-amber-50'
                          : errors.slotId
                          ? 'border-red-200 hover:border-red-300'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={slot.id}
                        disabled={isFull}
                        checked={isSelected}
                        onChange={() => { setSlotId(slot.id); setErrors(p => ({ ...p, slotId: '' })) }}
                        className="accent-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-700">
                            {dayName(date)}  {slot.startTime}–{slot.endTime}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            isFull          ? 'bg-red-100 text-red-600'    :
                            pct >= 0.66     ? 'bg-amber-100 text-amber-600':
                                              'bg-emerald-100 text-emerald-600'
                          }`}>
                            {isFull ? t('booking.slotFull') : pct >= 0.66 ? t('booking.slotBusy') : t('booking.slotAvailable')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Avatar name={slot.staffName} size="xs" />
                          <span className="text-xs text-slate-500">{slot.staffName}</span>
                        </div>
                        {slot.notes && <p className="text-[10px] text-slate-400 mt-0.5">{slot.notes}</p>}
                        <div className="mt-1.5 w-full h-1 bg-slate-200 rounded-full">
                          <div
                            className={`h-full rounded-full ${pct >= 1 ? 'bg-red-400' : pct >= 0.66 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(pct * 100, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{slot.booked}/{slot.capacity} {t('booking.vendorsBookedSuffix')}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {errors.slotId && <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.slotId}</p>}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 font-display mb-4">
            {t('booking.description')} <span className="text-red-400">*</span>
          </h3>
          <textarea
            rows={4}
            value={description}
            onChange={e => { setDescription(e.target.value); setErrors(p => ({ ...p, description: '' })) }}
            placeholder={t('booking.descriptionPlaceholder')}
            className={`w-full border rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 ${errors.description ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
          />
          {errors.description && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{errors.description}</p>}
        </div>

        {/* Supporting Documents — functional upload */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 font-display mb-1">{t('booking.uploadDocument')}</h3>
          <p className="text-xs text-slate-400 mb-3">{t('booking.uploadHint')}</p>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            className="hidden"
            onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
          />

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files) }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none ${
              dragOver
                ? 'border-amber-400 bg-amber-50 scale-[1.01]'
                : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
            }`}
          >
            <Upload size={24} className={`mx-auto mb-2 transition-colors ${dragOver ? 'text-amber-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-500">
              {dragOver ? t('booking.dropToAttach') : t('booking.dropFilesHint')}
            </p>
            <p className="text-xs text-slate-400 mt-1">{t('booking.fileTypeHint')} {MAX_SIZE_MB} MB</p>
          </div>

          {/* Validation warning */}
          {uploadWarning && (
            <p className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
              <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
              {uploadWarning}
            </p>
          )}

          {/* Selected file list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="w-7 h-7 bg-slate-200 rounded flex items-center justify-center flex-shrink-0">
                    <FileText size={13} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatFileSize(file.size)} · {ACCEPTED_TYPES[file.type] || 'File'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    aria-label={t('appointment.removeFile')}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
        >
          {submitting ? (<><Loader2 size={16} className="animate-spin" /> {t('booking.submitting')}</>) : t('booking.submitRequest')}
        </button>
      </div>

      {/* Right: summary sidebar */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-20">
          <h3 className="font-semibold text-slate-800 font-display mb-4">{t('booking.requestSummary')}</h3>
          <div className="space-y-3">
            <SummaryRow label={t('common.vendor')}            value={vendorName  || '—'} />
            <SummaryRow label={t('booking.contactName')}      value={contactName || '—'} />
            <SummaryRow label={t('booking.selectCategory')}  value={category    || '—'} />
            <SummaryRow label={t('booking.selectDate')}      value={date        || '—'} />
            <SummaryRow label={t('booking.estimatedDuration')} value={duration ? `${duration} ${t('common.hours')}` : '—'} />
            {selectedSlot && (
              <>
                <SummaryRow label={t('booking.timeSlotLabel')} value={`${selectedSlot.startTime}–${selectedSlot.endTime}`} />
                <div className="flex items-start gap-3 py-2 border-t border-slate-100 mt-2">
                  <User size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400">{t('booking.assignedStaff')}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Avatar name={selectedSlot.staffName} size="xs" />
                      <p className="text-sm font-medium text-slate-700">{selectedSlot.staffName}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {(!vendorName || !category || !slotId) && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 text-center">
                {!vendorName ? t('booking.enterVendorNameToContinue')
                  : !category ? t('booking.selectCategoryToContinue')
                  : t('booking.selectSlotToContinue')}
              </p>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start gap-2">
      <p className="text-xs text-slate-400 w-24 flex-shrink-0 pt-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700 flex-1">{value}</p>
    </div>
  )
}
