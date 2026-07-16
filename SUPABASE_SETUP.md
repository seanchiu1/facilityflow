# Supabase Setup — FacilityFlow

Run all SQL in **Supabase Dashboard → SQL Editor**. Create the storage bucket via the Dashboard or the SQL shortcut shown below.

---

## 0. Auth user profiles table

This table links Supabase Auth users to their role and display name. Create it before creating any demo users.

```sql
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('admin', 'manager', 'staff', 'vendor')),
  display_name text not null,
  email        text,
  vendor_name  text,
  contact_name text,
  is_active    boolean not null default true,
  is_conductor boolean not null default false,
  created_at   timestamp with time zone default now()
);
```

If your `profiles` table already exists from before Phase 2's account foundation
work, run `supabase_m3_m7_account_foundation_migration.sql` instead of
recreating the table — it adds `is_active`/`is_conductor` and widens the
`role` constraint to include `'admin'` on an existing table. If it predates
`email` and the admin-facing RLS policies (M-8), also run
`supabase_m8_admin_user_management_migration.sql`.

- `email` — nullable, entered manually at account-creation time (see below).
  Supabase does not expose `auth.users` to the frontend at all (no service-role
  key in the browser), so this column is the safe way for the in-app
  **User Management** page (`/admin/users`, admin role only) to display an
  email without a database trigger on the protected `auth` schema. Existing
  rows created before this column existed will show no email until backfilled.

- `is_active` — set to `false` to deactivate a user without deleting their
  account. They are signed out (if currently logged in) and blocked at their
  next login attempt, with a clear message. Deactivate/reactivate with:
  ```sql
  update profiles set is_active = false where id = '<user-uuid>';  -- deactivate
  update profiles set is_active = true  where id = '<user-uuid>';  -- reactivate
  ```
- `is_conductor` — a display-only flag for `staff`-role users. It does **not**
  grant or change any access — a Conductor has identical permissions to
  regular Staff. It only adds a "· Conductor" label next to their name in the
  Sidebar and Settings, for future duty-roster grouping.
  ```sql
  update profiles set is_conductor = true where id = '<staff-user-uuid>';
  ```
- `admin` role — has the same access as `manager`, plus the in-app **User
  Management** page at `/admin/users` (M-8): search/filter existing accounts,
  edit display name, role, active status, Conductor flag, and vendor fields.
  Creating a brand-new account is still a Supabase Dashboard step (see
  "Vendor account invites" below) — automating that requires a service-role
  key, which must never reach the browser.

### Creating demo users

Do this in **Supabase Dashboard → Authentication → Users → Add user**:

| Email | Password | Role |
|---|---|---|
| `manager@facilityflow.demo` | `FacilityFlow123!` | manager |
| `staff@facilityflow.demo`   | `FacilityFlow123!` | staff   |
| `vendor@facilityflow.demo`  | `FacilityFlow123!` | vendor  |

After creating each user, copy their UUID from the Users list, then run:

```sql
-- Manager
insert into profiles (id, role, display_name, email)
values ('<manager-uuid>', 'manager', 'Manager Liu', 'manager@facilityflow.demo');

-- Staff
insert into profiles (id, role, display_name, email)
values ('<staff-uuid>', 'staff', 'Chen Wei-Ming', 'staff@facilityflow.demo');

-- Vendor (vendor_name + contact_name are used by My Bookings and Appointment Detail)
insert into profiles (id, role, display_name, email, vendor_name, contact_name)
values ('<vendor-uuid>', 'vendor', 'David Lin', 'vendor@facilityflow.demo', 'Taiwan Elevator Services', 'David Lin');
```

Once these rows exist, an admin can also edit any of these fields later from
**User Management** (`/admin/users`) instead of writing SQL by hand — except
`email`, which stays SQL/Dashboard-only for now (not exposed as an editable
field in the UI, since it must stay a deliberate, auditable action tied to
the real `auth.users` invite, not a free-text field disconnected from login).

> **Password note:** `FacilityFlow123!` is a demo password for local development only.
> Never commit real credentials. For production, use Supabase's invite flow or a secrets manager.

---

### Vendor account invites (current process — no in-app UI yet)

