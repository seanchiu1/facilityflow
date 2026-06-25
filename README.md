# FacilityFlow

**Enterprise Facilities Vendor Coordination Platform**
Built by Qualcomm Facilities · Internship Prototype, June 2026

---

## What it does

FacilityFlow streamlines how facilities teams coordinate external vendor appointments. Instead of tracking vendor visits over email and spreadsheets, facilities managers publish weekly schedule slots, vendors book directly into available windows, and the whole lifecycle — approval, status updates, document uploads, and internal messaging — flows through a single interface. The platform supports three roles: **Facilities Manager** (full control), **On-site Staff** (status updates), and **External Vendor** (submit and track their own requests).

---

## Problem it solves

Qualcomm facilities teams manage dozens of vendor visits each week across elevator, HVAC, chiller, AED, UPS, electrical, and fire safety equipment. Historically this meant:

- Vendors emailed requests with no visibility into available time windows
- Managers manually routed approvals through inbox threads
- Status updates (delayed, in progress, finished) were communicated via phone or chat
- Supporting documents (safety certs, work orders) were attached to emails and lost
- No weekly summary of what was completed, in progress, or cancelled

FacilityFlow replaces all of this with role-gated dashboards, a real-time booking grid, and a structured message thread per appointment.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| Icons | Lucide React |
| Backend / DB | Supabase (Postgres) |
| File Storage | Supabase Storage |
| Auth | Demo role selector (Supabase Auth planned) |
| i18n | Custom context — English + Traditional Chinese |

---

## Features

- **Role-based navigation** — each role sees only their relevant pages
- **Vendor Booking** — pick equipment category, select real schedule slot, attach supporting documents
- **Supporting Document Upload** — drag-and-drop or click; PDF/JPG/PNG, up to 10 MB each, stored in Supabase Storage
- **My Bookings** — vendor's personal view of all their own requests, click-through to detail
- **Appointment Detail** — full lifecycle view: summary, documents, messages, status controls, vendor info
- **Appointment Messages** — threaded conversation per appointment; manager, staff, and vendor all have voice
- **Requests** — manager/staff view of all appointment requests with search, filter, and inline status actions
- **Schedule Management** — manager creates weekly staff slots (date, time, equipment, capacity) that vendors can book into
- **Calendar** — monthly/weekly view of all scheduled appointments
- **Dashboard** — live stat cards (pending, approved, completed, cancelled) and upcoming visits
- **Weekly Report** — per-week summary with equipment breakdown, staff hours, vendor log, and copy-to-clipboard export
- **Settings** — language toggle (EN/ZH-TW), profile display, Demo Reset button
- **Route protection** — each role is locked to their allowed URL prefixes; unauthorized routes redirect silently

---

## Core workflow

```
Manager creates a schedule slot (Schedule Management)
    ↓
Vendor submits a booking for that slot (New Booking)
    ↓
Appointment row created in appointment_requests (status: Pending)
    ↓
Manager sees it in Requests → Approves (status: Approved)
    ↓
Staff marks it In Progress on the day of the visit
    ↓
Staff marks it Finished
    ↓
Weekly Report reflects completion rate
    ↓
Vendor can message at any step; manager/staff reply in same thread
```

---

## How to run locally

```bash
# 1. Clone / open the project
cd Qualcomm

# 2. Install dependencies
npm install

# 3. Add environment variables (see below)
cp .env.example .env.local   # or create .env.local manually

# 4. Start the dev server
npm run dev
# → http://localhost:5173

# 5. Build for production
npm run build
npm run preview
```

---

## Environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

Both values are in **Supabase Dashboard → Project Settings → API**:
- `VITE_SUPABASE_URL` → "Project URL"
- `VITE_SUPABASE_PUBLISHABLE_KEY` → "Project API Keys → anon / public"

---

## Supabase setup

See **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** for the full SQL and storage configuration.

Tables required:
- `appointment_requests` — core appointment data
- `staff_schedules` — schedule slots managers publish
- `appointment_messages` — per-appointment message threads
- `appointment_documents` — metadata for uploaded files

Storage: one public bucket named `appointment-documents`.

---

## Demo roles

This prototype uses a **demo role selector** on the login screen — no password required. Three pre-configured profiles are available:

| Role | Name | Access |
|---|---|---|
| Facilities Manager | Manager Liu | All pages including Schedule, Requests, Weekly Report |
| On-site Staff | Chen Wei-Ming | Dashboard, Requests, Calendar, Appointment Detail |
| External Vendor | David Lin | New Booking, My Bookings, own Appointment Detail, Calendar |

**Switch Role** (sidebar bottom) / **Reset & Return to Login** (Settings → Demo) both return to the role selector. No Supabase data is deleted on reset — only the browser localStorage session is cleared.

> The vendor profile identity (company name + contact name) is stored in localStorage under `facilityflow_vendor_profile` when a vendor submits their first booking. My Bookings and the Appointment Detail ownership gate both read from this key.

---

## i18n

The language toggle in Settings → Display switches between English and Traditional Chinese. All UI labels, navigation, and status text are translated. Document and message content is not translated (user-entered).

---

## Current limitations / future improvements

See **[Production TODO](#production-todo)** below for the full list.

Short version: this is a working prototype with demo auth. It demonstrates the full vendor coordination flow end-to-end but should not be deployed to production without adding real authentication and Row Level Security.

---

## Production TODO

- **Real authentication** — Replace demo role selector with Supabase Auth (email + password or SSO). Vendors should not be able to switch to Manager role.
- **Row Level Security (RLS)** — Add Postgres RLS policies so vendors can only read their own rows in `appointment_requests` and `appointment_messages`. Currently all data is open to anyone with the anon key.
- **Private document storage** — Move `appointment-documents` to a private bucket. Generate signed URLs server-side for document access rather than using public URLs.
- **Stable appointment IDs** — Add a human-readable `display_id` column (e.g., `APT-2026-0042`) generated server-side so IDs are stable across paginated views.
- **Audit log** — Add an `appointment_status_history` table tracking who changed status and when (currently the timeline is session-local only).
- **Email notifications** — Trigger Supabase Edge Functions on `appointment_requests` insert/update to email the relevant manager and vendor.
- **Real-time messages** — Use Supabase Realtime subscriptions in MessageThread so new messages appear without refresh.
- **PDF/CSV export** — Wire up the Weekly Report export buttons to generate real files (currently visual-only).
- **Vendor company accounts** — Associate a vendor profile with a persistent account rather than localStorage identity.
- **Mobile layout** — The current layout is optimized for desktop (1280px+). A responsive mobile pass is needed for on-site staff tablet use.
