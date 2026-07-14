# FacilityFlow — Phase 2 Requirements

**Source:** Qualcomm facilities team feedback, July 2026
**Status:** Draft for review — do not begin implementation until open questions are resolved
**Relates to:** [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) for implementation order and wave planning

---

## How to read this document

Each requirement section includes:
- **What this means concretely** — translated from stakeholder language into technical scope
- **What already exists** — to avoid re-doing Phase 1 work
- **Acceptance criteria** — testable, not aspirational
- **Complexity** — `Low` (<1 week) / `Medium` (1–3 weeks) / `High` (3–6 weeks, new infrastructure or platform)
- **Open questions** — must be answered before scoping work starts

---

## Section 0 — Security prerequisites (required before any real pilot data)

These are not Phase 2 features — they are blockers that must be completed before real Qualcomm data enters the system. They were deferred in Phase 1 intentionally.

### 0-A. Row Level Security (RLS) on all tables

**What this means:** Currently, any authenticated user can read and write all rows in all tables using the Supabase anon key. A vendor could query another vendor's appointments, messages, and documents directly from the browser console.

**Scope:**
- Enable RLS on: `appointment_requests`, `appointment_messages`, `appointment_documents`, `status_updates`, `staff_schedules`, `profiles`
- Vendor policy: can only SELECT rows where `vendor_user_id = auth.uid()`
- Manager/Admin policy: full SELECT; UPDATE/DELETE on managed tables
- Staff/Conductor policy: SELECT all; UPDATE status only

**Acceptance criteria:**
- A vendor user cannot retrieve another vendor's appointment rows via Supabase JS client
- Manager can view and update all rows
- RLS policies do not break any existing UI flows (full regression test required)

**Complexity:** Medium
**Dependency:** Must be done before 0-B and before any feature in Wave 1

---

### 0-B. Private document storage

**What this means:** The `appointment-documents` bucket is currently public. Any person with a storage URL (e.g., forwarded in email) can download documents without authenticating.

**Scope:**
- Switch bucket to private
- Replace public URL construction with Supabase signed URLs (short TTL, e.g., 60 minutes)
- Update `AppointmentDetail.jsx` and `BookingForm.jsx` to call `supabase.storage.createSignedUrl()` before rendering download links
- Update document upload policies to scope to `auth.uid()`

**Acceptance criteria:**
- A signed URL expires and returns 403 after TTL
- A logged-out user cannot access a document URL
- Existing uploaded documents still render in Appointment Detail after migration

**Complexity:** Medium

---

### 0-C. Email notification foundation (Supabase Edge Function)

**What this means:** Phase 2 requires email on status change and task due-date alerts. The foundation (a Supabase Edge Function triggered by DB webhooks) must exist before feature-specific emails can be built.

**Scope:**
- One Supabase Edge Function: `send-notification-email`
- Called by DB webhook on `appointment_requests` UPDATE (status change)
- Called by DB webhook on `appointment_requests` INSERT (new request → notify manager)
- Email template: plain-text or minimal HTML; Resend or Supabase's native SMTP
- `profiles` table needs `email` column (maps to `auth.users.email`) and `phone` column

**Acceptance criteria:**
- Manager receives email when a new vendor request is submitted
- Vendor receives email when their request status changes
- Function logs errors to Supabase logs; failures do not break the primary DB operation

**Complexity:** Medium
**Dependency:** 0-C must be complete before Requirement 4 (escalation/notifications) can be built

---

## Section 1 — User accounts and role structure

**Feedback:** Admins/Qualcomm to manage accounts and permissions; Conductors/on-duty consultants for daily coordination; Vendors with limited access.

### 1-A. Role clarification and mapping

**What already exists:** Three roles — `manager`, `staff`, `vendor` — enforced in `profiles.role` and `ROLE_ALLOWED_PREFIXES` in `App.jsx`.

**What this means concretely:**

| Qualcomm term | Maps to | Notes |
|---|---|---|
| Admin / Qualcomm IT | New `admin` role | User management, system config, all access |
| Conductor / on-duty consultant | Existing `staff` role, possibly renamed `conductor` | Daily ops coordination, status updates |
| Vendor | Existing `vendor` role | No change to access scope |
| Manager | Existing `manager` role | Approve requests, view reports |

