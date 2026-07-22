# FacilityFlow — Demo Script

**Duration:** ~4 minutes (tight walkthrough), ~7 minutes including Scenes 12–14 (Project/Vendor Collaboration), or up to 12 minutes with Q&A pauses
**Audience:** Facilities management, engineering stakeholders
**Setup before starting:**
- Create all **five** demo accounts (SUPABASE_SETUP.md §0) — including `admin@facilityflow.demo` and `vendor2@facilityflow.demo`, both new since the Vendor Project Access work. Scenes 12–14 don't work with only the original three accounts.
- Run `supabase_demo_seed.sql` in Supabase Dashboard → SQL Editor. This seeds a Pending, a Scheduled-starting-soon, an In Progress with a maintenance report pending review, an In Progress with an approved report, an overdue appointment with a message thread, a Finished job, a Cancelled and a Delayed job, plus a duty roster assignment and two bookable schedule slots.
- Run `supabase_demo_seed_projects.sql` next. This seeds two sites, two projects (one per vendor, deliberately different vendors — this is what makes Scene 13's isolation demo possible), internal + vendor tasks, linked appointments, internal + shared comment threads, and a handful of unread notifications.
- Upload one small PDF or image to the "Fire suppression system... 65%" appointment via its **+ Add Document** button — this gives the Supporting Documents demo beat a real, clickable file instead of a placeholder (see seed script header comment for why this is a manual step). Same reasoning applies to Scene 12's project documents — no project document is pre-seeded either.
- `npm run dev` is running; open `http://localhost:5173` in a full-size browser (1280px+ recommended)
- Language is set to English (default)

---

## Before you begin — quick checklist

- [ ] All five demo accounts exist, including `admin@` and `vendor2@`
- [ ] `supabase_demo_seed.sql` has been run
- [ ] `supabase_demo_seed_projects.sql` has been run
- [ ] One real document uploaded to the seeded 65%-progress appointment
- [ ] App loads and shows login screen
- [ ] Browser zoom is at 100%

---

## Scene 1 — The problem (15 seconds)

> _"Qualcomm facilities coordinates dozens of vendor visits each week — HVAC contractors, elevator inspectors, fire safety crews. Today that means email chains, missed approvals, and lost documents. FacilityFlow gives every stakeholder — manager, on-site staff, and vendor — one shared interface, backed by a real database with real authentication and row-level security."_

---

## Scene 2 — Manager login + dashboard (25 seconds)

1. Log in as **`manager@facilityflow.demo`** / **`FacilityFlow123!`**
2. The **Dashboard** loads with live stat cards: Pending, Approved This Week, Completed This Week, Cancelled/Delayed
3. Point out the **Recent Requests** table — each row shows a compact progress bar and an **Overdue** badge where relevant
4. Click the **notification bell** (top right) — it shows three sections: **Overdue Alert** (red), **Starting Soon** (amber), then general items. Point at the seeded overdue chiller job and the HVAC job starting within the hour.

> _Talking point: "Nothing here is mocked — every number, badge, and notification is a live query against Supabase."_

---

## Scene 3 — Vendor submits a booking (30 seconds)

1. Sign out (sidebar → Logout) → log in as **`vendor@facilityflow.demo`** / `FacilityFlow123!`
2. The vendor lands on **New Booking** — sidebar shows only: Dashboard, New Booking, My Bookings, Calendar
3. Point out: **"Vendors can't navigate to Requests, Schedule, Weekly Report, or Duty Roster — even by typing the URL."**
4. Fill in the booking form: Equipment **HVAC** → pick the seeded slot's date → time slot appears, click to select it → Description: `Annual HVAC filter replacement`
5. In **Supporting Documents**, drag a file or click to upload a PDF/image — non-supported formats are rejected inline
6. Click **Submit Request** → success screen shows the **appointment code** (`APT-2026-XXXX`)

---

## Scene 4 — Manager approves, schedules, and messages (25 seconds)

1. Sign out → log back in as Manager → click **Requests**
2. The new HVAC booking is at the top, status **Pending** — click **Approve**, then reopen the row and step it to **Scheduled**
3. Open the row → **Appointment Detail** — point out the message thread and mention a vendor could message here with questions

---

## Scene 5 — Maintenance report approval gate (30 seconds)

1. From **Requests**, open the seeded **"AED battery + pad replacement... awaiting QC review"** appointment (In Progress, 80%)
2. Scroll to **Supporting Documents** — the maintenance report shows a **Pending Review** badge with **Approve Report** / **Reject Report** buttons
3. Try the **Update Status** row — **Finished** is disabled with a tooltip: *"Upload and approve a Maintenance Report before closing this work order."*
4. Click **Approve Report** → badge flips to **Approved** → **Finished** becomes clickable
5. **"This gate is enforced twice — once in the UI, and again server-side if a stale screen tries to skip it."**

---

## Scene 6 — Target dates, overdue alert, and progress % (30 seconds)

1. Open the seeded **"Chiller compressor replacement"** appointment — its **Target Completion Date** shows a red **Overdue** badge, matching the bell notification from Scene 2
2. Click **Update dates** to show Start Date / Target Completion Date / Assigned POC are editable by internal roles
3. Scroll to **Work Progress** — shows a live percentage and bar; update the number and click **Update Progress** to show it saves immediately (vendors can update this on their own appointments too, without full edit access to the rest of the record)

---

## Scene 7 — Duty Roster (20 seconds)

1. Click **Duty Roster** in the sidebar (Manager/Admin/Staff only — not shown for Vendor)
2. The monthly grid shows today's seeded on-call assignment; click a day to open the detail/edit modal
3. **"Staff see this as read-only; Manager and Admin can add, edit, or remove assignments. Print Roster produces a clean printable page."**

---

## Scene 8 — Calendar and dashboard (10 seconds)

1. Click **Calendar** — appointments appear on their dates; overdue ones show a small warning marker
2. Click back to **Dashboard** — stat cards reflect the changes made this session, live

---

## Scene 9 — Weekly Report exports (25 seconds)

1. Click **Weekly Report** — stat cards, By Equipment, Staff Summary, and Vendor Visit Log all populate from live data, including Start Date / Target Completion Date / Progress % columns
2. Click **Export CSV** → downloads with a UTF-8 BOM so Chinese characters render correctly in Excel
3. Click **Export PDF** → browser print dialog opens with sidebar and controls hidden — **"No third-party PDF library dependency."**

---

## Scene 10 — Bilingual UI (15 seconds)

1. Click **Settings** → **Display** → click **繁體中文**
2. The entire UI switches: navigation, statuses, badges, form labels, error messages — all in Traditional Chinese
3. Navigate to **Weekly Report** → **匯出 CSV** → headers read `預約編號`, `廠商`, `狀態`, etc.
4. Switch back to English

---

## Scene 11 — Security & role separation (15 seconds)

> _"Three things worth knowing about how this is secured, not just designed to look secure:"_
>
> 1. **Row-Level Security is live** on every table — a vendor's Supabase session literally cannot query another company's appointment rows, even by editing the network request. This is enforced by Postgres, not by the React app.
> 2. **Documents are in a private Storage bucket** — files are served through short-lived signed URLs, not public links.
> 3. **Account lifecycle is real** — Admins can deactivate an account (`profiles.is_active = false`) and the user is blocked at next login; "Forgot password" is self-serve via Supabase Auth's reset-link flow, no admin action needed.
>
> _"What's still ahead for a production pilot: email/push notifications (today's reminders and overdue alerts are in-app only), an in-app admin page for creating accounts (today that's a one-time Supabase Dashboard step per user), and a true mobile layout."_

---

## Scene 12 — Project Collaboration: manager side (45 seconds)

1. Log in as **Manager** → click **Projects** in the sidebar
2. Two seeded projects appear: **Building A Elevator Modernization** (Active) and **Data Center Fire Safety Upgrade** (Planning)
3. Open **Building A Elevator Modernization** — point out the layout: Summary, internal **Tasks** (assigned to staff), a **Vendors** card (Taiwan Elevator Services), a **Vendor Tasks** card, **Documents**, **Linked Appointments** (the seeded elevator inspection is already linked), internal **Comments**, and the **Activity** timeline on the right
4. In the **Vendors** card, click Taiwan Elevator Services to expand its shared thread — a manager message and a vendor reply are already there, seeded
5. Point out the **Vendor Tasks** card — "Submit control system spec sheet" shows **In Progress**, assigned to the vendor, not a staff member

> _Talking point: "Vendors never join this page's internal roster — they're added to a completely separate table. A vendor can never see this Tasks card, this Activity feed, or any other vendor on the project — we'll prove that in the next scene, not just claim it."_

---

## Scene 13 — Vendor side + cross-vendor isolation (60 seconds)

1. Sign out → log in as **`vendor@facilityflow.demo`** (Taiwan Elevator Services)
2. Sidebar shows a new item: **Vendor Projects** — click it
3. Only **Building A Elevator Modernization** appears — this vendor has no idea "Data Center Fire Safety Upgrade" exists
4. Open it — show **My Tasks** (2 tasks, status-only dropdown), **Documents** (upload control, Internal/Shared-with-vendor split lives only on the internal side), and the shared **Comments** thread — the same conversation the manager saw in Scene 12
5. Change **"Submit control system spec sheet"** from **In Progress** to **Done** using the status dropdown
6. Post a new comment in the shared thread: *"Spec sheet uploaded, ready for review."*
7. Sign out → log in as **`vendor2@facilityflow.demo`** (Formosa Fire Safety Co.)
8. Click **Vendor Projects** — only **Data Center Fire Safety Upgrade** appears. **"Same platform, same feature, and Vendor 2 has never seen Vendor 1's project, tasks, or conversation — not because the UI hides it, but because the database query returns zero rows for anything that isn't theirs."**

---

## Scene 14 — Notifications round-trip (20 seconds)

1. Sign out → log back in as **Manager**
2. Click the notification **bell** — two new unread items from Scene 13: a status change and a new shared comment, both from Taiwan Elevator Services
3. Click the comment notification → it opens **Building A Elevator Modernization** directly, not a generic inbox
4. **"That notification was created by a database function that re-checked, server-side, that the vendor calling it actually belongs to this project before writing anything — the vendor's browser never got to choose who gets notified."**

---

## Key talking points

- **All data is live** — every stat card, calendar event, notification, and message is read from Supabase; refresh the page and nothing is lost
- **Role isolation is enforced at three layers** — React Router redirects unauthorized URL attempts, Appointment Detail has an ownership gate, and Postgres RLS blocks unauthorized rows at the database itself
- **The Finished status has a real approval gate** — a work order cannot close without an approved maintenance report, enforced in both the UI and the update call
- **Status history and progress persist** — every transition and progress update is a real database row, not session state
- **The CSV export respects the UI language** — switch to Chinese, export, get Chinese headers and labels
- **No demo data is hardcoded in the app** — everything shown comes from `supabase_demo_seed.sql`/`supabase_demo_seed_projects.sql` plus whatever you create live during the walkthrough
- **Vendor isolation is a database guarantee, not a UI filter** — Vendor 1 and Vendor 2 in Scene 13 are two real, independent Supabase sessions; there is no query path, RPC, or notification that ever returns the other vendor's data, project, or existence

---

## If something goes wrong

| Problem | Quick fix |
|---|---|
| Login fails | Confirm the user exists in Supabase Dashboard → Authentication → Users and has a matching `profiles` row with `is_active = true` |
| "Account Deactivated" screen appears unexpectedly | Check `profiles.is_active` for that user — set back to `true` |
| Booking form shows "No slots available for this category on this date" | Re-run the seed script, or create a `staff_schedules` row for that date + equipment manually (SUPABASE_SETUP.md §2) |
| Bell shows no Overdue/Starting Soon items | The seeded dates are relative to `current_date`/`now()` at seed time — re-run `supabase_demo_seed.sql` shortly before demoing |
| Document link shows "Link unavailable" | Expected for the two seeded maintenance-report rows unless you've also uploaded a real file for the *supporting document* beat — see the seed script's setup step above |
| Appointment code shows as `RPT-001` | Run `supabase_appointment_code_migration.sql` to backfill codes and add the auto-assign trigger |
| Weekly Report looks empty for "this week" | Seeded dates are relative to today; navigate to the week containing the seeded rows (mostly ±5 days from today) |
| Calendar is empty | Appointments need status `Approved` or later — the calendar filter excludes `Pending` |
| Re-running the seed script creates duplicates | Run the cleanup block at the bottom of `supabase_demo_seed.sql` (or `supabase_demo_seed_projects.sql`) first |
| Projects page is empty for Manager/Staff | Run `supabase_demo_seed_projects.sql` — confirm it completed without raising the "demo users not found" exception |
| Vendor Projects page is empty for `vendor@`/`vendor2@` | Confirm `admin@facilityflow.demo` and `vendor2@facilityflow.demo` exist (SUPABASE_SETUP.md §0) before running `supabase_demo_seed_projects.sql` — it raises and inserts nothing if any of the five demo accounts are missing |
| Vendor sees the wrong project, or both projects | Re-check `project_vendor_members` — the seed deliberately puts `vendor@` only on the elevator project and `vendor2@` only on the fire-safety project; a manually-added vendor membership from testing can change this |
| Bell shows no vendor-collaboration notifications | Confirm `supabase_demo_seed_projects.sql` ran §10 (its final insert block) — or trigger one live via Scene 13's status change / comment |
