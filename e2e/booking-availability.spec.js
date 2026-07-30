// Booking availability E2E — exercises the fix in
// BOOKING_AVAILABILITY_DEBUG.md end to end: a manager creates a real
// staff_schedules slot via Schedule Management (using the now-live
// active-profiles staff picker, not the old hardcoded demo list), and a
// vendor session sees that exact slot appear via
// get_available_schedule_slots() on the Booking Form. Also proves a vendor
// still cannot read staff_schedules directly via a raw REST call — the
// same attack vector VENDOR_ISOLATION_AUDIT.md checks at the database
// layer, checked here from the actual deployed app.
//
// This is the one file in this suite that writes real data. It cleans up
// after itself in afterAll (delete the created shift) regardless of
// whether the later assertions passed, so a failed run doesn't leave a
// stray slot behind.
import { test, expect } from '@playwright/test'
import { requiredEnv, login, captureSupabaseRestAuth } from './helpers.js'

const MANAGER_EMAIL = requiredEnv('E2E_MANAGER_EMAIL')
const MANAGER_PASSWORD = requiredEnv('E2E_MANAGER_PASSWORD')
const VENDOR_EMAIL = requiredEnv('E2E_VENDOR_EMAIL')
const VENDOR_PASSWORD = requiredEnv('E2E_VENDOR_PASSWORD')

const EQUIPMENT = 'Other'

// Populated by test A, read by test B and the afterAll cleanup — safe
// because playwright.config.js runs this suite serially (workers: 1).
let createdSlot = null // { date, notes, staffName }

test.describe('Booking availability (Schedule Management → Vendor Booking)', () => {
  test('A. manager creates a real staff_schedules slot via Schedule Management', async ({ page }) => {
    await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
    await page.goto('/schedule')
    await expect(page).toHaveURL(/\/schedule$/)

    // Move to next week first — Add Shift's date defaults to that week's
    // Monday, keeping this test's data away from today/this-week seeded
    // data without needing to duplicate the component's date math here.
    await page.locator('[data-testid="schedule-next-week"]').click()
    await page.locator('[data-testid="schedule-add-shift-button"]').click()

    const dateInput = page.locator('input[type="date"]')
    const targetDate = await dateInput.inputValue()

    const staffSelect = page.locator('[data-testid="shift-staff-select"]')
    const optionCount = await staffSelect.locator('option').count()
    if (optionCount <= 1) {
      // Only the "Select a staff member…" placeholder exists — no active
      // admin/manager/staff account in this environment to assign to.
      test.skip(true, 'No active admin/manager/staff accounts found — create one via Admin → Users to exercise this test.')
    }

    await staffSelect.selectOption({ index: 1 })
    const staffLabel = (await staffSelect.locator('option:checked').textContent()) || ''
    const staffName = staffLabel.split('—')[0].trim()

    await page.locator('[data-testid="shift-equipment-select"]').selectOption(EQUIPMENT)

    const uniqueNote = `E2E-SLOT-${Date.now()}`
    await page.locator('[data-testid="shift-notes-input"]').fill(uniqueNote)
    await page.locator('[data-testid="shift-submit"]').click()

    // Modal closes and the new shift renders in the grid with its notes
    // visible — this is the create-and-use-a-slot half of the check.
    await expect(page.getByText(uniqueNote)).toBeVisible({ timeout: 10_000 })

    createdSlot = { date: targetDate, notes: uniqueNote, staffName }
  })

  test('B. vendor@ sees the new slot through get_available_schedule_slots()', async ({ page }) => {
    if (!createdSlot) {
      test.skip(true, 'Slot was not created in the previous test — see its skip/failure reason.')
    }

    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/booking')

    await page.getByRole('button', { name: EQUIPMENT, exact: true }).click()
    await page.locator('input[type="date"]').fill(createdSlot.date)

    // Proves the fix end to end: BookingForm.jsx calls
    // get_available_schedule_slots(equipment_type, date) — a vendor who
    // never had direct staff_schedules access still sees exactly the slot
    // a manager just created for this equipment/date, via the RPC.
    await expect(page.getByText(createdSlot.notes)).toBeVisible({ timeout: 10_000 })
    if (createdSlot.staffName) {
      await expect(page.getByText(createdSlot.staffName, { exact: false }).first()).toBeVisible()
    }
  })

  test('C. vendor cannot read staff_schedules via direct REST call', async ({ page, request }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    // Start listening before navigating, so the goto's own requests (e.g.
    // Topbar's notification fetch, which fires on every page) are caught.
    const authInfoPromise = captureSupabaseRestAuth(page)
    await page.goto('/booking')
    const { baseUrl, apikey, authorization } = await authInfoPromise

    // Reproduces exactly what a vendor could do by opening devtools and
    // querying the table directly — no app code involved on this call.
    const res = await request.get(`${baseUrl}/rest/v1/staff_schedules?select=*`, {
      headers: { apikey, authorization },
    })
    // RLS denial is an empty array with a 200, not an error status — a
    // vendor's request is authenticated and well-formed, it just matches
    // zero rows under the current policy (see VENDOR_ISOLATION_AUDIT.md).
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body, 'vendor was able to read staff_schedules rows directly').toEqual([])
  })

  test.afterAll(async ({ browser }) => {
    if (!createdSlot) return
    const page = await browser.newPage()
    try {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
      await page.goto('/schedule')
      await page.locator('[data-testid="schedule-next-week"]').click()
      const card = page.locator(
        `xpath=//*[contains(text(), ${JSON.stringify(createdSlot.notes)})]/ancestor::div[contains(@class, "group/card")]`
      )
      await card.locator('[data-testid="shift-delete"]').click()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Cleanup failed to delete test shift with notes "${createdSlot.notes}" — remove it manually via Schedule Management.`, err)
    } finally {
      await page.close()
    }
  })
})
