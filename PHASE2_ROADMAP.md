# FacilityFlow — Phase 2 Roadmap

**Updated:** July 2026 — D-3 and D-4 (in-app reminder + overdue notifications) are now implemented, on top of Bucket 1 (fully complete), D-1 (maintenance report gate), and D-2 (target dates + Assigned POC)
**Status:** Requirements resolved (see [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)). Security hardening (M-1, M-2), the account foundation (M-3–M-7), the maintenance report gate (D-1), the target-date foundation (D-2), and in-app notifications (D-3/D-4) have all shipped. **Recommended next build: D-5, the duty roster monthly grid** — with D-6 (vendor progress percentage) available as a small, independent quick win before, after, or alongside it.
**Branch policy:** RLS, private storage, and the full account foundation (deactivation, forgot-password, admin role, Conductor flag, documented vendor invites) are all in place. The system is now safer for **pilot-style testing with controlled/synthetic data** — it is not yet fully production-ready (there is still no in-app admin user-management UI, and notifications are in-app only with no email/push/background jobs; see Accepted risks below).

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

**Bucket 1 is now fully complete.** See [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the RLS/storage implementation record and `supabase_m3_m7_account_foundation_migration.sql` for the account-foundation migration. Forgot-password was tested end-to-end with a real email and correctly landed on `/reset-password`. Nothing in this bucket blocks further feature work — **Bucket 2 is now the active build target, starting with D-2.**

> **Security warning — updated:** Row Level Security, private document storage, and the full account foundation (deactivation, forgot-password, admin role, Conductor flag) are **all implemented and tested**. The system is meaningfully safer for pilot-style testing with controlled/synthetic data than it was before. It is **still not fully production-ready** — there is no in-app admin user-management UI yet (account creation and role changes go through the Supabase Dashboard), the `/admin` route is reserved but has no page behind it, and RLS is row-level rather than column-level (see `RLS_PRIVATE_STORAGE_PLAN.md` and `README.md` accepted risks for the full list).
>
> D-1 (maintenance report gate, Bucket 2) is also complete. With M-1–M-7 and D-1 all done, the remaining gaps before real, uncontrolled pilot data are specifically: the in-app admin UI (Bucket 3, L-4) and the accepted RLS/workflow risks listed above — not anything in Bucket 1 anymore.

---

### Bucket 2 — Next demo iteration

Builds on Bucket 1. These are the features that give Qualcomm something new and concrete to see in the next demo — they resolve the bulk of the July feedback.

| # | Feature | Req ref | Complexity | Status |
|---|---|---|---|---|
| D-1 | Maintenance report upload + QC approval gate | §3-A | Medium | ✅ **Done** |
| D-2 | Start Date / Target Completion Date fields + Assigned POC display | §4-A | Low | ✅ **Done** |
| D-3 | In-app reminder notification (1 hr before appointment) | §4-B | Medium | ✅ **Done** |
| D-4 | In-app overdue notification (assigned POC only) | §4-C | Low | ✅ **Done** |
| **D-5** | **Duty roster: monthly grid + manual assignment (no upload yet)** | **§2-A** | **Medium** | 🎯 **Recommended next build** |
| **D-6** | **Vendor progress percentage quick win** | **§6-C** | **Low** | 🎯 **Available anytime — before, after, or alongside D-5** |
| D-7 | Mobile responsive pass (375px, collapsible sidebar, card tables) | §5-B | Medium | Not started |

**Estimated duration:** 4–5 weeks.
**Output:** The maintenance closure workflow Qualcomm asked for, visible due-date tracking, working in-app notifications, and a roster Qualcomm can actually use in a demo (even before upload/export exist).

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

**Why D-5 next:** D-1 through D-4 close out the entire "notify and gate on real dates" arc from Qualcomm's original feedback. D-5 (duty roster) is the next distinct feature area — a monthly, site-based on-call record, unrelated to the appointment/notification work just finished. D-6 (vendor progress %) is small enough to slot in whenever convenient and has no dependency relationship with D-5 either direction.

---

### Bucket 3 — Later production work

Valuable, but not required to run a credible pilot or demo. Build after Bucket 2 is stable.

| # | Feature | Req ref | Complexity |
|---|---|---|---|
| L-1 | Email Edge Function + reminder/overdue email wiring | §4-B, §4-C | Medium |
| L-2 | Roster `.xlsx` upload + preview + bulk insert | §2-B | Medium |
| L-3 | Roster PDF export (monthly layout) | §2-C | Low |
| L-4 | In-app Admin self-service user management page | §1-B | High |
| L-5 | PWA packaging (manifest, service worker, install prompt) | §5-B | Low–Medium |
| L-6 | Native app evaluation — **only if** app-store distribution is explicitly confirmed as required | §5-B | High |

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

Bucket 1 (RLS, private storage, M-3–M-7), D-1 (maintenance report gate), D-2 (target dates + Assigned POC), and D-3/D-4 (in-app notifications) are all **done** — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md), `supabase_m3_m7_account_foundation_migration.sql`, `PHASE2_REQUIREMENTS.md` §3-A, §4-A, §4-B, §4-C for the full records of what shipped. What remains is D-5 (duty roster), with D-6 (vendor progress %) available as a parallel quick win.

### D-1 through D-4, and Bucket 1 (M-3–M-7) — complete (for reference)

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

### Next — D-5: duty roster monthly grid (with D-6 as a parallel option)

| Day | Task |
|---|---|
| 1 | Create the `duty_roster` table (`site_name`, `roster_date`, `assigned_profile_id`, `notes`) per `PHASE2_REQUIREMENTS.md` §2-A. Add RLS: internal roles (admin/manager/staff) full access, vendor no access. |
| 2 | New `/roster` route + page: monthly grid, defaults to current month, one assigned person shown per site per day. Add to `ROLE_ALLOWED_PREFIXES`/`ROLE_NAV` for admin/manager/staff only. |
| 3 | Manual assignment UI: admin/manager can assign/reassign a person to a site+date from the grid (no upload yet — that's §2-B, later). |
| 4 | Full regression: roster data persists in DB, vendor role cannot reach `/roster`, monthly navigation works. |
| 5 | Optional if time allows: start D-6 (vendor progress %) — add `progress_pct` to `appointment_requests`, let vendors update it from My Bookings or Appointment Detail, show average completion per equipment category in Weekly Report. |

**End-of-sprint state:** D-5 complete — a roster Qualcomm can actually use in a demo, even before the Excel upload (§2-B) and PDF export (§2-C) exist. D-6, if not finished alongside, remains a small standalone follow-up with no blocking dependencies.

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
Bucket 2: Roster monthly grid ─────────────────── 🎯 next ──┤
Bucket 2: Vendor progress % ──────────────── 🎯 anytime ─────┤
Bucket 2: Mobile responsive pass ────────────────────────┘
                                                         ↓
Bucket 3 (later): Email Edge Function + email wiring ───┐  (L-1 depends on D-3/D-4 logic existing in-app first — done)
Bucket 3: Roster upload + PDF export ────────────────────┤
Bucket 3: Admin self-service UI ─────────────────────────┤
Bucket 3: PWA packaging ─────────────────────────────────┘
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
- [ ] In-app admin user-management UI exists (Bucket 3, L-4) — not required for pilot, Dashboard covers it, but still open for full production readiness
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
