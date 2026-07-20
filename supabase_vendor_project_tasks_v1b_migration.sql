-- ============================================================
-- FacilityFlow: Vendor Project Tasks (v1b)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - project_vendor_members / is_project_vendor(project_id) /
--     is_project_vendor_member(project_id, vendor_profile_id)
--     (supabase_vendor_project_access_v1a_migration.sql, including its
--     hardening pass)
--   - Helper functions is_admin_or_manager()/is_internal_role()/
--     current_profile_role() (supabase_rls_prep_migration.sql)
--   - is_project_member() (supabase_projects_lite_migration.sql) — NOT
--     used or modified anywhere in this migration, see the warning below
--
-- Scope of THIS migration (v1b):
--   1. New table: project_vendor_tasks — a SEPARATE table from
--      project_tasks. Vendor tasks never touch project_tasks, and
--      project_tasks' own RLS/RPC are completely untouched by this file.
--   2. A validation trigger rejecting any row whose vendor_profile_id
--      isn't an actual project_vendor_members row for that SAME project —
--      same "no orphan share" shape as project_documents/project_comments
--      in v1a's hardening pass (§5b/§6b there). This single check also
--      guarantees vendor_profile_id is role='vendor', for free: a profile
--      can only ever be IN project_vendor_members if it already passed
--      that table's own role-enforcing trigger
--      (enforce_vendor_member_role(), v1a §1) — so there is no separate
--      "is this profile actually a vendor" check needed here.
--   3. RLS: admin/manager full CRUD; internal project members read-only
--      (their own projects only — safe, since this table carries no
--      vendor PII beyond a profile id, same reasoning that already let
--      internal roles read vendor_profile_id/site_id columns elsewhere);
--      vendor SELECT own tasks only.
--   4. update_my_vendor_project_task_status(task_id, new_status) — the
--      ONLY way a vendor can change a task's status. No vendor UPDATE
--      policy exists on this table at all, for the exact same reason
--      update_my_project_task_status() exists for internal staff: RLS is
--      row-level, not column-level, so a policy scoped to "your own
--      task" would still let a vendor's browser rewrite title/
--      description/due_date, not just status.
--   5. Widens project_activity's type CHECK to allow
--      'vendor_task_created'/'vendor_task_status_changed', logged only
--      from admin/manager-initiated writes (see §5 below).
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️  MAINTAINER WARNING (same one from v1a, repeated because this file
--     adds a second table where the mistake could be made)
-- ══════════════════════════════════════════════════════════════
-- is_project_vendor()/is_project_vendor_member() are NOT interchangeable
-- with is_project_member(), and none of them grant internal-role access.
-- This migration does not call is_project_member() for any VENDOR-facing
-- policy, and does not call is_project_vendor()/is_project_vendor_member()
-- for any INTERNAL-facing policy. If a table needs both, write two
-- separate policies, as done here.
-- ══════════════════════════════════════════════════════════════
--
-- Explicitly OUT of scope for v1b:
--   - No activity-feed entry, no project_notifications entry for vendor
--     task events — project_activity/project_notifications write paths
--     both gate on is_internal_role(), which a vendor fails by
--     construction, same as every other vendor-triggered event in v1a.
--     Admin/manager-created vendor tasks DO log to project_activity below
--     (that write is admin/manager-initiated, not vendor-initiated, so it
--     already fits the existing admin/manager activity-logging model —
--     see the frontend notes). Vendor-initiated status changes do not.
--   - No vendor task DELETE UI (the admin/manager RLS technically allows
--     it via `for all`, mirroring project_tasks' own policy shape, but no
--     delete button exists — matches project_tasks' current UI exactly).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. project_vendor_tasks -------------------------------------------------

create table if not exists public.project_vendor_tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete cascade,
  vendor_profile_id  uuid references public.profiles(id),
  title              text not null,
  description        text,
  status             text not null default 'Todo',
  due_date           date,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.project_vendor_tasks
  drop constraint if exists project_vendor_tasks_status_check;
alter table public.project_vendor_tasks
  add constraint project_vendor_tasks_status_check
  check ( status in ('Todo', 'In Progress', 'Blocked', 'Done') );

drop trigger if exists trg_project_vendor_tasks_updated_at on public.project_vendor_tasks;
create trigger trg_project_vendor_tasks_updated_at
  before update on public.project_vendor_tasks
  for each row execute function public.set_updated_at();

create index if not exists idx_project_vendor_tasks_project_id
  on public.project_vendor_tasks(project_id);
create index if not exists idx_project_vendor_tasks_vendor_id
  on public.project_vendor_tasks(vendor_profile_id);
create index if not exists idx_project_vendor_tasks_status
  on public.project_vendor_tasks(status);

-- 2. Validation trigger — no orphan vendor task -------------------------
-- Rejects any insert/update naming a vendor_profile_id that isn't an
-- actual project_vendor_members row for THIS SAME project_id. Fires
-- regardless of which RLS policy authorized the write (there is only one
-- write path with a vendor_profile_id-setting ability — admin/manager —
-- but this is written the same defense-in-depth way as v1a's §5b/§6b so
-- it keeps working correctly even if a future policy adds another write
-- path). SECURITY DEFINER so it can evaluate is_project_vendor_member()
-- regardless of the calling session's own row-level access.
create or replace function public.enforce_vendor_task_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_vendor_member(new.project_id, new.vendor_profile_id) then
    raise exception 'project_vendor_tasks.vendor_profile_id must be a vendor member of this project';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_vendor_task_membership on public.project_vendor_tasks;
create trigger trg_enforce_vendor_task_membership
  before insert or update of project_id, vendor_profile_id on public.project_vendor_tasks
  for each row execute function public.enforce_vendor_task_membership();

-- 3. RLS ------------------------------------------------------------------

alter table public.project_vendor_tasks enable row level security;

-- Admin/manager: full CRUD on vendor tasks for any project. Mirrors
-- project_tasks' own "admins and managers manage project tasks" policy
-- shape exactly (`for all`), including that DELETE is technically granted
-- but unused by any current UI — same as project_tasks today.
drop policy if exists "admins and managers manage project vendor tasks" on public.project_vendor_tasks;
create policy "admins and managers manage project vendor tasks"
  on public.project_vendor_tasks
  for all
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- Internal project members: READ-ONLY, own projects only. Safe to grant —
-- this table carries no vendor PII beyond vendor_profile_id (a UUID);
-- staff already can't resolve that id to a name (no profiles read on
-- vendor rows, no get_vendor_directory() access), so this is a narrower
-- grant than it might look, not a new PII exposure. No staff write path
-- exists on this table at all.
drop policy if exists "internal roles read accessible project vendor tasks" on public.project_vendor_tasks;
create policy "internal roles read accessible project vendor tasks"
  on public.project_vendor_tasks
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

