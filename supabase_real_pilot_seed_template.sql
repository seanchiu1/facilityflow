-- ============================================================================
-- FacilityFlow — Real Pilot Seed Template
-- ============================================================================
--
-- A tiny, real dataset for the first real vendor pilot. The MINIMUM viable
-- pilot is booking-only and needs just Parts 1, 2, and 6: one site, real
-- manager/staff/vendor accounts, and one bookable staff time slot — enough
-- to exercise real booking, My Bookings, email notifications, and vendor
-- isolation without touching Project Collaboration at all. Everything
-- else (a project, vendor project membership, vendor tasks, a starter
-- comment, a pre-seeded appointment) is genuinely OPTIONAL and commented
-- out by default — uncomment only the parts you actually want.
--
-- This is a TEMPLATE, not a run-as-is script. Every <ANGLE_BRACKET>
-- placeholder must be replaced with a real value before running that part.
-- Run it top to bottom, part by part — several parts require a MANUAL
-- Supabase Dashboard step (creating a real Auth user) in between two SQL
-- parts, so this cannot be pasted and run as a single block the way the
-- old demo seed scripts were.
--
-- Before running this: run supabase_pilot_cleanup_dry_run.sql (and, once
-- you're satisfied, supabase_pilot_cleanup_execute.sql) so this real data
-- isn't sitting next to fictional demo data in the same tables. Not a hard
-- requirement — nothing here conflicts with demo data — but the point of
-- this template is to get FacilityFlow onto real data, and leaving demo
-- rows in place defeats that.
--
-- Product rules this data must respect (see BOOKING_AVAILABILITY_DEBUG.md
-- and VENDOR_ISOLATION_AUDIT.md for the full explanations):
--   - The staff time slot below (Part 6) is bookable by ANY vendor for ANY
--     equipment type — equipment_type is recorded for context only and
--     does not filter availability. Don't read anything into which
--     equipment_type this template picks.
--   - Duty Roster is intentionally not part of this template — it's an
--     on-call/coverage record, separate from bookable availability, and
--     adding a row there would not make this vendor able to book anything.
--   - If you do use the optional project parts below, the vendor added in
--     Part 4 will be able to see the project's name/shell — that's
--     expected even if you later add a second vendor to the same project.
--     What stays isolated per-vendor is their own
--     tasks/comments/documents/bookings, never the project name itself.
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- PART 1 — Real site (required)
-- ══════════════════════════════════════════════════════════════════════════
-- If a real site doesn't matter yet for this first pilot (e.g. you're only
-- testing the booking flow, not tying it to a specific building), a
-- generic placeholder like "Pilot Site" below is fine — rename or replace
-- it later once real site information matters. Edit the name/code, then
-- run this and copy the returned `id`.

insert into public.sites (name, code, is_active)
values ('<SITE_NAME e.g. Pilot Site>', '<SITE_CODE e.g. PILOT>', true)
returning id;

-- ↑ Copy this id. Every <SITE_ID> placeholder below means "paste it here."


-- ══════════════════════════════════════════════════════════════════════════
-- PART 2 — Real people (required)
-- ══════════════════════════════════════════════════════════════════════════
-- For EACH person below: create their Auth user in the Supabase Dashboard
-- FIRST (Authentication → Users → Add user), using a strong temporary
-- password (see REAL_VENDOR_PILOT_CHECKLIST.md for the exact steps and
-- password guidance) — THEN run the matching profiles insert with the
-- UUID the Dashboard just generated. This script never creates an Auth
-- user itself; see the checklist for why (service-role key never runs
-- from a script you paste into the SQL Editor).

-- 2a. Manager (required)
--     Dashboard: Add user with email <MANAGER_EMAIL>, strong temp password.
--     Then, with that user's UUID:
insert into public.profiles (id, role, display_name, email, is_active)
values ('<MANAGER_AUTH_UUID>', 'manager', '<MANAGER_DISPLAY_NAME>', '<MANAGER_EMAIL>', true);

-- 2b. Staff / POC (optional — skip if this pilot has no internal staff yet)
--     Dashboard: Add user with email <STAFF_EMAIL>, strong temp password.
insert into public.profiles (id, role, display_name, email, is_active, is_conductor)
values ('<STAFF_AUTH_UUID>', 'staff', '<STAFF_DISPLAY_NAME>', '<STAFF_EMAIL>', true, false);
-- is_conductor = true only if this person should be eligible for on-call
-- Duty Roster assignment — see ADMIN_GUIDE.md § Assign roles.

