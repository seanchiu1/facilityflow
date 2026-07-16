-- ============================================================
-- FacilityFlow: Private Storage — Step 6 (final security step)
-- Run in: Supabase Dashboard → SQL Editor
-- Source of truth: RLS_PRIVATE_STORAGE_PLAN.md §7
--
-- Prerequisites (already done):
--   - supabase_rls_prep_migration.sql run (helper functions +
--     slot_booking_counts view)
--   - supabase_rls_step1_profiles.sql run and tested
--   - supabase_rls_step2_appointment_requests.sql run and tested
--   - supabase_rls_step3_messages_documents.sql run and tested
--   - supabase_rls_step4_status_updates.sql run and tested
--   - supabase_rls_step5_staff_schedules.sql run and tested
--   - All six application tables now have RLS enabled
--
-- Scope of THIS migration:
--   1. Drop old permissive storage.objects policies (both the
--      current names and any older demo-era names, in case an
--      environment still has the originals)
--   2. Switch the appointment-documents bucket to private
--   3. Add scoped SELECT policies: internal roles read everything;
--      vendors read only objects whose first path segment
--      (the appointment_id folder) belongs to an appointment they
--      own — checked by joining to appointment_requests
--   4. Add scoped INSERT policies with the same ownership shape
--   5. No UPDATE or DELETE storage policy — no replace/delete-file
--      UI exists today
--
-- File path shape (set in BookingForm.jsx, unchanged by this step):
--   {appointment_id}/{timestamp}-{filename}
-- The first path segment is the appointment's UUID, not auth.uid(),
-- so storage.foldername(name)[1] is compared against
-- appointment_requests.id::text rather than the usual
-- "folder name = auth.uid()" pattern.
--
-- CRITICAL: Postgres RLS policies are OR'd together. If the old
-- permissive policies are not dropped, the new restrictive policies
-- are meaningless — the old ones alone still grant full public
-- access. Step 1 below must run before or in the same transaction
-- as the bucket going private.
--
-- Idempotent: safe to re-run. Each policy is dropped and recreated
-- by name; the bucket-privacy UPDATE is a no-op if already private.
-- ============================================================

-- 1. Drop old permissive policies -------------------------------------------

drop policy if exists "allow uploads to appointment documents" on storage.objects;
drop policy if exists "allow reads from appointment documents" on storage.objects;
drop policy if exists "demo: public read"                      on storage.objects;
drop policy if exists "demo: public upload"                    on storage.objects;

-- Also drop this migration's own policy names, in case of re-run.
drop policy if exists "internal reads all appointment documents" on storage.objects;
drop policy if exists "vendor reads own appointment documents"   on storage.objects;
drop policy if exists "internal uploads to any appointment folder" on storage.objects;
drop policy if exists "vendor uploads to own appointment folder"   on storage.objects;

-- 2. Switch the bucket to private --------------------------------------------

update storage.buckets set public = false where id = 'appointment-documents';

-- 3. Scoped SELECT policies ---------------------------------------------------

create policy "internal reads all appointment documents"
  on storage.objects for select
  using (
    bucket_id = 'appointment-documents'
    and public.is_internal_role()
  );

create policy "vendor reads own appointment documents"
  on storage.objects for select
  using (
    bucket_id = 'appointment-documents'
    and exists (
      select 1 from public.appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );

-- 4. Scoped INSERT policies ---------------------------------------------------

create policy "internal uploads to any appointment folder"
  on storage.objects for insert
  with check (
    bucket_id = 'appointment-documents'
    and public.is_internal_role()
  );

create policy "vendor uploads to own appointment folder"
  on storage.objects for insert
  with check (
    bucket_id = 'appointment-documents'
    and exists (
      select 1 from public.appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE storage policy — no replace/delete-file UI exists.

-- ── Verification query (run manually after the migration, not part of it) ──
-- select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
-- Expect exactly 4 rows, all four names from steps 3–4 above.
