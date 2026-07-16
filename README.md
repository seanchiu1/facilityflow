# FacilityFlow

**Enterprise Facilities Vendor Coordination Platform**
Qualcomm Facilities · Internship Prototype · July 2026

> **Prototype notice:** This is a working demo prototype. It demonstrates the full vendor coordination flow end-to-end with real Supabase Auth and a live Postgres database. **Row Level Security is enabled on all tables and the document storage bucket is private** — the system is now meaningfully safer for pilot-style testing with controlled/synthetic data. It is still **not fully production-ready**: account deactivation, admin self-service tooling, and other items remain open. See [Security notes](#security-notes) below.

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
| **Schedule Management** | Manager creates weekly staff slots that vendors can book into |
| **Calendar** | Monthly/weekly view of all scheduled appointments; click-through to detail |
| **Dashboard** | Live stat cards (pending, approved, completed, cancelled) and upcoming visits |
| **Notification bell** | Role-specific dropdown: pending count for manager, today's visits for staff, upcoming for vendor |
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
6. Optionally insert sample schedule slots

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

Full design and the six migrations that implemented this: **[RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md)**.

This makes FacilityFlow meaningfully safer for **pilot-style testing with controlled/synthetic data**. It is **not the same as fully production-ready** — see "Accepted risks" below for what's still open.

### Accepted risks (tracked, not blocking)

- **RLS is row-level, not column-level** — an internal role (manager/staff) can update any column on a row it can see, not just `status`. A compromised or misused staff account could, in principle, reassign an appointment's `vendor_user_id`. No current UI does this, but the database doesn't prevent it. Accepted MVP limitation.
- **No account deactivation yet** — there's no `is_active` flag. A revoked user's still-valid session JWT continues to pass every RLS check until it naturally expires; there's no way to immediately cut off access.
- **No admin self-service user management UI** — new accounts, role changes, and (once built) deactivation all still go through the Supabase Dashboard, not an in-app page.
- **Signed document URLs expire after 1 hour** and are fetched fresh on each Appointment Detail page load rather than cached — a tab left open longer than that needs a refresh to regenerate working links. Working as designed.
- **Maintenance report gate checks for *any* approved report, not necessarily the latest one** — if a report is approved and a later replacement is rejected, the appointment can still close. No "supersedes" tracking exists.
- **Reviewer identity is stored but not displayed** — `reviewed_by` is recorded on approval/rejection, but the UI doesn't resolve it to a name (`profiles` RLS is currently self-read-only, so looking up another user's name isn't wired up yet).
- **No delete or edit-document-type flow** — a document uploaded with the wrong type (e.g., a supporting file mistakenly tagged as a Maintenance Report) can only be corrected by an internal reviewer rejecting it and the uploader re-uploading correctly tagged.

### Recommended next steps

1. **Account deactivation (`is_active`)**, **forgot-password flow**, **admin role + route guard**, **Conductor display flag**, and **documenting the Supabase Dashboard vendor-invite process** — small, low-complexity items (M-3 through M-7) that close the remaining Bucket 1 gaps before real pilot data. See [PHASE2_ROADMAP.md](PHASE2_ROADMAP.md).
2. **Email notifications**, **real-time messages**, **mobile responsive pass**, **duty roster** — later production work, see the Phase 2 roadmap for sequencing.

---

## i18n

Language toggle is in Settings → Display or via the globe icon in the top bar. Switching to **繁體中文** translates all UI labels, navigation, status text, priority labels, and the Weekly Report CSV headers. Document content and user-entered text (vendor names, descriptions, messages) are not translated.

---

## Branch

Active development is on `supabase-auth-experiment`. RLS and private storage are now in place; remaining Bucket 1 items (account deactivation, admin role, forgot-password) are still recommended before merging to `main` and onboarding real users — see [Security notes](#security-notes).
