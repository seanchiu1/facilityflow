# FacilityFlow — Phase 2 Roadmap

**Created:** July 2026
**Status:** Draft — pending Qualcomm sign-off on open questions in [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)
**Branch policy:** Do not merge `supabase-auth-experiment` to `main` until Wave 0 (RLS + private storage) is complete.

---

## Summary

Phase 2 is divided into four waves. Each wave must be fully complete and tested before the next begins — later waves depend on infrastructure built in earlier ones.

| Wave | Name | Prerequisite for |
|---|---|---|
| **Wave 0** | Security hardening | Real pilot data; all user-facing features |
| **Wave 1** | Core operations | Wave 2 |
| **Wave 2** | Notifications & roster | Wave 3 (if pursued) |
| **Wave 3** | Project collaboration | Standalone; separate scoping required |

---

## Complexity reference

| Label | Meaning |
|---|---|
| Low | ≤1 week; small UI change or new column; no new infrastructure |
| Medium | 1–3 weeks; new page + data model; fits existing architecture |
| High | 3–6 weeks; new infrastructure, Edge Functions, real-time, or new platform module |

---

## Wave 0 — Security hardening

**Must be complete before any real Qualcomm data enters the system.**
This is not optional — without this, the database is readable by any browser that knows the anon key.

| # | Item | Complexity | Notes |
|---|---|---|---|
| 0-A | Row Level Security on all tables | Medium | Block at the start of Phase 2; blocks everything else |
| 0-B | Private document storage + signed URLs | Medium | Update `AppointmentDetail` and `BookingForm` |
| 0-C | Email notification Edge Function scaffold | Medium | Foundation for Wave 2 notifications; needs Resend or SMTP config |

**Estimated duration:** 2–3 weeks
**Output:** A hardened pilot-ready deployment where vendor A cannot access vendor B's data, and documents require authentication to download.

### Wave 0 implementation order

```
1. Enable RLS on profiles (lowest risk — start here)
2. Enable RLS on appointment_requests + status_updates (test all role flows)
3. Enable RLS on appointment_messages + appointment_documents
4. Enable RLS on staff_schedules
5. Switch storage bucket to private; update signed URL calls in UI
6. Run full regression: all three role logins, booking → approval → finish flow
7. Deploy Edge Function scaffold for email; test with manual trigger
```

**Risk:** RLS policies that are too restrictive will silently break UI queries (empty results instead of errors). Test every page with every role after each RLS step.

---

## Wave 1 — Core operations

**Builds on:** Wave 0 complete; open questions from Sections 1–3 of Requirements answered.
**Focus:** Expand role structure, add the maintenance closure gate, extend the roster.

### Feature table

| # | Feature | Req. ref | Complexity | Notes |
|---|---|---|---|---|
| 1-A | Rename/clarify Conductor role | §1-A | Low | DB constraint update + label changes if it's a rename |
| 1-B | Add `admin` role + route guard | §1-A | Low | New value in `profiles.role`; extend `ROLE_ALLOWED_PREFIXES` |
| 1-C | Add `phone` + `notification_email` to profiles | §2-A, §0-C | Low | Simple column additions; update Settings page form |
| 1-D | Maintenance report gate on Finished status | §3-A | Medium | New `document_type` field; conditional button disable; upload from detail page |
| 1-E | Due date field on appointments | §4-A | Low | New `due_date` column; display in Requests table; highlight overdue rows |
| 1-F | In-app overdue/approaching notifications | §4-B | Low | Extend existing notification bell query |
| 1-G | Vendor progress percentage field | §6-C | Low | Quick win; `progress_pct` on `appointment_requests` |

**Estimated duration:** 3–4 weeks
**Output:** Pilot-usable system with role clarity, the maintenance closure gate, and basic due-date visibility.

### Wave 1 implementation order

