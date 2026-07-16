-- ============================================================
-- FacilityFlow: D-5 — Duty Roster monthly grid
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: PHASE2_REQUIREMENTS.md §2-A, PHASE2_ROADMAP.md Bucket 2 (D-5)
--
-- Prerequisites (already done):
--   - RLS enabled on all six original tables (see RLS_PRIVATE_STORAGE_PLAN.md)
--   - Helper functions current_profile_role(), is_admin_or_manager(),
--     is_internal_role() exist (supabase_rls_prep_migration.sql)
--
-- Scope of THIS migration:
--   1. Create duty_rosters table — one row per (roster_date, site)
--   2. Unique constraint on (roster_date, site) — one duty person per
--      site per day, enforced at the database layer
--   3. Simple updated_at trigger (no existing helper pattern in this
--      project to reuse, so a minimal one is added here)
--   4. Enable RLS: admin/manager full access, staff read-only, vendor
--      no access at all (no policy grants vendor anything on this table)
--
-- Explicitly NOT done here (per D-5 scope):
--   - duty_staff_name is free text, not linked to profiles.id
--   - No Excel/.xlsx import (§2-B) or PDF export beyond window.print() (§2-C)
--   - No email notifications tied to roster changes
--   - No formal `sites` lookup table — site stays free text, consistent
--     with the original PHASE2_REQUIREMENTS.md §2-A decision
--
-- Idempotent: safe to re-run. Table/constraint/trigger/policies use
-- IF NOT EXISTS or are dropped and recreated by name.
-- ============================================================

-- 1. Table -------------------------------------------------------------

create table if not exists public.duty_rosters (
  id                uuid primary key default gen_random_uuid(),
  roster_date       date not null,
  site              text not null,
  duty_staff_name   text not null,
  duty_staff_phone  text,
  duty_staff_email  text,
  notes             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2. One duty assignment per site per day --------------------------------

alter table public.duty_rosters
  drop constraint if exists duty_rosters_date_site_unique;

alter table public.duty_rosters
  add constraint duty_rosters_date_site_unique unique (roster_date, site);

create index if not exists idx_duty_rosters_date
  on public.duty_rosters(roster_date);

-- 3. updated_at trigger ---------------------------------------------------
-- No existing helper pattern elsewhere in this project, so a minimal
-- reusable trigger function is added here.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_duty_rosters_updated_at on public.duty_rosters;

create trigger trg_duty_rosters_updated_at
  before update on public.duty_rosters
  for each row execute function public.set_updated_at();

-- 4. RLS -------------------------------------------------------------------
-- admin/manager: full access. staff: read-only. vendor: no policy at all,
-- so RLS default-denies every operation for that role.

alter table public.duty_rosters enable row level security;

drop policy if exists "internal roles read duty rosters"    on public.duty_rosters;
drop policy if exists "admin/manager manage duty rosters"   on public.duty_rosters;

create policy "internal roles read duty rosters"
  on public.duty_rosters for select
  using ( public.is_internal_role() );

create policy "admin/manager manage duty rosters"
  on public.duty_rosters for all
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );
