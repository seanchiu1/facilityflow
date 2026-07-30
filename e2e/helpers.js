// Shared helpers for the FacilityFlow pilot E2E suite.
// Every test targets an already-deployed instance via E2E_BASE_URL — see
// e2e/README.md for the full env var list and how to run this locally.

import { expect } from '@playwright/test'

export function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required env var ${name} — see e2e/README.md for the full list ` +
      `and how to set them (never commit real values).`
    )
  }
  return value
}

// Logs in via the real Login form (no API shortcuts) — this is deliberate:
// it exercises the actual Supabase Auth + profile-load path a pilot user
// goes through, not just a cookie/token injection.
export async function login(page, email, password) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  // Login redirects away from '/' (or the login screen) once the profile
  // loads — wait for any authenticated route rather than a specific one,
  // since manager/vendor land on different default pages.
  await page.waitForURL(url => url.pathname !== '/' && url.pathname !== '/login', { timeout: 15_000 })
}

// Collects the visible names off every project/vendor-project card on the
// current list page. Works for both /projects (data-testid="project-card")
// and /vendor-projects (data-testid="vendor-project-card") — pass whichever
// testid applies.
export async function collectCardNames(page, testId) {
  const cards = page.locator(`[data-testid="${testId}"]`)
  const count = await cards.count()
  const names = []
  for (let i = 0; i < count; i++) {
    const text = (await cards.nth(i).locator('h3').first().textContent()) || ''
    names.push(text.trim())
  }
  return names
}

// Collects the trimmed text content of every element matching a testid on
// the current page — used for isolation checks where the exact list of
// strings a vendor can see (task titles, comment bodies, document names)
// matters, not just a count or a single card's name.
export async function collectTexts(page, testId) {
  const els = page.locator(`[data-testid="${testId}"]`)
  const count = await els.count()
  const texts = []
  for (let i = 0; i < count; i++) {
    const text = (await els.nth(i).textContent()) || ''
    if (text.trim()) texts.push(text.trim())
  }
  return texts
}

// Visits every project a vendor can see on /vendor-projects and aggregates
// the vendor-scoped task titles, comment bodies, and document names across
// all of them — used to prove a vendor never sees another vendor's content,
// including on a project both vendors happen to share (the strongest case:
// same project, two different vendor-scoped views of it).
export async function collectVendorProjectDetailTexts(page) {
  await page.goto('/vendor-projects')
  await page.waitForLoadState('networkidle')
  const cardCount = await page.locator('[data-testid="vendor-project-card"]').count()

  const tasks = [], comments = [], documents = []
  for (let i = 0; i < cardCount; i++) {
    await page.goto('/vendor-projects')
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid="vendor-project-card"]').nth(i).click()
    await page.waitForURL(/\/vendor-projects\/[^/]+$/, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')
    tasks.push(...await collectTexts(page, 'vendor-task-title'))
    comments.push(...await collectTexts(page, 'vendor-comment-body'))
    documents.push(...await collectTexts(page, 'vendor-document-name'))
  }
  return { tasks, comments, documents }
}

// Captures the Supabase REST base URL + apikey/authorization headers off
// the next real `/rest/v1/` request the already-logged-in page makes —
// avoids needing separate Supabase URL/key env vars in this suite, and
// reuses exactly what the authenticated browser session is already
// sending. Used to make a raw REST call from Node (via `request`, Playwright's
// APIRequestContext) that reproduces exactly what a vendor could do by
// opening devtools and querying a table directly — the same attack vector
// VENDOR_ISOLATION_AUDIT.md checks at the database layer, checked here
// from the actual deployed app.
export async function captureSupabaseRestAuth(page) {
  const req = await page.waitForRequest(r => r.url().includes('/rest/v1/'), { timeout: 15_000 })
  const url = new URL(req.url())
  const headers = req.headers()
  return {
    baseUrl: `${url.protocol}//${url.host}`,
    apikey: headers['apikey'],
    authorization: headers['authorization'],
  }
}

export async function expectNoVercel404(page) {
  // A Vercel 404 (missing SPA rewrite) renders Vercel's own static error
  // page, not this app's React tree — assert neither its literal copy nor
  // an empty/blank body is present, and that the app shell actually mounted.
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || ''
  expect(bodyText).not.toMatch(/this page could not be found/i)
  expect(bodyText).not.toMatch(/404: NOT_FOUND/i)
  await expect(page.locator('text=FacilityFlow').first()).toBeVisible({ timeout: 10_000 })
}
