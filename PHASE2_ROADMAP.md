# FacilityFlow — Phase 2 Roadmap

**Updated:** July 2026 — M-8 (in-app Admin User Management) is now implemented, following the desktop polish/demo-data-cleanup pass. Bucket 2's core feature arc (D-1 through D-6) and Bucket 1 are both fully complete.
**Status:** Requirements resolved (see [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)). Security hardening (M-1, M-2), the account foundation (M-3–M-7), in-app Admin User Management (M-8), the maintenance report gate (D-1), the target-date foundation (D-2), in-app notifications (D-3/D-4), the duty roster (D-5), vendor progress % (D-6), and roster Excel import/export (L-2) have all shipped, on top of a desktop polish and demo-data-cleanup pass. **D-1 through D-6, M-1 through M-8, and L-2 are all done.** The recommended next step is **email notification infrastructure for appointment reminders and overdue alerts (L-1)**. D-7 (mobile responsive pass) remains deliberately later.
**Branch policy:** RLS, private storage, the full account foundation (deactivation, forgot-password, admin role, Conductor flag, documented vendor invites), in-app Admin User Management, and roster Excel import/export are all in place. The system is now safer for **pilot-style testing with controlled/synthetic data** — it is not yet fully production-ready (account *creation* is still Supabase-Dashboard-only, notifications are in-app only with no email/push/background jobs, roster import has no partial-import support and depends on an `xlsx` npm package with open audit findings, progress has no audit trail, and there is no super-admin tier or audit log for admin profile edits; see Accepted risks below).

---

## What changed from the previous draft

The Qualcomm answers materially simplified two things and added scope to two others:

- **Simpler:** Conductor is not a new access tier (just a display flag) — no new routing/RLS logic needed. Project Collaboration drops its highest-complexity item (auto-generated Gantt charts) entirely — vendors upload/maintain the Gantt as a file instead.
- **More scope:** Maintenance report closure is now a two-step upload-and-approve workflow, not a single upload gate. Notifications need two new date fields (Start Date, Target Completion Date) and two distinct notification types (reminder, overdue) with different recipients each — and explicitly **no** delay notification.
- **Re-prioritized:** Vendor account creation and password reset are now understood to be pilot-blocking (real vendors need a working account lifecycle), so those small items moved into the must-have bucket alongside RLS and private storage. The full in-app Admin self-service UI, however, is *not* pilot-blocking — Supabase's built-in Dashboard invite flow covers it for now.

---

## Priority buckets

This replaces the old four-wave structure with three priority buckets plus a separate phase, as requested. Each bucket lists items with their requirement reference (`§`) and complexity.

### Bucket 1 — Must-have before real pilot data

| # | Item | Req ref | Complexity | Status |
|---|---|---|---|---|
| M-1 | Row Level Security on all tables | §0-A | Medium | ✅ **Done** |
| M-2 | Private document storage + signed URLs | §0-B | Medium | ✅ **Done** |
| M-3 | Deactivated-user login block (`is_active` check) | §1-B | Low | ✅ **Done** |
| M-4 | Forgot-password flow | §1-B | Low | ✅ **Done** |
| M-5 | `admin` role + route guard | §1-A | Low | ✅ **Done** |
| M-6 | `is_conductor` flag (roster display only, no access change) | §1-A | Low | ✅ **Done** |
| M-7 | Document vendor invite process via Supabase Dashboard (operational, no code) | §1-B | — | ✅ **Done** |
| M-8 | In-app Admin User Management (`/admin/users`) — list/search/filter, edit role/status/details | §1-B | Medium | ✅ **Done** |

