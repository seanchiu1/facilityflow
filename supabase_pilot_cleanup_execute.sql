-- ============================================================================
-- FacilityFlow — Pilot Cleanup EXECUTE (destructive — run the dry run first)
-- ============================================================================
--
-- Deletes demo/test data before onboarding a real vendor pilot. Wrapped in
-- a single transaction: if any statement fails, nothing commits — you get
-- either "all of this ran" or "none of this ran," never a half-deleted
-- database. Run `supabase_pilot_cleanup_dry_run.sql` first and read every
-- count before running this.
--
-- What this removes: demo accounts on the @facilityflow.demo domain
-- (matched via auth.users.email, not the stale profiles.email column —
-- see the dry-run script's header for why) and everything they created —
-- appointments, projects and their contents, staff schedule slots, duty
-- roster entries — plus E2E-test-created data identified by its
-- description/notes markers even if it wasn't created by a demo account.
--
-- What this does NOT do:
--   - Does not touch auth.users at all (can't, and wasn't asked to) — see
--     REAL_VENDOR_PILOT_CHECKLIST.md for the manual Supabase Dashboard
--     steps to delete/disable the corresponding Auth users afterward.
--   - Does not touch the one ambiguous non-@facilityflow.demo test-looking
--     account (see dry run §5) — review and handle that one by hand.
--   - Does not touch `sites` — demo projects reference two real-looking
--     site rows ("Qualcomm HQ Campus", "Data Center Annex") that are
--     reasonable to rename and reuse for a real pilot rather than delete;
--     see supabase_real_pilot_seed_template.sql.
--   - Does not delete any profile NOT on the @facilityflow.demo domain —
--     a real manager/admin account is never touched by this script, full
--     stop, regardless of anything else about it.
--
-- FK-safe delete order (verified against this schema's actual foreign
-- keys, including one non-obvious cycle):
--   1. project_notifications — deleted FIRST and explicitly. It has
--      NO ACTION (not CASCADE) references to appointment_requests, and
--      appointment_requests.project_id has a NO ACTION reference back to
--      projects — a genuine circular dependency. Deleting
--      project_notifications up front breaks the cycle; everything below
--      then proceeds without hitting a foreign-key violation.
--   2. appointment_requests — cascades appointment_documents,
--      appointment_messages, status_updates, notification_logs
--      automatically (all four have ON DELETE CASCADE to
--      appointment_requests).
--   3. projects — cascades project_members, project_tasks,
--      project_vendor_members, project_vendor_tasks, project_comments,
--      project_documents, project_activity automatically (all have ON
--      DELETE CASCADE to projects; project_notifications already handled
--      in step 1).
--   4. staff_schedules
--   5. duty_rosters
--   6. profiles — last, once every NO ACTION-constrained child row above
--      is gone. (staff_schedules.staff_profile_id and
--      duty_rosters.duty_staff_profile_id are ON DELETE SET NULL, so they
--      would never have blocked this anyway — but the rows themselves are
--      still explicitly deleted in steps 4–5 above, not just unlinked.)
-- ============================================================================

begin;

-- Snapshot the demo profile ids once, for every delete below to reference.
create temporary table _pilot_cleanup_demo_profiles
  on commit drop as
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where u.email like '%@facilityflow.demo';

-- Snapshot demo appointment/project ids too, computed the same way the
-- dry-run script counted them — used by more than one delete below.
create temporary table _pilot_cleanup_demo_appointments
  on commit drop as
select id from public.appointment_requests
where vendor_user_id in (select id from _pilot_cleanup_demo_profiles)
   or assigned_poc_profile_id in (select id from _pilot_cleanup_demo_profiles)
   or description like 'Automated E2E test booking%'
   or vendor_name like 'E2E Test Vendor%';

create temporary table _pilot_cleanup_demo_projects
  on commit drop as
select id from public.projects
where created_by in (select id from _pilot_cleanup_demo_profiles)
   or owner_profile_id in (select id from _pilot_cleanup_demo_profiles);

-- 1. project_notifications — first, to break the FK cycle (see header).
delete from public.project_notifications
where project_id in (select id from _pilot_cleanup_demo_projects)
   or related_appointment_id in (select id from _pilot_cleanup_demo_appointments)
   or actor_profile_id in (select id from _pilot_cleanup_demo_profiles)
   or recipient_profile_id in (select id from _pilot_cleanup_demo_profiles);

-- 2. appointment_requests — cascades documents/messages/status_updates/notification_logs.
delete from public.appointment_requests
where id in (select id from _pilot_cleanup_demo_appointments);

-- 3. projects — cascades members/tasks/vendor_members/vendor_tasks/comments/documents/activity.
delete from public.projects
where id in (select id from _pilot_cleanup_demo_projects);

-- 4. staff_schedules — demo-linked, E2E test slots, and legacy rows from
--    before staff_profile_id existed (matched by the 5 fictional names in
--    src/data/staff.js — see BOOKING_AVAILABILITY_DEBUG.md for why that
--    file's names ended up in real rows).
delete from public.staff_schedules
where staff_profile_id in (select id from _pilot_cleanup_demo_profiles)
   or notes like 'E2E-SLOT-%'
   or staff_name in ('Chen Wei-Ming', 'Lin Mei-Hui', 'Wang Da-Wei', 'Chang Yu-Fen', 'Liu Kuo-Cheng');

-- 5. duty_rosters — created by a demo account.
delete from public.duty_rosters
where created_by in (select id from _pilot_cleanup_demo_profiles);

-- 6. profiles — last. auth.users rows are untouched; see
--    REAL_VENDOR_PILOT_CHECKLIST.md for the manual Dashboard steps.
delete from public.profiles
where id in (select id from _pilot_cleanup_demo_profiles);

-- ── Verification — read this before committing ─────────────────────────────
-- If anything here looks wrong, run `rollback;` instead of `commit;` below.
select 'appointment_requests remaining' as check_label, count(*) as remaining_count from public.appointment_requests
union all select 'appointment_documents remaining', count(*) from public.appointment_documents
union all select 'appointment_messages remaining', count(*) from public.appointment_messages
union all select 'status_updates remaining', count(*) from public.status_updates
union all select 'notification_logs remaining', count(*) from public.notification_logs
union all select 'projects remaining', count(*) from public.projects
union all select 'project_members remaining', count(*) from public.project_members
union all select 'project_tasks remaining', count(*) from public.project_tasks
union all select 'project_vendor_members remaining', count(*) from public.project_vendor_members
union all select 'project_vendor_tasks remaining', count(*) from public.project_vendor_tasks
union all select 'project_comments remaining', count(*) from public.project_comments
union all select 'project_documents remaining', count(*) from public.project_documents
union all select 'project_activity remaining', count(*) from public.project_activity
union all select 'project_notifications remaining', count(*) from public.project_notifications
union all select 'staff_schedules remaining', count(*) from public.staff_schedules
union all select 'duty_rosters remaining', count(*) from public.duty_rosters
union all select 'profiles remaining (should include only real accounts + the ambiguous one, if any)', count(*) from public.profiles
order by check_label;

-- If the Supabase SQL Editor auto-commits a pasted script when it reaches
-- the end without error, this line is what actually persists the deletes.
-- If you're running this statement-by-statement (e.g. via psql) and the
-- verification counts above look wrong, run `rollback;` instead.
commit;
