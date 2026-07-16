-- ============================================================
-- FacilityFlow: RLS Step 3 — appointment_messages + appointment_documents
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §3, §4
--
-- Prerequisites (already done):
--   - supabase_rls_prep_migration.sql run (helper functions +
--     slot_booking_counts view)
--   - supabase_rls_step1_profiles.sql run and tested
--   - supabase_rls_step2_appointment_requests.sql run and tested
--   - vendor_user_id backfill confirmed — 0 NULL rows
--
-- Scope of THIS migration only:
--   - Enable Row Level Security on public.appointment_messages
--   - Enable Row Level Security on public.appointment_documents
--   - Ownership for both is checked by joining to
--     appointment_requests.appointment_id and comparing
--     vendor_user_id = auth.uid() (neither table has its own
--     vendor_user_id column)
--   - No UPDATE or DELETE policy on either table — no edit/delete
--     UI exists for messages or documents today
--
-- Hardening included (see report for verification):
--   - appointment_messages INSERT policies additionally require
--     sender_role = public.current_profile_role(). Verified safe:
--     MessageThread.jsx is the only place sender_role is ever
--     written, and it always sends user.role straight from
--     AuthContext, which is sourced from the same profiles.role
--     row current_profile_role() reads. No other write path exists.
--
-- Explicitly NOT done here:
--   - storage.objects is untouched — bucket stays public, existing
--     "demo: public read" / "demo: public upload" policies stay
--   - No RLS on status_updates or staff_schedules
--   - No UPDATE/DELETE policy on appointment_documents (the future
--     maintenance-report approval workflow will need one — not yet)
--
-- Idempotent: safe to re-run. ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; each policy is dropped
-- and recreated by name rather than erroring on conflict.
-- ============================================================

-- ── appointment_messages ────────────────────────────────────────────────

alter table public.appointment_messages enable row level security;

drop policy if exists "internal reads all messages"                on public.appointment_messages;
drop policy if exists "vendor reads own appointment messages"      on public.appointment_messages;
drop policy if exists "internal inserts any message"                on public.appointment_messages;
drop policy if exists "vendor inserts message on own appointment"  on public.appointment_messages;

create policy "internal reads all messages"
  on public.appointment_messages for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment messages"
  on public.appointment_messages for select
  using (
    exists (
      select 1 from public.appointment_requests ar
      where ar.id = appointment_messages.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal inserts any message"
  on public.appointment_messages for insert
  with check (
    public.is_internal_role()
    and sender_role = public.current_profile_role()
  );

create policy "vendor inserts message on own appointment"
  on public.appointment_messages for insert
  with check (
    exists (
      select 1 from public.appointment_requests ar
      where ar.id = appointment_messages.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
    and sender_role = public.current_profile_role()
  );

-- No UPDATE / DELETE policy — default deny, no edit/delete-message UI exists.

-- ── appointment_documents ───────────────────────────────────────────────

alter table public.appointment_documents enable row level security;

drop policy if exists "internal reads all documents"                    on public.appointment_documents;
drop policy if exists "vendor reads own appointment documents"          on public.appointment_documents;
drop policy if exists "internal inserts document metadata"              on public.appointment_documents;
drop policy if exists "vendor inserts document metadata for own appointment" on public.appointment_documents;

create policy "internal reads all documents"
  on public.appointment_documents for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment documents"
  on public.appointment_documents for select
  using (
    exists (
      select 1 from public.appointment_requests ar
      where ar.id = appointment_documents.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal inserts document metadata"
  on public.appointment_documents for insert
  with check ( public.is_internal_role() );

create policy "vendor inserts document metadata for own appointment"
  on public.appointment_documents for insert
  with check (
    exists (
      select 1 from public.appointment_requests ar
      where ar.id = appointment_documents.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE policy yet — see RLS_PRIVATE_STORAGE_PLAN.md Risk R-6
-- (the future maintenance-report approval workflow will need an UPDATE
-- policy once approval_status/reviewed_by columns exist).