**Bucket 1 is now fully complete, including M-8.** See [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the RLS/storage implementation record, `supabase_m3_m7_account_foundation_migration.sql` for the account-foundation migration, and `supabase_m8_admin_user_management_migration.sql` for the admin-management migration. Forgot-password was tested end-to-end with a real email and correctly landed on `/reset-password`. M-8 was originally tracked as Bucket 3 item L-4 — see that row below, now marked done and cross-referenced here. Nothing in this bucket blocks further feature work.

> **Security warning — updated:** Row Level Security, private document storage, the full account foundation (deactivation, forgot-password, admin role, Conductor flag), and in-app Admin User Management are **all implemented and tested**. The system is meaningfully safer for pilot-style testing with controlled/synthetic data than it was before. It is **still not fully production-ready** — account *creation* still goes through the Supabase Dashboard (in-app creation needs a service-role-backed Edge Function, not built), there is no super-admin tier (every admin can edit every other admin, including demoting them), no audit log for admin profile edits, and RLS is row-level rather than column-level (see `RLS_PRIVATE_STORAGE_PLAN.md` and `README.md` accepted risks for the full list).
>
> D-1 (maintenance report gate, Bucket 2) is also complete. With M-1–M-8 and D-1 all done, the remaining gaps before real, uncontrolled pilot data are specifically the accepted risks listed above — not anything in Bucket 1 anymore.

---

### Bucket 2 — Next demo iteration

Builds on Bucket 1. These are the features that give Qualcomm something new and concrete to see in the next demo — they resolve the bulk of the July feedback.

| # | Feature | Req ref | Complexity | Status |
|---|---|---|---|---|
| D-1 | Maintenance report upload + QC approval gate | §3-A | Medium | ✅ **Done** |
| D-2 | Start Date / Target Completion Date fields + Assigned POC display | §4-A | Low | ✅ **Done** |
| D-3 | In-app reminder notification (1 hr before appointment) | §4-B | Medium | ✅ **Done** |
| D-4 | In-app overdue notification (assigned POC only) | §4-C | Low | ✅ **Done** |
| D-5 | Duty roster: monthly grid + manual assignment (no upload yet) | §2-A | Medium | ✅ **Done** |
| D-6 | Vendor progress percentage quick win | §6-C | Low | ✅ **Done** |
| D-7 | Mobile responsive pass (375px, collapsible sidebar, card tables) | §5-B | Medium | Not started — deliberately later, after desktop stabilizes |

**Bucket 2's core feature arc (D-1 through D-6) is now complete.** Only D-7 (mobile) remains in this bucket, and it's intentionally deferred — see "Recommended next step" below.

**Estimated duration:** 4–5 weeks.
**Output:** The maintenance closure workflow Qualcomm asked for, visible due-date tracking, working in-app notifications, a roster Qualcomm can actually use in a demo, and per-appointment progress visibility.

**D-1 is complete** — see `supabase_d1_maintenance_report_migration.sql` and `PHASE2_REQUIREMENTS.md` §3-A for the full record. It shipped: `document_type`/`approval_status`/`reviewed_by`/`reviewed_at`/`review_note` on `appointment_documents`, upload-from-detail with a type selector, QC approve/reject UI for internal roles, and the Finished-status gate in both `AppointmentDetail.jsx` and `RequestTable.jsx`/`Requests.jsx`. It closed `RLS_PRIVATE_STORAGE_PLAN.md` Risk R-6.

**Accepted risks carried forward from D-1** (also documented in `PHASE2_REQUIREMENTS.md` §3-A and `README.md`):
- The gate checks for *any* approved report on the appointment, not necessarily the latest one.
- Reviewer identity (`reviewed_by`) is stored but not shown in the UI — `profiles` SELECT RLS is still self-read-only.
- No delete or edit-document-type flow exists — a mistagged upload needs a reject-and-reupload cycle to correct.

**D-2 is complete** — see `supabase_d2_target_dates_migration.sql` and `PHASE2_REQUIREMENTS.md` §4-A for the full record. It shipped: `start_date`/`target_completion_date` on `appointment_requests`, internal-role editing of both plus the Assigned POC (`responsible_staff`) from `AppointmentDetail.jsx`, vendor read-only display, and passive "Overdue" badges in `AppointmentDetail.jsx`, `RequestTable.jsx`, and `Dashboard.jsx`. Weekly Report CSV gained Start Date / Target Completion Date columns.

**D-3 and D-4 are complete** — no SQL migration was needed; both read columns that already existed from D-2. They shipped: the existing notification bell (`Topbar.jsx`) now shows a numeric count badge, an "Overdue Alert" section (D-4, sorted first) and a "Starting Soon" section (D-3, sorted second), each item showing appointment code, vendor, equipment, the relevant time/date, and the Assigned POC — clicking navigates straight to Appointment Detail. Managers/admins/staff see all reminder and overdue notifications; vendors see only their own. As a side effect of extending this code path, admin users now also see the same legacy pending/today/attention notifications manager always had (previously missing entirely). Calendar gained a lightweight overdue badge/dot on existing appointment cards.

**Accepted risks carried forward from D-2/D-3/D-4** (also documented in `PHASE2_REQUIREMENTS.md` §4-A/§4-B/§4-C and `README.md`):
- Notifications are in-app only — no email, SMS, push, or browser notification, and no background job of any kind.
- No polling or cron — the bell fetches on page load, on language change, and when clicked; nothing happens while the app is closed.
- The 1-hour reminder window is filtered in JavaScript over a capped candidate set (up to 20 near-term rows), not a single database filter — a reminder near that cap's edge could theoretically be missed on an unusually busy day.
- Assigned POC is displayed as text in each notification, not used to target delivery — any internal role sees the same reminder/overdue items, since `responsible_staff` isn't linked to a real `profiles` row.
- Calendar's Target Completion Date marker on the actual target date remains deferred — the overdue indicator added lives on the existing appointment card (keyed to the visit date), not on the target date's own calendar cell.
- Start Date / Target Completion Date still depend on the browser's local clock (unchanged from D-2).

**D-5 is complete** — see `supabase_d5_duty_roster_migration.sql` and `PHASE2_REQUIREMENTS.md` §2-A for the full record, including a scope correction worth knowing about: the original spec called for `duty_roster.assigned_profile_id` (a hard link to a real `profiles` row) plus new `phone`/`notification_email` columns on `profiles`. What actually shipped is `duty_rosters` (plural) with `duty_staff_name`/`duty_staff_phone`/`duty_staff_email` as free text directly on the roster row — no account link at all. This was a deliberate scope decision for this pass, not an oversight. It shipped: a new `/roster` page with a monthly grid, a unique `(roster_date, site)` constraint enforced at the database layer, admin/manager add/edit/delete via a day-click modal, staff read-only access, vendor blocked from both the route and the underlying RLS, a site filter with free-text autocomplete for new sites, and a "Print Roster" button reusing the existing `window.print()`/print-CSS pattern — which also satisfies the original §2-C (Roster PDF export) spec, so that item needs no separate build.

**Accepted risks carried forward from D-5** (also documented in `PHASE2_REQUIREMENTS.md` §2-A and `README.md`):
- Duty staff is free text, not linked to accounts — no cross-reference to a real login, no autocomplete against known staff.
- Print uses the browser's print dialog, not a dedicated PDF generation library.
- No concurrent-edit conflict handling — simultaneous edits to the same site+date silently overwrite each other.
- No formal `sites` lookup table — the filter reflects whatever site names have been typed so far.
- Delete uses the browser's native `confirm()` dialog, not a styled in-app modal.

**D-6 is complete** — see `supabase_d6_vendor_progress_migration.sql` and `PHASE2_REQUIREMENTS.md` §6-C for the full record, including a scope correction worth knowing about: the original spec called for a column named `progress_pct`, updated via a vendor-scoped RLS UPDATE policy, editable from either My Bookings or Appointment Detail. What shipped instead: the column is `progress_percent`, updates go through a new `update_appointment_progress()` **RPC function** (SECURITY DEFINER with an explicit ownership/role check) rather than a table UPDATE policy — since Postgres RLS can't restrict which columns a policy covers, only which rows, a "vendor can update their own rows" policy would have let a vendor's browser touch any column on that row, not just progress. Editing is available from Appointment Detail only. It shipped: the progress card with a bar and update form, vendor-own-appointment and internal-any-appointment editing, compact bars in the Requests table and Dashboard's Recent Requests, and a Progress column in both the on-screen Weekly Report and its CSV export. Status is untouched by progress — 100% does not auto-close an appointment; the maintenance report approval gate remains the only path to `Finished`.

**Accepted risks carried forward from D-6** (also documented in `PHASE2_REQUIREMENTS.md` §6-C and `README.md`):
- No progress history/audit trail — only the current value is stored.
- Progress and status are intentionally decoupled and can look inconsistent (e.g., 100% progress while still `Pending`) — by design, not a defect.
- No shared `ProgressBar` component yet — the compact bar is implemented independently in four places.

**Desktop polish and demo-data-cleanup pass — done.** D-1 through D-6 shipped back-to-back; a full manual click-through of all four roles against all six features together confirmed demo accounts/data were clean and representative, and the demo script/docs were re-checked against the current UI.

**M-8 (in-app Admin User Management) — done**, ahead of its original Bucket 3/L-4 sequencing. See the Bucket 1 table above and `PHASE2_REQUIREMENTS.md` §1-B for the full record.

**Roster Excel import/export (L-2) — done.** Export current-month roster and a blank template as `.xlsx`; admin/manager can import `.xlsx` files with a validated preview step and bulk upsert on `(roster_date, site)`. See `PHASE2_REQUIREMENTS.md` §2-B for the full record.

**Recommended next step — email notification infrastructure for D-3/D-4 (L-1):** the reminder ("Starting Soon") and overdue alerts currently only appear in-app, in the notification bell — nothing fires if the app isn't open. This is the most-requested gap left from the July feedback and the next concrete, scoped build: a Supabase Edge Function that sends the same reminder/overdue logic already built for the bell as real emails. **D-7 (mobile responsive pass)** stays deliberately later: it touches layout on every page already built, and it's better done once the desktop workflow is fully settled than piecemeal alongside more feature work.

**Larger remaining backlog** (unchanged in priority, restated here for a full picture): email/push notification infrastructure for D-3/D-4 (Bucket 3 L-1 — next up), PWA/mobile packaging (Bucket 3 L-5, then D-7), service-role-backed account *creation* from `/admin/users` (extends M-8), and Project Collaboration (its own separate phase, not yet scoped).

---

### Bucket 3 — Later production work

Valuable, but not required to run a credible pilot or demo. Build after Bucket 2 is stable.

| # | Feature | Req ref | Complexity | Status |
|---|---|---|---|---|
| L-1 | Email Edge Function + reminder/overdue email wiring | §4-B, §4-C | Medium | 🎯 **Next** |
| L-2 | Roster `.xlsx` upload + preview + bulk insert | §2-B | Medium | ✅ **Done** |
| ~~L-3~~ | ~~Roster PDF export (monthly layout)~~ | §2-C | Low | ✅ **Done** — shipped as part of D-5's "Print Roster" button, no separate build was needed |
| ~~L-4~~ | ~~In-app Admin self-service user management page~~ | §1-B | High → Medium | ✅ **Done** — shipped as M-8 (Bucket 1), ahead of its original sequencing here. Account *creation* (the High-complexity Edge Function part) is still not built — that part remains open. |
| L-5 | PWA packaging (manifest, service worker, install prompt) | §5-B | Low–Medium | Not started |
| L-6 | Native app evaluation — **only if** app-store distribution is explicitly confirmed as required | §5-B | High | Not started |

**Estimated duration:** 5–7 weeks.
**Note on L-6:** Do not begin native app work speculatively. It is listed here only so it isn't forgotten if Qualcomm later confirms they need App Store / Google Play distribution specifically. Default path is PWA (L-5).

---

### Separate phase — Project Collaboration

Not part of Phase 2 proper. Requires its own scoping session once Buckets 1–2 are stable, using the rescoped feature list from §6 of the Requirements doc.

| Feature | Complexity | Notes |
|---|---|---|
| Project entity (timeline, status, description — no cost/scope) | Medium | New `projects` table |
| Project membership + per-project permissions | Medium–High | Small per-project ACL, independent of global role |
| Document library incl. vendor-maintained Gantt file uploads | Medium | Reuses Phase 1 upload/signed-URL pattern |
| Comment thread on documents | Medium | Qualcomm reviews/comments on vendor's schedule file |
| Group chat across stakeholders | High | Supabase Realtime; multi-party channel |
| Task assignment to suppliers + completion tracking | Medium–High | No dependency-graph engine needed |

**Revised estimate:** 6–10 weeks (down from the original 10–16 week estimate, because Gantt auto-generation is no longer in scope — see Requirements §6-B for the full reasoning).

---

## Concrete next-build plan — next few days

Bucket 1 (RLS, private storage, M-3–M-8) and Bucket 2's entire core feature arc (D-1 maintenance report gate, D-2 target dates + Assigned POC, D-3/D-4 in-app notifications, D-5 duty roster, D-6 vendor progress %) are all **done**, along with the desktop polish/demo-data-cleanup pass and roster Excel import/export (L-2) — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) and `PHASE2_REQUIREMENTS.md` §1-B, §2-B, §3-A, §4-A, §4-B, §4-C, §2-A, §6-C for the full records of what shipped. **Email notification infrastructure (L-1) is the next scoped build**, with D-7 (mobile) deliberately after that.

### D-1 through D-6, M-3–M-8, L-2, and the desktop polish pass — complete (for reference)

| Task | Status |
|---|---|
| ~~D-1: maintenance report upload + QC approval gate, full regression~~ | ✅ Done |
| ~~M-3: `is_active` deactivation, blocked at next login with a clear message~~ | ✅ Done |
| ~~M-4: forgot-password → `/reset-password`, tested end-to-end with a real email~~ | ✅ Done |
| ~~M-5: `admin` role added to the constraint + route guard foundation~~ | ✅ Done |
| ~~M-6: `is_conductor` display flag, zero access change~~ | ✅ Done |
| ~~M-7: Supabase Dashboard vendor-invite process documented~~ | ✅ Done |
| ~~D-2: `start_date`/`target_completion_date` columns, internal-role editing from Appointment Detail, vendor read-only, passive Overdue badges in Appointment Detail/Requests/Dashboard, Weekly Report CSV columns~~ | ✅ Done |
| ~~D-3: in-app reminder notifications extending the notification bell, count badge, Starting Soon section~~ | ✅ Done |
| ~~D-4: in-app overdue notifications, Overdue Alert section sorted first, admin gained legacy notification parity with manager~~ | ✅ Done |
| ~~D-2/D-3 (deferred): Calendar overdue badge on existing appointment cards~~ | ✅ Done (lightweight version) |
| ~~D-2/D-3 (still deferred): true secondary marker on the Target Completion Date's own calendar cell~~ | ⏸ Not done — genuinely deferred, would need restructuring the calendar's one-date-per-event grouping |
| ~~D-5: `duty_rosters` table (free-text staff, not `profiles`-linked), `/roster` page, monthly grid, admin/manager CRUD via day-click modal, staff read-only, vendor blocked (route + RLS), site filter, Print Roster~~ | ✅ Done |
| ~~D-5/§2-C: roster PDF export~~ | ✅ Done — satisfied by the same Print Roster button, no separate build needed |
| ~~D-6: `progress_percent` column, `update_appointment_progress` RPC (not a vendor UPDATE policy), progress card in Appointment Detail, compact bars in Requests/Dashboard/Weekly Report~~ | ✅ Done |
| ~~Desktop polish pass: full click-through of all four roles against all six D-1–D-6 features together, demo data seed script (`supabase_demo_seed.sql`), demo script rewrite, bilingual spot-check and fixes across Dashboard/Requests/AppointmentDetail/BookingForm/MyBookings/Calendar/Sidebar/ScheduleManagement~~ | ✅ Done |
| ~~M-8: `/admin/users` page — list/search/filter accounts, edit role/status/Conductor/vendor fields, self-demotion and self-deactivation blocked in UI and RLS, `profiles.email` column added~~ | ✅ Done |
| ~~L-2: Roster Excel import/export — Export Excel + Download Template buttons, admin/manager-only Import Excel with header-variant matching, validated preview, whole-batch save gate, bulk upsert on `(roster_date, site)`~~ | ✅ Done |

### Next — Email notification infrastructure for D-3/D-4 (L-1)

| Task |
|---|
| Stand up a Supabase Edge Function that reuses the existing reminder ("Starting Soon") and overdue query logic already built for the notification bell (`fetchReminderItems`/`fetchOverdueItems` in `Topbar.jsx`) instead of re-deriving it. |
| Decide the trigger mechanism — Supabase's `pg_cron` calling the Edge Function on a schedule is the natural fit, since there is no existing background job infrastructure in this project yet. |
| Wire actual email delivery (e.g., Resend, Postmark, or another provider reachable from an Edge Function) — needs a provider decision and API key stored as a Supabase secret, never in the frontend. |
| Recipient targeting: today's in-app notifications show the Assigned POC as text to every internal role; email needs a real decision on who actually receives each message — likely still "every internal role," matching current in-app behavior, unless `responsible_staff` gets linked to a real account first. |
| i18n for email subject/body content, matching the existing EN/繁體中文 coverage pattern. |
| Respect the existing explicit exclusion: no delay-status notifications — Qualcomm confirmed no notification should fire when an appointment is marked Delayed. |

**End-of-sprint state (previous cycle):** a demo-ready checkpoint across all of Bucket 2's core arc plus M-8 and L-2, before either D-7 (mobile) or any remaining Bucket 3 item is started.

---

## Dependency map

```
Bucket 1 (must-have): RLS ────────────────────────── ✅ done ┐
Bucket 1: Private storage ──────────────────────────  ✅ done ┤
Bucket 1: Deactivation + forgot-password + admin role ─ ✅ done ┤
                                                         ↓
Bucket 2 (next demo): Maintenance report gate ──────  ✅ done ┐
Bucket 2: Start/Target Completion Date ─────────────  ✅ done ┤
Bucket 2: In-app reminder + overdue notifications ──  ✅ done ┤
Bucket 2: Roster monthly grid ───────────────────────  ✅ done ┤
Bucket 2: Vendor progress % ─────────────────────────  ✅ done ┤
                                                         ↓
Desktop polish + demo data cleanup ──────────────────  ✅ done ┤
Bucket 1: M-8 in-app Admin User Management ──────────  ✅ done ┤
Bucket 3: Roster Excel import/export (L-2) ──────────  ✅ done ┤
                                                         ↓
Bucket 3: Email Edge Function + email wiring (L-1) ── 🎯 next ─ (reuses existing D-3/D-4 in-app query logic)
                                                         ↓
Bucket 2: Mobile responsive pass (deliberately later) ──┐
                                                         ↓
Bucket 3 (later): PWA packaging ─────────────────────────┤
Bucket 3: Service-role-backed account creation (extends M-8) ┘
                                                         ↓
Separate phase: Project Collaboration (own scoping session)
```

---

## Before-pilot checklist

Before any real, uncontrolled Qualcomm vendor or staff data enters the system:

- [x] M-1: RLS enabled and regression-tested on all tables — done for the current six; new tables (duty roster, projects) will need their own policies when built
- [x] M-2: Storage bucket is private; signed URLs work for all document types
- [x] M-3: Deactivated accounts are blocked at next login
- [x] M-4: Forgot-password flow works end-to-end — tested with a real email
- [x] M-5/M-6: `admin` role exists and is route-guarded; `is_conductor` flag does not affect access
- [x] M-7: Vendor invite process via Supabase Dashboard is documented and has been dry-run once
- [x] M-8: In-app Admin User Management exists at `/admin/users` — search/filter/edit accounts, self-demotion/self-deactivation blocked in UI and RLS
- [ ] Service-role-backed account *creation* from `/admin/users` (extends M-8) — not required for pilot, Dashboard invite covers it, but still open for full production readiness
- [ ] Demo accounts (`*@facilityflow.demo`) are removed or have passwords changed
- [ ] `supabase_appointment_code_migration.sql` has been run (stable appointment codes on all rows)
- [ ] Supabase project is on a paid plan (free tier pauses after 1 week of inactivity)
- [ ] `.env.local` is not committed to version control

---

## Explicitly out of scope (for now)

| Item | Reason |
|---|---|
| Native mobile app (iOS/Android, app-store distribution) | Not confirmed as required — PWA is the recommended first step; native only if Qualcomm explicitly confirms app-store distribution is needed (see Requirements §5-B) |
| Auto-generated Gantt chart | Removed from scope entirely — vendor provides/maintains the Gantt as an uploaded file; Qualcomm reviews and comments (Requirements §6-A) |
| Project cost / budget / scope tracking | Confirmed out of bounds for this application — those live elsewhere; this app owns timeline + documentation only |
| Delay-status notifications | Explicitly not wanted — Qualcomm confirmed no notification should fire when an appointment is marked Delayed |
| Category-based SLA auto-fill for due dates | No SLA targets exist today; Start Date / Target Completion Date are always manually entered |
| Real-time message sync (Supabase Realtime) for appointment messages | Current refresh-based behavior is acceptable for pilot; Realtime is scoped only for the separate Project Collaboration group chat |
| In-app Admin self-service user management | Supabase Dashboard invite/deactivate covers pilot needs; the dedicated UI (requires an Edge Function for the service-role key) is Bucket 3 |
| Multi-language support beyond EN/ZH-TW | Out of scope |
