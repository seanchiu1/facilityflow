-- ============================================================
-- FacilityFlow: Structured Sites + Assigned POC profile linkage
-- Run in: Supabase Dashboard → SQL Editor
--
-- Prerequisites (already done):
--   - profiles has role/email/display_name/is_active (M-3–M-8)
--   - appointment_requests has responsible_staff (free text, D-2)
--   - RLS helper functions is_admin_or_manager()/is_internal_role()
--     (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration:
--   1. New `sites` table — the first structured replacement for what has
--      been free text everywhere (duty_rosters.site, and nothing at all
--      on appointment_requests until now).
--   2. Two new nullable columns on appointment_requests: `site_id` and
--      `assigned_poc_profile_id`. Nullable and additive — every existing
--      row keeps working unchanged, `responsible_staff` is NOT dropped or
--      backfilled, and nothing here requires existing rows to be migrated.
--      Old data displays exactly as before until someone re-assigns it
--      through the new dropdowns.
--   3. Indexes on the two new FK columns plus sites(is_active).
--   4. RLS:
--// - sites: any authenticated user (including vendor) can read ACTIVE
--        sites — site names are non-sensitive labels (e.g. "Building A"),
--        not appointment content, so this is safe and lets a vendor's own
--        Appointment Detail resolve site_id → name without needing any
--        broader grant. Only admin/manager can see inactive sites (for
--        the management page) or write to the table at all. No DELETE
--        policy — deactivate via `is_active`, matching "avoid deleting if
--        risky" from the design brief; there's no app code path to delete
--        a site either.
--      - profiles: a NEW additive SELECT policy lets any internal role
--        (admin/manager/staff) read OTHER internal profiles' rows
--        (role in admin/manager/staff only — never vendor). This is the
--        one genuinely new grant in this migration, and it exists for a
--        specific reason: the Assigned POC dropdown needs to list active
--        internal profiles, and any internal viewer (not just admin) needs
--        to be able to resolve an already-assigned POC's display name.
--        Vendor profiles are excluded, so this does not expose vendor
--        company/contact info to other vendors or to internal roles
--        beyond what they could already see. Vendor's own read access is
--        completely unchanged — still self-row-only.
--      - appointment_requests: NO CHANGES. The existing internal-role
--        UPDATE policy is already row-level (not column-level, a
--        documented accepted risk since RLS Step 2), so it already covers
--        the two new columns. Vendor still has no UPDATE policy on this
--        table at all (progress updates go through the D-6
--        `update_appointment_progress` RPC specifically) — so "vendor
--        cannot edit site/POC" is satisfied by an absence of any vendor
--        write path, unchanged from before this migration.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. sites table -----------------------------------------------------------

create table if not exists public.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse the same updated_at trigger function D-5 created for duty_rosters.
drop trigger if exists trg_sites_updated_at on public.sites;
create trigger trg_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- 2. appointment_requests: new columns --------------------------------------

alter table public.appointment_requests
  add column if not exists site_id uuid references public.sites(id),
  add column if not exists assigned_poc_profile_id uuid references public.profiles(id);

-- 3. Indexes -----------------------------------------------------------------

create index if not exists idx_appointment_requests_site_id
  on public.appointment_requests(site_id);

create index if not exists idx_appointment_requests_assigned_poc_profile_id
  on public.appointment_requests(assigned_poc_profile_id);

create index if not exists idx_sites_is_active
  on public.sites(is_active);

-- 4. RLS ----------------------------------------------------------------

alter table public.sites enable row level security;

drop policy if exists "authenticated read active sites" on public.sites;
create policy "authenticated read active sites"
  on public.sites
  for select
  to authenticated
  using ( is_active = true );

drop policy if exists "admins and managers read all sites" on public.sites;
create policy "admins and managers read all sites"
  on public.sites
  for select
  to authenticated
  using ( public.is_admin_or_manager() );

drop policy if exists "admins and managers insert sites" on public.sites;
create policy "admins and managers insert sites"
  on public.sites
  for insert
  to authenticated
  with check ( public.is_admin_or_manager() );

drop policy if exists "admins and managers update sites" on public.sites;
create policy "admins and managers update sites"
  on public.sites
  for update
  to authenticated
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );

-- No delete policy — deactivate via is_active, not row deletion.

drop policy if exists "internal roles read internal profiles" on public.profiles;
create policy "internal roles read internal profiles"
  on public.profiles
  for select
  to authenticated
  using ( public.is_internal_role() and role in ('admin', 'manager', 'staff') );

-- appointment_requests: no RLS changes — see header comment above for why.