-- 2c. Vendor contact (required — one real login per vendor company for this pilot)
--     Dashboard: Add user with email <VENDOR_EMAIL>, strong temp password.
insert into public.profiles (id, role, display_name, vendor_name, contact_name, email, is_active)
values ('<VENDOR_AUTH_UUID>', 'vendor', '<VENDOR_CONTACT_DISPLAY_NAME>', '<VENDOR_COMPANY_NAME>', '<VENDOR_CONTACT_NAME>', '<VENDOR_EMAIL>', true);


-- ══════════════════════════════════════════════════════════════════════════
-- PART 3 (OPTIONAL — skip for a booking-only first pilot) — Real project
-- ══════════════════════════════════════════════════════════════════════════
-- Not needed to test booking, My Bookings, email notifications, or vendor
-- isolation — Project Collaboration is a separate feature. Skip Parts 3,
-- 4, 5, and 7 entirely for a first pilot focused on the booking flow; come
-- back and uncomment them later once you're ready to try a real project.
--
-- If you do use this: owner_profile_id / created_by = the manager's UUID
-- from Part 2a. Setting owner_profile_id automatically adds the manager to
-- project_members as "Owner" (sync_project_owner_membership trigger) — no
-- separate insert needed for that.

-- insert into public.projects (name, description, site_id, status, owner_profile_id, created_by, start_date, target_completion_date)
-- values (
--   '<PROJECT_NAME e.g. Building 3 Fire Safety Upgrade>',
--   '<PROJECT_DESCRIPTION, optional — or NULL>',
--   '<SITE_ID>',            -- from Part 1
--   'Active',                -- or 'Planning'
--   '<MANAGER_AUTH_UUID>',   -- from Part 2a
--   '<MANAGER_AUTH_UUID>',
--   current_date,
--   current_date + interval '30 days'
-- )
-- returning id;

-- ↑ Copy this id. Every <PROJECT_ID> placeholder below means "paste it here."

-- Optional — add the staff/POC from Part 2b as an internal project member
-- too (the manager is already a member automatically, above):
-- insert into public.project_members (project_id, profile_id, project_role)
-- values ('<PROJECT_ID>', '<STAFF_AUTH_UUID>', 'Member');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 4 (OPTIONAL — skip for a booking-only first pilot) — Vendor project membership
-- ══════════════════════════════════════════════════════════════════════════
-- Only relevant if you used Part 3. This is what makes the project appear
-- on the vendor's Vendor Projects page. Must run before Part 5 (vendor
-- tasks) — a vendor task can only be assigned to a vendor who is already a
-- member of this project.

-- insert into public.project_vendor_members (project_id, vendor_profile_id, added_by)
-- values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<MANAGER_AUTH_UUID>');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 5 (OPTIONAL — skip for a booking-only first pilot) — Vendor tasks (0–3)
-- ══════════════════════════════════════════════════════════════════════════
-- Starter vendor tasks are entirely optional — the first pilot does not
-- need them. Every statement below is commented out by default; uncomment
-- and duplicate (up to 3 total) only if you specifically want starter
-- tasks waiting for the vendor on day one. Requires Parts 3 and 4 to have
-- been run first. status must be one of: 'Todo', 'In Progress', 'Blocked', 'Done'.

-- insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
-- values (
--   '<PROJECT_ID>',
--   '<VENDOR_AUTH_UUID>',
--   '<TASK_1_TITLE e.g. Submit site survey report>',
--   '<TASK_1_DESCRIPTION, optional — or NULL>',
--   'Todo',
--   current_date + interval '14 days',
--   '<MANAGER_AUTH_UUID>'
-- );

-- insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
-- values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<TASK_2_TITLE>', '<TASK_2_DESCRIPTION>', 'Todo', current_date + interval '21 days', '<MANAGER_AUTH_UUID>');

-- insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
-- values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<TASK_3_TITLE>', '<TASK_3_DESCRIPTION>', 'Todo', current_date + interval '28 days', '<MANAGER_AUTH_UUID>');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 6 — One bookable staff time slot (required)
-- ══════════════════════════════════════════════════════════════════════════
-- This is what makes New Booking show an available slot to ANY vendor —
-- equipment_type below is recorded for context only and does NOT filter
-- who can see or book this slot (see BOOKING_AVAILABILITY_DEBUG.md §9).
-- staff_profile_id should be the manager or staff member who will actually
-- be on-site for this slot. This is the core of a booking-only first
-- pilot — without it, New Booking will correctly show "no available
-- slots" no matter what the vendor does.

