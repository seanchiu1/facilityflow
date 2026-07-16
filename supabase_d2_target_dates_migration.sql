-- ============================================================
-- FacilityFlow: D-2 — Start Date, Target Completion Date
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: PHASE2_REQUIREMENTS.md §4-A, PHASE2_ROADMAP.md Bucket 2 (D-2)
--
-- Prerequisites (already done):
--   - RLS enabled on all six tables (see RLS_PRIVATE_STORAGE_PLAN.md)
--   - Account foundation (M-3–M-7) and maintenance report gate (D-1) complete
--
-- Scope of THIS migration:
--   1. Add start_date / target_completion_date to appointment_requests
--   2. Add an index on target_completion_date, anticipating D-4's future
--      overdue query shape (target_completion_date < now() and status
--      not in ('Finished','Cancelled')) — harmless to add now, saves a
--      migration later
--
-- Explicitly NOT done here:
--   - No new "assigned POC" column — Assigned POC is the existing
--     responsible_staff column, per PHASE2_REQUIREMENTS.md §4-A
--   - No RLS policy changes — these are new columns on a table that
--     already has RLS enabled (see RLS_PRIVATE_STORAGE_PLAN.md §2); the
--     existing SELECT/UPDATE policies are row-level, so they already
--     cover the new columns for whichever rows a role can already see
--   - No reminder (D-3) or overdue (D-4) notification logic — this
--     migration is data foundation only
--
-- Idempotent: safe to re-run. Columns and index use IF NOT EXISTS.
-- ============================================================

alter table public.appointment_requests
  add column if not exists start_date timestamptz,
  add column if not exists target_completion_date timestamptz;

create index if not exists idx_appointment_requests_target_completion_date
  on public.appointment_requests(target_completion_date);
