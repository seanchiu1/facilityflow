-- ============================================================
-- FacilityFlow: Project Collaboration Lite
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - sites table (supabase_sites_poc_linkage_migration.sql)
--   - profiles has role/display_name/email/is_active (M-3–M-9)
--   - Helper functions is_admin_or_manager()/is_internal_role()/
--     current_profile_role() (supabase_rls_prep_migration.sql)
--   - public.set_updated_at() trigger function (D-5)
--
-- Scope of THIS migration:
--   1. Three new tables: projects, project_members, project_tasks
--   2. One new nullable column on appointment_requests: project_id
--      (additive — every existing appointment keeps rendering exactly
--      as before, with no project linked)
--   3. A new helper function is_project_member(project_id) — lets RLS
--      policies check staff membership without recursing into
--      project_members' own RLS
--   4. RLS on all three new tables, every policy explicitly scoped
--      `to authenticated` (matching the defense-in-depth pass applied
--      to sites/staff_schedules/profiles) — never left to default to
--      PUBLIC even though the USING clauses would still deny anon.
--   5. update_my_project_task_status(task_id, new_status) RPC — the ONLY
--      way a staff member can change a task assigned to them. There is
--      no staff UPDATE policy on project_tasks at all (see below for why).
--   6. sync_project_owner_membership() trigger on projects — keeps a
--      project's owner_profile_id always present in project_members
--      (project_role = 'Owner'), so a staff owner can see their own
--      project under the same is_project_member() check every other
--      staff member relies on. Includes a one-time backfill for any
--      projects that predate this trigger.
--
-- Access model (v1, deliberately "lite"):
--   - admin/manager: full read/write on all three tables and on
--     appointment_requests.project_id (via the existing, unchanged
--     internal-role UPDATE policy on that table).
--   - staff: read-only on projects/members/tasks for projects they are
--     a member of (project_members row with profile_id = their own id).
--     Staff have NO UPDATE policy on project_tasks — Postgres RLS is
--     row-level, not column-level, so a policy scoped to
--     "assignee_profile_id = auth.uid()" would still let that staff
--     member's browser send an UPDATE touching title/description/
--     due_date, not just status. Instead, status changes go through
--     update_my_project_task_status(), a SECURITY DEFINER RPC that does
--     exactly one thing (set status + updated_at on a task assigned to
--     the caller, after validating the new value) and nothing else —
--     the same narrowest-correct-grant pattern already used for vendor
--     progress updates (see supabase_d6_vendor_progress_migration.sql).
--   - vendor: no policy on any of the three tables at all, and no grant
--     on the RPC beyond what `to authenticated` implies — RLS
--     default-denies every operation, and the RPC's own check
--     (assignee_profile_id = auth.uid()) would reject a vendor caller
--     regardless, since assignee_profile_id only ever points at an
--     internal (admin/manager/staff) profile — nothing in this schema
--     lets a vendor profile be assigned a task in the first place. No
--     frontend route renders project data for vendor either
--     (belt-and-suspenders, same pattern as duty_rosters/sites/admin
--     pages).
--
-- Explicitly NOT built in this pass (see PHASE2_REQUIREMENTS.md for the
-- full "Lite" scope note):
--   - No Kanban/drag-and-drop, no project documents, no comments
--   - No vendor project access
--   - No DELETE policy on any of the three tables — cancel a project via
--     status = 'Cancelled' instead of deleting it; task/member removal
--     UI uses DELETE but only for admin/manager (see policies below)
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. projects ----------------------------------------------------------

