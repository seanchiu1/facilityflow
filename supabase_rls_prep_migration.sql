-- ============================================================
-- FacilityFlow: RLS preparation — Step 1 (helpers + capacity view)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Scope of THIS migration only:
--   1. Three role-check helper functions, for later RLS policies
--      (see RLS_PRIVATE_STORAGE_PLAN.md §0). They are inert until
--      RLS is actually enabled on a table that references them —
--      this migration does not enable RLS anywhere.
--   2. A privacy-safe capacity view (`slot_booking_counts`) that
--      BookingForm now reads instead of raw `appointment_requests`,
--      so the vendor "2/3 booked" indicator keeps working once
--      appointment_requests does get a vendor-scoped SELECT policy
--      in a future migration (see RLS_PRIVATE_STORAGE_PLAN.md
--      Risk R-2).
--
-- Explicitly NOT done here (per instructions):
--   - Row Level Security is NOT enabled on any table
--   - Storage is untouched — bucket stays public, existing
--     "demo: public read" / "demo: public upload" policies stay
-- ============================================================

-- 1. Role-check helper functions -------------------------------------------
-- SECURITY DEFINER: each function reads `profiles` as the function owner
-- (bypassing profiles' own future RLS), so they can be called safely from
-- any future RLS policy without recursion concerns. They resolve to
-- NULL/false for an unauthenticated caller.

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'manager'), false);
$$;

create or replace function public.is_internal_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'manager', 'staff'), false);
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin_or_manager()   to authenticated;
grant execute on function public.is_internal_role()      to authenticated;

-- 2. Privacy-safe slot capacity view ----------------------------------------
-- Exposes ONLY responsible_staff, requested_date, start_time, and a
-- booked_count aggregate. Never exposes vendor_name, contact_name,
-- vendor_user_id, description, or appointment id.
--
-- IMPORTANT: this is a plain view with no `security_invoker` option, so
-- (Postgres default behavior) it runs with the view OWNER's privileges,
-- not the querying user's. That is intentional: it lets a vendor see the
-- true booked count across ALL vendors for a slot, without ever exposing
-- any other vendor's identity or appointment details, even after
-- appointment_requests gets a vendor-scoped RLS policy. Do not add columns
-- to this view without re-checking that this assumption still holds.

create or replace view public.slot_booking_counts as
select
  responsible_staff,
  requested_date,
  start_time,
  count(*) as booked_count
from appointment_requests
where status <> 'Cancelled'
group by responsible_staff, requested_date, start_time;

grant select on public.slot_booking_counts to authenticated;
