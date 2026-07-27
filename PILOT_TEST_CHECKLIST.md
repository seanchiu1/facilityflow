# FacilityFlow — Pilot Test Checklist

**Purpose:** confirm the deployed app (Vercel frontend + Supabase project `kwelwlnsxmgazhfzpeqo`) is safe to hand to real pilot users — not a feature test, a *is-this-actually-locked-down-and-working* test.

**How to use this:** run top to bottom before every pilot session, and again after any migration, Edge Function redeploy, or Vercel deploy. Items marked **✅ Verified [date]** below were confirmed live while writing this checklist (read-only checks only — nothing was changed on the production database as part of verifying them). Re-run the SQL yourself before trusting a stale checkmark.

---

## 1. Production sanity checklist

| # | Check | How | Status |
|---|---|---|---|
| 1 | Vercel URL loads | Open the production URL in an incognito window — should redirect to `/dashboard` → Login screen (never a blank page or a build-tool error overlay) | Manual — see §4 |
| 2 | Env vars are correct | Vercel Dashboard → Project → Settings → Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set for the **Production** environment, values match `kwelwlnsxmgazhfzpeqo`'s Project Settings → API page | Manual |
| 3 | Supabase Auth redirect URLs include the Vercel domain | Supabase Dashboard → Authentication → URL Configuration: **Site URL** = your Vercel production URL; **Redirect URLs** includes `https://<your-vercel-domain>/reset-password` (and the preview-deployment domain pattern if you test on preview URLs) | Manual — **do this before the first pilot password reset**, see §5 "Auth redirect issue" |
| 4 | Storage bucket is private | SQL query below | **✅ Verified 2026-07-28** — `appointment-documents`, `public = false` |
| 5 | `anon` has EXECUTE on zero `public` functions | SQL query below | **✅ Verified 2026-07-28** — 0 rows (confirms `supabase_security_hardening_migration.sql` is applied) |
| 6 | Service-role key is not in the frontend | `grep -r "SERVICE_ROLE\|service_role" src/ .env.example` — must return nothing. Only `VITE_`-prefixed vars belong in `src/`/`.env.local`; the service-role key exists only as a Supabase Edge Function secret. | Verify before every deploy — see §3 |
| 7 | No real secrets in git | See §6 "Known findings" below — **one issue found and not yet fixed**, action required | ⚠️ **See finding below** |
| 8 | Email cron workflow exists and is enabled | `.github/workflows/facilityflow-email-cron.yml` present in the repo (it is); GitHub → Actions tab → confirm the workflow shows scheduled runs, not just `workflow_dispatch` | Manual — see §4 |
| 9 | `notification_logs` records sent rows | SQL query below | **✅ Verified 2026-07-28** — 2 rows, both `status = 'sent'` — confirms the cron → Edge Function → Resend path has worked at least twice in production |

---

## 2. Exact SQL verification queries

Run these in Supabase Dashboard → SQL Editor (or `supabase db query --linked "<query>"`), against **kwelwlnsxmgazhfzpeqo**. All read-only — safe to run anytime, including during a live pilot.

**Storage bucket privacy:**
```sql
select id, public from storage.buckets;
-- Expect exactly one row: appointment-documents | false
```

**`anon` execute surface (should be zero after `supabase_security_hardening_migration.sql`):**
```sql
select count(*) as anon_executable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'EXECUTE');
-- Expect 0
```

**`authenticated` still has exactly the intended RPC/RLS-facing surface (18 functions, see `FRESH_DB_REBUILD.md` §9 for the full list):**
```sql
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by p.proname;
```

**Notification email pipeline has actually fired successfully:**
```sql
select status, count(*) from notification_logs group by status order by status;
-- Expect at least one 'sent' row before trusting the cron in front of pilot users.
-- Any 'failed' rows: check the row's error detail column, then see §5 "Email 403 Resend."
```

