// ============================================================
// FacilityFlow — send-notification-emails (L-1)
// ============================================================
//
// Scheduled/manually-triggered Edge Function that sends email versions of
// the same two alerts the in-app notification bell already shows
// (Topbar.jsx, D-3/D-4): appointment reminders (starting within 1 hour)
// and overdue alerts (target completion date has passed). This function
// does not change or depend on the bell's in-app logic — both simply read
// the same underlying columns independently.
//
// ── Recipient limitation (read this before changing recipient logic) ──────
// `appointment_requests.responsible_staff` ("Assigned POC") is free text,
// not a foreign key to `profiles.id` (see PHASE2_REQUIREMENTS.md §4-A/§4-C
// and the accepted-risk notes in README.md/SUPABASE_SETUP.md). There is no
// way to resolve it to a real email address today. This pass does NOT
// pretend otherwise:
//   - Every active admin/manager with an email on file gets every alert
//     (matches the in-app bell's existing behavior, where any internal
//     role sees the same reminder/overdue items).
//   - The vendor account tied to the appointment (via `vendor_user_id`)
//     gets the alert too, if that profile is active and has an email.
//   - The Assigned POC's name is included as plain text in the email body
//     so a human reader still knows who's responsible — it is never used
//     to address or target delivery.
// True POC-targeted delivery requires linking `responsible_staff` to a
// real `profiles.id` first — tracked as future work, not attempted here.
//
// ── Duplicate prevention ───────────────────────────────────────────────
// Every send attempt is logged to `notification_logs`, which has a unique
// constraint on (appointment_id, notification_type, recipient_email). This
// function pre-checks that table before sending, and separately treats a
// 23505 (unique_violation) on insert as "someone else already sent this"
// rather than an error — safe even if two scheduled runs overlap.
//
// ── Email delivery ──────────────────────────────────────────────────────
// Uses Resend (https://resend.com) via plain `fetch` — no SDK dependency,
// works natively in the Deno Edge Function runtime. Swap `sendEmail()` for
// another provider's REST API if Resend isn't the right choice; nothing
// else in this file depends on Resend specifically.
//
// ── Required secrets (set via `supabase secrets set`, never in frontend) ─
//   NOTIFICATION_FUNCTION_SECRET
//                      - Required. A shared secret only the scheduler (and
//                        whoever tests this manually) knows. Supabase Edge
//                        Functions accept any request bearing a valid
//                        anon or service-role key by default — which means
//                        the public frontend anon key, baked into every
//                        browser bundle, would otherwise be enough to
//                        trigger real email sends on demand. This function
//                        additionally requires an `x-notification-secret`
//                        header matching this value. Missing/mismatched →
//                        401, before any Supabase query or email send.
//                        Generate one with e.g. `openssl rand -hex 32`.
//   RESEND_API_KEY    - Resend API key. Required. Function returns a clear
//                        503 diagnostic and sends nothing if missing.
//   RESEND_FROM_EMAIL - Verified sender address/domain on the Resend
//                        account, e.g. "FacilityFlow <alerts@yourdomain>".
//                        Required, same as above.
//   APP_URL           - Optional. Base URL of the deployed app, e.g.
//                        "https://facilityflow.example.com". If set, each
//                        email includes a link to the appointment. If
//                        unset, the email is still sent without a link.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY do NOT need to be set — every
// Supabase Edge Function has these auto-injected into its environment.
// This function uses the service-role key to read across all tables and
// write to `notification_logs`, deliberately bypassing RLS the same way
// every other SECURITY DEFINER / service-role code path in this project
// does — this key never leaves the Edge Function runtime.
//
// NOTIFICATION_FUNCTION_SECRET must never be added to any frontend .env
// file or referenced from src/ — it exists only as an Edge Function secret
// and inside the pg_cron job definition that calls this function.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ACTIVE_STATUSES_EXCLUDED = ['Finished', 'Cancelled']

// Appointment date/time columns (requested_date, start_time) carry no
// timezone info of their own — the rest of the app already treats them as
// plain local wall-clock values entered in the browser (see
// ScheduleManagement.jsx / BookingForm.jsx / CalendarView.jsx comments).
// A server-side function has no "browser," so it must pick one fixed
// assumption. This deployment assumes Asia/Taipei (UTC+8, no DST) as the
// single operating timezone, matching the timezone already shown as the
// default in Settings → Display. If FacilityFlow is ever deployed for a
// different timezone, this constant is the one thing to change.
const SITE_UTC_OFFSET_HOURS = 8

