import React, { useEffect, useRef, useState } from 'react'
import { Send, Loader2, AlertCircle, MessageSquare, RefreshCw } from 'lucide-react'
import { Avatar } from './ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

// ── Role display config ────────────────────────────────────────────────────────

const ROLE_BADGE = {
  manager: 'bg-amber-50 text-amber-600',
  staff:   'bg-blue-50  text-blue-600',
  vendor:  'bg-violet-50 text-violet-600',
}

// ── DB row → display object ───────────────────────────────────────────────────

function mapRow(row) {
  return {
    id:         row.id,
    sender:     row.sender_name,
    senderRole: row.sender_role,
    content:    row.message,
    timestamp:  (row.created_at || '').slice(0, 16).replace('T', ' '),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MessageThread({ appointmentId }) {
  const { user }    = useAuth()
  const { t }       = useLanguage()
  const bottomRef   = useRef(null)

  const [messages, setMessages] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [input,    setInput]    = useState('')
  const [fetchErr, setFetchErr] = useState('')
  const [sendErr,  setSendErr]  = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchMessages() {
    setFetchErr('')
    const { data, error } = await supabase
      .from('appointment_messages')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Messages fetch error:', error)
      setFetchErr(t('appointment.fetchError'))
    } else {
      setMessages((data || []).map(mapRow))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (appointmentId) { setLoading(true); fetchMessages() }
  }, [appointmentId])

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send ───────────────────────────────────────────────────────────────────

  async function send() {
    const text = input.trim()
    if (!text || !user || sending) return
    setSending(true)
    setSendErr('')

    const { data, error } = await supabase
      .from('appointment_messages')
      .insert({
        appointment_id: appointmentId,
        sender_name:    user.name,
        sender_role:    user.role,
        message:        text,
      })
      .select()
      .single()

    if (error) {
      console.error('Send error:', error)
      setSendErr(t('appointment.sendError'))
    } else {
      setMessages(prev => [...prev, mapRow(data)])
      setInput('')
    }
    setSending(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  // No appointmentId → don't render anything (hooks already called above)
  if (!appointmentId) return null

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        {[0, 1, 2].map(i => (
          <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
            <div className="w-8 h-8 bg-slate-100 rounded-full flex-shrink-0" />
            <div className={`space-y-1.5 max-w-[60%] ${i % 2 === 0 ? '' : 'items-end flex flex-col'}`}>
              <div className="h-3 bg-slate-100 rounded w-24" />
              <div className="h-10 bg-slate-100 rounded-2xl w-40" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Fetch error ────────────────────────────────────────────────────────────

  if (fetchErr) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle size={20} className="text-red-400" />
        <p className="text-sm text-slate-500">{fetchErr}</p>
        <button
          onClick={() => { setLoading(true); fetchMessages() }}
          className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium"
        >
          <RefreshCw size={12} /> {t('common.retry')}
        </button>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {/* Message list */}
      <div className="space-y-4 max-h-72 overflow-y-auto scrollbar-thin pr-1 pb-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <MessageSquare size={18} className="text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">{t('appointment.noMessages')}</p>
          </div>
        ) : (
          messages.map(msg => {
            const isOwn      = msg.sender === user?.name
            const badgeCls   = ROLE_BADGE[msg.senderRole]  || 'bg-slate-100 text-slate-500'
            const roleLabel  = t(`roles.${msg.senderRole}`) || msg.senderRole
            return (
              <div key={msg.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                <Avatar name={msg.sender} size="sm" />
                <div className={`flex flex-col gap-1 max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium text-slate-600 ${isOwn ? 'order-last' : ''}`}>
                      {msg.sender}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isOwn
                      ? 'bg-amber-500 text-white rounded-tr-sm'
                      : 'bg-slate-100 text-slate-700 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-slate-400">{msg.timestamp}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send error */}
      {sendErr && (
        <div className="flex items-center gap-2 mt-2 text-xs text-red-500">
          <AlertCircle size={11} />
          {sendErr}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <textarea
          rows={2}
          value={input}
          onChange={e => { setInput(e.target.value); setSendErr('') }}
          onKeyDown={handleKey}
          placeholder={t('appointment.newMessage')}
          className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="w-10 h-10 self-end bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
        >
          {sending
            ? <Loader2 size={15} className="text-white animate-spin" />
            : <Send size={15} className="text-white" />
          }
        </button>
      </div>

      <p className="text-[10px] text-slate-400 mt-2">
        {t('appointment.sendingAs')} <span className="font-medium">{user?.name}</span> ({t(`roles.${user?.role}`) || user?.role}) {t('appointment.enterHint')}
      </p>
    </div>
  )
}
