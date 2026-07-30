# FacilityFlow — Admin Guide

**Audience:** the pilot's admin (IT/facilities lead running the pilot).
**Scope:** everything an Admin does that a Manager can't — user lifecycle, site management, data cleanup, and monitoring. For workflows Admin shares with Manager (approvals, projects, etc.), see [MANAGER_GUIDE.md](MANAGER_GUIDE.md) — the Admin role has everything Manager has, plus the items below.

---

## Create users

**Account creation itself is a manual step, not self-service in-app.** FacilityFlow's in-app Admin → Users page manages *existing* accounts (role, status, profile fields) — it does not create new logins. This is deliberate: creating a real login requires the Supabase service-role key, which never runs in the browser for security reasons.

To add a new pilot user:

1. Go to the Supabase Dashboard for the project → **Authentication → Users → Add user**. Create the user with their real email and a temporary password.
2. Go to **Table Editor → `profiles`** (or run SQL) and insert a matching profile row for that user's new `id`, setting `role`, `display_name`, and — for vendors — `vendor_name` and `contact_name`. See `SUPABASE_SETUP.md` §0 for the exact insert pattern used for demo accounts; use the same shape with real values.
3. Confirm the account by logging into the **Admin → Users** page in the app (sidebar → Users, admin-only) and searching for the new user — it should now appear with the correct role and an **Active** status.
4. Send the user their login URL and temporary password directly (not broadcast email) and ask them to log in once to confirm access. They can change their password from **Settings → Security** after logging in, or use "Forgot password" on the login screen at any time.

> There is a visible "Invite a teammate" note at the top of the Admin → Users page in-app — it explains this same limitation to anyone who lands there expecting a self-service invite button.

> **Why this matters beyond login access:** a staff member only becomes selectable in **Schedule Management**'s "Add Shift" form (the tool that opens vendor booking availability — see [MANAGER_GUIDE.md § Open vendor booking availability](MANAGER_GUIDE.md#open-vendor-booking-availability)) and in **Duty Roster**'s staff suggestions once they exist here as an **active** admin/manager/staff account. Both dropdowns read live from this table — there's no separate staff list to maintain.

## Assign roles

Once an account exists, role changes ARE self-service in-app:

1. **Admin → Users** → click any user row to open the edit panel.
2. Change **Role** (Admin / Facilities Manager / On-site Staff / Vendor) from the dropdown.
3. For staff, optionally toggle **Conductor** — this is a badge marking a staff member as eligible for on-call/duty-roster assignment; it doesn't unlock extra pages, it's informational for whoever is filling the roster.
4. For vendor accounts, keep **Vendor Company** and **Contact Name** filled in and accurate — these values are what other users (and RLS-scoped queries) use to identify which vendor a booking or project task belongs to.
5. Click **Save**. Changes take effect immediately; the user does not need to log out/in.

**Note:** you cannot change your own role or deactivate your own account from this page — the edit panel disables those two fields when editing yourself, as a guardrail against accidentally locking yourself out.

## Deactivate users

1. **Admin → Users** → open the user → toggle **Active** off → **Save**.
2. A deactivated user is blocked at their *next* login attempt (existing open sessions are not force-killed immediately, so if this is urgent, treat "deactivate" as "prevent the next login," not "kill their current session instantly").
3. To restore access later, toggle **Active** back on — no data is lost; deactivation doesn't delete or hide any of that user's historical bookings, comments, or documents.
4. Use this for: a vendor pilot ending, a mistaken/duplicate account, or an internal user leaving the pilot team. There's no separate "delete user" flow in the app — deactivating is the supported way to remove access; a true delete would need to happen in the Supabase Dashboard and isn't recommended mid-pilot since it can break foreign-key references from that user's past activity.

## Manage sites

1. **Admin/Manager → Sites** (shared page — both roles can manage sites).
2. **Add Site** → enter a **Name** and optional short **Code** → Save. Names must be unique (a duplicate name shows an inline error, not a silent failure).
3. To retire a site without losing its history, click **Deactivate** on its row rather than deleting it — deactivated sites stay linked to any past appointment/project that referenced them, they just drop out of the "active sites" dropdown used when assigning a site to a new or existing appointment.
4. **Reactivate** the same way if needed.
5. For a small pilot, one or two sites is usually enough — only add sites you'll actually be scheduling real vendor visits against.

## Data cleanup

The **Data Audit** page (Admin/Manager → Data Audit) exists specifically to find and fix data-quality gaps before they cause confusion — most useful right after seeding/onboarding, and periodically during the pilot.

It surfaces four categories of appointment records that need attention:
- **Missing Site** — no site linked
- **Missing POC** — no assigned internal point-of-contact
- **Free-Text Only** — has a responsible-staff name typed as free text, but not linked to an actual profile (common with older or manually-entered records)
- **Inactive POC** — linked to a profile that has since been deactivated

For any flagged row, use the inline **Assign POC** / **Assign Site** dropdowns to fix it directly from the table — no need to open the full appointment detail page — then click **Save** on that row. Use the category filters, status filter, and search box to work through a backlog systematically rather than scrolling the full list.

## Monitor email notification logs

Email reminders/overdue alerts are sent by a scheduled backend job (GitHub Actions, once daily), never triggered from the browser — so "is email actually working" needs a way to check from outside your own inbox.

1. Go to **Settings → Notifications tab** (or wherever the **Email Diagnostics** panel is docked for your account — it's visible to Admin and Manager roles).
2. It shows the **last 8 notification log entries**: type (Overdue Alert / Reminder), recipient email, status, and timestamp.
3. Status values:
   - **sent** — delivered successfully via the email provider (Resend)
   - **failed** — the send attempt failed (check the underlying `notification_logs` table's error detail via Supabase SQL Editor for the specific reason — usually an invalid/unverified sender domain or an expired API key)
   - **skipped** — the job ran but determined no email was needed for that recipient at that time
4. **If you never see any rows at all** after a full day of pilot activity, something upstream is broken (the GitHub Actions workflow isn't running, or the Edge Function secret is misconfigured) — see `PILOT_TEST_CHECKLIST.md` § Troubleshooting for the exact diagnostic steps, or escalate to whoever set up the deployment.
5. This panel intentionally shows only the most recent 8 rows — for a full history or to run your own filters, query `notification_logs` directly in the Supabase SQL Editor (read-only access is enough; RLS already restricts this table to admin/manager).