function combineLocalToUtcMs(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.slice(0, 5).split(':').map(Number)
  if ([y, m, d, h, min].some(n => Number.isNaN(n))) return null
  return Date.UTC(y, m - 1, d, h, min) - SITE_UTC_OFFSET_HOURS * 3600 * 1000
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

const NOTIF_LABEL: Record<string, string> = {
  appointment_reminder: 'Appointment Starting Soon',
  overdue_alert: 'Overdue Alert',
}

type Appointment = {
  id: string
  appointment_code: string | null
  vendor_name: string | null
  equipment_type: string | null
  requested_date: string | null
  start_time: string | null
  target_completion_date: string | null
  responsible_staff: string | null
  status: string
  vendor_user_id: string | null
}

type Recipient = { email: string }

function buildEmail(
  appt: Appointment,
  notificationType: 'appointment_reminder' | 'overdue_alert',
  appUrl: string | null
) {
  const label = NOTIF_LABEL[notificationType]
  const code = appt.appointment_code || appt.id.slice(0, 8)
  const subject = `FacilityFlow — ${label}: ${code}`

  const timeLine =
    notificationType === 'appointment_reminder'
      ? `Scheduled start: ${appt.requested_date} ${(appt.start_time || '').slice(0, 5)} (Asia/Taipei)`
      : `Target completion (overdue): ${formatDateTime(appt.target_completion_date)}`

  const link = appUrl ? `\nView appointment: ${appUrl.replace(/\/$/, '')}/appointments/${appt.id}\n` : ''

  const text = [
    `FacilityFlow — ${label}`,
    '',
    `Appointment: ${code}`,
    `Vendor: ${appt.vendor_name || '—'}`,
    `Equipment: ${appt.equipment_type || '—'}`,
    timeLine,
    `Assigned POC: ${appt.responsible_staff || 'Not set'}`,
    `Status: ${appt.status}`,
    link,
    'This is an automated message from FacilityFlow. Assigned POC is shown as text only — this list is not filtered to just that person, since Assigned POC is not yet linked to a FacilityFlow account.',
  ].filter(Boolean).join('\n')

  return { subject, text }
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  apiKey: string,
  from: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) }
  }
}

