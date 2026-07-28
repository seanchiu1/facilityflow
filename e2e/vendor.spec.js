// Vendor-role pilot smoke tests: login, Vendor Projects loads, and —
// the tests that actually matter for a pilot — cross-vendor isolation and
// the internal /projects route being genuinely unreachable for a vendor.
//
// Privacy rule this file tests against (see VENDOR_ISOLATION_AUDIT.md for
// the full database-level audit): FacilityFlow allows multiple vendors to
// be members of the SAME project — so two vendors legitimately seeing the
// same project name/shell on /vendor-projects is not a leak. What must
// stay isolated is vendor-SCOPED content within a project (and elsewhere):
// vendor tasks, vendor comments, vendor documents, and bookings. Isolation
// is therefore checked by comparing that scoped content directly (tests
// 12–15), never by asserting project *names* are disjoint.
import { test, expect } from '@playwright/test'
import { requiredEnv, login, collectCardNames, collectTexts, collectVendorProjectDetailTexts } from './helpers.js'

const VENDOR_EMAIL = requiredEnv('E2E_VENDOR_EMAIL')
const VENDOR2_EMAIL = requiredEnv('E2E_VENDOR2_EMAIL')
const VENDOR_PASSWORD = requiredEnv('E2E_VENDOR_PASSWORD')
const VENDOR2_PASSWORD = requiredEnv('E2E_VENDOR2_PASSWORD')

// Populated by an earlier test, read by a later one — safe because
// playwright.config.js runs this suite with workers: 1 / fullyParallel:
// false, so tests in this file execute strictly in order, never concurrently.
let vendor1BookingCodes = null
let vendor1ProjectContent = null

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

  test('7. vendor@ project list loads', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/vendor-projects')
    await page.waitForLoadState('networkidle')
    const vendor1ProjectNames = await collectCardNames(page, 'vendor-project-card')

    if (vendor1ProjectNames.length === 0) {
      test.skip(true, `${VENDOR_EMAIL} has no assigned projects in this environment — seed at least one to exercise the deeper isolation checks (12–15).`)
    }
    expect(vendor1ProjectNames.length).toBeGreaterThan(0)
  })

  test('8. vendor2@ project list loads (shared project names with vendor@ are expected and allowed)', async ({ page }) => {
    await login(page, VENDOR2_EMAIL, VENDOR2_PASSWORD)
    await page.goto('/vendor-projects')
    await page.waitForLoadState('networkidle')
    const vendor2ProjectNames = await collectCardNames(page, 'vendor-project-card')

    if (vendor2ProjectNames.length === 0) {
      test.skip(true, `${VENDOR2_EMAIL} has no assigned projects in this environment — seed at least one to exercise the deeper isolation checks (12–15).`)
    }
    expect(vendor2ProjectNames.length).toBeGreaterThan(0)

    // Deliberately NOT asserting vendor2's project names are disjoint from
    // vendor@'s. FacilityFlow supports multiple vendors on the same
    // project (project_vendor_members is many-to-many), so both vendors
    // legitimately seeing e.g. "Building A Elevator Modernization" here is
    // correct behavior, not a leak — a project's name/shell is not
    // vendor-identifying information. The actual privacy boundary is
    // vendor-SCOPED content within a project (tasks/comments/documents)
    // and bookings, which tests 12–15 check directly by comparing that
    // content, never by comparing which project names each vendor can see.
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

  test('10. vendor cannot access /roster', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/roster')
    await page.waitForURL(url => url.pathname !== '/roster', { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/roster$/)
  })

  test('11. vendor cannot access /schedule', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/schedule')
    await page.waitForURL(url => url.pathname !== '/schedule', { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/schedule$/)
  })

  test('12. vendor@ bookings collected (for isolation check in the next test)', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/my-bookings')
    await page.waitForLoadState('networkidle')
    vendor1BookingCodes = await collectTexts(page, 'booking-code')
  })

  test('13. vendor2@ cannot see vendor@ bookings', async ({ page }) => {
    await login(page, VENDOR2_EMAIL, VENDOR2_PASSWORD)
    await page.goto('/my-bookings')
    await page.waitForLoadState('networkidle')
    const vendor2BookingCodes = await collectTexts(page, 'booking-code')

    if ((vendor1BookingCodes?.length ?? 0) === 0 && vendor2BookingCodes.length === 0) {
      test.skip(true, 'Neither vendor has any bookings in this environment — nothing to check overlap against. Submit at least one booking as each vendor to exercise this check.')
    }

    const overlap = vendor2BookingCodes.filter(code => (vendor1BookingCodes || []).includes(code))
    expect(overlap, `vendor2@ can see a booking code belonging to ${VENDOR_EMAIL}: ${JSON.stringify(overlap)}`).toEqual([])
  })

  test('14. vendor@ project tasks/comments/docs collected (for isolation check in the next test)', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    vendor1ProjectContent = await collectVendorProjectDetailTexts(page)
  })

  test('15. vendor2@ cannot see vendor@ project tasks, comments, or documents', async ({ page }) => {
    await login(page, VENDOR2_EMAIL, VENDOR2_PASSWORD)
    const vendor2ProjectContent = await collectVendorProjectDetailTexts(page)

    const totalVendor1Items = (vendor1ProjectContent?.tasks.length ?? 0)
      + (vendor1ProjectContent?.comments.length ?? 0) + (vendor1ProjectContent?.documents.length ?? 0)
    const totalVendor2Items = vendor2ProjectContent.tasks.length
      + vendor2ProjectContent.comments.length + vendor2ProjectContent.documents.length

    if (totalVendor1Items === 0 && totalVendor2Items === 0) {
      test.skip(true, 'Neither vendor has any project tasks/comments/documents in this environment — nothing to check overlap against.')
    }

    // This is the strongest version of the isolation check: it holds even
    // when both vendors are members of the SAME project (as in the seeded
    // demo data) — each vendor's task/comment/document list must still be
    // completely disjoint from the other's, because RLS scopes every one
    // of these tables by vendor_profile_id = auth.uid(), not by project
    // membership alone.
    for (const key of ['tasks', 'comments', 'documents']) {
      const vendor1Items = vendor1ProjectContent?.[key] || []
      const overlap = vendor2ProjectContent[key].filter(text => vendor1Items.includes(text))
      expect(overlap, `vendor2@ can see ${key} belonging to ${VENDOR_EMAIL}: ${JSON.stringify(overlap)}`).toEqual([])
    }
  })
})
