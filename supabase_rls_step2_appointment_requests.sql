-- ============================================================
-- FacilityFlow: RLS Step 2 — appointment_requests table only
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §2
--
-- Prerequisites (already done):
--   - supabase_rls_prep_migration.sql run (helper functions +
--     slot_booking_counts view; BookingForm.jsx already uses the view)
--   - supabase_rls_step1_profiles.sql run and tested
--   - vendor_user_id backfill confirmed — 0 NULL rows remain, so the
--     legacy name-match fallback (Risk R-3) is not needed here
--
-- Scope of THIS migration only:
--   - Enable Row Level Security on public.appointment_requests
--   - SELECT: internal roles (admin/manager/staff) see all rows;
--     vendors see only rows where vendor_user_id = auth.uid()
--   - INSERT: vendors may insert only their own
--     (vendor_user_id = auth.uid()); admin/manager may also insert
--     (forward-compatible with a future "create on behalf of vendor"
--     feature — not currently used by any UI)
--   - UPDATE: internal roles only, any row
--   - No DELETE policy — no delete UI exists
--
-- Explicitly NOT done here:
--   - No RLS on appointment_messages, appointment_documents,
--     status_updates, or staff_schedules
--   - No storage changes — bucket stays public, existing
--     "demo: public read" / "demo: public upload" policies stay
--
-- Idempotent: safe to re-run. ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; each policy is dropped
-- and recreated by name rather than erroring on conflict.
-- ============================================================

alter table public.appointment_requests enable row level security;

drop policy if exists "internal reads all appointments"      on public.appointment_requests;
drop policy if exists "vendor reads own appointments"         on public.appointment_requests;
drop policy if exists "vendor inserts own appointment"        on public.appointment_requests;
drop policy if exists "internal inserts appointment"          on public.appointment_requests;
drop policy if exists "internal updates any appointment"      on public.appointment_requests;

-- SELECT ---------------------------------------------------------------

create policy "internal reads all appointments"
  on public.appointment_requests for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointments"
  on public.appointment_requests for select
  using ( vendor_user_id = auth.uid() );

-- INSERT ---------------------------------------------------------------

create policy "vendor inserts own appointment"
  on public.appointment_requests for insert
  with check ( vendor_user_id = auth.uid() );

create policy "internal inserts appointment"
  on public.appointment_requests for insert
  with check ( public.is_admin_or_manager() );

-- UPDATE ---------------------------------------------------------------

create policy "internal updates any appointment"
  on public.appointment_requests for update
  using ( public.is_internal_role() );

-- No DELETE policy — default deny, no delete UI exists.
