# FacilityFlow — Phase 2 Requirements

**Source:** Qualcomm facilities team feedback, July 2026 — **all 20 open questions answered**
**Status:** Requirements resolved. Ready for build sequencing.
**Relates to:** [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) for implementation order, priority buckets, and the next 1–2 week build plan.

---

## How to read this document

Each requirement section includes:
- **Resolved (July 2026):** what Qualcomm confirmed — this replaces the old "open question" framing wherever an answer exists
- **What this means concretely** — translated into technical scope
- **What already exists** — to avoid re-doing Phase 1 work
- **Acceptance criteria** — testable, not aspirational
- **Complexity** — `Low` (<1 week) / `Medium` (1–3 weeks) / `High` (3–6 weeks, new infrastructure or platform)

A short list of genuinely unresolved items remains at the end. Everything else below is a resolved requirement, not an open question.

---

## Resolution log — original 20 questions

| # | Original question | Resolution |
|---|---|---|
| 1 | Is Conductor a new role or a rename of Staff? | Neither — same access as internal Staff/Manager; distinguished only on the roster/timesheet display via a flag, not a permission tier |
| 2 | Admin-set password or invite flow for vendors? | Invite flow — vendor sets and manages their own account; forgot-password must be supported |
| 3 | Deactivation: immediate session kill or blocked at next login? | Blocked at next login attempt |
| 4 | Roster format — Excel, CSV, PDF scan? | Excel today, manually converted to PDF when needed |
| 5 | Does roster map to FacilityFlow accounts? | Yes — roster staff can have accounts; Admin can deactivate/remove them |
| 6 | Roster cadence — weekly, monthly? | Monthly |
| 7 | Is duty roster the same as `staff_schedules`? | No — separate concept: one person per **site** per day, covering all systems/equipment at that site |
| 8 | Maintenance report: document, form, or both? | Document upload, similar to a previously reviewed translated-document pattern; requires QC approval before closure |
| 9 | Who uploads the maintenance report? | Any access level can upload; closure is still gated on upload **and** approval |
| 10 | Should Weekly Report include the maintenance report itself? | No — task/work status only, no report content or export |
| 11 | What is "due date"? | Replaced by two explicit fields: **Start Date** and **Target Completion Date**, both date+time pickers |
| 12 | SLA targets per equipment category? | None exist today — dates are always set manually, no auto-fill |
| 13 | Who receives escalation/reminder notifications? | Reminder (1 hr before appointment) → vendor + assigned staff/conductor. Overdue → assigned POC only, with exact due date. **No delay notifications at all.** |
| 14 | Primary mobile user? | All users — vendor, staff/conductor, manager, admin |
| 15 | Target device — phone or tablet? | Phone (375px) is sufficient; tablet is nice-to-have, not required |
| 16 | PWA or native app? | "App" preferred by stakeholders, but not yet confirmed as app-store distribution. **Recommend PWA first**; revisit native only if app-store deployment is explicitly required |
| 17 | Are projects a new concept or groups of appointments? | New concept — projects have cost, timeline, and scope; **this application only owns timeline and documentation**, not cost or scope |
| 18 | Build native or integrate an existing PM tool? | Build a native Project entity inside FacilityFlow |
| 19 | Who creates/edits projects? | Qualcomm creates; every access level can add/edit content inside based on per-project permissions |
| 20 | Is the Gantt chart auto-generated? | **No** — the vendor provides and maintains the Gantt chart as an uploaded file; Qualcomm reviews and comments. No Gantt rendering engine needed. |

---

## Section 0 — Security prerequisites (required before any real pilot data)

### ✅ IMPLEMENTED — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the full design and implementation record

Both 0-A and 0-B below have shipped: all six tables have RLS enabled, and the
`appointment-documents` bucket is private with signed-URL access. The scope
and acceptance criteria are kept below as the original spec for reference.
**The system is now meaningfully safer for pilot-style testing with
controlled/synthetic data.** It is not yet fully production-ready — see
Bucket 1's remaining items (`M-3`–`M-7`) in `PHASE2_ROADMAP.md` and the
accepted risks in `RLS_PRIVATE_STORAGE_PLAN.md`.

### 0-A. Row Level Security (RLS) on all tables — ✅ done

**What this means:** Currently, any authenticated user can read and write all rows in all tables using the Supabase anon key. A vendor could query another vendor's appointments, messages, and documents directly from the browser console.

**Scope:**
- Enable RLS on: `appointment_requests`, `appointment_messages`, `appointment_documents`, `status_updates`, `staff_schedules`, `profiles`, and the new tables introduced below (`duty_roster`, project tables in Wave 3 — not yet built, will need their own RLS when they ship)
- Vendor policy: can only SELECT rows where `vendor_user_id = auth.uid()`
- Admin/Manager policy: full SELECT; UPDATE/DELETE on managed tables
- Staff/Conductor policy: SELECT all; UPDATE status only (Conductor has identical DB-level access to Staff — see §1-A)

**Acceptance criteria:**
- ✅ A vendor user cannot retrieve another vendor's appointment rows via the Supabase JS client
- ✅ Admin/Manager can view and update all rows
- ✅ RLS policies do not break any existing UI flow (full regression required)

**Complexity:** Medium
**Dependency:** Must be done before any other Wave 0 or Wave 1 item ships to real users

---

### 0-B. Private document storage — ✅ done

**What this means:** The `appointment-documents` bucket is currently public. Any person with a storage URL (e.g., forwarded in email) can download documents without authenticating.

**Scope:**
- Switch bucket to private
- Replace public URL construction with Supabase signed URLs (short TTL, e.g., 60 minutes)
- Update `AppointmentDetail.jsx` and `BookingForm.jsx` to call `supabase.storage.createSignedUrl()` before rendering download links
- Update document upload policies to scope to `auth.uid()`

**Acceptance criteria:**
- ✅ A signed URL expires and returns 403 after TTL
- ✅ A logged-out user cannot access a document URL
- ✅ Existing uploaded documents still render in Appointment Detail after migration

**Complexity:** Medium

---

## Section 1 — User accounts and role structure (RESOLVED)

### ✅ IMPLEMENTED — see `supabase_m3_m7_account_foundation_migration.sql` and `PHASE2_ROADMAP.md` Bucket 1, items M-3–M-7

Both 1-A and 1-B below have shipped: `profiles.is_active` and
`profiles.is_conductor` exist, the `role` constraint allows `admin`,
`AuthContext` blocks deactivated users with a clear message, and a
self-service forgot-password/reset-password flow is live and has been
tested end-to-end with a real email. **This closes out Bucket 1 entirely** —
combined with Section 0 (RLS/storage) and Section 3 (maintenance report
gate), all of Phase 2's "must-have before pilot" and first demo-feature work
is now done.

**Accepted risks carried forward** (also in `README.md` Security notes):
- Account *creation* still goes through the Supabase Dashboard — see the
  M-8 update below for what the in-app side now covers.
- Conductor is display-only — `is_conductor = true` never changes access;
  the underlying `role` stays `staff`.
- Conductor badges only render for the logged-in user's own account, since
  `profiles` SELECT RLS is still self-read-only — there's no way to look up
  whether *another* staff member is a Conductor.

### 1-A. Role model

**Resolved:** There are **four** `profiles.role` values, not five. Conductor is **not** a separate access tier — it is a display/roster attribute layered on top of the existing Staff-equivalent access level.

| Role value | Who | Access |
|---|---|---|
| `admin` | Qualcomm IT | Everything Manager has, plus account/user management |
| `manager` | Facilities Manager | Approve requests, manage schedule, view reports |
| `staff` | On-site staff / Conductor | Status updates, requests, calendar — **identical for Staff and Conductor** |
| `vendor` | External vendor | Own bookings and appointments only |

**Conductor distinction:** Add a boolean column `profiles.is_conductor` (default `false`). This drives **display only** — grouping and labeling on the duty roster (§2) — and has zero effect on `ROLE_ALLOWED_PREFIXES` or any RLS policy. A Conductor is a `staff`-role user with `is_conductor = true`.

**Scope:**
- Add `admin` to the `profiles.role` check constraint
- Add `is_conductor boolean default false` to `profiles`
- Extend `ROLE_ALLOWED_PREFIXES` in `App.jsx` for `admin` (superset of `manager`)
- No changes required to Staff routing/permissions

**Acceptance criteria:**
- ✅ `admin` role user can access all routes, including future `/admin/*`
- ✅ Toggling `is_conductor` on a staff profile changes only roster display, never route access
- ✅ Existing `manager`, `staff`, `vendor` sessions are unaffected by the migration

**Complexity:** Low

---

### 1-B. Vendor account lifecycle

**Resolved:** Vendor accounts are Admin-invited, not Admin-created-with-password. Vendors set up and manage their own account. Forgot-password must work. Deactivation blocks login on the *next* attempt, not mid-session.

**Scope:**

1. **Invitation (MVP mechanism — no new engineering required):** Admin uses **Supabase Dashboard → Authentication → Invite User**. This is a built-in Supabase capability: it creates the auth user and emails an invite link where the vendor sets their own password. This is sufficient for pilot and should be documented as the operational process in `SUPABASE_SETUP.md`, not built as custom code initially.

