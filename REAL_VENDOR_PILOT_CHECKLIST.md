# FacilityFlow — Real Vendor Pilot Checklist

**Purpose:** the master checklist for moving FacilityFlow from demo/test data to a real vendor pilot. Everything technical (RLS, booking rules, mobile UX, email) was already validated in earlier passes — this document is specifically about the *data* transition: removing fictional demo data and replacing it with a small, real dataset.

**Current status going into this pass** (confirmed working, not re-verified here):
- Custom domain live: `https://www.facilityflowapp.com`
- Resend domain verified, `RESEND_FROM_EMAIL=notifications@facilityflowapp.com`, `APP_URL=https://www.facilityflowapp.com`
- Email function confirmed working via curl
- Vendor privacy audit passed ([VENDOR_ISOLATION_AUDIT.md](VENDOR_ISOLATION_AUDIT.md))
- Booking availability rule updated ([BOOKING_AVAILABILITY_DEBUG.md](BOOKING_AVAILABILITY_DEBUG.md) §9)
- Mobile vendor UX pass done ([MOBILE_PILOT_CHECKLIST.md](MOBILE_PILOT_CHECKLIST.md))

---

## 1. What's in the database right now

A read-only audit (via `supabase_pilot_cleanup_dry_run.sql`) found that **every single row** in `appointment_requests`, `staff_schedules`, `duty_rosters`, and `projects` (and everything under them) currently belongs to demo/test data — there is no real pilot data in this project yet. Specifically:

- **5 confirmed demo accounts**, all on the `@facilityflow.demo` domain: `manager@`, `staff@`, `vendor@`, `vendor2@`, `admin@facilityflow.demo`
- **1 ambiguous account** — a real-looking personal email, but with `display_name = "Test Vendor"` / `vendor_name = "Test Vendor Company"`. Not on the demo domain, so the cleanup scripts do **not** touch it automatically — see §3 below.
- **34 appointment_requests**, **3 projects** (and their tasks/comments/documents/vendor memberships), **13 staff_schedules** rows, **6 duty_rosters** rows — all created by or belonging to the demo accounts above, including a couple of leftover E2E-test bookings still sitting in `Pending` status.

> **Data quality note found during the audit:** `profiles.email` is stale for 4 of the 5 demo accounts — it shows a developer's personal email instead of the account's real Auth email. Don't trust `profiles.email` for anything account-identification-related; `auth.users.email` (joined via `profiles.id = auth.users.id`) is authoritative. Both cleanup scripts are written against `auth.users.email`, not `profiles.email`, for exactly this reason.

## 2. Cleanup strategy

1. **Run `supabase_pilot_cleanup_dry_run.sql`** in the Supabase SQL Editor. It is 100% read-only (every statement is a `SELECT`) — safe to run anytime, as many times as you want. Read every count it produces.
2. **Review §5 of the dry run's output** (the ambiguous "Test Vendor Company" account) and decide by hand whether it's real or should be cleaned up manually — neither cleanup script touches it automatically.
3. **Review §3 of the dry run's output** (should be empty) — if it returns any rows, a real appointment you're keeping references a demo project; resolve that by hand before running the execute script, or the project delete will fail with a foreign-key error (safely — the whole transaction rolls back, nothing partial happens).
4. **Only then, run `supabase_pilot_cleanup_execute.sql`.** It's wrapped in `begin; ... commit;` — if anything errors partway through, nothing commits. It deletes, in FK-safe order: `project_notifications` → `appointment_requests` (cascades documents/messages/status updates/logs) → `projects` (cascades members/tasks/vendor tasks/comments/documents/activity) → `staff_schedules` → `duty_rosters` → `profiles`. Full reasoning for that exact order — including one genuine circular foreign-key dependency between projects and appointments — is documented in the script's own header.
5. **The execute script does not touch `auth.users` or `sites`.** See §4 (Auth users) and the note below on sites.

