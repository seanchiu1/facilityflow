# FacilityFlow

**Enterprise Facilities Vendor Coordination Platform**
Qualcomm Facilities · Internship Prototype · July 2026

> **Prototype notice:** This is a working demo prototype. It demonstrates the full vendor coordination flow end-to-end with real Supabase Auth and a live Postgres database. **Row Level Security is enabled on all tables, the document storage bucket is private, the account foundation (deactivation, password reset, admin role, Conductor flag) is in place, admins can manage existing accounts in-app at `/admin/users`, and email notifications are live in production** (Resend + a daily GitHub Actions cron, not `pg_cron`) — the system is now meaningfully safer for pilot-style testing with controlled/synthetic data. It is still **not fully production-ready**: account *creation* still goes through the Supabase Dashboard (not `/admin/users`), among other open items. See [Security notes](#security-notes) below.

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
| **Structured Sites + Assigned POC** | `/sites` (admin **and** manager) manages a structured site list (deactivate, not delete); Appointment Detail's Assigned POC and Site fields are now dropdowns of active internal profiles / active sites, additive to the original free-text `responsible_staff` column — every existing appointment keeps rendering exactly as before; Requests/Dashboard/Calendar/Weekly Report all prefer the linked name and fall back to free text; the L-1 email function now emails a linked, active POC directly, in addition to (not instead of) the existing admin/manager delivery |
| **Data Cleanup / Audit** | `/data-audit` (admin **and** manager) — finds legacy appointments left unlinked by the Sites/POC migration: missing site, missing linked POC, free-text-POC-only, or linked to a now-inactive POC profile; counts + filters + search, click any row to open Appointment Detail and fix it there, or use the page's own inline quick-edit dropdowns to fix Site/POC one row at a time |
| **Project Collaboration Lite** | `/projects` (admin, manager, **and** staff) — lightweight tracking for longer-running facilities work: projects with a site/owner/status/dates, a members list, a task list (assign to internal profiles, staff update their own task status via a column-scoped RPC), a read-only list of linked appointments, **project comments** (members + managers, immutable v1), an **activity timeline** (project created, status changed, member added, task created/status changed, appointment linked, document uploaded), **project documents** (v1 — upload/view PDF/JPG/PNG up to 10MB per file, category tag, stored in the existing private bucket via signed URLs, immutable), and **in-app project notifications** (v1 — task assigned, task status changed, new comment, document uploaded, member added, appointment linked; surfaced in the existing Topbar bell, insert/mark-read only via SECURITY DEFINER RPCs, no email/push). Admin/manager link an appointment to a project from Appointment Detail. **This is a "Lite" slice, not a full project management suite** — no document versioning/delete, group chat, realtime, or email/push notifications; the activity feed is app-written and best-effort, not a tamper-proof audit log. See PHASE2_REQUIREMENTS.md §6-D/§6-E/§6-F/§6-G |
| **Vendor Project Access (v1a/v1b/v1c)** | `/vendor-projects` (vendor-only, separate pages from the internal Project Detail) — lets multiple vendors participate in a project without ever joining the internal collaboration surface: vendors are added via a separate `project_vendor_members` table (never `project_members`), see a six-column project summary via SECURITY DEFINER RPC (no description/owner/created_by), documents/comments explicitly shared with them (`visibility='vendor'`/`'shared'`, isolated per vendor), their own linked appointments, their own tasks (`project_vendor_tasks`, status-only via `update_my_vendor_project_task_status()`), and **(v1c) in-app notifications both directions** — a vendor is notified when assigned a task, replied to, or shared a document with; the internal team is notified when a vendor comments, uploads, or changes a task's status, via two new narrowly-scoped RPCs (`notify_vendor_project_event()`/`notify_internal_vendor_project_event()`) kept separate from the internal notification RPCs. Internal `ProjectDetail.jsx` gained Vendors and Vendor Tasks cards (admin/manager) for add/remove, per-vendor shared threads, document-sharing controls, and task assignment. **Vendor A cannot detect Vendor B on the same project through any table, RPC, notification, or embed.** No vendor activity feed, no email/push, no vendor-to-vendor visibility (permanent, not a gap). See PHASE2_REQUIREMENTS.md §6-H/§6-I/§6-J |
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
| **Notification bell** | Numeric count badge; "Overdue Alert" and "Starting Soon" sections (1-hour appointment reminders, overdue Target Completion Date alerts) sorted most-urgent-first, plus the original pending/today/attention items; each item shows appointment code, vendor, equipment, the relevant time/date, and Assigned POC, and navigates to Appointment Detail on click; vendors see only their own appointments |
| **Email notifications** | `send-notification-emails` Supabase Edge Function mirrors the bell's reminder/overdue logic server-side; `notification_logs` table (admin/manager-readable via RLS) prevents duplicate sends via a unique `(appointment_id, notification_type, recipient_email)` constraint; every call requires a matching `x-notification-secret` header (tested: missing/wrong header → `401`, no query runs) so the public anon key alone can't trigger sends; returns `503` and writes nothing if the email provider isn't configured (tested). **Live in production** — scheduled by a GitHub Actions workflow (`.github/workflows/facilityflow-email-cron.yml`, daily), not `pg_cron`; `notification_logs` has confirmed `sent` rows. Read-only admin/manager diagnostics panel at Settings → Notifications shows recent send attempts. |
| **Duty Roster** | Monthly grid at `/roster` — admin/manager add, edit, and delete site+day duty assignments (name, phone, email, notes) via a day-click modal; staff view read-only; vendors have no access (route-guarded and RLS-blocked); site filter with free-text autocomplete; "Print Roster" button reuses the existing browser print pattern |
| **Roster Excel import/export** | "Export Excel" (current month) and "Download Template" available to all roster viewers; "Import Excel" (admin/manager only) accepts `.xlsx` with header-variant matching (e.g. `Roster Date`, `Duty Staff Name`, `Mobile`), shows a validated row-by-row preview, blocks saving while any row is invalid, and bulk-upserts on `(roster_date, site)` — re-importing a month updates existing rows instead of duplicating them |
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
| `duty_rosters` | Monthly on-call assignments per site/day (free text staff fields, D-5) |
| `sites` | Structured site list (`name`, `code`, `is_active`) — links from `appointment_requests.site_id` (M-9) |
| `notification_logs` | Audit + dedupe log for the L-1 email function's send attempts |
| `projects` | Project Collaboration Lite: name, description, site, status, owner, dates — links from `appointment_requests.project_id` |
| `project_members` | Which internal profiles belong to a project — drives staff read access via RLS |
| `project_tasks` | Per-project tasks: title, assignee, status, due date |
| `project_comments` | Immutable per-project comments (author + timestamp) |
| `project_activity` | Append-only activity feed: type, actor, summary, jsonb metadata |
| `project_documents` | File metadata for project uploads (name, path, type, size, category); bytes in Supabase Storage |
| `project_notifications` | Per-recipient in-app notifications for project events; insert/mark-read only via SECURITY DEFINER RPCs |
| `project_vendor_members` | A project's vendor roster — separate from `project_members`, never grants internal access |
| `project_vendor_tasks` | Tasks assigned to a vendor — separate from `project_tasks`; vendor writes only via `update_my_vendor_project_task_status()` |

`appointment_requests` has a server-side trigger (`trg_set_appointment_code`) that auto-assigns `APT-{year}-{NNNN}` codes on insert.

See **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** for full SQL, storage setup, and sample data.

---

## Demo accounts

The app uses **Supabase Auth** (email + password). Create these users in the Supabase Dashboard and add matching `profiles` rows per SUPABASE_SETUP.md.

| Role | Email | Password | Default landing |
|---|---|---|---|
| Admin | `admin@facilityflow.demo` | `FacilityFlow123!` | Dashboard |
| Facilities Manager | `manager@facilityflow.demo` | `FacilityFlow123!` | Dashboard |
| On-site Staff | `staff@facilityflow.demo` | `FacilityFlow123!` | Requests |
| External Vendor (Taiwan Elevator Services) | `vendor@facilityflow.demo` | `FacilityFlow123!` | New Booking |
| External Vendor (Formosa Fire Safety Co.) | `vendor2@facilityflow.demo` | `FacilityFlow123!` | New Booking |

Two vendor accounts exist specifically to demo vendor-to-vendor isolation — see [DEMO_SCRIPT.md](DEMO_SCRIPT.md) Scene 13.

> **Password note:** `FacilityFlow123!` is a placeholder for local demo setup only. Never commit real credentials. For production, use Supabase's invite flow or a secrets manager.

---

## Demo Walkthrough

The full scene-by-scene script — including the original appointment workflow (login, booking, approval, maintenance report gate, duty roster, reports) and the newer Project/Vendor Collaboration flow — lives in **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)**. Setup: run `supabase_demo_seed.sql` then `supabase_demo_seed_projects.sql`, with all five demo accounts created first (see above).

