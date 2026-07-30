# FacilityFlow — Vendor Schedule/Privacy Isolation Audit

**Purpose:** verify, before onboarding a real external vendor pilot, that a vendor account can only ever see its own data — never another vendor's bookings, tasks, comments, documents, or membership row, and never more of the internal staff schedule than the booking flow actually needs.

**Privacy rule — what "isolation" means here:** FacilityFlow lets multiple vendor companies be members of the same project (`project_vendor_members` is many-to-many). Two vendors on the same project legitimately seeing that project's **name/shell** on `/vendor-projects` is correct behavior, not a leak — a project name is not vendor-identifying information. The actual privacy boundary is **vendor-scoped content within a project** (and elsewhere): vendor tasks, vendor comments, vendor documents, vendor membership rows, and bookings must always be scoped to `vendor_profile_id = auth.uid()` / `vendor_user_id = auth.uid()`, regardless of whether the two vendors share a project shell. Every check below (and every corresponding Playwright test in `e2e/vendor.spec.js`) tests that scoped-content boundary directly — none of them assert that project *names* are disjoint between vendors, because that would be testing for behavior FacilityFlow doesn't (and shouldn't) provide.

**Method:** read the live RLS policies, grants, and SECURITY DEFINER function definitions directly from the production database (`kwelwlnsxmgazhfzpeqo`, read-only `supabase db query --linked`), then empirically simulated vendor sessions using `SET ROLE authenticated` + `request.jwt.claim.sub`/`request.jwt.claim.role` (the same GUCs `auth.uid()`/`auth.role()` read from in production, so this reproduces exactly what PostgREST sets from a real vendor JWT) — every simulation ran inside `begin; ... rollback;`, so nothing was ever committed. Two real vendor accounts already existed in production data (`Taiwan Elevator Services` and `Formosa Fire Safety Co.`, both members of the same shared project, "Building A Elevator Modernization") — used directly for cross-vendor tests instead of synthetic data, since a genuine shared-project scenario is the strongest test available.

**Verdict: one real leak found and fixed.** Everything else audited was already correctly isolated.

> **Update — product rule change, no security impact:** `get_available_schedule_slots()` originally filtered by `equipment_type` *and* `schedule_date`. As of `supabase_booking_availability_rule_migration.sql`, staff are no longer treated as equipment specialists, so the function was redefined (same name, same signature) to filter by `schedule_date` only. This is a product-availability change, not a security change — the RPC still returns no vendor identity, is still `authenticated`-only (never `anon`), and a vendor still has zero direct SELECT access to `staff_schedules`, re-verified live after this change (see `BOOKING_AVAILABILITY_DEBUG.md` §9). References to "equipment/date scoping" below describe the RPC's original behavior; treat them as "date scoping" going forward.

---

## Summary table

| Table / surface | Vendor can see | Verdict |
|---|---|---|
| `appointment_requests` | Own rows only (`vendor_user_id = auth.uid()`) | ✅ Pass |
| `staff_schedules` | **Before fix:** entire table, all equipment/dates/staff names/notes. **After fix:** nothing directly — scoped access only via new RPC | 🔴 **Leak found → fixed** |
| `slot_booking_counts` | Aggregate `booked_count` only, keyed by staff+date+time — no vendor identity, no appointment IDs | ✅ Pass |
| `projects` | Nothing (no vendor SELECT policy at all) | ✅ Pass |
| `project_members` (internal roster) | Nothing | ✅ Pass |
| `project_vendor_members` | Own membership row only (`vendor_profile_id = auth.uid()`) — confirmed empirically on a project where a second vendor is also a member | ✅ Pass |
| `project_tasks` (internal tasks) | Nothing | ✅ Pass |
| `project_vendor_tasks` | Own tasks only (`vendor_profile_id = auth.uid() AND is_project_vendor(project_id)`) — confirmed empirically against another vendor's tasks on the same shared project | ✅ Pass |
| `project_comments` | Own shared thread only (`visibility='shared' AND vendor_profile_id = auth.uid()`) — internal comments never visible | ✅ Pass |
| `project_documents` | Own shared documents only (`visibility='vendor' AND vendor_profile_id = auth.uid()`) — internal documents never visible | ✅ Pass |
| `project_activity` | Nothing | ✅ Pass |
| `project_notifications` | Own notifications only (`recipient_profile_id = auth.uid()`) | ✅ Pass |
| `get_vendor_directory()` RPC | Nothing — raises `Not authorized` for any non-admin/manager caller (confirmed live) | ✅ Pass |
| `get_my_vendor_projects()` / `get_my_vendor_project()` RPCs | Own project membership only | ✅ Pass |
| `notify_vendor_project_event()` / `notify_internal_vendor_project_event()` RPCs | Re-validate project-vendor membership server-side before writing any notification — can't be used to message an arbitrary vendor or fabricate a notification for a project the caller isn't on | ✅ Pass |
| `update_my_vendor_project_task_status()` RPC | Re-checks task ownership *and* current project-vendor standing at call time, not just at task-creation time | ✅ Pass |

---

## The one leak: `staff_schedules`

**Policy before this audit:**

```
policyname: "any authenticated user reads schedule slots"
cmd:        SELECT
roles:      {authenticated}
qual:       (auth.role() = 'authenticated'::text)
```

This is true for every logged-in user regardless of role — including vendors. `staff_schedules` has columns `id, staff_name, equipment_type, schedule_date, start_time, end_time, capacity, notes`. `BookingForm.jsx` (the vendor-facing booking screen) only ever *queries* it filtered to one `equipment_type` + one `schedule_date` at a time, and only ever *displays* the staff name/notes for the slot the vendor is actively picking — but that's a client-side filter, not a database-enforced boundary. Nothing stopped a vendor from opening the browser console and running:

```js
await supabase.from('staff_schedules').select('*')
```

...and getting the entire schedule — every equipment type, every date on the calendar, every internal staff member's name, and every free-text scheduling note — regardless of what they were actually booking.

**Empirically confirmed live** (read-only, rolled back) before the fix:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub  = '<vendor profile id>';
set local request.jwt.claim.role = 'authenticated';
select count(*) from staff_schedules;   -- returned 8 (the true total row count in the table)
rollback;
```

**Fix — `supabase_vendor_schedule_privacy_fix_migration.sql`:**
1. Dropped the "any authenticated user reads schedule slots" policy. Admin/manager keep full read access unaffected, via the pre-existing separate `"admin/manager manages schedule slots"` ALL policy.
2. Added `get_available_schedule_slots(p_equipment_type text, p_schedule_date date)` — a `SECURITY DEFINER` RPC returning exactly the columns `BookingForm.jsx` needs (`id, staff_name, start_time, end_time, capacity, notes`), scoped by a `WHERE` clause to only the one equipment/date combination the caller asks for. Granted `EXECUTE` to `authenticated` only (`revoke ... from public, anon` first, matching the existing security-hardening pattern in this repo).
3. Updated `src/components/BookingForm.jsx` to call the RPC instead of querying the table directly. Same response shape, same downstream mapping code — no UI or behavior change for a legitimate vendor using the booking form as intended.

**Empirically confirmed live after the fix:**

```sql
-- Direct table read now returns nothing for a vendor:
begin;
set local role authenticated;
set local request.jwt.claim.sub  = '<vendor profile id>';
set local request.jwt.claim.role = 'authenticated';
select count(*) from staff_schedules;   -- 0
rollback;

-- The new RPC returns exactly the requested slot:
begin;
set local role authenticated;
set local request.jwt.claim.sub  = '<vendor profile id>';
set local request.jwt.claim.role = 'authenticated';
select * from get_available_schedule_slots('HVAC', '2026-06-22');   -- 1 row, that slot only
rollback;

-- Manager/admin unaffected:
begin;
set local role authenticated;
set local request.jwt.claim.sub  = '<manager profile id>';
set local request.jwt.claim.role = 'authenticated';
select count(*) from staff_schedules;   -- 8, same as before the fix
rollback;
```

`anon`-executable function count re-checked after the fix: still **0** — no regression on the `supabase_security_hardening_migration.sql` baseline.

**Update — regression-checked again after `supabase_staff_profile_linking_migration.sql`:** that later migration adds a nullable `staff_profile_id` column to `staff_schedules` (see `BOOKING_AVAILABILITY_DEBUG.md`) purely to let Schedule Management link a shift to a real `profiles` row instead of a hardcoded name — it changes no RLS policy. Re-ran the same vendor-session check after applying it:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub  = '<vendor profile id>';
set local request.jwt.claim.role = 'authenticated';
select count(*) from staff_schedules;   -- 0, unchanged
rollback;
```

Still 0 — adding a column does not reopen the table; a vendor still can't read `staff_schedules` directly, only through `get_available_schedule_slots()`, which was not touched.

---

## `slot_booking_counts` — reviewed, not a leak

```sql
select responsible_staff, requested_date, start_time, count(*) as booked_count
from appointment_requests
where status <> 'Cancelled'
group by responsible_staff, requested_date, start_time;
```

This view intentionally aggregates across **every** vendor's bookings (it's `SECURITY DEFINER`-equivalent by ownership — see `RLS_PRIVATE_STORAGE_PLAN.md` risk R-2 and `FRESH_DB_REBUILD.md` §9 item 2), because the booking form needs a true, cross-vendor capacity count to prevent double-booking a slot. Its output columns are `responsible_staff` (internal staff name — not vendor-identifying), `requested_date`, `start_time`, and a plain count. **No vendor identity, appointment ID, or any other vendor-distinguishing detail is exposed** — a vendor can tell "this slot has N bookings" but never *whose*. This matches the requirement ("generic aggregate booking capacity only if it does not expose vendor identity/details") as-is; no change made.

