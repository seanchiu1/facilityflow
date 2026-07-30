import React from 'react'

// A fixed palette, picked deterministically from the person's name (not
// their initials — initials collide too easily across a real roster) so
// the same person always gets the same color across the app, without
// needing a hardcoded name/initials lookup table for specific people.
const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function colorForName(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function Avatar({ name, initials, color, size = 'md' }) {
  const letters = initials || getInitials(name)
  const bg = color || (name ? colorForName(name) : 'bg-slate-400')
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
