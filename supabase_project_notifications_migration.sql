-- ============================================================
-- FacilityFlow: Project Notifications (v1, in-app only)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - projects / project_members / project_tasks + is_project_member()
--     (supabase_projects_lite_migration.sql)
--   - project_comments / project_activity
--     (supabase_project_comments_activity_migration.sql)
--   - project_documents (supabase_project_documents_migration.sql)
--   - Helper functions is_admin_or_manager()/is_internal_role()
--     (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration:
--   1. New table: project_notifications
--   2. RLS: every user reads only their own notifications
--      (recipient_profile_id = auth.uid()); no INSERT/UPDATE policy at
--      all — every write goes through a SECURITY DEFINER RPC (see §3/§4)
--   3. create_project_notification() / create_project_notifications_for_members()
--      — the only two ways a notification row can ever be created
--   4. mark_project_notification_read() / mark_all_project_notifications_read()
--      — the only way a user can mark their own notification(s) read
--
-- This is in-app only. No email, no push, no realtime subscription — the
-- bell polls on mount/language-change/dropdown-open, same as the existing
-- appointment reminder/overdue notifications it now sits alongside. See
-- PHASE2_REQUIREMENTS.md §6-G for the full honest scope record.
--
-- Why every insert/update goes through an RPC, not a policy:
-- Comments/activity/documents each have exactly ONE actor writing ONE row
-- about themselves, so a narrow INSERT policy (author_profile_id =
-- auth.uid()) was safe and simple. Notifications are the opposite shape:
-- one actor's action (e.g. posting a comment) must fan out to MANY OTHER
-- users' inboxes. A policy that let a caller insert a row with an
-- arbitrary recipient_profile_id would let any project participant spam
-- notifications into any other user's inbox with fabricated title/body/
-- actor content. A SECURITY DEFINER RPC keeps that fan-out server-side:
-- it re-derives the recipient list itself (project members, minus the
-- caller, minus vendors, minus inactive accounts) rather than trusting
-- whatever the client sends. Same reasoning as
-- update_my_project_task_status() being an RPC instead of a UPDATE
-- policy, just applied to INSERT instead of UPDATE.
--
-- Similarly, is_read is left with no UPDATE policy at all (even a policy
-- scoped to "your own row" would still let you rewrite title/body/
-- actor_profile_id on your own notification — low-impact since only you'd
-- ever see it, but this codebase's established rule is: if Postgres can't
-- scope a policy to one column, use an RPC instead of accepting the wider
-- row-level grant). mark_project_notification_read() only ever touches
-- is_read.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. project_notifications -------------------------------------------------

create table if not exists public.project_notifications (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid references public.projects(id) on delete cascade,
  recipient_profile_id    uuid references public.profiles(id),
  actor_profile_id        uuid references public.profiles(id),
  notification_type       text not null check ( notification_type in (
    'task_assigned',
    'task_status_changed',
    'comment_added',
    'document_uploaded',
    'member_added',
    'appointment_linked'
  ) ),
  title                   text not null,
  body                    text,
  related_task_id         uuid references public.project_tasks(id),
  related_comment_id      uuid references public.project_comments(id),
  related_document_id     uuid references public.project_documents(id),
  related_appointment_id  uuid references public.appointment_requests(id),
  is_read                 boolean not null default false,
  created_at              timestamptz default now()
);

create index if not exists idx_project_notifications_recipient
  on public.project_notifications(recipient_profile_id, is_read, created_at desc);

-- 2. RLS ---------------------------------------------------------------

alter table public.project_notifications enable row level security;

drop policy if exists "users read their own project notifications" on public.project_notifications;
create policy "users read their own project notifications"
  on public.project_notifications
  for select
  to authenticated
  using ( recipient_profile_id = auth.uid() );

-- Deliberately no admin/manager "see everyone's" clause — a manager who
-- isn't the recipient has no standing reason to read another user's
-- notification inbox, unlike projects/tasks/comments/documents where
-- admin/manager oversight of project content is the whole point. If a
-- future need for an admin notification dashboard arises, that's a new,
-- explicit decision, not a default extension of this policy.

-- No INSERT policy — see header. No UPDATE policy — see header. No DELETE
-- policy — notifications are not dismissible/deletable in v1, only
-- markable read (an accepted, documented limitation, matching the
-- "no archive" stance already taken for project_documents).

-- 3. Notification-creation RPCs -----------------------------------------
-- Both require is_internal_role() (vendors rejected outright) and both
-- silently create nothing rather than erroring when authorization fails,
-- since these are always called fire-and-forget after a successful
-- primary action — the primary action's own RLS/RPC already guarantees
-- the caller was authorized to perform it, so these checks are
-- defense-in-depth, not the main gate. They differ in HOW MUCH access is
-- required, because the two functions cover events with different
-- underlying write permissions:
--   - create_project_notifications_for_members(): admin/manager OR plain
--     project membership — matches comment_added/document_uploaded/
--     task_status_changed/appointment_linked, all of which a staff member
--     can genuinely trigger on a project they belong to.
--   - create_project_notification(): admin/manager ONLY, plus a
--     notification_type allowlist — matches task_assigned/member_added,
--     both of which only admin/manager can genuinely trigger (task/member
--     writes are admin/manager-only policies). See its own comment below
--     for the full reasoning.

-- Single recipient — used for task_assigned (the assignee) and
-- member_added (the newly added member). Unlike the fan-out function
-- below, plain project membership is NOT sufficient authorization here:
-- task assignment/reassignment only happens through the admin/manager-only
-- "admins and managers manage project tasks" policy, and adding a member
-- only happens through the admin/manager-only "admins and managers manage
-- project members" policy (supabase_projects_lite_migration.sql). A staff
-- project member has no matching write permission for either action, so
-- letting them fire these two notification types would let them forge a
-- notification about an action they cannot actually perform. This function
-- therefore requires is_admin_or_manager() unconditionally, and rejects
-- (no-ops) any notification_type other than the two it's meant for —
-- comment_added/document_uploaded/task_status_changed/appointment_linked
-- must go through create_project_notifications_for_members() instead,
-- which correctly allows plain members (those events DO have a matching
-- staff-reachable write permission).
--
-- Silently no-ops (does not raise) on any authorization failure or if the
-- recipient is the caller themselves, is a vendor, is inactive, or does
-- not exist — callers never need to pre-filter, and this stays consistent
-- with the fan-out function's fail-silent behavior for the same reasons
-- (defense-in-depth on a fire-and-forget call, not the primary gate).
create or replace function public.create_project_notification(
  p_project_id uuid,
  p_recipient_profile_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default null,
  p_related_task_id uuid default null,
  p_related_comment_id uuid default null,
  p_related_document_id uuid default null,
  p_related_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_role   text;
  v_recipient_active boolean;
begin
  if not public.is_internal_role() then
    return;
  end if;
  if p_notification_type not in ('task_assigned', 'member_added') then
    return;
  end if;
  if not public.is_admin_or_manager() then
    return;
  end if;

  if p_recipient_profile_id is null or p_recipient_profile_id = auth.uid() then
    return; -- never notify the actor themselves
  end if;

  select role, is_active into v_recipient_role, v_recipient_active
  from public.profiles
  where id = p_recipient_profile_id;

  if v_recipient_role is null or v_recipient_role = 'vendor' or v_recipient_active is not true then
    return; -- unknown / vendor / inactive recipient — skip silently
  end if;

  insert into public.project_notifications (
    project_id, recipient_profile_id, actor_profile_id, notification_type,
    title, body, related_task_id, related_comment_id, related_document_id,
    related_appointment_id
  ) values (
    p_project_id, p_recipient_profile_id, auth.uid(), p_notification_type,
    p_title, p_body, p_related_task_id, p_related_comment_id, p_related_document_id,
    p_related_appointment_id
  );
end;
$$;

revoke all on function public.create_project_notification(
  uuid, uuid, text, text, text, uuid, uuid, uuid, uuid
) from public;
grant execute on function public.create_project_notification(
  uuid, uuid, text, text, text, uuid, uuid, uuid, uuid
) to authenticated;

-- Fan-out — used for comment_added, document_uploaded, appointment_linked,
-- and task_status_changed. Recipients are every OTHER active, non-vendor
-- project member (admin/manager/staff roles only, via project_members) —
-- deliberately not "every admin/manager system-wide", to avoid exactly the
-- noisy cross-project spam the brief calls out. task_status_changed uses
-- this same member-scoped fan-out rather than a separate broader list
-- (owner is already a member via sync_project_owner_membership(), so a
-- dedicated "always notify the owner" path would just double-insert).
create or replace function public.create_project_notifications_for_members(
  p_project_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default null,
  p_related_task_id uuid default null,
  p_related_comment_id uuid default null,
  p_related_document_id uuid default null,
  p_related_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.is_internal_role() then
    return;
  end if;
  if not (public.is_admin_or_manager() or public.is_project_member(p_project_id)) then
    return;
  end if;

  for r in
    select distinct pm.profile_id
    from public.project_members pm
    join public.profiles p on p.id = pm.profile_id
    where pm.project_id = p_project_id
      and p.role in ('admin', 'manager', 'staff')
      and p.is_active = true
      and pm.profile_id is distinct from auth.uid()
  loop
    insert into public.project_notifications (
      project_id, recipient_profile_id, actor_profile_id, notification_type,
      title, body, related_task_id, related_comment_id, related_document_id,
      related_appointment_id
    ) values (
      p_project_id, r.profile_id, auth.uid(), p_notification_type,
      p_title, p_body, p_related_task_id, p_related_comment_id, p_related_document_id,
      p_related_appointment_id
    );
  end loop;
end;
$$;

revoke all on function public.create_project_notifications_for_members(
  uuid, text, text, text, uuid, uuid, uuid, uuid
) from public;
grant execute on function public.create_project_notifications_for_members(
  uuid, text, text, text, uuid, uuid, uuid, uuid
) to authenticated;

-- 4. Mark-read RPCs --------------------------------------------------------

create or replace function public.mark_project_notification_read(p_notification_id uuid)
returns public.project_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_notifications;
begin
  update public.project_notifications
    set is_read = true
    where id = p_notification_id
      and recipient_profile_id = auth.uid()
    returning * into v_row;

  if not found then
    raise exception 'Notification not found or not yours';
  end if;

  return v_row;
end;
$$;

revoke all on function public.mark_project_notification_read(uuid) from public;
grant execute on function public.mark_project_notification_read(uuid) to authenticated;

create or replace function public.mark_all_project_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.project_notifications
    set is_read = true
    where recipient_profile_id = auth.uid()
      and is_read = false;
$$;

revoke all on function public.mark_all_project_notifications_read() from public;
grant execute on function public.mark_all_project_notifications_read() to authenticated;
