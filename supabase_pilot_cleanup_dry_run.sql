-- ============================================================================
-- FacilityFlow — Pilot Cleanup DRY RUN (read-only, safe to run anytime)
-- ============================================================================
--
-- Purpose: show exactly what supabase_pilot_cleanup_execute.sql would
-- delete, BEFORE running it. This script contains no INSERT/UPDATE/DELETE
-- statements — every statement is a SELECT. Run it, read every count, and
-- only then consider running the execute script.
--
-- How "demo" is identified: by joining profiles to auth.users and matching
-- the real Auth email against the `@facilityflow.demo` domain — every
-- seeded demo/test account in this project was created on that domain
-- (manager@, staff@, vendor@, vendor2@, admin@facilityflow.demo). This is
-- deliberately NOT based on profiles.email: that column was found to be
-- stale/out of sync with the real Auth email for most of these accounts
-- (it shows a developer's personal address instead of the demo address on
-- 4 of 5 confirmed demo profiles) — matching on it would silently miss
-- real demo accounts. auth.users.email is authoritative.
--
-- A 6th account was found that does NOT match the @facilityflow.demo
-- pattern (real-looking personal email) but has an obviously fake
-- "vendor_name" of "Test Vendor Company" / display_name "Test Vendor" —
-- this script deliberately does NOT include it in the main demo count.
-- See §5 below — it's surfaced separately for manual human judgment,
-- exactly because automated domain-matching can't safely decide it.
-- ============================================================================

