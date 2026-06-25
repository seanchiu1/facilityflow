# FacilityFlow — Demo Script

**Duration:** ~10–12 minutes
**Audience:** Facilities management, engineering stakeholders
**Setup before starting:** Open `http://localhost:5173` in a full-size browser window (1280px+ recommended). Language should be set to English.

---

## Before you begin

Confirm the following:
- `npm run dev` is running and the app loads
- At least one `staff_schedules` row exists for a future weekday (see SUPABASE_SETUP.md for sample data)
- Have a small PDF or image file ready on your desktop to upload

---

## Act 1 — Manager sets up the schedule

### Step 1 — Log in as Manager

1. On the role selector screen, click **Facilities Manager**
2. The app opens to the **Dashboard**
3. Point out the stat cards (Pending Requests, Approved This Week, Completed, Cancelled/Delayed) — these are live from Supabase

### Step 2 — Create a schedule slot

1. Click **Schedule** in the sidebar
2. The weekly grid shows staff coverage for the current week
3. Click **+ Add Shift** (top right)
4. Fill in the modal:
   - Staff: Chen Wei-Ming
   - Equipment: HVAC
   - Date: pick a weekday this week or next
   - Start: 09:00, End: 12:00
   - Capacity: 2
5. Click **Add Shift** — the slot appears in the grid immediately
6. Point out: capacity bar shows 0/2, staff coverage cards update

---

## Act 2 — Vendor submits a booking

### Step 3 — Switch to Vendor

