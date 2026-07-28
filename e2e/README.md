# FacilityFlow — Playwright E2E Suite

A minimal, pilot-focused smoke suite. It does **not** run against a local dev server — every test targets an already-deployed FacilityFlow instance (your Vercel URL) over the real network, using real Supabase Auth logins. This is deliberate: the point is to catch deployment-shaped problems (env vars, Auth redirect URLs, the Vercel SPA rewrite, RLS behaving differently than it does against `localhost`) that a local-only test run would never see.

See [`PILOT_TEST_CHECKLIST.md`](../PILOT_TEST_CHECKLIST.md) for the manual counterpart to this suite — run both before handing the app to real pilot users.

---

## What's covered

| # | Test | File |
|---|---|---|
| 1 | Manager login works | `manager.spec.js` |
| 2 | Manager Dashboard/Projects load | `manager.spec.js` |
| 3 | ProjectDetail opens | `manager.spec.js` |
| 4 | Notification bell opens | `manager.spec.js` |
| 5 | `vendor@` login works | `vendor.spec.js` |
| 6 | Vendor Projects loads | `vendor.spec.js` |
| 7 | `vendor@` project list loads | `vendor.spec.js` |
| 8 | `vendor2@` project list loads (shared project names with `vendor@` are expected and allowed — see below) | `vendor.spec.js` |
| 9 | Vendor cannot reach `/projects` (redirected, not just hidden) | `vendor.spec.js` |
| 10 | Vendor cannot reach `/roster` (redirected, not just hidden) | `vendor.spec.js` |
| 11 | Vendor cannot reach `/schedule` (redirected, not just hidden) | `vendor.spec.js` |
| 12–13 | `vendor2@` cannot see any of `vendor@`'s appointment booking codes in My Bookings | `vendor.spec.js` |
| 14–15 | `vendor2@` cannot see any of `vendor@`'s vendor-task titles, comment text, or document names — checked across **every** project each vendor belongs to, including a project both vendors share | `vendor.spec.js` |
| 16 | Refresh on `/projects` and `/vendor-projects` doesn't hit a Vercel 404 | `routing.spec.js` |

**Privacy rule (see `VENDOR_ISOLATION_AUDIT.md` for the full audit):** FacilityFlow allows multiple vendor companies to be members of the same project, so `vendor@` and `vendor2@` legitimately seeing the same project *name* on `/vendor-projects` is correct behavior, not a leak — tests 7–8 do not assert otherwise. The real isolation boundary is vendor-scoped *content*: tasks, comments, documents, membership rows, and bookings, which must always stay scoped to the owning vendor regardless of shared project membership. Tests 12–15 are what actually check that boundary — not just "which projects can a vendor list," but "within a project, can a vendor see the *other* vendor's tasks/comments/documents," plus bookings — checked as a real browser session against the real deployed app, on top of the database-level audit in `VENDOR_ISOLATION_AUDIT.md`.

## What this deliberately does NOT cover

This is a **smoke suite**, not a regression suite for every feature built this project. It does not test: appointment booking, maintenance report approval, duty roster, weekly report export, admin user management, document upload/download, or any RLS edge case beyond vendor-vs-vendor isolation. Extending it is straightforward (same `login()` helper, same pattern) but out of scope for this pass — see `PILOT_TEST_CHECKLIST.md` §4 for the broader manual smoke test this suite only partially automates.

---

## Environment variables

All required — every test throws immediately on load if any is missing, rather than failing confusingly mid-test.

| Variable | Example | Notes |
|---|---|---|
| `E2E_BASE_URL` | `https://facilityflow.vercel.app` | Your deployed Vercel URL. No trailing slash. |
| `E2E_MANAGER_EMAIL` | `manager@facilityflow.demo` | |
| `E2E_MANAGER_PASSWORD` | *(your value)* | |
| `E2E_VENDOR_EMAIL` | `vendor@facilityflow.demo` | Must have at least one project assigned (`supabase_demo_seed_projects.sql`) for tests 7–8 to assert anything meaningful — they `test.skip()` gracefully, not fail, if the account has zero projects. |
| `E2E_VENDOR2_EMAIL` | `vendor2@facilityflow.demo` | Must be assigned a **different** project than `E2E_VENDOR_EMAIL` — this is what test 8 actually checks. |
| `E2E_VENDOR_PASSWORD` | *(your value)* | Password for `E2E_VENDOR_EMAIL` only. |
| `E2E_VENDOR2_PASSWORD` | *(your value)* | Password for `E2E_VENDOR2_EMAIL` only — **not assumed to match `E2E_VENDOR_PASSWORD`**. The two demo vendor accounts can have different passwords; the suite never shares one across both. |

