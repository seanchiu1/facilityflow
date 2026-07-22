# FacilityFlow — Fresh Database Rebuild Guide

**Purpose:** prove (and let anyone reproduce) that FacilityFlow can be built from zero — a brand-new Supabase project with an empty database — using only the SQL files committed in this repo plus a documented set of manual Dashboard/CLI steps.

**Status of this guide:** the exact file order and every table/function/policy count below was cross-checked against the **live** `facilityflow` project (`kwelwlnsxmgazhfzpeqo`) via read-only `supabase db query`/`supabase db advisors` calls — not derived from documentation alone. No destructive command was run against that project as part of producing this guide.

**The one finding that matters most:** this repo was, until this pass, missing the SQL that creates its six foundational tables (`profiles`, `appointment_requests`, `appointment_messages`, `appointment_documents`, `status_updates`, `staff_schedules`). They were created by hand in the Table Editor early in the project's life, before the "one file per migration" convention started, and no committed file ever created them — every later migration only `ALTER`s them. Running the previously-documented file order on a truly empty database would fail on step 1 (`relation "public.profiles" does not exist`). This gap is now closed by `supabase_base_schema_migration.sql`, reconstructed column-for-column from the live database (see that file's header for exactly how). **Run it first, before anything else in this repo.**

---

## 1. What you need before starting

- A Supabase project (existing, reused per phase, or a brand-new one — see §7 for how to safely test on a new one)
- Supabase Dashboard access (SQL Editor, Authentication, Storage, Edge Functions)
- The Supabase CLI, logged in and linked, if you want to deploy the Edge Function or run secrets/pg_cron from the terminal instead of the Dashboard
- This repo checked out locally, for `npm install` / `npm run build` / `.env.local`

---

## 2. Exact SQL file order

Every file runs in the Dashboard **SQL Editor**, top-to-bottom, unless noted. All are idempotent (`if not exists` / `drop ... if exists` + recreate) — safe to re-run if something fails partway and you want to retry after a fix. **Migrations vs. seeds** is called out in the "Kind" column — seeds are optional and demo-only; skip them entirely for a production-shaped rebuild.

