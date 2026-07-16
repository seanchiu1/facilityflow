-- ============================================================
-- FacilityFlow: RLS Step 1 — profiles table only
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §1
--
-- Scope of THIS migration only:
--   - Enable Row Level Security on public.profiles
--   - Add the minimum SELECT policy current app behavior needs:
--     a user may read their own profile row (auth.uid() = id)
--
-- Explicitly NOT done here:
--   - No RLS on appointment_requests, appointment_messages,
--     appointment_documents, status_updates, or staff_schedules
--   - No storage changes — bucket stays public, existing
--     "demo: public read" / "demo: public upload" policies stay
--   - No INSERT/UPDATE/DELETE policy on profiles — current app
--     code never writes to this table client-side (profile rows
--     are created via the Supabase Dashboard / service role)
--
-- Idempotent: safe to re-run. ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY is a no-op if already enabled; the policy is dropped
-- and recreated by name rather than erroring on conflict.
-- ============================================================

alter table public.profiles enable row level security;

drop policy if exists "self read own profile" on public.profiles;

create policy "self read own profile"
  on public.profiles for select
  using ( auth.uid() = id );
