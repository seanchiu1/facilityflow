# Supabase Setup — FacilityFlow

Run all SQL in **Supabase Dashboard → SQL Editor**. Create the storage bucket via the Dashboard or the SQL shortcut shown below.

---

## 1. Core appointment table

```sql
create table if not exists appointment_requests (
  id               uuid primary key default gen_random_uuid(),
  vendor_name      text not null,
  contact_name     text not null,
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

### Option A — Dashboard (recommended)

1. Go to **Supabase Dashboard → Storage → New Bucket**
2. Name: `appointment-documents`
3. Toggle **Public bucket** ON
4. Save

### Option B — SQL

```sql
insert into storage.buckets (id, name, public)
values ('appointment-documents', 'appointment-documents', true)
on conflict do nothing;
```

---

## 7. Storage policies (demo)

These permissive policies allow the demo to work without authentication.
**Replace with auth-scoped policies before production deployment.**

```sql
-- Allow anyone to read files from this bucket
create policy "demo: public read"
  on storage.objects for select
  using ( bucket_id = 'appointment-documents' );

-- Allow anyone to upload files to this bucket
create policy "demo: public upload"
  on storage.objects for insert
  with check ( bucket_id = 'appointment-documents' );
```

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

### Current state (demo prototype)
- The Supabase **anon key** is used client-side (exposed in the browser).
- The storage bucket is **public** — any URL is accessible without authentication.
- No Row Level Security (RLS) is enabled. Any browser that knows the anon key can read/write all rows.

### Before production deployment

1. **Enable Supabase Auth** — use email + password or SSO. Remove the demo role selector.
2. **Enable RLS** on all tables. Example patterns:
   ```sql
   -- Vendors can only read their own appointment requests
   alter table appointment_requests enable row level security;

   create policy "vendor reads own"
     on appointment_requests for select
     using ( vendor_name = (select raw_user_meta_data->>'company' from auth.users where id = auth.uid()) );

   -- Only managers/staff can update status
   create policy "staff updates status"
     on appointment_requests for update
     using ( (select raw_user_meta_data->>'role' from auth.users where id = auth.uid()) in ('manager','staff') );
   ```
3. **Private storage bucket** — disable public access, generate signed download URLs server-side (Supabase Edge Function or backend API).
4. **Scope storage policies** to `auth.uid()` instead of allowing anonymous uploads.
