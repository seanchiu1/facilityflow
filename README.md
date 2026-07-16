# FacilityFlow

**Enterprise Facilities Vendor Coordination Platform**
Qualcomm Facilities · Internship Prototype · July 2026

> **Prototype notice:** This is a working demo prototype. It demonstrates the full vendor coordination flow end-to-end with real Supabase Auth and a live Postgres database. **Row Level Security is enabled on all tables, the document storage bucket is private, the account foundation (deactivation, password reset, admin role, Conductor flag) is in place, and admins can manage existing accounts in-app at `/admin/users`** — the system is now meaningfully safer for pilot-style testing with controlled/synthetic data. It is still **not fully production-ready**: account *creation* still goes through the Supabase Dashboard (not `/admin/users`), among other open items. See [Security notes](#security-notes) below.

---

## What it does

FacilityFlow streamlines how facilities teams coordinate external vendor appointments. Instead of tracking vendor visits over email and spreadsheets, facilities managers publish weekly schedule slots, vendors book directly into available windows, and the whole lifecycle — approval, status updates, document uploads, and internal messaging — flows through a single interface.

Three roles: **Facilities Manager** (full control), **On-site Staff** (status updates, calendar), **External Vendor** (submit and track their own requests).

---

## Problem it solves

Qualcomm facilities teams manage dozens of vendor visits each week across elevator, HVAC, chiller, AED, UPS, electrical, and fire safety equipment. Historically this meant:

- Vendors emailed requests with no visibility into available time windows
- Managers manually routed approvals through inbox threads
- Status updates (delayed, in progress, finished) were communicated via phone or chat
- Supporting documents (safety certs, work orders) were attached to emails and lost
- No weekly summary of what was completed, in progress, or cancelled

FacilityFlow replaces all of this with role-gated dashboards, a structured booking form, and a persistent message thread per appointment.

---

## Key features

| Feature | Description |
|---|---|
| **Supabase Auth** | Email + password login; role stored in `profiles` table |
| **Account foundation** | Deactivation (`is_active`, blocked at next login), self-service password reset (email link → `/reset-password`), `admin` role, Conductor display flag for staff |
| **Admin User Management** | `/admin/users` (admin role only) — search/filter accounts by name, email, vendor, role, and active status; edit display name, role, active status, Conductor flag, and vendor/contact fields; an admin cannot deactivate themselves or remove their own admin role, enforced in both the UI and the database (RLS `WITH CHECK`); account *creation* still happens via Supabase Dashboard invite (no service-role key in the browser) |
| **Role-based routing** | Each role is locked to their allowed URL prefixes; unauthorized routes redirect silently |
| **Vendor Booking** | Pick equipment, select a live schedule slot, attach supporting documents |
| **Stable appointment codes** | Server-generated codes like `APT-2026-0001`; persist across sorting/filtering |
| **My Bookings** | Vendor's personal view of all their own appointments |
| **Appointment Detail** | Full lifecycle view: summary, documents, messages, status timeline |
| **Message thread** | Per-appointment conversation; manager, staff, and vendor all have voice |
| **Requests page** | Manager/staff view with search, status filter, and inline lifecycle actions |
| **Status lifecycle** | Pending → Approved → Scheduled → In Progress → 50% Finished → Finished (+ Cancelled, Delayed, Need More Info) |
| **Status history** | Every status change is persisted to `status_updates`; timeline survives page refresh |
| **Maintenance report gate** | Any role can upload a Maintenance Report document (Supporting Document vs. Maintenance Report type); internal roles approve/reject it; **Finished** is blocked until at least one report is approved |
| **Target dates & Assigned POC** | Internal roles set a Start Date and Target Completion Date per appointment, and can edit the Assigned POC (`responsible_staff`); vendors view but can't edit; passive "Overdue" badges appear in Appointment Detail, the Requests table, and Dashboard when a target date has passed — no notifications are sent yet |
| **Schedule Management** | Manager creates weekly staff slots that vendors can book into |
| **Calendar** | Monthly/weekly view of all scheduled appointments; click-through to detail |
| **Dashboard** | Live stat cards (pending, approved, completed, cancelled) and upcoming visits |
| **Notification bell** | Numeric count badge; "Overdue Alert" and "Starting Soon" sections (1-hour appointment reminders, overdue Target Completion Date alerts) sorted most-urgent-first, plus the original pending/today/attention items; each item shows appointment code, vendor, equipment, the relevant time/date, and Assigned POC, and navigates to Appointment Detail on click; vendors see only their own appointments — **in-app only**, no email/push |
| **Duty Roster** | Monthly grid at `/roster` — admin/manager add, edit, and delete site+day duty assignments (name, phone, email, notes) via a day-click modal; staff view read-only; vendors have no access (route-guarded and RLS-blocked); site filter with free-text autocomplete; "Print Roster" button reuses the existing browser print pattern |
| **Work progress %** | Progress bar + 0–100 update form on Appointment Detail, editable by the vendor who owns the appointment or any internal role; compact bars in the Requests table, Dashboard, and Weekly Report; updates go through a `SECURITY DEFINER` RPC (not a broad table policy) so a vendor can only ever touch the progress field on their own appointment; fully decoupled from status — 100% never auto-closes a work order |
| **Weekly Report** | Per-week summary with equipment breakdown, staff hours, vendor visit log |
| **Copy Summary** | One-click plain-text clipboard export of the weekly report |
| **CSV export** | Language-aware CSV (headers and status/priority labels in EN or ZH); BOM-prefixed for Excel |
| **Print-to-PDF** | Export PDF button triggers `window.print()`; sidebar/controls hidden for clean output |
| **English / Traditional Chinese** | Full i18n via React context; all UI labels, navigation, and status text translated |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| Icons | Lucide React |
| Backend / DB | Supabase (Postgres) |
| Auth | Supabase Auth (email + password) |
| File Storage | Supabase Storage |
| i18n | Custom React context — English + Traditional Chinese |

---

## Core workflow

```
Manager publishes a schedule slot (Schedule Management)
    ↓
Vendor submits a booking request (New Booking)
    → appointment_requests row created (status: Pending)
    → supporting documents uploaded to Supabase Storage
    ↓
Manager reviews in Requests → Approves (status: Approved)
    ↓
Manager or Staff marks Scheduled, then In Progress on the day
    ↓
Staff marks 50% Finished → Finished
    → each transition recorded in status_updates
    ↓
Weekly Report reflects completion rate, equipment breakdown, staff hours
    → export as CSV or print-to-PDF
    ↓
Vendor and manager can message at any step in the same thread
```

---

## Data model

| Table | Purpose |
|---|---|
| `profiles` | Links `auth.users.id` → role, display name, vendor name, contact name |
| `appointment_requests` | Core record: vendor info, equipment, date/time, staff, status, priority, description, `appointment_code` |
| `staff_schedules` | Manager-published schedule slots vendors can book into |
| `appointment_messages` | Per-appointment message thread; stores sender name, role, timestamp |
| `appointment_documents` | Metadata for uploaded files; actual files in Supabase Storage |
| `status_updates` | Immutable status history per appointment; drives the detail page timeline |

`appointment_requests` has a server-side trigger (`trg_set_appointment_code`) that auto-assigns `APT-{year}-{NNNN}` codes on insert.

See **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** for full SQL, storage setup, and sample data.

---

## Demo accounts

The app uses **Supabase Auth** (email + password). Create these users in the Supabase Dashboard and add matching `profiles` rows per SUPABASE_SETUP.md.

| Role | Email | Password | Default landing |
|---|---|---|---|
| Facilities Manager | `manager@facilityflow.demo` | `FacilityFlow123!` | Dashboard |
| On-site Staff | `staff@facilityflow.demo` | `FacilityFlow123!` | Requests |
| External Vendor | `vendor@facilityflow.demo` | `FacilityFlow123!` | New Booking |

> **Password note:** `FacilityFlow123!` is a placeholder for local demo setup only. Never commit real credentials. For production, use Supabase's invite flow or a secrets manager.

---

## Setup

### 1. Install dependencies

```bash
cd Qualcomm
npm install
```

### 2. Configure environment

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

Both values are in **Supabase Dashboard → Project Settings → API**:
- `VITE_SUPABASE_URL` → "Project URL"
- `VITE_SUPABASE_PUBLISHABLE_KEY` → "Project API Keys → anon / public"

### 3. Set up Supabase

Follow **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** to:
1. Create all six tables
2. Create demo Auth users and their `profiles` rows
3. Run the `appointment_code` migration (adds stable codes to existing rows)
4. Create the `appointment-documents` Storage bucket as **private**
5. Run the RLS migrations (`supabase_rls_prep_migration.sql` through `supabase_rls_step5_staff_schedules.sql`) and the private storage migration (`supabase_private_storage_step6.sql`) — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the full design
6. Run `supabase_d1_maintenance_report_migration.sql` (maintenance report upload + QC approval gate)
7. Run `supabase_m3_m7_account_foundation_migration.sql` (account deactivation, admin role, Conductor flag)
8. Run `supabase_d2_target_dates_migration.sql` (Start Date, Target Completion Date, Assigned POC display)
9. Run `supabase_d5_duty_roster_migration.sql` (Duty Roster monthly grid at `/roster`)
10. Run `supabase_d6_vendor_progress_migration.sql` (Work progress %, `update_appointment_progress` RPC)
11. Run `supabase_m8_admin_user_management_migration.sql` (`profiles.email` column, admin read/update RLS policies for `/admin/users`)
12. Optionally insert sample schedule slots

### 4. Run locally

```bash
npm run dev
# → http://localhost:5173

# Production build
npm run build
npm run preview
```

---

## Screenshots

> _Add screenshots here after capturing them. See the list of recommended captures at the bottom of this file._

| Screen | Description |
|---|---|
| `screenshots/login.png` | Login screen with role email fields |
| `screenshots/dashboard-manager.png` | Manager dashboard with live stat cards |
| `screenshots/requests.png` | Requests page with search, filter, and status badges |
| `screenshots/booking-form.png` | Vendor booking form with slot selector |
| `screenshots/appointment-detail.png` | Detail page: summary, timeline, messages |
| `screenshots/weekly-report.png` | Weekly Report with equipment breakdown and vendor log |
| `screenshots/weekly-report-zh.png` | Weekly Report in Traditional Chinese |
| `screenshots/calendar.png` | Calendar view with appointment events |
| `screenshots/notification-bell.png` | Notification dropdown open |

---

## Security notes

### Current state

| Area | Status |
|---|---|
| Authentication | Supabase Auth (email + password) — implemented |
| Route protection | App-level role checks — implemented |
| Row Level Security | **Enabled on all six tables** (`profiles`, `appointment_requests`, `appointment_messages`, `appointment_documents`, `status_updates`, `staff_schedules`) — vendors are scoped to their own rows at the database layer, not just in app code |
| Document storage | **Private bucket** — documents are only accessible via signed URLs (1-hour TTL), scoped by the same ownership rules as the database |
| Vendor data isolation | Enforced at the DB layer via RLS — verified a vendor cannot read/write another vendor's rows or documents directly through the Supabase client, bypassing the UI entirely |
| Account deactivation | **Implemented** — `profiles.is_active`; a deactivated user is signed out and blocked at next login with a clear message |
| Password reset | **Implemented** — self-service "Forgot password?" on Login, using Supabase's built-in recovery flow; tested end-to-end with a real email |
| Admin role foundation | **Implemented** — `admin` added to the `profiles.role` constraint, with the same access as Manager plus the in-app User Management page |
| Conductor flag | **Implemented** — `profiles.is_conductor`, display-only |
| Admin user management | **Implemented** — `/admin/users`, admin-only route (app + RLS enforced); admins can read and update any profile; self-demotion and self-deactivation are blocked by an RLS `WITH CHECK` clause, not just a disabled UI control |

Full design and the migrations that implemented all of this: **[RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md)** (RLS/storage) and `supabase_m3_m7_account_foundation_migration.sql` (account foundation).

This makes FacilityFlow meaningfully safer for **pilot-style testing with controlled/synthetic data**. It is **not the same as fully production-ready** — see "Accepted risks" below for what's still open.

### Accepted risks (tracked, not blocking)

- **RLS is row-level, not column-level** — an internal role (manager/staff) can update any column on a row it can see, not just `status`. A compromised or misused staff account could, in principle, reassign an appointment's `vendor_user_id`. No current UI does this, but the database doesn't prevent it. Accepted MVP limitation.
- **Account creation is still Supabase-Dashboard-only** — `/admin/users` covers editing *existing* accounts (role, active status, Conductor, vendor/contact fields), but creating a brand-new account still requires the Dashboard invite flow. Automating creation needs a Supabase Edge Function (service-role key must never reach the browser); not built in this pass.
- **`profiles.email` may need manual backfill** — it's populated going forward at account-creation time, but rows created before the M-8 migration will show no email in User Management until an admin/SQL backfill runs.
- **No super-admin tier** — every `admin` account has identical privileges; there's no distinction between a "root" admin and any other admin.
- **Admins can edit other admins** — including changing another admin's role or deactivating them (self-edit is the only thing blocked, at both the UI and RLS layer).
- **No audit log for admin profile changes** — `/admin/users` writes directly to `profiles` with no history table; there's no record of who changed what, or when, beyond the row's current values.
- **Conductor is display-only** — `is_conductor = true` only adds a label; the underlying `role` stays `staff`, and access is identical to any other staff account.
- **Conductor badges only show for the logged-in user's own account** — `profiles` SELECT RLS is still self-read-only, so there's no way to look up whether *another* staff member is a Conductor (e.g., next to "Assigned Staff" on an appointment).
- **Signed document URLs expire after 1 hour** and are fetched fresh on each Appointment Detail page load rather than cached — a tab left open longer than that needs a refresh to regenerate working links. Working as designed.
- **Maintenance report gate checks for *any* approved report, not necessarily the latest one** — if a report is approved and a later replacement is rejected, the appointment can still close. No "supersedes" tracking exists.
- **Reviewer identity is stored but not displayed** — `reviewed_by` is recorded on approval/rejection, but the UI doesn't resolve it to a name (same `profiles` self-read-only limitation as the Conductor badge above).
- **No delete or edit-document-type flow** — a document uploaded with the wrong type (e.g., a supporting file mistakenly tagged as a Maintenance Report) can only be corrected by an internal reviewer rejecting it and the uploader re-uploading correctly tagged.
- **Assigned POC is still free text, not linked to a `profiles` row** — it's the existing `responsible_staff` column; editing it from Appointment Detail just overwrites a string, with no dropdown against real staff accounts.
- **Start Date / Target Completion Date depend on the browser's local clock** — entered via a `datetime-local` picker and converted to UTC using the browser's timezone on save. A misconfigured system clock on the editing device produces an equally-wrong stored value.
- **Notifications (D-3/D-4) are in-app only** — the bell shows reminder and overdue items, but there is no email, SMS, push, browser notification, or background job. Nothing fires while the app isn't open.
- **No polling or cron** — the bell fetches on page load, on language change, and when clicked; there is no scheduled job checking in the background.
- **The 1-hour reminder window is filtered in JavaScript over a capped candidate set** (up to 20 near-term rows), since the visit date/time can't be expressed as a single database filter — a reminder near that cap's edge could theoretically be missed on an unusually busy day.
- **Assigned POC is shown, not targeted** — reminder and overdue notifications display the Assigned POC's name as text, but any internal role (admin/manager/staff) sees the same items; delivery isn't scoped to just that person, since `responsible_staff` isn't linked to a real account.
- **Calendar's Target Completion Date marker on the actual target date remains deferred** — a lightweight overdue badge/dot was added to the existing appointment card (keyed to the visit date), but no marker sits on the target date's own calendar cell, since that would need restructuring the calendar's one-date-per-event grouping.
- **Duty staff is free text, not linked to accounts** — `duty_rosters.duty_staff_name` (and phone/email) are entered manually, with no connection to `profiles.id`. The original spec called for a `profiles`-linked field; this pass deliberately kept it free text instead.
- **No Excel import/export for the roster yet** — assignments are entered one day at a time through the grid; Qualcomm's existing monthly `.xlsx` process still requires manual re-entry into FacilityFlow.
- **Roster print uses the browser's print dialog, not real PDF generation** — same `window.print()` approach as Weekly Report, not a dedicated PDF library.
- **No concurrent-edit conflict handling on the roster** — two admins editing the same site+date at the same time will have the last save silently win.
- **No formal `sites` lookup table** — the roster's site filter reflects whatever site names have been typed so far, not a managed list.
- **Roster delete uses the browser's native `confirm()` dialog**, not a styled in-app confirmation modal.
- **No progress history/audit trail** — `progress_percent` stores only the current value; no record of who changed it or what it was before.
- **Progress and status are intentionally decoupled and can look inconsistent** — an appointment can show 100% progress while still `Pending`, or a low percentage on a `Finished` appointment. Nothing reconciles the two; this is by design, since progress must never auto-trigger a status change.
- **No shared `ProgressBar` component yet** — the compact bar is implemented independently in four places (Appointment Detail, Requests table, Dashboard, Weekly Report).

**None of the above adds up to full production readiness.** D-1 through D-6, the desktop polish pass, and now M-8 (Admin User Management) make FacilityFlow substantially more capable and safer to demo with real, controlled data — they don't change the underlying accepted risks around RLS granularity or the lack of any real notification delivery.

### Recommended next steps

D-1 through D-6, the desktop polish/demo-data-cleanup pass, and M-8 (in-app Admin User Management) are all complete. **The next recommended step is roster Excel import/export (§2-B / Bucket 3 L-2)** — Qualcomm's existing monthly `.xlsx` roster process still requires manual re-entry into FacilityFlow today.

1. **Roster Excel import/export (L-2)** — bulk-load a monthly roster instead of entering assignments one day at a time through the grid.
2. **D-7: mobile responsive pass** — still deliberately deferred, since it touches layout on every page already built.
3. **Larger remaining backlog:** email/push notification infrastructure for the D-3/D-4 reminders and overdue alerts, PWA/mobile packaging, service-role-backed account *creation* from `/admin/users`, and Project Collaboration (its own separate phase, not yet scoped) — see [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) Bucket 3 for sequencing.

---

## i18n

Language toggle is in Settings → Display or via the globe icon in the top bar. Switching to **繁體中文** translates all UI labels, navigation, status text, priority labels, and the Weekly Report CSV headers. Document content and user-entered text (vendor names, descriptions, messages) are not translated.

---

## Branch

Active development is on `supabase-auth-experiment`. RLS and private storage are now in place; remaining Bucket 1 items (account deactivation, admin role, forgot-password) are still recommended before merging to `main` and onboarding real users — see [Security notes](#security-notes).
