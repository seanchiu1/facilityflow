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
- **Internal profile visibility (M-9)** — a `profiles` RLS policy added by
  `supabase_sites_poc_linkage_migration.sql` lets any `admin`/`manager`/
  `staff` user read *other* internal profiles' rows (never `vendor` rows).
  This exists specifically so the Assigned POC dropdown on Appointment
  Detail can list active internal profiles, and so any internal viewer —
  not just admin — can resolve an already-linked POC's display name. It is
  additive to the original self-row-only SELECT policy from RLS Step 1;
  vendor's own read access is completely unchanged.

### Creating demo users

Do this in **Supabase Dashboard → Authentication → Users → Add user**:

| Email | Password | Role |
|---|---|---|
| `admin@facilityflow.demo`   | `FacilityFlow123!` | admin   |
| `manager@facilityflow.demo` | `FacilityFlow123!` | manager |
| `staff@facilityflow.demo`   | `FacilityFlow123!` | staff   |
| `vendor@facilityflow.demo`  | `FacilityFlow123!` | vendor  |
| `vendor2@facilityflow.demo` | `FacilityFlow123!` | vendor  |

`admin` and `vendor2` are needed to demo Admin User Management (`/admin/users`) and vendor-to-vendor isolation (Vendor Project Access, §16–§18) — without a second vendor account there is no one for Vendor A's isolation to be demonstrated against.

After creating each user, copy their UUID from the Users list, then run:

```sql
-- Admin
insert into profiles (id, role, display_name, email)
values ('<admin-uuid>', 'admin', 'Admin Wu', 'admin@facilityflow.demo');

-- Manager
insert into profiles (id, role, display_name, email)
values ('<manager-uuid>', 'manager', 'Manager Liu', 'manager@facilityflow.demo');

-- Staff
insert into profiles (id, role, display_name, email)
values ('<staff-uuid>', 'staff', 'Chen Wei-Ming', 'staff@facilityflow.demo');

-- Vendor 1 (vendor_name + contact_name are used by My Bookings, Appointment
-- Detail, and the Vendor Project Access pages)
insert into profiles (id, role, display_name, email, vendor_name, contact_name)
values ('<vendor-uuid>', 'vendor', 'David Lin', 'vendor@facilityflow.demo', 'Taiwan Elevator Services', 'David Lin');

-- Vendor 2 — a second, unrelated company. Used to demo that Vendor A can
-- never see Vendor B on a shared project (Vendor Project Access, §16).
insert into profiles (id, role, display_name, email, vendor_name, contact_name)
values ('<vendor2-uuid>', 'vendor', 'Amy Hsu', 'vendor2@facilityflow.demo', 'Formosa Fire Safety Co.', 'Amy Hsu');
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
  site_id                  uuid references sites(id),               -- M-9, nullable
  assigned_poc_profile_id  uuid references profiles(id),             -- M-9, nullable
  created_at       timestamp with time zone default now()
);

alter table appointment_requests
  add constraint appointment_requests_progress_percent_check
  check ( progress_percent between 0 and 100 );
```

If your table already exists from before M-9, run
`supabase_sites_poc_linkage_migration.sql` instead — it adds `site_id` and
`assigned_poc_profile_id` (both nullable, so every existing row keeps
working unchanged), creates the `sites` table (§1a below), and adds one new
`profiles` RLS policy so internal roles can resolve a linked POC's name.
`responsible_staff` is **not** dropped or backfilled — it stays the
free-text fallback for any appointment without a linked POC. See
`PHASE2_REQUIREMENTS.md` §4-D for the full design record.

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

## 1a. Sites table (M-9)

Structured replacement for what had been free text everywhere. See `supabase_sites_poc_linkage_migration.sql` for the full migration, including RLS.