The short version of the Project/Vendor Collaboration story (DEMO_SCRIPT.md Scenes 12–14):

1. **Manager creates/reviews a project** — `/projects`, open a project, see Summary/Tasks/Vendors/Documents/Comments/Activity in one place.
2. **Manager adds a vendor** — the Vendors card, drawing from an admin/manager-only vendor directory (vendors don't share a `profiles` read policy with staff).
3. **Manager shares a document, a comment, and a task** with that one vendor — each uses its own visibility flag and is invisible to every other vendor on the same project.
4. **Vendor responds** — logs into `/vendor-projects`, sees only their own project, replies in the shared thread, updates their task's status.
5. **Internal team gets a notification** — the Topbar bell picks up the vendor's action within one page load/click, routing back to `/projects/:id`.
6. **Project status/tasks update live** — both sides watch the same underlying rows change in real time (well, next-load time — see Current Limitations below).

The point of the two vendor accounts (`vendor@`/`vendor2@`) is to show the same flow twice on two different projects, then prove neither vendor can see the other's.

---

## Current Limitations

Honest, current-as-of-this-pass state — see [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) and [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md) for the full per-feature record behind each line:

- **Every notification surfaces in the Topbar bell, in-app.** Appointment reminders/overdue alerts, project updates, and vendor-collaboration events are all visible there regardless of email status.
- **Appointment reminder/overdue emails are live in production**, scheduled by a GitHub Actions workflow (daily) calling `send-notification-emails` — not `pg_cron`. A fresh clone/new environment needs its own Resend account, verified sender, and either that same GitHub Actions workflow or a `pg_cron` schedule configured before emails send there too (SUPABASE_SETUP.md §11); until then, that environment is functionally in-app-only.
- **Project/vendor-collaboration notifications (Project Notifications v1 / Vendor Notifications v1c) have no email path at all**, live or otherwise — those RPCs only ever write to `project_notifications`, never to `notification_logs`. In-app-only is permanent for this category unless that's built later, not a "not configured yet" gap like the appointment reminders above.
- **No vendor-to-vendor visibility, anywhere, by design.** This isn't a missing feature — it's the whole point of how Vendor Project Access is built. There is no roadmap item to add it.
- **No vendor activity feed.** Vendors have no equivalent of the internal Activity timeline; the notification bell is their only signal that something happened.
- **No production deployment hardening yet.** RLS is row-level, not column-level (an internal role can edit any column on a row it can see, not just the one field a specific action implies); account *creation* is still a one-time Supabase Dashboard step, not an in-app flow; there's no audit log for admin profile edits; and this has been exercised with demo/synthetic data, not a load-tested production dataset. See the "Security notes" section below for the complete, itemized list.

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

> **Rebuilding on a brand-new Supabase project?** Skip straight to **[FRESH_DB_REBUILD.md](FRESH_DB_REBUILD.md)** — it's the exact, dependency-verified order for every SQL file in this repo as one linear checklist (including `supabase_base_schema_migration.sql`, which creates the six tables step 1 below refers to — no other file in this repo does), with manual setup steps and verification queries interleaved at the right points.

1. Run `supabase_base_schema_migration.sql` to create all six base tables
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
12. Roster Excel import/export needs no SQL migration — it reuses the existing `duty_rosters` table and its `(roster_date, site)` unique constraint from step 9, and the existing admin/manager RLS policies already cover the bulk upsert
13. Run `supabase_l1_notification_logs_migration.sql` (`notification_logs` table + admin/manager-read RLS), then deploy and configure the `send-notification-emails` Edge Function — see [SUPABASE_SETUP.md](SUPABASE_SETUP.md) §11 for exact deploy/secret/schedule commands. **This step is required for the email infrastructure to exist at all; a separate Resend account + a scheduler (GitHub Actions cron — see `.github/workflows/facilityflow-email-cron.yml` — or `pg_cron`) is required before it actually sends anything.** The production deployment uses the GitHub Actions workflow, running daily.
14. Run `supabase_sites_poc_linkage_migration.sql` (`sites` table, `site_id`/`assigned_poc_profile_id` on `appointment_requests`, internal-profile-read RLS policy) — required for `/sites` and the Assigned POC/Site dropdowns in Appointment Detail; redeploy `send-notification-emails` after this so the Edge Function picks up the new `assigned_poc_profile_id` column reference
15. Run `supabase_projects_lite_migration.sql` (`projects`/`project_members`/`project_tasks` tables, `project_id` on `appointment_requests`, `is_project_member()` helper, owner-membership sync trigger, `update_my_project_task_status` RPC, RLS) — required for `/projects` and the Project dropdown in Appointment Detail
16. Run `supabase_project_comments_activity_migration.sql` (`project_comments`/`project_activity` tables + RLS; also supersedes the task-status RPC so staff status changes log to the activity feed) — required for the Comments and Activity sections on Project Detail
17. Run `supabase_project_documents_migration.sql` (`project_documents` table + RLS; widens the `project_activity` type check and INSERT policy to cover `document_uploaded`) — required for the Documents section on Project Detail. No storage policy changes — reuses the existing private `appointment-documents` bucket under a `projects/{project_id}/...` path
18. Run `supabase_project_notifications_migration.sql` (`project_notifications` table + RLS; `create_project_notification`/`create_project_notifications_for_members`/`mark_project_notification_read`/`mark_all_project_notifications_read` RPCs) — required for the "Project Updates" section in the Topbar notification bell
19. Run `supabase_vendor_project_access_v1a_migration.sql` (`project_vendor_members` table + `is_project_vendor()`/`is_project_vendor_member()` helpers; `get_my_vendor_projects`/`get_my_vendor_project`/`get_vendor_directory` RPCs; `visibility`/`vendor_profile_id` columns + role-restricted, membership-validated RLS on `project_documents` and `project_comments`; two new storage policies for the `vendor-projects/...` prefix) — required for `/vendor-projects` and the Vendors card on internal Project Detail. Includes the hardening pass (role-restricted internal INSERT policies + orphan-share validation triggers) — run the whole file, not an earlier partial version.
20. Run `supabase_vendor_project_tasks_v1b_migration.sql` (`project_vendor_tasks` table + membership-validation trigger + RLS; `update_my_vendor_project_task_status` RPC; widens `project_activity`'s type check) — required for the Vendor Tasks card on internal Project Detail and the My Tasks section on `/vendor-projects/:id`
21. Run `supabase_vendor_project_notifications_v1c_migration.sql` (widens `project_notifications.notification_type` + adds `related_vendor_task_id`; `notify_vendor_project_event`/`notify_internal_vendor_project_event` RPCs) — required for vendor-collaboration events to appear in the Topbar bell for both internal and vendor sessions
22. Run `supabase_security_hardening_migration.sql` (revokes the `anon` role's default-privilege execute access from every `SECURITY DEFINER` function, fully locks down trigger-only functions and one internal-only helper, adds `search_path` to the two oldest functions) — closes a live-advisor-confirmed gap; no product/UI behavior changes. See [FRESH_DB_REBUILD.md](FRESH_DB_REBUILD.md) §9.
23. Optionally insert sample schedule slots

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
| Structured Sites + Assigned POC | **Implemented** — `sites` table (admin/manager write, anyone reads active rows), `site_id`/`assigned_poc_profile_id` on `appointment_requests` (nullable, additive, no RLS change needed since the existing internal UPDATE policy already covers new columns); a new internal-profiles-read `profiles` RLS policy lets any admin/manager/staff resolve a linked POC's name, scoped to internal roles only — never vendor |
| Email notifications | **Implemented and live in production** — `send-notification-emails` Edge Function + `notification_logs` (RLS: admin/manager read-only). Guarded by a required `x-notification-secret` header (tested: `401` without it, before any query); returns `503` and writes nothing without a configured email provider (tested). Scheduled by a GitHub Actions workflow (daily), not `pg_cron`; `notification_logs` shows confirmed `sent` rows. |

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
- **Real email delivery is live in production** — the L-1 infrastructure (Edge Function, `notification_logs`, secret-guarded invocation), a verified Resend sender, and a daily GitHub Actions cron (`.github/workflows/facilityflow-email-cron.yml`) are all in place; `notification_logs` shows confirmed `sent` rows. A fresh clone/new environment starts without any of this configured — see `SUPABASE_SETUP.md` §11.
- **The scheduler is GitHub Actions, not `pg_cron`** — `send-notification-emails` runs automatically once daily via the workflow above (no `cron.job` rows exist in the database; `pg_cron` was never actually configured for this project). `pg_cron` remains a documented alternative for anyone who'd rather schedule it inside Postgres instead.
- **L-1's reminder-window math assumes a fixed Asia/Taipei timezone** — server-side code has no "browser," so `requested_date`+`start_time` (which carry no timezone of their own) are interpreted as UTC+8 wall-clock time. Revisit if deployed for a different region.
- **Email recipients are coarse, same as the in-app bell** — every active admin/manager gets every alert, plus the vendor account on the appointment if known; the Assigned POC's name is included as text only, never used to target delivery, since `responsible_staff` still isn't linked to a real account.
- **No polling or cron** — the bell fetches on page load, on language change, and when clicked; there is no scheduled job checking in the background.
- **The 1-hour reminder window is filtered in JavaScript over a capped candidate set** (up to 20 near-term rows), since the visit date/time can't be expressed as a single database filter — a reminder near that cap's edge could theoretically be missed on an unusually busy day.
- **Assigned POC targeting is now real, but only for linked appointments** — since M-9, an appointment with an active `assigned_poc_profile_id` DOES email that specific person (in addition to admins/managers, not instead of them). Appointments still using only the free-text `responsible_staff` — the common case for anything predating M-9 — behave as before: any internal role sees the same in-app item, and no individual email targeting occurs.
- **No bulk backfill tool exists** for linking historical appointments' free-text `responsible_staff`/site to the new structured columns — deliberately not attempted, since fuzzy-matching text to profiles/sites risks silently mis-linking a row. Backfill, if wanted, should be a reviewed one-time operation, not automatic.
- **Calendar's Target Completion Date marker on the actual target date remains deferred** — a lightweight overdue badge/dot was added to the existing appointment card (keyed to the visit date), but no marker sits on the target date's own calendar cell, since that would need restructuring the calendar's one-date-per-event grouping.
- **Duty staff is free text, not linked to accounts** — `duty_rosters.duty_staff_name` (and phone/email) are entered manually, with no connection to `profiles.id`. The original spec called for a `profiles`-linked field; this pass deliberately kept it free text instead.
- **The `xlsx` npm package (roster Excel import/export) has known audit findings** — prototype pollution and ReDoS advisories with no fix currently published to npm (SheetJS's patched builds ship from their own CDN, not npm). Accepted given parsing is browser-only and the import feature is admin/manager-gated, not open to arbitrary users.
- **Roster import validation is whole-batch, not partial** — a single invalid row (bad date, missing site, missing duty staff) blocks the entire uploaded file from saving; there's no option to import just the valid rows and skip the rest.
- **Duplicate `(Date, Site)` rows within one imported file are silently deduplicated**, keeping the last occurrence, rather than surfaced as a validation error.
- **Roster Excel import/export increased the production JS bundle size** — `xlsx` is bundled into the main chunk, not code-split/lazy-loaded.
- **Roster `Site` is still free text** — import doesn't validate site names against any managed list, since no formal `sites` lookup table exists (matches the roster's existing design, not a regression from this feature).
- **Roster print uses the browser's print dialog, not real PDF generation** — same `window.print()` approach as Weekly Report, not a dedicated PDF library.
- **No concurrent-edit conflict handling on the roster** — two admins editing the same site+date at the same time will have the last save silently win.
- **No formal `sites` lookup table** — the roster's site filter reflects whatever site names have been typed so far, not a managed list.
- **Roster delete uses the browser's native `confirm()` dialog**, not a styled in-app confirmation modal.
- **No progress history/audit trail** — `progress_percent` stores only the current value; no record of who changed it or what it was before.
- **Progress and status are intentionally decoupled and can look inconsistent** — an appointment can show 100% progress while still `Pending`, or a low percentage on a `Finished` appointment. Nothing reconciles the two; this is by design, since progress must never auto-trigger a status change.
- **No shared `ProgressBar` component yet** — the compact bar is implemented independently in four places (Appointment Detail, Requests table, Dashboard, Weekly Report).

**None of the above adds up to full production readiness.** D-1 through D-6, the desktop polish pass, M-8 (Admin User Management), L-2 (roster Excel import/export), L-1 (email notifications — now live, see below), and M-9 (structured Sites + Assigned POC linkage) make FacilityFlow substantially more capable and safer to demo with real, controlled data — they don't change the underlying accepted risks around RLS granularity.

### Recommended next steps

D-1 through D-6, the desktop polish/demo-data-cleanup pass, M-8 (in-app Admin User Management), L-2 (roster Excel import/export), L-1 (email notifications), and M-9 (structured Sites + Assigned POC linkage) are all complete. **L-1 is fully live in production**: Resend is configured, a verified sender is set, and a daily GitHub Actions cron (not `pg_cron`) triggers `send-notification-emails` — `notification_logs` shows confirmed `sent` rows. A linked, active Assigned POC is emailed directly, not just notified in-app. The next recommended step is D-7.

1. **D-7: mobile responsive pass** — still deliberately deferred, since it touches layout on every page already built.
2. **Larger remaining backlog:** PWA/mobile packaging, service-role-backed account *creation* from `/admin/users`, and the still-open pieces of Project Collaboration (document versioning, group chat, real per-project permission tiers, vendor task reassignment/deletion UI, a staff-facing vendor roster) — Project Collaboration itself is no longer unscoped: eight sub-phases have shipped (§6-D through §6-J in PHASE2_REQUIREMENTS.md) covering projects/tasks/comments/documents/activity/notifications for both internal users and vendors. See [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md) Bucket 3 for sequencing of what's left.
3. **A fresh clone/new environment still needs its own L-1 operational setup** — Resend account, verified sender, `RESEND_API_KEY`/`RESEND_FROM_EMAIL` secrets, and either the GitHub Actions workflow or a `pg_cron` schedule. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) §11.

---

## i18n

Language toggle is in Settings → Display or via the globe icon in the top bar. Switching to **繁體中文** translates all UI labels, navigation, status text, priority labels, and the Weekly Report CSV headers. Document content and user-entered text (vendor names, descriptions, messages) are not translated.

---

## Branch

Active development is on `supabase-auth-experiment`. RLS and private storage are now in place; remaining Bucket 1 items (account deactivation, admin role, forgot-password) are still recommended before merging to `main` and onboarding real users — see [Security notes](#security-notes).
