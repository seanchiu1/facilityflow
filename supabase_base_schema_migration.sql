-- ============================================================
-- FacilityFlow: Base schema (profiles + appointment workflow core)
-- Run in: Supabase Dashboard → SQL Editor
-- Run this FIRST — before any other supabase_*.sql file in this repo.
--
-- Why this file exists (read this before assuming it's redundant):
-- FacilityFlow's six original tables — profiles, appointment_requests,
-- appointment_messages, appointment_documents, status_updates,
-- staff_schedules — were created by hand in the Supabase Dashboard Table
-- Editor during Phase 1, before this repo's "one file per migration"
-- convention existed. No committed SQL file has ever created them. Every
-- other migration in this repo (supabase_rls_step1_profiles.sql onward)
-- assumes these six tables already exist and only ALTERs them.
--
-- That means: on a genuinely fresh Supabase project, running the existing
-- migrations in order — with this file skipped — fails immediately.
-- `supabase_rls_step1_profiles.sql`'s very first statement,
-- `alter table public.profiles enable row level security`, raises
-- `relation "public.profiles" does not exist`.
--
-- This file closes that gap. It was reverse-engineered from the LIVE
-- production/demo project (kwelwlnsxmgazhfzpeqo) via read-only
-- information_schema/pg_constraint/pg_indexes queries — not guessed from
-- docs — so column types, defaults, and constraints below are exact
-- matches for what's running today, not an approximation.
--
-- Scope: ONLY the columns that existed before any feature migration
-- touched these tables. Every column added later by a specific migration
-- (site_id, project_id, progress_percent, appointment_code, is_active,
-- email, document_type, etc.) is deliberately NOT included here — each of
-- those migrations adds its own column with `add column if not exists`
-- and will do so correctly once this file has created the base table.
-- Adding them here too would just be dead, duplicate logic to keep in
-- sync — the single source of truth for each column stays the migration
-- that introduced it.
--
-- RLS is deliberately NOT enabled by this file. That happens in
-- `supabase_rls_step1_profiles.sql` through `supabase_rls_step5_staff_schedules.sql`,
-- exactly as it always has — this file only creates structure.
--
-- Idempotent: every statement uses `if not exists`, safe to re-run.
-- ============================================================

-- 1. profiles ---------------------------------------------------------
-- id is NOT a generated uuid — it's the same id as the matching
-- auth.users row (one-to-one), inserted manually per SUPABASE_SETUP.md §0
-- after creating each user in Authentication → Users.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check ( role in ('admin', 'manager', 'staff', 'vendor') ),
  display_name text not null,
  vendor_name  text,
  contact_name text,
  created_at   timestamptz default now()
);

-- 2. appointment_requests -------------------------------------------------

create table if not exists public.appointment_requests (
  id                 uuid primary key default gen_random_uuid(),
  vendor_name        text not null,
  contact_name       text,
  vendor_user_id     uuid references auth.users(id),
  equipment_type     text not null,
  requested_date     date not null,
  start_time         time not null,
  end_time           time not null,
  responsible_staff  text,
  priority           text default 'Medium',
  status             text default 'Pending',
  description        text,
  created_at         timestamptz default now()
);

create index if not exists idx_appointment_requests_vendor_user_id
  on public.appointment_requests(vendor_user_id);

-- 3. appointment_messages ------------------------------------------------

create table if not exists public.appointment_messages (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointment_requests(id) on delete cascade,
  sender_name    text not null,
  sender_role    text not null,
  message        text not null,
  created_at     timestamptz default now()
);

create index if not exists idx_appointment_messages_appointment_id
  on public.appointment_messages(appointment_id, created_at);

-- 4. appointment_documents ------------------------------------------------
-- uploaded_by is free TEXT (a display name), not a profiles FK — matches
-- how BookingForm.jsx/AppointmentDetail.jsx have always written it. This
-- is a different, later-added pattern than project_documents.uploaded_by
-- (a real uuid FK), which is a v1 Project Documents feature, not this
-- table's original design.

create table if not exists public.appointment_documents (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointment_requests(id) on delete cascade,
  file_name      text not null,
  file_path      text not null,
  file_type      text,
  file_size      integer,
  uploaded_by    text,
  created_at     timestamptz default now()
);

-- 5. status_updates ---------------------------------------------------

create table if not exists public.status_updates (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointment_requests(id) on delete cascade,
  old_status     text,
  new_status     text not null,
  changed_by     text,
  changed_by_role text,
  note           text,
  created_at     timestamptz default now()
);

create index if not exists idx_status_updates_appt
  on public.status_updates(appointment_id, created_at);

-- 6. staff_schedules ----------------------------------------------------

create table if not exists public.staff_schedules (
  id             uuid primary key default gen_random_uuid(),
  staff_name     text not null,
  equipment_type text not null,
  schedule_date  date not null,
  start_time     time not null,
  end_time       time not null,
  capacity       integer default 3,
  notes          text,
  created_at     timestamptz default now()
);

-- ── Verification (run manually after this file, not part of it) ──
-- select table_name from information_schema.tables
--   where table_schema = 'public'
--   and table_name in ('profiles','appointment_requests','appointment_messages',
--                       'appointment_documents','status_updates','staff_schedules');
-- Expect exactly 6 rows.