```sql
create table if not exists sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- Managed at `/sites` — **admin and manager** (not admin-only, unlike `/admin/users`).
- No delete UI or RLS policy — deactivate (`is_active = false`), never delete. There's no app code path that removes a site row.
- Any authenticated user, including vendor, can read *active* sites — site names are non-sensitive labels, so this is safe and lets a vendor's own Appointment Detail resolve `site_id` → name without any broader grant. Only admin/manager can see inactive sites or write to the table.
- `duty_rosters.site` (§5a, D-5) is **not** linked to this table — it remains free text, deliberately not restructured in M-9. Duty Roster's site input's autocomplete suggestions now merge in active `sites` rows alongside whatever free-text values are already in use, but the underlying column is unchanged.

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
- **Real email delivery is not live yet** — the L-1 infrastructure
  (`send-notification-emails` Edge Function, `notification_logs`,
  secret-guarded invocation) is deployed and tested, but no Resend account/
  verified sender and no `pg_cron` schedule exist. In practice, the bell
  remains the only thing a user actually sees until §11's setup is
  finished. No SMS, push, or browser notification is planned for this pass.
- **No polling/cron for the in-app bell** — it fetches on page load, on
  language change, and when clicked; there is no scheduled job checking in
  the background for the in-app path. (The email path, once scheduled, will
  run independently on its own `pg_cron` interval — see §11.)
- **The 1-hour reminder window is filtered in JavaScript, over a limited
  candidate set** — `requested_date`/`start_time` can't be combined into a
  single "starts within the next hour" filter through PostgREST, so the
  query fetches up to 20 near-term rows and filters precisely client-side.
  On a day with unusually high appointment volume, a reminder near the edge
  of that candidate limit could theoretically be missed.
- **Assigned POC targeting is real for linked appointments only (M-9)** —
  an appointment with an active `assigned_poc_profile_id` now emails that
  specific person directly (additive to, not instead of, the existing
  admin/manager delivery). Appointments still using only the free-text
  `responsible_staff` — the common case for anything predating M-9 —
  behave exactly as before: in-app only, no individual targeting, since
  there's nothing to resolve to an email address.
- **No bulk backfill exists** for linking historical appointments' free-text
  `responsible_staff`/site to the new `assigned_poc_profile_id`/`site_id`
  columns — deliberately not attempted (fuzzy name-matching risks silently
  mis-linking a row). A deliberate, reviewed, one-time operation if wanted.
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
polish/demo-data-cleanup pass, roster Excel import/export (L-2), email
notification infrastructure (L-1), and structured Sites + Assigned POC
linkage (M-9) are all in place. **Bucket 1 is fully complete (through M-9),
Bucket 2's core feature arc (D-1–D-6) is done, and L-2 and L-1 are done.**
See `supabase_d6_vendor_progress_migration.sql` for the progress schema and
the `update_appointment_progress` RPC — no broad vendor UPDATE policy was
added to `appointment_requests`; the RPC does the narrowest safe thing
after an explicit ownership/role check. Roster Excel import/export needed
no new SQL or RLS at all — it reuses the `(roster_date, site)` unique
constraint and admin/manager policies already in place from D-5.

**L-1 is done as infrastructure, not as a live feature.** The
`send-notification-emails` Edge Function is deployed and has been tested:
a request without the required `x-notification-secret` header returns
`401` before any database query runs; a correctly-authenticated request
returns `503` and writes nothing to `notification_logs` while
`RESEND_API_KEY`/`RESEND_FROM_EMAIL` are unset. **No real email has been
sent** — that requires an actual Resend account with a verified
sender/domain and a `pg_cron` schedule, neither of which is configured.
**The next recommended step is finishing that operational setup** — see
§11 below for exact commands — which is configuration work, not more
code. **D-7 (mobile responsive pass)** remains deliberately later either
way, once the desktop workflow has had a chance to be demoed and settle.

**M-9 (§1a, §4-D) directly upgrades L-1**, without requiring any change to
L-1's own operational-setup steps below: once a Resend account and cron
schedule exist, any appointment with a linked, active Assigned POC will
receive its own direct email — not just the broad admin/manager list.

**Larger remaining backlog** (Bucket 3 + separate phase, unchanged in
priority, just restated here for a full picture): PWA/mobile packaging
(L-5, then D-7), service-role-backed account *creation* from
`/admin/users` (extends M-8), a bulk backfill tool for linking historical
appointments to `sites`/`assigned_poc_profile_id` (deliberately not built
in M-9), and Project Collaboration (its own separate phase, not yet
scoped).

---

## 11. Email notification infrastructure (L-1)

Run `supabase_l1_notification_logs_migration.sql` first — it creates
`notification_logs` (dedupe + audit trail for every send attempt) and its
RLS policy (admin/manager `SELECT` only; the Edge Function writes using the
service-role key, which bypasses RLS).

### Required secrets

Set with `supabase secrets set`, **never** in any frontend `.env` file or
anything under `src/`:

```bash
supabase secrets set \
  NOTIFICATION_FUNCTION_SECRET=$(openssl rand -hex 32) \
  RESEND_API_KEY=re_your_resend_api_key \
  RESEND_FROM_EMAIL="FacilityFlow <alerts@yourdomain.com>" \
  APP_URL=https://your-deployed-app-url
