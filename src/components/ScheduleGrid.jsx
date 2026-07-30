import React, { useState } from 'react'
import { Plus, X, Clock, Trash2 } from 'lucide-react'
import { Avatar } from './ui/Avatar'
import { useLanguage } from '../context/LanguageContext'

const EQUIP_COLORS = {
  Elevator:      'border-l-sky-400 bg-sky-50',
  HVAC:          'border-l-teal-400 bg-teal-50',
  Chiller:       'border-l-cyan-400 bg-cyan-50',
  AED:           'border-l-red-400 bg-red-50',
  UPS:           'border-l-indigo-400 bg-indigo-50',
  Electrical:    'border-l-yellow-400 bg-yellow-50',
  'Fire Safety': 'border-l-orange-400 bg-orange-50',
  Other:         'border-l-slate-300 bg-slate-50',
}

const EQUIPMENT_OPTIONS = ['Elevator', 'HVAC', 'Chiller', 'AED', 'UPS', 'Electrical', 'Fire Safety', 'Other']
const DAYS              = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_LABELS        = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' }

// ── Main export ───────────────────────────────────────────────────────────────

export function ScheduleGrid({ slots = [], weekDates = {}, onAddShift, onDeleteSlot, staffOptions = [] }) {
  const { t } = useLanguage()
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState({
    date:           '',
    startTime:      '09:00',
    endTime:        '13:00',
    staffProfileId: '',
    staffName:      '',
    equipment:      'HVAC',
    notes:          '',
  })

  // Group slots by day column: slot.date must match weekDates[day]
  const byDay = Object.fromEntries(DAYS.map(d => [d, []]))
  slots.forEach(s => {
    const day = DAYS.find(d => weekDates[d] === s.date)
    if (day) byDay[day].push(s)
  })

  function openModal() {
    setForm({
      date:           weekDates.Mon || '',
      startTime:      '09:00',
      endTime:        '13:00',
      staffProfileId: '',
      staffName:      '',
      equipment:      'HVAC',
      notes:          '',
    })
    setModal(true)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.staffName || !form.date) return
    onAddShift?.(form)
    setModal(false)
  }

  function handleStaffChange(profileId) {
    const picked = staffOptions.find(p => p.id === profileId)
    setForm(f => ({ ...f, staffProfileId: profileId, staffName: picked?.display_name || '' }))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-slate-800 font-display">{t('schedule.weeklyGrid')}</h3>
        <button
          data-testid="schedule-add-shift-button"
          onClick={openModal}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} />
          {t('schedule.addShift')}
        </button>
      </div>

      {/* Day columns — a genuine 5-column weekly view doesn't collapse to
          fewer columns without losing its meaning, so below the point
          where 5 columns can't fit, this scrolls horizontally within its
          own container instead of stacking (which would still overflow
          the page) or forcing the page itself to scroll sideways. */}
      <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-5 gap-3 min-w-[640px] sm:min-w-0">
        {DAYS.map(day => (
          <div key={day}>
            <div className="text-center mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{DAY_LABELS[day]}</p>
              {weekDates[day] && (
                <p className="text-[10px] text-slate-400 mt-0.5">{weekDates[day]}</p>
              )}
            </div>
            <div className="space-y-2">
              {byDay[day].length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">{t('schedule.noTimeSlots')}</p>
                </div>
              ) : (
                byDay[day].map(slot => {
                  const colorClass = EQUIP_COLORS[slot.equipment] || EQUIP_COLORS.Other
                  return (
                    <div key={slot.id} className={`border-l-4 rounded-lg p-3 relative group/card ${colorClass}`}>
                      {/* Delete — visible on hover */}
                      <button
                        data-testid="shift-delete"
                        type="button"
                        onClick={() => onDeleteSlot?.(slot.id)}
                        title="Delete shift"
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 hover:bg-red-100 hover:text-red-500 text-slate-400 transition-all shadow-sm"
                      >
                        <Trash2 size={10} />
                      </button>

                      {/* Time is the primary label now — this slot is
                          bookable by any vendor for any equipment type, so
                          time/staff (who's available, when) is what
                          matters; equipment is shown small, below, as
                          informational context only. */}
                      <div className="flex items-center gap-1 pr-5">
                        <Clock size={10} className="text-slate-400 flex-shrink-0" />
                        <p className="text-xs font-semibold text-slate-700">{slot.startTime}–{slot.endTime}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Avatar name={slot.staffName} size="xs" />
                        <p className="text-[10px] text-slate-600 truncate">{slot.staffName}</p>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 truncate">{slot.equipment} · {t('schedule.infoOnlyBadge')}</p>
                      {slot.notes && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">{slot.notes}</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* ── Add shift modal ────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 font-display">{t('schedule.modalTitle')}</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date picker */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  min={weekDates.Mon || undefined}
                  max={weekDates.Fri || undefined}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Restricted to displayed week: {weekDates.Mon || '…'} – {weekDates.Fri || '…'}
                </p>
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('schedule.startTime')}</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('schedule.endTime')}</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Staff */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t('schedule.selectStaff')} <span className="text-red-400">*</span>
                </label>
                <select
                  data-testid="shift-staff-select"
                  required
                  value={form.staffProfileId}
                  onChange={e => handleStaffChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Select a staff member…</option>
                  {staffOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name} — {p.role}</option>
                  ))}
                </select>
                {staffOptions.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-1">
                    No active admin/manager/staff accounts found — add one in Admin → Users before you can create a shift.
                  </p>
                )}
              </div>

              {/* Equipment — informational only. Staff aren't equipment
                  specialists, so this never restricts which vendors can
                  book this time slot; it's just a note for context. */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  {t('schedule.selectEquipment')} <span className="font-normal text-slate-400">({t('schedule.infoOnlyBadge')})</span>
                </label>
                <select
                  data-testid="shift-equipment-select"
                  value={form.equipment}
                  onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {EQUIPMENT_OPTIONS.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">{t('schedule.equipmentHint')}</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optional)</label>
                <input
                  data-testid="shift-notes-input"
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Bring calibration tools"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  data-testid="shift-submit"
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {t('schedule.addShift')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
