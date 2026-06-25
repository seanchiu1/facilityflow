import React from 'react'

const COLOR_MAP = {
  'CW': 'bg-blue-500',
  'LM': 'bg-violet-500',
  'WD': 'bg-emerald-500',
  'CY': 'bg-rose-500',
  'LK': 'bg-amber-500',
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function Avatar({ name, initials, color, size = 'md' }) {
  const letters = initials || getInitials(name)
  const bg = color || COLOR_MAP[letters] || 'bg-slate-400'
  const sizeClass = {
    xs:  'w-6 h-6 text-[10px]',
    sm:  'w-7 h-7 text-xs',
    md:  'w-8 h-8 text-xs',
    lg:  'w-10 h-10 text-sm',
    xl:  'w-12 h-12 text-base',
  }[size] || 'w-8 h-8 text-xs'

  return (
    <div className={`${sizeClass} ${bg} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {letters}
    </div>
  )
}
