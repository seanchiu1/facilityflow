import React from 'react'

const STATUS_CONFIG = {
  'Pending':        { dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-200' },
  'Approved':       { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  'Scheduled':      { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200' },
  'In Progress':    { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200' },
  '50% Finished':   { dot: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200' },
  'Finished':       { dot: 'bg-emerald-600', text: 'text-emerald-800', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  'Cancelled':      { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200' },
  'Delayed':        { dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',     border: 'border-rose-200' },
  'Need More Info': { dot: 'bg-violet-500',  text: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200' },
}

const PRIORITY_CONFIG = {
  'High':   { text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  'Medium': { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  'Low':    { text: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200',  dot: 'bg-slate-400' },
}

export function StatusBadge({ status, size = 'sm' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['Pending']
  const sizeClass = size === 'lg' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClass} ${config.bg} ${config.text} ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {status}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['Low']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border text-xs px-2.5 py-1 font-medium ${config.bg} ${config.text} ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {priority}
    </span>
  )
}