1. Click **Switch Role** (bottom of sidebar)
2. Click **External Vendor** (David Lin)
3. The app redirects to **New Booking** (vendor's default landing page)
4. Point out: the sidebar only shows Dashboard, New Booking, My Bookings, Calendar — vendors cannot access Requests, Schedule, or Weekly Report

### Step 4 — Submit a booking

1. Fill in Vendor Information:
   - Vendor / Company Name: `Global HVAC Solutions`
   - Contact Name: `Alice Wang`
2. Under Equipment Category, click **HVAC**
3. Set the date to the same date you created the slot in Step 2
4. The "Available Time Slots" section loads the slot live from Supabase:
   - Shows `09:00–12:00 · Chen Wei-Ming · 0/2 vendors booked`
   - The green "Available" badge is visible
5. Select the slot (radio button)
6. The Request Summary sidebar on the right auto-fills with the slot details
7. Write a description: `Annual HVAC filter replacement and refrigerant top-up`

### Step 5 — Upload a supporting document

1. In the **Supporting Documents** section, click the drop zone (or drag a PDF/image onto it)
2. A file picker opens — select any PDF, JPG, or PNG from your machine
3. The selected file appears below the drop zone with its name and file size
4. Point out: a non-supported file type (e.g., .docx) would be rejected with a clear warning

### Step 6 — Submit

1. Click **Submit Request**
2. The button shows "Submitting…" while the appointment is inserted and the file is uploaded to Supabase Storage
3. The success screen appears with the booking summary
4. Note: the app has now stored `Global HVAC Solutions / Alice Wang` as the vendor profile in localStorage

---

## Act 3 — Vendor checks their bookings

### Step 7 — Open My Bookings

1. Click **My Bookings** in the sidebar
2. The identity chip shows `Global HVAC Solutions · Alice Wang`
3. The new booking appears in the table: equipment, date, time, staff, status (Pending)
4. Click the row → navigates to the **Appointment Detail** page

### Step 8 — Vendor sends a message

1. In the Appointment Detail page, scroll to the **Messages** section
2. Note: the vendor sees the appointment summary and documents but does NOT see the Status Update buttons or internal Notes field (those are manager/staff only)
3. Type a message: `Hi, our technician will need badge access to B1 mechanical room. Please confirm access arrangements.`
4. Press Enter to send — the message appears with a violet "Vendor" badge

---

## Act 4 — Manager reviews and acts

### Step 9 — Switch to Manager, open Requests

1. Click **Switch Role** → log in as **Facilities Manager**
2. Click **Requests** in the sidebar
3. The new request from `Global HVAC Solutions` appears at the top (status: Pending)
4. Point out the search bar, status filter dropdown — show filtering works

### Step 10 — Open Appointment Detail

1. Click the row to open **Appointment Detail**
2. The full detail view loads:
   - Summary: vendor, equipment, date, time, assigned staff
   - **Supporting Documents** section: the uploaded file is listed with its name and size — click to open it in a new tab (public Supabase Storage URL)
   - **Messages**: the vendor's message from Step 8 is visible with timestamp

### Step 11 — Manager replies and updates status

1. In Messages, type a reply: `Access confirmed. Please check in at the front desk by 8:45 AM.`
2. Press Enter — the manager's reply appears (amber badge, right-aligned)
3. Scroll up to the Status Update section
4. Click **Mark Scheduled** → the status badge in the header updates to "Scheduled"
5. The Status Timeline card on the right shows both entries (Pending → Scheduled)

---

## Act 5 — Calendar and reporting

### Step 12 — Check the Calendar

1. Click **Calendar** in the sidebar
2. The appointment now appears on the calendar on the correct date
3. Toggle between Weekly and Monthly view
4. Click the appointment event → navigates to Appointment Detail

### Step 13 — Check the Dashboard

1. Click **Dashboard**
2. The stat cards reflect the new appointment (Approved This Week ticks up after you approve in Step 11)
3. The "Upcoming Vendor Visits" section shows the scheduled appointment

### Step 14 — Mark as Finished and check Weekly Report

1. Navigate back to Appointment Detail (Requests → click the row)
2. Click through the status buttons to move the appointment to **Finished**
   - In Progress → 50% Finished → Finished (or jump directly to Finished for demo speed)
3. Click **Weekly Report** in the sidebar
4. Navigate to the current week using the prev/next arrows if needed
5. Show:
   - Total Visits counter ticked up
   - Completion Rate now shows the finished appointment
   - "By Equipment Category" shows HVAC with a count
   - "Staff Summary" shows Chen Wei-Ming's hours
   - "Vendor Visit Log" shows Global HVAC Solutions
6. Click **Copy Summary** → a plain-text summary is copied to clipboard

---

## Bonus — Settings and language toggle

1. Click **Settings** → **Display**
2. Click **繁體中文** — the entire UI (navigation, labels, status names) switches to Traditional Chinese
3. Switch back to English
4. Click **Demo** tab — show the Reset button and the production TODO note

---

## Key talking points during demo

- **All data is live** — every stat card, calendar event, and message is read from Supabase in real time; refresh the page and everything is still there
- **Role isolation is enforced** — vendors cannot browse to /requests or /schedule even by typing the URL; they're redirected silently
- **Vendor ownership** — a vendor can only open appointment detail pages for their own bookings; trying to access another vendor's appointment ID shows an "Unauthorized" screen
- **Document lifecycle** — the same file uploaded in Vendor Booking appears in Appointment Detail for all roles who can see that appointment
- **Non-destructive session reset** — the Demo Reset in Settings clears browser state only; no Supabase data is touched

---

## If something goes wrong during demo

| Problem | Quick fix |
|---|---|
| Booking form shows "No slots available" | Create a schedule slot in Schedule Management first (Act 1), or run the sample SQL from SUPABASE_SETUP.md |
| File upload shows warning on success screen | The `appointment-documents` bucket or demo policies may not be set up — the appointment was still created; show it in Requests |
| Messages don't appear after refresh | Check that `appointment_messages` table exists and the Supabase connection is live |
| Document section missing in Appointment Detail | `appointment_documents` table may not exist yet — run the SQL in SUPABASE_SETUP.md |
| Calendar is empty | Appointments need a `requested_date` value; check that the booking form submitted successfully |
