# FacilityFlow — Phase 2 Roadmap

**Updated:** July 2026 — reflects all 20 answered questions from Qualcomm feedback
**Status:** Requirements resolved (see [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)). Sequencing below is ready to execute.
**Branch policy:** Do not merge `supabase-auth-experiment` to `main` until the Must-Have bucket (RLS + private storage) is complete.

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

Nothing in this bucket is optional. Without it, real vendor and Qualcomm data is exposed to any authenticated user, and there's no way to safely onboard or offboard real accounts.

| # | Item | Req ref | Complexity |
|---|---|---|---|
| M-1 | Row Level Security on all tables | §0-A | Medium |
| M-2 | Private document storage + signed URLs | §0-B | Medium |
| M-3 | Deactivated-user login block (`is_active` check) | §1-B | Low |
| M-4 | Forgot-password flow | §1-B | Low |
| M-5 | `admin` role + route guard | §1-A | Low |
| M-6 | `is_conductor` flag (roster display only, no access change) | §1-A | Low |
| M-7 | Document vendor invite process via Supabase Dashboard (operational, no code) | §1-B | — |

**Estimated duration:** 2–3 weeks, dominated by RLS regression testing across all four roles and every page.

> **Security warning — unchanged:** Row Level Security and private document storage are required before any real Qualcomm or vendor data enters this system. The current anon-key architecture allows any authenticated user to read and write all rows and download all documents. Do not onboard real users until M-1 and M-2 are verified complete.

---

### Bucket 2 — Next demo iteration

Builds on Bucket 1. These are the features that give Qualcomm something new and concrete to see in the next demo — they resolve the bulk of the July feedback.

| # | Feature | Req ref | Complexity |
|---|---|---|---|
| D-1 | Maintenance report upload + QC approval gate | §3-A | Medium |
| D-2 | Start Date / Target Completion Date fields + display | §4-A | Low |
| D-3 | In-app reminder notification (1 hr before appointment) | §4-B | Medium |
| D-4 | In-app overdue notification (assigned POC only) | §4-C | Low |
| D-5 | Duty roster: monthly grid + manual assignment (no upload yet) | §2-A | Medium |
| D-6 | Vendor progress percentage quick win | §6-C | Low |
| D-7 | Mobile responsive pass (375px, collapsible sidebar, card tables) | §5-B | Medium |

**Estimated duration:** 4–5 weeks.
**Output:** The maintenance closure workflow Qualcomm asked for, visible due-date tracking, working in-app notifications, and a roster Qualcomm can actually use in a demo (even before upload/export exist).

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

## Concrete next-build plan — next 1–2 weeks

This is the actionable sprint plan, sequenced against the real files in the current codebase. RLS and storage dominate the available time; the identity items are small enough to slot in alongside. Treat Week 2's later items as a stretch goal — RLS regression testing routinely runs long, and that's fine, since nothing here blocks on it except pilot go-live.

### Week 1 — Security rollout (Bucket 1: M-1, M-2)

| Day | Task |
|---|---|
| 1 | Enable RLS on `profiles` (self-read + admin-full-read policies). Regression test all 3 existing role logins (manager/staff/vendor demo accounts). |
| 2 | Enable RLS on `appointment_requests` + `status_updates`. Vendor policy scoped to `vendor_user_id = auth.uid()`; internal roles get full SELECT. Regression: Requests, MyBookings, Dashboard, Calendar, WeeklyReport pages for all roles. |
| 3 | Enable RLS on `appointment_messages` + `appointment_documents`. Regression: AppointmentDetail message thread + document list for all roles. |
| 4 | Enable RLS on `staff_schedules`. Switch `appointment-documents` bucket to private; replace public URL construction with `supabase.storage.createSignedUrl()` in `AppointmentDetail.jsx` and `BookingForm.jsx`. |
| 5 | Full regression pass: all 4 roles × all pages. Fix any RLS policy gaps found (expect at least one — policies that are too restrictive fail silently with empty results, not errors). |

### Week 2 — Identity foundation + first demo-bucket slice (Bucket 1: M-3–M-6, start of Bucket 2: D-2)

| Day | Task |
|---|---|
| 6 | Add `is_active boolean default true` to `profiles`. Update `AuthContext.fetchProfile()` to sign out + block when inactive. Add the deactivated-account message to `Login.jsx`. |
| 7 | Add "Forgot password?" link to `Login.jsx` using `supabase.auth.resetPasswordForEmail()`. Build the `/reset-password` route/page using `supabase.auth.updateUser({ password })`. |
| 8 | Add `admin` to the `profiles.role` check constraint; extend `ROLE_ALLOWED_PREFIXES` in `App.jsx`. Add `is_conductor boolean default false` to `profiles` (no routing changes — display-only for now). Document the Supabase Dashboard invite process in `SUPABASE_SETUP.md` (M-7). |
| 9–10 | **Stretch:** Start Start Date / Target Completion Date (D-2) — migration adding `start_date`/`target_completion_date` to `appointment_requests`, new Requests table column, Appointment Detail display. Date/time picker component and Calendar integration can carry into the following week if needed. |

**End-of-sprint state:** RLS and private storage complete and regression-tested (the hard pilot-blocking gate), plus deactivation, forgot-password, admin role, and the Conductor flag all shipped — the entirety of Bucket 1. Day 9–10 gives a running start on Bucket 2.

---

## Dependency map

```
Bucket 1 (must-have): RLS ─────────────────────────────┐
Bucket 1: Private storage ─────────────────────────────┤
Bucket 1: Deactivation + forgot-password + admin role ──┤
                                                         ↓
Bucket 2 (next demo): Maintenance report gate ──────────┐
Bucket 2: Start/Target Completion Date ─────────────────┤
Bucket 2: In-app reminder + overdue notifications ──────┤  (D-3/D-4 depend on D-2's date fields)
Bucket 2: Roster monthly grid ───────────────────────────┤
Bucket 2: Vendor progress % ─────────────────────────────┤
Bucket 2: Mobile responsive pass ────────────────────────┘
                                                         ↓
Bucket 3 (later): Email Edge Function + email wiring ───┐  (L-1 depends on D-3/D-4 logic existing in-app first)
Bucket 3: Roster upload + PDF export ────────────────────┤
Bucket 3: Admin self-service UI ─────────────────────────┤
Bucket 3: PWA packaging ─────────────────────────────────┘
                                                         ↓
Separate phase: Project Collaboration (own scoping session)
```

---

## Before-pilot checklist

Before any real Qualcomm vendor or staff data enters the system:

- [ ] M-1: RLS enabled and regression-tested on all tables (including new ones as they're added)
- [ ] M-2: Storage bucket is private; signed URLs work for all document types
- [ ] M-3: Deactivated accounts are blocked at next login
- [ ] M-4: Forgot-password flow works end-to-end
- [ ] M-5/M-6: `admin` role exists and is route-guarded; `is_conductor` flag does not affect access
- [ ] M-7: Vendor invite process via Supabase Dashboard is documented and has been dry-run once
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
