-- ============================================================
-- FacilityFlow: Project/Vendor Notifications (v1c, in-app only)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - project_notifications table + RLS + create_project_notification()/
--     create_project_notifications_for_members()/mark_project_notification_read()/
--     mark_all_project_notifications_read() (supabase_project_notifications_migration.sql)
--   - project_vendor_members / is_project_vendor(project_id) /
--     is_project_vendor_member(project_id, vendor_profile_id)
--     (supabase_vendor_project_access_v1a_migration.sql, incl. hardening)
--   - project_vendor_tasks (supabase_vendor_project_tasks_v1b_migration.sql)
--   - Helper functions is_admin_or_manager()/is_internal_role()/
--     current_profile_role() (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration (v1c):
--   1. Widen project_notifications.notification_type to allow four new
--      values: vendor_task_assigned, shared_comment_added,
--      shared_document_uploaded, vendor_task_status_changed.
--   2. New column: related_vendor_task_id, referencing
--      project_vendor_tasks(id) — the existing related_task_id column
--      references project_tasks(id) and would raise a foreign-key
--      violation if a vendor task's id were ever inserted into it; vendor
--      task notifications use this new column instead.
--   3. Two new SECURITY DEFINER RPCs — NOT a widening of the existing two:
--        - notify_vendor_project_event(): admin/manager-only, notifies
--          ONE named vendor, only if that vendor is an actual
--          project_vendor_members row for the given project.
--        - notify_internal_vendor_project_event(): vendor-only, verifies
--          the CALLER is a vendor member of the given project, then fans
--          out to that project's internal team (same project_members
--          query create_project_notifications_for_members() already
--          uses) — recipients are computed server-side, never supplied
--          by the caller.
--      Kept completely separate from the existing two RPCs rather than
--      widening them — create_project_notification()/
--      create_project_notifications_for_members() both gate on
--      is_internal_role() as their very first check, and a vendor fails
--      that check by construction. Reusing them for vendor-triggered
--      events would mean either weakening that gate (letting a vendor
--      into a function that also handles internal-only notification
--      types) or branching internally on caller role in a way that's
--      harder to audit than two small, single-purpose functions.
--
-- RLS: NO CHANGES. project_notifications' existing SELECT policy
-- ("users read their own project notifications", using
-- recipient_profile_id = auth.uid()) is already role-agnostic — a vendor
-- reading their own notification rows was already permitted, there was
-- just previously no way for a vendor-recipient row to be created. Same
-- story for mark_project_notification_read()/
-- mark_all_project_notifications_read(): both already scope to
-- recipient_profile_id = auth.uid() with no role check, so a vendor could
-- already mark their own rows read the moment any existed. This migration
-- only had to add the INSERT-side RPCs.
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️  MAINTAINER WARNING (same warning as v1a/v1b, repeated because this
--     file adds two more functions where the mistake could be made)
-- ══════════════════════════════════════════════════════════════
-- notify_internal_vendor_project_event() authorizes its CALLER with
-- is_project_vendor(), never is_project_member() — a vendor calling this
-- function is not, and must never become, an internal project member.
-- notify_vendor_project_event() authorizes its CALLER with
-- is_admin_or_manager() and its TARGET with is_project_vendor_member() —
-- never is_project_member(). Do not blend these checks.
-- ══════════════════════════════════════════════════════════════
--
-- Explicitly OUT of scope for v1c:
--   - No email/push — in-app only, same as v1's project notifications.
--   - No vendor activity feed — project_activity still has no vendor
--     SELECT policy and is not touched by this migration.
--   - No broadening of vendor data access anywhere else — these RPCs only
--     ever write to project_notifications, a table whose SELECT policy
--     was already vendor-safe.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Schema widening --------------------------------------------------

alter table public.project_notifications
  add column if not exists related_vendor_task_id uuid references public.project_vendor_tasks(id);

alter table public.project_notifications
  drop constraint if exists project_notifications_notification_type_check;
alter table public.project_notifications
  add constraint project_notifications_notification_type_check
  check ( notification_type in (
    'task_assigned',
    'task_status_changed',
    'comment_added',
    'document_uploaded',
    'member_added',
    'appointment_linked',
    'vendor_task_assigned',
    'shared_comment_added',
    'shared_document_uploaded',
    'vendor_task_status_changed'
  ) );

