import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, MoreHorizontal, ChevronDown } from 'lucide-react'
import { StatusBadge, PriorityBadge } from './ui/StatusBadge'
import { Avatar } from './ui/Avatar'
import { useLanguage } from '../context/LanguageContext'

const EQUIP_COLORS = {
  Elevator:      'bg-sky-100 text-sky-700',
  HVAC:          'bg-teal-100 text-teal-700',
  Chiller:       'bg-cyan-100 text-cyan-700',
  AED:           'bg-red-100 text-red-700',
  UPS:           'bg-indigo-100 text-indigo-700',
  Electrical:    'bg-yellow-100 text-yellow-700',
  'Fire Safety': 'bg-orange-100 text-orange-700',
  Other:         'bg-slate-100 text-slate-600',
}

// Allowed forward/backward transitions per current status.
// Pending is handled by the existing approve/reject/info buttons.
// Empty array = final status, no actions shown.
const LIFECYCLE_TRANSITIONS = {
  'Need More Info': [
    { status: 'Pending',   labelKey: 'requests.transReturnPending', dot: 'bg-slate-400',   text: 'text-slate-700' },
    { status: 'Cancelled', labelKey: 'requests.transCancelRequest',  dot: 'bg-red-500',     text: 'text-red-700'   },
  ],
  'Approved': [
    { status: 'Scheduled',   labelKey: 'requests.transMarkScheduled',  dot: 'bg-blue-500',    text: 'text-blue-700'    },
    { status: 'In Progress', labelKey: 'requests.transStartWork',       dot: 'bg-amber-500',   text: 'text-amber-700'   },
    { status: 'Delayed',     labelKey: 'requests.transMarkDelayed',     dot: 'bg-rose-500',    text: 'text-rose-700'    },
    { status: 'Cancelled',   labelKey: 'requests.transCancel',          dot: 'bg-red-500',     text: 'text-red-700'     },
  ],
  'Scheduled': [
    { status: 'In Progress', labelKey: 'requests.transStartWork',    dot: 'bg-amber-500',   text: 'text-amber-700'   },
    { status: 'Delayed',     labelKey: 'requests.transMarkDelayed',  dot: 'bg-rose-500',    text: 'text-rose-700'    },
    { status: 'Cancelled',   labelKey: 'requests.transCancel',       dot: 'bg-red-500',     text: 'text-red-700'     },
  ],
  'In Progress': [
    { status: '50% Finished', labelKey: 'requests.transMark50',         dot: 'bg-orange-500',  text: 'text-orange-700'  },
    { status: 'Finished',     labelKey: 'requests.transMarkFinished',   dot: 'bg-emerald-500', text: 'text-emerald-700' },
    { status: 'Delayed',      labelKey: 'requests.transMarkDelayed',    dot: 'bg-rose-500',    text: 'text-rose-700'    },
    { status: 'Cancelled',    labelKey: 'requests.transCancel',         dot: 'bg-red-500',     text: 'text-red-700'     },
  ],
  '50% Finished': [
    { status: 'Finished',    labelKey: 'requests.transMarkFinished',   dot: 'bg-emerald-500', text: 'text-emerald-700' },
    { status: 'In Progress', labelKey: 'requests.transBackInProgress', dot: 'bg-amber-500',   text: 'text-amber-700'   },
    { status: 'Delayed',     labelKey: 'requests.transMarkDelayed',    dot: 'bg-rose-500',    text: 'text-rose-700'    },
    { status: 'Cancelled',   labelKey: 'requests.transCancel',         dot: 'bg-red-500',     text: 'text-red-700'     },
  ],
  'Delayed': [
    { status: 'In Progress', labelKey: 'requests.transResumeWork', dot: 'bg-amber-500', text: 'text-amber-700' },
    { status: 'Cancelled',   labelKey: 'requests.transCancel',     dot: 'bg-red-500',   text: 'text-red-700'   },
  ],
  'Pending':   [],  // handled by approve/reject/info buttons
  'Finished':  [],  // final — no actions
  'Cancelled': [],  // final — no actions
}