None of these belong in `.env.local` (that file is for `VITE_`-prefixed build-time vars only) — set them in your shell, or in a separate untracked file, before running the suite. `.env.example` has placeholder-only entries for all six; never fill in real values there.

## Running locally against a Vercel deployment

```bash
# One-time: install the browser binaries Playwright drives
npx playwright install chromium

# Set the seven env vars for this shell session
export E2E_BASE_URL=https://your-vercel-app.vercel.app
export E2E_MANAGER_EMAIL=manager@facilityflow.demo
export E2E_MANAGER_PASSWORD='...'
export E2E_VENDOR_EMAIL=vendor@facilityflow.demo
export E2E_VENDOR2_EMAIL=vendor2@facilityflow.demo
export E2E_VENDOR_PASSWORD='...'
export E2E_VENDOR2_PASSWORD='...'

# Run the suite
npm run test:e2e
```

Useful variations:
```bash
npx playwright test --headed          # watch it click through the app
npx playwright test --ui              # Playwright's interactive test runner
npx playwright test e2e/vendor.spec.js  # just the vendor isolation tests
npx playwright show-report            # open the HTML report from the last run
```

## Running against production (`kwelwlnsxmgazhfzpeqo`)

Same as above, with `E2E_BASE_URL` set to the production Vercel URL and real (or dedicated demo) pilot credentials. Because these tests only ever read data (login, view lists, open a project, click the bell) and never create/edit/delete anything, running them against production is safe to do anytime, including while real pilot users are active — there is no destructive action anywhere in this suite.

## CI

Not wired into a GitHub Actions workflow in this pass — `E2E_BASE_URL` and the credential env vars would need to be added as repo secrets first (same pattern as `.github/workflows/facilityflow-email-cron.yml`'s `FACILITYFLOW_*` secrets), and a decision made about which deployment (preview vs. production) each run should target. Left as a deliberate follow-up, not attempted here.

## Limitations

- **Serial execution, one worker** (`playwright.config.js`) — the vendor isolation check (test 8) reads a value set by test 7 in the same file, so the suite intentionally does not run tests in parallel. This makes the suite slower than it needs to be for tests 1–6, but simpler to reason about than sharing state across parallel workers.
- **Depends on demo/seed data existing** — tests 3, 7, and 8 `test.skip()` (not fail) if the relevant account has zero projects. This suite cannot create its own fixtures (no write actions, by design), so it's only as meaningful as whatever data the target environment actually has. Run `supabase_demo_seed_projects.sql` first if testing against a fresh environment.
- **No mobile/tablet viewport testing** — a single Desktop Chrome project only. FacilityFlow's own D-7 (mobile responsive pass) is still deliberately deferred per `PHASE2_ROADMAP.md`, so there's nothing mobile-specific to test yet.
- **English-only assertions** — the app defaults to English on every fresh session (`LanguageContext` has no persistence), so this suite never toggles to 繁體中文. Language switching itself is untested here.
- **A handful of `data-testid` attributes were added to support this suite** (`notification-bell`, `notification-dropdown`, `project-card`, `vendor-project-card`, `booking-code`, `vendor-task-title`, `vendor-comment-body`, `vendor-document-name`) — purely additive DOM attributes with no visual or behavioral effect, not a product change.
- **Tests 12–15 depend on data existing to be meaningful, same as 7–8** — they `test.skip()` (not fail) if neither vendor account has any bookings/tasks/comments/documents to compare. A skip here means "nothing to check," not "isolation confirmed" — run against an environment with real seeded/demo data for these to actually exercise anything.