```

- `NOTIFICATION_FUNCTION_SECRET` — **required**, guards the function against
  being triggered by anyone holding the public anon key (which is shipped
  in every frontend bundle and would otherwise be sufficient to invoke any
  Edge Function). Every call must include a matching `x-notification-secret`
  header, checked before any database query or email send. Generate a
  random value once and store it only as this secret and inside the
  `pg_cron` job definition below — write it down nowhere else.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — required for actual email
  delivery (Resend). Without these the function returns a `503` and sends
  nothing.
- `APP_URL` — optional; adds an appointment link to each email if set.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every
Edge Function — do not set these yourself.

### Deploy

```bash
supabase functions deploy send-notification-emails
```

### Manual test

```bash
curl -i --request POST \
  'https://<project-ref>.functions.supabase.co/send-notification-emails' \
  --header "Authorization: Bearer <anon-or-service-role-key>" \
  --header "x-notification-secret: <the NOTIFICATION_FUNCTION_SECRET value>"
```

A request missing the `x-notification-secret` header, or sending the wrong
value, gets `401 Unauthorized` immediately — no appointments are queried,
no emails are sent, and nothing is written to `notification_logs`. A
correct call returns a JSON summary (`{ ok, reminders, overdue, sent,
failed, skipped }`). Recent send attempts are also visible in-app at
**Settings → Notifications** for admin/manager (read-only — that panel
only ever runs a `SELECT` against `notification_logs`; it never calls this
function).

### Scheduling (recommended: every 15 minutes)

```sql
select cron.schedule(
  'facilityflow-notification-emails',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/send-notification-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'x-notification-secret', '<the NOTIFICATION_FUNCTION_SECRET value>'
    )
  );
  $$
);
```

This SQL lives in the database (run once in the SQL Editor, via `pg_cron`
+ `pg_net`), not in any file committed to this repository — treat the
literal secret values pasted into it with the same care as any other
production credential.

---

## 12. Project Collaboration Lite

Run `supabase_projects_lite_migration.sql`. Creates three new tables plus
one new nullable column — see `PHASE2_REQUIREMENTS.md` §6-D for the full
scope record ("Lite" — no document library, comments, or group chat yet).

```sql
create table projects (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text,
  site_id                 uuid references sites(id),
  status                  text not null default 'Active',   -- Planning/Active/Blocked/Completed/Cancelled
  owner_profile_id        uuid references profiles(id),
  start_date              date,
  target_completion_date  date,
  created_by              uuid references profiles(id),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create table project_members (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  profile_id   uuid references profiles(id),
  project_role text default 'Member',   -- display-only for now, not permission-enforced
  created_at   timestamptz default now(),
  unique(project_id, profile_id)
);

create table project_tasks (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid references projects(id) on delete cascade,
  title                text not null,
  description          text,
  assignee_profile_id  uuid references profiles(id),
  status               text not null default 'Todo',   -- Todo/In Progress/Blocked/Done
  due_date             date,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- appointment_requests gains one nullable, additive column:
alter table appointment_requests add column project_id uuid references projects(id);
```

### Access model

- **admin/manager** — full read/write on `projects`, `project_members`, `project_tasks`. Can link any appointment to any project (the existing internal-role UPDATE policy on `appointment_requests` already covers the new `project_id` column — no RLS change was needed there).
- **staff** — read-only on the three tables, scoped to projects where they have a `project_members` row (checked via a new `is_project_member(project_id)` SECURITY DEFINER helper, same pattern as `is_admin_or_manager()`). Staff have **no UPDATE policy on `project_tasks` at all** — changing the status of their own assigned task goes through the `update_my_project_task_status(task_id, new_status)` SECURITY DEFINER RPC, which validates the status value, requires the caller to be the assignee and an internal role, and writes only `status` + `updated_at` (column-scoped by construction, which a row-level RLS policy cannot be). A project's `owner_profile_id` is kept present in `project_members` automatically by the `sync_project_owner_membership()` trigger, so a staff owner always passes `is_project_member()` for their own project.
- **vendor** — no policy on any of the three tables at all. No route, no nav item either (belt-and-suspenders, same pattern as `sites`/`admin/users`).
- Every policy is scoped `to authenticated` explicitly (matching the defense-in-depth pass applied to `sites`/`staff_schedules`/`profiles` earlier), not left to default to PUBLIC.
- No DELETE policy on `projects` or `project_tasks` — cancel a project via `status = 'Cancelled'` instead of deleting it. `project_members` uses `for all` for admin/manager, which does include delete (removing a member is a real, intended action, unlike deleting a project or task).

---

## 13. Project comments + activity feed (v1)

Run `supabase_project_comments_activity_migration.sql` (after §12's migration). Creates two tables and **supersedes `update_my_project_task_status()`** with a version that also logs each staff status change to the activity feed — running this file on an environment that already applied §12 upgrades the function in place.

```sql
create table project_comments (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects(id) on delete cascade,
  author_profile_id  uuid references profiles(id),
  body               text not null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table project_activity (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete cascade,
  actor_profile_id  uuid references profiles(id),
  activity_type     text not null,   -- project_created / status_changed / member_added
                                     -- / task_created / task_status_changed / appointment_linked
  summary           text not null,
  metadata          jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);
```

### Access model

- **Comments** — admin/manager read/post on any project; staff read/post only on projects they're a member of. Both INSERT paths are pinned to `author_profile_id = auth.uid()` in the policy, so no one can post as someone else. No UPDATE/DELETE policy — comments are immutable in v1.
- **Activity** — same read scoping as comments. INSERT is **admin/manager only** (pinned to `actor_profile_id = auth.uid()`); the one staff-driven event — their own task status change — is logged *inside* the `update_my_project_task_status()` RPC with definer rights, so staff need no INSERT policy at all. Append-only: no UPDATE/DELETE policy for any frontend role.
- **Vendor** — no policy on either table; RLS default-denies everything, and no vendor route renders this data anyway.
- All policies explicitly `to authenticated`.

### Honest limitation

Activity rows for admin/manager actions are inserted by the **frontend after each successful write** (fire-and-forget — a failed log never blocks the action it describes). The feed is therefore only as complete as the app code that remembers to log: a direct SQL/API write that bypasses the app inserts no activity row. This is an audit *convenience*, not a tamper-proof audit log. This is project comments/activity **v1**, not full chat — no realtime, threading, mentions, notifications, or comment editing.

---

## 14. Project Documents (v1)

Run `supabase_project_documents_migration.sql` (after §13's migration). Creates one metadata table and widens two things on `project_activity` from §13: the `activity_type` CHECK (adds `'document_uploaded'`) and — this is the one non-additive change — **the INSERT policy**, superseded from admin/manager-only to also allow staff on projects they're a member of (same shape as `project_comments`' policy). This was necessary, not optional: document upload is a second staff-triggerable event with no RPC of its own, and the brief for this feature explicitly calls for frontend-driven activity inserts rather than a bespoke RPC per event type.

```sql
create table project_documents (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects(id) on delete cascade,
  uploaded_by        uuid references profiles(id),
  file_name          text not null,
  file_path          text not null,
  file_type          text,
  file_size          bigint,
  document_category  text default 'General',
  created_at         timestamptz default now()
);
```

### Storage — reuses the existing private bucket, no policy changes

Project files live in the same private `appointment-documents` bucket as appointment documents, under a `projects/{project_id}/{timestamp}-{filename}` path — **no storage policy was added or modified.** The existing Step-6 policies (`supabase_private_storage_step6.sql`) already produce correct behavior for this prefix:
- The internal-role SELECT/INSERT storage policies check only `bucket_id` + `is_internal_role()`, so they cover any path in the bucket, project or appointment.
- The vendor storage policies join the file path's *first segment* against `appointment_requests.id`. The literal segment `'projects'` can never match an appointment UUID, so a vendor can neither read nor upload anything under this prefix — exclusion is structural, not policy-configured.

**Honest consequence, accepted:** at the storage layer, any internal role who somehow obtained a project file's exact path could fetch it even for a project they aren't a member of — the internal-role storage policies are bucket-wide. Member-scoping is enforced at the *metadata* layer instead: a file's path is only discoverable through its `project_documents` row, which RLS scopes to members, and paths embed an unguessable UUID + timestamp. This is the same trust model the appointment-documents feature already operates under ("internal reads all appointment documents" is also bucket-wide), just stated explicitly here.

### Access model

- **admin/manager** — read/upload on all projects.
- **staff** — read/upload only on projects where they have a `project_members` row (`is_project_member()`).
- **vendor** — no policy on `project_documents`, and structurally excluded from the storage prefix as above.
- No UPDATE/DELETE policy — documents are immutable in v1, no archive flow either.
- All policies explicitly `to authenticated`.

This is Project Documents **v1** — upload and view only. No versioning, per-document comments, replace/delete, or vendor access.

---

## 15. Project Notifications (v1, in-app only)

Run `supabase_project_notifications_migration.sql` (after §14's migration). Creates one table, `project_notifications`, and four SECURITY DEFINER functions — no other table changes.

```sql
create table project_notifications (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid references projects(id) on delete cascade,
  recipient_profile_id    uuid references profiles(id),
  actor_profile_id        uuid references profiles(id),
  notification_type       text not null check (...),
  title                   text not null,
  body                    text,
  related_task_id         uuid references project_tasks(id),
  related_comment_id      uuid references project_comments(id),
  related_document_id     uuid references project_documents(id),
  related_appointment_id  uuid references appointment_requests(id),
  is_read                 boolean not null default false,
  created_at              timestamptz default now()
);
```

### Why every write goes through an RPC, not a policy

Every other project_* table so far had one actor writing one row *about themselves* (a comment, an upload, an activity entry), so a policy of the shape `author_id = auth.uid()` was enough. Notifications are the opposite: one action (e.g. posting a comment) has to fan out into rows in *other people's* inboxes. An INSERT policy permissive enough to allow that would also let any caller write a row with a fabricated `recipient_profile_id`/`actor_profile_id`/content into anyone's inbox. So there is **no INSERT policy at all** — the only way a row can be created is through:

- `create_project_notification(project_id, recipient_profile_id, type, title, body, related_*...)` — single recipient (task assigned, member added). Silently no-ops if the recipient is the caller, a vendor, inactive, or nonexistent.
- `create_project_notifications_for_members(project_id, type, title, body, related_*...)` — fans out to every other active, non-vendor `project_members` row (comment added, document uploaded, appointment linked, task status changed).

Both re-derive the caller's access (`is_admin_or_manager()` or `is_project_member()`) and the recipient's eligibility server-side — nothing from the client is trusted beyond the type/title/body/related-ids being logged.

Marking read is the same story: Postgres RLS can't scope an UPDATE policy to just the `is_read` column, so instead of accepting a wider "you can update any column on your own row" policy, there is **no UPDATE policy either** — only `mark_project_notification_read(notification_id)` (one row) and `mark_all_project_notifications_read()` (all of the caller's unread rows).

### Access model

- **Everyone** (admin/manager/staff) reads only `recipient_profile_id = auth.uid()` — deliberately **no admin/manager bypass** to see other users' notification inboxes; unlike project content, there's no oversight reason to.
- **vendor** — never a possible recipient (the RPCs reject vendor `recipient_profile_id`s), and no route ever queries this table for a vendor session.
- No DELETE — a notification can be marked read but not dismissed/removed. No retention/cleanup policy exists yet.
- All policies explicitly `to authenticated`.

### Frontend behavior

The existing Topbar bell (previously: overdue alerts + starting-soon reminders + a per-role legacy summary) gained a fourth section, **Project Updates**, fetching only unread `project_notifications` rows (capped at 20, newest first) on the same schedule the bell already used — mount, language toggle, and dropdown-open — no new polling loop. Clicking a project notification navigates to `/projects/:id` and marks it read; a small check button appears on hover to mark read without navigating; a "mark all read" action sits in the section header. This is in-app only — no email, no push, no realtime.

**Event → notification wiring** (all fire-and-forget, mirroring how `project_activity` logging already works — a failed notification call never blocks or errors the action it describes):

| Event | Recipient(s) | Where |
|---|---|---|
| Task assigned/reassigned | The assignee | `ProjectDetail.jsx` `saveTask()` |
| Task status changed | Other project members | `ProjectDetail.jsx` `saveTask()` (manager edit) and `quickUpdateTaskStatus()` (both manager and staff-RPC paths) |
| New comment | Other project members | `ProjectDetail.jsx` `postComment()` |
| Document uploaded | Other project members | `ProjectDetail.jsx` `uploadDocs()` |
| Member added | The new member | `ProjectDetail.jsx` `addMember()` |
| Appointment linked | Other project members | `AppointmentDetail.jsx` `saveDates()` |

This is Project Notifications **v1** — in-app only, no email/push, no realtime push to the client, no per-user notification preferences, and no dismiss/delete beyond mark-read.

---

## 18. Project/Vendor Notifications (v1c, in-app only)

Run `supabase_vendor_project_notifications_v1c_migration.sql` (after §17's migration). Extends §11's in-app notification bell to cover the vendor-collaboration events added in §16/§17 — a vendor being assigned a task, an internal reply landing in their shared thread, a document being shared with them — and the reverse direction, where a vendor's own actions notify the internal team.

### No RLS changes — only new INSERT-side RPCs

`project_notifications`' existing SELECT policy (`recipient_profile_id = auth.uid()`) and both mark-read RPCs were already role-agnostic — a vendor reading or marking-read their own notification rows was already permitted by §11, there was simply no way for a vendor-recipient row to exist yet. This migration only adds the write side: two new columns/CHECK values plus two new SECURITY DEFINER functions.

### Schema

- `notification_type` CHECK widened with four values: `vendor_task_assigned`, `shared_comment_added`, `shared_document_uploaded`, `vendor_task_status_changed`.
- New column `related_vendor_task_id` (references `project_vendor_tasks`) — the existing `related_task_id` references `project_tasks` and would raise a foreign-key violation if a vendor task's id were ever inserted into it.

### Two new RPCs, not a widening of the old two

`create_project_notification()`/`create_project_notifications_for_members()` (§11) both gate on `is_internal_role()` as their first check — a vendor caller fails that immediately. Rather than weaken that gate, v1c adds two completely separate, narrowly-scoped functions:

- **`notify_vendor_project_event(project_id, vendor_profile_id, type, title, body, ...)`** — admin/manager-only caller, notifies exactly one named vendor. Verifies the target with `is_project_vendor_member(project_id, vendor_profile_id)` before writing anything — a vendor who was never added to the project (or has since been removed) cannot be notified even if a caller supplies their profile id. Rejects `vendor_task_status_changed` outright (that type only ever flows the other direction).
- **`notify_internal_vendor_project_event(project_id, type, title, body, ...)`** — vendor-only caller, verified with `current_profile_role() = 'vendor'` **and** `is_project_vendor(project_id)` (the caller must be a vendor member of *this specific* project). Recipients are computed server-side with the identical `project_members` query `create_project_notifications_for_members()` already uses — the vendor caller supplies only content, never a recipient list, so there is no path for a vendor to choose who gets notified. Rejects `vendor_task_assigned` outright (admin-initiated only).

Both functions silently no-op on any authorization or eligibility failure, matching every other notification RPC's fire-and-forget failure model.

### Frontend

- Topbar's "Project Updates" section now fetches for vendor sessions too (the earlier `if (user.role === 'vendor') return []` early-return in `fetchProjectItems()` is gone). Since vendors have no SELECT policy on `projects`, the project-name embed used for internal viewers is skipped for vendors — their project names are resolved instead from `get_my_vendor_projects()`, the same RPC `VendorProjects.jsx` already calls, adding no new vendor data access. Clicking a notification routes to `/projects/:id` for internal viewers and `/vendor-projects/:id` for vendors, based on the viewing user's own role — not anything stored on the notification row.
- Internal `ProjectDetail.jsx`: creating a vendor task, replying in a vendor's shared thread, and sharing a document with a vendor each call `notify_vendor_project_event()` for that one vendor.
- `VendorProjectDetail.jsx`: posting a shared comment, uploading a vendor-visible document, and changing a task's status each call `notify_internal_vendor_project_event()`.

### Honest scope

Still in-app only — no email or push. No vendor activity feed (`project_activity` gained no vendor SELECT policy and is untouched by this migration). No broadening of vendor data access anywhere — both new RPCs only ever write to `project_notifications`, whose read side was already vendor-safe.

---

## 16. Vendor Project Access (v1a)

Run `supabase_vendor_project_access_v1a_migration.sql` (after §15's migration). Lets multiple vendors participate in a project — sharing specific documents, a private comment thread, and their own linked appointments — **without** joining the internal collaboration surface in any way.

### The one rule that matters

**Vendors are never added to `project_members`, and `is_project_member()` is never modified.** A brand-new table, `project_vendor_members`, and a brand-new helper, `is_project_vendor(project_id)`, exist entirely in parallel. Every existing policy on `projects`/`project_members`/`project_tasks`/`project_activity`/`project_comments`/`project_documents`/`project_notifications` is untouched by this migration — this feature adds new, narrow policies alongside them rather than widening anything. The migration file's header carries a maintainer warning in bold about never OR-ing `is_project_vendor()` into an internal-facing policy — read it before touching any `project_*` RLS in the future.

### Vendor project reads: RPC only, no SELECT policy on `projects`

A vendor gets **zero** direct SELECT policy on `projects` — a row-level policy can't hide `description`/`owner_profile_id`/`created_by` from a vendor who has no business seeing them. Instead, two SECURITY DEFINER RPCs are the only way a vendor session reads project data:
- `get_my_vendor_projects()` — every project the caller is a vendor member of (id/name/status/site_name/dates only)
- `get_my_vendor_project(project_id)` — the same six columns for one project, empty if the caller isn't a vendor member of it

A third RPC, `get_vendor_directory()`, is admin/manager-only (raises otherwise) and exists purely to power the "add vendor" / "share with vendor" pickers on the internal Project Detail page — the ordinary internal-read `profiles` policy excludes vendor rows entirely (staff and manager both fail it; only `is_admin()` reads all profiles), so without this RPC even a manager couldn't resolve a vendor's display name.

### Documents and comments: same table, a `visibility` column, per-vendor isolation

Both `project_documents` and `project_comments` gained `visibility` (`'internal'` default, or `'vendor'`/`'shared'`) plus a `vendor_profile_id` column and a CHECK constraint pairing them — a `'vendor'`-visibility document can't exist without a `vendor_profile_id` and a `vendor-projects/...` path; an `'internal'` one can't have either. This is what makes a mislabeled row structurally impossible rather than just conventionally avoided.

Existing internal SELECT/INSERT policies are **unchanged** and that's correct: internal users already had blanket read/write on every row in a project they belong to, visibility or not, which is exactly the desired behavior (the internal team sees what's shared with a vendor too). Only two new vendor-scoped policies were added per table — a vendor may SELECT/INSERT rows where `vendor_profile_id = auth.uid()` on a project they're a vendor member of, nothing else. Vendor A cannot read Vendor B's shared thread or documents even though both live in the same tables, because a `'shared'` comment or `'vendor'` document tagged to Vendor B never matches Vendor A's `auth.uid()`.

### Storage: one new prefix, two new policies

Vendor-shared files live under `vendor-projects/{project_id}/{vendor_profile_id}/{timestamp}-{filename}` in the same private `appointment-documents` bucket. Two new storage policies scope this prefix to the vendor named in its own path (folder segment 3 = `auth.uid()`, and a `project_vendor_members` lookup confirms segment 2 is a project they're actually on). The existing Step-6 internal-role storage policies are bucket-wide with no path condition, so admin/manager/staff already read and write this prefix with **zero storage changes** on the internal side. Vendors remain structurally unable to reach the `projects/...` internal prefix or any appointment-id-keyed path — neither new policy matches those shapes.

### Access model

- **admin/manager** — add/remove vendors from a project (`project_vendor_members` full CRUD), share documents/comments with any vendor on the project, see the vendor roster via `get_vendor_directory()`.
- **staff** — no vendor-roster visibility in v1a (deliberately deferred — see below), but the existing internal document/comment read policies mean staff project members still see whatever's been shared with a vendor, same as admin/manager.
- **vendor** — reads/writes only their own membership row, their own shared documents, their own shared comment thread, and their own linked appointments (via the existing, unchanged vendor `appointment_requests` SELECT policy — no new policy needed there at all).
- All new policies explicitly `to authenticated`.

### Deferred, on purpose (v1a is not the full design)

- **`project_vendor_tasks`** — no vendor-assignable tasks yet; explicitly punted to v1b.
- **Staff visibility of the vendor roster** — would need to resolve vendor display names, and staff can't read vendor `profiles` rows; rather than build a second directory RPC just for staff, this is deferred rather than shipped half-safe.
- **Vendor activity/notifications** — every write path on `project_activity` and `project_notifications` gates on `is_internal_role()`, so vendor actions (a shared upload, a shared reply) currently raise no activity entry and notify no one. A vendor uploading a file happens silently as far as the internal team's bell/feed is concerned.
- **Vendor-to-vendor anything** — impossible by construction, not just policy: no query path, RPC, or embed ever returns another vendor's identity.

---

## 17. Vendor Project Tasks (v1b)

Run `supabase_vendor_project_tasks_v1b_migration.sql` (after §16's migration, including its hardening pass). Lets admin/manager assign a task to a specific vendor on a project; the vendor sees only their own tasks and can change only the status.

### Schema and the "no orphan task" guarantee

`project_vendor_tasks` is a table completely separate from `project_tasks` — vendor tasks never touch the internal task table, its RLS, or `update_my_project_task_status()`. A `before insert or update` trigger, `enforce_vendor_task_membership()`, calls the `is_project_vendor_member(project_id, vendor_profile_id)` helper from §16's hardening pass and rejects any row naming a vendor who isn't an actual `project_vendor_members` row for that same project. This one check also guarantees `vendor_profile_id` is role `vendor` — a profile can only be in `project_vendor_members` in the first place if it already passed that table's own role-enforcing trigger, so a second "is this a vendor" check would be redundant.

### RLS

- **admin/manager** — full CRUD (`for all`, mirroring `project_tasks`' own policy shape — DELETE is technically granted but no delete button exists in the UI, same as `project_tasks` today).
- **internal project members (staff)** — read-only, own projects only. Granted deliberately: this table carries no vendor PII beyond a `vendor_profile_id` UUID, and staff can't resolve that to a name anyway (no `profiles` read on vendor rows, no `get_vendor_directory()` access) — so the grant is safe even though the internal **UI** stays admin/manager-only in this pass (matching the Vendors card and doc-sharing controls already being admin/manager-gated).
- **vendor** — SELECT only where `vendor_profile_id = auth.uid() AND is_project_vendor(project_id)`. **No UPDATE policy at all.**

### Status-change RPC

`update_my_vendor_project_task_status(task_id, new_status)` is the *only* way a vendor can touch this table — same reasoning as `update_my_project_task_status()` for internal staff: RLS can't scope an UPDATE policy to one column, so a policy would let a vendor's browser rewrite title/description/due_date too, not just status. The RPC validates `new_status`, requires `current_profile_role() = 'vendor'`, requires `task.vendor_profile_id = auth.uid()`, and **re-checks `is_project_vendor(project_id)` at call time** — a vendor removed from the project after a task was assigned to them immediately loses the ability to update it, even though the task row still names them.

### Frontend

- Internal `ProjectDetail.jsx` gained a **Vendor Tasks** card (admin/manager only): create/edit a task, assign to any vendor already on the project's roster, inline status dropdown. Task creation and admin/manager-driven status edits log to `project_activity` (two new types, `vendor_task_created`/`vendor_task_status_changed`, added to that table's type CHECK) — the vendor's *own* status change via the RPC does **not** log activity, since `project_activity`'s INSERT policy only covers admin/manager or an internal project member.
- `VendorProjectDetail.jsx` gained a **My Tasks** section: read-only title/description/due date, a status dropdown wired to the RPC. No create, no edit of anything but status.

### Honest scope

This is Vendor Project Tasks **v1b** — no vendor task notifications (the notification-creation RPCs from `supabase_project_notifications_migration.sql` gate on `is_internal_role()`, same as activity logging, and extending them to cover vendor-initiated events is deliberately deferred), no vendor-initiated task creation, no due-date reminders, no dependency graph.
