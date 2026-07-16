# FacilityFlow — RLS & Private Storage Implementation Plan

**Status:** ✅ **Implemented.** All six tables have RLS enabled and the storage bucket is private with signed URLs. This document now serves as the design record — see the Implementation Record section below for exactly what shipped and where.
**Scope:** Database-level access control (`0-A`) and private document storage (`0-B`) from [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) Bucket 1.
**Goal:** Make it safe to load real Qualcomm/vendor data by moving enforcement from the app layer (which is bypassable via the browser console) to the database layer.

---

## Implementation record

| Migration file | What it did | Status |
|---|---|---|
| `supabase_rls_prep_migration.sql` | `current_profile_role()`, `is_admin_or_manager()`, `is_internal_role()` helpers + `slot_booking_counts` view | ✅ Run |
| `supabase_rls_step1_profiles.sql` | RLS on `profiles` — self-read only | ✅ Run and tested |
| `supabase_rls_step2_appointment_requests.sql` | RLS on `appointment_requests` — internal full access, vendor scoped to own rows | ✅ Run and tested |
| `supabase_rls_step3_messages_documents.sql` | RLS on `appointment_messages` + `appointment_documents` metadata, ownership via join, `sender_role` spoofing hardening | ✅ Run and tested |
| `supabase_rls_step4_status_updates.sql` | RLS on `status_updates`, `changed_by_role` spoofing hardening, no vendor INSERT | ✅ Run and tested |
| `supabase_rls_step5_staff_schedules.sql` | RLS on `staff_schedules` — any authenticated user reads, admin/manager writes | ✅ Run and tested |
| `supabase_private_storage_step6.sql` | Dropped permissive storage policies, bucket set private, scoped SELECT/INSERT storage policies | ✅ Run and tested |

Code changes that accompanied the rollout: `BookingForm.jsx` (capacity query moved to `slot_booking_counts`, Risk R-2 resolved), `AppointmentDetail.jsx` (signed-URL fetching via `useEffect` + `docUrls` state, replacing `getPublicUrl`).

**What this means in practice:** the system is now meaningfully safer for **pilot-style testing with controlled/synthetic data** — a vendor account genuinely cannot read or write another vendor's appointments, messages, documents, or status history, whether through the UI or directly via the browser console. This is not the same as being **fully production-ready** — see "Accepted risks carried forward" below and `PHASE2_ROADMAP.md` Bucket 1 for what's still open before real, uncontrolled Qualcomm/vendor data should go in.

### Accepted risks carried forward (still open)

- **R-1 — `admin` role not yet in the `profiles.role` check constraint.** The helper functions reference it defensively, but no admin role or admin UI exists yet. Tracked as Bucket 1 item M-5.
- **R-5 — no `is_active`/deactivation.** RLS checks `role`, not account-active status. A revoked user's still-valid JWT continues to pass every policy until it expires. Tracked as Bucket 1 item M-3.
- **R-7 — RLS is row-level, not column-level.** An internal role can update any column on a row it can see, not just `status`. Accepted MVP limitation, not resolved by this rollout.
- **Signed URLs expire after 1 hour.** Fetched fresh on each Appointment Detail page load, not cached — a tab left open longer than that needs a refresh to regenerate working links. Working as designed, not a defect.

---

## 0. Guiding principles

1. **Table-by-table rollout.** Enable RLS and add policies for one table, regression-test it with all four role types, then move to the next. Never enable RLS on a table without policies already staged in the same statement batch — a table with RLS on and zero policies default-denies everything.
2. **Role checks via a helper function, not repeated subqueries.** Every policy below needs to know the caller's `profiles.role`. Rather than repeating `(select role from profiles where id = auth.uid())` in a dozen policies, define one `SECURITY DEFINER` helper once and reuse it. This also sidesteps any edge case around `profiles` policies applying recursively to themselves.
3. **"Admin/Manager" and "Staff/QC/Conductor" are role-set checks, not a 5th DB role.** Per the resolved Phase 2 requirements, Conductor is a display flag, not a distinct `profiles.role` value. Staff, QC reviewers, and Conductors are all `role = 'staff'` in the database. `admin` does not exist as a role value yet — see Risk R-1.
4. **Row-level, not column-level.** Postgres RLS restricts which *rows* a policy allows, not which *columns* within an allowed row. "Staff can update status" in practice becomes "staff can update any column on rows they can see." This matches current app behavior (the app only ever sends `{status: newStatus}` in its UPDATE calls) but is a real limitation — see Risk R-7.

