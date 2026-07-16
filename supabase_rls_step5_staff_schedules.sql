-- ============================================================
-- FacilityFlow: RLS Step 5 — staff_schedules table only
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §6
--
-- Prerequisites (already done):
--   - supabase_rls_prep_migration.sql run (helper functions +
--     slot_booking_counts view)
--   - supabase_rls_step1_profiles.sql run and tested
--   - supabase_rls_step2_appointment_requests.sql run and tested
--   - supabase_rls_step3_messages_documents.sql run and tested
--   - supabase_rls_step4_status_updates.sql run and tested
--
-- Scope of THIS migration only:
--   - Enable Row Level Security on public.staff_schedules
--   - SELECT: any authenticated user (admin/manager/staff/vendor) —
--     this table has no vendor-identifying or personal data
--     (staff name, equipment type, time, capacity, notes), and
--     vendors need to see every slot to book into it via BookingForm
--   - INSERT/UPDATE/DELETE: admin/manager only, matching that
--     Schedule Management is a manager-only route with no staff or
--     vendor write path
--   - No anonymous access — SELECT requires an authenticated JWT,
--     not just the anon key alone
--
-- Explicitly NOT done here:
--   - storage.objects is untouched — bucket stays public
--   - No signed-URL changes in AppointmentDetail.jsx
--
-- This is the last table in the Bucket 1 table-by-table rollout —
-- storage is the only remaining piece from RLS_PRIVATE_STORAGE_PLAN.md.
--
-- Idempotent: safe to re-run. ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; each policy is dropped
-- and recreated by name rather than erroring on conflict.
-- ============================================================

alter table public.staff_schedules enable row level security;

drop policy if exists "any authenticated user reads schedule slots" on public.staff_schedules;
drop policy if exists "admin/manager manages schedule slots"        on public.staff_schedules;

-- SELECT ---------------------------------------------------------------
-- auth.role() = 'authenticated' requires a valid session JWT — the
-- anon key alone (no logged-in user) does not satisfy this, so there
-- is no anonymous access.

create policy "any authenticated user reads schedule slots"
  on public.staff_schedules for select
  using ( auth.role() = 'authenticated' );

-- INSERT / UPDATE / DELETE ----------------------------------------------

create policy "admin/manager manages schedule slots"
  on public.staff_schedules for all
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );
