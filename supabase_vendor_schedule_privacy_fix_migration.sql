-- ============================================================================
-- FacilityFlow — Vendor Schedule Privacy Fix
-- ============================================================================
--
-- Found during the pre-pilot vendor isolation audit: `staff_schedules` had a
-- SELECT policy ("any authenticated user reads schedule slots", qual
-- `auth.role() = 'authenticated'`) that granted every authenticated user —
-- including every vendor — full, unscoped read access to the entire table:
-- every equipment type, every date, every staff member's name, and every
-- free-text `notes` field, regardless of what that vendor is actually
-- booking. Confirmed live (read-only, rolled back): a vendor session could
-- run `select * from staff_schedules` and get all rows, not just the
-- equipment_type + schedule_date combination the booking UI shows them.
--
-- The booking flow's actual need is narrower and already well-defined by
-- `BookingForm.jsx`'s existing query shape: staff name + time window +
-- capacity + notes for ONE equipment_type + ONE schedule_date at a time —
-- enough to pick a slot, nothing about unrelated dates or equipment types.
--
-- Fix: replace the blanket table-level SELECT policy with a narrow
-- SECURITY DEFINER RPC that returns exactly that shape, scoped to the
-- caller-supplied equipment_type + schedule_date, and restrict direct table
-- reads to admin/manager (who already have full access via the existing
-- "admin/manager manages schedule slots" ALL policy — this migration adds
-- no new admin/manager policy, just removes the over-broad one below).
--
-- No change to `slot_booking_counts` (already vendor-safe — reviewed
-- separately, see PILOT audit report: it exposes only an aggregate count,
-- never vendor identity) and no change to `appointment_requests` (vendor
-- SELECT was already correctly scoped to `vendor_user_id = auth.uid()`).
-- ============================================================================

-- 1. Remove the over-broad SELECT policy. Admin/manager keep full read
--    access via the pre-existing "admin/manager manages schedule slots" ALL
--    policy — this statement removes vendor/staff's incidental blanket
--    access, which no shipped frontend page for either role relies on
--    (only BookingForm.jsx and the admin/manager-only ScheduleManagement.jsx
--    query this table, and BookingForm.jsx is updated in this same change
--    to use the new RPC below instead of a direct table read).
drop policy if exists "any authenticated user reads schedule slots" on public.staff_schedules;

-- 2. Vendor-safe (and generally caller-safe) slot lookup — returns only the
--    rows matching the exact equipment_type + schedule_date requested, never
--    the full table. SECURITY DEFINER so it can read past the now-tightened
--    RLS on staff_schedules; the scoping is enforced by the WHERE clause,
--    not by trusting the caller.
create or replace function public.get_available_schedule_slots(
  p_equipment_type text,
  p_schedule_date  date
)
returns table (
  id         uuid,
  staff_name text,
  start_time time,
  end_time   time,
  capacity   int,
  notes      text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, staff_name, start_time, end_time, capacity, notes
  from public.staff_schedules
  where equipment_type = p_equipment_type
    and schedule_date  = p_schedule_date
  order by start_time;
$$;

revoke all on function public.get_available_schedule_slots(text, date) from public, anon;
grant execute on function public.get_available_schedule_slots(text, date) to authenticated;
