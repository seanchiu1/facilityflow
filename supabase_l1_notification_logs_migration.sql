-- ============================================================
-- FacilityFlow: Email Notification Infrastructure (L-1)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - appointment_requests has requested_date/start_time/target_completion_date/
--     responsible_staff/status/vendor_user_id/appointment_code/vendor_name/
--     equipment_type (D-2, D-6)
--   - profiles has id/role/email/display_name/is_active/vendor_name/contact_name
--     (M-3–M-8)
--
-- Scope of THIS migration:
--   1. notification_logs table — one row per (appointment, notification
--      type, recipient) send attempt, used by the send-notification-emails
--      Edge Function both to log outcomes and to prevent duplicate sends.
--   2. A unique constraint on (appointment_id, notification_type,
--      recipient_email) — the actual duplicate-prevention mechanism. The
--      Edge Function checks this table before sending, and also relies on
--      this constraint as a second line of defense against a race between
--      two overlapping scheduled runs (a 23505 violation on insert is
--      treated as "already sent," not an error).
--   3. RLS: admin/manager can SELECT (for a future audit view); no INSERT/
--      UPDATE/DELETE policy for any frontend role — the Edge Function
--      writes to this table using the service-role key, which bypasses RLS
--      entirely and always has, by design. This table is never written to
--      from the browser.
--
-- Explicitly NOT done here:
--   - No changes to any existing table or RLS policy — `responsible_staff`
--     stays free text, unchanged. See the Edge Function's own header
--     comment for why this pass emails managers/admins + the vendor
--     account (when known), not a structured "Assigned POC," and only
--     includes the POC name as text in the email body.
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.notification_logs (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid references public.appointment_requests(id) on delete cascade,
  notification_type text not null,
  recipient_email   text not null,
  sent_at           timestamptz not null default now(),
  status            text not null default 'sent',
  error_message     text,
  created_at        timestamptz not null default now()
);

alter table public.notification_logs
  drop constraint if exists notification_logs_type_check;

alter table public.notification_logs
  add constraint notification_logs_type_check
  check ( notification_type in ('appointment_reminder', 'overdue_alert') );

alter table public.notification_logs
  drop constraint if exists notification_logs_status_check;

alter table public.notification_logs
  add constraint notification_logs_status_check
  check ( status in ('sent', 'failed', 'skipped') );

-- Duplicate-prevention constraint — the core of "send at most once per
-- appointment/recipient/type."
alter table public.notification_logs
  drop constraint if exists notification_logs_dedupe_unique;

alter table public.notification_logs
  add constraint notification_logs_dedupe_unique
  unique (appointment_id, notification_type, recipient_email);

create index if not exists idx_notification_logs_appointment
  on public.notification_logs(appointment_id);

-- 3. RLS ---------------------------------------------------------------

alter table public.notification_logs enable row level security;

drop policy if exists "admins and managers read notification logs" on public.notification_logs;

create policy "admins and managers read notification logs"
  on public.notification_logs for select
  using ( public.is_admin_or_manager() );

-- No insert/update/delete policy for any authenticated role — writes only
-- ever happen via the Edge Function's service-role client, which bypasses
-- RLS. This is intentional, not an oversight.