-- 2. notify_vendor_project_event() ----------------------------------------
-- Admin/manager notifies ONE specific vendor. Used for:
--   - vendor_task_assigned  (a task was assigned to this vendor)
--   - shared_comment_added  (an internal reply landed in this vendor's
--     shared thread)
--   - shared_document_uploaded (a document was shared with this vendor)
-- Deliberately rejects 'vendor_task_status_changed' — that type only
-- ever flows FROM a vendor TO the internal team (see the function below),
-- never the other direction, so allowing it here would blur the two
-- functions' otherwise-clean type partitioning.
create or replace function public.notify_vendor_project_event(
  p_project_id uuid,
  p_vendor_profile_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default null,
  p_related_comment_id uuid default null,
  p_related_document_id uuid default null,
  p_related_vendor_task_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_active boolean;
begin
  if not public.is_admin_or_manager() then
    return;
  end if;

  if p_notification_type not in ('vendor_task_assigned', 'shared_comment_added', 'shared_document_uploaded') then
    return;
  end if;

  -- The target must be an ACTUAL vendor member of THIS project — not just
  -- any vendor profile. Blocks notifying a vendor who was never added to
  -- the project (or was since removed) even if the caller supplies a
  -- syntactically valid profile id.
  if p_vendor_profile_id is null or not public.is_project_vendor_member(p_project_id, p_vendor_profile_id) then
    return;
  end if;

  select is_active into v_vendor_active from public.profiles where id = p_vendor_profile_id;
  if v_vendor_active is not true then
    return; -- deactivated vendor — skip silently, same as every other notification RPC
  end if;

  insert into public.project_notifications (
    project_id, recipient_profile_id, actor_profile_id, notification_type,
    title, body, related_comment_id, related_document_id, related_vendor_task_id
  ) values (
    p_project_id, p_vendor_profile_id, auth.uid(), p_notification_type,
    p_title, p_body, p_related_comment_id, p_related_document_id, p_related_vendor_task_id
  );
end;
$$;

revoke all on function public.notify_vendor_project_event(
  uuid, uuid, text, text, text, uuid, uuid, uuid
) from public;
grant execute on function public.notify_vendor_project_event(
  uuid, uuid, text, text, text, uuid, uuid, uuid
) to authenticated;

-- 3. notify_internal_vendor_project_event() --------------------------------
-- A vendor notifies the internal team on a project they're a member of.
-- Used for:
--   - shared_comment_added       (vendor posted in their shared thread)
--   - shared_document_uploaded   (vendor uploaded a vendor-visible doc)
--   - vendor_task_status_changed (vendor changed their own task's status)
-- Recipients are computed server-side from project_members — IDENTICAL
-- query shape to create_project_notifications_for_members(), so a vendor
-- gets no more control over "who gets notified" than an internal caller
-- already has: none. The caller supplies only project_id, type, title,
-- body, and related ids — never a recipient list.
create or replace function public.notify_internal_vendor_project_event(
  p_project_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default null,
  p_related_comment_id uuid default null,
  p_related_document_id uuid default null,
  p_related_vendor_task_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Caller must actually be a vendor — and specifically a vendor member
  -- of THIS project, not merely a vendor of some other one. Checked
  -- before any recipient is touched.
  if public.current_profile_role() is distinct from 'vendor' then
    return;
  end if;
  if not public.is_project_vendor(p_project_id) then
    return;
  end if;

  if p_notification_type not in ('shared_comment_added', 'shared_document_uploaded', 'vendor_task_status_changed') then
    return;
  end if;

  for r in
    select distinct pm.profile_id
    from public.project_members pm
    join public.profiles p on p.id = pm.profile_id
    where pm.project_id = p_project_id
      and p.role in ('admin', 'manager', 'staff')
      and p.is_active = true
  loop
    insert into public.project_notifications (
      project_id, recipient_profile_id, actor_profile_id, notification_type,
      title, body, related_comment_id, related_document_id, related_vendor_task_id
    ) values (
      p_project_id, r.profile_id, auth.uid(), p_notification_type,
      p_title, p_body, p_related_comment_id, p_related_document_id, p_related_vendor_task_id
    );
  end loop;
end;
$$;

revoke all on function public.notify_internal_vendor_project_event(
  uuid, text, text, text, uuid, uuid, uuid
) from public;
grant execute on function public.notify_internal_vendor_project_event(
  uuid, text, text, text, uuid, uuid, uuid
) to authenticated;
