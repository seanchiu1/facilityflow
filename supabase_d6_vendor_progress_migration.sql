-- ============================================================
-- FacilityFlow: D-6 — Vendor progress % quick win
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: PHASE2_REQUIREMENTS.md §6-C, PHASE2_ROADMAP.md Bucket 2 (D-6)
--
-- Prerequisites (already done):
--   - RLS enabled on all tables including appointment_requests
--     (see RLS_PRIVATE_STORAGE_PLAN.md §2 — vendors have NO UPDATE
--     policy on appointment_requests today; this is relevant below)
--   - Helper functions current_profile_role(), is_internal_role()
--     exist (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration:
--   1. Add progress_percent to appointment_requests (0-100, default 0)
--   2. Add an RPC function update_appointment_progress() instead of a
--      broad vendor UPDATE policy — see rationale below
--
-- Why an RPC instead of a vendor UPDATE policy:
--   Postgres RLS is row-level, not column-level (see
--   RLS_PRIVATE_STORAGE_PLAN.md Risk R-7). A vendor UPDATE policy on
--   appointment_requests — even one scoped to "own rows only" via
--   vendor_user_id = auth.uid() — would let a vendor's browser send an
--   UPDATE touching ANY column on their own row, including status,
--   responsible_staff, target_completion_date, priority, or anything
--   else, not just progress_percent. Since vendors currently have no
--   UPDATE access at all, adding one — even "scoped" — would be a much
--   bigger permission grant than "let vendors set their own progress
--   number." A SECURITY DEFINER RPC function does exactly one thing
--   (update progress_percent, after an explicit ownership/role check)
--   and nothing else, which is the narrowest correct grant.
--
-- Explicitly NOT done here:
--   - No new UPDATE policy on appointment_requests for vendors
--   - No progress history/audit table
--   - No changes to the status lifecycle — 100% progress does not
--     change status; Finished is still controlled by the existing
--     status workflow and maintenance report approval gate
--
-- Idempotent: safe to re-run. Column/constraint use IF NOT EXISTS or
-- are dropped and recreated by name; function uses CREATE OR REPLACE.
-- ============================================================

-- 1. Column ------------------------------------------------------------

alter table public.appointment_requests
  add column if not exists progress_percent integer not null default 0;

alter table public.appointment_requests
  drop constraint if exists appointment_requests_progress_percent_check;

alter table public.appointment_requests
  add constraint appointment_requests_progress_percent_check
  check ( progress_percent between 0 and 100 );

-- 2. RPC: update_appointment_progress ---------------------------------------
-- SECURITY DEFINER — runs with the function owner's privileges, bypassing
-- RLS on appointment_requests for this one UPDATE, but only after this
-- function's own explicit checks pass. Callable by: internal roles
-- (admin/manager/staff) on any appointment, or a vendor on an appointment
-- where vendor_user_id = auth.uid(). No one else can call it successfully.

create or replace function public.update_appointment_progress(
  appointment_id uuid,
  new_progress integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_user_id uuid;
begin
  if new_progress is null or new_progress < 0 or new_progress > 100 then
    raise exception 'progress_percent must be between 0 and 100';
  end if;

  select vendor_user_id into v_vendor_user_id
  from appointment_requests
  where id = appointment_id;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if not ( public.is_internal_role() or v_vendor_user_id = auth.uid() ) then
    raise exception 'Not authorized to update this appointment''s progress';
  end if;

  update appointment_requests
    set progress_percent = new_progress
    where id = appointment_id;
end;
$$;

grant execute on function public.update_appointment_progress(uuid, integer) to authenticated;
