# FacilityFlow — Pilot Guide

**Audience:** anyone participating in or sponsoring the FacilityFlow pilot — facilities manager, on-site staff, vendors, and IT/security reviewers.
**Purpose:** explain what the pilot is, who it's for, what it does and doesn't cover, how to get started, and what to expect from support during the trial.

For deeper detail, see the role-specific guides: [ADMIN_GUIDE.md](ADMIN_GUIDE.md), [MANAGER_GUIDE.md](MANAGER_GUIDE.md), [VENDOR_GUIDE.md](VENDOR_GUIDE.md). For the pitch/business case, see [PILOT_PROPOSAL.md](PILOT_PROPOSAL.md). For a short walkthrough, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

---

## What FacilityFlow is

FacilityFlow is a web app that replaces email/spreadsheet coordination of vendor facility visits (HVAC, elevator, fire safety, electrical, etc.) with a single shared system: vendors submit visit requests online, managers approve and schedule them, staff track progress and duty coverage, and everyone sees the same live status — instead of a status living only in someone's inbox.

It's currently a **pilot**, not a company-wide production rollout. It's deployed and working end-to-end (booking, approval, scheduling, progress tracking, duty roster, weekly reporting, in-app + email notifications), but it has not gone through formal Qualcomm IT security review or SSO integration, and it's sized for a small, controlled group of real users.

---

## Pilot scope

**In scope for this pilot:**
- A small number of real vendor companies (recommend starting with 1–2) submitting real facility visit requests
- A small internal team (1 manager, 1–2 on-site staff, optionally 1 admin) using it to approve, schedule, and track those visits
- Real usage of: booking submission, approval/scheduling, progress updates, maintenance report upload/approval, duty roster, weekly reporting, in-app notifications, and daily email reminders/overdue alerts