```
1. Role + profile table changes (1-A, 1-B, 1-C) — database first
   - DB migrations before any UI work
   - Test existing login flows still work after constraint change

2. Due date field (1-E) — new column + UI only, no logic dependency
   - Add column to appointment_requests
   - Show in Requests table with overdue highlighting
   - Add to Appointment Detail summary panel

3. Maintenance report gate (1-D) — most user-facing, highest test surface
   - Add document_type column to appointment_documents
   - Update BookingForm upload to accept type selection
   - Update AppointmentDetail to show upload-from-detail
   - Gate the Finished transition in RequestTable + AppointmentDetail
   - Regression test: can still reach Finished after uploading report

4. Notification bell extension (1-F) — low risk, builds on 1-E
   - Extend Topbar NotificationsDropdown query to include overdue/approaching

5. Vendor progress pct (1-G) — isolated, low risk, add last
```

**Admin user management (§1-B full page) is deferred to Wave 2** — it requires a backend Edge Function for user creation (service-role key), which should be built alongside the email Edge Function infrastructure in Wave 2. Admins can manage users directly in the Supabase Dashboard until then.

---

## Wave 2 — Notifications, roster, and admin tools

**Builds on:** Wave 0 + Wave 1 complete; open questions from Sections 2 and 4 answered.
**Focus:** Email escalation, duty roster module, admin user management page.

### Feature table

| # | Feature | Req. ref | Complexity | Notes |
|---|---|---|---|---|
| 2-A | Email on status change (vendor + manager) | §0-C, §4-C | Medium | Triggers from Wave 0 Edge Function scaffold |
| 2-B | Scheduled overdue escalation emails | §4-C | Medium | pg_cron or Edge Function on cron trigger; needs `notification_log` table |
| 2-C | Duty roster data model + weekly grid UI | §2-A | Medium | New `duty_roster` table; new `/roster` page |
| 2-D | Roster CSV/Excel upload + preview | §2-B | Medium | Client-side parse; map to profiles by name |
| 2-E | Roster PDF export | §2-C | Low | `window.print()` approach; consistent with existing Export PDF |
| 2-F | Admin user management page | §1-B | High | Edge Function for user creation (service-role key); deactivation flow |

**Estimated duration:** 4–5 weeks
**Output:** Full notification pipeline, duty roster visible to all internal roles, admin self-service for user accounts.

### Wave 2 implementation order

```
1. Email on status change (2-A)
   - Extend Wave 0 Edge Function scaffold
   - Test with real email addresses before adding scheduling

2. Duty roster table + grid page (2-C)
   - DB migration first
   - Read-only grid before edit/upload

3. Roster CSV upload (2-D) — builds on 2-C
4. Roster PDF export (2-E) — add to roster page
5. Overdue escalation emails (2-B) — requires 2-A working + notification_log table
6. Admin user management (2-F) — highest complexity, build last in wave
```

---

## Wave 3 — Project collaboration platform

**Builds on:** Wave 0–2 complete; separate scoping document required.
**Prerequisite:** Qualcomm must answer Questions 17–20 from PHASE2_REQUIREMENTS.md before this wave can be scoped.

**Why this is Wave 3, not Wave 2:**

The project collaboration module is a fundamentally different product from appointment scheduling. It introduces a new top-level entity ("Project"), a new data model with milestones and dependencies, real-time multi-party chat, and Gantt chart rendering. Building it inside FacilityFlow is one option; integrating with an existing PM tool (Asana, ClickUp, MS Project) via API is another and may be faster.

This decision cannot be made until the open questions are answered.

### Indicative feature list (not final scope)

| Feature | Complexity | Notes |
|---|---|---|
| Project entity + milestones data model | High | New `projects`, `project_milestones` tables; FK to `appointment_requests` |
| Project list/detail UI | High | New pages; role-based project access |
| Vendor progress updates on projects | Medium | Extends Wave 1 `progress_pct` concept to milestones |
| Project-level document library | Medium | New `project_documents` table; scoped file browser |
| Group chat (multi-party) | High | Supabase Realtime; channel concept; notification fan-out |
| Task assignment to suppliers | High | New `project_tasks` table; assignee management |
| Gantt chart auto-generation | High | JS library (e.g., `frappe-gantt`); data model must encode dependencies |

**Rough estimate if all features are in scope:** 10–16 weeks of engineering.
**Recommended first ask:** "Could vendor progress updates and shared document library alone address 80% of the coordination need?"

---

## Feature complexity summary

