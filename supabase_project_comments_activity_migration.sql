-- ============================================================
-- FacilityFlow: Project Comments + Activity Feed (v1)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - projects / project_members / project_tasks tables + RLS
--     (supabase_projects_lite_migration.sql)
--   - Helper functions is_admin_or_manager()/is_internal_role()/
--     is_project_member() (rls_prep + projects_lite migrations)
--   - public.set_updated_at() trigger function (D-5)
--
-- Scope of THIS migration:
--   1. Two new tables: project_comments, project_activity
--   2. RLS on both, every policy explicitly `to authenticated`
--   3. A superseding CREATE OR REPLACE of
--      update_my_project_task_status() so a staff member's own task
--      status change also logs a project_activity row — this is why
--      staff need NO INSERT policy on project_activity at all (see
--      "Activity write model" below).
--
-- This is project comments + activity v1 — NOT full chat. No realtime,
-- no threading, no mentions, no edit/delete of comments, no vendor
-- access. See PHASE2_REQUIREMENTS.md §6-D/§6-E for the honest scope
-- record.
--
-- Activity write model (deliberately simple, per the design brief):
--   - Activity rows are inserted by the FRONTEND after a successful
--     admin/manager write (project created, status changed, member
--     added, task created, task status changed by a manager,
--     appointment linked). These inserts are fire-and-forget — a failed
--     activity insert never rolls back or blocks the action it
--     describes. Covered by the admin/manager INSERT policy below.
--   - The ONE staff-initiated event (own-task status change) is logged
--     inside the update_my_project_task_status() SECURITY DEFINER RPC,
--     atomically with the status change itself — so staff never need an
--     INSERT policy on project_activity, keeping the activity table
--     append-only from exactly two paths: managers (via policy) and the
--     RPC (via definer rights).
--   - Consequence, stated honestly: the feed is only as complete as the
--     app code that remembers to log. A direct SQL/API write that
--     bypasses the app inserts no activity row. This is an audit
--     convenience, not a tamper-proof audit log.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. project_comments ----------------------------------------------------

create table if not exists public.project_comments (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete cascade,
  author_profile_id  uuid references public.profiles(id),
  body               text not null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

drop trigger if exists trg_project_comments_updated_at on public.project_comments;
create trigger trg_project_comments_updated_at
  before update on public.project_comments
  for each row execute function public.set_updated_at();

create index if not exists idx_project_comments_project_id
  on public.project_comments(project_id, created_at);

-- 2. project_activity -----------------------------------------------------

create table if not exists public.project_activity (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references public.projects(id) on delete cascade,
  actor_profile_id  uuid references public.profiles(id),
  activity_type     text not null,
  summary           text not null,
  metadata          jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);

alter table public.project_activity
  drop constraint if exists project_activity_type_check;
alter table public.project_activity
  add constraint project_activity_type_check
  check ( activity_type in (
    'project_created', 'status_changed', 'member_added',
    'task_created', 'task_status_changed', 'appointment_linked'
  ) );

create index if not exists idx_project_activity_project_id
  on public.project_activity(project_id, created_at desc);

-- 3. RLS -------------------------------------------------------------------

alter table public.project_comments enable row level security;
alter table public.project_activity enable row level security;

-- ── project_comments ──────────────────────────────────────────────────

drop policy if exists "internal roles read accessible project comments" on public.project_comments;
create policy "internal roles read accessible project comments"
  on public.project_comments
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

-- INSERT: admin/manager on any project; staff only on projects they are a
-- member of. Both are pinned to author_profile_id = auth.uid() so a
-- caller can never post a comment under someone else's identity.
drop policy if exists "internal roles comment on accessible projects" on public.project_comments;
create policy "internal roles comment on accessible projects"
  on public.project_comments
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and (
      public.is_admin_or_manager()
      or (public.is_internal_role() and public.is_project_member(project_id))
    )
  );

-- No UPDATE/DELETE policy — comments are immutable in v1 (no edit/delete
-- UI exists either).

-- ── project_activity ──────────────────────────────────────────────────

drop policy if exists "internal roles read accessible project activity" on public.project_activity;
create policy "internal roles read accessible project activity"
  on public.project_activity
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

-- INSERT: admin/manager only, pinned to their own identity. Staff-driven
-- activity (own-task status change) is written by the SECURITY DEFINER
-- RPC below, not through any policy. Vendors: no policy at all.
drop policy if exists "admins and managers log project activity" on public.project_activity;
create policy "admins and managers log project activity"
  on public.project_activity
  for insert
  to authenticated
  with check (
    public.is_admin_or_manager()
    and actor_profile_id = auth.uid()
  );

-- No UPDATE/DELETE policy — the feed is append-only for every frontend role.

-- 4. Supersede update_my_project_task_status() ---------------------------
-- Identical signature and behavior to the version in
-- supabase_projects_lite_migration.sql, plus one addition: a successful
-- status change also inserts a project_activity row, atomically in the
-- same function call. This CREATE OR REPLACE fully supersedes the earlier
-- definition — running this file on an environment that already applied
-- the projects migration upgrades the function in place.

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

  if not public.is_internal_role() then
    raise exception 'Not authorized to update this task''s status';
  end if;

  if v_assignee_profile_id is distinct from auth.uid() then
    raise exception 'Not authorized to update this task''s status';
  end if;

  update public.project_tasks
    set status = new_status,
        updated_at = now()
    where id = task_id
    returning * into v_task;

  -- New in this migration: log the change to the activity feed. Runs with
  -- definer rights, so no staff INSERT policy on project_activity exists
  -- or is needed.
  insert into public.project_activity
    (project_id, actor_profile_id, activity_type, summary, metadata)
  values (
    v_task.project_id,
    auth.uid(),
    'task_status_changed',
    v_task.title || ' → ' || new_status,
    jsonb_build_object('task_id', v_task.id, 'new_status', new_status)
  );

  return v_task;
end;
$$;

revoke all on function public.update_my_project_task_status(uuid, text) from public;
grant execute on function public.update_my_project_task_status(uuid, text) to authenticated;
