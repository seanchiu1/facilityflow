# FacilityFlow — Demo Script

**Duration:** 3–5 minutes (timed flow below). Setup and troubleshooting sections are reference material, not part of the timed demo.
**Audience:** anyone deciding whether to approve/join the pilot — facilities leadership, IT/security reviewers, prospective vendor contacts.

This is deliberately short. It hits four things: the manager side, the vendor side, the vendor-isolation guarantee (the thing security reviewers care about most), and the notification/email story. For a full feature tour instead of a pitch-length demo, walk through [MANAGER_GUIDE.md](MANAGER_GUIDE.md) and [VENDOR_GUIDE.md](VENDOR_GUIDE.md) live instead.

---

## Setup before starting

- Create the demo accounts (`SUPABASE_SETUP.md` §0) — `admin@`, `manager@`, `staff@`, `vendor@`, `vendor2@facilityflow.demo`, all password `FacilityFlow123!`. **These are demo-only credentials — never reused for real pilot users**, see [PILOT_GUIDE.md § Known limitations](PILOT_GUIDE.md#known-limitations).
- Run `supabase_demo_seed.sql`, then `supabase_demo_seed_projects.sql`, in Supabase Dashboard → SQL Editor.
- `npm run dev` running, or use the deployed Vercel URL; open in a full-size browser (1280px+), language set to English, zoom at 100%.

**Quick checklist:**
- [ ] All five demo accounts exist
- [ ] Both seed scripts have run
- [ ] App loads to the login screen with no console error

---

## The demo (3–5 minutes)

### 1. The problem (15 seconds)

> _"Qualcomm facilities coordinates dozens of vendor visits a week — HVAC, elevator, fire safety — today mostly by email. FacilityFlow gives every stakeholder one shared, live system instead: real authentication, real database, real row-level security enforcing who sees what."_

### 2. Manager side (60 seconds)

1. Log in as **`manager@facilityflow.demo`** — Dashboard loads with live stat cards (Pending, Approved This Week, Completed This Week, Cancelled/Delayed) and a Recent Requests table.
2. Click **Requests** → open the seeded **Pending** HVAC request → click **Approve**, then step it to **Scheduled**.
3. Open **Projects** → **Building A Elevator Modernization** — point out internal Tasks, the Vendors card, Vendor Tasks, Documents, and Comments/Activity in one place.

> _"Nothing here is mocked — every card and row is a live Supabase query, and approving/scheduling a job is a real database write with a real audit trail."_

### 3. Vendor side (45 seconds)

1. Sign out → log in as **`vendor@facilityflow.demo`** (Taiwan Elevator Services).
2. Sidebar shows only Dashboard, New Booking, My Bookings, Calendar, Vendor Projects — **"a vendor can't reach Requests, Schedule, or Admin, even by typing the URL."**
3. Submit a quick booking: Equipment **HVAC** → pick the seeded slot → Description → **Submit Request** → confirmation shows the appointment code.
4. Click **Vendor Projects** → open **Building A Elevator Modernization** → show **My Tasks** (status-only dropdown) and the shared comment thread.

### 4. Vendor isolation story (60 seconds)

1. Still as `vendor@`, change **"Submit control system spec sheet"** to **Done**, and post a comment: *"Spec sheet uploaded, ready for review."*
2. Sign out → log in as **`vendor2@facilityflow.demo`** (Formosa Fire Safety Co.) → click **Vendor Projects**.
3. Only **Data Center Fire Safety Upgrade** appears — no trace of vendor 1's project, tasks, or conversation.

> _"Same platform, same feature, and vendor 2 has never seen vendor 1's project, task, or comment — not because the UI hides a menu, but because the database query returns zero rows for anything that isn't theirs. Two vendor companies in this pilot will never see each other's data — that's a Postgres row-level security guarantee, not an app-layer filter that could have a gap in it."_

### 5. Notification / email story (45 seconds)

1. Sign out → log back in as **Manager** → click the **notification bell**.
2. Point out the sections: **Overdue Alert** (red), **Starting Soon** (amber), **Project Updates** — including the status change and comment just posted by vendor 1.
3. Click the comment notification → it opens the project directly, not a generic inbox.
4. **"That's the in-app side, live. On top of it, a scheduled job sends a daily email digest of overdue and starting-soon items — go to Settings → Notifications and point at Email Diagnostics to show it's actually delivering, not just configured."**

### 6. Close (15 seconds)

> _"Role isolation is enforced at three layers — routing, an ownership check on each record, and Postgres RLS underneath both. Documents live in a private storage bucket behind signed URLs, not public links. What's still ahead before a broader rollout: SSO, a formal IT security review, and a mobile-responsive layout — see PILOT_GUIDE.md for the full, honest list of what this pilot does and doesn't cover."_

---

## If something goes wrong

| Problem | Quick fix |
|---|---|
| Login fails | Confirm the user exists in Supabase Dashboard → Authentication → Users and has a matching `profiles` row with `is_active = true` |
| Booking form shows no available slots | Re-run `supabase_demo_seed.sql`, or add a `staff_schedules` row manually for that date/equipment |
| Bell shows no Overdue/Starting Soon items | Seeded dates are relative to `now()` at seed time — re-run `supabase_demo_seed.sql` shortly before demoing |
| Vendor Projects page is empty | Confirm both seed scripts ran, and that all five demo accounts existed before `supabase_demo_seed_projects.sql` ran (it inserts nothing if any are missing) |
| Vendor sees the wrong project, or both | Check `project_vendor_members` — seed puts `vendor@` only on the elevator project, `vendor2@` only on fire-safety; manual testing can change this |
| Route refresh shows a 404 | `vercel.json`'s SPA rewrite should already cover this in production — confirm it's deployed, not missing |
| Re-running a seed script creates duplicates | Run the cleanup block at the bottom of that seed script first |

For the full 14-scene deep-dive version of this walkthrough (Weekly Report exports, bilingual UI, duty roster, maintenance report gate, security talking points in detail), see git history — this file was intentionally shortened to match the pilot's 3–5 minute pitch format.