FacilityFlow does not yet have an in-app "Create User" page. Until it does
(tracked as later production work, see `PHASE2_ROADMAP.md` item L-4), a
Qualcomm Admin creates every account — including vendor accounts — directly
through the Supabase Dashboard:

1. **Supabase Dashboard → Authentication → Users → Invite user.** Enter the
   vendor's real email address. Supabase sends them an email with a secure
   link to set their own password — the Admin never sees or sets it.
2. The vendor clicks the link, sets their password, and is now a valid
   `auth.users` row.
3. Copy their new UUID from the Users list, then create their `profiles` row:
   ```sql
   insert into profiles (id, role, display_name, email, vendor_name, contact_name)
   values ('<new-vendor-uuid>', 'vendor', '<contact display name>', '<vendor email>', '<company name>', '<contact display name>');
   ```
4. The vendor can now log in normally at the FacilityFlow login screen. An
   admin can review or edit their role, active status, or company details
   any time afterward from **User Management** (`/admin/users`).

**Deactivating a vendor (or any user)** — no need to delete their `auth.users`
row. Set `is_active = false` on their `profiles` row (see above); they're
signed out and blocked from logging back in until reactivated.

**Forgot password** — vendors (and all roles) can now self-serve this from
the Login screen's "Forgot password?" link — no Admin action needed. See the
README's Security notes for how this flow works.

**Why this is enough for now:** the Dashboard invite flow already satisfies
"Admin invites vendors, vendors manage their own account" without any custom
code — building a dedicated in-app admin page is real effort (it needs a
Supabase Edge Function, since creating users requires the service-role key,
which must never reach the browser) and isn't required at pilot scale. This
manual process is the intentional interim state, not a placeholder for
something broken.

---

## 1. Core appointment table

```sql
create table if not exists appointment_requests (
  id               uuid primary key default gen_random_uuid(),
  vendor_name      text not null,
  contact_name     text not null,
  vendor_user_id   uuid references auth.users(id),
  equipment_type   text not null,
  requested_date   date not null,
  start_time       time,
  end_time         time,
  responsible_staff text,       -- Assigned POC, displayed as such since D-2
  priority         text default 'Medium',
  status           text default 'Pending',
  description      text,
  start_date               timestamptz,   -- D-2, internal-role-editable
  target_completion_date   timestamptz,   -- D-2, internal-role-editable
  progress_percent integer not null default 0,  -- D-6, 0-100, see below
  created_at       timestamp with time zone default now()
);

alter table appointment_requests
  add constraint appointment_requests_progress_percent_check
  check ( progress_percent between 0 and 100 );
```

If your table already exists from before D-2, run
`supabase_d2_target_dates_migration.sql` instead — it adds `start_date` and
`target_completion_date` (both nullable, so existing rows remain valid) plus
an index on `target_completion_date` anticipating D-4's future overdue query.

If your table already exists from before D-6, run
`supabase_d6_vendor_progress_migration.sql` instead — it adds
`progress_percent` (defaulting existing rows to 0) plus the
`update_appointment_progress(appointment_id, new_progress)` RPC function.
Vendors update their own appointment's progress **through this RPC only**,
not a direct table UPDATE — see the migration file's header comment for why
a SECURITY DEFINER function was used instead of a vendor UPDATE policy
(Postgres RLS can't restrict which columns a policy covers, only which
rows, so a "scoped" vendor UPDATE policy would still let a vendor's browser
touch any column on their own row, not just progress).

Valid `status` values (used across the whole app):
`Pending` · `Approved` · `Scheduled` · `In Progress` · `50% Finished` · `Finished` · `Cancelled` · `Delayed` · `Need More Info`

Valid `priority` values: `High` · `Medium` · `Low`

### Migration — if the table already exists

If you created `appointment_requests` before adding auth, run this migration to add `vendor_user_id`:

```sql
alter table appointment_requests
  add column if not exists vendor_user_id uuid references auth.users(id);

create index if not exists idx_appointment_requests_vendor_user_id
  on appointment_requests(vendor_user_id);
```

Existing rows will have `vendor_user_id = NULL`. The app handles this gracefully — it falls back to `vendor_name` + `contact_name` matching for legacy rows.

