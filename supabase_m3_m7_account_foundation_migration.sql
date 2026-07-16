-- ============================================================
-- FacilityFlow: Phase 2 lightweight account foundation (M-3–M-6)
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: PHASE2_ROADMAP.md Bucket 1, items M-3 through M-6
--
-- Prerequisites (already done):
--   - RLS enabled on all six tables (see RLS_PRIVATE_STORAGE_PLAN.md)
--   - Maintenance report gate (D-1) complete
--
-- Scope of THIS migration:
--   1. Add is_active (M-3) and is_conductor (M-6) columns to profiles
--   2. Widen the profiles.role check constraint to allow 'admin' (M-5)
--
-- Explicitly NOT done here:
--   - No RLS policy changes needed — the existing "self read own profile"
--     policy (auth.uid() = id) is row-level, so it already covers these
--     new columns for the owning user. No other role can read another
--     user's profile today (unchanged, tracked separately if/when an
--     admin roster/user-management page is built).
--   - No admin route/UI beyond the route-guard groundwork in App.jsx —
--     see the accompanying frontend changes, not this SQL file.
--   - M-4 (forgot-password) and M-7 (vendor invite docs) need no schema
--     changes; forgot-password uses Supabase Auth's built-in recovery
--     flow, and M-7 is a documentation-only change.
--
-- Idempotent: safe to re-run. Columns use IF NOT EXISTS; the role
-- constraint is dropped and recreated by name.
-- ============================================================

-- 1. New columns ---------------------------------------------------------

alter table public.profiles
  add column if not exists is_active    boolean not null default true,
  add column if not exists is_conductor boolean not null default false;

-- 2. Widen the role constraint to allow 'admin' -----------------------------
-- The original constraint was defined inline on the column at table-creation
-- time (see SUPABASE_SETUP.md §0), which Postgres names
-- "profiles_role_check" by default. If your database used a different name
-- (e.g., because the table was created differently), find it first with:
--
--   select conname from pg_constraint
--     where conrelid = 'public.profiles'::regclass and contype = 'c';
--
-- and substitute that name below.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check ( role in ('admin', 'manager', 'staff', 'vendor') );