---

## Playwright E2E coverage added

`e2e/vendor.spec.js` gained four new tests exercising this audit's guarantees against the deployed app (not just the database directly):

1. **Cross-vendor booking isolation** — `vendor@` never sees any of `vendor2@`'s appointment codes in My Bookings, and vice versa.
2. **Cross-vendor project isolation** — on the shared project both vendors belong to, `vendor@` never sees `vendor2@`'s vendor-task titles, comment text, or document names, and vice versa. This test deliberately does **not** assert the two vendors see different project *names* — they're expected to see the same one, since both are members of it; only the scoped content inside is checked.
3. **`/roster` and `/schedule` are unreachable for a vendor** — direct navigation redirects away rather than rendering the page.
4. **`/projects` (the internal project view) is unreachable for a vendor** — direct navigation redirects away; only `/vendor-projects` is reachable.

An earlier version of this suite's project-list tests (7–8) incorrectly asserted that `vendor@` and `vendor2@` could never see the same project name — that assumption was wrong (see the privacy rule above) and has been corrected: those two tests now only confirm each vendor's project list loads, with no claim about name overlap either way.

See `e2e/README.md` for how to run these against a deployed environment.

---

## Re-running this audit later

Copy-paste block (adjust the two UUIDs to any two real vendor profiles you want to cross-check, and the equipment/date to any real `staff_schedules` row):

