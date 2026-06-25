import { supabase } from './supabaseClient'

/**
 * Records a status transition in the status_updates table.
 * Always call AFTER the appointment_requests.status update succeeds.
 * Returns { error } — caller decides whether to surface a warning.
 */
export async function recordStatusChange(appointmentId, oldStatus, newStatus, user) {
  const { error } = await supabase
    .from('status_updates')
    .insert({
      appointment_id:  appointmentId,
      old_status:      oldStatus      || null,
      new_status:      newStatus,
      changed_by:      user?.name     || '',
      changed_by_role: user?.role     || '',
    })
  return { error }
}