**RLS is enabled everywhere (regression check — should never drift, but cheap to confirm):**
```sql
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and relrowsecurity = false;
-- Expect 0 rows. Any row returned here is a real, urgent problem — a table with
-- no RLS enabled is fully open to any authenticated (or, worse, anon) caller.
```

**Table/function/bucket counts match the known-good baseline** (see `FRESH_DB_REBUILD.md` §6 for the full per-phase breakdown):
```sql
select
  (select count(*) from information_schema.tables where table_schema='public') as tables,
  (select count(*) from information_schema.routines where routine_schema='public') as functions,
  (select count(*) from storage.buckets) as buckets;
-- Expect 19 tables (18 base tables + slot_booking_counts view), 26 functions, 1 bucket.
```

---

## 3. Secrets hygiene — quick local check before every deploy

```bash
# Must return nothing:
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|RESEND_API_KEY\|NOTIFICATION_FUNCTION_SECRET" src/ .env.example vercel.json 2>/dev/null

# Confirm only VITE_-prefixed vars are exposed to the client:
grep -n "^VITE_" .env.local 2>/dev/null   # local only, never commit this file's output anywhere
```

The Edge Function secrets (`NOTIFICATION_FUNCTION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`) and Supabase's auto-injected ones (`SUPABASE_SERVICE_ROLE_KEY`, etc.) exist **only** as `supabase secrets` on the Edge Function runtime — confirmed present by name (not exposing values here):
```bash
supabase secrets list --project-ref kwelwlnsxmgazhfzpeqo
```
✅ **Verified 2026-07-28** — `APP_URL`, `NOTIFICATION_FUNCTION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` all present, alongside Supabase's auto-injected `SUPABASE_*` set. The CLI shows a digest per secret, never the plaintext value — safe to run and safe to paste output from.

The GitHub Actions workflow needs its own two repo secrets (`FACILITYFLOW_SUPABASE_PUBLISHABLE_KEY`, `FACILITYFLOW_NOTIFICATION_FUNCTION_SECRET`) — confirm these exist at GitHub → repo → Settings → Secrets and variables → Actions. (Not checked here — this environment has no `gh` CLI installed; verify via the GitHub web UI.)

---

## 4. Deployed-app smoke test

Run against the **live Vercel URL**, not `localhost`. ~10 minutes.