2. **Forgot password (new, small, high value):**
   - Add a "Forgot password?" link on `Login.jsx`
   - Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '.../reset-password' })`
   - New `/reset-password` route + page: takes the emailed token, lets the user set a new password via `supabase.auth.updateUser({ password })`

3. **Deactivation (new, small):**
   - Add `is_active boolean default true` to `profiles`
   - `AuthContext.fetchProfile()` checks `is_active`; if `false`, immediately call `logout()` and set an error state
   - `Login.jsx` shows: "Your account has been deactivated. Contact your administrator." if login succeeds at the Auth layer but the profile is inactive
   - This satisfies "blocked at next login attempt" — an already-open browser tab is not force-logged-out mid-session, matching Qualcomm's answer

4. **In-app Admin self-service — ✅ IMPLEMENTED as M-8** (originally tracked as Bucket 3 item L-4; built ahead of that sequencing). `/admin/users` (admin role only, app-route-guarded and RLS-guarded) lets an admin search/filter accounts and edit `display_name`, `role`, `is_active`, `is_conductor`, `vendor_name`, and `contact_name`. **Account creation itself is still deferred** — it requires a Supabase Edge Function, since creating an `auth.users` row needs the service-role key, which must never reach the browser. See `supabase_m8_admin_user_management_migration.sql` and `PHASE2_ROADMAP.md` Bucket 1, item M-8, for the full record.

**Acceptance criteria:**
- ✅ A deactivated user cannot log in; existing session (if any) is terminated on next profile fetch
- ✅ A user can reset their password from the login screen without Admin involvement — tested end-to-end with a real email, correctly landed on `/reset-password`
- ✅ Vendor accounts created via Supabase Dashboard invite flow into FacilityFlow and see the vendor-scoped app immediately
- ✅ An admin can list, search, filter, and edit any existing account's role/status/details from `/admin/users`
- ✅ An admin cannot deactivate their own account or remove their own admin role — blocked in the UI (disabled controls) and in the database (RLS `WITH CHECK`)

**Complexity:** Low (deactivation, forgot-password) / Medium (M-8 in-app edit UI — done) / High (still deferred: Edge-Function-backed account *creation* from the app)

---

## Section 2 — Duty roster management (RESOLVED)

### 2-A. Duty roster data model

### ✅ IMPLEMENTED — see `supabase_d5_duty_roster_migration.sql` and `PHASE2_ROADMAP.md` Bucket 2, item D-5

**Resolved scope correction:** the original spec below called for `duty_roster.assigned_profile_id uuid references profiles(id) not null` — a hard link to a real account — plus new `phone`/`notification_email` columns on `profiles` to source contact info from. Neither was built. What shipped instead keeps everything free text and self-contained on the roster row itself: `duty_staff_name`, `duty_staff_phone`, `duty_staff_email` all live directly on `duty_rosters`, with no foreign key to `profiles`. This was a deliberate, explicit scope decision for this pass (not an oversight) — see Acceptance Criteria below and the accepted risks.

**Resolved:** Duty roster is a **monthly**, **site-based**, **one-person-per-day** on-call record — distinct from `staff_schedules` (which is per-equipment-type booking capacity).

**What this means concretely:** One row = "this person is the on-duty point of contact for this site on this date, responsible for all systems/equipment there" — not tied to a specific piece of equipment or appointment.

**Scope (as implemented):**
- New table `duty_rosters` (note: plural, differs from the original spec's singular `duty_roster`):
  ```sql
  create table duty_rosters (
    id                uuid primary key default gen_random_uuid(),
    roster_date       date not null,
    site              text not null,
    duty_staff_name   text not null,
    duty_staff_phone  text,
    duty_staff_email  text,
    notes             text,
    created_by        uuid references profiles(id),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
  );
  ```
  Unique constraint on `(roster_date, site)` enforces one duty person per site per day at the database layer, not just in the UI.
  (A formal `sites` lookup table was not built — `site` as free text is sufficient given the likely small, stable number of Qualcomm sites. Revisit if the site list grows or needs metadata.)
- New page `/roster`: **monthly** grid — one calendar cell per day, showing every site's assignment for that day (or just the filtered site's, if a site filter is active)
- Admin/Manager assign staff to a site+date via a click-to-open day modal; can also edit or delete an existing assignment
- Access: Admin, Manager full read/write; Staff (including Conductor) read-only; **Vendor has no access at all** — no RLS policy grants vendor anything on this table, and `/roster` is not in the vendor's allowed route prefixes or sidebar nav

**Acceptance criteria:**
- ✅ Roster page defaults to the current month and shows assignments per site per day
- ✅ Admin/Manager can assign, edit, and delete a person for a site+date
- ✅ Roster data is stored in DB, not just UI state — enforced further by a real unique constraint on `(roster_date, site)`, not just app-level validation
- ✅ Vendor role cannot access `/roster` (route-guarded) or read/write `duty_rosters` (RLS-enforced independently of the route guard)
- ✅ Staff can view but not edit — UI hides edit controls, and RLS independently blocks staff INSERT/UPDATE/DELETE at the database layer

**Complexity:** Medium

**Accepted risks carried forward** (also documented in `README.md` and `SUPABASE_SETUP.md`):
- Duty staff is free text, not linked to accounts — no way to cross-reference an assignment to a real FacilityFlow login, and no autocomplete against known staff.
- Print uses the browser's print dialog (`window.print()`), not a dedicated PDF generation library.
- No concurrent-edit conflict handling — simultaneous edits to the same site+date silently overwrite each other.
- No formal `sites` lookup table — the filter dropdown reflects whatever site names have been typed so far.
- Delete uses the browser's native `confirm()` dialog, not a styled in-app modal.

---

### 2-B. Roster upload (Excel import) — ✅ IMPLEMENTED (Bucket 3, L-2)

### ✅ IMPLEMENTED — see `src/pages/DutyRoster.jsx` and `PHASE2_ROADMAP.md` Bucket 3, item L-2

**Resolved scope correction:** the original spec below called for columns `Site, Date, Staff Name, Notes` and a validation step that flags staff names against `profiles.display_name`. What shipped: columns `Date, Site, Duty Staff, Phone, Email, Notes` (matching what §2-A's `duty_rosters` table actually stores — phone/email live on the roster row, not on `profiles`), with reasonable header-variant matching (`Roster Date`, `Duty Staff Name`, `Mobile`) instead of a fixed single header set. **No `profiles.display_name` cross-check exists** — this follows directly from §2-A's own scope correction, where duty staff was deliberately kept as free text with no link to `profiles` at all, so there is nothing to match against. Validation instead checks the three required fields directly: Date (required + parseable), Site (required), Duty Staff (required).

**Scope (as implemented):**
- "Export Excel" button — downloads the currently viewed month as `facilityflow-duty-roster-YYYY-MM.xlsx`, language-aware column headers (reuses existing `roster.*`/`common.*` i18n keys, same pattern as the Weekly Report CSV export)
- "Download Template" button — blank `.xlsx` with headers + 2 sample rows
- "Import Excel" — file picker (admin/manager only; hidden entirely for staff and vendor), client-side parse via SheetJS (`xlsx` npm package), builds a preview table with per-row validation before anything touches the database
- Import preview modal: shows valid/invalid row counts, a full row-by-row table with inline error labels, and blocks Save entirely while any row is invalid (whole-batch gate, not partial import — a deliberate simplification, see accepted risks)
- Save performs a bulk upsert on the `(roster_date, site)` unique constraint already in place from D-5 — no new SQL or RLS was needed; existing admin/manager RLS policies on `duty_rosters` already cover this. Rows matching an existing `(roster_date, site)` pair update in place; new pairs insert with `created_by` set to the importing admin/manager
- Success toast reports inserted vs. updated counts

**Acceptance criteria:**
- ✅ Uploading a `.xlsx` roster file with the expected (or a supported variant) header row produces a correct preview
- ⏸ Not built as originally specified: unmatched-staff-name flagging — superseded by §2-A's scope correction (no `profiles` link exists to match against)
- ✅ Re-uploading a month updates existing `(roster_date, site)` rows in place rather than duplicating them

**Complexity:** Medium

**Accepted risks carried forward** (also documented in `README.md` and `SUPABASE_SETUP.md`):
- The `xlsx` npm package has known audit findings (prototype pollution, ReDoS) with no fix currently published to npm; accepted given browser-only parsing and admin/manager-gated access.
- Import validation is whole-batch, not partial — a single invalid row blocks the entire file from saving; there's no "import just the valid rows" option.
- Duplicate `(Date, Site)` rows within one uploaded file are silently deduplicated, keeping the last occurrence, rather than raised as an error.
- Bundling `xlsx` increased the production JS bundle size meaningfully (not code-split).
- `Site` is still free text with no formal `sites` lookup table — import doesn't validate site names against any managed list (matches §2-A's existing design, not a regression).

---

### 2-C. Roster PDF export

### ✅ IMPLEMENTED (as the "Print Roster" button, alongside D-5) — no separate build needed

**Resolved:** Confirmed as a genuine existing need (Qualcomm already does this manually today), not speculative.

**Scope (as implemented, matches the original spec closely):**
- "Print Roster" button on the roster page, `window.print()` approach — consistent with the existing Weekly Report print pattern
- Print layout: the monthly grid as rendered, with sidebar/topbar/controls hidden via the existing global `@media print` rules in `index.css`
- Contact info (phone/email) shows compactly within each day cell when present

**Acceptance criteria:**
- ✅ Print produces the monthly grid with sidebar/controls hidden
- ✅ Assignments (site, name, phone/email when present) are visible in the print layout
- ⏸ Not verified: multi-page pagination behavior for a very dense month (many sites/day) — the browser's default print pagination applies, no custom page-break tuning was done

**Complexity:** Low

**Accepted risk:** this is browser print, not a dedicated PDF generation library — output quality/layout is whatever the browser's print engine produces from the on-screen grid, not a purpose-built print stylesheet.

---

## Section 3 — Maintenance work order closure gate (RESOLVED)

### ✅ IMPLEMENTED — see `supabase_d1_maintenance_report_migration.sql` and `PHASE2_ROADMAP.md` Bucket 2, item D-1

This shipped: `document_type`/`approval_status`/`reviewed_by`/`reviewed_at`/
`review_note` columns exist on `appointment_documents`, the QC approve/reject
UI is live in `AppointmentDetail.jsx`, and the Finished-status gate is
enforced in both `AppointmentDetail.jsx` and `RequestTable.jsx`/`Requests.jsx`.
This closed `RLS_PRIVATE_STORAGE_PLAN.md` Risk R-6 (the RLS UPDATE policy for
maintenance report review). **The recommended next build has moved to the
remaining Bucket 1 account-foundation items (M-3–M-7)** — see
`PHASE2_ROADMAP.md`.

**Resolved:** Maintenance report is a **document upload**, similar to a previously reviewed translated-document pattern. **Any** role can upload it, but the task can only close after the report is **both uploaded and approved by QC**. Weekly Report stays task-status-only — no report content or export.

### 3-A. Maintenance report upload + QC approval workflow

**What this means concretely:** This is a two-gate closure, not a one-gate closure as originally scoped — document existence alone is no longer sufficient; an explicit approval step is required.

**Scope:**
- `appointment_documents.document_type` gains `'maintenance_report'` (alongside existing `'supporting_doc'`)
- New columns on `appointment_documents` (meaningful only when `document_type = 'maintenance_report'`):
  ```sql
  alter table appointment_documents
    add column approval_status text default 'pending'
      check (approval_status in ('pending','approved','rejected')),
    add column reviewed_by uuid references auth.users(id),
    add column reviewed_at timestamp with time zone,
    add column review_notes text;
  ```
- Any role (vendor, staff, manager, admin) can upload a maintenance report document — from `AppointmentDetail.jsx`, not just `BookingForm.jsx`
- New QC review action: internal roles (Admin/Manager/Staff — including Conductor) can Approve or Reject a submitted report with an optional note
- If rejected: the appointment stays open; the vendor (or uploader) can upload a replacement; the gate re-checks against the most recent report
- **Finished-status gate:** blocked unless a `maintenance_report` document exists with `approval_status = 'approved'` for that appointment. A pending or rejected report does not unlock closure.
- Weekly Report: **no changes** — continues to show task/work status only, per Qualcomm's explicit answer that report content should not be exported

**Working assumption (flagged, not blocking):** "QC team" is treated as any internal role (Admin/Manager/Staff/Conductor) for MVP, since no separate QC role was defined. Confirm with Qualcomm if approval authority should be restricted to Manager/Admin only — this is a one-line permission check to tighten later if needed.

**Acceptance criteria:**
- ✅ "Mark Finished" is disabled with a clear reason ("Upload and approve a Maintenance Report before closing this work order.") until an approved report exists
- ✅ Uploading a report sets it to `pending`; only an internal-role Approve action moves it to `approved`
- ✅ A rejected report keeps the appointment open and surfaces the rejection reason (review note) to the uploader
- ✅ Existing `Finished` appointments with no report are not retroactively blocked — the gate applies to new transitions only
- ✅ Weekly Report export is unchanged

**Complexity:** Medium

**Accepted risks carried forward (see README.md Security notes for the same list):**
- The gate checks for *any* approved maintenance report on the appointment, not necessarily the most recent one — a later rejected replacement doesn't re-lock a previously unlocked appointment.
- Reviewer identity (`reviewed_by`) is stored but not resolved to a display name in the UI, since `profiles` SELECT RLS is still self-read-only.
- No delete or edit-document-type flow exists yet — correcting a mistagged upload requires an internal reviewer to reject it and the uploader to re-upload.

---

## Section 4 — Task notifications and escalation (RESOLVED)

**Resolved:** "Due date" is replaced by two explicit, user-set fields. No SLA auto-fill exists. Reminders go out 1 hour before the appointment to the vendor and assigned staff/conductor. Overdue notifications go only to the assigned POC, with the exact date. **There is no delay notification of any kind.**

### 4-A. Start Date, Target Completion Date, and Assigned POC

### ✅ IMPLEMENTED — see `supabase_d2_target_dates_migration.sql` and `PHASE2_ROADMAP.md` Bucket 2, item D-2

This shipped: `start_date`/`target_completion_date` columns exist on
`appointment_requests`, internal roles can set/edit both plus the Assigned
POC (`responsible_staff`) from Appointment Detail, vendors can view but not
edit, and the Requests table, Appointment Detail, and Dashboard all show a
passive "Overdue" badge when the Target Completion Date has passed on a
non-Finished, non-Cancelled appointment. It was built specifically to unlock
§4-B and §4-C: the reminder notification needs a target time to compare
against, the overdue notification needs a Target Completion Date to have
missed, and both need a clear "assigned POC" to notify. **The recommended
next build has moved to §4-B/§4-C** — see `PHASE2_ROADMAP.md`.

**Scope note — Calendar integration deferred:** the original scope below
called for showing Target Completion Date on `Calendar.jsx` as a secondary
marker. That was not built in this pass (the implementation task explicitly
scoped it to Booking form / Appointment Detail / Requests table / Dashboard
/ Weekly Report only). Still open as a small follow-up, not a blocker for
D-3/D-4.

**Accepted risks carried forward** (also in `README.md` Security notes):
- Overdue badges are visual only — no email, push, or in-app notification
  fires yet. D-3/D-4 are the features that will actually notify anyone.
- Assigned POC is still free text (`responsible_staff`), not linked to a
  `profiles` row — editing it just overwrites a string.
- No email/push notifications exist yet at all — everything shipped in D-2
  is passive, on-screen only.
- Start Date / Target Completion Date depend on the browser's local clock —
  entered via a `datetime-local` picker, converted to UTC on save using the
  browser's timezone. A misconfigured system clock produces an
  equally-wrong stored value.

**"Assigned POC" is not a new field** — it's the existing `responsible_staff`
column on `appointment_requests`, already used throughout the app (Requests
table, Appointment Detail, BookingForm's slot assignment). D-2's job is to
make sure it's clearly surfaced as *the* notification recipient wherever
Start Date / Target Completion Date are shown, not to add a new column for it.

**Scope:**
- Add two columns to `appointment_requests`:
  ```sql
  alter table appointment_requests
    add column start_date timestamp with time zone,
    add column target_completion_date timestamp with time zone;
  ```
- Both are date **and** time (Qualcomm explicitly asked for date/time pickers, not date-only)
- Distinct from `requested_date`/`start_time`/`end_time`, which represent a single scheduled **visit** window — a task can span multiple visits before reaching its Target Completion Date
- Editable by internal roles (Admin/Manager/Staff/Conductor); Vendor can view but not edit (**working assumption** — reasonable default given "vendors have limited access," easy to loosen later if Qualcomm wants vendors to propose dates)
- Displayed on: Requests table (new column), Appointment Detail summary panel, Calendar (as a secondary marker distinct from the visit date, so the two concepts are never visually conflated) — each display should show the Assigned POC (`responsible_staff`) alongside the dates, since that's who a reminder/overdue notification will eventually target
- No SLA-based default — always manually entered, since Qualcomm confirmed no per-equipment-category SLA targets exist today

**Acceptance criteria:**
- ✅ Start Date and Target Completion Date are settable via a date+time picker by internal roles
- ✅ Requests table visually distinguishes "visit date" from "Target Completion Date"; ⏸ Calendar integration deferred (see scope note above)
- ✅ Vendor view is read-only for these two fields
- ✅ Assigned POC (`responsible_staff`) is visible alongside both dates wherever they're displayed

**Complexity:** Low

---

### 4-B. Reminder notification — 1 hour before appointment

### ✅ IMPLEMENTED — see `PHASE2_ROADMAP.md` Bucket 2, item D-3

**Resolved scope correction:** the original spec below called for delivery
targeted at "the vendor **and** the assigned internal staff." That literal
targeting was not built — see the note under Acceptance Criteria for what
shipped instead and why.

**Scope:**
- Trigger: appointment `requested_date` + `start_time` falls within the next ~60 minutes and status is not `Cancelled`/`Finished`
- Recipients ("all owners"): the vendor account tied to the appointment (`vendor_user_id`) **and** the assigned internal staff/conductor (`responsible_staff`)
- ~~Requires a scheduled check (Edge Function on a short cron interval, e.g., every 10–15 minutes) plus a `reminder_sent_at` column on `appointment_requests` to prevent duplicate sends~~ — not built; see Acceptance Criteria
- **Wave 1 (next demo):** in-app only, via the existing notification bell — ✅ done
- **Wave 2 (later production):** email version — ✅ **infrastructure implemented and deployed** (Bucket 3, L-1: `send-notification-emails` Edge Function + `notification_logs` table). **Actual email delivery is not yet live** — see the L-1 note below.

**L-1 email infrastructure — ✅ IMPLEMENTED, sending pending provider configuration:** see `supabase_l1_notification_logs_migration.sql` and `supabase/functions/send-notification-emails/index.ts`. The Edge Function reuses this same 1-hour-window logic server-side, is guarded by a required `x-notification-secret` header (tested: a request without it returns `401` before any query runs), and returns `503` if `RESEND_API_KEY`/`RESEND_FROM_EMAIL` aren't configured — confirmed no `notification_logs` row is written and no email is attempted in that case. **Email infrastructure is complete; actual sending is pending Resend account setup (API key + verified sender/domain) and a `pg_cron` schedule, neither of which has been done yet.** Until then, this remains functionally identical to Wave 1 (in-app only).

**Acceptance criteria:**
- ✅ A reminder notification appears in the bell roughly 1 hour before the visit, for the vendor on their own appointments, and for any internal role (admin/manager/staff) — **not** scoped specifically to "the assigned staff member," since `responsible_staff` is free text with no reliable link to a `profiles` row to match against. The Assigned POC's name is shown as text inside the notification instead.
- ✅ No duplicate reminder appears for the same appointment within a category — each appointment maps to at most one reminder item, keyed by appointment id
- ✅ No notification fires for cancelled or already-finished appointments
- ⏸ No `reminder_sent_at` tracking or scheduled re-check exists **in the in-app bell** — the bell is fetched on page load, on language change, and when clicked; there is no polling or cron, so "duplicate spam" is avoided by construction (each fetch rebuilds the list fresh) rather than by a sent-flag. **The email path (L-1) has real duplicate prevention** via `notification_logs`' unique constraint on `(appointment_id, notification_type, recipient_email)`.

**Complexity:** Medium

**Accepted risks carried forward:**
- In-app notifications remain the only thing a user sees today — nothing happens if the app isn't open, until the email path (L-1) is actually scheduled and configured.
- No background polling or cron job for the in-app bell — a new reminder only appears once someone opens or reloads the app.
- The 1-hour window is filtered in JavaScript over a capped candidate set (up to 20 near-term rows), since PostgREST can't express "date + time within the next hour" as a single filter. A reminder near the edge of that cap could theoretically be missed on an unusually busy day.
- Assigned POC is displayed, not targeted, in both the bell and the L-1 emails — any internal role/recipient sees the same reminders; there is no per-person delivery. True POC-targeted delivery needs `responsible_staff` linked to a real `profiles.id`, not attempted here.
- L-1's server-side reminder window assumes a fixed Asia/Taipei (UTC+8, no DST) timezone for combining `requested_date`+`start_time`, since those columns carry no timezone of their own and a server has no "browser."

---

### 4-C. Overdue notification — assigned POC only

### ✅ IMPLEMENTED — see `PHASE2_ROADMAP.md` Bucket 2, item D-4

**Resolved scope correction:** the original spec below called for delivery
restricted to "the assigned POC only," explicitly excluding manager. That
restriction was not built — see the note under Acceptance Criteria.

**Scope:**
- Trigger: `target_completion_date` < now() and status not in (`Finished`, `Cancelled`)
- Recipient: **assigned POC only** (`responsible_staff`/Conductor) — explicitly **no** vendor notification and **no** manager CC, per Qualcomm's answer
- Message includes the **exact** Target Completion Date that was missed, not a generic "overdue" label
- **Wave 1 (next demo):** in-app only — ✅ done
- **Wave 2 (later production):** scheduled email version — ✅ **infrastructure implemented and deployed** (Bucket 3, L-1). **Actual sending pending Resend provider configuration and a `pg_cron` schedule** — see the L-1 note under §4-B for the full record, which applies identically here (both notification types share the same `send-notification-emails` function and `notification_logs` table).

**Explicitly removed from scope:** any notification tied to the `Delayed` status. The status badge and UI state remain available for internal tracking, but no push, email, or bell notification fires when an appointment is marked Delayed. This is a direct correction from the original (unanswered) Phase 2 draft, which had proposed a delay notification.

**Acceptance criteria:**
- ✅ Overdue notifications never appear for vendor role on appointments that aren't theirs (vendor is scoped to `vendor_user_id`) — but ⏸ the "assigned POC only" restriction among internal roles was **not** built: any admin/manager/staff user sees all overdue notifications, with the Assigned POC's name shown as text in each item, rather than delivery being filtered to just that one person.
- ✅ The notification text includes the specific missed Target Completion Date
- ✅ No notification of any kind fires from a `Delayed` status change
- ✅ Overdue Alert items sort before Starting Soon reminders in the bell (most urgent first)

**Complexity:** Low

**Accepted risks carried forward** (shared with 4-B, also documented in `README.md`):
- In-app notifications remain the only thing a user sees today until L-1's email path is actually scheduled and configured (see §4-B).
- Recipients are active admins/managers plus the vendor account on the appointment, **not** "assigned POC only, no vendor" as originally specced here — same divergence as the in-app bell, carried into the email path deliberately rather than re-litigated. **Since M-9 (§4-D), a linked, active Assigned POC is now also added as a direct recipient** — additive to the admin/manager/vendor set above, not a replacement for it. Appointments without a linked POC (still the common case for anything predating M-9) behave exactly as this paragraph originally described.
- Calendar's Target Completion Date marker on the actual target date remains deferred — D-2/D-3 added an overdue badge to the existing appointment card (keyed to the visit date), not a marker on the target date's own cell, since that would require restructuring the calendar's one-date-per-event grouping.

---

### 4-D. Structured Sites + Assigned POC profile linkage

### ✅ IMPLEMENTED — see `supabase_sites_poc_linkage_migration.sql` and `PHASE2_ROADMAP.md` Bucket 1, item M-9

**Not part of the original 20-question Phase 2 scoping** — this is a data-model hardening pass added after L-1 (email infrastructure) made the limitation concrete: every accepted-risk note in §4-B/§4-C since D-3 said some version of "Assigned POC is displayed, not targeted, since `responsible_staff` isn't linked to a real `profiles` row." M-9 is the fix for that root cause, built additively so it never breaks existing data.

**What shipped:**
- New `sites` table (`id`, `name` unique, `code` unique nullable, `is_active`, timestamps) — the first structured replacement for what had been free text everywhere.
- Two new **nullable** columns on `appointment_requests`: `site_id` and `assigned_poc_profile_id`. Both additive — `responsible_staff` is neither dropped nor backfilled, and every appointment created before this migration renders exactly as it did before, until someone re-assigns it through the new dropdowns.
- Appointment Detail's Assigned POC field is now a dropdown of active internal (`admin`/`manager`/`staff`) profiles, vendors excluded. Selecting a profile keeps `responsible_staff` synced to that profile's `display_name` as backward-compatible text — the two are not allowed to silently disagree. If no profile is selected, the original free-text input remains, unchanged, for legacy/manual entries. A parallel Site dropdown (active `sites` rows) was added the same way.
- New `/sites` page — **admin and manager**, not admin-only (unlike `/admin/users`) — lists, searches, filters, creates, and edits sites. No delete UI or RLS policy exists; deactivation (`is_active = false`) is the only removal path, matching the brief's "avoid deleting if risky."
- Requests, Dashboard, Calendar, and Weekly Report all now prefer the linked POC's `display_name` and show the linked site name where there's room, falling back to `responsible_staff` text or a blank/dash when nothing is linked. Weekly Report's on-screen Vendor Visit Log table did **not** get a dedicated Site column (already 8 columns wide) — the CSV export did, since that's the surface where completeness matters more than density.
- Duty Roster's site field was **not** restructured — `duty_rosters.site` stays free text, per the explicit "do not overbuild roster staff profile linkage" instruction. Its autocomplete now additionally suggests active `sites` rows, merged with whatever free-text values are already in use, so existing entries that don't match a `sites` row exactly are never blocked from being viewed or edited.
- The L-1 email function now resolves a linked, active, emailed POC profile as a direct recipient — see the accepted-risk update in §4-C above and the function's own header comment for the exact, honest recipient behavior.

**RLS approach (no changes to `appointment_requests` policies):**
- `sites`: any authenticated user (including vendor) can read *active* sites — site names are non-sensitive labels, not appointment content, so a vendor's own Appointment Detail can resolve `site_id` → name safely without any broader grant. Only admin/manager can see inactive sites or write to the table; there is no delete policy.
- `profiles`: one new, narrowly-scoped SELECT policy lets any internal role (`admin`/`manager`/`staff`) read *other* internal profiles' rows — needed so the POC dropdown can list candidates and so any internal viewer (not just admin) can resolve an already-assigned POC's name. Vendor profiles are explicitly excluded from this policy, so it grants no new visibility into vendor company/contact data, and vendor's own read access is completely unchanged.
- `appointment_requests`: no RLS changes at all. The existing internal-role UPDATE policy is already row-level (not column-level, a long-documented accepted risk), so it already covered the two new columns the moment they were added. Vendor still has no UPDATE policy on this table — progress updates go through the D-6 RPC specifically — so "vendor cannot edit site/POC" was already true before this migration and required no new enforcement.

**Acceptance criteria:**
- ✅ Existing appointments without `site_id`/`assigned_poc_profile_id` render unchanged (verified: `mapDbToDetail` and every list-page mapper fall back to `responsible_staff`/blank when the joined value is null)
- ✅ A new or edited appointment can be assigned a structured POC and site from Appointment Detail
- ✅ Vendor cannot edit site/POC (no UI exposed; no RLS write path exists regardless)
- ✅ Internal users (not just admin) can see a linked POC's/site's name, via the new internal-profiles-read RLS policy
- ✅ Inactive profiles do not appear in the POC dropdown (`is_active = true` filter); inactive sites do not appear in the Site dropdown, same filter
- ✅ `npm run build` passes; the Edge Function still deploys with no secrets added to any frontend file

**Complexity:** Medium

**Accepted risks carried forward:**
- This is genuinely new surface area, not battle-tested against a real Qualcomm site list or org chart — the `sites` table and internal-profile dropdown will only be as useful as the data entered into them.
- No bulk migration tool exists to backfill `site_id`/`assigned_poc_profile_id` onto historical rows from their free-text values — that would require fuzzy-matching text to profiles/sites, which risks silently mis-linking a row. Deliberately not attempted; backfill (if ever wanted) should be a deliberate, reviewed, one-time data operation, not an automatic migration step.
- Duty Roster's site field remains structurally free text (by design, per the brief) — its improved autocomplete is a suggestion aid, not enforcement, so a typo'd site name is still possible there.
- The `profiles` internal-read policy is row-level, not column-level (same documented limitation as every other RLS policy in this project) — any internal role can read an entire internal profile row it's newly allowed to see (including email), not just `display_name`. Consistent with existing exposure (e.g., Duty Roster already shows staff email/phone to any internal viewer).
- ~~No UI exists yet to see which appointments are linked vs. still free-text at a glance~~ — **resolved by M-10 below.**

---

### 4-E. Admin Data Cleanup / Audit page

### ✅ IMPLEMENTED — see `src/pages/DataAudit.jsx` and `PHASE2_ROADMAP.md` Bucket 1, item M-10

**Direct follow-up to M-9's last open risk** — "no UI exists yet to see which appointments are linked vs. still free-text at a glance." `/data-audit` (admin and manager, same access pattern as `/sites`) closes that gap.

**What shipped:**
- Four count cards: appointments missing a linked site, missing a linked POC, having free-text `responsible_staff` with no linked POC profile, and linked to a POC profile that has since been deactivated.
- A category filter (the four categories above, plus "All"), a status filter, and a vendor/equipment/code search — all client-side over one fetch.
- A table (code, vendor, equipment, requested date/time, free-text POC, linked POC name, site name, status) where every row is clickable and navigates straight to Appointment Detail.
- **No bulk edit, no fuzzy auto-linking, no "copy free-text POC" quick action** — all explicitly excluded per the brief. The only way to actually change an appointment's site/POC remains the dropdowns already built in Appointment Detail (M-9); this page is purely a finder.

**RLS/security:** no new SQL, no new RLS policy. The page reads `appointment_requests` and its `assigned_poc`/`site` embedded joins under the exact same policies M-9 already established — internal-role SELECT on `appointment_requests` (pre-existing), and the M-9 internal-profiles-read policy on `profiles` (needed to see `is_active` on the joined POC, to compute the "inactive POC" category). Vendor and staff cannot reach the route (`ROLE_ALLOWED_PREFIXES` excludes `/data-audit` for both) and have no reason to — vendor profiles are never read or exposed here.

**Acceptance criteria:**
- ✅ Admin/manager can see the page; staff/vendor cannot (route-guarded, same mechanism as `/sites`)
- ✅ Counts match the number of rows each filter button shows (both computed from the same in-memory `rows` array)
- ✅ Clicking any row opens Appointment Detail for that appointment
- ✅ Appointments with `site_id`/`assigned_poc_profile_id` both null render without error — they simply fall into the "Missing Site"/"Missing Linked POC" categories, same as any other row

**Complexity:** Low

**Accepted risks carried forward:**
- No pagination — fetches all `appointment_requests` in one query, same simple-fetch pattern as `Requests.jsx`/`Dashboard.jsx`. Fine at prototype/pilot scale; would need revisiting at real production volume.
- Purely a finder, not a workflow — there is no "mark as reviewed" or audit-progress tracking; re-visiting the page always shows the current live state.

---

## Section 5 — Mobile UX (RESOLVED)

**Resolved:** All roles need both web and "app" access. Phone (375px) is the required target; tablet is nice-to-have. "App" is the stakeholders' stated preference, but native vs. installable-web was not specified — the explicit recommendation is to build a Progressive Web App first and revisit native only if app-store distribution is confirmed as a hard requirement.

### 5-A. Current state assessment (unchanged from Phase 1 audit)

| Issue | Severity | Notes |
|---|---|---|
| Sidebar is `fixed w-60` — overlaps main content on narrow screens | High | Requires a hamburger/drawer pattern |
| Main content has `ml-60` margin — collapses to near-zero on mobile | High | Content hidden behind sidebar |
| Requests table has 7+ columns — requires horizontal scroll at 375px | Medium | Needs a card view below `lg:` |
| Weekly Report 4-column stat grid stacks awkwardly | Medium | Needs 2-col grid at mobile breakpoint |
| Calendar view is not touch-optimized | Medium | Tap targets too small |
| Booking form / Appointment Detail | Low | Already reasonably usable |

### 5-B. Recommended path — PWA, not native

**Do not overpromise a native app.** The explicit recommendation:

1. **First:** Build the responsive, phone-first web pass (375px target) — collapsible sidebar drawer, card-based tables, 2-column stat grids
2. **Then:** Package as an installable **Progressive Web App** — `manifest.json`, service worker, "Add to Home Screen," basic offline shell for cached views. This is what most stakeholders mean by "app" in practice, and requires no app-store review cycle, no separate codebase, and no Apple Developer/Google Play account.
3. **Only if explicitly required:** Native app (React Native or Capacitor wrapping the existing web app) for actual App Store / Google Play distribution. This is a **High** complexity, multi-week undertaking that should not be started speculatively.

**Remaining question:** Does "app" for Qualcomm's stakeholders specifically mean installed-from-store, or is an installable PWA (added to the home screen, works like an app, no store listing) acceptable? This single answer determines whether native work is ever scoped.

**Scope (responsive + PWA):**
- Sidebar: hamburger menu below `md:` breakpoint; drawer overlay with backdrop dismiss
- Main content: `md:ml-60` instead of unconditional `ml-60`
- Requests table: card list below `lg:` breakpoint
- Weekly Report / Dashboard stat grids: 2-column below `md:`
- Add `manifest.json`, app icons, and a minimal service worker (cache-first for static assets)
- "Install app" prompt surfaced in Settings or via the browser's native install banner

**Acceptance criteria:**
- All pages are usable at 375px width without horizontal scrolling (except where a table explicitly requires it with a scroll affordance)
- The app can be added to a phone home screen and launches full-screen, no browser chrome
- Native app work is not started without an explicit Qualcomm confirmation that app-store distribution is required

**Complexity:** Medium (responsive pass) / Low–Medium (PWA packaging, on top of the responsive pass) / High (native — not recommended as a first step)

---

## Section 6 — Project collaboration channel (RESOLVED, rescoped)

**Resolved:** Projects have cost, timeline, and scope in general, but **this application owns only timeline and documentation**, plus cross-functional communication. A native Project entity will be built (not an external tool integration). Qualcomm creates projects; all roles can contribute inside them per permission. **The Gantt chart is vendor-provided and vendor-maintained as an uploaded file — FacilityFlow does not auto-generate it.** Qualcomm's role is to review and comment on the vendor's schedule.

This last point is the biggest scope change from the original ask: the highest-complexity original feature (an auto-generating Gantt rendering/dependency engine) is **removed entirely** and replaced by a much simpler document-upload-plus-comments pattern that reuses infrastructure already built in Phase 1.

### 6-A. What this application does and does not own

| In scope | Out of scope |
|---|---|
| Project timeline (start/target dates, milestones) | Cost / budget tracking |
| Document library (drawings, specs, vendor-provided Gantt files) | Procurement / scope-change management |
| Comments on documents (Qualcomm reviews vendor's schedule) | Auto-generated Gantt rendering |
| Group chat across project stakeholders | — |
| Task assignment to suppliers + completion tracking | Dependency-graph task engine |

### 6-B. Revised sub-feature list

| Sub-feature | Complexity | Notes |
|---|---|---|
| Project entity (name, timeline dates, status, description) | Medium | New `projects` table |
| Project membership + per-project permissions | Medium–High | Who can view/edit/comment inside a given project, independent of global `profiles.role` — this is effectively a small per-project ACL |
| Document library per project, including vendor-maintained Gantt files | Medium | New `project_documents` table; reuses the upload/signed-URL pattern from `appointment_documents` |
| Comment thread on documents | Medium | Threaded comments scoped to a document (e.g., "comment on this Gantt upload"), not a full chat |
| Group chat across stakeholders | High | Requires Supabase Realtime; multi-party channel concept; notification fan-out |
| Task assignment to suppliers + completion tracking | Medium–High | New `project_tasks` table; assignee + status; **no dependency-graph engine needed** since the Gantt itself lives outside the app |
| Vendor progress updates on project timeline | Low | Reuses the `progress_percent`/RPC pattern (§6-C, implemented), scoped to project milestones instead of individual appointments |

**Removed from original scope:** automatic Gantt chart generation (previously the single highest-complexity item in Phase 2). This alone drops the overall estimated effort for this section from roughly 10–16 weeks to roughly 6–10 weeks.

**Acceptance criteria for scoping (not full implementation) at the start of this phase:**
- The relationship between `projects` and existing `appointment_requests` is defined (e.g., can a project have zero, one, or many linked appointments?)
- Per-project permission tiers are defined (view / edit / comment / admin) and mapped to global roles
- A decision is recorded on whether project chat reuses the existing `appointment_messages` pattern or needs a new real-time channel model

### 6-C. Quick win available now — vendor progress percentage

### ✅ IMPLEMENTED — see `supabase_d6_vendor_progress_migration.sql` and `PHASE2_ROADMAP.md` Bucket 2, item D-6

**Resolved scope correction:** the original spec below called for a column
named `progress_pct`, updated via a vendor-scoped RLS UPDATE policy, from
either My Bookings or Appointment Detail. What shipped instead: the column
is named `progress_percent`, and updates go through a new
`update_appointment_progress(appointment_id, new_progress)` **RPC
function** (SECURITY DEFINER, explicit ownership/role check inside), not a
table UPDATE policy — because Postgres RLS is row-level, not column-level;
a "vendor can update their own rows" policy would let a vendor's browser
touch *any* column on that row (status, Assigned POC, target dates,
etc.), not just progress. The RPC is the narrowest correct grant. Editing
is available from Appointment Detail only (not My Bookings).

Independent of the full Project entity, this remains buildable immediately and doubles as the seed of the project-level progress feature in §6-B:

- ✅ Added `progress_percent` integer (0–100, default 0, CHECK-constrained) to `appointment_requests`
- ✅ Vendor can update their own progress percentage from Appointment Detail, via the RPC
- ✅ Internal roles (admin/manager/staff) can also update progress on any appointment, via the same RPC
- ⏸ Weekly Report shows progress **per appointment row** (on-screen table + CSV column), not an aggregated "average completion percentage per equipment category" as originally scoped — the simpler per-row display was judged sufficient for this pass; the equipment-category rollup remains a possible follow-up, not built

**Acceptance criteria:**
- ✅ Progress persists after refresh (confirmed via a real DB round trip, not just local state)
- ✅ Validated 0–100 on both the frontend (blocks the RPC call) and the RPC itself (raises an exception if violated) — belt and suspenders
- ✅ Progress never changes status automatically; 100% does not mark `Finished`. The maintenance report approval gate remains the only path to `Finished`.
- ✅ A vendor cannot update another vendor's appointment's progress (RPC-enforced, verified via a direct RPC call as a non-owning vendor)

**Complexity:** Low — delivered as the last item in Bucket 2's core feature arc (D-1–D-6) before D-7 (mobile) and desktop polish/demo cleanup.

**Accepted risks carried forward** (also documented in `README.md`):
- No progress history/audit trail — only the current value is stored, unlike `status_updates` for status changes.
- Progress and status are intentionally decoupled and can look inconsistent (e.g., 100% progress on a `Pending` appointment) — this is by design, not a defect.
- No shared `ProgressBar` component yet — the compact bar is implemented independently in four places (`AppointmentDetail.jsx`, `RequestTable.jsx`, `Dashboard.jsx`, `WeeklyReport.jsx`).

---

### 6-D. Project Collaboration Lite — first slice implemented

### ✅ IMPLEMENTED (partial — "Lite" by explicit instruction) — see `supabase_projects_lite_migration.sql`, `src/pages/Projects.jsx`, `src/pages/ProjectDetail.jsx`

**This is not the full §6-B feature list — it is a deliberately small first slice, built to an explicit "do not overbuild" brief.** Read this section against §6-B's table above to see exactly what's now real versus still aspirational:

| §6-B sub-feature | Status after this pass |
|---|---|
| Project entity (name, timeline dates, status, description) | ✅ Done — `projects` table, matches the spec closely (status vocabulary is `Planning/Active/Blocked/Completed/Cancelled`, not separately specified before) |
| Project membership + per-project permissions | ✅ Done, but simpler than "per-project ACL" implied — membership is binary (you're a member or not; `project_role` is a free-text label with no permission semantics attached to it yet). Permission tiers are still just the three global roles: admin/manager (full control of every project) and staff (read + own-task-status-only on projects they're a member of). No per-project "editor vs. viewer" distinction. |
| Document library incl. vendor-maintained Gantt files | ⚠️ **Partially done since §6-F** — a first slice, Project Documents v1, shipped (upload/view, no vendor access, no versioning) — see §6-F |
| Comment thread on documents | ⚠️ **Adjacent feature built instead** — project-level comments now exist (§6-E), and project documents now exist (§6-F), but there is still no threaded comment attached to an individual *document*. The original document-comment spec remains unbuilt. |
| Group chat across stakeholders | ⏸ **Not built** — not attempted; still the highest-complexity remaining item (Realtime, multi-party channel). Project comments (§6-E) are refresh-based and internal-only, deliberately not a chat substitute. |
| Task assignment to suppliers + completion tracking | **Partially done, and re-scoped** — `project_tasks` supports assignment and status tracking, but only to **internal profiles** (admin/manager/staff). "Suppliers" (vendors) are explicitly out of scope for v1: "Vendors should not access project collaboration in v1 unless explicitly invited later." No dependency-graph engine, as originally scoped. |
| Vendor progress updates on project timeline | ⏸ Not built — §6-C's `progress_percent` remains scoped to individual appointments, not project-level milestones |

**What shipped concretely:**
- `projects`, `project_members`, `project_tasks` tables, plus a nullable `appointment_requests.project_id` — an appointment can optionally link to zero or one project (answers the §6-B "relationship between projects and appointment_requests" scoping question: **zero-or-one**, not many-to-many).
- `/projects` (list: search, status filter, site filter, card grid, admin/manager-only "Create Project") and `/projects/:id` (summary, members, tasks, linked appointments) — **admin, manager, and staff**; vendor has no route, no nav item, and no RLS grant on any of the three tables.
- Admin/manager: full CRUD on projects, members, and tasks. Staff: read projects/members/tasks for projects where a `project_members` row links their `profile_id`; can change the **status** of a task assigned to them — enforced by an RLS policy scoped to `assignee_profile_id = auth.uid()`, but **row-level, not column-level** (same long-documented Postgres RLS limitation as everywhere else in this project) — a staff member could in principle also edit that task's title/description/due date via a crafted request, not just its status. Accepted for this "lite" pass, not a new category of risk.
- Appointment Detail: admin/manager get a "Project" dropdown in the existing assignment/dates edit block (not staff — matches "admin/manager can link appointment to project" exactly). Existing appointments with `project_id = null` render with no changes required.

**Acceptance criteria:**
- ✅ Admin/manager can create a project, add/remove members, create/edit/assign tasks
- ✅ Staff sees only projects they are a member of (RLS-enforced, not just UI-filtered — verified by reasoning through the policy: `is_admin_or_manager() or (is_internal_role() and is_project_member(id))`, so a non-member staff request returns zero rows, not a filtered set)
- ✅ Vendor cannot reach `/projects` (no route, no nav item) and has no RLS grant on any of the three new tables
- ✅ Staff can update the status of a task assigned to them; cannot update a task assigned to someone else (RLS-denied, not just hidden)
- ✅ An appointment can link to a project (admin/manager) and the project detail page shows it in "Linked Appointments"
- ✅ Appointments without `project_id` render safely everywhere (nullable, additive column, same pattern as M-9's `site_id`/`assigned_poc_profile_id`)

**Complexity:** Medium (schema + RLS) / Medium (frontend — two new pages plus one AppointmentDetail addition)

**Accepted risks carried forward:**
- Staff task-status-update policy is row-level only — see above.
- ~~No document library, comments, or group chat~~ — **project-level comments, an activity feed (§6-E), and a first document-upload slice (§6-F) now exist**; group chat and a real document-comment thread remain unbuilt, still the biggest gap versus the original ask.
- No per-project permission tiers beyond global role + binary membership — "project_role" on `project_members` is currently decorative (stored, displayed, not enforced).
- No notification tie-in — creating/assigning a task or adding a member does not trigger an in-app or email notification (L-1's email infrastructure is not wired to project events).
- No bulk actions, no Kanban/drag-and-drop board — task status changes via a dropdown only.
- Linking an appointment to a project is one-directional in the UI (done from Appointment Detail); there's no "add existing appointment" picker on the project page itself.

---

### 6-E. Project comments + activity feed (v1)

### ✅ IMPLEMENTED — see `supabase_project_comments_activity_migration.sql` and `src/pages/ProjectDetail.jsx`

**Honest framing:** this is comments-and-activity **v1**, not the full chat or document-comment features from the original §6-B list. Comments attach to the *project* (there are no project documents yet to comment on), are plain and unthreaded, refresh-based (no Realtime), immutable (no edit/delete UI or policy), and internal-only. The activity feed is an app-written convenience, not a tamper-proof audit log.

**What shipped:**
- `project_comments` — internal members + admin/manager can read and post on accessible projects; author identity is pinned to `auth.uid()` in the INSERT policy so no one can post as someone else. No UPDATE/DELETE policy: immutable in v1.
- `project_activity` — append-only feed rendered as a timeline on Project Detail, covering six event types: project created, project status changed, member added, task created, task status changed, appointment linked. Type labels are localized at render time (EN/繁體中文); the stored `summary` carries the specifics (names, `old → new` values).
- **Activity write model:** admin/manager actions log from the frontend after each successful write, fire-and-forget (a failed log never blocks the action). The one staff-driven event — changing their own task's status — is logged *inside* the `update_my_project_task_status()` SECURITY DEFINER RPC, atomically with the change, which is why staff have **no INSERT policy on `project_activity` at all**. Vendors have no policy on either table.

**Acceptance criteria:**
- ✅ Admin/manager can comment on any project; a staff member can comment on projects they belong to
- ✅ Staff cannot see or comment on a non-member project (RLS-enforced — the page itself already RLS-denies into a not-found state)
- ✅ Vendor has no access to comments or activity (no policy, no route)
- ✅ Task status change (both manager and staff paths), member add, and appointment link each produce an activity entry
- ✅ Empty states render for zero comments / zero activity without errors

**Complexity:** Low–Medium

**Accepted risks carried forward:**
- The activity feed is only as complete as the app code that remembers to log — a direct SQL/API write bypassing the app inserts no activity row. Audit convenience, not audit guarantee.
- Comments and activity are refresh-based — another user's new comment appears on next page load, not live.
- Activity summaries store canonical English fragments (task titles, `Active → Blocked`); only the type label is localized. Mixed-language feeds are possible and accepted.
- Activity list is capped at the 50 most recent entries with no pagination.
- No notification of any kind fires on a new comment — a member finds out by visiting the project.

---

### 6-F. Project Documents (v1)

### ✅ IMPLEMENTED — see `supabase_project_documents_migration.sql` and `src/pages/ProjectDetail.jsx`

**Honest framing:** this is Project Documents **v1**, not the full document library from the original §6-B list. Upload and view only — no versioning, replace, delete, archive, per-document comment thread, or vendor access. Files are metadata-tracked in `project_documents`; bytes are stored in the same private Storage bucket the appointment-documents feature already uses, under a `projects/{project_id}/{timestamp}-{filename}` path — **no storage policy was added or changed**.

**What shipped:**
- `project_documents` — file metadata (name, path, type, size, category, uploader, timestamp); bytes live in the existing private `appointment-documents` bucket.
- Access mirrors `project_comments`/`project_tasks`: admin/manager read/upload on every project; staff read/upload only on projects where they have a `project_members` row (`is_project_member()`); vendor has no policy at all. No UPDATE/DELETE policy — immutable in v1.
- Storage reuse, not a new bucket or new policy: the existing Step-6 internal-role policies are bucket-wide (`is_internal_role()` + bucket check only), so they already cover the new `projects/` prefix; the existing vendor policies join the file path's first segment against `appointment_requests.id`, and the literal segment `'projects'` can never equal an appointment UUID, so vendor exclusion at the storage layer is structural, not newly configured.
- `project_activity` gained a seventh event type, `document_uploaded`, logged by the frontend after a successful upload (same fire-and-forget pattern as other admin/manager-triggered events). This required **widening `project_activity`'s INSERT policy** from admin/manager-only to also cover staff on their own member projects (same shape `project_comments` already used) — otherwise a staff member's own upload would have silently failed to log.
- Project Detail: new Documents card (list with category/size/uploader/date, signed-URL links resolved client-side on load, upload form gated behind the same `canComment` — member-or-manager — check used for comments).

**Acceptance criteria:**
- ✅ Admin/manager can upload/view documents on any project; a staff member can upload/view on projects they belong to
- ✅ Staff cannot upload or view documents on a non-member project (RLS-enforced)
- ✅ Vendor has no access to project documents (no policy, no route, and structurally excluded at the storage layer)
- ✅ Upload accepts PDF/JPG/PNG up to 10MB per file, matching the existing appointment-document upload constraints
- ✅ A successful upload produces a `document_uploaded` activity entry
- ✅ Empty state renders for zero documents without errors; signed-URL resolution failure shows "link unavailable" rather than a broken link or crash

**Complexity:** Low–Medium (schema + RLS reuse of existing storage) / Low (frontend — one new card, following the established `AppointmentDetail.jsx` signed-URL pattern)

**Accepted risks carried forward:**
- At the storage layer, any internal role who somehow obtained a project file's exact path could fetch it even for a project they are not a member of — the Step-6 internal-role storage policies are bucket-wide. Member-scoping is enforced at the `project_documents` metadata layer (RLS), not storage; paths also embed an unguessable project UUID + timestamp.
- No versioning, replace, or delete — a wrong upload stays visible forever in v1 (no admin cleanup path yet).
- No per-document comment thread — the original §6-B "comment thread on documents" spec remains unbuilt.
- No notification of any kind fires on upload — a member finds out by visiting the project.
- Documents are not virus-scanned; same accepted risk as the existing appointment-documents upload path.

---

### 6-G. Project Notifications (v1, in-app only)

### ✅ IMPLEMENTED — see `supabase_project_notifications_migration.sql`, `src/pages/ProjectDetail.jsx`, `src/pages/AppointmentDetail.jsx`, `src/components/layout/Topbar.jsx`

**Honest framing:** this is Project Notifications **v1** — in-app only. No email, no push, no realtime subscription; the bell polls the same way it already did for appointment reminders/overdue alerts (on mount, on language change, and again whenever the dropdown is opened). It sits inside the *existing* notification bell rather than a separate inbox.

**What shipped:**
- `project_notifications` — one row per (recipient, event), covering all six requested event types: task assigned, task status changed, new comment, document uploaded, member added, appointment linked.
- RLS: every user reads only rows where they are the recipient (`recipient_profile_id = auth.uid()`) — **no admin/manager "see everyone's" bypass**, since project notifications are a personal inbox, not project content admin/manager already has broader oversight of.
- **No INSERT or UPDATE policy exists at all.** Every notification is created by one of two SECURITY DEFINER RPCs (`create_project_notification` for a single recipient, `create_project_notifications_for_members` for a fan-out to project members), and every mark-read goes through `mark_project_notification_read` / `mark_all_project_notifications_read`. This is a stricter version of the pattern already used for `update_my_project_task_status()`: fan-out to *other people's* inboxes is a strictly bigger attack surface than each of comments/activity/documents (where a caller only ever inserts a row about themselves), so it gets the RPC-only treatment even for INSERT, not just UPDATE.
- Recipient rules enforced server-side inside the RPCs, not trusted from the client: never the actor themselves, never a vendor, never an inactive account, never a duplicate (`distinct` on the member fan-out query).
- Task status change fan-out is scoped to **project members only** (not "every admin/manager system-wide") — the brief explicitly permitted trimming this to avoid noisy spam, and the project owner is always a member via the existing `sync_project_owner_membership()` trigger, so a separate "always notify the owner" path would just double-insert.
- Topbar bell gained a fourth section, "Project Updates" (only unread rows, capped at 20, newest first), sitting between the existing Overdue/Starting-Soon sections and the legacy per-role summary section. Each item shows a localized type label + project name, links to `/projects/:id`, and can be marked read either by clicking it (which also navigates) or via a small per-row check button that appears on hover (marks read without navigating) — plus a "mark all read" action in the section header.
- Vendor: no route ever renders project data, and vendors can never appear as a recipient (the RPCs reject vendor recipients), so the bell fetch is skipped outright for vendor role rather than issuing a query that would just return zero rows.

**Acceptance criteria:**
- ✅ Assigning a task notifies the assignee (create and reassign paths)
- ✅ Changing a task's status notifies other project members (both the admin/manager direct-update path and the staff RPC path)
- ✅ A new comment notifies project members except the author
- ✅ A document upload notifies project members except the uploader (one notification per upload batch, not one per file)
- ✅ Adding a member notifies that member
- ✅ Linking an appointment to a project notifies project members except the linker
- ✅ The actor never receives a notification about their own action
- ✅ Inactive and vendor profiles are never notification recipients
- ✅ Clicking a project notification navigates to the project and marks it read; the unread badge count updates accordingly
- ✅ Existing appointment reminder/overdue notifications are unchanged — same fetch functions, same sections, same behavior

**Complexity:** Medium (schema + two fan-out RPCs + two mark-read RPCs) / Medium (frontend — five call sites across two pages, plus extending the shared Topbar dropdown)

**Accepted risks carried forward:**
- In-app only — no email or push. A user who doesn't open the app doesn't find out. This is the explicit, agreed scope for v1; L-1's email infrastructure exists but is not wired to any project event.
- No dismiss/delete — a notification can be marked read but never removed from the underlying table. No archive or retention policy exists yet (same accepted-forever-growth trade-off as `project_activity`).
- The bell has no live/realtime update — a new notification appears on the next poll (mount, language toggle, or dropdown open), not the instant it's created.
- Notification `title`/`body` store the actor's raw canonical-English content (task titles, comment excerpts, file names) — only the type label is localized at render time. Mixed-language feeds are possible, same accepted trade-off as `project_activity.summary`.
- Task-status-change notifications go to all *other* project members uniformly; there's no finer per-user preference (e.g. "only notify me about my own tasks") in v1.

---

### 6-H. Vendor Project Access (v1a)

### ✅ IMPLEMENTED — see `supabase_vendor_project_access_v1a_migration.sql`, `src/pages/VendorProjects.jsx`, `src/pages/VendorProjectDetail.jsx`, `src/pages/ProjectDetail.jsx`

**Honest framing:** this is Vendor Project Access **v1a** — the first of at least two planned slices. Vendors can now be invited onto a project and see a safe subset of it, but there is no vendor task assignment (`project_vendor_tasks` is explicitly deferred to v1b), no vendor entries anywhere in the activity feed or notification bell, and no vendor-to-vendor visibility of any kind — the last one isn't a "not yet," it's a permanent design constraint, not a gap to close later.

**Non-negotiable design constraint, honored exactly:** vendors are **never** inserted into `project_members`, and `is_project_member()` was **not modified**. A parallel table (`project_vendor_members`) and a parallel helper (`is_project_vendor(project_id)`) exist instead, so every policy written for the internal collaboration surface across §6-D/§6-E/§6-F/§6-G continues to work completely unchanged — this feature only ever *adds* new, narrow policies, never widens an existing one.

**What shipped:**
- `project_vendor_members` — a project's vendor roster, admin/manager-managed. A `before insert` trigger rejects any `vendor_profile_id` that isn't actually role `vendor`, so this table can never silently contain an internal profile.
- `is_project_vendor(project_id)` — the vendor-only analogue of `is_project_member()`. The migration's header carries an explicit maintainer warning against ever treating the two as interchangeable.
- `get_my_vendor_projects()` / `get_my_vendor_project(id)` — SECURITY DEFINER RPCs returning exactly six columns (id/name/status/site_name/start_date/target_completion_date). Vendors have **no SELECT policy on `projects` at all** — a row-level policy can't hide `description`/`owner_profile_id`/`created_by`, so those never leave the RPC's column list.
- `get_vendor_directory()` — admin/manager-only RPC resolving active vendor display names for the internal "add vendor" / "share with" pickers, since the ordinary internal-read `profiles` policy excludes vendor rows even for managers.
- `project_documents` and `project_comments` both gained a `visibility` column (`'internal'` default, or `'vendor'`/`'shared'`) plus `vendor_profile_id`, with a CHECK constraint pairing them so a mislabeled row is structurally impossible. Existing internal read/write policies are **unchanged** — internal users already saw every row in a project regardless of visibility, which is correct (the team should see what's shared with a vendor). Two new vendor-scoped policies per table let a vendor read/write only rows tagged to their own `vendor_profile_id`, on a project they're actually a vendor member of.
- Storage: vendor-shared files live under a new `vendor-projects/{project_id}/{vendor_profile_id}/...` prefix in the existing private bucket. Two new storage policies scope that prefix to the vendor named in its own path. Zero changes to internal storage access — the existing bucket-wide internal policies from Step 6 already cover the new prefix.
- Frontend: `/vendor-projects` (list) and `/vendor-projects/:id` (detail) — separate pages, not a conditional branch inside the internal `ProjectDetail.jsx`, so an internal-only section can never accidentally render for a vendor session. Internal `ProjectDetail.jsx` gained a Vendors card (admin/manager only): add/remove vendors, an expandable per-vendor shared thread, and visibility/vendor-picker controls on the document upload form.

**Acceptance criteria:**
- ✅ Admin/manager adds a vendor to a project; that vendor sees it in `/vendor-projects`
- ✅ A vendor not added to a project cannot see it — `get_my_vendor_project()` returns no rows, not an error, matching this app's established RLS-denies-into-not-found pattern
- ✅ Vendor A cannot detect Vendor B on the same project through any table, RPC, or embed
- ✅ Vendor sees only documents/comments explicitly shared with them; internal-only documents/comments never appear in a vendor session
- ✅ Vendor can upload a vendor-visible document under the correct storage prefix; cannot write to the internal `projects/...` prefix or any other vendor's folder
- ✅ Vendor's linked-appointments view shows only their own appointments — enforced by the pre-existing, unmodified `vendor_user_id = auth.uid()` policy, no new appointment policy needed
- ✅ Internal Project Collaboration Lite flows (members, tasks, comments, activity, documents, notifications) are unaffected — verified by inspection: no existing policy was edited, only new ones added

**Complexity:** High (schema + two parallel-but-isolated RLS surfaces + three RPCs + two new storage policies) / Medium-High (frontend — two new pages plus a substantial internal `ProjectDetail.jsx` addition)

**Accepted risks carried forward:**
- Vendor actions are invisible to the internal activity feed and notification bell in v1a — both gate every write path on `is_internal_role()`, which a vendor fails by construction. A vendor uploading a shared file or replying in a shared thread produces no activity row and notifies no one; the internal team only finds out by visiting the project.
- The document-sharing INSERT policy is not restricted to admin/manager at the database level — it reuses the same internal INSERT policy staff already had for internal documents, so a staff project member could technically create a vendor-shared document via a direct API call even though the UI only exposes the sharing controls to admin/manager. Not a new category of risk (staff are already trusted with project content) but worth knowing before assuming "only admin/manager can share" is DB-enforced.
- No validation ties a shared document/comment's `vendor_profile_id` to an actual `project_vendor_members` row at the database level (only the UI's vendor picker, which is drawn exclusively from the current project's roster, prevents this in practice). A direct API call could create an orphaned share pointing at a vendor not on the project — low impact, since `is_project_vendor()` would then make that row unreadable by anyone except admin/manager.
- Staff have no visibility into the vendor roster at all in v1a (deliberately deferred, not fixed) — a staff project member can't see which vendors are involved in their own project.
- No vendor tasks (`project_vendor_tasks`), no vendor edit/delete on anything they've shared, no vendor-initiated project creation.

---

### 6-I. Vendor Project Tasks (v1b)

### ✅ IMPLEMENTED — see `supabase_vendor_project_tasks_v1b_migration.sql`, `src/pages/ProjectDetail.jsx`, `src/pages/VendorProjectDetail.jsx`

**Honest framing:** this is Vendor Project Tasks **v1b**, closing the one item §6-H explicitly deferred (`project_vendor_tasks`). No vendor task notifications yet, no vendor-initiated task creation, no due-date reminders, no dependency graph — a vendor task is created and fully edited by admin/manager; the vendor's only write is a status change.

**What shipped:**
- `project_vendor_tasks` — a table completely separate from `project_tasks`; vendor tasks never touch the internal task table or `update_my_project_task_status()`.
- A `before insert or update` validation trigger (`enforce_vendor_task_membership()`) rejects any task naming a `vendor_profile_id` that isn't an actual `project_vendor_members` row for that same project — the same "no orphan share" pattern §6-H's hardening pass established for documents/comments, reused here rather than reinvented. This single check also guarantees the vendor is genuinely role `vendor` (a profile can only be in `project_vendor_members` after passing that table's own role trigger), so no separate role check was needed.
- RLS: admin/manager full CRUD on any project; internal project members read-only on their own projects (safe to grant — the table carries no vendor PII beyond a UUID, and staff can't resolve it to a name regardless); vendor SELECT scoped to `vendor_profile_id = auth.uid() AND is_project_vendor(project_id)`, **no vendor UPDATE policy at all**.
- `update_my_vendor_project_task_status(task_id, new_status)` — the vendor's only write path. Validates the status value, requires the caller be role `vendor`, requires ownership (`task.vendor_profile_id = auth.uid()`), and **re-checks current `project_vendor_members` standing at call time** — a vendor removed from the project after a task was assigned loses write access immediately, not just on next page load.
- Internal `ProjectDetail.jsx`: a Vendor Tasks card, admin/manager only (deliberately — same call already made for the Vendors card and doc-sharing controls: staff has DB-level read access to this table, but the UI stays admin/manager-only in v1b since staff can't resolve a vendor's name to render a useful list). Create/edit a task, assign only from vendors already on the project's roster, inline status dropdown.
- `VendorProjectDetail.jsx`: a My Tasks section — read-only title/description/due date, a status dropdown wired to the RPC.
- `project_activity` gained two new types (`vendor_task_created`, `vendor_task_status_changed`), logged only from admin/manager-initiated writes — the vendor's own RPC-driven status change does not log activity, since that INSERT policy doesn't cover vendor callers.

**Acceptance criteria:**
- ✅ Admin/manager creates a vendor task for Vendor A; it appears in Vendor A's `/vendor-projects/:id` My Tasks
- ✅ Vendor A can change the task's status via the RPC; cannot edit title/description/due date (no UI control, and no RLS write path even via direct API)
- ✅ Vendor B cannot see Vendor A's task (RLS-scoped to `vendor_profile_id = auth.uid()`)
- ✅ A direct RPC call naming another vendor's task fails — ownership check inside the function, not just the UI
- ✅ A vendor removed from `project_vendor_members` immediately loses read (RLS) and status-update (RPC re-check) access to tasks still naming them
- ✅ Internal `project_tasks` and its RLS/RPC are completely unmodified — verified by inspection, this migration touches only `project_vendor_tasks` and `project_activity`'s type CHECK

**Complexity:** Medium (schema + validation trigger + one RPC, closely mirroring the already-established internal task pattern) / Medium (frontend — one new internal card, one new vendor section)

**Accepted risks carried forward:**
- No vendor task notifications — a vendor isn't proactively told a task was assigned to them; they find out by visiting `/vendor-projects/:id`. Extending the notification RPCs to cover vendor-initiated *and* vendor-recipient events is deferred, not attempted here (the brief explicitly asked for this only "if trivial," and it isn't — it would need a third notification-creation path with its own recipient-eligibility rules).
- Staff has DB-level read on vendor tasks but no UI to see them in v1b (deliberately deferred, matching the vendor-roster precedent from §6-H).
- No vendor task DELETE UI (RLS technically grants it to admin/manager via `for all`, matching `project_tasks`' own policy shape, but no button exists — consistent with the internal task UI's current behavior).
- Reassigning a task to a different vendor requires deleting and recreating it in the UI — the edit modal disables the vendor picker once a task exists, to avoid the ambiguity of "does changing the vendor also reset status/notify anyone."

---

### 6-J. Project/Vendor Notifications (v1c, in-app only)

### ✅ IMPLEMENTED — see `supabase_vendor_project_notifications_v1c_migration.sql`, `src/components/layout/Topbar.jsx`, `src/pages/ProjectDetail.jsx`, `src/pages/VendorProjectDetail.jsx`

**Honest framing:** this is Project/Vendor Notifications **v1c** — in-app only, extending §6-G's bell to the vendor-collaboration surface built in §6-H/§6-I. No email/push (same limitation §6-G already carried), no vendor activity feed, and no broadening of vendor data access — the two new RPCs write only to `project_notifications`, a table whose read side was already vendor-safe.

**What shipped:**
- `project_notifications.notification_type` widened with four values (`vendor_task_assigned`, `shared_comment_added`, `shared_document_uploaded`, `vendor_task_status_changed`) and a new `related_vendor_task_id` column (the existing `related_task_id` references `project_tasks`, not `project_vendor_tasks` — reusing it for a vendor task would raise a foreign-key violation).
- Two new SECURITY DEFINER RPCs, kept **separate** from §6-G's `create_project_notification()`/`create_project_notifications_for_members()` rather than widening them (both of those gate on `is_internal_role()` as their first check, which a vendor caller fails by construction — reusing them would mean weakening that gate):
  - `notify_vendor_project_event()` — admin/manager-only, notifies exactly one named vendor, only after verifying that vendor is an actual `project_vendor_members` row for the given project via `is_project_vendor_member()`.
  - `notify_internal_vendor_project_event()` — vendor-only, verifies the caller is a vendor member of the *specific* project being notified about (`is_project_vendor(project_id)`), then fans out to that project's internal team using the identical `project_members` query the internal fan-out RPC already uses. The vendor caller never supplies a recipient list — recipients are computed entirely server-side.
- **No RLS changes were needed.** `project_notifications`' SELECT policy and both mark-read RPCs (§6-G) were already role-agnostic (`recipient_profile_id = auth.uid()`, no role check) — a vendor could already have read/marked-read their own notifications the moment any existed. v1c only had to add the write side.
- Topbar: removed the vendor early-return in the project-notifications fetch; project names for vendor sessions resolve via `get_my_vendor_projects()` (already vendor-callable) instead of the internal `projects` table embed vendors can't read; the click-through link is chosen by the *viewing user's own role* (`/projects/:id` vs `/vendor-projects/:id`), not by anything stored on the notification row.
- Internal `ProjectDetail.jsx`: assigning a vendor task, replying in a vendor's shared thread, and sharing a document with a vendor each notify that one vendor.
- `VendorProjectDetail.jsx`: posting a shared comment, uploading a vendor-visible document, and changing task status each notify the internal team.

**Acceptance criteria:**
- ✅ Admin/manager creates a vendor task for Vendor A → Vendor A sees a notification, clicking it opens `/vendor-projects/:id`
- ✅ Admin/manager shares a document / posts into Vendor A's thread → Vendor A is notified
- ✅ Vendor A comments / uploads / changes task status → the internal project team is notified, clicking routes to `/projects/:id`
- ✅ Vendor B never receives a notification triggered by Vendor A's actions, and no query, RPC, or notification payload ever reveals Vendor B's existence to Vendor A
- ✅ A vendor cannot call either RPC to notify an arbitrary recipient — `notify_vendor_project_event()` is admin/manager-gated outright; `notify_internal_vendor_project_event()` computes recipients server-side regardless of what the vendor caller supplies
- ✅ A vendor cannot create a notification tied to a project they aren't a member of — both RPCs verify project membership before writing anything
- ✅ Existing internal project notifications (§6-G) are unaffected — verified by inspection: their RPCs, policies, and call sites are untouched

**Complexity:** Medium (schema widening + two new narrowly-scoped RPCs, closely mirroring §6-G's existing pattern) / Medium (frontend — Topbar's fetch/routing logic plus three new call sites split across two pages)

**Accepted risks carried forward:**
- Still in-app only — no email/push. A vendor who doesn't open the app doesn't find out about an assigned task until they do.
- No vendor activity feed — a vendor has no equivalent of the internal activity timeline; notifications are their only signal.
- `notify_vendor_project_event()`/`notify_internal_vendor_project_event()` fail silently (no exception) on authorization failure, matching every other notification RPC's fire-and-forget model — a blocked forgery attempt leaves no trace, same accepted trade-off already documented for §6-G.
- Editing an existing vendor task's status (as opposed to creating one) does not notify the vendor — only creation does, matching the event list exactly as scoped; a vendor discovers an admin-driven status edit only by revisiting their task list.

---

## Remaining clarifications

Everything above is a resolved requirement. These are the genuinely open items left — none of them block starting Wave 0 or most of Wave 1.

1. **QC approval authority** (§3-A): Is any internal role (Admin/Manager/Staff/Conductor) authorized to approve a maintenance report, or should it be restricted to Manager/Admin only? MVP assumption: any internal role.
2. **Date-setting authority** (§4-A): Should vendors be able to propose Start Date / Target Completion Date for manager confirmation, or is it internal-role-only as scoped? MVP assumption: internal-role-only, vendor view-only.
3. **Roster site list** (§2-A): What are the actual site names — a single Qualcomm campus with multiple buildings, or genuinely separate physical sites? Needed to build the site picker and to confirm a lookup table isn't warranted after all.
4. **Roster file format details** (§2-B): A real sample `.xlsx` roster file from Qualcomm is needed to confirm exact column layout before the parser is built.
5. **"App" definition** (§5-B): Does "app" mean installed-from-app-store, or is an installable PWA acceptable? This determines whether native work is ever scoped.
6. **Project-appointment relationship** (§6-B): Can a project have zero, one, or many linked appointments — or are projects and appointments entirely independent concepts?
7. **Project chat mechanics** (§6-B): Should project group chat reuse the existing one-thread-per-appointment message pattern, or does it need a genuinely new multi-party real-time channel model?
8. **Rejected-report notification timing** (§3-A): Should a rejected maintenance report notify the uploader immediately by email, or is in-app sufficient until the Wave 2 email infrastructure exists? Default assumption: in-app first, matching the same sequencing as reminders/overdue notifications.
