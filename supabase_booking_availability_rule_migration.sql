-- ============================================================================
-- FacilityFlow — Booking Availability Rule Update
-- ============================================================================
--
-- New product rule (ahead of the real vendor pilot): staff are NOT
-- equipment specialists. Any staff member assigned to a bookable time slot
-- can handle any equipment/machine type, and staff have no capacity limit
-- on how many vendors can book the same slot. Vendor booking availability
-- should depend only on the date/time slot existing — never on equipment
-- type, and never on a remaining-capacity check.
--
-- Equipment type is still collected on the appointment request itself
-- (appointment_requests.equipment_type is unchanged) — it's just no longer
-- used to filter which staff time slots a vendor can see or pick.
--
-- Same function name AND same signature as before (both parameters still
-- required, same names/types/order) — this is the "keep the existing RPC
-- signature, just ignore equipment_type" option, chosen over adding a
-- second overload: a second overload with a reordered/defaulted parameter
-- would require either reordering (making CREATE OR REPLACE register a
-- second, ambiguous overload instead of replacing this one) or a trailing
-- DEFAULT after a non-default parameter (not valid Postgres — defaults
-- must trail in the declaration). Keeping the signature identical avoids
-- both problems and every existing caller (BookingForm.jsx included) keeps
-- working unchanged; BookingForm.jsx is updated in this same change to
-- stop re-fetching on equipment-type changes, but still passes it through
-- harmlessly.
--
-- capacity/booked-count "fullness" was never enforced by this RPC or any
-- RLS policy — that logic lived entirely in BookingForm.jsx (computing
-- booked/capacity client-side via the slot_booking_counts view and
-- disabling "full" slots). Nothing on the database side needs to change
-- to stop enforcing it; BookingForm.jsx's UI is what's updated to stop
-- computing/showing it. staff_schedules.capacity is left in place,
-- unused for availability going forward — see BOOKING_AVAILABILITY_DEBUG.md.
--
-- No RLS change: staff_schedules keeps its existing admin/manager-only
-- direct-read policy (from supabase_vendor_schedule_privacy_fix_migration.sql)
-- — vendors still only ever reach this data through this RPC.
-- ============================================================================

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
  -- p_equipment_type is accepted (kept for signature/call-site
  -- compatibility and because it's still meaningful as data on the
  -- appointment request itself) but deliberately NOT used to filter —
  -- any staff time slot on the requested date is available regardless of
  -- what equipment type the vendor is booking for.
  select id, staff_name, start_time, end_time, capacity, notes
  from public.staff_schedules
  where schedule_date = p_schedule_date
  order by start_time;
$$;

revoke all on function public.get_available_schedule_slots(text, date) from public, anon;
grant execute on function public.get_available_schedule_slots(text, date) to authenticated;
