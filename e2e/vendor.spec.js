// Vendor-role pilot smoke tests: login, Vendor Projects loads, and —
// the tests that actually matter for a pilot — cross-vendor isolation and
// the internal /projects route being genuinely unreachable for a vendor.
import { test, expect } from '@playwright/test'
import { requiredEnv, login, collectCardNames } from './helpers.js'

const VENDOR_EMAIL = requiredEnv('E2E_VENDOR_EMAIL')
const VENDOR2_EMAIL = requiredEnv('E2E_VENDOR2_EMAIL')
const VENDOR_PASSWORD = requiredEnv('E2E_VENDOR_PASSWORD')
const VENDOR2_PASSWORD = requiredEnv('E2E_VENDOR2_PASSWORD')

// Populated by test 7, read by test 8 — safe because playwright.config.js
// runs this suite with workers: 1 / fullyParallel: false, so tests in this
// file execute strictly in order, never concurrently.
let vendor1ProjectNames = null

test.describe('Vendor pilot smoke test', () => {
  test('5. vendor@ login works', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await expect(page).not.toHaveURL(/\/$/)
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  })

  test('6. Vendor Projects loads', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/vendor-projects')
    await expect(page).toHaveURL(/\/vendor-projects$/)
    const loaded = page.locator('[data-testid="vendor-project-card"]').or(page.getByText(/not on any projects/i))
    await expect(loaded.first()).toBeVisible({ timeout: 10_000 })
  })

  test('7. vendor@ sees only its assigned project', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/vendor-projects')
    await page.waitForLoadState('networkidle')
    vendor1ProjectNames = await collectCardNames(page, 'vendor-project-card')

    if (vendor1ProjectNames.length === 0) {
      test.skip(true, `${VENDOR_EMAIL} has no assigned projects in this environment — seed at least one to exercise isolation checks.`)
    }
    expect(vendor1ProjectNames.length).toBeGreaterThan(0)
  })

  test('8. vendor2@ sees only its assigned project', async ({ page }) => {
    await login(page, VENDOR2_EMAIL, VENDOR2_PASSWORD)
    await page.goto('/vendor-projects')
    await page.waitForLoadState('networkidle')
    const vendor2ProjectNames = await collectCardNames(page, 'vendor-project-card')

    if (vendor2ProjectNames.length === 0) {
      test.skip(true, `${VENDOR2_EMAIL} has no assigned projects in this environment — seed at least one to exercise isolation checks.`)
    }
    expect(vendor2ProjectNames.length).toBeGreaterThan(0)

    // The actual isolation assertion: whatever vendor@ saw in test 7 and
    // whatever vendor2@ sees here must be completely disjoint sets. This is
    // the real pilot-safety check — not just "a list renders."
    if (vendor1ProjectNames && vendor1ProjectNames.length > 0) {
      const overlap = vendor2ProjectNames.filter(name => vendor1ProjectNames.includes(name))
      expect(overlap, `vendor2@ can see a project belonging to ${VENDOR_EMAIL}: ${JSON.stringify(overlap)}`).toEqual([])
    }
  })

  test('9. vendor cannot access /projects', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/projects')
    // App.jsx's ProtectedRoute redirects any role to its own default
    // landing page when the path isn't in that role's allowed prefixes —
    // for vendor that's '/booking'. Assert the vendor never actually lands
    // on the internal /projects route, by URL, not by absence of content
    // (a redirect that silently rendered nothing would also "look" safe).
    await page.waitForURL(url => url.pathname !== '/projects', { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/projects$/)
  })
})
