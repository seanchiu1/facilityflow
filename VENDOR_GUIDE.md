# FacilityFlow — Vendor Guide

**Audience:** vendor company contacts participating in the FacilityFlow pilot.
**Scope:** everything a vendor account can do — and a clear list of what it deliberately cannot see.

---

## Login

1. You'll be given a login URL and a temporary password directly by the pilot admin — not a public sign-up page. There is no self-service account creation.
2. Go to the login URL, enter your email and password, and sign in.
3. If you forget your password later, use **Forgot password** on the login screen — this sends a reset link to your email via the app's own authentication provider (self-service, no need to contact the admin for a routine reset).
4. After logging in, you land on **New Booking** — vendor accounts don't see the manager/admin dashboard.
5. The interface is available in English and Traditional Chinese — switch anytime from the language toggle (top right of any page).

## Create a booking

1. From **New Booking** (also reachable anytime from the sidebar), select an **Equipment Type** (HVAC, Elevator, Chiller, AED, UPS, Electrical, Fire Safety, Other).
2. Pick a date — available time slots for that equipment type on that date appear automatically; click one to select it. If nothing appears, that combination has no open capacity on that date — try a different date or equipment type.
3. Add a short **Description** of the work.
4. **Supporting Documents** — optionally attach a file (PDF or image). Unsupported formats are rejected inline before you submit, not after.
5. Click **Submit Request**. You'll get a confirmation screen with an **appointment code** (e.g. `APT-2026-0001`) — this is the reference number for that request going forward.
6. Your new request starts as **Pending** until a manager reviews it.

## View own bookings

1. Go to **My Bookings** in the sidebar to see every request you've submitted, with its current status.
2. Click any row to open its **Appointment Detail** page — this shows full status history, the assigned internal point-of-contact, target completion date (once set), and a **message thread** with the manager/staff handling your job. Use that thread for job-specific questions instead of a separate email.
3. If a manager sends your request back with **Need More Info**, check the message thread for what's needed, then follow up there.
4. You (or the assigned internal staff) can update **Work Progress %** directly from this page once your job is In Progress — you don't need full edit access to the rest of the record to do that.
5. **Calendar** in the sidebar shows your own appointments by date.

## Open Vendor Projects

1. If a manager has added your company to a **Project**, a **Vendor Projects** item appears in your sidebar — click it.
2. You'll see only projects your company has actually been added to. If you're not on any project yet, this page is empty — that's expected, not a bug, until a manager adds you.
3. Open a project to see: **My Tasks** (assigned to you), **Documents** (only ones shared with you specifically), and a **Comments** thread (shared between you and the internal team on that project).

## Update vendor tasks

1. In a project's **My Tasks** section, each task assigned to you has a **status dropdown** (e.g. To Do → In Progress → Done).
2. Change the status directly from the dropdown — this is the only field you can edit on a task; the title/description are set by the manager who created it.
3. The internal project team gets a notification when you change a task's status.

## Upload shared documents

1. In a project's **Documents** section, use the upload control to attach a file.
2. Anything you upload here is automatically shared with the internal project team — there's no separate "keep private" option on the vendor side (internal-only documents are something only internal roles can create).
3. The internal team gets a notification when you upload a document.

## Reply in shared thread

1. Each project's **Comments** section (on your Vendor Projects view) is a real conversation thread shared with the internal team on that project.
2. Post a message the same way you would in the appointment message thread — it's visible to internal project members and creates a notification for them.
3. This thread is scoped to your company only — even if another vendor is also on the same project, you never see their messages and they never see yours (see below).

## What vendors cannot see

This isn't a UI convenience — it's enforced by the database itself (row-level security), so it holds even if someone tries to guess a URL or inspect network requests:

- **Other vendors' bookings, projects, tasks, documents, or comments** — a vendor account can never query another company's data, even on a project you're both members of. Each vendor's shared thread and shared documents are private between that vendor and the internal team.
- **Internal-only project content** — the internal **Tasks** card, internal **Comments**, and the **Activity** timeline on a project never appear on the vendor side, even for projects you're a member of.
- **The internal navigation** — Requests, Schedule, Weekly Report, Duty Roster, Admin, Sites, Data Audit are not in a vendor's sidebar, and typing those URLs directly redirects you back to your own home screen rather than showing the page.
- **Other appointments that aren't yours** — My Bookings and appointment detail pages only ever show requests your company submitted.
- **Any admin function** — creating/editing users, managing sites, or the data-audit tool.

If something looks like it's missing that you expect to see, it's most likely a permissions/membership issue (e.g., not yet added to a project) — ask your pilot admin or manager contact rather than assuming it's a bug, though feel free to report it either way so it can be checked.
