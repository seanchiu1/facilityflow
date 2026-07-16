-- ============================================================
-- FacilityFlow: D-1 — Maintenance report upload + QC approval gate
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: PHASE2_REQUIREMENTS.md §3-A, PHASE2_ROADMAP.md Bucket 2 (D-1)
--
-- Prerequisites (already done):
--   - RLS enabled on all six tables (see RLS_PRIVATE_STORAGE_PLAN.md)
--   - appointment-documents storage bucket is private, signed URLs in use
--   - Helper functions current_profile_role(), is_admin_or_manager(),
--     is_internal_role() exist (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration:
--   1. Add document_type / approval_status / reviewed_by / reviewed_at /
--      review_note columns to appointment_documents
--   2. Backfill is automatic: existing rows get document_type =
--      'supporting_doc' (NOT NULL DEFAULT) and approval_status = null
--      (DEFAULT null) the moment the columns are added — no separate
--      UPDATE statement needed
--   3. Add check constraints for both new text columns
--   4. Add one new RLS UPDATE policy: internal roles only, scoped to
--      maintenance_report rows, for the review columns (closes
--      RLS_PRIVATE_STORAGE_PLAN.md Risk R-6)
--
-- Explicitly unchanged:
--   - SELECT/INSERT policies on appointment_documents — new documents
--     insert the same way as before; the app sets document_type and
--     (for maintenance reports) approval_status = 'pending' at insert
--     time from the client, not via a DB trigger
--   - No DELETE policy — still not granted to any role
--   - No changes to any other table
--
-- Idempotent: safe to re-run. Columns use IF NOT EXISTS; constraints
-- and the policy are dropped and recreated by name.
-- ============================================================

-- 1. New columns ---------------------------------------------------------

alter table public.appointment_documents
  add column if not exists document_type   text not null default 'supporting_doc',
  add column if not exists approval_status text default null,
  add column if not exists reviewed_by     uuid references public.profiles(id),
  add column if not exists reviewed_at     timestamptz,
  add column if not exists review_note     text;

-- 2. Constraints -----------------------------------------------------------

alter table public.appointment_documents
  drop constraint if exists appointment_documents_document_type_check;

alter table public.appointment_documents
  add constraint appointment_documents_document_type_check
  check ( document_type in ('supporting_doc', 'maintenance_report') );

alter table public.appointment_documents
  drop constraint if exists appointment_documents_approval_status_check;

alter table public.appointment_documents
  add constraint appointment_documents_approval_status_check
  check ( approval_status is null or approval_status in ('pending', 'approved', 'rejected') );

-- 3. RLS: internal roles can review maintenance reports ---------------------
-- Row-level only (see RLS_PRIVATE_STORAGE_PLAN.md Risk R-7) — this does not
-- restrict internal roles to only touching the review columns, only to
-- rows where document_type = 'maintenance_report'. The app itself only
-- ever sends {approval_status, reviewed_by, reviewed_at, review_note} on
-- these updates.

drop policy if exists "internal reviews maintenance reports" on public.appointment_documents;

create policy "internal reviews maintenance reports"
  on public.appointment_documents for update
  using (
    public.is_internal_role()
    and document_type = 'maintenance_report'
  )
  with check (
    public.is_internal_role()
    and document_type = 'maintenance_report'
  );

-- No DELETE policy — unchanged, no delete-document UI exists.
