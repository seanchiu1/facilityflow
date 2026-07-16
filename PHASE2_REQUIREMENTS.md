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
- No full in-app admin user-management UI exists yet — account creation,
  role changes, and deactivation still go through the Supabase Dashboard.
- The `/admin` route prefix is reserved and route-guarded, but no page is
  registered under it yet.
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

4. **In-app Admin self-service (invite/deactivate/role-change UI) is deferred** — the Supabase Dashboard already covers this need for pilot scale. Building a dedicated `/admin/users` page with an Edge Function (required because user creation needs the service-role key, which must never reach the browser) is valuable but not required before pilot. Scoped as later production work.

**Acceptance criteria:**
- ✅ A deactivated user cannot log in; existing session (if any) is terminated on next profile fetch
- ✅ A user can reset their password from the login screen without Admin involvement — tested end-to-end with a real email, correctly landed on `/reset-password`
- ✅ Vendor accounts created via Supabase Dashboard invite flow into FacilityFlow and see the vendor-scoped app immediately

**Complexity:** Low (deactivation, forgot-password) / High (deferred: in-app self-service Admin UI, requires Edge Function — still not built, see accepted risks above)

---

## Section 2 — Duty roster management (RESOLVED)

### 2-A. Duty roster data model

### 🎯 This is the recommended next build — see `PHASE2_ROADMAP.md` Bucket 2, item D-5

With D-1 through D-4 all complete (maintenance report gate, target dates,
Assigned POC display, and in-app reminder/overdue notifications), this is
the next feature slated for build. §6-C (vendor progress percentage, D-6)
is a small, independent quick win that can be built before, after, or
alongside this one — it has no dependency relationship with the roster.

**Resolved:** Duty roster is a **monthly**, **site-based**, **one-person-per-day** on-call record — distinct from `staff_schedules` (which is per-equipment-type booking capacity). Roster staff can have FacilityFlow accounts; Admin manages removal via the account lifecycle in §1-B.

**What this means concretely:** One row = "this person is the on-duty point of contact for this site on this date, responsible for all systems/equipment there" — not tied to a specific piece of equipment or appointment.

**Scope:**
- Add `phone` and `notification_email` columns to `profiles` (notification email may differ from login email)
- New table `duty_roster`:
  ```sql
  create table duty_roster (
    id                uuid primary key default gen_random_uuid(),
    site_name         text not null,
    roster_date       date not null,
    assigned_profile_id uuid references profiles(id) not null,
    notes             text,
    created_at        timestamp with time zone default now()
  );
  ```
  (A formal `sites` lookup table is not needed for MVP — `site_name` as free text is sufficient given the likely small, stable number of Qualcomm sites. Revisit if the site list grows or needs metadata.)
- New page `/roster`: **monthly** grid (not weekly) — rows are dates, one assigned person shown per site per day
- Admin/Manager assign staff to a site+date
- Access: Admin, Manager, Staff (including Conductor) — **not** Vendor, since personal phone numbers are visible

**Acceptance criteria:**
- Roster page defaults to the current month and shows one assigned person per site per day
- Admin/Manager can assign/reassign a person to a site+date
- Roster data is stored in DB, not just UI state
- Vendor role cannot access `/roster`

**Complexity:** Medium

---

### 2-B. Roster upload (Excel import)

**Resolved:** Source format is Excel, confirmed. Support `.xlsx` upload directly rather than requiring Qualcomm to export to CSV first — this avoids adding a manual step to their existing monthly process.

**Scope:**
- Accept `.xlsx` upload with columns: Site, Date, Staff Name, Notes (exact column mapping to be confirmed against a real sample file from Qualcomm)
- Client-side parse using a library such as SheetJS (`xlsx` npm package)
- Preview parsed rows before saving; flag any staff name that doesn't match an existing `profiles.display_name`
- Bulk insert into `duty_roster` after confirmation

**Acceptance criteria:**
- Uploading a real Qualcomm monthly roster `.xlsx` file produces a correct preview
- Unmatched staff names are flagged for manual correction, not silently dropped
- Re-uploading a month overwrites/updates rather than duplicating rows for that month

**Complexity:** Medium
**Remaining detail:** Get a real sample roster file from Qualcomm to confirm exact column layout before building the parser.

---

### 2-C. Roster PDF export

**Resolved:** Confirmed as a genuine existing need (Qualcomm already does this manually today), not speculative.

