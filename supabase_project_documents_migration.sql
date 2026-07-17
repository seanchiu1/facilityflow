-- ============================================================
-- FacilityFlow: Project Documents (v1)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - projects / project_members + is_project_member() helper
--     (supabase_projects_lite_migration.sql)
--   - project_activity table (supabase_project_comments_activity_migration.sql)
--   - Private `appointment-documents` storage bucket with the Step-6
--     policies (supabase_private_storage_step6.sql)
--
-- Scope of THIS migration:
--   1. New table: project_documents (file METADATA only — bytes live in
--      Supabase Storage, same split as appointment_documents)
--   2. RLS on project_documents, every policy explicitly `to authenticated`
--   3. Widen the project_activity type CHECK to allow 'document_uploaded'
--   4. Widen project_activity's INSERT policy so staff can log activity
--      on their own projects (needed for document-upload logging — see
--      §4 below for why this supersedes rather than adds a policy)
--
-- Storage: NO changes — and that is a deliberate decision, not an
-- omission. Project files are stored in the existing private
-- `appointment-documents` bucket under a `projects/{project_id}/...`
-- path prefix. The Step-6 storage policies already produce the right
-- behavior for this prefix without modification:
--   - "internal reads all appointment documents" / "internal uploads to
--     any appointment folder" check only bucket + is_internal_role(), so
--     internal roles can read/upload project paths.
--   - The vendor policies join the FIRST path segment against
--     appointment_requests.id — the literal segment 'projects' never
--     matches an appointment UUID, so vendors can neither read nor
--     upload anything under this prefix. Vendor exclusion is structural.
--
-- Honest consequence of reusing those policies (documented, accepted):
-- at the STORAGE layer, any internal role who somehow possesses a
-- project file's exact path could fetch it, even for a project they are
-- not a member of — the Step-6 internal policies are bucket-wide, and
-- Postgres ORs policies, so a stricter projects-only policy would add
-- nothing without rewriting the existing appointment policies (which
-- must stay unchanged). Member-scoping is enforced at the METADATA
-- layer: file paths are only discoverable through project_documents
-- rows, which RLS-scope to members, and paths embed an unguessable
-- project UUID + timestamp. Same trust model as "internal roles read
-- all appointment documents," just stated explicitly for projects.
--
-- This is Project Documents v1 — upload + view only. No update, delete,
-- archive, versioning, per-document comments, or vendor access.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. project_documents ---------------------------------------------------

create table if not exists public.project_documents (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete cascade,
  uploaded_by        uuid references public.profiles(id),
  file_name          text not null,
  file_path          text not null,
  file_type          text,
  file_size          bigint,
  document_category  text default 'General',
  created_at         timestamptz default now()
);

create index if not exists idx_project_documents_project_id
  on public.project_documents(project_id, created_at);

-- 2. RLS ---------------------------------------------------------------

alter table public.project_documents enable row level security;

drop policy if exists "internal roles read accessible project documents" on public.project_documents;
create policy "internal roles read accessible project documents"
  on public.project_documents
  for select
  to authenticated
  using (
    public.is_admin_or_manager()
    or (public.is_internal_role() and public.is_project_member(project_id))
  );

-- INSERT: admin/manager on any project; staff only on member projects.
-- uploaded_by is pinned to auth.uid() so a caller can't attribute an
-- upload to someone else.
drop policy if exists "internal roles upload accessible project documents" on public.project_documents;
create policy "internal roles upload accessible project documents"
  on public.project_documents
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_admin_or_manager()
      or (public.is_internal_role() and public.is_project_member(project_id))
    )
  );

-- No UPDATE/DELETE policy — documents are immutable in v1 (no archive
-- flow either; kept out deliberately to stay "v1 simple").

-- vendor: no policy — RLS default-denies, and the storage layer's vendor
-- policies structurally can't match the projects/ prefix (see header).

-- 3. Allow 'document_uploaded' in the activity feed ------------------------

alter table public.project_activity
  drop constraint if exists project_activity_type_check;
alter table public.project_activity
  add constraint project_activity_type_check
  check ( activity_type in (
    'project_created', 'status_changed', 'member_added',
    'task_created', 'task_status_changed', 'appointment_linked',
    'document_uploaded'
  ) );

-- 4. Widen project_activity INSERT to cover staff document uploads --------
-- The comments/activity migration gave project_activity an admin/manager-
-- only INSERT policy, because at the time the single staff-writable event
-- (task status) already had its own narrow SECURITY DEFINER RPC and a
-- broader policy wasn't needed. Document upload adds a SECOND
-- staff-triggerable event with no RPC of its own — per this feature's own
-- brief ("frontend actions insert activity rows after successful writes"),
-- building a second bespoke RPC just to log an upload would be
-- overbuilding. Instead this supersedes that policy with the same shape
-- project_comments already uses: admin/manager on any project, staff only
-- on projects they're a member of, actor always pinned to auth.uid(). This
-- is a straight DROP + CREATE of the same policy name from the comments/
-- activity migration, not a second overlapping policy.
drop policy if exists "admins and managers log project activity" on public.project_activity;
create policy "internal roles log accessible project activity"
  on public.project_activity
  for insert
  to authenticated
  with check (
    actor_profile_id = auth.uid()
    and (
      public.is_admin_or_manager()
      or (public.is_internal_role() and public.is_project_member(project_id))
    )
  );