-- ── §1. The demo accounts this cleanup targets ─────────────────────────────
-- Review this list first — everything else in this script is downstream of
-- these profile ids. If a name here should NOT be removed, stop and fix
-- the matching logic (or the execute script's temp table) before running
-- the execute script.

select
  p.id,
  p.role,
  p.display_name,
  p.vendor_name,
  u.email as auth_email,
  p.is_active
from public.profiles p
join auth.users u on u.id = p.id
where u.email like '%@facilityflow.demo'
order by p.role, p.display_name;

-- ── §2. Row counts that would be deleted, by table ──────────────────────────
-- Matches the exact predicates used in supabase_pilot_cleanup_execute.sql.
-- Read every row here — a non-zero count somewhere you didn't expect is
-- the signal to stop and investigate before executing.

with demo_profiles as (
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email like '%@facilityflow.demo'
),
demo_appointments as (
  select id from public.appointment_requests
  where vendor_user_id in (select id from demo_profiles)
     or assigned_poc_profile_id in (select id from demo_profiles)
     or description like 'Automated E2E test booking%'
     or vendor_name like 'E2E Test Vendor%'
),
demo_projects as (
  select id from public.projects
  where created_by in (select id from demo_profiles)
     or owner_profile_id in (select id from demo_profiles)
)
select 'profiles (demo accounts)' as would_delete, count(*) from demo_profiles
union all
select 'appointment_requests (demo-owned or E2E test)', count(*) from demo_appointments
union all
select 'appointment_documents (cascades from appointment_requests)', count(*)
  from public.appointment_documents where appointment_id in (select id from demo_appointments)
union all
select 'appointment_messages (cascades from appointment_requests)', count(*)
  from public.appointment_messages where appointment_id in (select id from demo_appointments)
union all
select 'status_updates (cascades from appointment_requests)', count(*)
  from public.status_updates where appointment_id in (select id from demo_appointments)
union all
select 'notification_logs (cascades from appointment_requests)', count(*)
  from public.notification_logs where appointment_id in (select id from demo_appointments)
union all
select 'projects (demo-owned)', count(*) from demo_projects
union all
select 'project_members (cascades from projects)', count(*)
  from public.project_members where project_id in (select id from demo_projects)
union all
select 'project_tasks (cascades from projects)', count(*)
  from public.project_tasks where project_id in (select id from demo_projects)
union all
select 'project_vendor_members (cascades from projects)', count(*)
  from public.project_vendor_members where project_id in (select id from demo_projects)
union all
select 'project_vendor_tasks (cascades from projects)', count(*)
  from public.project_vendor_tasks where project_id in (select id from demo_projects)
union all
select 'project_comments (cascades from projects)', count(*)
  from public.project_comments where project_id in (select id from demo_projects)
union all
select 'project_documents (cascades from projects)', count(*)
  from public.project_documents where project_id in (select id from demo_projects)
union all
select 'project_activity (cascades from projects)', count(*)
  from public.project_activity where project_id in (select id from demo_projects)
union all
select 'project_notifications (project- or appointment-linked, deleted explicitly first)', count(*)
  from public.project_notifications
  where project_id in (select id from demo_projects)
     or related_appointment_id in (select id from demo_appointments)
     or actor_profile_id in (select id from demo_profiles)
     or recipient_profile_id in (select id from demo_profiles)
union all
select 'staff_schedules (demo staff or E2E test slot)', count(*)
  from public.staff_schedules
  where staff_profile_id in (select id from demo_profiles)
     or notes like 'E2E-SLOT-%'
     -- Legacy rows from before staff_profile_id existed/was populated —
     -- staff_profile_id is null on these, so they'd otherwise be missed.
     -- Matches src/data/staff.js's 5 fictional demo names exactly.
     or staff_name in ('Chen Wei-Ming', 'Lin Mei-Hui', 'Wang Da-Wei', 'Chang Yu-Fen', 'Liu Kuo-Cheng')
union all
select 'duty_rosters (created by a demo account)', count(*)
  from public.duty_rosters
  where created_by in (select id from demo_profiles)
order by would_delete;

-- ── §3. Safety check — would deleting demo projects be blocked? ────────────
-- If this returns any rows, a project that WOULD be deleted is still
-- linked from an appointment_request that would NOT be deleted (i.e. a
-- real, kept appointment references a demo project). Deleting the project
-- first would fail on that foreign key — investigate before running
-- execute; either that appointment needs its project_id cleared/updated
-- manually first, or it's not actually a "real, keep" appointment.

with demo_profiles as (
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email like '%@facilityflow.demo'
),
demo_projects as (
  select id from public.projects
  where created_by in (select id from demo_profiles)
     or owner_profile_id in (select id from demo_profiles)
)
select a.id as appointment_id, a.vendor_name, a.description, a.project_id
from public.appointment_requests a
where a.project_id in (select id from demo_projects)
  and a.vendor_user_id not in (select id from demo_profiles)
  and a.description not like 'Automated E2E test booking%'
  and a.vendor_name not like 'E2E Test Vendor%';

-- ── §4. Sites referenced only by demo projects (informational — NOT part
--        of the execute script; sites are not auto-deleted) ───────────────
-- Sites aren't owned by a profile, so they can't be identified the same
-- way. This just shows which sites would be "orphaned" (no longer
-- referenced by anything) after the demo projects above are removed —
-- useful context for deciding whether to rename one for real pilot use
-- (see supabase_real_pilot_seed_template.sql) or leave it. Nothing here
-- is deleted by any script in this pass.

with demo_profiles as (
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email like '%@facilityflow.demo'
),
demo_projects as (
  select id, site_id from public.projects
  where created_by in (select id from demo_profiles)
     or owner_profile_id in (select id from demo_profiles)
)
select s.id, s.name, s.code, s.is_active,
  (select count(*) from public.appointment_requests where site_id = s.id) as appointments_using_it,
  (select count(*) from public.projects where site_id = s.id) as projects_using_it
from public.sites s
order by s.name;

-- ── §5. AMBIGUOUS account — NOT included in §1/§2 above, needs a human ────
-- This account's Auth email is not on the @facilityflow.demo domain, so
-- it was NOT matched as demo above — but its profile fields look like
-- test data. Confirm by eye whether this is real or should be cleaned up
-- by hand (it is deliberately NOT touched by supabase_pilot_cleanup_execute.sql).

select p.id, p.role, p.display_name, p.vendor_name, p.contact_name, u.email as auth_email, p.is_active
from public.profiles p
join auth.users u on u.id = p.id
where u.email not like '%@facilityflow.demo'
  and (p.display_name ilike '%test%' or p.vendor_name ilike '%test%');