**Scope:**
- "Export PDF" button on the roster page, `window.print()` approach — consistent with the existing Weekly Report print pattern
- Print layout: monthly grid, site name, assigned person, phone number
- Print CSS reuses the pattern already in `index.css` (hide sidebar/controls, `@media print`)

**Acceptance criteria:**
- Export produces a clean, paginated monthly roster document
- Phone numbers and assignments are legible in the print layout

**Complexity:** Low

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
- **Wave 2 (later production):** email version, once the email Edge Function infrastructure exists — not started (Bucket 3, L-1)

**Acceptance criteria:**
- ✅ A reminder notification appears in the bell roughly 1 hour before the visit, for the vendor on their own appointments, and for any internal role (admin/manager/staff) — **not** scoped specifically to "the assigned staff member," since `responsible_staff` is free text with no reliable link to a `profiles` row to match against. The Assigned POC's name is shown as text inside the notification instead.
- ✅ No duplicate reminder appears for the same appointment within a category — each appointment maps to at most one reminder item, keyed by appointment id
- ✅ No notification fires for cancelled or already-finished appointments
- ⏸ No `reminder_sent_at` tracking or scheduled re-check exists — the bell is fetched on page load, on language change, and when clicked; there is no polling or cron, so "duplicate spam" is avoided by construction (each fetch rebuilds the list fresh) rather than by a sent-flag

**Complexity:** Medium

**Accepted risks carried forward:**
- Notifications are in-app only — no email, SMS, push, or browser notification fires; nothing happens if the app isn't open.
- No background polling or cron job — a new reminder only appears once someone opens or reloads the app.
- The 1-hour window is filtered in JavaScript over a capped candidate set (up to 20 near-term rows), since PostgREST can't express "date + time within the next hour" as a single filter. A reminder near the edge of that cap could theoretically be missed on an unusually busy day.
- Assigned POC is displayed, not targeted — any internal role sees the same reminders; there is no per-person delivery.

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
- **Wave 2 (later production):** scheduled email version — not started (Bucket 3, L-1)

**Explicitly removed from scope:** any notification tied to the `Delayed` status. The status badge and UI state remain available for internal tracking, but no push, email, or bell notification fires when an appointment is marked Delayed. This is a direct correction from the original (unanswered) Phase 2 draft, which had proposed a delay notification.

**Acceptance criteria:**
- ✅ Overdue notifications never appear for vendor role on appointments that aren't theirs (vendor is scoped to `vendor_user_id`) — but ⏸ the "assigned POC only" restriction among internal roles was **not** built: any admin/manager/staff user sees all overdue notifications, with the Assigned POC's name shown as text in each item, rather than delivery being filtered to just that one person.
- ✅ The notification text includes the specific missed Target Completion Date
- ✅ No notification of any kind fires from a `Delayed` status change
- ✅ Overdue Alert items sort before Starting Soon reminders in the bell (most urgent first)

**Complexity:** Low

**Accepted risks carried forward** (shared with 4-B, also documented in `README.md`):
- Notifications are in-app only — no email/SMS/push/browser notification, no background job.
- Assigned POC is displayed, not targeted, for the same free-text/no-profile-link reason as 4-B.
- Calendar's Target Completion Date marker on the actual target date remains deferred — D-2/D-3 added an overdue badge to the existing appointment card (keyed to the visit date), not a marker on the target date's own cell, since that would require restructuring the calendar's one-date-per-event grouping.

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
| Vendor progress updates on project timeline | Low | Reuses the Wave 1 `progress_pct` pattern (§6-C), scoped to project milestones instead of individual appointments |

**Removed from original scope:** automatic Gantt chart generation (previously the single highest-complexity item in Phase 2). This alone drops the overall estimated effort for this section from roughly 10–16 weeks to roughly 6–10 weeks.

**Acceptance criteria for scoping (not full implementation) at the start of this phase:**
- The relationship between `projects` and existing `appointment_requests` is defined (e.g., can a project have zero, one, or many linked appointments?)
- Per-project permission tiers are defined (view / edit / comment / admin) and mapped to global roles
- A decision is recorded on whether project chat reuses the existing `appointment_messages` pattern or needs a new real-time channel model

### 6-C. Quick win available now — vendor progress percentage

Independent of the full Project entity, this remains buildable immediately and doubles as the seed of the project-level progress feature in §6-B:

- Add `progress_pct` integer (0–100) to `appointment_requests`
- Vendor can update their own progress percentage from My Bookings or Appointment Detail
- Weekly Report shows average completion percentage per equipment category

**Complexity:** Low — recommended for the next demo iteration regardless of when full Project Collaboration begins.

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