**Open question (critical):** Is "Conductor" meaningfully different from the current "Staff" role in terms of what pages they can access, or is it just a rename? If access is the same, this is a label change (Low). If Conductors need pages that Staff currently cannot see (e.g., Schedule Management, Weekly Report), it requires a new routing profile (Medium).

**Scope (assuming role rename + one new Admin role):**
- Add `admin` as a valid value in `profiles.role`
- Optionally rename `staff` → `conductor` in DB check constraint and all app references
- Admin gets access to: everything Manager has, plus the new User Management page (1-B)

**Acceptance criteria:**
- `admin` role user can access all routes
- Non-admin roles cannot navigate to `/admin/*` routes
- Existing `manager` and `staff` sessions are not broken by the migration

**Complexity:** Low (rename only) / Medium (if new page access rules needed)

---

### 1-B. Admin user management page

**What this means:** Qualcomm IT (Admin role) needs to create user accounts, assign roles, and deactivate users — without requiring SQL access to Supabase.

**Scope:**
- New page: `/admin/users`
- List all users from `profiles` with their role, display name, email, active status
- Create new user: calls `supabase.auth.admin.createUser()` (requires service-role key on a backend function — cannot use anon key)
- Deactivate user: sets a `is_active` boolean on `profiles` (does not delete the auth user)
- Change role: UPDATE `profiles.role`
- Admin-only route guard

**Important constraint:** `supabase.auth.admin.createUser()` requires the **service-role key**, which must never be exposed to the browser. This means user creation must go through a Supabase Edge Function, not the client-side SDK.

**Acceptance criteria:**
- Admin can create a new user with email, display name, and role
- Deactivated users are redirected to login on next session check
- Non-admin users cannot access `/admin/users` (URL guard + server-side guard on the Edge Function)

**Complexity:** High (Edge Function required for user creation; service-role key security)

**Open questions:**
- Should Admins also be able to reset passwords, or is that handled via Supabase's "forgot password" flow?
- How should user deactivation work — immediate session termination, or on next login?
- Are vendor accounts self-registered (vendor fills in a form) or admin-created? Currently admin-created — is that acceptable long-term?

---

## Section 2 — Duty roster management

**Feedback:** Upload duty rosters with personal information (mobile/email); download in PDF format.

### 2-A. Duty roster data model

**What already exists:** `staff_schedules` table manages which staff member is on-site for which equipment and time slot. `profiles` has `display_name` but no `phone` or `email` columns beyond `auth.users.email`.

**What this means concretely:** A "duty roster" appears to mean a weekly on-call schedule for Qualcomm internal staff — who is the designated contact person for each day/shift — separate from the appointment-slot-level scheduling in `staff_schedules`.

**Scope:**
- Add `phone` and `notification_email` columns to `profiles` (notification email may differ from login email)
- New table: `duty_roster` — one row per day per staff member, with shift type, phone displayed, notes
- New page: `/roster` (Admin/Manager/Conductor access)
- Weekly grid view: who is on duty each day, their direct mobile number
- Edit roster: Admin/Manager can assign staff to days

**Acceptance criteria:**
- Roster page shows current week's on-duty staff with names, roles, and phone numbers
- Admin/Manager can assign/change duty assignments
- Roster data is stored in DB, not just a UI state

**Complexity:** Medium

---

### 2-B. Roster upload (CSV/Excel import)

**What this means:** Qualcomm likely has an existing HR system or spreadsheet for duty rosters. They want to upload that file rather than re-entering data manually.

