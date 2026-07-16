import React, { useEffect, useState } from 'react'
import Topbar from '../components/layout/Topbar'
import { CalendarView } from '../components/CalendarView'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabaseClient'

const VISIBLE_STATUSES = ['Approved', 'Scheduled', 'In Progress', '50% Finished', 'Delayed']

function formatTime(t) {
  if (!t) return ''
  return t.slice(0, 5)
}

function mapToCalEvent(row) {
  return {
    id:          row.id,
    vendorName:  row.vendor_name       || '',
    contactName: row.contact_name      || '',
    equipment:   row.equipment_type    || 'Other',
    date:        row.requested_date    || '',
    startTime:   formatTime(row.start_time),
    endTime:     formatTime(row.end_time),
    staffName:   row.responsible_staff || '',
    status:      row.status,
    description: row.description       || '',
    priority:    row.priority          || 'Medium',
    targetCompletionDate: row.target_completion_date || null,
  }
}

export default function Calendar() {
  const { t } = useLanguage()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .in('status', VISIBLE_STATUSES)
      .order('requested_date', { ascending: true })
      .order('start_time',     { ascending: true })

    if (error) {
      console.error('Calendar fetch error:', error)
      setAppointments([])
    } else {
      setAppointments((data || []).map(mapToCalEvent))
    }
    setLoading(false)
  }

  useEffect(() => { fetchEvents() }, [])

  return (
    <div className="flex flex-col flex-1">
      <Topbar title={t('calendar.title')} subtitle={t('calendar.subtitle')} />
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <CalendarView
            appointments={appointments}
            loading={loading}
            onRefresh={fetchEvents}
          />
        </div>
      </div>
    </div>
  )
}