// Per-row action cell: Pending → 3 inline buttons; other non-final → dropdown; final → nothing
function ActionCell({ apt, onApprove, onReject, onMoreInfo, onStatusUpdate }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const transitions = LIFECYCLE_TRANSITIONS[apt.status] ?? []

  if (apt.status === 'Pending') {
    return (
      <div className="flex gap-1.5">
        {onApprove && (
          <button
            onClick={() => onApprove(apt.id)}
            className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            {t('requests.actionApprove')}
          </button>
        )}
        {onReject && (
          <button
            onClick={() => onReject(apt.id)}
            className="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            {t('requests.actionReject')}
          </button>
        )}
        {onMoreInfo && (
          <button
            onClick={() => onMoreInfo(apt.id)}
            className="px-2.5 py-1 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
          >
            {t('requests.actionInfo')}
          </button>
        )}
      </div>
    )
  }

  if (transitions.length === 0) return null  // final status

  return (
    <div className="relative">
      {/* Transparent backdrop to close the dropdown on outside click */}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all ${
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <MoreHorizontal size={12} />
        {t('requests.colStatus')}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-20 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 w-48 overflow-hidden">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 pt-1 pb-1.5">
            {t('requests.updateTo')}
          </p>
          {transitions.map(({ status, labelKey, dot, text }) => (
            <button
              key={status}
              onClick={() => { onStatusUpdate(apt.id, status); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RequestTable({ appointments, showActions, onApprove, onReject, onMoreInfo, onStatusUpdate }) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  if (!appointments?.length) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Clock size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">{t('requests.noRequestsYet')}</p>
        <p className="text-xs mt-1">{t('requests.noRequestsYetDesc')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colId')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colVendor')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colEquipment')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colDateTime')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colStaff')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colPriority')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{t('requests.colStatus')}</th>
            {showActions && <th className="pb-3 pr-2 w-36" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {appointments.map((apt) => (
            <tr
              key={apt.id}
              className="hover:bg-slate-50 cursor-pointer transition-colors group"
              onClick={() => navigate(`/appointments/${apt.id}`)}
            >
              <td className="py-3.5 pr-4">
                <span className="font-mono text-xs text-slate-400">{apt.displayId || apt.id}</span>
              </td>
              <td className="py-3.5 pr-4">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{apt.vendorName}</p>
                  <p className="text-xs text-slate-400">{apt.vendorContact}</p>
                </div>
              </td>
              <td className="py-3.5 pr-4">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${EQUIP_COLORS[apt.equipment] || EQUIP_COLORS.Other}`}>
                  {apt.equipment}
                </span>
              </td>
              <td className="py-3.5 pr-4">
                <p className="text-slate-700 font-medium text-sm">{apt.date}</p>
                <p className="text-xs text-slate-400">{apt.startTime}–{apt.endTime}</p>
              </td>
              <td className="py-3.5 pr-4">
                <div className="flex items-center gap-2">
                  <Avatar name={apt.staffName} size="xs" />
                  <span className="text-slate-600 text-xs">{apt.staffName}</span>
                </div>
              </td>
              <td className="py-3.5 pr-4">
                <PriorityBadge priority={apt.priority} />
              </td>
              <td className="py-3.5 pr-4">
                <StatusBadge status={apt.status} />
              </td>
              {showActions && (
                <td
                  className="py-3.5 pr-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ActionCell
                    apt={apt}
                    onApprove={onApprove}
                    onReject={onReject}
                    onMoreInfo={onMoreInfo}
                    onStatusUpdate={onStatusUpdate}
                  />
                </td>
              )}
              <td className="py-3.5 pl-2 w-5">
                <ChevronRight size={14} className="text-slate-200 group-hover:text-slate-400 transition-colors" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