### Helper functions (create once, before any table policy)

```sql
-- Returns the caller's role from profiles, bypassing RLS recursion concerns.
create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- True for admin/manager — full operational visibility.
create or replace function public.is_admin_or_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'manager'), false);
$$;

-- True for admin/manager/staff — all "internal" (non-vendor) roles.
create or replace function public.is_internal_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'manager', 'staff'), false);
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin_or_manager()   to authenticated;
grant execute on function public.is_internal_role()      to authenticated;
```

---

## 1. Table: `profiles`

**Current code usage:** Only `AuthContext.fetchProfile()` reads this table, filtered to the caller's own `id`. No other file queries it. No file ever writes to it — profile rows are created manually via the Supabase Dashboard / SQL Editor (service-role, unaffected by RLS).

| Operation | Who | Policy |
|---|---|---|
| SELECT | Self | `auth.uid() = id` |
| SELECT | Admin/Manager | Not granted yet — no code needs it today. Defer to when the Phase 2 roster/admin pages are built, to keep this pass minimal and least-privilege. |
| INSERT | — | No policy — profile creation stays a Dashboard/service-role operation, matching current process |
| UPDATE | — | No policy — Settings page does not currently persist profile edits |
| DELETE | — | No policy |

```sql
alter table profiles enable row level security;

create policy "self read own profile"
  on profiles for select
  using ( auth.uid() = id );
```

---

## 2. Table: `appointment_requests`

**Current code usage:**
- `AppointmentDetail.jsx`, `Requests.jsx`, `MyBookings.jsx`, `Calendar.jsx`, `WeeklyReport.jsx`, `Dashboard.jsx`, `Topbar.jsx` — all SELECT, mostly unfiltered (relying on RLS to scope for vendor) or already filtered by `vendor_user_id` for the vendor notification query.
- `BookingForm.jsx` — INSERT (vendor submitting a new request, always sets `vendor_user_id: user?.id`), plus a **second, unrelated SELECT** used only to compute slot capacity — see Risk R-2, this one needs a code change.
- `Requests.jsx` and `AppointmentDetail.jsx` — UPDATE, always `{status: newStatus}`, only reachable from manager/staff UI.

| Operation | Who | Policy |
|---|---|---|
| SELECT | Admin/Manager/Staff | All rows |
| SELECT | Vendor | Own rows only: `vendor_user_id = auth.uid()` |
| INSERT | Vendor | `with check (vendor_user_id = auth.uid())` — matches BookingForm's insert exactly |
| INSERT | Admin/Manager | Allowed unconditionally (optional — no current UI does this, included for forward compatibility, safe to omit if you want the tightest possible policy set) |
| UPDATE | Admin/Manager/Staff | All rows (row-level only — see R-7) |
| UPDATE | Vendor | Not granted — no vendor-facing update path exists today |
| DELETE | — | Not granted — no delete UI exists |

```sql
alter table appointment_requests enable row level security;

create policy "internal reads all appointments"
  on appointment_requests for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointments"
  on appointment_requests for select
  using ( vendor_user_id = auth.uid() );

create policy "vendor inserts own appointment"
  on appointment_requests for insert
  with check ( vendor_user_id = auth.uid() );

-- Optional — omit if you'd rather keep INSERT vendor-only for now.
create policy "internal inserts appointment"
  on appointment_requests for insert
  with check ( public.is_admin_or_manager() );

create policy "internal updates any appointment"
  on appointment_requests for update
  using ( public.is_internal_role() );
```

---

## 3. Table: `appointment_messages`

