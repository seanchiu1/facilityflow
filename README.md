# FacilityFlow

**Enterprise Facilities Vendor Coordination Platform**
Qualcomm Facilities · Internship Prototype · July 2026

> **Prototype notice:** This is a working demo prototype. It demonstrates the full vendor coordination flow end-to-end with real Supabase Auth and a live Postgres database. It is **not production-ready** — Row Level Security and private document storage are required before any real deployment. See [Security notes](#security-notes) below.

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
4. Create the `appointment-documents` Storage bucket
5. Add demo storage policies
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

### Current state — demo prototype

| Area | Status |
|---|---|
| Authentication | Supabase Auth (email + password) — implemented |
| Route protection | App-level role checks — implemented |
| Row Level Security | **Not enabled** — all authenticated users can read/write all rows via the anon key |
| Document storage | Public bucket — any URL is accessible without authentication |
| Vendor data isolation | Enforced in app code only (not at DB layer) |

### Before any real pilot deployment

1. **Enable RLS on all tables** — vendors should only be able to read their own `appointment_requests` and `appointment_messages` rows. See SUPABASE_SETUP.md §10 for example policies.
2. **Private storage bucket** — disable public access; generate signed URLs server-side (Supabase Edge Function or backend API) for document downloads.
3. **Scope storage upload policies** to `auth.uid()` instead of anonymous.
4. **Email notifications** — trigger Supabase Edge Functions on status changes to notify vendor and manager.
5. **Real-time messages** — add Supabase Realtime subscription in MessageThread so new messages appear without refresh.
6. **Mobile layout** — current layout is optimized for desktop (1280px+); a responsive pass is needed for on-site staff tablet use.
7. **Audit log retention** — `status_updates` table captures transitions; consider adding a `created_by_user_id` column for full audit traceability.

---

## i18n

Language toggle is in Settings → Display or via the globe icon in the top bar. Switching to **繁體中文** translates all UI labels, navigation, status text, priority labels, and the Weekly Report CSV headers. Document content and user-entered text (vendor names, descriptions, messages) are not translated.

---

## Branch

Active development is on `supabase-auth-experiment`. Do not merge to `main` until RLS and private storage are in place.
