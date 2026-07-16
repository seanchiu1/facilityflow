# FacilityFlow — Phase 2 Roadmap

**Updated:** July 2026 — Bucket 1's security items (RLS + private storage) are now implemented
**Status:** Requirements resolved (see [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)). Security hardening (M-1, M-2) shipped — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md). **Recommended next build: D-1, the maintenance report upload + QC approval gate** (Bucket 2).
**Branch policy:** RLS and private storage are in place; remaining Bucket 1 items (M-3–M-7: deactivation, forgot-password, admin role) are still recommended before merging `supabase-auth-experiment` to `main` and onboarding real users. The system is now safer for **pilot-style testing with controlled/synthetic data** — it is not yet fully production-ready.

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
| M-3 | Deactivated-user login block (`is_active` check) | §1-B | Low | Pending |
| M-4 | Forgot-password flow | §1-B | Low | Pending |
| M-5 | `admin` role + route guard | §1-A | Low | Pending |
| M-6 | `is_conductor` flag (roster display only, no access change) | §1-A | Low | Pending |
| M-7 | Document vendor invite process via Supabase Dashboard (operational, no code) | §1-B | — | Pending |

**M-1 and M-2 are done** — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the full implementation record (7 migrations, all tested). M-3 through M-7 remain — they're small (Low complexity each) and still recommended before real, uncontrolled pilot data, but they no longer block feature work, since the core data-isolation guarantee is now in place at the database layer.

> **Security warning — updated:** Row Level Security and private document storage are **now implemented and tested** on all six tables and the storage bucket. The system is meaningfully safer for pilot-style testing with controlled/synthetic data than it was before. It is **not yet fully production-ready** — no account deactivation exists yet (a revoked user's session stays valid until it expires), and RLS is row-level rather than column-level (see `RLS_PRIVATE_STORAGE_PLAN.md` accepted risks). Do not onboard real, uncontrolled user data until M-3–M-7 are also complete.

---

### Bucket 2 — Next demo iteration

Builds on Bucket 1. These are the features that give Qualcomm something new and concrete to see in the next demo — they resolve the bulk of the July feedback. **Now that M-1/M-2 are done, this bucket is the active build target.**

| # | Feature | Req ref | Complexity | Status |
|---|---|---|---|---|
| **D-1** | **Maintenance report upload + QC approval gate** | **§3-A** | **Medium** | 🎯 **Recommended next build** |
| D-2 | Start Date / Target Completion Date fields + display | §4-A | Low | Not started |
| D-3 | In-app reminder notification (1 hr before appointment) | §4-B | Medium | Not started |
| D-4 | In-app overdue notification (assigned POC only) | §4-C | Low | Not started |
| D-5 | Duty roster: monthly grid + manual assignment (no upload yet) | §2-A | Medium | Not started |
| D-6 | Vendor progress percentage quick win | §6-C | Low | Not started |
| D-7 | Mobile responsive pass (375px, collapsible sidebar, card tables) | §5-B | Medium | Not started |

**Estimated duration:** 4–5 weeks.
**Output:** The maintenance closure workflow Qualcomm asked for, visible due-date tracking, working in-app notifications, and a roster Qualcomm can actually use in a demo (even before upload/export exist).

**Why D-1 first:** it directly answers Qualcomm's explicit feedback (§3 in Requirements), reuses infrastructure already secured in this rollout (`appointment_documents` table, its RLS ownership pattern, and the signed-URL flow in `AppointmentDetail.jsx`), and only needs one small RLS addition (an UPDATE policy for the new `approval_status` column, scoped to internal roles) rather than a new table or subsystem.

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

Bucket 1's security rollout (RLS on all six tables + private storage) is **done** — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the full record of what shipped. This plan replaces the old Week 1/Week 2 sprint (which covered that rollout) with the next actionable sprint: closing out Bucket 1's remaining small identity items, then building D-1.

### Week 1 — Close out Bucket 1 (M-3–M-7), start D-1's data model

| Day | Task |
|---|---|
| 1 | Add `is_active boolean default true` to `profiles`. Update `AuthContext.fetchProfile()` to sign out + block when inactive. Add the deactivated-account message to `Login.jsx`. (M-3) |
| 2 | Add "Forgot password?" link to `Login.jsx` using `supabase.auth.resetPasswordForEmail()`. Build the `/reset-password` route/page using `supabase.auth.updateUser({ password })`. (M-4) |
| 3 | Add `admin` to the `profiles.role` check constraint; extend `ROLE_ALLOWED_PREFIXES` in `App.jsx`. Add `is_conductor boolean default false` to `profiles` (no routing changes — display-only for now). Document the Supabase Dashboard invite process in `SUPABASE_SETUP.md`. (M-5, M-6, M-7) |
| 4 | Full regression across all 4 roles to confirm M-3–M-7 didn't disturb the RLS rollout. **Bucket 1 is now fully complete.** |
| 5 | Start D-1: add `document_type` (`'supporting_doc'` \| `'maintenance_report'`), `approval_status` (`'pending'` \| `'approved'` \| `'rejected'`), `reviewed_by`, `reviewed_at`, `review_notes` columns to `appointment_documents`. Write the corresponding RLS UPDATE policy scoped to `is_internal_role()` (closes `RLS_PRIVATE_STORAGE_PLAN.md` Risk R-6). |

### Week 2 — D-1: maintenance report upload + QC approval gate

| Day | Task |
|---|---|
| 6 | `AppointmentDetail.jsx`: add a document-type selector to the upload flow so any role can tag an upload as a Maintenance Report, not just a supporting document. |
| 7 | Build the QC approve/reject UI: internal roles (admin/manager/staff) see a pending maintenance report with Approve/Reject actions and an optional note; reflects into `approval_status`, `reviewed_by`, `reviewed_at`, `review_notes`. |
| 8 | Gate the `Finished` status transition in both `RequestTable.jsx` and `AppointmentDetail.jsx` — disabled with a clear reason ("Maintenance report required" / "pending approval") unless an approved `maintenance_report` document exists for that appointment. |
| 9 | Handle rejection: appointment stays open, uploader sees the rejection reason, can re-upload; gate re-checks against the most recent report. |
| 10 | Full regression: upload → approve → close works for all internal roles; upload → reject → re-upload → approve → close works; existing `Finished` appointments with no report are not retroactively blocked. |

**End-of-sprint state:** all of Bucket 1 (M-1–M-7) complete, and D-1 — the feature Qualcomm explicitly asked for — shipped and tested.

---

## Dependency map

```
Bucket 1 (must-have): RLS ────────────────────────── ✅ done ┐
Bucket 1: Private storage ──────────────────────────  ✅ done ┤
Bucket 1: Deactivation + forgot-password + admin role ─ pending ┤
                                                         ↓
Bucket 2 (next demo): Maintenance report gate ─── 🎯 next ──┐
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

Before any real, uncontrolled Qualcomm vendor or staff data enters the system:

- [x] M-1: RLS enabled and regression-tested on all tables — done for the current six; new tables (duty roster, projects) will need their own policies when built
- [x] M-2: Storage bucket is private; signed URLs work for all document types
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
