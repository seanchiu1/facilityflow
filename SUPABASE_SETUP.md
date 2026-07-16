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
`role` constraint to include `'admin'` on an existing table.

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
- `admin` role — has the same access as `manager` today, plus a reserved
  `/admin` route prefix for a future admin UI (not yet built — see
  "Vendor account invites" below for how account management works today).

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
insert into profiles (id, role, display_name)
values ('<manager-uuid>', 'manager', 'Manager Liu');

-- Staff
insert into profiles (id, role, display_name)
values ('<staff-uuid>', 'staff', 'Chen Wei-Ming');

-- Vendor (vendor_name + contact_name are used by My Bookings and Appointment Detail)
insert into profiles (id, role, display_name, vendor_name, contact_name)
values ('<vendor-uuid>', 'vendor', 'David Lin', 'Taiwan Elevator Services', 'David Lin');
```

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
   insert into profiles (id, role, display_name, vendor_name, contact_name)
   values ('<new-vendor-uuid>', 'vendor', '<contact display name>', '<company name>', '<contact display name>');
   ```
4. The vendor can now log in normally at the FacilityFlow login screen.

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
  responsible_staff text,
  priority         text default 'Medium',
  status           text default 'Pending',
  description      text,
  created_at       timestamp with time zone default now()
);
```

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
- **No full in-app admin user-management UI yet** — account creation, role
  changes, and deactivation are all still done through the Supabase
  Dashboard/SQL Editor (see "Vendor account invites" above). This is the
  intentional interim state, not a placeholder for something broken.
- **The `/admin` route prefix is reserved but no admin page exists yet** —
  an `admin`-role user is route-guarded to the same pages as `manager`
  today; nothing is registered under `/admin/*`.
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

### Recommended next step

RLS, private storage, the maintenance report gate (D-1), and the lightweight
account foundation (`M-3`–`M-7`: deactivation, forgot-password, admin role,
Conductor flag, documented vendor invites) are all in place — **Bucket 1 is
now fully complete.** See `supabase_m3_m7_account_foundation_migration.sql`
for the schema that added `is_active`/`is_conductor` to `profiles` and
widened the `role` constraint to include `admin`.

The next Phase 2 build is **Start Date, Target Completion Date, and Assigned
POC** (`PHASE2_REQUIREMENTS.md` §4-A, `PHASE2_ROADMAP.md` Bucket 2 item D-2)
— not further account/security work. These three fields are the
prerequisite for the reminder and overdue notifications Qualcomm asked for
(§4-B, §4-C): without a Target Completion Date to compare against and a
clear Assigned POC to notify, there's nothing for a reminder or escalation
job to act on. D-2 unlocks D-3 and D-4.
