-- ============================================================
-- FacilityFlow: Vendor Project Access (v1a)
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - projects / project_members / project_tasks + is_project_member()
--     (supabase_projects_lite_migration.sql)
--   - project_comments / project_activity
--     (supabase_project_comments_activity_migration.sql)
--   - project_documents (supabase_project_documents_migration.sql)
--   - project_notifications (supabase_project_notifications_migration.sql)
--   - Private `appointment-documents` storage bucket, Step-6 policies
--     (supabase_private_storage_step6.sql)
--   - Helper functions is_admin_or_manager()/is_internal_role()
--     (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration (v1a):
--   1. New table: project_vendor_members — a SEPARATE membership table.
--      Vendors are never added to project_members, and is_project_member()
--      is NOT modified by this migration. See the warning below §2.
--   2. New helpers: is_project_vendor(project_id) — vendor-only analogue
--      of is_project_member(), NOT a superset or substitute for it — and
--      is_project_vendor_member(project_id, vendor_profile_id), which
--      checks an ARBITRARY named vendor rather than the caller (used to
--      validate a share's TARGET, see §5b/§6b).
--   3. Three new RPCs: get_my_vendor_projects(), get_my_vendor_project(),
--      get_vendor_directory() — vendors never get a direct SELECT policy
--      on `projects` (that would expose description/owner/created_by),
--      so all vendor project reads go through the first two.
--   4. project_documents: visibility + vendor_profile_id +
--      uploaded_by_display_name columns, a path/visibility CHECK
--      constraint, two new vendor-scoped RLS policies, AND (§5a) a
--      superseding, role-restricted internal INSERT policy — only
--      admin/manager may create a visibility='vendor' row; a staff
--      project member's INSERT is now DB-rejected if it sets visibility
--      to anything but 'internal' — plus (§5b) a validation trigger
--      rejecting any 'vendor' row whose vendor_profile_id isn't an actual
--      project_vendor_members row on that project, closing the "orphaned
--      share" gap regardless of which policy allowed the write.
--   5. project_comments: same shape and same two fixes (§6a role
--      restriction, §6b membership validation) as project_documents.
--   6. Two new storage.objects policies scoping the new
--      `vendor-projects/{project_id}/{vendor_profile_id}/...` prefix to
--      the vendor who owns that folder. The existing Step-6 internal
--      policies already cover this prefix (bucket-wide, no path check),
--      so internal roles can read/upload here with zero storage changes.
--
-- Hardening note: §5a/§5b/§6a/§6b close two risks identified after the
-- first v1a pass — (1) any staff project member could set
-- visibility='vendor'/'shared' via a direct API call even though the UI
-- never offered that choice to them, and (2) nothing stopped a
-- visibility='vendor'/'shared' row from naming a vendor who was never
-- actually added to project_vendor_members for that project. Both are
-- now enforced at the database, not just the UI.
--
-- Explicitly OUT of scope for v1a (deferred to v1b+, see
-- PHASE2_REQUIREMENTS.md for the honest record):
--   - project_vendor_tasks (no vendor-assignable tasks yet)
--   - Vendor entries in project_activity or project_notifications —
--     vendor actions are invisible to the internal activity feed/bell in
--     v1a; is_internal_role() gates every write path on both tables, and
--     vendors fail that check by construction.
--   - Vendor-to-vendor visibility of any kind (deliberately impossible —
--     see the isolation notes on each policy below)
--   - Staff (non-manager) visibility of the vendor roster — see §2
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️  MAINTAINER WARNING — READ BEFORE TOUCHING ANY PROJECT_* RLS
-- ══════════════════════════════════════════════════════════════
-- is_project_vendor(project_id) and is_project_member(project_id) are NOT
-- interchangeable and must never be OR'd together into the same policy
-- clause as if they were the same kind of check:
--   - is_project_member() means "this caller is an INTERNAL participant
--     (admin/manager/staff) with full read access to the project's
--     internal tables" — tasks, activity, internal comments, internal
--     documents, notifications.
--   - is_project_vendor() means "this caller is a VENDOR invited to this
--     ONE project" and grants nothing beyond what this migration's own
--     narrow, visibility-scoped policies explicitly list.
-- Substituting one for the other in a future policy is exactly how a
-- vendor would end up reading internal project data. If a table needs
-- both internal and vendor access, write two separate policies (as this
-- migration does throughout), never a combined `is_project_member(id) or
-- is_project_vendor(id)` clause.
-- ══════════════════════════════════════════════════════════════
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. project_vendor_members -------------------------------------------------

create table if not exists public.project_vendor_members (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete cascade,
  vendor_profile_id  uuid references public.profiles(id),
  added_by           uuid references public.profiles(id),
  created_at         timestamptz default now()
);

alter table public.project_vendor_members
  drop constraint if exists project_vendor_members_unique;
alter table public.project_vendor_members
  add constraint project_vendor_members_unique unique (project_id, vendor_profile_id);

create index if not exists idx_project_vendor_members_project_id
  on public.project_vendor_members(project_id);
create index if not exists idx_project_vendor_members_vendor_id
  on public.project_vendor_members(vendor_profile_id);

-- Data-integrity guard: vendor_profile_id must actually be a vendor-role
-- profile. Not strictly requested by the spec, but cheap and prevents a
-- foot-gun where an admin fat-fingers an internal profile in here — that
-- profile wouldn't gain any privilege it doesn't already have via
-- is_project_member(), but it WOULD silently break the "vendor" framing
-- (e.g. it would appear as a "vendor" in the internal Vendors card).
create or replace function public.enforce_vendor_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = new.vendor_profile_id;
  if v_role is distinct from 'vendor' then
    raise exception 'project_vendor_members.vendor_profile_id must reference a profile with role = vendor';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_vendor_member_role on public.project_vendor_members;
create trigger trg_enforce_vendor_member_role
  before insert or update of vendor_profile_id on public.project_vendor_members
  for each row execute function public.enforce_vendor_member_role();

-- 2. Vendor-membership helper ------------------------------------------

create or replace function public.is_project_vendor(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_vendor_members
    where project_id = p_project_id and vendor_profile_id = auth.uid()
  );
$$;

revoke all on function public.is_project_vendor(uuid) from public;
grant execute on function public.is_project_vendor(uuid) to authenticated;

-- Arbitrary-vendor analogue of is_project_vendor() above: checks whether a
-- GIVEN vendor_profile_id (not necessarily the caller) is a vendor member
-- of a GIVEN project. Needed because a document/comment share names the
-- TARGET vendor, not the caller — an admin/manager sharing a file with
-- Vendor X is not Vendor X, so is_project_vendor() (which only ever checks
-- auth.uid()) can't answer "is X actually on this project?". Used below
-- (§5b/§6b) to stop an orphaned share — a visibility='vendor'/'shared' row
-- naming a vendor who was never added to project_vendor_members for that
-- project — from ever being written, regardless of who writes it or which
-- policy let the INSERT through.
create or replace function public.is_project_vendor_member(p_project_id uuid, p_vendor_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_vendor_members
    where project_id = p_project_id and vendor_profile_id = p_vendor_profile_id
  );
$$;

revoke all on function public.is_project_vendor_member(uuid, uuid) from public;
grant execute on function public.is_project_vendor_member(uuid, uuid) to authenticated;

-- 3. RLS on project_vendor_members --------------------------------------

alter table public.project_vendor_members enable row level security;

-- Admin/manager: full CRUD (add/remove vendors from a project).
drop policy if exists "admins and managers manage project vendor members" on public.project_vendor_members;
create policy "admins and managers manage project vendor members"
  on public.project_vendor_members
  for all
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- Vendor: read only their own membership row(s) — enough to know which
-- projects they're on, nothing about who else is. No policy lets a
-- vendor see another vendor's row on the same project.
drop policy if exists "vendors read their own project vendor membership" on public.project_vendor_members;
create policy "vendors read their own project vendor membership"
  on public.project_vendor_members
  for select
  to authenticated
  using ( vendor_profile_id = auth.uid() );

-- Deliberately NO staff SELECT policy in v1a. A staff-visible vendor
-- roster would need to resolve each vendor_profile_id to a display name,
-- and staff cannot read vendor `profiles` rows under existing RLS
-- (`supabase_sites_poc_linkage_migration.sql` scopes the internal-read
-- policy to role in admin/manager/staff — vendor rows are excluded on
-- purpose, so staff still can't see vendor company/contact info). Rather
-- than build a second directory RPC just for staff, this is explicitly
-- deferred — the internal Vendors card is admin/manager-only in v1a.

-- 4. Vendor-safe project read RPCs ---------------------------------------
-- Vendors get NO SELECT policy on `projects` at all — a plain policy
-- would expose the whole row (description, owner_profile_id, created_by)
-- since Postgres RLS is row-level, not column-level. These two RPCs are
-- the ONLY way a vendor session can read project data, and they return
-- exactly six columns each.

create or replace function public.get_my_vendor_projects()
returns table (
  id uuid,
  name text,
  status text,
  site_name text,
  start_date date,
  target_completion_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.status, s.name as site_name, p.start_date, p.target_completion_date
  from public.projects p
  join public.project_vendor_members pvm on pvm.project_id = p.id
  left join public.sites s on s.id = p.site_id
  where pvm.vendor_profile_id = auth.uid()
  order by p.created_at desc;
$$;

revoke all on function public.get_my_vendor_projects() from public;
grant execute on function public.get_my_vendor_projects() to authenticated;

create or replace function public.get_my_vendor_project(p_project_id uuid)
returns table (
  id uuid,
  name text,
  status text,
  site_name text,
  start_date date,
  target_completion_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.status, s.name as site_name, p.start_date, p.target_completion_date
  from public.projects p
  left join public.sites s on s.id = p.site_id
  where p.id = p_project_id
    and public.is_project_vendor(p.id);
$$;

revoke all on function public.get_my_vendor_project(uuid) from public;
grant execute on function public.get_my_vendor_project(uuid) to authenticated;

-- Admin/manager directory of active vendors, for the "share with vendor"
-- pickers on the internal ProjectDetail page (add-vendor, share-document,
-- share-comment). Exists because the internal-read `profiles` policy
-- excludes vendor rows entirely (see the staff-roster note in §3) — even
-- admin/manager have no ordinary SELECT that returns vendor profiles
-- (only `is_admin()`-gated "admins read all profiles" does, which is
-- admin-only, not admin/manager). No emails returned — display_name +
-- vendor_name + contact_name + is_active only, matching what's already
-- shown elsewhere (e.g. appointment vendor_name/contact_name columns) so
-- this adds no new sensitive exposure.
create or replace function public.get_vendor_directory()
returns table (
  id uuid,
  display_name text,
  vendor_name text,
  contact_name text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_manager() then
    raise exception 'Not authorized';
  end if;

  return query
    select p.id, p.display_name, p.vendor_name, p.contact_name, p.is_active
    from public.profiles p
    where p.role = 'vendor' and p.is_active = true
    order by p.vendor_name nulls last, p.display_name nulls last;
end;
$$;

revoke all on function public.get_vendor_directory() from public;
grant execute on function public.get_vendor_directory() to authenticated;

-- 5. project_documents: vendor-visible sharing ---------------------------
-- The internal SELECT policy ("internal roles read accessible project
-- documents") is left COMPLETELY UNCHANGED and is correct as-is: every
-- internal project participant (admin/manager on any project, staff on
-- their own projects) should see ALL project_documents rows regardless of
-- visibility — the internal team should see everything, including what's
-- been shared with a vendor.
--
-- The internal INSERT policy ("internal roles upload accessible project
-- documents"), however, IS tightened below (§5a) — the original v1a pass
-- left it untouched, which meant any staff project member could set
-- visibility='vendor' on their own upload via a direct API call, sharing
-- a file with a vendor with no UI path ever having offered them that
-- choice. Only admin/manager may create a vendor-visible document now;
-- staff may only ever create visibility='internal' documents.

alter table public.project_documents
  add column if not exists visibility text not null default 'internal',
  add column if not exists vendor_profile_id uuid references public.profiles(id),
  add column if not exists uploaded_by_display_name text;

alter table public.project_documents
  drop constraint if exists project_documents_visibility_check;
alter table public.project_documents
  add constraint project_documents_visibility_check
  check ( visibility in ('internal', 'vendor') );

-- Ties visibility, vendor_profile_id, and the storage path prefix
-- together so a mislabeled row can never exist: a 'vendor' doc always has
-- a vendor_profile_id AND lives under vendor-projects/..., an 'internal'
-- doc always has neither. This is what makes the storage-policy path
-- match in §7 trustworthy without re-deriving it from application code.
alter table public.project_documents
  drop constraint if exists project_documents_visibility_path_check;
alter table public.project_documents
  add constraint project_documents_visibility_path_check
  check (
    (visibility = 'internal' and vendor_profile_id is null and file_path not like 'vendor-projects/%')
    or
    (visibility = 'vendor' and vendor_profile_id is not null and file_path like 'vendor-projects/%')
  );

-- 5a. Supersede the internal INSERT policy — role-restricted visibility.
-- admin/manager may set visibility to either 'internal' or 'vendor'; a
-- staff project member may ONLY create 'internal' documents (visibility
-- and vendor_profile_id are both pinned by the with-check itself, not
-- just by convention, so a crafted request setting visibility='vendor'
-- as staff is rejected at the database, not just hidden by the UI).
drop policy if exists "internal roles upload accessible project documents" on public.project_documents;
create policy "internal roles upload accessible project documents"
  on public.project_documents
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_admin_or_manager()
      or (
        public.is_internal_role()
        and public.is_project_member(project_id)
        and visibility = 'internal'
        and vendor_profile_id is null
      )
    )
  );

-- 5b. Vendor-membership validation — independent of WHICH policy allowed
-- the INSERT (admin/manager via 5a above, or a vendor via their own
-- policy below). Fires before every insert and rejects a 'vendor'-
-- visibility row whose vendor_profile_id is not an actual
-- project_vendor_members row for that SAME project — closing the
-- "orphaned share" gap: without this, an admin/manager could still write
-- visibility='vendor' + an arbitrary vendor_profile_id that was never
-- added to the project (e.g. a vendor who was removed, or one from a
-- different project entirely), producing a share nobody could read.
-- SECURITY DEFINER so it can call is_project_vendor_member() regardless
-- of the caller's own row-level access to project_vendor_members.
create or replace function public.enforce_document_vendor_share_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'vendor' and not public.is_project_vendor_member(new.project_id, new.vendor_profile_id) then
    raise exception 'project_documents.vendor_profile_id must be a vendor member of this project';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_document_vendor_share_membership on public.project_documents;
create trigger trg_enforce_document_vendor_share_membership
  before insert on public.project_documents
  for each row execute function public.enforce_document_vendor_share_membership();

-- Vendor SELECT: only their own vendor-visible docs, only on a project
-- they're actually a vendor member of (belt-and-suspenders alongside the
-- vendor_profile_id match — a vendor removed from project_vendor_members
-- immediately loses read access even to docs still tagged with their id).
drop policy if exists "vendors read their shared project documents" on public.project_documents;
create policy "vendors read their shared project documents"
  on public.project_documents
  for select
  to authenticated
  using (
    visibility = 'vendor'
    and vendor_profile_id = auth.uid()
    and public.is_project_vendor(project_id)
  );

-- Vendor INSERT: may only create a doc shared with THEMSELVES, on a
-- project they're a vendor member of. uploaded_by pinned to auth.uid()
-- exactly like the internal policy. The visibility/path CHECK constraint
-- above rejects any attempt to slip an 'internal' row or a
-- non-vendor-projects/ path through this policy.
drop policy if exists "vendors upload their shared project documents" on public.project_documents;
create policy "vendors upload their shared project documents"
  on public.project_documents
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and visibility = 'vendor'
    and vendor_profile_id = auth.uid()
    and public.is_project_vendor(project_id)
  );

-- No vendor UPDATE/DELETE — documents remain immutable for every role,
-- matching v1's existing internal behavior.

-- 6. project_comments: shared threads -------------------------------------
-- Same reasoning as §5: the internal SELECT policy is unchanged and
-- already correctly covers every comment on projects the internal user
-- has access to, shared or not. The internal INSERT policy is tightened
-- below (§6a) for the same reason as §5a — see that comment.

alter table public.project_comments
  add column if not exists visibility text not null default 'internal',
  add column if not exists vendor_profile_id uuid references public.profiles(id),
  add column if not exists author_display_name text;

alter table public.project_comments
  drop constraint if exists project_comments_visibility_check;
alter table public.project_comments
  add constraint project_comments_visibility_check
  check ( visibility in ('internal', 'shared') );

-- Pairing constraint (no file-path component here, unlike documents):
-- 'internal' comments never carry a vendor_profile_id; 'shared' comments
-- always do. This is what makes a 'shared' comment unambiguously a
-- one-vendor thread, never a project-wide broadcast.
alter table public.project_comments
  drop constraint if exists project_comments_visibility_vendor_check;
alter table public.project_comments
  add constraint project_comments_visibility_vendor_check
  check (
    (visibility = 'internal' and vendor_profile_id is null)
    or
    (visibility = 'shared' and vendor_profile_id is not null)
  );

-- 6a. Supersede the internal INSERT policy — same role restriction as
-- §5a: admin/manager may post 'internal' or 'shared' (into a vendor's
-- thread); a staff project member may ONLY post 'internal' comments.
-- Without this, a staff member could set visibility='shared' on their own
-- comment via a direct API call and have it land in a vendor's inbox with
-- no UI ever having offered that option.
drop policy if exists "internal roles comment on accessible projects" on public.project_comments;
create policy "internal roles comment on accessible projects"
  on public.project_comments
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and (
      public.is_admin_or_manager()
      or (
        public.is_internal_role()
        and public.is_project_member(project_id)
        and visibility = 'internal'
        and vendor_profile_id is null
      )
    )
  );

-- 6b. Vendor-membership validation — mirrors §5b exactly: rejects a
-- 'shared' comment whose vendor_profile_id isn't an actual
-- project_vendor_members row on this project, regardless of which policy
-- (admin/manager via 6a, or a vendor via their own policy below) allowed
-- the insert through.
create or replace function public.enforce_comment_vendor_share_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'shared' and not public.is_project_vendor_member(new.project_id, new.vendor_profile_id) then
    raise exception 'project_comments.vendor_profile_id must be a vendor member of this project';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_comment_vendor_share_membership on public.project_comments;
create trigger trg_enforce_comment_vendor_share_membership
  before insert on public.project_comments
  for each row execute function public.enforce_comment_vendor_share_membership();

-- Vendor SELECT: only the shared thread between them and the internal
-- team on a project they're a vendor member of. A 'shared' comment tagged
-- to a DIFFERENT vendor on the same project never matches
-- vendor_profile_id = auth.uid(), so Vendor A cannot read Vendor B's
-- thread even though both threads live in the same table.
drop policy if exists "vendors read their shared project comments" on public.project_comments;
create policy "vendors read their shared project comments"
  on public.project_comments
  for select
  to authenticated
  using (
    visibility = 'shared'
    and vendor_profile_id = auth.uid()
    and public.is_project_vendor(project_id)
  );

-- Vendor INSERT: may only post into their OWN shared thread, authored as
-- themselves. Cannot post 'internal' comments, cannot post into another
-- vendor's thread (vendor_profile_id must equal their own id).
drop policy if exists "vendors post their shared project comments" on public.project_comments;
create policy "vendors post their shared project comments"
  on public.project_comments
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and visibility = 'shared'
    and vendor_profile_id = auth.uid()
    and public.is_project_vendor(project_id)
  );

-- No vendor UPDATE/DELETE — comments remain immutable for every role.

-- 7. Storage: vendor-scoped prefix ----------------------------------------
-- Path shape: vendor-projects/{project_id}/{vendor_profile_id}/{ts}-{name}
-- so (storage.foldername(name))[1] = 'vendor-projects',
--    (storage.foldername(name))[2] = project_id (text),
--    (storage.foldername(name))[3] = vendor_profile_id (text).
--
-- The existing Step-6 internal policies ("internal reads all appointment
-- documents" / "internal uploads to any appointment folder") already
-- match bucket_id + is_internal_role() with NO path condition, so they
-- already cover this new prefix for admin/manager/staff — no changes
-- needed there. Only vendor access to this prefix is new.
--
-- Vendors remain structurally unable to read/write under the existing
-- appointment-id-keyed paths or the internal projects/ prefix: neither
-- policy below matches any segment against an appointment id or the
-- literal 'projects' folder, and the vendor's own appointment-document
-- policies (Step 6) only match the appointment-id-first-segment shape,
-- which 'vendor-projects' never satisfies either. Isolation is by
-- construction, not by relying on the caller to send the "right" path.

drop policy if exists "vendor reads own shared project documents" on storage.objects;
create policy "vendor reads own shared project documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'appointment-documents'
    and (storage.foldername(name))[1] = 'vendor-projects'
    and (storage.foldername(name))[3] = auth.uid()::text
    and exists (
      select 1 from public.project_vendor_members pvm
      where pvm.project_id::text = (storage.foldername(name))[2]
        and pvm.vendor_profile_id = auth.uid()
    )
  );

drop policy if exists "vendor uploads own shared project documents" on storage.objects;
create policy "vendor uploads own shared project documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'appointment-documents'
    and (storage.foldername(name))[1] = 'vendor-projects'
    and (storage.foldername(name))[3] = auth.uid()::text
    and exists (
      select 1 from public.project_vendor_members pvm
      where pvm.project_id::text = (storage.foldername(name))[2]
        and pvm.vendor_profile_id = auth.uid()
    )
  );

-- No vendor UPDATE/DELETE storage policy — matches the no-replace/no-
-- delete stance already taken for every other document flow in this app.

-- ── Verification queries (run manually after the migration, not part of
--    it) ──
-- select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   and policyname like 'vendor%shared project documents';
-- Expect exactly 2 rows.
