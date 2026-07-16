-- ============================================================
-- FacilityFlow: RLS Step 4 — status_updates table only
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §5
--
-- Prerequisites (already done):
--   - supabase_rls_prep_migration.sql run (helper functions +
--     slot_booking_counts view)
--   - supabase_rls_step1_profiles.sql run and tested
--   - supabase_rls_step2_appointment_requests.sql run and tested
--   - supabase_rls_step3_messages_documents.sql run and tested
--   - vendor_user_id backfill confirmed — 0 NULL rows
--
-- Scope of THIS migration only:
--   - Enable Row Level Security on public.status_updates
--   - SELECT: internal roles see all rows; vendors see only rows
--     whose parent appointment they own (joined via appointment_id
--     -> appointment_requests.id -> vendor_user_id = auth.uid()),
--     since status_updates has no vendor_user_id column of its own
--   - INSERT: internal roles only — vendors have no INSERT policy
--     at all, matching that no vendor-facing UI ever writes here
--   - No UPDATE or DELETE policy — history stays immutable
--
-- Hardening included (see report for verification):
--   - Internal INSERT policy additionally requires
--     changed_by_role = public.current_profile_role(). Verified
--     safe: the only DB write path is statusHistory.js's
--     recordStatusChange(), which always sends user.role straight
--     from AuthContext (the raw 'manager'/'staff'/'vendor' value,
--     never a display label like "Facilities Manager"). No other
--     write path exists.
--
-- Explicitly NOT done here:
--   - storage.objects is untouched — bucket stays public
--   - No RLS on staff_schedules
--
-- Idempotent: safe to re-run. ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; each policy is dropped
-- and recreated by name rather than erroring on conflict.
-- ============================================================

alter table public.status_updates enable row level security;

drop policy if exists "internal reads all status history"           on public.status_updates;
drop policy if exists "vendor reads own appointment status history" on public.status_updates;
drop policy if exists "internal inserts status history"              on public.status_updates;

-- SELECT ---------------------------------------------------------------

create policy "internal reads all status history"
  on public.status_updates for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment status history"
  on public.status_updates for select
  using (
    exists (
      select 1 from public.appointment_requests ar
      where ar.id = status_updates.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

-- INSERT ---------------------------------------------------------------
-- Internal roles only — no vendor INSERT policy at all, matching that
-- no vendor-facing UI writes to this table today.

create policy "internal inserts status history"
  on public.status_updates for insert
  with check (
    public.is_internal_role()
    and changed_by_role = public.current_profile_role()
  );

-- No UPDATE / DELETE policy — history is immutable by design.
