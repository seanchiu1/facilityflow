-- ============================================================================
-- FacilityFlow — Staff Profile Linking (Schedule + Duty Roster)
-- ============================================================================
--
-- Found while debugging: "I added a person to Duty Roster, but Vendor
-- Booking still says No available slots."
--
-- Root cause (two layers, see BOOKING_AVAILABILITY_DEBUG.md for the full
-- writeup): `duty_rosters` (on-call coverage) and `staff_schedules`
-- (per-equipment-type booking capacity) are, and remain, intentionally
-- separate tables — a resolved design decision from PHASE2_REQUIREMENTS.md
-- §"Resolved: Duty roster is a monthly, site-based, one-person-per-day
-- on-call record — distinct from staff_schedules." Adding a Duty Roster
-- entry was never supposed to create a bookable slot, so that part is
-- working as designed, not a bug.
--
-- The REAL bug: Schedule Management's "Select staff member" dropdown (the
-- UI that's actually supposed to create staff_schedules rows) was hardcoded
-- to 5 fictional demo people in src/data/staff.js, completely disconnected
-- from the real `profiles` table. A real pilot admin adding a real staff
-- member via Admin → Users had no way to make that person selectable on
-- Schedule Management — so no real equipment-type slot could ever be
-- created for them, and Vendor Booking correctly (if confusingly) showed
-- "No available slots" for any date/equipment combination nobody had
-- opened via the (until now, unusable-for-real-data) Schedule Management
-- page.
--
-- This migration adds the DB-side half of the fix: nullable, purely
-- additive profile links on both tables, so the frontend (fixed in this
-- same change — ScheduleGrid.jsx now sources its dropdown from live
-- active internal profiles instead of the hardcoded array) can record a
-- real link when an admin picks a real person. staff_name / duty_staff_name
-- remain the columns every existing reader (get_available_schedule_slots,
-- BookingForm, Weekly Report, DutyRoster's own grid, etc.) already uses —
-- nothing about "how a slot displays" changes. Existing rows simply keep
-- *_profile_id = null, identical in spirit to how `assigned_poc_profile_id`
-- coexists with legacy free-text `responsible_staff` on appointment_requests.
--
-- No RLS policy changes: staff_schedules keeps its existing admin/manager
-- ALL policy (see supabase_vendor_schedule_privacy_fix_migration.sql for
-- vendor SELECT — unaffected, still 0 direct rows for vendor role) and
-- duty_rosters keeps its existing internal-only policies (already
-- vendor-inaccessible; verified live before this migration).
-- ============================================================================

alter table public.staff_schedules
  add column if not exists staff_profile_id uuid references public.profiles(id) on delete set null;

alter table public.duty_rosters
  add column if not exists duty_staff_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_staff_schedules_staff_profile_id
  on public.staff_schedules(staff_profile_id);

create index if not exists idx_duty_rosters_duty_staff_profile_id
  on public.duty_rosters(duty_staff_profile_id);
