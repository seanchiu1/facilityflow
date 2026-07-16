-- ============================================================
-- FacilityFlow: Admin User Management (M-8)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - RLS enabled on profiles (supabase_rls_step1_profiles.sql)
--   - is_active / is_conductor / widened role check
--     (supabase_m3_m7_account_foundation_migration.sql)
--
-- Scope of THIS migration:
--   1. Add profiles.email (nullable) — see "Why a column, not a live
--      auth.users read" below.
--   2. Add an is_admin() helper, matching the existing helper pattern in
--      supabase_rls_prep_migration.sql.
--   3. Two new profiles RLS policies, additive to the existing
--      "self read own profile" policy (Postgres OR's same-command
--      policies together — non-admins are unaffected):
--        - admins can SELECT every profile (for the /admin/users list)
--        - admins can UPDATE every profile, with a WITH CHECK clause that
--          blocks an admin from changing their OWN role away from 'admin'
--          or their own is_active to false — enforced at the database
--          level, not just disabled buttons in the UI (same
--          belt-and-suspenders pattern as the D-1 maintenance-report gate).
--
-- Why a column, not a live auth.users read:
--   Supabase does not expose the `auth` schema through the client
--   library/PostgREST — the frontend cannot query auth.users at all,
--   with or without RLS, without a service-role key (which must never
--   reach the browser). The two real options were: (a) a database
--   trigger on auth.users that syncs email into profiles automatically,
--   or (b) a plain nullable column populated at account-creation time,
--   the same way vendor_name/contact_name already are. This migration
--   takes (b) — it is the smaller, safer change: no trigger on the
--   protected auth schema, nothing to get out of sync silently, and it
--   matches this project's existing manual account-creation process
--   (SUPABASE_SETUP.md "Creating demo users" / "Vendor account invites").
--   The tradeoff: email must be entered manually per user (one extra
--   field in an INSERT/UPDATE that was already manual), and existing
--   rows created before this migration will show no email until
--   backfilled. See SUPABASE_SETUP.md for the updated account-creation
--   steps.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. New column --------------------------------------------------------

alter table public.profiles
  add column if not exists email text;

-- 2. Admin-only helper ---------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false);
$$;

grant execute on function public.is_admin() to authenticated;

-- 3. Admin SELECT-all policy ----------------------------------------------

drop policy if exists "admins read all profiles" on public.profiles;

create policy "admins read all profiles"
  on public.profiles for select
  using ( public.is_admin() );

-- 4. Admin UPDATE-all policy, with self-demotion/self-deactivation guard --

drop policy if exists "admins update any profile" on public.profiles;

create policy "admins update any profile"
  on public.profiles for update
  using ( public.is_admin() )
  with check (
    public.is_admin()
    and (
      -- Editing someone else's row: no extra restriction beyond is_admin().
      id <> auth.uid()
      -- Editing your OWN row: the resulting row must still be an active
      -- admin. This is what actually stops "remove my own admin role" or
      -- "deactivate myself" from succeeding, even if the UI's disabled
      -- controls were somehow bypassed.
      or (role = 'admin' and is_active = true)
    )
  );

-- Non-admins (manager/staff/vendor) get no INSERT/UPDATE/DELETE policy on
-- profiles at all — unchanged from before this migration. They can still
-- only SELECT their own row via the pre-existing "self read own profile"
-- policy.