**Current code usage:** `MessageThread.jsx` — SELECT and INSERT, both filtered only by `appointment_id`, reachable by all three roles from the shared `AppointmentDetail` page. No `vendor_user_id` column exists on this table directly — ownership must be checked by joining back to `appointment_requests`.

| Operation | Who | Policy |
|---|---|---|
| SELECT | Admin/Manager/Staff | All rows |
| SELECT | Vendor | Rows where the parent appointment belongs to them |
| INSERT | Admin/Manager/Staff | Any `appointment_id` |
| INSERT | Vendor | Only for an `appointment_id` they own |
| UPDATE / DELETE | — | Not granted — no edit/delete-message UI exists |

```sql
alter table appointment_messages enable row level security;

create policy "internal reads all messages"
  on appointment_messages for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment messages"
  on appointment_messages for select
  using (
    exists (
      select 1 from appointment_requests ar
      where ar.id = appointment_messages.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal inserts any message"
  on appointment_messages for insert
  with check ( public.is_internal_role() );

create policy "vendor inserts message on own appointment"
  on appointment_messages for insert
  with check (
    exists (
      select 1 from appointment_requests ar
      where ar.id = appointment_messages.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );
```

**Recommended hardening (optional, beyond the literal ask):** `sender_role` is client-supplied and not currently checked against the caller's real role — a vendor's browser could send `sender_role: 'manager'` and the UI would render the manager badge on their message. Since we're already writing the INSERT policy, consider adding:
```sql
  and sender_role = public.current_profile_role()
```
to both INSERT policies above. This closes an identity-spoofing gap that predates RLS but is cheap to fix while touching this table.

---

## 4. Table: `appointment_documents`

**Current code usage:** `AppointmentDetail.jsx` — SELECT metadata, filtered by `appointment_id`. `BookingForm.jsx` — INSERT metadata immediately after a successful storage upload, for the vendor's own newly-created appointment. Same ownership-via-join pattern as messages.

| Operation | Who | Policy |
|---|---|---|
| SELECT | Admin/Manager/Staff | All rows |
| SELECT | Vendor | Rows where the parent appointment belongs to them |
| INSERT | Admin/Manager/Staff | Any `appointment_id` (not used by current UI, forward-compatible with the Phase 2 "upload from detail page" feature) |
| INSERT | Vendor | Only for an `appointment_id` they own |
| UPDATE / DELETE | — | Not granted yet — see Risk R-6 (Phase 2 maintenance-report approval will need an UPDATE policy later) |

```sql
alter table appointment_documents enable row level security;

create policy "internal reads all documents"
  on appointment_documents for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment documents"
  on appointment_documents for select
  using (
    exists (
      select 1 from appointment_requests ar
      where ar.id = appointment_documents.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal inserts document metadata"
  on appointment_documents for insert
  with check ( public.is_internal_role() );

create policy "vendor inserts document metadata for own appointment"
  on appointment_documents for insert
  with check (
    exists (
      select 1 from appointment_requests ar
      where ar.id = appointment_documents.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );
```

---

## 5. Table: `status_updates`

**Current code usage:** `statusHistory.js`'s `recordStatusChange()` — INSERT only, called exclusively from manager/staff status-update code paths (`Requests.jsx`, `AppointmentDetail.jsx`). `AppointmentDetail.jsx` also SELECTs this table for the timeline, for **all** roles including vendor (a vendor views the status history of their own appointment).

| Operation | Who | Policy |
|---|---|---|
| SELECT | Admin/Manager/Staff | All rows |
| SELECT | Vendor | Rows where the parent appointment belongs to them |
| INSERT | Admin/Manager/Staff | Any `appointment_id` — matches current code exactly |
| INSERT | Vendor | Not granted — vendor never writes to this table today |
| UPDATE / DELETE | — | Not granted — history should stay immutable by design |

```sql
alter table status_updates enable row level security;

create policy "internal reads all status history"
  on status_updates for select
  using ( public.is_internal_role() );

create policy "vendor reads own appointment status history"
  on status_updates for select
  using (
    exists (
      select 1 from appointment_requests ar
      where ar.id = status_updates.appointment_id
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal inserts status history"
  on status_updates for insert
  with check ( public.is_internal_role() );
```

