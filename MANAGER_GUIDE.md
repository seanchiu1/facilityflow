# FacilityFlow — Manager Guide

**Audience:** the pilot's facilities manager (Admin has all of this too, plus what's in [ADMIN_GUIDE.md](ADMIN_GUIDE.md)).
**Scope:** day-to-day use — approving and scheduling vendor requests, running projects, and staying on top of activity via notifications.

---

## Approve/schedule appointments

1. Go to **Requests** in the sidebar — every vendor booking submitted lands here, newest first, filterable by status/search.
2. A new booking starts as **Pending**. Open it (or use the row action) to:
   - **Approve** — accepts the request as-is
   - **Need More Info** — sends it back to the vendor with a note that something's missing or unclear, instead of an outright rejection
3. Once approved, step it forward through the lifecycle from the appointment's **Update Status** control: **Approved → Scheduled → In Progress → 50% Finished → Finished**, or mark it **Cancelled**/**Delayed** if that's what's actually happening.
4. **Finished is gated** — you cannot close a job out until a maintenance report document has been uploaded to it *and* approved (see Supporting Documents on the appointment detail page: **Approve Report** / **Reject Report** buttons appear once a report is uploaded). This is enforced both in the UI (the button is disabled with a tooltip) and again on the server side if a stale screen tries to skip it.
5. On the appointment detail page you can also set **Target Completion Date**, **Assigned POC** (point of contact), and read/reply in the **message thread** with the vendor for that specific job — keep job-specific back-and-forth there instead of side-channel email, so the history stays attached to the record.
6. **Work Progress %** updates live from either side — you or the vendor can update it without needing full edit access to the rest of the record.
7. Use **Duty Roster** to see who's on-call each day, and **Calendar** / **Weekly Report** for a broader view across all appointments (Weekly Report also exports to CSV/PDF, in whichever language the UI is currently set to).

## Open vendor booking availability

**Duty Roster and Schedule Management are two separate tools — only one of them controls what vendors can actually book.** This trips people up, so it's worth stating plainly:

- **Duty Roster** (sidebar) records who's on-call, one person per site per day. It's a staffing/coverage record only. Adding someone here does **not** open any booking slot — a vendor's New Booking screen will not show anything different afterward.
- **Schedule Management** (sidebar, admin/manager only) is what actually creates bookable time. Go there → pick a week → **Add Time Slot** → choose a real staff member (pulled live from Admin → Users, so the person must already have an active admin/manager/staff account), a date within that week, and a time window. Only *this* creates a slot a vendor can select on New Booking.
- If a vendor reports "No available time" for a date, the fix is always: go to **Schedule Management**, navigate to that week, and add a time slot on that date — not Duty Roster.
- A staff member must exist as an active account (**Admin → Users**, role admin/manager/staff) before they can be selected in Schedule Management's "Select a staff member" dropdown — it only lists real, active accounts, not free text.

**Staff are not equipment specialists — availability is date/time only, never equipment-specific.** Any staff member on a time slot can be booked by any vendor for any equipment type, and there's no limit on how many vendors can book the same slot. Concretely:

- The **Equipment** field on Schedule Management's Add Time Slot form is informational only (visible to you and vendors as a small note) — it does **not** restrict which vendors can book that slot. A slot you tag "HVAC" is just as bookable by a vendor selecting "Elevator" on their request.
- There is no "full" or capacity limit on a time slot. Multiple vendors — even many — can book the exact same staff member's time slot; the old "Max Vendors"/capacity control has been removed from the create-slot form because nothing in the app enforces it anymore.
- Vendors still choose an equipment type on their own booking request (so you still know what kind of work is being requested) — it just no longer filters which time slots they can see or pick.

## Manage projects

Projects group related work — multi-visit jobs, larger site upgrades — under one page instead of scattering it across separate one-off appointments.

1. Go to **Projects** → **New Project** (or open an existing one from the list).
2. A project page has: **Summary**, internal **Tasks** (assigned to staff), a **Vendors** card, a **Vendor Tasks** card, **Documents**, **Linked Appointments**, internal **Comments**, and an **Activity** timeline.
3. **Linked Appointments** — attach existing appointment records to the project so their status/progress shows in context here, without duplicating data.
4. Internal **Comments** and the **Activity** feed are visible only to internal roles (admin/manager/staff members of the project) — vendors never see this side of the page, even if they're a vendor on the same project (see [Add vendors](#add-vendors) below).

## Add vendors

1. On a project page, open the **Vendors** card → **Add Vendor** → pick the vendor contact from the directory (must already be a real vendor account created by an admin — see [ADMIN_GUIDE.md § Create users](ADMIN_GUIDE.md#create-users)).
2. Adding a vendor here does **not** give them access to your internal Tasks/Comments/Activity — it only makes the project appear on their separate **Vendor Projects** page, scoped to a shared subset (their own tasks, shared documents, and a shared comment thread — see [VENDOR_GUIDE.md](VENDOR_GUIDE.md)).
3. Each added vendor gets their own **expandable shared thread** inside the Vendors card — this is the same conversation the vendor sees on their side; use it for anything you want that specific vendor to see, and keep it separate from the internal Comments section.
4. Remove a vendor from the project the same way (Vendors card → remove) if they're no longer involved — this doesn't delete their past comments/documents, it just stops the project appearing on their Vendor Projects page going forward.

## Assign internal/vendor tasks

Two separate task lists live on a project page — don't confuse them:

- **Tasks card** (internal) — assign to any internal project member (staff/manager/admin). Use **+ Add Task**, pick an assignee, a title, and a status. The assignee gets an in-app notification.
- **Vendor Tasks card** — assign to a vendor added to the project (see above). Use **+ Add Vendor Task**. The vendor sees this on their Vendor Projects page and can update its status themselves (status-only — they can't edit the title/description); you'll get a notification when they do.

Keep internal follow-up work in Tasks, and anything you need a vendor to actually do or report back on in Vendor Tasks — a vendor can never see or be assigned an internal Task.

## Share docs/comments

1. On a project page, **Documents** → upload → choose **Visibility**: **Internal** (staff/managers/admins only) or **Shared with a vendor** (pick which vendor — only that vendor sees it, other vendors on the same project still see nothing).
2. The same internal/shared split applies to appointment-level documents on individual appointment detail pages.
3. For conversation, use internal **Comments** for anything staff-only, and each vendor's **shared thread** (inside the Vendors card) for anything you want that vendor to see and reply to. A vendor reply in their shared thread creates an in-app notification for internal project members.

## Use notifications

- The **bell icon** (top right, every page) shows: **Overdue Alert** (red, appointments past their target completion date), **Starting Soon** (amber, appointments beginning within the hour), **Project Updates** (task assignments, status changes, new comments, new documents, vendor activity), and general items (pending count, today's appointments, attention-needed statuses).
- Click any notification to jump straight to the relevant appointment or project — not a generic inbox.
- Project notifications can be marked read individually (hover → checkmark) or all at once (**Mark all read** in that section).
- The bell refreshes automatically on login/language switch and again every time you open it — there's no polling in between, so if you're expecting something and don't see it, click the bell again rather than waiting.
- Beyond the in-app bell, a **daily email** goes out for overdue/starting-soon items — see [ADMIN_GUIDE.md § Monitor email notification logs](ADMIN_GUIDE.md#monitor-email-notification-logs) if you want to confirm delivery is actually working.