| Feature | Wave | Complexity |
|---|---|---|
| Row Level Security | 0 | Medium |
| Private document storage | 0 | Medium |
| Email Edge Function scaffold | 0 | Medium |
| Conductor role rename/clarify | 1 | Low |
| Admin role + route guard | 1 | Low |
| Phone/email fields on profiles | 1 | Low |
| Maintenance closure report gate | 1 | Medium |
| Due date field + overdue highlight | 1 | Low |
| In-app overdue/approaching notifications | 1 | Low |
| Vendor progress % field | 1 | Low |
| Email on status change | 2 | Medium |
| Scheduled escalation emails | 2 | Medium |
| Duty roster data model + grid | 2 | Medium |
| Roster CSV upload | 2 | Medium |
| Roster PDF export | 2 | Low |
| Admin user management page | 2 | High |
| Project collaboration platform | 3 | High (×6 features) |
| Mobile responsive pass | Any | Medium |

---

## Mobile UX — scheduling recommendation

The mobile responsive pass (§5-B in Requirements) is not wave-dependent — it can be done in parallel with any wave. However, the layout restructure (collapsible sidebar) will touch `AppLayout.jsx`, `Sidebar.jsx`, and every page's top-level container.

**Recommendation:** Do the mobile pass at the **start of Wave 2** after Wave 1 core features are stable and tested. Doing it during Wave 1 while the data model is still changing increases merge conflict risk.

The responsive pass is scoped as:
- Collapsible sidebar with hamburger trigger below `md:` breakpoint
- Remove `ml-60` fixed margin on mobile; use `md:ml-60` instead
- Requests table → card view below `lg:` breakpoint
- Weekly Report stat grid → 2-column below `md:` breakpoint
- All existing pages: spacing and font-size audit at 375px

---

## Dependency map

```
Wave 0: RLS ──────────────────────────────────┐
Wave 0: Private storage ──────────────────────┤
Wave 0: Email Edge Function scaffold ─────────┤
                                               ↓
Wave 1: Role/profile changes ─────────────────┐
Wave 1: Maintenance gate ─────────────────────┤
Wave 1: Due date field ───────────────────────┤
Wave 1: In-app notifications ─────────────────┘
                                               ↓
Wave 2: Email on status change ───────────────┐
Wave 2: Escalation emails ────────────────────┤  (requires Wave 1 due_date + Wave 0 email)
Wave 2: Roster module ────────────────────────┤
Wave 2: Admin user management ────────────────┘
                                               ↓
Wave 3: Project collaboration (separate scope)
```

---

## Before-pilot checklist

Before any real Qualcomm vendor or staff data enters the system, confirm all of the following:

- [ ] Wave 0-A: RLS enabled and tested on all six tables
- [ ] Wave 0-B: Storage bucket is private; signed URLs work for all document types
- [ ] Wave 0-C: Email Edge Function deployed and sending (even if only for status-change emails)
- [ ] Admin has a way to create and deactivate user accounts (Supabase Dashboard or Wave 2-F)
- [ ] Demo accounts (`*@facilityflow.demo`) are removed or have passwords changed
- [ ] `supabase_appointment_code_migration.sql` has been run (stable appointment codes on all rows)
- [ ] Supabase project is on a paid plan (free tier pauses after 1 week of inactivity)
- [ ] `.env.local` is not committed to version control

---

## What is explicitly out of scope for Phase 2

These were considered and deferred:

| Item | Reason |
|---|---|
| Native mobile app (iOS/Android) | Responsive web covers the use case; native adds significant cross-platform overhead |
| Real-time message sync (Supabase Realtime) | Current behavior (refresh to see new messages) is acceptable for pilot; add in Phase 3 |
| PDF generation library (jsPDF/Puppeteer) | `window.print()` is sufficient for roster and report PDFs at pilot scale |
| Gantt charts | Requires Project entity first; scoped to Wave 3 |
| SSO / corporate identity provider | Beyond pilot scope; design for Supabase Auth + future SAML/OIDC adapter |
| Audit log UI | `status_updates` table already captures transitions; a queryable UI is Wave 3 |
| Multi-language support beyond EN/ZH-TW | Out of scope |
