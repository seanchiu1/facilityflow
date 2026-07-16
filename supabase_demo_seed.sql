-- ============================================================================
-- FacilityFlow — Demo data seed
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor, AFTER:
--   1. Creating the three demo auth users (SUPABASE_SETUP.md §0)
--   2. Creating their matching `profiles` rows (same section)
--   3. Running every migration file listed in README.md "Setup"
--
-- What this seeds (covers every state needed for the demo script):
--   1. Two staff_schedules slots (today + tomorrow) so Vendor > New Booking
--      has real slots to book into live during the demo.
--   2. Eight appointment_requests rows:
--        (a) Pending
--        (b) Scheduled, starting within the next hour — triggers the D-3
--            "Starting Soon" reminder notification (bell icon)
--        (c) In Progress, progress_percent = 65
--        (d) In Progress, overdue (target_completion_date in the past) —
--            triggers the D-4 "Overdue Alert" notification
--        (e) In Progress, with an APPROVED maintenance report attached —
--            demonstrates Finished being unblocked once QC approves
--        (f) In Progress, with a PENDING maintenance report attached —
--            demonstrates the D-1 gate: Finished stays disabled, and the
--            Approve/Reject buttons are visible on Appointment Detail
--        (g) Finished — feeds the dashboard "Completed This Week" stat and
--            Weekly Report
--        (h) Cancelled, and a ninth row Delayed — feed the dashboard
--            "Cancelled / Delayed" stat
--   3. A 3-message thread on the overdue appointment (d).
--   4. One duty_rosters assignment for today.
--
-- What this deliberately does NOT seed:
--   - A real uploaded "supporting document" file. A metadata-only row with
--     no real object in Storage would show "Link unavailable" when clicked —
--     which undercuts exactly the point of that demo beat. Instead, ~30
--     seconds before demoing: open the "In Progress, 65%" appointment (c)
--     seeded below and use "+ Add Document" to upload any small PDF/JPG —
--     the upload flow itself only takes a few seconds and is worth showing
--     live. See DEMO_SCRIPT.md Scene 3 for the exact step.
--
-- Idempotency: every seeded appointment's description starts with the
-- "[DEMO SEED]" marker. Re-running this script without cleanup will insert
-- duplicates (appointment_requests has no natural unique key to upsert on).
-- To remove all seeded data first, run the cleanup block at the bottom of
-- this file, then re-run the inserts above it.
--
-- Note on dates: appointment dates are relative to current_date, so exact
-- placement in the Weekly Report's "current week" (Mon–Sun) depends on which
-- day you run this. Most rows land within the surrounding week regardless.
-- ============================================================================

do $$
begin
  if not exists (select 1 from auth.users where email = 'vendor@facilityflow.demo') then
    raise exception 'vendor@facilityflow.demo not found in auth.users — create the demo users first (see SUPABASE_SETUP.md §0)';
  end if;
  if not exists (select 1 from auth.users where email = 'manager@facilityflow.demo') then
    raise exception 'manager@facilityflow.demo not found in auth.users — create the demo users first (see SUPABASE_SETUP.md §0)';
  end if;
end $$;

-- ── 1. Staff schedule slots ──────────────────────────────────────────────
insert into staff_schedules (staff_name, equipment_type, schedule_date, start_time, end_time, capacity, notes)
values
  ('Chen Wei-Ming', 'HVAC',     current_date,     '09:00', '13:00', 3, '[DEMO SEED]'),
  ('Wang Da-Wei',   'Elevator', current_date + 1, '09:00', '13:00', 2, '[DEMO SEED]');

-- ── 2a. Pending ───────────────────────────────────────────────────────────
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description)
values
  ('Taiwan Elevator Services', 'David Lin',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'Elevator', current_date + 3, '10:00', '12:00', 'Wang Da-Wei', 'Medium', 'Pending',
   '[DEMO SEED] Annual elevator inspection — Building A, Elevators 1-2.');

-- ── 2b. Scheduled, starting within the next hour (triggers D-3 reminder) ──
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description, start_date)
values
  ('Taiwan Elevator Services', 'David Lin',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'HVAC', current_date, (now() + interval '30 minutes')::time, (now() + interval '90 minutes')::time,
   'Chen Wei-Ming', 'Medium', 'Scheduled', '[DEMO SEED] Quarterly HVAC filter replacement — Building B.', now());

-- ── 2c. In Progress, progress_percent > 0 ──────────────────────────────────
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description, start_date, target_completion_date, progress_percent)
values
  ('Formosa Fire Safety Co.', 'Amy Hsu',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'Fire Safety', current_date - 1, '09:00', '15:00', 'Chang Yu-Fen', 'High', 'In Progress',
   '[DEMO SEED] Fire suppression system annual certification — all floors.',
   now() - interval '1 day', now() + interval '4 days', 65);

-- ── 2d. Overdue (triggers D-4 alert) ───────────────────────────────────────
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description, start_date, target_completion_date, progress_percent)
values
  ('CoolAir Systems', 'Peter Wu',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'Chiller', current_date - 5, '08:00', '17:00', 'Liu Kuo-Cheng', 'High', 'In Progress',
   '[DEMO SEED] Chiller compressor replacement — Building C rooftop unit.',
   now() - interval '5 days', now() - interval '2 days', 40);

