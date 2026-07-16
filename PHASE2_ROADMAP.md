# FacilityFlow — Phase 2 Roadmap

**Updated:** July 2026 — D-1 (maintenance report upload + QC approval gate) is now implemented, on top of Bucket 1's security items (RLS + private storage)
**Status:** Requirements resolved (see [PHASE2_REQUIREMENTS.md](PHASE2_REQUIREMENTS.md)). Security hardening (M-1, M-2) and the maintenance report gate (D-1) have both shipped. **Recommended next build: the remaining Bucket 1 account-foundation items (M-3–M-7)** — deactivation, forgot-password, admin role, Conductor flag, and documenting the vendor invite process. These are small (Low complexity each) and close out Bucket 1 entirely.
**Branch policy:** RLS, private storage, and the maintenance report gate are all in place; remaining Bucket 1 items (M-3–M-7) are still recommended before merging `supabase-auth-experiment` to `main` and onboarding real users. The system is now safer for **pilot-style testing with controlled/synthetic data** — it is not yet fully production-ready.

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
| **M-3** | **Deactivated-user login block (`is_active` check)** | **§1-B** | **Low** | 🎯 **Recommended next build** |
| **M-4** | **Forgot-password flow** | **§1-B** | **Low** | 🎯 **Recommended next build** |
| **M-5** | **`admin` role + route guard** | **§1-A** | **Low** | 🎯 **Recommended next build** |
| **M-6** | **`is_conductor` flag (roster display only, no access change)** | **§1-A** | **Low** | 🎯 **Recommended next build** |
| **M-7** | **Document vendor invite process via Supabase Dashboard (operational, no code)** | **§1-B** | **—** | 🎯 **Recommended next build** |

**M-1 and M-2 are done** — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) for the full implementation record (7 migrations, all tested). **M-3 through M-7 are the recommended next build** — they're small (Low complexity each), close out Bucket 1 entirely, and are a deliberately lightweight sprint after the larger D-1 feature build (Bucket 2). They don't block further feature work, since the core data-isolation guarantee is already in place at the database layer, but they're the right next step before Bucket 2 continues (D-2 onward) or real pilot data is considered.