create table if not exists public.projects (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text,
  site_id                 uuid references public.sites(id),
  status                  text not null default 'Active',
  owner_profile_id        uuid references public.profiles(id),
  start_date              date,
  target_completion_date  date,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table public.projects
  drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check ( status in ('Planning', 'Active', 'Blocked', 'Completed', 'Cancelled') );

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index if not exists idx_projects_site_id on public.projects(site_id);
create index if not exists idx_projects_status  on public.projects(status);

-- 2. project_members -----------------------------------------------------

create table if not exists public.project_members (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  profile_id   uuid references public.profiles(id),
  project_role text default 'Member',
  created_at   timestamptz default now()
);

alter table public.project_members
  drop constraint if exists project_members_unique;
alter table public.project_members
  add constraint project_members_unique unique (project_id, profile_id);

create index if not exists idx_project_members_project_id on public.project_members(project_id);
create index if not exists idx_project_members_profile_id on public.project_members(profile_id);

-- 2a. Owner-membership sync -----------------------------------------------
-- A project's owner_profile_id must always also be a project_members row,
-- or staff-visibility RLS (is_project_member(), see §6 below) never lets
-- the owner see their own project — is_admin_or_manager() only helps if
-- the owner happens to be admin/manager, but owners are frequently staff.
--
-- SECURITY DEFINER even though admin/manager (the only roles that can
-- write to `projects`) already have their own INSERT/UPDATE grant on
-- project_members — this guarantees the sync keeps working even if that
-- policy is ever tightened later, matching the same "small function that
-- does exactly one privileged thing" pattern as is_project_member() and
-- update_appointment_progress().
create or replace function public.sync_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_profile_id is not null then
    insert into public.project_members (project_id, profile_id, project_role)
    values (new.id, new.owner_profile_id, 'Owner')
    on conflict (project_id, profile_id) do update set project_role = 'Owner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_owner_membership on public.projects;
create trigger trg_sync_project_owner_membership
  after insert or update of owner_profile_id on public.projects
  for each row execute function public.sync_project_owner_membership();

-- One-time backfill for any project rows that predate this trigger (e.g.
-- created by an earlier version of this migration, or by demo-seed SQL).
-- Re-running this is harmless: on conflict just re-affirms 'Owner'.
insert into public.project_members (project_id, profile_id, project_role)
select id, owner_profile_id, 'Owner'
from public.projects
where owner_profile_id is not null
on conflict (project_id, profile_id) do update set project_role = 'Owner';

-- Known limitation, not fixed here: if a project's owner_profile_id is
-- later changed to someone else (or cleared), the PREVIOUS owner's
-- project_members row is left exactly as it was — still a member, but
-- with a now-stale 'Owner' label. Reassigning ownership doesn't
-- auto-demote the old owner's membership; that would need its own
-- decision (should the old owner keep membership at all?) which is out
-- of scope for this fix. The safer, narrower guarantee this migration
-- makes is one-directional: whoever IS the current owner is always a
-- member with that label, not that the label is perfectly maintained
-- forever after ownership moves on.

-- 3. project_tasks --------------------------------------------------------

create table if not exists public.project_tasks (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid references public.projects(id) on delete cascade,
  title                text not null,
  description          text,
  assignee_profile_id  uuid references public.profiles(id),
  status               text not null default 'Todo',
  due_date             date,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table public.project_tasks
  drop constraint if exists project_tasks_status_check;
alter table public.project_tasks
  add constraint project_tasks_status_check
  check ( status in ('Todo', 'In Progress', 'Blocked', 'Done') );

drop trigger if exists trg_project_tasks_updated_at on public.project_tasks;
create trigger trg_project_tasks_updated_at
  before update on public.project_tasks
  for each row execute function public.set_updated_at();

create index if not exists idx_project_tasks_project_id  on public.project_tasks(project_id);
create index if not exists idx_project_tasks_assignee_id on public.project_tasks(assignee_profile_id);

-- 4. appointment_requests: optional project link -----------------------

alter table public.appointment_requests
  add column if not exists project_id uuid references public.projects(id);

create index if not exists idx_appointment_requests_project_id
  on public.appointment_requests(project_id);

-- No RLS change on appointment_requests — the existing internal-role
-- UPDATE policy (RLS Step 2) is already row-level, not column-level, so
-- it already covers this new column. Vendor still has no UPDATE policy
-- on this table at all. Same reasoning as M-9's site_id/
-- assigned_poc_profile_id addition.

-- 5. Membership helper ------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and profile_id = auth.uid()
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;

-- 6. RLS -----------------------------------------------------------------

alter table public.projects       enable row level security;
alter table public.project_members enable row level security;
alter table public.project_tasks   enable row level security;

-- ── projects ──────────────────────────────────────────────────────────

drop policy if exists "internal roles read accessible projects" on public.projects;
create policy "internal roles read accessible projects"
  on public.projects
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(id))
  );