| # | File | Kind | What it needs already done | What it adds |
|---|---|---|---|---|
| 0 | **`supabase_base_schema_migration.sql`** | Migration (new — see finding above) | Nothing but an empty `public` schema | The six original tables, no RLS yet |
| — | *Manual:* create 5 Auth users (§3) | Manual | Step 0 (needs `profiles` to exist for the follow-up insert) | `auth.users` rows |
| — | *Manual:* insert 5 `profiles` rows (§3) | Manual | Step 0 + the Auth users above | Role/display-name/vendor fields per user |
| 1 | `supabase_appointment_code_migration.sql` | Migration | Step 0 | `appointment_code` column + auto-assign trigger on `appointment_requests` |
| 2 | `supabase_rls_prep_migration.sql` | Migration | Step 0 | Helper functions (`is_admin_or_manager`, `is_internal_role`, `current_profile_role`), `slot_booking_counts` view |
| 3 | `supabase_rls_step1_profiles.sql` | Migration | Step 2 | RLS on `profiles` |
| 4 | `supabase_rls_step2_appointment_requests.sql` | Migration | Step 2 | RLS on `appointment_requests` |
| 5 | `supabase_rls_step3_messages_documents.sql` | Migration | Step 2 | RLS on `appointment_messages` + `appointment_documents` |
| 6 | `supabase_rls_step4_status_updates.sql` | Migration | Step 2 | RLS on `status_updates` |
| 7 | `supabase_rls_step5_staff_schedules.sql` | Migration | Step 2 | RLS on `staff_schedules` |
| — | *Manual:* create `appointment-documents` Storage bucket, **private** (§4) | Manual | Step 0 | The bucket the next file adds policies to |
| 8 | `supabase_private_storage_step6.sql` | Migration | Step 2 + the bucket above | Scoped storage `SELECT`/`INSERT` policies (internal-all, vendor-own-folder) |
| 9 | `supabase_d1_maintenance_report_migration.sql` | Migration | Steps 2, 8 | Maintenance-report columns + QC approval gate on `appointment_documents` |
| 10 | `supabase_m3_m7_account_foundation_migration.sql` | Migration | Step 0 | `profiles.is_active`/`is_conductor`, `admin` role, deactivation enforcement |
| 11 | `supabase_d2_target_dates_migration.sql` | Migration | Step 0 | `start_date`/`target_completion_date` on `appointment_requests` |
| 12 | `supabase_d5_duty_roster_migration.sql` | Migration | Step 2 | `duty_rosters` table, `set_updated_at()` trigger function (reused by later files) |
| 13 | `supabase_d6_vendor_progress_migration.sql` | Migration | Step 2 | `progress_percent` column, `update_appointment_progress()` RPC |
| 14 | `supabase_m8_admin_user_management_migration.sql` | Migration | Steps 2, 10 | `profiles.email`, `is_admin()`, admin read/update-any-profile RLS |
| 15 | `supabase_l1_notification_logs_migration.sql` | Migration | Step 2 | `notification_logs` table + admin/manager-read RLS |
| — | *Manual:* Edge Function secrets + deploy (§5) | Manual | Step 15 | `send-notification-emails` live (sending still needs Resend + `pg_cron`, see §5) |
| 16 | `supabase_sites_poc_linkage_migration.sql` | Migration | Steps 2, 10 | `sites` table, `site_id`/`assigned_poc_profile_id` on `appointment_requests` |
| 17 | `supabase_projects_lite_migration.sql` | Migration | Steps 2, 12, 16 | `projects`/`project_members`/`project_tasks`, `is_project_member()`, `update_my_project_task_status()` |
| 18 | `supabase_project_comments_activity_migration.sql` | Migration | Step 17 | `project_comments`/`project_activity`, supersedes the task-status RPC to also log activity |
| 19 | `supabase_project_documents_migration.sql` | Migration | Step 18 | `project_documents` table + RLS, widens `project_activity`'s type check |
| 20 | `supabase_project_notifications_migration.sql` | Migration | Steps 17, 18, 19 | `project_notifications` table, 4 notification RPCs |
| 21 | `supabase_vendor_project_access_v1a_migration.sql` | Migration | Steps 8, 17, 18, 19 | `project_vendor_members`, `is_project_vendor()`/`is_project_vendor_member()`, vendor RPCs, vendor-scoped doc/comment RLS + storage policies (includes the hardening pass — role-restricted internal INSERT + orphan-share triggers) |
| 22 | `supabase_vendor_project_tasks_v1b_migration.sql` | Migration | Step 21 | `project_vendor_tasks`, `update_my_vendor_project_task_status()` |
| 23 | `supabase_vendor_project_notifications_v1c_migration.sql` | Migration | Steps 20, 21, 22 | `notify_vendor_project_event()`, `notify_internal_vendor_project_event()`, widens `project_notifications` |
| 24 | `supabase_security_hardening_migration.sql` | Migration | Step 23 (needs every function that exists by then) | Closes the `anon`-execute grant gap on 26 `SECURITY DEFINER` functions, adds `search_path` to the 2 oldest ones, reviews (does not change) `slot_booking_counts` |
| — | *Manual:* remaining demo accounts if not already created (§3) | Manual | — | Needed only if you're about to run the seeds below |
| 25 | `supabase_demo_seed.sql` | **Seed (optional)** | Steps 0, 1, 9, 13 + manager/vendor accounts | Appointment workflow demo data |
| 26 | `supabase_demo_seed_projects.sql` | **Seed (optional)** | Step 25 + Steps 16, 17, 22, 23 + all 5 demo accounts | Project/vendor collaboration demo data |

This is the same order already maintained in `SUPABASE_SETUP.md`'s "Setup" walkthrough (§0–§18) and `README.md`'s numbered Setup section — this file exists to state it as one linear checklist with verification gates, not to replace either.

---

## 3. Manual setup — Auth users, demo accounts

Do this in **Supabase Dashboard → Authentication → Users → Add user**, after step 0:

| Email | Password | Role |
|---|---|---|
| `admin@facilityflow.demo`   | *(your own — never commit real credentials)* | admin   |
| `manager@facilityflow.demo` | | manager |
| `staff@facilityflow.demo`   | | staff   |
| `vendor@facilityflow.demo`  | | vendor  |
| `vendor2@facilityflow.demo` | | vendor  |

Copy each UUID from the Users list, then run (SQL Editor, after step 0):

```sql
insert into profiles (id, role, display_name, email) values
  ('<admin-uuid>',   'admin',   'Admin Wu',    'admin@facilityflow.demo'),
  ('<manager-uuid>', 'manager', 'Manager Liu', 'manager@facilityflow.demo'),
  ('<staff-uuid>',   'staff',   'Chen Wei-Ming', 'staff@facilityflow.demo');

insert into profiles (id, role, display_name, email, vendor_name, contact_name) values
  ('<vendor-uuid>',  'vendor', 'David Lin', 'vendor@facilityflow.demo',  'Taiwan Elevator Services', 'David Lin'),
  ('<vendor2-uuid>', 'vendor', 'Amy Hsu',   'vendor2@facilityflow.demo', 'Formosa Fire Safety Co.',  'Amy Hsu');
```

Full detail (including production-vendor-invite process, and why `email` isn't `not null`): `SUPABASE_SETUP.md` §0.

For a non-demo rebuild, create only the accounts you actually need — but at least one `admin` account is required to reach `/admin/users`, `/sites`, `/data-audit`, and to manage vendors on any project.

---

## 4. Manual setup — Storage bucket

Before step 8 in the table above:

**Dashboard → Storage → New bucket**
- Name: `appointment-documents` (exact — every file path/policy in this repo hardcodes it)
- **Public: OFF** — this must be private. `supabase_private_storage_step6.sql` (step 8) explicitly flips `public = false` as a defense-in-depth measure even if you create it public by mistake, but don't rely on that.

No bucket-level file-size/MIME restriction is set at the Storage layer — validation is client-side only (`DOC_ACCEPTED_TYPES`/`MAX_SIZE_MB` constants duplicated per upload component). This is an existing, accepted app-level limitation, not something this rebuild pass changes.

---

## 5. Manual setup — Edge Function secrets

Before step 15 is useful (the migration itself has no manual dependency, but the function it supports does):

```bash
supabase secrets set \
  NOTIFICATION_FUNCTION_SECRET=$(openssl rand -hex 32) \
  RESEND_API_KEY=re_your_resend_api_key \
  RESEND_FROM_EMAIL="FacilityFlow <alerts@yourdomain.com>" \
  APP_URL=https://your-deployed-app-url

supabase functions deploy send-notification-emails
```

Full detail, manual test `curl`, and the recommended `pg_cron` schedule: `SUPABASE_SETUP.md` §11. **Skipping this is safe** — the app works fully without it; only the in-app bell fires, no email ever sends, exactly as documented throughout `README.md`'s "Current Limitations."

**Never** put any of these values in `.env.local` or anything under `src/` — they belong only in `supabase secrets`.

---

## 6. Verification SQL — run after each phase

Read-only, safe on any environment including the live project.

### After step 0 (base schema)

```sql
select table_name from information_schema.tables
  where table_schema = 'public'
  and table_name in ('profiles','appointment_requests','appointment_messages',
                      'appointment_documents','status_updates','staff_schedules');
-- Expect exactly 6 rows.
```

### After steps 1–8 (RLS + storage)

```sql
select relname, relrowsecurity from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'
  order by relname;
-- Expect relrowsecurity = true for every one of the 6 base tables.

select policyname, cmd from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
  order by policyname;
-- Expect the 4 Step-6 policy names (2 internal, 2 vendor).
```

### After steps 9–16 (feature layer)

```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('duty_rosters','notification_logs','sites');
-- Expect 3 rows.

select routine_name from information_schema.routines
  where routine_schema='public' and routine_name in
  ('is_admin','is_admin_or_manager','is_internal_role','update_appointment_progress');
-- Expect 4 rows.
```

### After steps 17–20 (Project Collaboration Lite)

```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('projects','project_members','project_tasks',
                      'project_comments','project_activity','project_documents',
                      'project_notifications');
-- Expect 7 rows.
```

### After steps 21–23 (Vendor Project Access)

```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('project_vendor_members','project_vendor_tasks');
-- Expect 2 rows.

select routine_name from information_schema.routines where routine_schema='public'
  and routine_name in ('is_project_vendor','is_project_vendor_member',
    'get_my_vendor_projects','get_my_vendor_project','get_vendor_directory',
    'update_my_vendor_project_task_status','notify_vendor_project_event',
    'notify_internal_vendor_project_event');
-- Expect 8 rows.
```

### Full-project sanity check (run any time)

```sql
select count(*) from information_schema.tables where table_schema='public';
-- Expect 19 (18 base tables + the slot_booking_counts view — views are
-- listed in information_schema.tables too).

select count(*) from information_schema.routines where routine_schema='public';
-- Expect 26 (as of this pass — grows with future migrations).

select count(*) from storage.buckets where id = 'appointment-documents';
-- Expect 1.
```

These exact counts (19 tables, 26 functions, 1 bucket, every table `relrowsecurity = true`) were confirmed live against `kwelwlnsxmgazhfzpeqo` while writing this guide.

---

## 7. Is it safe to create a fresh Supabase project and test this?

**Yes — but I did not do it for you in this pass, and you have to be the one to create it.** Creating a new Supabase project is an account/billing-level action (org quota, a new project ref, potentially cost) that shouldn't happen without you explicitly choosing to do it. Exactly what to do:

1. **Create the project.** Dashboard → New Project (or `supabase projects create "facilityflow-rebuild-test" --org-id <your-org-id> --region <region> --db-password <password>` via CLI). Pick any region; nothing in this repo is region-specific.
2. **Link the CLI to it** (optional, only needed for `supabase secrets`/`functions deploy`/`db query` convenience): `supabase link --project-ref <new-ref>`.
3. **Run this guide top to bottom** against the new project's SQL Editor — steps 0 through 23, with the manual steps (§3–§5) interleaved exactly where the table in §2 places them.
4. **Point a local `.env.local` at the new project** (`VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` from the new project's API settings) and run `npm run dev` — confirm login works for at least the admin account before going further.
5. **Run the verification queries in §6** after each phase — don't wait until the end to discover step 14 silently no-op'd.
6. **Optionally seed demo data** (steps 24–25) and walk `DEMO_SCRIPT.md` end to end.
7. **Tear down** the test project when done (Dashboard → Project Settings → General → Delete project), or keep it as a standing staging environment — your call, not something to automate.

This repo's own `kwelwlnsxmgazhfzpeqo` project was **not** modified, reset, or seeded destructively as part of producing this guide — every command run against it was a read-only `select`/`information_schema` query or the read-only `db advisors` check.

---

## 8. Files identified as obsolete, duplicate, order-sensitive, or risky

**Order-sensitive (already reflected in §2's numbering, called out again here because getting them backward fails loudly, not silently):**
- `supabase_base_schema_migration.sql` must be first, full stop.
- `supabase_d5_duty_roster_migration.sql` must run before `supabase_projects_lite_migration.sql` — the latter's `updated_at` triggers on `projects`/`project_tasks` call `set_updated_at()`, first defined in d5.
- `supabase_sites_poc_linkage_migration.sql` must run before `supabase_projects_lite_migration.sql` — `projects.site_id` FKs to `sites(id)`.
- Everything under Vendor Project Access (steps 21–23) must run in that exact order — v1b's validation trigger calls a v1a function (`is_project_vendor_member`), and v1c's RPCs reference tables/columns from both.

**Not obsolete, but easy to mistake for redundant:**
- `supabase_rls_step2_appointment_requests.sql` / `step3` / `step4` are never named individually in `README.md` (only referenced as part of the "`step1` through `step5`" range) — they're real, required, individually-numbered files, not folded into `step1` or `step5`. Confirmed present and required by grepping every doc for `.sql` filenames and cross-checking against `ls *.sql`.

**Genuinely risky, if run out of order or against the wrong project:**
- None of the 24 migration files contain a `drop table`, `truncate`, or unscoped `delete` — every one is additive (`create table if not exists`, `add column if not exists`, `create or replace function`, `drop policy if exists` immediately followed by `create policy`). The only files with any delete-shaped SQL are the **cleanup blocks at the bottom of both demo seed files**, and those are commented out by default — they require deliberately uncommenting and running by hand. Nothing in this repo can accidentally wipe data via a normal top-to-bottom run.
- Both demo seed files raise an explicit exception and insert nothing if their required demo accounts don't exist yet — they fail loudly, not partially.

**No duplicate or genuinely obsolete files were found.** Every file in the repo is referenced by exactly one place in the dependency chain, and every file referenced by the docs exists in the repo (verified by diffing `ls *.sql` against every `.sql` filename mentioned across `README.md`/`SUPABASE_SETUP.md`/`PHASE2_REQUIREMENTS.md`/`PHASE2_ROADMAP.md`/`DEMO_SCRIPT.md`).

---

## 9. Known findings from live security/performance advisor scan

Run via `supabase db advisors --linked --type all` against `kwelwlnsxmgazhfzpeqo`, read-only, nothing changed at the time of that scan. Items 1 and 3 below are **now resolved** by `supabase_security_hardening_migration.sql` (step 24). Items 2, 4, 5, 6 are reviewed and **intentionally not changed** — a fresh rebuild will still show these, which is expected, not a regression.

1. ~~24 of 26 `SECURITY DEFINER` functions executable by `anon` at the grant level~~ — **RESOLVED.** `supabase_security_hardening_migration.sql` adds an explicit `revoke ... from anon` (Supabase's default privileges grant `anon`/`authenticated` EXECUTE on every new `public`-schema function, independent of `revoke ... from public`) to all 26 functions, and additionally revokes `authenticated` on the 8 that were verified — by grepping every policy and RPC call site in this repo — to have no legitimate direct caller at all (`is_project_vendor_member` plus the 7 trigger functions). The 18 functions genuinely called directly (by the frontend, or by a bare RLS policy clause) keep `authenticated` execute, unchanged.
2. **1 `SECURITY DEFINER` view** (`slot_booking_counts`) — reviewed, **not changed on purpose**. It was deliberately built `SECURITY DEFINER` (`RLS_PRIVATE_STORAGE_PLAN.md` risk R-2) so the booking form's slot-capacity check stays cross-vendor — appointment_requests' vendor RLS would otherwise make each vendor see only their own prior bookings when computing "how full is this slot," letting a second vendor double-book a slot the first vendor already filled. Switching to `security_invoker = true` is the linter's suggested fix but would silently reintroduce that exact bug — a product regression, not a hardening. Left as-is; documented here so it isn't "fixed" by accident later.
3. ~~2 functions lack `set search_path`~~ — **RESOLVED.** `fn_set_appointment_code` and `set_updated_at` both got `alter function ... set search_path = public` (a configuration-only change — their logic is untouched).
4. **20 RLS policies re-evaluate `auth.uid()`/`auth.role()` per row** instead of once per query (`auth_rls_initplan`) — a widely-documented Supabase performance optimization (wrap in `(select auth.uid())` so Postgres caches it as an initplan). Performance-only, not a correctness or security issue. Not addressed this pass — touches every RLS policy file, out of scope for a hardening pass focused on function grants.
5. **64 "multiple permissive policies" warnings** — the deliberate, repeated design choice throughout this project's RLS history: internal and vendor access get *separate* policies per table/action rather than one combined `OR` clause (explicitly to keep the two audit-able independently — see the maintainer warnings in `supabase_vendor_project_access_v1a_migration.sql` and `supabase_vendor_project_tasks_v1b_migration.sql`). This is the direct, expected cost of that choice, not an oversight.
6. **Leaked-password protection is off** in Supabase Auth settings (`auth_leaked_password_protection`) — a one-click Dashboard toggle (Authentication → Policies), not a SQL fix. Worth turning on for any real deployment; irrelevant to demo/dev use.

**Remaining recommendation:** items 4–5 are pure performance tuning, worth doing before a real production load, not before a demo. Item 6 is a Dashboard checkbox whenever this goes anywhere near real user passwords. Item 2 requires no action unless the underlying vendor-RLS design changes.