-- ── 2e. In Progress + APPROVED maintenance report (Finished unblocked) ───
with apt as (
  insert into appointment_requests
    (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
     responsible_staff, priority, status, description, progress_percent)
  values
    ('Taiwan Elevator Services', 'David Lin',
     (select id from auth.users where email = 'vendor@facilityflow.demo'),
     'Elevator', current_date - 2, '09:00', '11:00', 'Wang Da-Wei', 'Medium', 'In Progress',
     '[DEMO SEED] Elevator 3 annual safety inspection — report attached and approved.', 90)
  returning id
)
insert into appointment_documents
  (appointment_id, file_name, file_path, file_type, file_size, uploaded_by,
   document_type, approval_status, reviewed_by, reviewed_at, review_note)
select
  apt.id, 'elevator-3-inspection-report.pdf', apt.id::text || '/demo-seed-approved-report.pdf',
  'application/pdf', 245000, 'David Lin', 'maintenance_report', 'approved',
  (select id from auth.users where email = 'manager@facilityflow.demo'), now(), 'Looks good, approved.'
from apt;

-- ── 2f. In Progress + PENDING maintenance report (Finished stays blocked) ─
with apt as (
  insert into appointment_requests
    (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
     responsible_staff, priority, status, description, progress_percent)
  values
    ('Formosa Fire Safety Co.', 'Amy Hsu',
     (select id from auth.users where email = 'vendor@facilityflow.demo'),
     'AED', current_date - 1, '13:00', '15:00', 'Chang Yu-Fen', 'Medium', 'In Progress',
     '[DEMO SEED] AED battery + pad replacement, floors 4-8 — report uploaded, awaiting QC review.', 80)
  returning id
)
insert into appointment_documents
  (appointment_id, file_name, file_path, file_type, file_size, uploaded_by, document_type, approval_status)
select
  apt.id, 'aed-battery-replacement-report.pdf', apt.id::text || '/demo-seed-pending-report.pdf',
  'application/pdf', 198000, 'Amy Hsu', 'maintenance_report', 'pending'
from apt;

-- ── 2g. Finished ────────────────────────────────────────────────────────
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description, progress_percent)
values
  ('CoolAir Systems', 'Peter Wu',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'UPS', current_date - 1, '09:00', '11:00', 'Lin Mei-Hui', 'Low', 'Finished',
   '[DEMO SEED] UPS battery health check — Data Center 2.', 100);

-- ── 2h/2i. Cancelled + Delayed ──────────────────────────────────────────
insert into appointment_requests
  (vendor_name, contact_name, vendor_user_id, equipment_type, requested_date, start_time, end_time,
   responsible_staff, priority, status, description)
values
  ('Taiwan Elevator Services', 'David Lin',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'Electrical', current_date + 2, '09:00', '11:00', 'Lin Mei-Hui', 'Medium', 'Cancelled',
   '[DEMO SEED] Panel inspection — cancelled by vendor, rescheduling.'),
  ('Formosa Fire Safety Co.', 'Amy Hsu',
   (select id from auth.users where email = 'vendor@facilityflow.demo'),
   'Fire Safety', current_date + 1, '09:00', '11:00', 'Chang Yu-Fen', 'Medium', 'Delayed',
   '[DEMO SEED] Sprinkler head replacement — delayed pending parts.');

-- ── 3. Message thread on the overdue appointment (2d) ──────────────────────
insert into appointment_messages (appointment_id, sender_name, sender_role, message)
select id, 'David Lin', 'vendor', 'We are on site and starting the compressor swap now.'
from appointment_requests
where description = '[DEMO SEED] Chiller compressor replacement — Building C rooftop unit.'
limit 1;

insert into appointment_messages (appointment_id, sender_name, sender_role, message)
select id, 'Manager Liu', 'manager', 'Thanks for the update — let us know if you need roof access badges.'
from appointment_requests
where description = '[DEMO SEED] Chiller compressor replacement — Building C rooftop unit.'
limit 1;

insert into appointment_messages (appointment_id, sender_name, sender_role, message)
select id, 'David Lin', 'vendor', 'All set, badges received from security. Compressor arriving tomorrow AM.'
from appointment_requests
where description = '[DEMO SEED] Chiller compressor replacement — Building C rooftop unit.'
limit 1;

-- ── 4. Duty roster assignment (today) ──────────────────────────────────────
insert into duty_rosters (roster_date, site, duty_staff_name, duty_staff_phone, duty_staff_email, notes, created_by)
values
  (current_date, 'Building A', 'Chen Wei-Ming', 'x3405', 'wm.chen@qualcomm.com', '[DEMO SEED] On-call for HVAC issues.',
   (select id from auth.users where email = 'manager@facilityflow.demo'))
on conflict (roster_date, site) do nothing;

-- ============================================================================
-- Cleanup — run this block to remove all seeded rows before re-seeding.
-- Uncomment and run on its own; documents/messages cascade-delete with their
-- parent appointment_requests row, so only two deletes are needed there.
-- ============================================================================

-- delete from appointment_requests where description like '[DEMO SEED]%';
-- delete from staff_schedules      where notes like '[DEMO SEED]%';
-- delete from duty_rosters         where notes like '[DEMO SEED]%';