drop policy if exists "admins and managers insert projects" on public.projects;
create policy "admins and managers insert projects"
  on public.projects
  for insert
  to authenticated
  with check ( public.is_admin_or_manager() );

drop policy if exists "admins and managers update projects" on public.projects;
create policy "admins and managers update projects"
  on public.projects
  for update
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- No delete policy — cancel via status = 'Cancelled' instead.

-- ── project_members ───────────────────────────────────────────────────

drop policy if exists "internal roles read accessible project members" on public.project_members;
create policy "internal roles read accessible project members"
  on public.project_members
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

drop policy if exists "admins and managers manage project members" on public.project_members;
create policy "admins and managers manage project members"
  on public.project_members
  for all
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- ── project_tasks ─────────────────────────────────────────────────────

drop policy if exists "internal roles read accessible project tasks" on public.project_tasks;
create policy "internal roles read accessible project tasks"
  on public.project_tasks
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

drop policy if exists "admins and managers manage project tasks" on public.project_tasks;
create policy "admins and managers manage project tasks"
  on public.project_tasks
  for all
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- No staff UPDATE policy on project_tasks — see header comment. Status
-- changes for a staff member's own assigned task go through the RPC below
-- instead, which is the only write path staff have onto this table at all.
--
-- Cleanup drop for any environment where an earlier version of this
-- migration already created the row-level staff UPDATE policy — kept here
-- (even though nothing re-creates it) so re-running this file removes it
-- rather than leaving it in place alongside the new RPC.
drop policy if exists "staff updates own assigned task" on public.project_tasks;

-- vendor: no policy on projects/project_members/project_tasks at all —
-- RLS default-denies every operation for that role.

-- 7. Staff task-status RPC ------------------------------------------------
-- The only way a non-admin/manager caller can change a project_task row.
-- Column-scoped by construction (only status + updated_at are ever
-- written), unlike a row-level RLS UPDATE policy which cannot be
-- restricted to a subset of columns. Same pattern as
-- update_appointment_progress() in supabase_d6_vendor_progress_migration.sql.

create or replace function public.update_my_project_task_status(
  task_id uuid,
  new_status text
)
returns public.project_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_profile_id uuid;
  v_task public.project_tasks;
begin
  if new_status is null or new_status not in ('Todo', 'In Progress', 'Blocked', 'Done') then
    raise exception 'new_status must be one of Todo, In Progress, Blocked, Done';
  end if;

  select assignee_profile_id into v_assignee_profile_id
  from public.project_tasks
  where id = task_id;

  if not found then
    raise exception 'Task not found';
  end if;

  -- Defense-in-depth: only an internal (admin/manager/staff) caller may
  -- proceed at all, even though assignee_profile_id should never point at
  -- a vendor or be reachable by an anon caller in practice. Belt and
  -- suspenders against bad data or a future schema change that makes
  -- either of those assumptions no longer hold.
  if not public.is_internal_role() then
    raise exception 'Not authorized to update this task''s status';
  end if;

  -- Only the assignee may call this successfully. Admin/manager keep
  -- using the normal update policy above for full task management
  -- (including reassigning, editing title/description/due_date), not
  -- this RPC — it deliberately does not grant them a bypass here.
  if v_assignee_profile_id is distinct from auth.uid() then
    raise exception 'Not authorized to update this task''s status';
  end if;

  update public.project_tasks
    set status = new_status,
        updated_at = now()
    where id = task_id
    returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.update_my_project_task_status(uuid, text) from public;
grant execute on function public.update_my_project_task_status(uuid, text) to authenticated;

-- Vendors are granted EXECUTE (via `to authenticated`, same as every other
-- authenticated user) but can never successfully call this: the function's
-- own check compares assignee_profile_id to auth.uid(), and
-- assignee_profile_id is only ever set to an admin/manager/staff profile
-- id — nothing in this schema allows a vendor profile to be assigned a
-- project_task in the first place, so the "is_distinct_from" check always
-- fails for a vendor caller.