**Out of scope for this pilot:**
- Company-wide or unrestricted vendor sign-up — every pilot account is created manually by an admin (see below)
- Single sign-on (Qualcomm SSO/SAML) — pilot users log in with an email + password issued directly by the app's authentication provider
- Mobile phone use — the app is desktop/laptop-browser only right now (see [Known limitations](#known-limitations))
- Any workflow not already built: no purchase orders, no invoicing/payment, no asset/inventory management, no contractor pre-qualification or insurance-document tracking

---

## Who should use it

| Role | Who this is | What they do in the pilot |
|---|---|---|
| **Admin** | IT/facilities lead running the pilot | Creates accounts, assigns roles, manages sites, monitors the system — see [ADMIN_GUIDE.md](ADMIN_GUIDE.md) |
| **Manager** | Facilities manager | Approves/schedules requests, runs projects, adds vendors, assigns tasks — see [MANAGER_GUIDE.md](MANAGER_GUIDE.md) |
| **Staff (On-site)** | On-site facilities staff | Views/tracks requests assigned to them, covers duty roster, participates in project tasks |
| **Vendor** | Real vendor company contacts | Submits bookings, tracks their own visits, collaborates on shared project tasks/documents — see [VENDOR_GUIDE.md](VENDOR_GUIDE.md) |

A pilot should have at least one Admin, one Manager, and 1–2 real Vendor accounts to be meaningful. Staff accounts are optional for a first pass but recommended if duty roster coverage is part of what you want to test.

---

## Workflows included in this pilot

- **Vendor booking → approval → scheduling** — vendor submits a request (equipment type, date, time slot, description, optional file), manager approves/schedules it, or sends it back with "Need More Info"
- **Work tracking** — status progression (Pending → Approved → Scheduled → In Progress → 50% Finished → Finished, or Cancelled/Delayed), live progress %, target completion dates, assigned point-of-contact
- **Maintenance report gate** — a job can't be marked Finished until a maintenance report document has been uploaded and approved by an internal user
- **Message thread per appointment** — manager/staff and the vendor on that job can message each other in context
- **Duty roster** — monthly on-call assignment grid, printable
- **Weekly reporting** — stat cards, per-equipment breakdown, vendor visit log, CSV/PDF export
- **Project Collaboration (Lite), optional** — managers/staff can group appointments and other work under a "Project," assign internal tasks to staff and separate vendor tasks to vendor contacts, share documents (choosing internal-only vs. shared-with-a-specific-vendor), and run a comment thread visible to that vendor only. A pilot can run entirely on booking/approval/scheduling without ever using this — it's not a required step for a first pilot.
- **In-app notifications** — a notification bell surfaces overdue items, items starting soon, and project/task/comment activity relevant to the logged-in user
- **Daily email notifications** — a scheduled job sends reminder/overdue-alert emails once a day (see [Known limitations](#known-limitations) on cadence)
- **Bilingual UI** — English and Traditional Chinese, switchable at any time
- **Admin data tools** — user management, site management, and a data-audit view for finding appointments with missing site/POC assignment

## Workflows NOT included in this pilot

- No native mobile app — vendor-facing pages (login, booking, My Bookings, Vendor Projects, notifications) are usable in a phone's mobile browser as of this pass; see [MOBILE_PILOT_CHECKLIST.md](MOBILE_PILOT_CHECKLIST.md) for exactly what was checked and what wasn't
- No SSO — accounts are pilot-only, created and deactivated manually by an admin
- No self-service vendor sign-up — every vendor account is created by an admin ahead of time
- No purchase orders, invoicing, budget tracking, or contract/insurance document management
- No push notifications (only in-app bell + once-daily email)
- No native calendar sync (Outlook/Google Calendar) — the in-app Calendar view is separate

---

## Setup / onboarding steps

0. **If this project still has demo/test data in it (fictional accounts, seeded appointments), clean it up first.** See [REAL_VENDOR_PILOT_CHECKLIST.md](REAL_VENDOR_PILOT_CHECKLIST.md) — it covers removing demo data safely (with a read-only dry run first) and seeding a small real dataset. Steps 1–7 below assume that's already done, or that this is a genuinely fresh project.
1. **Admin creates the pilot's user accounts.** Each pilot participant (manager, staff, vendor contacts) needs an account created in Supabase Authentication plus a matching profile row — see [ADMIN_GUIDE.md § Create users](ADMIN_GUIDE.md#create-users). This is a manual, one-at-a-time step for now; there is no self-service sign-up.
2. **Admin sets up sites.** Add the physical site(s) involved in the pilot via Site Management — see [ADMIN_GUIDE.md § Manage sites](ADMIN_GUIDE.md#manage-sites).
3. **Send each pilot user their login URL and temporary credentials** directly (not email-broadcast — these are real, working credentials). Ask each user to log in once and confirm they land on the right home screen for their role.
4. **Manager reviews the Manager Guide**, in particular how to approve/schedule and how Projects work, before the first real vendor request comes in.
5. **Vendor contacts review the Vendor Guide** — specifically what they can and cannot see, since this is often the first question a real external vendor asks.
6. **Run one low-stakes real booking end-to-end** before treating the system as the primary channel — submit, approve, schedule, progress, finish — so everyone sees the full loop once with low pressure.
7. **Confirm email delivery** — have the admin check Settings → Email Diagnostics after the first day to confirm at least one notification shows `sent` (see [ADMIN_GUIDE.md § Monitor email notification logs](ADMIN_GUIDE.md#monitor-email-notification-logs)).

---

## Support expectations

- **This is a pilot, not a supported production service.** There is currently no dedicated on-call or support owner, no SLA, and no after-hours coverage.
- **Primary support channel:** direct contact with whoever is running the pilot (typically the admin/IT lead who set it up) — not a ticket queue.
- **Response time:** best-effort, not guaranteed. Treat this as "help me get unblocked," not "production incident."
- **Bugs and rough edges are expected.** This is a pilot specifically to surface them. Please report anything confusing, broken, or wrong rather than working around it silently — that feedback is the point of the pilot.
- **Password resets are self-service** via the "Forgot password" link on the login screen (Supabase Auth's email reset flow) — no admin action needed for that specific case.
- **Account problems** (wrong role, need deactivation, locked out some other way) go to the admin — see [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

---

## Known limitations

Be upfront about these with every pilot participant before they start:

- **No SSO yet.** Pilot accounts use email + password issued directly by the app, not Qualcomm's corporate identity system. Treat pilot credentials like any other third-party tool login — don't reuse a Qualcomm password.
- **No official Qualcomm IT security approval yet.** This is a controlled pilot precisely because that review hasn't happened. Don't use it for anything you wouldn't be comfortable explaining to IT/security after the fact.
- **Small, controlled pilot only** — not intended for broad or unmanaged rollout. Every account is created deliberately by an admin; there's no path for someone to sign themselves up.
- **Email uses a configured sender/domain** (via Resend) that has not been through Qualcomm's own email infrastructure/DKIM setup — pilot recipients should be told to expect mail from that sender and to check spam folders initially.
- **No vendor-to-vendor visibility, by design** — this is a security guarantee, not a limitation to work around, but worth stating plainly: two vendor companies in the pilot will never see each other's requests, projects, or data.
- **No production on-call/support owner yet** — see [Support expectations](#support-expectations) above.
- **Demo/seed accounts use weak, shared passwords and must never be used for real external pilot users.** The `@facilityflow.demo` accounts referenced in [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [SUPABASE_SETUP.md](SUPABASE_SETUP.md) are for internal demos only — every real pilot participant needs their own account with its own password, created per [ADMIN_GUIDE.md](ADMIN_GUIDE.md).
- **Mobile support is real but scoped** — vendor-facing pages (login, booking, My Bookings, Vendor Projects/Project Detail, notifications) work on a phone browser at 320px width and up, checked in [MOBILE_PILOT_CHECKLIST.md](MOBILE_PILOT_CHECKLIST.md). Manager pages got a lighter pass. No tablet-specific tuning, no native app, no offline support.
- **Email cadence is once daily**, not real-time — a same-day "starting in 1 hour" reminder can arrive up to ~24 hours late by email even though the in-app bell is live. Don't rely on email alone for time-sensitive alerts during the pilot.
