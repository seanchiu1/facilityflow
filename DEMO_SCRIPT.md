# FacilityFlow — Demo Script

**Duration:** ~2 minutes (tight walkthrough) or up to 10 minutes with Q&A pauses
**Audience:** Facilities management, engineering stakeholders
**Setup before starting:**
- `npm run dev` is running; open `http://localhost:5173` in a full-size browser (1280px+ recommended)
- At least one `staff_schedules` row exists for a future weekday (see SUPABASE_SETUP.md §9)
- A small PDF or image file is ready on your desktop to upload during the vendor booking step
- Language is set to English (default)

---

## Before you begin — quick checklist

- [ ] App loads and shows login screen
- [ ] Schedule slot exists for a future date
- [ ] Upload file is ready on desktop
- [ ] Browser zoom is at 100%

---

## Scene 1 — The problem (15 seconds)

> _"Qualcomm facilities coordinates dozens of vendor visits each week — HVAC contractors, elevator inspectors, fire safety crews. Today that means email chains, missed approvals, and lost documents. FacilityFlow gives every stakeholder — manager, on-site staff, and vendor — one shared interface."_

---

## Scene 2 — Manager login + dashboard (20 seconds)

1. On the login screen, enter **`manager@facilityflow.demo`** / **`FacilityFlow123!`** → click Sign In
2. The **Dashboard** loads with live stat cards: Pending Requests, Approved This Week, Completed, Cancelled/Delayed
3. Point out: **"Every number here is live from Supabase — refresh the page and they're still there."**
4. The notification bell (top right) — click it to show the pending count and today's scheduled visits

> _Talking point: The manager sees the full picture immediately on login._

---

## Scene 3 — Vendor submits a booking (30 seconds)

1. Click **Sign Out** (Settings → Demo, or sidebar user chip) → log in as **`vendor@facilityflow.demo`** / `FacilityFlow123!`
2. The vendor lands on **New Booking** — sidebar shows only: Dashboard, New Booking, My Bookings, Calendar
3. Point out: **"Vendors can't navigate to Requests, Schedule, or Weekly Report — even by typing the URL."**
4. Fill in the booking form:
   - Equipment: click **HVAC**
   - Date: pick the date of the schedule slot you created in advance
   - Available time slot appears — click to select it
   - Description: `Annual HVAC filter replacement`
5. In **Supporting Documents**, drag a file or click to upload a PDF/image
   - File appears with name and size; non-supported formats are rejected
6. Click **Submit Request** → success screen shows the **appointment code** (`APT-2026-XXXX`)
7. **"The vendor now has a stable reference code for this appointment."**

---

## Scene 4 — Manager approves and updates status (30 seconds)

1. Sign out → log back in as Manager
2. Click **Requests** — the new booking from HVAC vendor is at the top, status: Pending
3. Show search bar and status filters work
4. Click the row → **Appointment Detail** opens:
   - Appointment code and summary in the breadcrumb
   - Supporting document listed — click to open in a new tab
   - Message thread shows the vendor's context (if they sent one)
5. In the status dropdown, click **Approve** → status badge updates to Approved
6. Then update again: **Mark Scheduled** → **Start Work** (In Progress) → for demo speed, jump to **Mark Finished**
7. Each transition appears in the **Status Timeline** panel on the right
8. **"Every status change is recorded with who made it and when — persists across page refreshes."**

---

## Scene 5 — Calendar and dashboard (10 seconds)

1. Click **Calendar** — the appointment appears on the correct date
2. Click back to **Dashboard** — completed job count has incremented
3. **"Live — no manual refresh needed."**

---

## Scene 6 — Weekly Report exports (25 seconds)

1. Click **Weekly Report** (manager sidebar)
2. Navigate to the current week — stat cards show the completed job; completion rate bar updates
3. Scroll down: By Equipment shows HVAC, Staff Summary shows hours logged, Vendor Visit Log shows the appointment code and vendor name
4. Click **Copy Summary** → green checkmark → paste into Slack/email to show plain-text output
5. Click **Export CSV** → file downloads as `facilityflow-weekly-report-YYYY-MM-DD-to-YYYY-MM-DD.csv`
   - Open in Excel/Numbers: BOM-prefixed so Chinese characters display correctly
   - 11 columns: Appointment Code, Vendor, Contact, Equipment, Date, Start Time, End Time, Staff, Priority, Status, Description
6. Click **Export PDF** → browser print dialog opens with sidebar and controls hidden
   - **"The viewer can choose Save as PDF — no third-party library dependency."**

---

## Scene 7 — Bilingual UI (15 seconds)

1. Click **Settings** → **Display** → click **繁體中文**
2. The entire UI switches: navigation, status labels, priority labels, button text — all in Traditional Chinese
3. Navigate back to **Weekly Report** → click **匯出 CSV**
4. Downloaded file has `-zh` suffix; open it — headers read `預約編號`, `廠商`, `狀態`, etc.
5. Switch back to English
6. **"Language-aware export — not just a UI change."**

---

## Scene 8 — What would be needed for a real pilot (15 seconds)

> _"This prototype demonstrates the full workflow on a live database with real authentication. Three things are needed before a real pilot:"_
>
> 1. **Row Level Security** — so vendors can only see their own rows in the database, not other companies' appointments
> 2. **Private document storage** — documents are currently in a public bucket; a real deployment needs signed URLs so only authorized users can download files
> 3. **Email notifications** — Supabase Edge Functions to notify managers on new requests and vendors on status changes
>
> _"Everything else — the booking flow, lifecycle, messages, weekly reporting — is production-quality logic that transfers directly."_

---

## Key talking points

- **All data is live** — every stat card, calendar event, and message is read from Supabase; refresh the page and nothing is lost
- **Role isolation is enforced at two layers** — React Router redirects unauthorized URL attempts; Appointment Detail has an ownership gate that shows an "Unauthorized" screen if a vendor tries to view another company's appointment
- **Appointment codes are stable** — `APT-2026-0001` format, generated by a Postgres trigger on insert; filtering and sorting never change the code
- **Status history survives refreshes** — every transition is written to `status_updates`; the timeline in Appointment Detail is built from real DB rows, not session state
- **The CSV export respects the UI language** — switch to Chinese, export, get Chinese headers and Chinese status labels; switch to English, get English — same file format, different content
- **No demo data is hardcoded** — you can add new schedule slots, submit new bookings, and approve them in real time during the demo

---

## If something goes wrong

| Problem | Quick fix |
|---|---|
| Login fails | Confirm user exists in Supabase Dashboard → Authentication → Users and has a matching `profiles` row |
| Booking form shows "No slots available" | Create a `staff_schedules` row for the selected date + equipment; see SUPABASE_SETUP.md §9 |
| File upload warning on success screen | `appointment-documents` bucket or demo policies may not be set up — the appointment row was still created; show it in Requests |
| Appointment code shows as `RPT-001` | Run `supabase_appointment_code_migration.sql` in the Supabase SQL Editor to backfill codes and add the auto-assign trigger |
| Messages don't appear after refresh | Check that `appointment_messages` table exists and the Supabase connection is live |
| Weekly Report is empty for the current week | No `appointment_requests` rows have `requested_date` in this week's Monday–Sunday range; navigate to the week containing your demo bookings |
| Calendar is empty | Appointments need status `Approved` or later; the calendar filter excludes `Pending` |
| CSV opens with garbled Chinese | Open the file in Excel using Data → From Text/CSV with UTF-8 encoding; the BOM prefix handles this automatically in most modern Excel versions |