```sql
-- Replace these with real profile ids from `select id, vendor_name from profiles where role = 'vendor';`
-- VENDOR_A := '...'
-- VENDOR_B := '...'

begin;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub  = '<VENDOR_A>';

-- Should return ONLY VENDOR_A's own rows in every case below —
-- 0 rows is also a pass if VENDOR_A genuinely has none of that record type.
select count(*) from appointment_requests where vendor_user_id <> '<VENDOR_A>';   -- expect 0
select count(*) from staff_schedules;                                            -- expect 0
select count(*) from project_members;                                            -- expect 0
select count(*) from project_tasks;                                              -- expect 0
select count(*) from project_activity;                                           -- expect 0
select count(*) from project_vendor_members where vendor_profile_id <> '<VENDOR_A>';   -- expect 0
select count(*) from project_vendor_tasks   where vendor_profile_id <> '<VENDOR_A>';   -- expect 0
select count(*) from project_comments  where visibility='shared' and vendor_profile_id <> '<VENDOR_A>';  -- expect 0
select count(*) from project_documents where visibility='vendor' and vendor_profile_id <> '<VENDOR_A>';  -- expect 0
select count(*) from project_notifications where recipient_profile_id <> '<VENDOR_A>';  -- expect 0

rollback;
```

If any of these return a non-zero count, that's a regression — stop and investigate before letting a real vendor into the system.
