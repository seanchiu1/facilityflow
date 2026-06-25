import React from 'react'

export function StatCard({ label, value, sub, icon: Icon, accent, trend }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 flex gap-4 items-start hover:shadow-card-hover transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accent || 'bg-slate-100'}`}>
        {Icon && <Icon size={20} className={accent ? 'text-white' : 'text-slate-500'} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900 font-display leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      {trend !== undefined && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start mt-1 ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
  )
}
