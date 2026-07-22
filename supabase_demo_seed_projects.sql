-- ============================================================================
-- FacilityFlow — Demo data seed: Project Collaboration + Vendor Access
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor, AFTER:
--   1. supabase_demo_seed.sql (the original appointments/roster/schedule
--      seed) — recommended but not required; this file's appointment-
--      linking step (§7) just matches zero rows if that seed hasn't run.
--   2. Creating all FIVE demo auth users + profiles (SUPABASE_SETUP.md §0)
--      — including the two added for this seed: admin@facilityflow.demo
--      and vendor2@facilityflow.demo
--   3. Every migration through
--      supabase_vendor_project_notifications_v1c_migration.sql
--
-- This is a SEPARATE, additive file rather than an edit to
-- supabase_demo_seed.sql — that file's appointment/roster story is already
-- referenced scene-by-scene in DEMO_SCRIPT.md and works today; this file
-- only adds new rows on top of it (plus two new sites) and links two of
-- its existing appointments by id, without touching or reordering anything
-- it already seeds.
--
-- What this seeds:
--   1. Two sites: "Qualcomm HQ Campus", "Data Center Annex"
--   2. Two projects, each owned by the manager (owner auto-syncs into
--      project_members via the existing trigger), staff added as a member:
--        - "Building A Elevator Modernization" (HQ Campus, Active)
--        - "Data Center Fire Safety Upgrade" (Data Center Annex, Planning)
--   3. project_vendor_members — ONE DIFFERENT vendor per project
--      (Taiwan Elevator Services on the elevator project, Formosa Fire
--      Safety Co. on the fire-safety project) — deliberately not the same
--      vendor on both, so the demo can show Vendor A cannot see Vendor B's
--      project, tasks, or shared thread at all.
--   4. Internal project_tasks (assigned to staff) and project_vendor_tasks
--      (assigned to each project's vendor), mixed statuses so both a
--      Todo→In Progress change and a completed item are visible.
--   5. Two of supabase_demo_seed.sql's already-seeded appointments linked
--      to these projects via appointment_requests.project_id — the
--      elevator inspection to the elevator project, the AED replacement to
--      the fire-safety project. No-ops (matches zero rows) if that seed
--      wasn't run first.
--   6. Internal-only project_comments, plus a per-vendor SHARED thread on
--      each project (one manager message + one vendor reply) — pre-seeded
--      so Scene 12's "shared vs. internal" distinction is visible on
--      first load, not just after live typing.
--   7. A handful of unread project_notifications, so the bell shows real
--      unread badges the moment any demo account logs in.
--
-- What this deliberately does NOT seed:
--   - project_documents rows. A metadata-only row with no matching object
--     in Storage shows "Link unavailable" when clicked — the exact same
--     reasoning supabase_demo_seed.sql already documents for why it skips
--     a fake supporting-document row. Upload one small PDF live during the
--     demo instead (DEMO_SCRIPT.md Scene 12) — the Internal/Shared-with-
--     vendor visibility picker on that upload form is itself worth
--     showing, and only works with a file that actually exists.
--
-- Idempotency: every seeded project/task/comment is marked with the
-- "[DEMO SEED]" prefix, same convention as supabase_demo_seed.sql.
-- Re-running without cleanup inserts duplicates (no natural unique key to
-- upsert projects/tasks/comments on — only `sites` is upsert-safe via its
-- unique `name`). Cleanup block is at the bottom of this file.
-- ============================================================================

do $$
declare
  v_admin_id          uuid;
  v_manager_id        uuid;
  v_staff_id          uuid;
  v_vendor_id         uuid;
  v_vendor2_id        uuid;
  v_site_hq           uuid;
  v_site_dc           uuid;
  v_project_elevator  uuid;
  v_project_fire      uuid;
begin
  select id into v_admin_id   from auth.users where email = 'admin@facilityflow.demo';
  select id into v_manager_id from auth.users where email = 'manager@facilityflow.demo';
  select id into v_staff_id   from auth.users where email = 'staff@facilityflow.demo';
  select id into v_vendor_id  from auth.users where email = 'vendor@facilityflow.demo';
  select id into v_vendor2_id from auth.users where email = 'vendor2@facilityflow.demo';

  if v_admin_id is null or v_manager_id is null or v_staff_id is null
     or v_vendor_id is null or v_vendor2_id is null then
    raise exception 'One or more demo users not found — create all five demo accounts first (SUPABASE_SETUP.md §0), including admin@facilityflow.demo and vendor2@facilityflow.demo';
  end if;

  -- 1. Sites (upsert-safe — name is unique) --------------------------------
  insert into sites (name, code, is_active) values ('Qualcomm HQ Campus', 'HQ', true)
    on conflict (name) do update set is_active = true
    returning id into v_site_hq;
  insert into sites (name, code, is_active) values ('Data Center Annex', 'DCA', true)
    on conflict (name) do update set is_active = true
    returning id into v_site_dc;

  -- 2. Projects -------------------------------------------------------------
  insert into projects (name, description, site_id, status, owner_profile_id, start_date, target_completion_date, created_by)
  values (
    'Building A Elevator Modernization',
    '[DEMO SEED] Full modernization of Elevators 1-2 in Building A — control system replacement, cab refurbishment, and code-compliance upgrade.',
    v_site_hq, 'Active', v_manager_id, current_date - 10, current_date + 45, v_manager_id
  ) returning id into v_project_elevator;

  insert into projects (name, description, site_id, status, owner_profile_id, start_date, target_completion_date, created_by)
  values (
    'Data Center Fire Safety Upgrade',
    '[DEMO SEED] Replace aging fire suppression and AED equipment across the Data Center Annex ahead of the Q3 compliance audit.',
    v_site_dc, 'Planning', v_manager_id, current_date + 5, current_date + 60, v_manager_id
  ) returning id into v_project_fire;

  -- 3. Internal members — owner (manager) is auto-synced by
  -- sync_project_owner_membership(); only staff needs an explicit row.
  insert into project_members (project_id, profile_id, project_role) values
    (v_project_elevator, v_staff_id, 'Coordinator'),
    (v_project_fire,     v_staff_id, 'Coordinator')
  on conflict (project_id, profile_id) do nothing;

  -- 4. Vendor members — one DIFFERENT vendor per project (see header).
  insert into project_vendor_members (project_id, vendor_profile_id, added_by) values
    (v_project_elevator, v_vendor_id,  v_manager_id),
    (v_project_fire,     v_vendor2_id, v_manager_id)
  on conflict (project_id, vendor_profile_id) do nothing;

  -- 5. Internal tasks ---------------------------------------------------------
  insert into project_tasks (project_id, title, description, assignee_profile_id, status, due_date) values
    (v_project_elevator, 'Coordinate building access for elevator contractor',
     '[DEMO SEED] Badge access for the full crew during the modernization window.',
     v_staff_id, 'In Progress', current_date + 3),
    (v_project_elevator, 'Notify tenants of elevator downtime',
     '[DEMO SEED] Post notices on all affected floors 48h before each outage window.',
     v_staff_id, 'Todo', current_date + 7),
    (v_project_fire, 'Confirm fire marshal inspection date',
     '[DEMO SEED] Coordinate with the city fire marshal for the post-upgrade sign-off.',
     v_staff_id, 'Todo', current_date + 20);

  -- 6. Vendor tasks -------------------------------------------------------
  -- Deliberately left in 'In Progress'/'Todo', not 'Done' — the first is
  -- the exact task the demo changes status on live (Scene 12, vendor side).
  insert into project_vendor_tasks (project_id, vendor_profile_id, title, description, status, due_date, created_by) values
    (v_project_elevator, v_vendor_id, 'Submit control system spec sheet',
     '[DEMO SEED] Vendor to provide the updated control panel spec for city permitting.',
     'In Progress', current_date + 5, v_manager_id),
    (v_project_elevator, v_vendor_id, 'Complete Elevator 1 cab refurbishment',
     '[DEMO SEED] Interior panel replacement and lighting upgrade.',
     'Todo', current_date + 20, v_manager_id),
    (v_project_fire, v_vendor2_id, 'Deliver replacement AED units',
     '[DEMO SEED] Ship and stage replacement AED units for floors 4-8 ahead of install.',
     'Todo', current_date + 15, v_manager_id);

  -- 7. Link two of supabase_demo_seed.sql's appointments to these projects
  -- (no-op, zero rows matched, if that seed hasn't been run yet).
  update appointment_requests set project_id = v_project_elevator
    where description like '[DEMO SEED] Elevator 3 annual safety inspection%';
  update appointment_requests set project_id = v_project_fire
    where description like '[DEMO SEED] AED battery + pad replacement%';

  -- 8. Internal-only comments ------------------------------------------------
  insert into project_comments (project_id, author_profile_id, author_display_name, body, visibility) values
    (v_project_elevator, v_manager_id, 'Manager Liu',
     '[DEMO SEED] Budget approved — let''s get the permit application moving this week.', 'internal'),
    (v_project_fire, v_staff_id, 'Chen Wei-Ming',
     '[DEMO SEED] City fire marshal wants the spec sheet before scheduling — chasing the vendor for it.', 'internal');

  -- 9. Shared vendor threads — one manager message + one vendor reply per
  -- project, so both directions of "shared vs. internal" are visible
  -- without typing anything live.
  insert into project_comments (project_id, author_profile_id, author_display_name, body, visibility, vendor_profile_id) values
    (v_project_elevator, v_manager_id, 'Manager Liu',
     '[DEMO SEED] Hi David — can you confirm the control panel spec sheet is still on track for Friday?',
     'shared', v_vendor_id),
    (v_project_elevator, v_vendor_id, 'David Lin',
     '[DEMO SEED] Yes, our engineering team is finalizing it now — will upload by Thursday EOD.',
     'shared', v_vendor_id),
    (v_project_fire, v_manager_id, 'Manager Liu',
     '[DEMO SEED] Amy — please confirm the AED unit count needed for floors 4-8 so we can lock the PO.',
     'shared', v_vendor2_id),
    (v_project_fire, v_vendor2_id, 'Amy Hsu',
     '[DEMO SEED] Confirmed — 6 units total, 2 per floor across the three affected floors.',
     'shared', v_vendor2_id);

  -- 10. Notifications — pre-seeded unread rows so the bell shows real
  -- activity the moment any demo account logs in, not just after a live
  -- action. Content mirrors §6/§9 above so clicking through lines up.
  insert into project_notifications (project_id, recipient_profile_id, actor_profile_id, notification_type, title, body) values
    (v_project_elevator, v_vendor_id, v_manager_id, 'vendor_task_assigned',
     'Task assigned to you', '[DEMO SEED] Submit control system spec sheet'),
    (v_project_fire, v_vendor2_id, v_manager_id, 'shared_comment_added',
     'New shared comment', '[DEMO SEED] Amy — please confirm the AED unit count...'),
    (v_project_elevator, v_manager_id, v_vendor_id, 'shared_comment_added',
     'New shared comment', '[DEMO SEED] Yes, our engineering team is finalizing it now...'),
    (v_project_fire, v_staff_id, v_vendor2_id, 'shared_comment_added',
     'New shared comment', '[DEMO SEED] Confirmed — 6 units total, 2 per floor...');

end $$;

-- ============================================================================
-- Cleanup — run this block to remove all seeded rows before re-seeding.
-- Sites are intentionally left in place (harmless to keep, may be reused).
-- Run top-to-bottom — later deletes depend on the projects still existing
-- when their id is looked up by name.
-- ============================================================================

-- delete from project_notifications where body like '[DEMO SEED]%';
-- delete from project_comments      where body like '[DEMO SEED]%';
-- delete from project_vendor_tasks  where description like '[DEMO SEED]%';
-- delete from project_tasks         where description like '[DEMO SEED]%';
-- update appointment_requests set project_id = null
--   where project_id in (select id from projects where description like '[DEMO SEED]%');
-- delete from project_vendor_members where project_id in (select id from projects where description like '[DEMO SEED]%');
-- delete from project_members        where project_id in (select id from projects where description like '[DEMO SEED]%');
-- delete from projects where description like '[DEMO SEED]%';