Deno.serve(async (req: Request) => {
  // ── Invocation guard — checked first, before any other env read or any
  // Supabase/email call. Supabase Edge Functions accept any caller bearing
  // a valid anon or service-role key by default; the anon key is public
  // (shipped in every frontend bundle), so without this check anyone could
  // trigger real email sends by calling this URL directly. A missing or
  // mismatched secret short-circuits here — no DB query, no email, no log.
  const expectedSecret = Deno.env.get('NOTIFICATION_FUNCTION_SECRET')
  const providedSecret = req.headers.get('x-notification-secret')

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing or invalid x-notification-secret header.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL')
  const appUrl = Deno.env.get('APP_URL') || null

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from function environment (should be auto-injected by Supabase).' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!resendApiKey || !resendFrom) {
    return new Response(
      JSON.stringify({
        error: 'Email provider not configured.',
        detail: 'Set RESEND_API_KEY and RESEND_FROM_EMAIL with `supabase secrets set` before this function can send anything. No emails were sent and no notification_logs rows were written for this run.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const nowIso = new Date().toISOString()
  const todayStr = nowIso.slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const APPT_COLS = 'id, appointment_code, vendor_name, equipment_type, requested_date, start_time, target_completion_date, responsible_staff, status, vendor_user_id'

  // ── 1. Candidate appointments ─────────────────────────────────────────

  const [reminderCandidatesRes, overdueCandidatesRes] = await Promise.all([
    supabase
      .from('appointment_requests')
      .select(APPT_COLS)
      .in('requested_date', [todayStr, tomorrowStr])
      .not('status', 'in', `(${ACTIVE_STATUSES_EXCLUDED.map(s => `"${s}"`).join(',')})`),
    supabase
      .from('appointment_requests')
      .select(APPT_COLS)
      .lt('target_completion_date', nowIso)
      .not('target_completion_date', 'is', null)
      .not('status', 'in', `(${ACTIVE_STATUSES_EXCLUDED.map(s => `"${s}"`).join(',')})`),
  ])

  if (reminderCandidatesRes.error || overdueCandidatesRes.error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch candidate appointments.',
        reminderError: reminderCandidatesRes.error?.message,
        overdueError: overdueCandidatesRes.error?.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const nowMs = Date.now()
  const reminders: Appointment[] = (reminderCandidatesRes.data || []).filter((a: Appointment) => {
    const startMs = combineLocalToUtcMs(a.requested_date || '', a.start_time || '')
    if (startMs === null) return false
    const diff = startMs - nowMs
    return diff > 0 && diff <= 60 * 60 * 1000
  })
  const overdue: Appointment[] = overdueCandidatesRes.data || []

  // ── 2. Recipients ────────────────────────────────────────────────────

  const { data: internalRecipients, error: internalErr } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['admin', 'manager'])
    .eq('is_active', true)
    .not('email', 'is', null)

  if (internalErr) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch admin/manager recipients.', detail: internalErr.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const internalEmails = (internalRecipients || [])
    .map((r: Recipient) => (r.email || '').trim())
    .filter(Boolean)

  const vendorUserIds = Array.from(
    new Set([...reminders, ...overdue].map(a => a.vendor_user_id).filter(Boolean))
  ) as string[]

  const vendorEmailById = new Map<string, string>()
  if (vendorUserIds.length > 0) {
    const { data: vendorProfiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', vendorUserIds)
      .eq('is_active', true)
      .not('email', 'is', null)
    ;(vendorProfiles || []).forEach((p: { id: string; email: string }) => {
      if (p.email?.trim()) vendorEmailById.set(p.id, p.email.trim())
    })
  }

  function recipientsFor(appt: Appointment): string[] {
    const emails = new Set(internalEmails)
    if (appt.vendor_user_id && vendorEmailById.has(appt.vendor_user_id)) {
      emails.add(vendorEmailById.get(appt.vendor_user_id)!)
    }
    return Array.from(emails)
  }

  // ── 3. Skip already-sent (appointment_id, type, recipient_email) ───────

  const candidateApptIds = Array.from(new Set([...reminders, ...overdue].map(a => a.id)))

  const alreadySent = new Set<string>()
  if (candidateApptIds.length > 0) {
    const { data: existingLogs } = await supabase
      .from('notification_logs')
      .select('appointment_id, notification_type, recipient_email')
      .in('appointment_id', candidateApptIds)
      .eq('status', 'sent')
    ;(existingLogs || []).forEach((l: { appointment_id: string; notification_type: string; recipient_email: string }) => {
      alreadySent.add(`${l.appointment_id}|${l.notification_type}|${l.recipient_email}`)
    })
  }

  // ── 4. Send + log ────────────────────────────────────────────────────

  const summary = { reminders: reminders.length, overdue: overdue.length, sent: 0, failed: 0, skipped: 0 }

  async function processBatch(appts: Appointment[], type: 'appointment_reminder' | 'overdue_alert') {
    for (const appt of appts) {
      for (const email of recipientsFor(appt)) {
        const key = `${appt.id}|${type}|${email}`
        if (alreadySent.has(key)) continue

        if (!email.includes('@')) {
          await supabase.from('notification_logs').insert({
            appointment_id: appt.id, notification_type: type, recipient_email: email,
            status: 'skipped', error_message: 'Recipient email failed basic validation.',
          })
          summary.skipped++
          continue
        }

        const { subject, text } = buildEmail(appt, type, appUrl)
        const result = await sendEmail(email, subject, text, resendApiKey, resendFrom)

        const { error: insertErr } = await supabase.from('notification_logs').insert({
          appointment_id: appt.id,
          notification_type: type,
          recipient_email: email,
          status: result.ok ? 'sent' : 'failed',
          error_message: result.ok ? null : (result.error || 'Unknown send error'),
        })

        // 23505 = unique_violation. Another concurrent run already logged
        // this exact (appointment, type, recipient) — not a real failure.
        if (insertErr && insertErr.code !== '23505') {
          console.error('notification_logs insert error:', insertErr)
        }

        if (result.ok) summary.sent++
        else summary.failed++
      }
    }
  }

  await processBatch(reminders, 'appointment_reminder')
  await processBatch(overdue, 'overdue_alert')

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