> **Security warning — updated:** Row Level Security and private document storage are **now implemented and tested** on all six tables and the storage bucket. The system is meaningfully safer for pilot-style testing with controlled/synthetic data than it was before. It is **not yet fully production-ready** — no account deactivation exists yet (a revoked user's session stays valid until it expires), and RLS is row-level rather than column-level (see `RLS_PRIVATE_STORAGE_PLAN.md` accepted risks). Do not onboard real, uncontrolled user data until M-3–M-7 are also complete.
>
> D-1 (maintenance report gate, Bucket 2) is also now complete, but it does not change this warning — it's a workflow feature, not a security item. Bucket 1's remaining gaps (M-3–M-7) are the only blockers left before real, uncontrolled pilot data should be considered.

---

### Bucket 2 — Next demo iteration

Builds on Bucket 1. These are the features that give Qualcomm something new and concrete to see in the next demo — they resolve the bulk of the July feedback.

| # | Feature | Req ref | Complexity | Status |
|---|---|---|---|---|
| D-1 | Maintenance report upload + QC approval gate | §3-A | Medium | ✅ **Done** |
| D-2 | Start Date / Target Completion Date fields + display | §4-A | Low | Not started |
| D-3 | In-app reminder notification (1 hr before appointment) | §4-B | Medium | Not started |
| D-4 | In-app overdue notification (assigned POC only) | §4-C | Low | Not started |
| D-5 | Duty roster: monthly grid + manual assignment (no upload yet) | §2-A | Medium | Not started |
| D-6 | Vendor progress percentage quick win | §6-C | Low | Not started |
| D-7 | Mobile responsive pass (375px, collapsible sidebar, card tables) | §5-B | Medium | Not started |

**Estimated duration:** 4–5 weeks.
**Output:** The maintenance closure workflow Qualcomm asked for, visible due-date tracking, working in-app notifications, and a roster Qualcomm can actually use in a demo (even before upload/export exist).

**D-1 is complete** — see `supabase_d1_maintenance_report_migration.sql` and `PHASE2_REQUIREMENTS.md` §3-A for the full record. It shipped: `document_type`/`approval_status`/`reviewed_by`/`reviewed_at`/`review_note` on `appointment_documents`, upload-from-detail with a type selector, QC approve/reject UI for internal roles, and the Finished-status gate in both `AppointmentDetail.jsx` and `RequestTable.jsx`/`Requests.jsx`. It closed `RLS_PRIVATE_STORAGE_PLAN.md` Risk R-6.

**Accepted risks carried forward from D-1** (also documented in `PHASE2_REQUIREMENTS.md` §3-A and `README.md`):
- The gate checks for *any* approved report on the appointment, not necessarily the latest one.
- Reviewer identity (`reviewed_by`) is stored but not shown in the UI — `profiles` SELECT RLS is still self-read-only.
- No delete or edit-document-type flow exists — a mistagged upload needs a reject-and-reupload cycle to correct.

**Recommended next build has moved to Bucket 1's M-3–M-7** (see above) — a deliberately lightweight sprint before continuing further into Bucket 2 (D-2 onward).

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

## Concrete next-build plan — next 1 week

Bucket 1's security rollout (RLS on all six tables + private storage) and D-1 (maintenance report gate) are both **done** — see [RLS_PRIVATE_STORAGE_PLAN.md](RLS_PRIVATE_STORAGE_PLAN.md) and `PHASE2_REQUIREMENTS.md` §3-A for the full records of what shipped. What remains is a deliberately lightweight account-foundation sprint — five small, independent items that close out Bucket 1 entirely.

### D-1 — complete (for reference)

| Day | Task | Status |
|---|---|---|
| ~~1~~ | ~~`AppointmentDetail.jsx`: add a document-type selector to the upload flow.~~ | ✅ Done |
| ~~2~~ | ~~Build the QC approve/reject UI for internal roles.~~ | ✅ Done |
| ~~3~~ | ~~Gate the `Finished` transition in `RequestTable.jsx`/`Requests.jsx` and `AppointmentDetail.jsx`.~~ | ✅ Done |
| ~~4~~ | ~~Handle rejection and re-upload.~~ | ✅ Done |
| ~~5~~ | ~~Full regression across all roles.~~ | ✅ Done |

### This week — close out Bucket 1 (M-3–M-7)

| Day | Task |
|---|---|
| 1 | Add `is_active boolean default true` to `profiles`. Update `AuthContext.fetchProfile()` to sign out + block when inactive. Add the deactivated-account message to `Login.jsx`. (M-3) |
| 2 | Add "Forgot password?" link to `Login.jsx` using `supabase.auth.resetPasswordForEmail()`. Build the `/reset-password` route/page using `supabase.auth.updateUser({ password })`. (M-4) |
| 3 | Add `admin` to the `profiles.role` check constraint; extend `ROLE_ALLOWED_PREFIXES` in `App.jsx`. Add `is_conductor boolean default false` to `profiles` (no routing changes — display-only for now). Document the Supabase Dashboard invite process in `SUPABASE_SETUP.md`. (M-5, M-6, M-7) |
| 4 | Full regression across all 4 roles to confirm M-3–M-7 didn't disturb the RLS rollout or the D-1 maintenance report gate. **Bucket 1 is now fully complete.** |
| 5 | Buffer / start D-2 (Start Date / Target Completion Date fields) if the week finishes early. |

**End-of-sprint state:** all of Bucket 1 (M-1–M-7) complete. Combined with D-1 already shipped, this closes out the entire "must-have" security/identity foundation plus the first concrete demo feature — a clean point to pause before continuing further into Bucket 2 (D-2 onward) or considering real, uncontrolled pilot data.

---

## Dependency map

```
Bucket 1 (must-have): RLS ────────────────────────── ✅ done ┐
Bucket 1: Private storage ──────────────────────────  ✅ done ┤
Bucket 1: Deactivation + forgot-password + admin role ─ 🎯 next ┤
                                                         ↓
Bucket 2 (next demo): Maintenance report gate ──────  ✅ done ┐
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