**Scope:**
- Accept CSV upload with columns: Staff Name, Date, Shift (AM/PM/Full), Phone, Notes
- Parse on the client; preview before saving
- Map uploaded rows to `profiles.id` by name match (with manual correction if name doesn't match exactly)
- Bulk insert into `duty_roster`

**Complexity:** Medium

**Open questions (critical):**
- What is the current roster format — Excel, CSV, something else?
- Does the roster map to existing `profiles` users, or can it include external on-call contacts who don't have FacilityFlow accounts?
- How far in advance are rosters typically uploaded — one week, one month?

---

### 2-C. Roster PDF download

**What this means:** Generate a printable weekly roster PDF from the duty roster data.

**Scope:**
- "Download PDF" button on the roster page
- Uses browser `window.print()` with print CSS (same approach as Weekly Report) — no library dependency
- Print layout: weekly table, staff names, phone numbers, shift times, Qualcomm logo placeholder
- Alternatively: use `jsPDF` or `html2canvas` for a real file download (more complex but better UX than print dialog)

**Recommendation:** Start with `window.print()` (consistent with existing Export PDF approach). Add real PDF generation only if stakeholders find the print dialog unacceptable after seeing it.

**Acceptance criteria:**
- "Export PDF" button produces a clean one-page (or paginated) roster document
- Phone numbers and shift assignments are visible and legible
- Print layout hides sidebar and controls (matching existing print CSS in `index.css`)

**Complexity:** Low (print approach) / Medium (jsPDF approach)

---

## Section 3 — Maintenance work order closure gate

**Feedback:** Before closing maintenance work orders, require a mandatory "Maintenance Report Required" field/report/document.

**What already exists:** The status lifecycle allows moving an appointment to `Finished` via a dropdown in `RequestTable.jsx` and status buttons in `AppointmentDetail.jsx`. There is no gate on this transition.

**What this means concretely:** Before any user can set status to `Finished`, the system must verify that at least one document tagged as a "Maintenance Report" has been uploaded to that appointment. If no report exists, the action is blocked with a clear message.

### 3-A. Maintenance report gate

**Scope:**
- Add `document_type` column to `appointment_documents` (e.g., `'supporting_doc'` | `'maintenance_report'`)
- When uploading a document in `AppointmentDetail`, allow selecting document type (dropdown or radio)
- In `AppointmentDetail.jsx` and `RequestTable.jsx`: before allowing the `Finished` status transition, check if any `appointment_documents` row with `document_type = 'maintenance_report'` exists for this appointment
- If none: show an inline warning and disable the "Mark Finished" button until one is uploaded
- Upload a maintenance report directly from the Appointment Detail page (not just from BookingForm)

**Acceptance criteria:**
- "Mark Finished" is disabled (with tooltip: "Upload a Maintenance Report before closing") if no maintenance report document exists
- After uploading a document typed as "Maintenance Report," the "Mark Finished" button becomes active
- Existing appointments that have no maintenance report and are already `Finished` are not retroactively blocked (only gates new transitions)
- The gate applies to all roles that can set `Finished` (Manager, Staff, Conductor)

**Complexity:** Medium

**Open questions:**
- Should the maintenance report be a **document upload** (PDF), a **form** (structured fields: work performed, parts used, technician sign-off), or **both**? A structured form is harder to build but more queryable for reporting.
- Can vendors upload their own maintenance report, or is it always uploaded by Qualcomm staff?
- Should there be a separate "Maintenance Report" page or section in the Weekly Report that lists all closure reports for the week?

---

## Section 4 — Task notifications and escalation

**Feedback:** Notify assigned person when tasks are approaching due date, delayed, or overdue.

**What already exists:** The notification bell in `Topbar.jsx` provides role-specific in-app notifications (pending count, today's visits, delayed/cancelled). There is no `due_date` field on `appointment_requests`. Emails do not exist yet.

### 4-A. Due date field on appointments

**Scope:**
- Add `due_date` (date) column to `appointment_requests`
- Optional: `due_time` (time) for time-specific SLAs
- Booking form: optional due date field for vendor to specify
- Requests page: show due date column; highlight overdue rows in amber/red
- `appointment_requests` can already have `requested_date` as the scheduled visit date — clarify whether `due_date` is the same or a separate SLA deadline

**Open question (critical):** What is the definition of "due date" in this context?
- Option A: The scheduled appointment date (`requested_date`) IS the due date — work must be finished by then
- Option B: A separate SLA deadline distinct from the visit date (e.g., a repair must be completed within 30 days of submission, regardless of when the vendor visits)
- Option C: Both — visit date is scheduled, SLA deadline is tracked separately

**Complexity:** Low (just a new column and display) once the definition is clear

---

### 4-B. In-app escalation notifications

**Scope — extend existing notification bell:**
- "Approaching due date" item: appointments where `due_date` is within 3 days and status is not `Finished`
- "Overdue" item: appointments where `due_date` < today and status is not `Finished` or `Cancelled`
- "Delayed" alert: appointments with status `Delayed` (already partially implemented)
- Click notification item → navigates to Appointment Detail

**Acceptance criteria:**
- Notification bell shows overdue and approaching-due-date items for the relevant role
- Items are ordered: overdue first, then approaching, then standard notifications
- Notification items clear when the appointment reaches `Finished` or `Cancelled`

**Complexity:** Low (extends existing notification infrastructure)

---

### 4-C. Email escalation (scheduled)

**Scope:**
- Requires Section 0-C (email foundation) to be complete first
- Supabase scheduled job (pg_cron or Edge Function on a cron trigger): runs daily at 08:00
- Sends email to `responsible_staff` + manager when: appointment is overdue, or due in ≤ 2 days and not finished
- Sends email to vendor when their appointment is marked `Delayed`

**Acceptance criteria:**
- Overdue email includes: appointment code, vendor name, equipment, scheduled date, days overdue
- Email is not re-sent if already sent today (add `last_notified_at` column or a separate `notification_log` table)
- Escalation emails are visible in Supabase function logs

**Complexity:** Medium (depends on 0-C completion)

**Open questions:**
- What are the SLA targets? (e.g., HVAC repairs must be completed within 5 business days of approval)
- Who gets escalation emails — just the assigned staff member, or does it CC a manager after N days?
- Should vendors receive "your appointment is overdue" notifications, or only internal staff?

---

## Section 5 — Mobile UX assessment

**Feedback:** Assess if mobile version is functional/user-friendly/ready; recommend improvements.

### 5-A. Current state assessment

FacilityFlow was built as a **desktop-first application** (1280px+ optimized). The current layout has structural issues on mobile:

| Issue | Severity | Notes |
|---|---|---|
| Sidebar is `fixed w-60` — overlaps main content on narrow screens | High | Requires a hamburger/drawer pattern |
| The main content has `ml-60` margin — collapses to near-zero on mobile | High | Content is hidden behind sidebar |
| Requests table has 7 columns — requires horizontal scroll on 375px screens | Medium | Card view or collapsed columns needed |
| Weekly Report 4-column stat grid stacks awkwardly | Medium | Needs 2-col grid at mobile breakpoint |
| Booking form is full-width and readable | Low | Works reasonably well already |
| Calendar view is not touch-optimized | Medium | Tap targets too small |
| Appointment Detail is single-column — works on mobile | Low | Already reasonable |

**Recommendation:** A full native app is not required for a first mobile pass. A **responsive web app** with a collapsible sidebar and mobile-optimized tables covers the vendor and on-site staff use cases. Managers are unlikely to do report work on mobile.

### 5-B. Responsive web improvements (recommended)

**Scope:**
- Sidebar: Add hamburger menu on screens < 768px; sidebar slides in as a drawer overlay with a backdrop dismiss
- Main content: Remove `ml-60` on mobile; full-width below `md:` breakpoint
- Requests table: Below `lg:` breakpoint, collapse to a card list (code, vendor, status, date — tap to expand)
- Weekly Report stats: 2-column grid on mobile
- Appointment Detail: Already reasonable — minor spacing adjustments

**Complexity:** Medium (requires layout restructure; all pages need regression testing)

**Open questions:**
- Who is the primary mobile user — vendors checking their booking status, or on-site staff updating appointment status on a tablet?
- Should the target screen size be phone (375px) or tablet (768px)? This significantly affects the design decisions.
- Is a Progressive Web App (PWA with home screen icon and offline capability) in scope, or just responsive web?

---

## Section 6 — Project collaboration channel

**Feedback:** Project timeline management; vendor progress updates; automatic Gantt chart generation; group chat; task assignment to suppliers; file sharing.

### 6-A. Scope classification

This feedback describes a **project management platform** — a substantially different and larger system than the appointment coordination tool in Phase 1. The key distinction:

| FacilityFlow Phase 1 | Project Collaboration (Phase 2+) |
|---|---|
| Single appointment = single vendor visit | Project = multi-vendor, multi-week effort with dependencies |
| Status lifecycle (9 states) | Milestone/phase tracking with percentage progress |
| One-to-one message thread | Group chat with multiple stakeholders |
| Document upload per appointment | Shared document library per project |
| Weekly report for facilities overview | Gantt chart auto-generated from project data |
| Tasks are appointment requests | Tasks are assignable sub-items within a project |

**Recommendation:** This should be planned as a separate **Phase 3** initiative with its own requirements document, not included in the Phase 2 MVP build. The architectural decisions (whether to build in FacilityFlow or integrate an existing tool) deserve a separate scoping session.

### 6-B. Sub-features ranked by complexity

| Sub-feature | Complexity | Notes |
|---|---|---|
| Vendor progress status updates | Low | Extends existing appointment status model; vendors update a `progress_pct` field |
| Project-level document sharing | Medium | New `project_documents` table; file browser UI |
| Group chat / multi-party messaging | High | Requires Supabase Realtime subscriptions; channel concept; notification fan-out |
| Task assignment + completion tracking | High | New `project_tasks` table; assignee management; dependency logic |
| Project timeline management | High | New `projects` entity; `project_milestones` table; date range management |
| Gantt chart generation | High | Requires a Gantt library (e.g., `dhtmlx-gantt`, `frappe-gantt`); auto-layout from milestone data |

**Acceptance criteria for Phase 3 scoping (not implementation):**
- A separate requirements document exists for the Project Collaboration module
- The data model relationship between "projects" and existing "appointment_requests" is defined
- A decision is made: build inside FacilityFlow, or integrate an existing tool (Asana/Notion/ClickUp with API)

### 6-C. Quick win available now (vendor progress updates)

If Qualcomm wants something shipped in Phase 2 that addresses this feedback without the full Gantt scope, consider:
- Add a `progress_pct` integer field (0–100) to `appointment_requests`
- Vendor can update their own progress percentage from My Bookings or Appointment Detail
- Weekly Report shows average completion percentage per project/equipment category

This takes ≤1 week and gives vendors a way to communicate sub-completion status beyond the existing status lifecycle.

**Complexity:** Low

---

## Open questions for Qualcomm — full list

Answer these before implementation estimates are finalized.

### Role structure (Section 1)
1. Is "Conductor" a new role distinct from "Staff," or a rename? If distinct, what pages/actions should Conductors have that Staff do not, and vice versa?
2. Should Admin-created vendor accounts require the vendor to set their own password (invite flow), or does the Admin set the initial password?
3. How should deactivated users be handled — immediate logout, or blocked on next login?

### Duty roster (Section 2)
4. What is the current format of the duty roster — Excel, CSV, paper/PDF scan?
5. Do roster staff members always have FacilityFlow accounts, or can the roster include external contacts (e.g., an on-call person from a third-party company)?
6. How far in advance is the roster typically created — one week, one month?
7. Is the duty roster the same concept as `staff_schedules` (who covers which equipment), or is it an HR-style "who is physically present today" record?

### Maintenance report (Section 3)
8. Should the maintenance report be a **document upload** (PDF/image), a **structured form** (fields: work performed, parts replaced, hours spent, technician signature), or both?
9. Can vendors upload their own maintenance report, or must it come from Qualcomm staff?
10. Should "Maintenance Report" appear in the Weekly Report export as a separate section?

### Notifications and escalation (Section 4)
11. What is the definition of "due date"? Is it the scheduled appointment date (`requested_date`), a separate SLA deadline, or both?
12. What are the SLA targets per equipment category? (e.g., HVAC: 5 business days; AED: 24 hours)
13. Who receives escalation emails — the assigned staff member only, or does it CC the manager after a certain number of days?

### Mobile (Section 5)
14. Who is the primary mobile user — vendors checking their booking status, or on-site staff updating appointment status on a tablet?
15. Target device: phone (375px) or tablet (768px)?
16. Is a Progressive Web App (installable on home screen) in scope, or just a responsive browser experience?

### Project collaboration (Section 6)
17. Are "projects" a new concept separate from appointments, or are they groups of related appointments (e.g., an elevator modernization project = 12 separate maintenance appointments)?
18. Is there an existing project management tool Qualcomm uses (Asana, Jira, Notion, MS Project) that should be integrated rather than rebuilt?
19. Who initiates a "project" — Qualcomm management or vendors?
20. Is the Gantt chart for internal planning visibility, or is it shared with vendors?