insert into public.staff_schedules (staff_name, staff_profile_id, equipment_type, schedule_date, start_time, end_time, notes)
values (
  '<STAFF_DISPLAY_NAME>',   -- must match the display_name used in Part 2a/2b
  '<STAFF_AUTH_UUID_OR_MANAGER_AUTH_UUID>',
  'Other',                   -- any value from: Elevator, HVAC, Chiller, AED, UPS, Electrical, Fire Safety, Other — informational only
  current_date + interval '3 days',
  '09:00',
  '13:00',
  null
);


-- ══════════════════════════════════════════════════════════════════════════
-- PART 7 (OPTIONAL — skip for a booking-only first pilot) — Starter shared comment
-- ══════════════════════════════════════════════════════════════════════════
-- Only relevant if you used Part 3. Gives the vendor's Vendor Project
-- Detail page something in the shared thread on first login instead of an
-- empty state. Skip if you'd rather the vendor's first comment be their
-- own — or if you skipped Part 3 entirely.

-- insert into public.project_comments (project_id, author_profile_id, body, visibility, vendor_profile_id, author_display_name)
-- values (
--   '<PROJECT_ID>',
--   '<MANAGER_AUTH_UUID>',
--   '<WELCOME_MESSAGE e.g. Welcome aboard — let us know if you have any questions about the scope.>',
--   'shared',
--   '<VENDOR_AUTH_UUID>',
--   '<MANAGER_DISPLAY_NAME>'
-- );


-- ══════════════════════════════════════════════════════════════════════════
-- PART 8 (OPTIONAL) — Starter appointment request
-- ══════════════════════════════════════════════════════════════════════════
-- For a booking-only first pilot, this is usually better SKIPPED — the
-- whole point of that pilot is to watch the real vendor submit their own
-- first real booking through New Booking (using the slot from Part 6),
-- not to pre-seed one for them. Only run this if you specifically want an
-- appointment already sitting in Requests before the pilot starts.
-- appointment_code is auto-assigned by a trigger — don't set it. project_id
-- is only meaningful if you used Part 3; leave it NULL otherwise.

-- insert into public.appointment_requests (
--   vendor_name, contact_name, vendor_user_id, equipment_type,
--   requested_date, start_time, end_time, responsible_staff,
--   status, description, site_id, assigned_poc_profile_id, project_id
-- )
-- values (
--   '<VENDOR_COMPANY_NAME>',
--   '<VENDOR_CONTACT_NAME>',
--   '<VENDOR_AUTH_UUID>',
--   'Other',
--   current_date + interval '3 days',
--   '09:00',
--   '13:00',
--   '<STAFF_DISPLAY_NAME>',
--   'Pending',
--   '<STARTER_APPOINTMENT_DESCRIPTION>',
--   '<SITE_ID>',
--   '<STAFF_AUTH_UUID_OR_MANAGER_AUTH_UUID>',
--   null   -- or '<PROJECT_ID>' if you used Part 3
-- );


-- ══════════════════════════════════════════════════════════════════════════
-- Verify — run after completing the parts above
-- ══════════════════════════════════════════════════════════════════════════
-- The project-related rows will correctly show 0 if you skipped Parts
-- 3/4/5/7 for a booking-only first pilot — that's expected, not an error.

select 'sites' as table_name, count(*) from public.sites where id = '<SITE_ID>'
union all select 'profiles (real pilot)', count(*) from public.profiles where id in ('<MANAGER_AUTH_UUID>', '<STAFF_AUTH_UUID>', '<VENDOR_AUTH_UUID>')
union all select 'staff_schedules (this pilot)', count(*) from public.staff_schedules where staff_profile_id in ('<MANAGER_AUTH_UUID>', '<STAFF_AUTH_UUID>')
union all select 'projects (optional — 0 is fine for a booking-only pilot)', count(*) from public.projects where id = '<PROJECT_ID>'
union all select 'project_members (optional)', count(*) from public.project_members where project_id = '<PROJECT_ID>'
union all select 'project_vendor_members (optional)', count(*) from public.project_vendor_members where project_id = '<PROJECT_ID>'
union all select 'project_vendor_tasks (optional)', count(*) from public.project_vendor_tasks where project_id = '<PROJECT_ID>'
union all select 'project_comments (optional)', count(*) from public.project_comments where project_id = '<PROJECT_ID>'
union all select 'appointment_requests (this pilot — 0 is fine if you let the vendor submit the first one themselves)', count(*) from public.appointment_requests where vendor_user_id = '<VENDOR_AUTH_UUID>';
