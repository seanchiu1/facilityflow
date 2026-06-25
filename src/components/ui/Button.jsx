import React from 'react'

const variants = {
  primary:   'bg-amber-500 hover:bg-amber-600 text-white border-transparent shadow-sm',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm',
  danger:    'bg-red-500 hover:bg-red-600 text-white border-transparent shadow-sm',
  ghost:     'bg-transparent hover:bg-slate-100 text-slate-600 border-transparent',
  success:   'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent shadow-sm',
  outline:   'bg-white hover:bg-amber-50 text-amber-600 border-amber-300 shadow-sm',
}

const sizes = {
  xs:  'text-xs px-2.5 py-1.5 gap-1',
  sm:  'text-sm px-3 py-2 gap-1.5',
  md:  'text-sm px-4 py-2.5 gap-2',
  lg:  'text-base px-5 py-3 gap-2',
}

export function Button({ children, variant = 'secondary', size = 'md', icon: Icon, className = '', disabled, onClick, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg border transition-all
        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {Icon && <Icon size={size === 'lg' ? 18 : 15} className="flex-shrink-0" />}
      {children}
    </button>
  )
}
