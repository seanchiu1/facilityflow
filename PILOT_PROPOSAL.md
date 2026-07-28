# FacilityFlow — Pilot Proposal

**Purpose:** the pitch and business case for running a small, controlled FacilityFlow pilot. For operational detail once approved, see [PILOT_GUIDE.md](PILOT_GUIDE.md).

---

## Problem

Vendor facility visits (HVAC, elevator, fire safety, electrical, and similar contractor work) are currently coordinated through email chains and spreadsheets. That means:

- Approvals and scheduling live in someone's inbox, not a shared system — status is only as current as the last reply
- Supporting documents (maintenance reports, inspection records) get attached to individual emails and are hard to find later
- There's no single place to see what's overdue, what's starting soon, or who's covering on-call duty
- Weekly/monthly reporting on vendor activity is manually assembled from scattered threads
- Nothing enforces that a job actually has an approved maintenance report before it's marked done — that's a manual, easy-to-skip check today

## Solution

FacilityFlow is a working web app — already built, deployed, and functioning end-to-end — that gives every stakeholder (facilities manager, on-site staff, vendor) one shared interface, backed by a real database with real authentication and row-level security (not a spreadsheet with extra steps):

- Vendors submit and track their own requests online
- Managers approve, schedule, and track work through to completion — with a hard gate preventing a job from closing without an approved maintenance report
- Everyone sees the same live status, overdue alerts, and duty roster coverage
- Weekly reporting exports directly from live data, in English or Traditional Chinese
- A "Project" mode lets a manager coordinate multi-step work — internal tasks, vendor tasks, shared documents, and a scoped conversation thread — with vendor companies kept fully isolated from each other and from internal-only content, enforced at the database level

This isn't a prototype pitch — it's a request to validate a system that already works, with a small number of real users and real (not seeded/demo) data, before deciding whether to invest in the steps needed for a broader rollout (SSO integration, formal IT security review, mobile support).

## Pilot scope

- **Duration:** 1–2 weeks (see suggested plan below)
- **Participants:** 1 admin (running the pilot), 1 facilities manager, 1–2 on-site staff (optional), 1–2 real vendor companies
- **Sites:** 1 site to start, expandable if the pilot goes well
- **Workflows exercised:** booking submission → approval/scheduling → progress tracking → maintenance report gate → completion; duty roster; weekly reporting; in-app + daily email notifications; Project Collaboration if there's multi-step work to coordinate during the window
- **Explicitly not in scope:** SSO, broad/self-service vendor sign-up, mobile use, any workflow outside what's listed in [PILOT_GUIDE.md § Workflows included](PILOT_GUIDE.md#workflows-included-in-this-pilot)

## Suggested 1–2 week pilot plan

**Days 1–2 — Setup**
- Admin creates accounts for all pilot participants (see [ADMIN_GUIDE.md](ADMIN_GUIDE.md))
- Admin sets up the pilot site(s)
- Everyone logs in once, confirms they land on the right screen for their role
- Manager and vendor contacts each read their guide ([MANAGER_GUIDE.md](MANAGER_GUIDE.md) / [VENDOR_GUIDE.md](VENDOR_GUIDE.md))

**Days 3–4 — First real cycle**
- Run one real, low-stakes booking end-to-end: vendor submits → manager approves/schedules → work happens → progress updates → maintenance report uploaded and approved → marked Finished
- Confirm the message thread, notification bell, and (next day) the daily email all worked as expected

**Days 5–10 (week 2, if running two weeks) — Real usage**
- Let the team route actual vendor visits through FacilityFlow instead of email, for the sites/vendors in scope
- If applicable, set up one Project to coordinate a multi-step piece of work and exercise vendor tasks/shared documents/shared comments
- Admin checks Email Diagnostics periodically to confirm delivery is holding up ([ADMIN_GUIDE.md § Monitor email notification logs](ADMIN_GUIDE.md#monitor-email-notification-logs))
- Collect friction points as they happen, not just at the end — see Success criteria

**Final day — Review**
- Walk through what worked, what didn't, and whether to extend/expand the pilot or pause for fixes
- Decide on next steps: formal IT review, SSO integration, broader rollout, or a second pilot iteration

## Success criteria

- At least one full real booking cycle (submit → approve → schedule → complete) run entirely inside FacilityFlow, with no fallback to email for that job
- The maintenance report gate is exercised at least once and understood by whoever hit it
- At least one real vendor confirms they could complete their side (submit, track, respond in-thread) without needing a walkthrough beyond [VENDOR_GUIDE.md](VENDOR_GUIDE.md)
- The manager reports the approval/scheduling flow is at least as fast as the email process it's replacing
- No vendor-isolation or access-control surprise (a vendor seeing something they shouldn't, or being unable to see their own data) — anything in this category should be treated as a stop-the-pilot issue, not a minor bug
- At least one daily email notification confirmed delivered (checked via Email Diagnostics, not just "I think I got an email")

## Risks / limitations

- **No SSO, no formal Qualcomm IT security review yet** — this pilot is explicitly a controlled, small-scale trial for that reason. See [PILOT_GUIDE.md § Known limitations](PILOT_GUIDE.md#known-limitations) for the full list.
- **No dedicated support/on-call owner** — response to issues during the pilot is best-effort from whoever set it up, not a supported service.
- **Email sender/domain is a pilot configuration** (via Resend), not yet integrated with Qualcomm's own email infrastructure — expect it to land differently than internal Qualcomm mail (possibly flagged, possibly in spam initially).
- **Desktop browser only** — no mobile layout yet; if any pilot participant primarily works from a phone, that's a real gap to flag before starting, not something to discover mid-pilot.
- **Demo/seed accounts and passwords must never be reused for real pilot participants** — every real user needs a distinct, admin-created account per [ADMIN_GUIDE.md](ADMIN_GUIDE.md).
- **Small blast radius by design** — because the pilot is intentionally small, it will not surface scale-related issues (concurrent usage load, larger vendor directories, etc.); that's a deliberate trade-off, not an oversight.

## Handoff / support model

- **During the pilot:** the admin who set it up is the single point of contact for account issues, access questions, and bug reports. There is no ticketing system for this phase — direct contact is the model.
- **If the pilot succeeds and scope grows:** before any broader rollout, revisit SSO integration, formal IT/security review, and a defined support/on-call owner — none of those are pilot blockers, but all three are rollout blockers.
- **If the pilot is paused or ends:** admin deactivates the pilot's vendor/staff accounts (see [ADMIN_GUIDE.md § Deactivate users](ADMIN_GUIDE.md#deactivate-users)) — no data is deleted, so a resumed or expanded pilot later doesn't start from zero.