---

## 2. Staff schedules table

Managers publish schedule slots here; vendors book into them via the Vendor Booking form.

```sql
create table if not exists staff_schedules (
  id             uuid primary key default gen_random_uuid(),
  staff_name     text not null,
  equipment_type text not null,
  schedule_date  date not null,
  start_time     time not null,
  end_time       time not null,
  capacity       integer default 3,
  notes          text,
  created_at     timestamp with time zone default now()
);
```

`capacity` controls how many vendors can book the same slot (visual-only indicator in the booking form — the table does not enforce this as a hard constraint).

---

## 3. Appointment messages table

One message thread per appointment. `sender_role` must match a valid app role.

```sql
create table if not exists appointment_messages (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointment_requests(id) on delete cascade not null,
  sender_name    text not null,
  sender_role    text not null,   -- 'manager' | 'staff' | 'vendor'
  message        text not null,
  created_at     timestamp with time zone default now()
);
```

---

## 4. Appointment documents table

Metadata for files uploaded to Supabase Storage. The actual files live at
`appointment-documents/{appointment_id}/{timestamp}-{filename}`.

```sql
create table if not exists appointment_documents (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointment_requests(id) on delete cascade not null,
  file_name      text not null,
  file_path      text not null,
  file_type      text,
  file_size      integer,
  uploaded_by    text,
  created_at     timestamp with time zone default now()
);
```

---

## 5. Status history table

Records every status transition so the timeline in Appointment Detail persists across refreshes.

```sql
create table if not exists status_updates (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid references appointment_requests(id) on delete cascade not null,
  old_status       text,
  new_status       text not null,
  changed_by       text,
  changed_by_role  text,
  note             text,
  created_at       timestamp with time zone default now()
);

create index if not exists idx_status_updates_appt
  on status_updates(appointment_id, created_at);
```

---

## 5a. Duty roster table (D-5)

One row per site per day — the monthly on-call assignment shown at `/roster`. See `supabase_d5_duty_roster_migration.sql` for the full migration, including the `updated_at` trigger and RLS policies.

```sql
create table if not exists duty_rosters (
  id                uuid primary key default gen_random_uuid(),
  roster_date       date not null,
  site              text not null,
  duty_staff_name   text not null,
  duty_staff_phone  text,
  duty_staff_email  text,
  notes             text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table duty_rosters
  add constraint duty_rosters_date_site_unique unique (roster_date, site);
```

- `site` is free text, not a formal lookup table — matches the original §2-A decision; the roster page's site filter derives its options from distinct values already in the table.
- `duty_staff_name`/`phone`/`email` are free text on the row itself, **not** linked to `profiles.id` — a deliberate scope decision for this pass (see `PHASE2_REQUIREMENTS.md` §2-A for the corrected record; the original spec called for a `profiles`-linked `assigned_profile_id`, which was not built).
- RLS: admin/manager full access, staff read-only, vendor no access at all (no policy grants vendor anything on this table).

---

## 6. Supabase Storage bucket

Create the bucket as **private** — do not toggle "Public bucket" on.

### Option A — Dashboard (recommended)

1. Go to **Supabase Dashboard → Storage → New Bucket**
2. Name: `appointment-documents`
3. Leave **Public bucket** OFF
4. Save

### Option B — SQL

```sql
insert into storage.buckets (id, name, public)
values ('appointment-documents', 'appointment-documents', false)
on conflict do nothing;
```

If the bucket already exists as public (e.g., from an earlier setup), switch it with:

```sql
update storage.buckets set public = false where id = 'appointment-documents';
```

---

## 7. Storage policies

The bucket is private, so every read and write is governed by RLS policies on
`storage.objects`, scoped the same way as the application tables:

- **Internal roles** (admin/manager/staff) can read and upload to any appointment's folder.
- **Vendors** can read and upload only to the folder for an appointment they own —
  checked by extracting the first path segment (the appointment's UUID) from the
  file path with `storage.foldername(name)[1]` and joining to
  `appointment_requests.vendor_user_id = auth.uid()`.
- No UPDATE or DELETE policy — there is no replace/delete-file feature in the app.

See `supabase_private_storage_step6.sql` for the full migration. Summary:

```sql
update storage.buckets set public = false where id = 'appointment-documents';

create policy "internal reads all appointment documents"
  on storage.objects for select
  using (
    bucket_id = 'appointment-documents'
    and public.is_internal_role()
  );

create policy "vendor reads own appointment documents"
  on storage.objects for select
  using (
    bucket_id = 'appointment-documents'
    and exists (
      select 1 from appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );

create policy "internal uploads to any appointment folder"
  on storage.objects for insert
  with check ( bucket_id = 'appointment-documents' and public.is_internal_role() );

create policy "vendor uploads to own appointment folder"
  on storage.objects for insert
  with check (
    bucket_id = 'appointment-documents'
    and exists (
      select 1 from appointment_requests ar
      where ar.id::text = (storage.foldername(name))[1]
        and ar.vendor_user_id = auth.uid()
    )
  );
```

### Signed URL behavior

Because the bucket is private, the app never uses `getPublicUrl()`. Document links
in `AppointmentDetail.jsx` are generated with:

```js
const { data } = await supabase.storage
  .from('appointment-documents')
  .createSignedUrl(doc.file_path, 3600)
```

Signed URLs are valid for **1 hour** from generation and are fetched fresh each
time the Appointment Detail page loads (not cached or stored in the database).
Generating a signed URL is itself gated by the SELECT policy above — a caller
must already be authorized to read the object before Supabase will mint a URL
for it, so there is no separate authorization check needed in the app beyond
calling `createSignedUrl` for a document the user is allowed to see.

---

## 8. Recommended indexes (optional, for performance)

```sql
create index if not exists idx_appointment_requests_date
  on appointment_requests(requested_date);

create index if not exists idx_appointment_requests_status
  on appointment_requests(status);

create index if not exists idx_appointment_requests_vendor
  on appointment_requests(vendor_name, contact_name);

create index if not exists idx_staff_schedules_date_equip
  on staff_schedules(schedule_date, equipment_type);

create index if not exists idx_appointment_messages_appt
  on appointment_messages(appointment_id, created_at);

create index if not exists idx_appointment_documents_appt
  on appointment_documents(appointment_id);
```

---

## 9. Sample data (optional, for demo)

Add a few schedule slots so the booking form has slots to show:

```sql
-- Example: two HVAC slots for a weekday (adjust dates as needed)
insert into staff_schedules
  (staff_name, equipment_type, schedule_date, start_time, end_time, capacity, notes)
values
  ('Chen Wei-Ming', 'HVAC',     '2026-07-01', '09:00', '12:00', 3, 'Morning HVAC window'),
  ('Chen Wei-Ming', 'HVAC',     '2026-07-01', '14:00', '17:00', 2, 'Afternoon HVAC window'),
  ('Lin Mei-Hui',   'Elevator', '2026-07-01', '10:00', '12:00', 2, null),
  ('Wang Da-Wei',   'Electrical','2026-07-02', '09:00', '11:00', 3, null);
```

---

## 10. Security notes

### Current state

- Supabase Auth (email + password) is enabled; `profiles.role` drives app-level routing.
- **Row Level Security is enabled on all six application tables:** `profiles`,
  `appointment_requests`, `appointment_messages`, `appointment_documents`,
  `status_updates`, `staff_schedules`. Internal roles (admin/manager/staff) have
  broad read/write access; vendors are scoped to rows tied to their own
  `vendor_user_id`. See `RLS_PRIVATE_STORAGE_PLAN.md` for the full policy design
  and `supabase_rls_step1_profiles.sql` through `supabase_rls_step5_staff_schedules.sql`
  for the migrations that implemented it.
- **The `appointment-documents` storage bucket is private.** Documents are only
  accessible via signed URLs (see §7), scoped by the same ownership rules as
  `appointment_documents` — see `supabase_private_storage_step6.sql`.
- **Account foundation is in place:** deactivation (`is_active`), self-service
  password reset, an `admin` role, and a Conductor display flag
  (`is_conductor`) — see `supabase_m3_m7_account_foundation_migration.sql`
  and "Vendor account invites" above.
- The Supabase **anon key** is still used client-side (this is normal and expected
  for a Supabase app — RLS is what makes this safe, not keeping the key secret).

This makes the system meaningfully safer for **pilot-style testing with
controlled/synthetic data** — a vendor genuinely cannot read or write another
vendor's rows or documents anymore, whether through the UI or the browser
console directly. **This is not the same as being fully production-ready** —
see the accepted risks below and `PHASE2_ROADMAP.md` Bucket 1 for what
remains before real, uncontrolled Qualcomm/vendor data should go in.

### Still open (tracked in PHASE2_ROADMAP.md, not blocking further feature work)

- RLS is row-level, not column-level — an internal role can update any column on
  a row it can see, not just `status`. Accepted MVP risk (see
  `RLS_PRIVATE_STORAGE_PLAN.md` Risk R-7).
- **Account creation is still Supabase-Dashboard-only** — `/admin/users`
  (M-8) covers listing, searching, filtering, and editing *existing*
  accounts (role, active status, Conductor, vendor/contact fields), but
  creating a brand-new `auth.users` row still requires the Dashboard invite
  flow (see "Vendor account invites" above) — automating that needs a
  service-role-backed Edge Function, not built here.
- **`profiles.email` may need manual backfill** — populated going forward at
  account-creation time; rows from before the M-8 migration show no email
  in User Management until backfilled.
- **No super-admin tier and no audit log** — every `admin` account has
  identical privileges (one admin can edit or demote another, self-edit
  excepted), and `/admin/users` writes directly to `profiles` with no
  history of who changed what.
- **Conductor is display-only** — `is_conductor = true` only adds a label
  next to a staff member's name; the underlying `role` remains `staff` and
  access is identical to any other staff account.
- **Conductor badges are only shown for the logged-in user's own account** —
  `profiles` SELECT RLS is still self-read-only, so the app has no way to
  look up whether *another* staff member (e.g., the "Assigned Staff" on an
  appointment) is a Conductor.
- Signed document URLs expire after **1 hour** and are fetched fresh on each
  page load, not cached — a tab left open longer than that needs a refresh.
  Working as designed, not a defect.
- Maintenance report gate (D-1) checks for *any* approved report on an
  appointment, not necessarily the latest one; reviewer identity
  (`reviewed_by`) is stored but not shown in the UI; no delete or
  edit-document-type flow exists. See `PHASE2_REQUIREMENTS.md` §3-A.
- **Assigned POC is still free text, not linked to a `profiles` row** — it's
  the existing `responsible_staff` column; editing it just overwrites a
  string, with no dropdown against real staff accounts.
- **Start Date / Target Completion Date depend on the browser's local
  clock** — set via `<input type="datetime-local">`, converted to UTC on
  save using the browser's timezone. A misconfigured system clock on the
  editing device produces an equally-wrong stored value.
- **Notifications (D-3/D-4) are in-app only** — the bell shows reminder and
  overdue items, but there is no email, SMS, push, browser notification, or
  background job of any kind. Nothing fires if the app isn't open.
- **No polling/cron** — the bell fetches on page load, on language change,
  and when clicked. There is no scheduled job checking for new reminders or
  overdue items in the background; a notification only appears once someone
  opens (or reloads) the app.
- **The 1-hour reminder window is filtered in JavaScript, over a limited
  candidate set** — `requested_date`/`start_time` can't be combined into a
  single "starts within the next hour" filter through PostgREST, so the
  query fetches up to 20 near-term rows and filters precisely client-side.
  On a day with unusually high appointment volume, a reminder near the edge
  of that candidate limit could theoretically be missed.
- **Assigned POC is shown, not targeted** — reminder and overdue
  notifications display the Assigned POC's name as text, but delivery is
  not scoped to "only that person" — any internal role (admin/manager/
  staff) sees the same notifications, since `responsible_staff` isn't
  linked to a real `profiles` row to filter against.
- **Calendar's target-completion-date marker remains deferred** — D-2/D-3
  added an overdue badge/dot to the existing appointment card (keyed to the
  visit date), but no marker is placed on the Target Completion Date's own
  calendar cell, since that date can fall on a different day than the visit
  and the calendar's grouping logic is built around one date per event.
- **Duty staff is free text, not linked to accounts** — `duty_rosters.duty_staff_name`
  (and phone/email) are entered manually, with no connection to `profiles.id`.
  A typo creates a "new" person with no link to any real account.
- **The `xlsx` npm package (roster Excel import/export, §2-B) has known
  audit findings** — prototype pollution and ReDoS advisories with no fix
  currently published to npm. Accepted given parsing is browser-only and
  import is admin/manager-gated, not open to arbitrary users.
- **Roster import validation is whole-batch, not partial** — one invalid
  row blocks the whole uploaded file from saving; there is no "import just
  the valid rows" option.
- **Duplicate `(Date, Site)` rows within one imported file are silently
  deduplicated**, keeping the last occurrence, rather than flagged.
- **Roster print uses the browser's print dialog, not real PDF generation**
  — same `window.print()` approach as Weekly Report, not a dedicated PDF
  library.
- **No concurrent-edit conflict handling** — if two admins edit the same
  site+date assignment at the same time, the last save silently wins.
- **No formal `sites` lookup table** — `site` stays free text on each row;
  the filter dropdown is just the distinct values seen so far.
- **Roster delete uses the browser's native `confirm()` dialog**, not a
  styled in-app confirmation modal — functional but visually inconsistent
  with the rest of the app.
- **No progress history/audit trail** — `progress_percent` stores only the
  current value; there is no record of who changed it or what it was
  before, unlike `status_updates` for status changes.
- **Progress and status are intentionally decoupled and can look
  inconsistent** — an appointment can show 100% progress while still
  `Pending`, or a low percentage on a `Finished` appointment. Nothing
  reconciles the two. This is by design (progress must never
  auto-trigger a status change), not a bug.
- **No shared `ProgressBar` component yet** — the compact progress bar is
  implemented independently in four places (`AppointmentDetail.jsx`,
  `RequestTable.jsx`, `Dashboard.jsx`, `WeeklyReport.jsx`). Consistent with
  this codebase's existing pattern of small per-file duplication, but worth
  consolidating if a fifth surface needs it.

### Recommended next step

RLS, private storage, the maintenance report gate (D-1), the account
foundation (M-3–M-7), in-app Admin User Management (M-8), the target-date
foundation (D-2), in-app reminder/overdue notifications (D-3/D-4), the duty
roster monthly grid (D-5), vendor progress percentage (D-6), the desktop
polish/demo-data-cleanup pass, and roster Excel import/export (L-2) are all
in place. **Bucket 1 is fully complete (through M-8), Bucket 2's core
feature arc (D-1–D-6) is done, and L-2 is done.** See
`supabase_d6_vendor_progress_migration.sql` for the progress schema and the
`update_appointment_progress` RPC — no broad vendor UPDATE policy was added
to `appointment_requests`; the RPC does the narrowest safe thing after an
explicit ownership/role check. Roster Excel import/export needed no new SQL
or RLS at all — it reuses the `(roster_date, site)` unique constraint and
admin/manager policies already in place from D-5.

**The next recommended step is email notification infrastructure for the
D-3/D-4 reminder and overdue alerts (§4-B / §4-C, Bucket 3 L-1)** — those
alerts currently only appear in-app in the notification bell; nothing fires
while the app isn't open. The scoped build is a Supabase Edge Function that
reuses the existing reminder/overdue query logic already built for the
bell, triggered on a schedule (likely `pg_cron`), with an email provider
decision (e.g. Resend, Postmark) and its API key stored as a Supabase
secret — never in the frontend. **D-7 (mobile responsive pass)** remains
deliberately later, once the desktop workflow has had a chance to be
demoed and settle.

**Larger remaining backlog** (Bucket 3 + separate phase, unchanged in
priority, just restated here for a full picture): email/push notification
infrastructure for D-3/D-4 (L-1 — next up), PWA/mobile packaging (L-5, then
D-7), service-role-backed account *creation* from `/admin/users` (extends
M-8), and Project Collaboration (its own separate phase, not yet scoped).