**Sites are not deleted by either script.** The two demo projects' sites (`Qualcomm HQ Campus`, `Data Center Annex`) are reasonable to rename and reuse for a real site rather than delete — see `supabase_real_pilot_seed_template.sql` Part 1. If you'd rather have a clean site list, rename or deactivate them by hand via **Sites** in the app (Admin/Manager → Sites → Deactivate — this doesn't delete history, it just removes them from the "active sites" dropdown).

**This was tested before being handed to you:** the execute script was run against the live database wrapped in `rollback` instead of `commit` (i.e., every delete statement executed for real, in the real transaction, checked for constraint errors, then discarded) — zero errors, and the verification counts at the end matched expectations exactly (everything demo-owned goes to 0, the one ambiguous profile remains). Nothing was actually deleted by that test. You still get to decide when to actually commit it.

## 3. The ambiguous account — decide before or after cleanup

`display_name = "Test Vendor"`, `vendor_name = "Test Vendor Company"`, real-looking personal email. This was almost certainly created during earlier development/manual testing, not a real vendor — but because its email isn't on the `@facilityflow.demo` domain, neither script assumes that for you. Two options:

- **If it's not a real account:** deactivate it the normal way (**Admin → Users** → toggle Active off — see [ADMIN_GUIDE.md § Deactivate users](ADMIN_GUIDE.md#deactivate-users)), or delete its `profiles` row by hand with the same care as the execute script (check what references it first) plus the matching Auth Dashboard step in §4 below.
- **If you're not sure:** leave it deactivated but not deleted until you're certain — deactivating is reversible, deleting isn't.

## 4. Real account setup

### 4a. Create each real person's Auth user (manual, Supabase Dashboard)

FacilityFlow's account creation is deliberately manual — no self-service sign-up, and no script (including the seed template) creates an Auth user, because that requires the service-role key, which never runs from a script you paste into the SQL Editor. This is the same process documented in [ADMIN_GUIDE.md § Create users](ADMIN_GUIDE.md#create-users); repeated here with pilot-specific specifics:

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. Enter their real email address.
3. **Use a strong temporary password** — not a shared/simple one like the demo accounts use. A password manager's generated 16+ character password is fine; you'll be sending it to them directly (not by broadcast email) alongside the login URL.
4. Copy the new user's UUID (shown in the Users list, or in the row you just created) — you need it for the matching `profiles` insert.
5. Repeat for every real person: manager, staff/POC (if any), and one login per real vendor company.

### 4b. Create the matching `public.profiles` row (SQL, per person)

Use `supabase_real_pilot_seed_template.sql` Part 2 — it has the exact `insert` statement shape for manager/staff/vendor roles. Key points:

- `id` must be the exact UUID from the Auth user created in 4a — `profiles.id` has a foreign key straight to `auth.users.id`.
- **Set `is_active = true`** explicitly for every real pilot user (it's the column default, but set it explicitly anyway so it's never ambiguous in the script).
- Vendor rows need `vendor_name` (the company) and `contact_name` (the person) filled in — both are used throughout the app (booking form prefill, project vendor cards, etc.).

### 4c. Disable the demo accounts

After the real accounts exist and the data cleanup (§2) has run, disable the demo logins so they can't be used by mistake during the pilot:

1. **In the app** (fast, reversible): **Admin → Users** → for each `@facilityflow.demo` account still showing, toggle **Active** off. This blocks login immediately without touching Auth.
2. **In the Supabase Dashboard** (only if you also ran the cleanup execute script, so `profiles` rows are already gone): **Authentication → Users** → find each `@facilityflow.demo` row → use the row's menu to either **Delete user** (permanent) or leave it and rely on step 1's deactivation. This project's own rule ("do not delete `auth.users` from SQL") is about scripts, not about you personally choosing to delete them by hand in the Dashboard when you're ready — that's a normal, supported admin action, just never automate it.
3. Do this for all 5 confirmed demo accounts once you're done referencing them for anything (including finishing this checklist) — there's no reason to leave working demo logins active once a real pilot is live.

## 5. Real pilot seed

**The first pilot does not need a project or starter vendor tasks.** The minimum viable pilot is booking-only, and only needs Parts 1, 2, and 6 of `supabase_real_pilot_seed_template.sql`: 1 real site, the real people from §4 (interleaved — Auth user first, then the matching profile insert), and 1 bookable staff time slot. That's enough to exercise real booking, My Bookings, email notifications, and vendor isolation without touching Project Collaboration at all.

Everything else in the template — a real project, vendor project membership, 1–3 vendor tasks, a starter shared comment, a pre-seeded appointment — is genuinely **optional** and commented out by default in the template. Uncomment only the parts you actually want, and only once you're ready to try Project Collaboration with a real vendor. Starter vendor tasks in particular are not required for a first pilot; leave Part 5 commented out unless you have a specific reason to pre-populate one.

The template is not a run-as-is script either way — every `<ANGLE_BRACKET>` placeholder needs a real value, including in the required Parts 1/2/6.

Two rules baked into the template that are easy to get wrong by hand if you do use the optional project parts:
- **Part 4 (vendor project membership) must run before Part 5 (vendor tasks)** — a database trigger rejects a vendor task for a vendor who isn't already a project member.
- **The staff time slot in Part 6 is bookable by any vendor for any equipment type** — `equipment_type` there is recorded for display only; see §6 below.

## 6. What the docs clarify (and where)

These are the exact points this pilot's earlier passes established — restated here because they're the ones most likely to cause confusion for a first real pilot admin:

- **Duty Roster does not create bookable vendor slots.** It's an on-call/coverage record only. See [MANAGER_GUIDE.md § Open vendor booking availability](MANAGER_GUIDE.md#open-vendor-booking-availability).
- **Schedule Management is what creates bookable staff time slots.** Same section above.
- **Equipment type is recorded on every appointment request, but does not filter availability.** Any staff member's time slot is bookable by a vendor selecting any equipment type. See [BOOKING_AVAILABILITY_DEBUG.md](BOOKING_AVAILABILITY_DEBUG.md) §9.
- **Vendors can share a project's name/shell**, if a manager adds more than one vendor company to the same project — that's expected, not a leak. What stays isolated per vendor is their own tasks, comments, documents, and bookings. See [VENDOR_ISOLATION_AUDIT.md](VENDOR_ISOLATION_AUDIT.md)'s privacy rule section.
- **Vendors cannot read `staff_schedules` directly** — confirmed both at the database level (RLS) and via a real browser-session REST call in the E2E suite (`e2e/booking-availability.spec.js`). They only ever see availability through the `get_available_schedule_slots()` function.

## 7. Testing

- [ ] `npm run build` passes
- [ ] `npx playwright test --list` passes (structural check only — running the suite for real needs `E2E_BASE_URL` + credentials; see `e2e/README.md`)

## 8. Exact pilot smoke test (after cleanup + real seed are both done)

Steps 1–8 are the booking-only smoke test — everything a first pilot using just Parts 1/2/6 of the seed template needs. Steps 9–10 only apply if you also used the optional project parts (3/4/5/7); skip them otherwise.

1. **Admin**: log in with the real manager account (§4's temporary password) — confirm Dashboard loads, and the demo accounts no longer work if you disabled them in §4c.
2. **Manager**: open **Schedule Management**, confirm the real staff time slot from the seed template's Part 6 appears in its week.
3. **Vendor**: log in as the real vendor contact (§4's temporary password) — confirm they land on New Booking, and that **Vendor Projects** shows no demo-related content (empty is correct if you skipped the optional project parts).
4. **Vendor**: submit a real booking — pick any equipment type (not necessarily matching the seeded slot's tag), pick the seeded slot's date, confirm the slot from Part 6 appears and is selectable, submit, confirm an appointment code is returned.
5. **Manager**: back in **Requests**, confirm the vendor's real booking appears and can be approved/scheduled normally.
6. **Vendor**: open **My Bookings**, confirm the just-submitted booking appears with the correct status.
7. **Both roles**: confirm the notification bell shows the relevant activity from steps 4–5 (booking submitted → manager sees it; status change → vendor sees it).
8. **Admin**: check **Settings → Notifications → Email Diagnostics** (or query `notification_logs` directly) after the next scheduled cron run, confirm a `sent` row appears for the real pilot's activity — not just leftover demo-account log rows.
9. *(Only if you used the optional project parts)* **Manager**: open **Projects** → the real project — confirm Summary, the vendor membership (Vendors card), the vendor task(s) if any, and the starter comment (if seeded) all render correctly. **Vendor**: open **Vendor Projects → the project**, confirm they can update a vendor task's status (if one was seeded) and post a reply in the shared comment thread.
10. Confirm none of the 5 demo accounts can still log in (if disabled in §4c).

---

## Report checklist (for you to fill in once this is executed)

- [ ] Dry-run reviewed, counts matched expectations
- [ ] Ambiguous "Test Vendor Company" account resolved (§3)
- [ ] Execute script run, verification counts all zero (except the one ambiguous profile, if left alone)
- [ ] Real Auth users created for manager/staff/vendor (§4a)
- [ ] Matching `profiles` rows inserted (§4b)
- [ ] Demo accounts disabled (§4c)
- [ ] Real seed data created (§5)
- [ ] Smoke test (§8) passed end to end