1. **Manager login** — `manager@facilityflow.demo` (or your real pilot manager account) → lands on Dashboard, stat cards populate, sidebar shows the full manager nav.
2. **Vendor login** — sign out, log in as `vendor@facilityflow.demo` → lands on New Booking, sidebar shows only Dashboard/New Booking/My Bookings/Calendar/Vendor Projects.
3. **Vendor2 login** — sign out, log in as `vendor2@facilityflow.demo` → same shape as step 2, **different data** — this is the one that actually proves isolation, not just that login works.
4. **Projects load** (as manager) — click **Projects**, confirm the list renders without a console error, open one project, confirm Summary/Tasks/Vendors/Documents/Comments/Activity all render.
5. **Vendor Projects load** (as vendor) — click **Vendor Projects**, confirm only that vendor's own project(s) appear — cross-check against step 3's vendor2 session to confirm the two don't overlap.
6. **Notifications load** — click the bell as each role; confirm the dropdown opens with no console error (empty is fine if nothing's unread — a broken query silently returning `[]` looks identical to "no notifications," so also check the browser console for a red `Project notifications fetch error` line).
7. **File upload/open works** — on any appointment or project, upload a small PDF, confirm it appears in the list, click it, confirm it opens (this exercises the private bucket + signed-URL path end-to-end — a broken bucket policy or misconfigured RLS shows up here as "Link unavailable," not a hard error).

If all seven pass with no red console errors, the deployed app is behaving the same as the read-only checks in §1–§2 say it should.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **Blank Vercel page** | Env vars missing/wrong on the Vercel project, or the build failed silently | Vercel → Deployments → open the failing/latest deploy → check the build log for a Vite error. Confirm `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are set for **Production** (not just Preview/Development) — Vercel scopes env vars per environment, a var set only for Preview won't exist in a Production build. |
| **Auth redirect issue** (password reset link goes to the wrong domain, or shows a Supabase error page instead of the reset form) | The Vercel production domain isn't in Supabase's Auth → URL Configuration → Redirect URLs allow-list | Add `https://<your-vercel-domain>/reset-password` (exact match, including scheme) to Redirect URLs. The app code already builds the redirect from `window.location.origin` (`src/pages/Login.jsx`) — this is purely a Supabase Dashboard allow-list gap, not a code fix. |
| **Email 401** (Edge Function returns 401, `notification_logs` gets no new row) | Missing or wrong `x-notification-secret` header — either the GitHub Actions secret `FACILITYFLOW_NOTIFICATION_FUNCTION_SECRET` doesn't match the Edge Function's `NOTIFICATION_FUNCTION_SECRET`, or the header is missing entirely | Compare: `supabase secrets list` (digest of the function's stored value) vs. re-setting the GitHub Actions secret from the same value you used in `supabase secrets set`. A 401 here is the function's own guard working correctly — it means the two sides are out of sync, not that anything is broken structurally. |
| **Email 403 from Resend** (Edge Function itself runs, but the email send step fails) | `RESEND_API_KEY` invalid/revoked, or `RESEND_FROM_EMAIL` isn't on a verified domain/sender in Resend | Check Resend Dashboard → Domains, confirm the sending domain is verified. Re-generate the API key if needed and `supabase secrets set RESEND_API_KEY=...` again, then redeploy: `supabase functions deploy send-notification-emails`. |
| **Route refresh 404** (deep-linking or refreshing e.g. `/projects/abc123` shows Vercel's 404 page) | FacilityFlow uses `BrowserRouter` (real client-side paths), and Vercel's static file server has no actual file at `/projects/abc123` unless told to fall back to `index.html` | **Fixed in this pass** — `vercel.json` (added to the repo root) now rewrites every path to `/index.html` so React Router handles routing client-side. Redeploy after pulling this file for the fix to take effect. |

---

## 6. Known findings from this pass

- **⚠️ `.env.local.backup` is committed to git** (introduced in commit `c92534a`, currently tracked). It contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — both are client-exposed-by-design values (they ship in every built JS bundle already, and RLS is what actually protects data, not keeping the anon key secret), so this is **not a service-role-key-class leak**, but it's still real git hygiene debt worth closing: a stray backup file escaped `.gitignore` coverage, and a differently-named backup could just as easily have contained something that *does* matter. Recommended fix:
  ```bash
  git rm --cached .env.local.backup
  echo "*.backup" >> .gitignore
  git add .gitignore
  git commit -m "Remove committed env backup file, harden .gitignore"
  ```
  The file stays recoverable from git history (`c92534a`) unless you separately rewrite history — not necessary here since nothing in it is a true secret, but worth knowing if this repo is ever made public. **Not fixed automatically as part of this pass — confirm you want this before I run `git rm`.**
- **Route refresh 404 — fixed.** Added `vercel.json` with a catch-all SPA rewrite (see §5). No `vercel.json` existed before this pass; without it, every deep link (project detail, vendor project detail, appointment detail, reset-password) 404s on direct navigation or refresh in production, even though it works fine in local dev (Vite's dev server already does this rewrite for you, which is why this class of bug is easy to miss until a real deploy).
- **Cron cadence note (informational, not a bug):** `SUPABASE_SETUP.md` §11 documents a recommended `pg_cron` schedule running every 15 minutes; the actual deployed setup uses the GitHub Actions workflow instead (`.github/workflows/facilityflow-email-cron.yml`), running **once daily** at 00:00 UTC. Both are valid ways to trigger the same Edge Function — just confirm this cadence is what you actually want for pilot reminders (a once-daily run means a same-day "starting in 1 hour" reminder could be sent up to ~24h late relative to the in-app bell, which still updates live). No `cron.job` rows exist in the database — confirms `pg_cron` itself was never actually configured, GitHub Actions is the sole scheduler in production.
