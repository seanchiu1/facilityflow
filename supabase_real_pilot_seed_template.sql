-- ============================================================================
-- FacilityFlow — Real Pilot Seed Template
-- ============================================================================
--
-- A tiny, real dataset for the first real vendor pilot: 1 site, 1 manager,
-- 1 optional staff/POC, 1 vendor company + contact, 1 project, 1 vendor
-- project membership, 1–3 vendor tasks, 1 bookable staff time slot, and
-- two optional starter items (a shared comment, an appointment request).
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
--   - The vendor added in Part 4 will be able to see the project's
--     name/shell — that's expected even if you later add a second vendor
--     to the same project. What stays isolated per-vendor is their own
--     tasks/comments/documents/bookings, never the project name itself.
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- PART 1 — Real site
-- ══════════════════════════════════════════════════════════════════════════
-- Edit the name/code, then run this and copy the returned `id`.

insert into public.sites (name, code, is_active)
values ('<SITE_NAME e.g. Qualcomm San Diego HQ>', '<SITE_CODE e.g. SD-HQ>', true)
returning id;

-- ↑ Copy this id. Every <SITE_ID> placeholder below means "paste it here."


-- ══════════════════════════════════════════════════════════════════════════
-- PART 2 — Real people
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
-- PART 3 — Real project
-- ══════════════════════════════════════════════════════════════════════════
-- owner_profile_id / created_by = the manager's UUID from Part 2a. Setting
-- owner_profile_id automatically adds the manager to project_members as
-- "Owner" (sync_project_owner_membership trigger) — no separate insert
-- needed for that.

insert into public.projects (name, description, site_id, status, owner_profile_id, created_by, start_date, target_completion_date)
values (
  '<PROJECT_NAME e.g. Building 3 Fire Safety Upgrade>',
  '<PROJECT_DESCRIPTION, optional — or NULL>',
  '<SITE_ID>',            -- from Part 1
  'Active',                -- or 'Planning'
  '<MANAGER_AUTH_UUID>',   -- from Part 2a
  '<MANAGER_AUTH_UUID>',
  current_date,
  current_date + interval '30 days'
)
returning id;

-- ↑ Copy this id. Every <PROJECT_ID> placeholder below means "paste it here."

-- Optional — add the staff/POC from Part 2b as an internal project member
-- too (the manager is already a member automatically, above):
insert into public.project_members (project_id, profile_id, project_role)
values ('<PROJECT_ID>', '<STAFF_AUTH_UUID>', 'Member');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 4 — Vendor project membership
-- ══════════════════════════════════════════════════════════════════════════
-- This is what makes the project appear on the vendor's Vendor Projects
-- page. Must run before Part 5 (vendor tasks) — a vendor task can only be
-- assigned to a vendor who is already a member of this project.

insert into public.project_vendor_members (project_id, vendor_profile_id, added_by)
values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<MANAGER_AUTH_UUID>');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 5 — Vendor tasks (1–3)
-- ══════════════════════════════════════════════════════════════════════════
-- Duplicate this insert (up to 3 times total) for more than one starter
-- task. status must be one of: 'Todo', 'In Progress', 'Blocked', 'Done'.

insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
values (
  '<PROJECT_ID>',
  '<VENDOR_AUTH_UUID>',
  '<TASK_1_TITLE e.g. Submit site survey report>',
  '<TASK_1_DESCRIPTION, optional — or NULL>',
  'Todo',
  current_date + interval '14 days',
  '<MANAGER_AUTH_UUID>'
);

-- insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
-- values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<TASK_2_TITLE>', '<TASK_2_DESCRIPTION>', 'Todo', current_date + interval '21 days', '<MANAGER_AUTH_UUID>');

-- insert into public.project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by)
-- values ('<PROJECT_ID>', '<VENDOR_AUTH_UUID>', '<TASK_3_TITLE>', '<TASK_3_DESCRIPTION>', 'Todo', current_date + interval '28 days', '<MANAGER_AUTH_UUID>');


-- ══════════════════════════════════════════════════════════════════════════
-- PART 6 — One bookable staff time slot
-- ══════════════════════════════════════════════════════════════════════════
-- This is what makes New Booking show an available slot to ANY vendor —
-- equipment_type below is recorded for context only and does NOT filter
-- who can see or book this slot (see BOOKING_AVAILABILITY_DEBUG.md §9).
-- staff_profile_id should be the manager or staff member who will actually
-- be on-site for this slot.

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
-- PART 7 (optional) — Starter shared comment
-- ══════════════════════════════════════════════════════════════════════════
-- Gives the vendor's Vendor Project Detail page something in the shared
-- thread on first login instead of an empty state. Skip if you'd rather
-- the vendor's first comment be their own.

insert into public.project_comments (project_id, author_profile_id, body, visibility, vendor_profile_id, author_display_name)
values (
  '<PROJECT_ID>',
  '<MANAGER_AUTH_UUID>',
  '<WELCOME_MESSAGE e.g. Welcome aboard — let us know if you have any questions about the scope.>',
  'shared',
  '<VENDOR_AUTH_UUID>',
  '<MANAGER_DISPLAY_NAME>'
);


-- ══════════════════════════════════════════════════════════════════════════
-- PART 8 (optional) — Starter appointment request
-- ══════════════════════════════════════════════════════════════════════════
-- Only run this if you want one real appointment already sitting in
-- Requests when the pilot starts, instead of waiting for the vendor's
-- first real booking. appointment_code is auto-assigned by a trigger —
-- don't set it. Match start_time/end_time to the slot created in Part 6
-- if you want this appointment to represent that exact slot being used.

insert into public.appointment_requests (
  vendor_name, contact_name, vendor_user_id, equipment_type,
  requested_date, start_time, end_time, responsible_staff,
  status, description, site_id, assigned_poc_profile_id, project_id
)
values (
  '<VENDOR_COMPANY_NAME>',
  '<VENDOR_CONTACT_NAME>',
  '<VENDOR_AUTH_UUID>',
  'Other',
  current_date + interval '3 days',
  '09:00',
  '13:00',
  '<STAFF_DISPLAY_NAME>',
  'Pending',
  '<STARTER_APPOINTMENT_DESCRIPTION>',
  '<SITE_ID>',
  '<STAFF_AUTH_UUID_OR_MANAGER_AUTH_UUID>',
  '<PROJECT_ID>'
);


-- ══════════════════════════════════════════════════════════════════════════
-- Verify — run after completing the parts above
-- ══════════════════════════════════════════════════════════════════════════

select 'sites' as table_name, count(*) from public.sites where id = '<SITE_ID>'
union all select 'profiles (real pilot)', count(*) from public.profiles where id in ('<MANAGER_AUTH_UUID>', '<STAFF_AUTH_UUID>', '<VENDOR_AUTH_UUID>')
union all select 'projects', count(*) from public.projects where id = '<PROJECT_ID>'
union all select 'project_members', count(*) from public.project_members where project_id = '<PROJECT_ID>'
union all select 'project_vendor_members', count(*) from public.project_vendor_members where project_id = '<PROJECT_ID>'
union all select 'project_vendor_tasks', count(*) from public.project_vendor_tasks where project_id = '<PROJECT_ID>'
union all select 'staff_schedules (this pilot)', count(*) from public.staff_schedules where staff_profile_id in ('<MANAGER_AUTH_UUID>', '<STAFF_AUTH_UUID>')
union all select 'project_comments', count(*) from public.project_comments where project_id = '<PROJECT_ID>'
union all select 'appointment_requests (this pilot)', count(*) from public.appointment_requests where vendor_user_id = '<VENDOR_AUTH_UUID>';