**Recommended hardening (optional, same rationale as §3):** `changed_by_role` is client-supplied. Consider `and changed_by_role = public.current_profile_role()` on the INSERT policy.

---

## 6. Table: `staff_schedules`

**Current code usage:** `ScheduleManagement.jsx` (manager-only route) — SELECT/INSERT/DELETE. `BookingForm.jsx` (vendor-facing) — SELECT only, to list available slots. This table contains no vendor-identifying or personal data (staff name, equipment type, time, capacity, notes) — safe to expose broadly to any authenticated user.

| Operation | Who | Policy |
|---|---|---|
| SELECT | All authenticated roles | Unrestricted — needed for the vendor booking flow to see available slots |
| INSERT / UPDATE / DELETE | Admin/Manager | Matches the manager-only `/schedule` route |

```sql
alter table staff_schedules enable row level security;

create policy "any authenticated user reads schedule slots"
  on staff_schedules for select
  using ( auth.role() = 'authenticated' );

create policy "admin/manager manages schedule slots"
  on staff_schedules for all
  using ( public.is_admin_or_manager() )
  with check ( public.is_admin_or_manager() );
```

---

## 7. Storage: `appointment-documents` bucket

**Current state:** Public bucket. Two permissive demo policies exist:
```sql
create policy "demo: public read"   on storage.objects for select using ( bucket_id = 'appointment-documents' );
create policy "demo: public upload" on storage.objects for insert with check ( bucket_id = 'appointment-documents' );
```

**Critical:** Postgres RLS policies are OR'd together. If these two demo policies are left in place, any new restrictive policy is meaningless — the permissive ones still grant full public access. **They must be dropped, not just superseded.**

**File path shape:** `{appointment_id}/{timestamp}-{filename}` (set in `BookingForm.jsx`). The first path segment is the appointment's UUID, **not** `auth.uid()` — so the usual "match the folder name to the user's own ID" storage pattern doesn't apply here. Instead, ownership is checked the same way as `appointment_messages`/`appointment_documents`: extract the first path segment with `storage.foldername()` and join to `appointment_requests`.

```sql
-- 1. Drop the permissive demo policies first
drop policy if exists "demo: public read"   on storage.objects;
drop policy if exists "demo: public upload" on storage.objects;

-- 2. Switch the bucket to private
update storage.buckets set public = false where id = 'appointment-documents';

-- 3. Scoped read policy
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
      select 1 from appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );

-- 4. Scoped upload policy
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
      select 1 from appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );
```

No UPDATE/DELETE storage policy is proposed — there is no file-replace or delete-document feature in the current app, so this defaults to deny, which is correct.

**Signed URLs:** `createSignedUrl()` is itself gated by the SELECT policy above — a caller must already be authorized to read the object before Supabase will mint a signed URL for it. This is the correct enforcement point; no separate authorization logic is needed in the app beyond calling `createSignedUrl` instead of `getPublicUrl`.

---

## 8. Code files that must change

| File | Change | Why |
|---|---|---|
| `src/pages/AppointmentDetail.jsx` | Replace the synchronous inline `supabase.storage.from(...).getPublicUrl(doc.file_path)` (lines ~360–362, called during render inside `docs.map()`) with an **async** `createSignedUrl()` call. This cannot stay inline in JSX — it must move to a `useEffect` that fetches signed URLs for all `docs` into a state map (e.g., `docUrls: { [doc.id]: signedUrl }`) once `docs` loads, or fetch on-click. Recommend fetching on load with a short TTL (e.g., 60 min) since documents are viewed shortly after the page loads. | The bucket is no longer public; `getPublicUrl` will return a URL that 403s. |
| `src/components/BookingForm.jsx` | The capacity-check query (`select responsible_staff, start_time from appointment_requests where requested_date = date`, unfiltered by vendor) will be silently narrowed by the new vendor SELECT policy to **only the calling vendor's own rows**, undercounting how full a slot actually is. Needs to query a new view instead of the base table — see Risk R-2 for the proposed fix. | Vendor RLS policy restricts `appointment_requests` SELECT to `vendor_user_id = auth.uid()`; this query currently relies on seeing all vendors' bookings. |
| `SUPABASE_SETUP.md` | Remove §7 "Storage policies (demo)" permissive policies; replace with the policies from this plan. Update §10 "Security notes" to reflect RLS as implemented, not just recommended. | Prevents a future reader from re-creating the permissive demo policies this plan just removed. |