-- Vendor: read only their own tasks, only on a project they're still a
-- vendor member of (belt-and-suspenders — a vendor removed from
-- project_vendor_members immediately loses read access even to tasks
-- still tagged with their id, exactly like v1a's document/comment
-- policies).
drop policy if exists "vendors read their own project vendor tasks" on public.project_vendor_tasks;
create policy "vendors read their own project vendor tasks"
  on public.project_vendor_tasks
  for select
  to authenticated
  using (
    vendor_profile_id = auth.uid()
    and public.is_project_vendor(project_id)
  );

-- No vendor INSERT/UPDATE/DELETE policy at all — vendors never create
-- their own tasks (admin/manager assign them), and the ONLY write a
-- vendor can ever make is a status change, which goes through the
-- column-scoped RPC below, not a table policy.

-- 4. Vendor task-status RPC ------------------------------------------------
-- The only way a vendor can change a project_vendor_tasks row. Column-
-- scoped by construction (only status + updated_at are ever written),
-- exactly like update_my_project_task_status() for internal staff.

create or replace function public.update_my_vendor_project_task_status(
  task_id uuid,
  new_status text
)
returns public.project_vendor_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.project_vendor_tasks;
begin
  if new_status is null or new_status not in ('Todo', 'In Progress', 'Blocked', 'Done') then
    raise exception 'new_status must be one of Todo, In Progress, Blocked, Done';
  end if;

  -- Caller must actually be a vendor. Checked before touching the task
  -- row so a non-vendor caller (internal or anon) gets the same rejection
  -- regardless of whether task_id even exists.
  if public.current_profile_role() is distinct from 'vendor' then
    raise exception 'Not authorized to update this task''s status';
  end if;

  select * into v_task
  from public.project_vendor_tasks
  where id = task_id;

  if not found then
    raise exception 'Task not found';
  end if;

  -- Only the assigned vendor may call this successfully.
  if v_task.vendor_profile_id is distinct from auth.uid() then
    raise exception 'Not authorized to update this task''s status';
  end if;

  -- Defense-in-depth: re-check current project_vendor_members standing at
  -- the moment of the call, not just at task-creation time — a vendor
  -- removed from the project after a task was assigned to them loses the
  -- ability to update it, even though task.vendor_profile_id still
  -- matches their own id.
  if not public.is_project_vendor(v_task.project_id) then
    raise exception 'Not authorized to update this task''s status';
  end if;

  update public.project_vendor_tasks
    set status = new_status,
        updated_at = now()
    where id = task_id
    returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.update_my_vendor_project_task_status(uuid, text) from public;
grant execute on function public.update_my_vendor_project_task_status(uuid, text) to authenticated;

-- Non-vendor callers (internal or a different vendor) are granted EXECUTE
-- (via `to authenticated`, same as every other RPC in this app) but can
-- never successfully call this: the role check and the ownership check
-- above both fail for them.

-- 5. Optional activity-feed entries (admin/manager-initiated only) --------
-- Widen project_activity's type CHECK to allow two new types, same
-- superseding pattern already used when project_documents added
-- 'document_uploaded'. Only admin/manager-initiated events log here
-- (task created, or an admin/manager editing a vendor task's status) —
-- the vendor's OWN status change via the RPC above does NOT log activity,
-- since project_activity's INSERT policy (from
-- supabase_project_documents_migration.sql) only covers admin/manager or
-- an internal project member, and a vendor is neither. This is a
-- documented v1b limitation, not an oversight — see the header note.
alter table public.project_activity
  drop constraint if exists project_activity_type_check;
alter table public.project_activity
  add constraint project_activity_type_check
  check ( activity_type in (
    'project_created', 'status_changed', 'member_added',
    'task_created', 'task_status_changed', 'appointment_linked',
    'document_uploaded', 'vendor_task_created', 'vendor_task_status_changed'
  ) );