**No changes needed** to `Requests.jsx`, `MyBookings.jsx`, `Calendar.jsx`, `Dashboard.jsx`, `WeeklyReport.jsx`, `Topbar.jsx`, `MessageThread.jsx`, `ScheduleManagement.jsx`, `statusHistory.js`, or `supabaseClient.js` — all of these already query with either no filter (correctly narrowed by RLS automatically) or an explicit `vendor_user_id`/role filter that already matches the new policies. This was a deliberate design goal of the policy set above: match existing query shapes so RLS narrows results rather than breaking queries outright.

---

## 9. Rollout order and regression tests

Enable one table at a time, in this order (dependency-driven — tables referenced by ownership-check subqueries should be stable before the tables that depend on them):

### Step 1 — `profiles`
- [ ] Manager, Staff, Vendor demo accounts can each still log in and land on their correct default page
- [ ] `AuthContext` correctly populates `user.role`, `user.name`, `user.vendorName` for all three

### Step 2 — `appointment_requests`
- [ ] Manager: Requests page shows all appointments across all vendors; Dashboard stat cards match pre-RLS counts
- [ ] Staff: Requests page shows all appointments; can update status
- [ ] Vendor: My Bookings shows only their own appointments; submitting a new booking via BookingForm succeeds
- [ ] Vendor: attempting to fetch another vendor's appointment by ID (e.g., via browser console `supabase.from('appointment_requests').select().eq('id', otherVendorsId)`) returns zero rows
- [ ] Calendar page renders correctly for all three roles (manager/staff see all events, vendor sees only their own)
- [ ] Weekly Report loads and totals match pre-RLS numbers (manager/staff only — vendor has no route to this page)
- [ ] **Known regression to verify:** BookingForm's slot capacity indicator ("2/3 booked") — check whether it still shows accurate counts for a vendor, or has silently dropped to only their own bookings (see Risk R-2)

### Step 3 — `appointment_messages` + `appointment_documents`
- [ ] Manager/Staff: can view and send messages on any appointment
- [ ] Vendor: can view and send messages only on their own appointment; opening another vendor's appointment detail page shows the existing "Unauthorized" screen (app-level gate) *and* would return zero message rows even if that gate were bypassed
- [ ] Vendor: uploaded document during booking submission appears in Appointment Detail
- [ ] Manager/Staff: document uploaded by a vendor is visible to them

### Step 4 — `status_updates`
- [ ] Manager/Staff: status changes via Requests page and Appointment Detail both persist and appear in the timeline
- [ ] Vendor: status timeline is visible (read-only) on their own appointment detail page
- [ ] Vendor: confirm no UI path allows a vendor to trigger a status change (already true at the app level; RLS should also reject it if attempted directly)

### Step 5 — `staff_schedules`
- [ ] Manager: Schedule Management — add shift, delete shift both still work
- [ ] Vendor: BookingForm slot list still loads and shows available times
- [ ] Staff: no regression (staff doesn't currently use this table in the UI, but confirm no console errors)

### Step 6 — Storage (private bucket + signed URLs)
- [ ] Confirm the two `"demo: *"` policies no longer appear in Supabase Dashboard → Storage → Policies
- [ ] Vendor: can upload a document during a new booking submission (private bucket, scoped INSERT policy)
- [ ] Vendor: can open/download a document on their own appointment (signed URL resolves, file downloads)
- [ ] Manager/Staff: can open/download a document on any appointment
- [ ] Vendor: a raw public storage URL for another vendor's document (previously public, copy one from before the bucket was switched) now returns 403/404
- [ ] Signed URL expires after its TTL and a stale link returns 403 on a second attempt after expiry

### Full regression sweep (after all steps)
- [ ] All 3 demo accounts × all pages they have access to, no console errors, no blank/empty-looking pages that should have data
- [ ] `npm run build` succeeds

---

## 10. Risks and missing pieces

| ID | Risk | Impact | Recommendation |
|---|---|---|---|
| **R-1** | `profiles.role` check constraint only allows `'manager'`, `'staff'`, `'vendor'` — `'admin'` is not yet a valid value, even though the policies above reference it | Low — policies referencing a role value that never appears simply never match; nothing breaks | Widen the constraint now while touching this area, or defer to the Phase 2 role-model migration. Either is safe; recommend doing it now since it's a one-line, zero-risk change: `alter table profiles drop constraint profiles_role_check, add constraint profiles_role_check check (role in ('admin','manager','staff','vendor'));` |
| **R-2** | **BookingForm's slot-capacity query will under-report bookings for vendors.** It currently does an unfiltered `select responsible_staff, start_time from appointment_requests where requested_date = date`, relying on seeing every vendor's bookings to compute "2/3 booked." Under the new vendor SELECT policy (`vendor_user_id = auth.uid()`), a vendor will only see their *own* prior bookings, so the capacity indicator will show slots as more available than they really are. | **High — this is a functional regression, not a security bug, and directly violates "do not break existing demo flows."** | Create a `SECURITY DEFINER` view/function that returns only the aggregate count needed (no vendor identity), bypassing RLS on the base table safely because it exposes nothing sensitive:<br>`create view public.slot_booking_counts with (security_invoker = false) as select responsible_staff, requested_date, start_time, count(*) as booked_count from appointment_requests where status <> 'Cancelled' group by 1,2,3;`<br>Then update `BookingForm.jsx` to query this view instead of the base table. Grant `select` on the view to `authenticated`. |
| **R-3** | Legacy rows with `vendor_user_id IS NULL` (pre-dating the column) rely on a name-match fallback that currently exists only in `MyBookings.jsx` app code, not in any RLS policy. Under strict `vendor_user_id = auth.uid()` RLS, a vendor would lose visibility into any such legacy row. | Medium — only matters if such rows exist in the demo/pilot database | Run `select count(*) from appointment_requests where vendor_user_id is null;` before rollout. If zero, no action needed. If nonzero, prefer a **one-time backfill** (`update appointment_requests set vendor_user_id = p.id from profiles p where appointment_requests.vendor_user_id is null and appointment_requests.vendor_name = p.vendor_name and appointment_requests.contact_name = p.contact_name;`) over embedding the name-match logic permanently into RLS — cleaner long-term, and matches how every new row is already created. |
| **R-4** | `sender_role` (`appointment_messages`) and `changed_by_role` (`status_updates`) are client-supplied strings, not derived from the authenticated session. A vendor's browser could currently send `sender_role: 'manager'`. | Medium — a display-layer spoofing issue (badge/attribution), not a data-access breach | Add `and sender_role = public.current_profile_role()` / `and changed_by_role = public.current_profile_role()` to the respective INSERT policies (included as commented-out recommendations in §3/§5 above). |
| **R-5** | No `is_active` column exists yet. RLS as scoped here checks `role`, not account-active status — a deactivated user (once that feature ships) with a still-valid JWT would still pass every policy above until the JWT expires or is revoked. | Low for this task, but worth knowing | Out of scope for this RLS pass — tracked separately in Phase 2 Bucket 1 (`M-3`). RLS and deactivation are complementary, not redundant; both are needed for real pilot use. |
| **R-6** | `appointment_documents` has no UPDATE policy. The Phase 2 maintenance-report approval workflow (§3-A of PHASE2_REQUIREMENTS.md) will need one, once the `approval_status`/`reviewed_by`/`reviewed_at` columns exist. | None today | Not a blocker for this pass — flagged so the future migration remembers to add an UPDATE policy alongside the new columns, scoped to `is_internal_role()`. |
| **R-7** | RLS is row-level, not column-level. An internal (`staff`) user can UPDATE **any** column on any `appointment_requests` row they can see — including `vendor_user_id`, which could let a compromised staff account reassign an appointment to a different vendor. Current app code never does this (only ever sends `{status}`), but RLS alone doesn't prevent a direct API call from doing more. | Low likelihood, moderate impact if it happened | Accepted risk for MVP — true column-level enforcement requires a trigger (e.g., `before update` that rejects changes to protected columns unless caller is `admin`) or Postgres column privileges, which adds real complexity for a scenario the current UI never triggers. Revisit if a security review flags it as a hard requirement before real pilot data. |
| **R-8** | Old permissive storage policies must be explicitly dropped, not just left alongside new ones — Postgres OR's permissive RLS policies together, so leaving `"demo: public read"` in place makes every new restrictive storage policy meaningless. | **High if missed** — silently defeats the entire private-storage effort | §7's SQL explicitly drops both demo policies as step 1, before switching the bucket to private. Verify in Supabase Dashboard → Storage → Policies that only the four new policies remain. |
| **R-9** | Performance of ownership-check subqueries (`exists (select 1 from appointment_requests where id = ... and vendor_user_id = auth.uid())`) on `appointment_messages`/`appointment_documents`/`status_updates` depends on an index on `appointment_requests(vendor_user_id)` and on each child table's `appointment_id`. | Low — already covered | Confirmed already present: `idx_appointment_requests_vendor_user_id`, `idx_appointment_messages_appt`, `idx_appointment_documents_appt`, `idx_status_updates_appt` all exist per `SUPABASE_SETUP.md` §8. No new indexes needed. |
| **R-10** | The `service_role` key (used only in Supabase Dashboard/SQL Editor and any future Edge Functions) bypasses RLS entirely by design. | None — expected behavior | No action needed; confirmed the current app's client (`supabaseClient.js`) uses only the anon key, never the service-role key, so this doesn't create a client-side bypass. |

---

## 11. What is intentionally *not* in this plan

- **`is_active` / account deactivation** — separate Phase 2 item (`M-3`), complementary to but distinct from RLS.
- **Admin role fully wired into the app** (`ROLE_ALLOWED_PREFIXES`, UI) — only the `profiles.role` constraint widening (R-1) is proposed here, since that's the only piece RLS itself touches.
- **Duty roster, maintenance report approval, or any other Phase 2 table** — not part of the current schema; their RLS policies will be written alongside their own migrations when those features are built.
- **Column-level security** (R-7) — flagged as an accepted MVP risk, not proposed here.

---

## Next step — this plan is complete

All steps below were executed, in order, and are recorded in the Implementation Record at the top of this document:

1. ~~Run the R-3 pre-flight check~~ — done; 0 NULL `vendor_user_id` rows found, no backfill needed.
2. ~~Execute §0 (helper functions) and §1–§6 table-by-table~~ — done, each step regression-tested per §9 before proceeding to the next.
3. ~~Fix `BookingForm.jsx`'s capacity query (R-2) and `AppointmentDetail.jsx`'s signed-URL fetch~~ — done, shipped alongside the storage cutover in Step 6.
4. ~~Update `SUPABASE_SETUP.md` to match reality~~ — done.

**What comes next is not more RLS work — it's the next Phase 2 feature.** See [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) Bucket 2: the recommended next build is **D-1, the maintenance report upload + QC approval gate** (`PHASE2_REQUIREMENTS.md` §3-A). It's a natural next step from this work — it reuses the exact `appointment_documents` table and ownership-check pattern this plan already secured, and will need its own small RLS addition (an UPDATE policy scoped to internal roles, for the future `approval_status`/`reviewed_by` columns — flagged as Risk R-6 above, not yet built).

Remaining Bucket 1 items (M-3 deactivation, M-4 forgot-password, M-5 admin role, M-6 Conductor flag, M-7 documented vendor invite) are still recommended before *real, uncontrolled* pilot data goes in, but they no longer block feature work — the core data-isolation guarantee this plan exists to provide is now in place.
