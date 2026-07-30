// Booking availability E2E — exercises the booking availability rule end
// to end: staff aren't equipment specialists and have no per-vendor
// capacity limit, so availability depends on date/time only. A manager
// creates ONE staff time slot tagged with one equipment type; multiple
// vendors, each browsing with a DIFFERENT equipment type selected, must
// still see and be able to book that same slot. Also proves a vendor
// still cannot read staff_schedules directly via a raw REST call — the
// same attack vector VENDOR_ISOLATION_AUDIT.md checks at the database
// layer, checked here from the actual deployed app.
//
// This is the one file in this suite that writes real data: one
// staff_schedules row (deleted in afterAll) and, if test B reaches
// submission, one appointment_requests row (cancelled in afterAll via the
// real "Update Status → Cancelled" action, the same one a manager would
// use). Both cleanups run regardless of whether earlier assertions
// passed, so a failed run doesn't leave stray data behind.
import { test, expect } from '@playwright/test'
import { requiredEnv, login, captureSupabaseRestAuth } from './helpers.js'

const MANAGER_EMAIL = requiredEnv('E2E_MANAGER_EMAIL')
const MANAGER_PASSWORD = requiredEnv('E2E_MANAGER_PASSWORD')
const VENDOR_EMAIL = requiredEnv('E2E_VENDOR_EMAIL')
const VENDOR_PASSWORD = requiredEnv('E2E_VENDOR_PASSWORD')
const VENDOR2_EMAIL = requiredEnv('E2E_VENDOR2_EMAIL')
const VENDOR2_PASSWORD = requiredEnv('E2E_VENDOR2_PASSWORD')

// The slot is tagged with this equipment type when created — every vendor
// test below deliberately selects a DIFFERENT one while browsing, which is
// the actual thing being proven: equipment type never filters availability.
const SLOT_EQUIPMENT = 'HVAC'
const VENDOR1_BROWSE_EQUIPMENT = 'Elevator'
const VENDOR2_BROWSE_EQUIPMENT = 'Fire Safety'

const RUN_ID = Date.now()
const TEST_VENDOR_NAME = `E2E Test Vendor ${RUN_ID}`

// Populated by test A, read by later tests and the afterAll cleanup — safe
// because playwright.config.js runs this suite serially (workers: 1).
let createdSlot = null // { date, notes, staffName }
let createdBookingCode = null

test.describe('Booking availability (Schedule Management → Vendor Booking)', () => {
  test('A. manager creates one staff time slot', async ({ page }) => {
    await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
    await page.goto('/schedule')
    await expect(page).toHaveURL(/\/schedule$/)

    // Move to next week first — Add Time Slot's date defaults to that
    // week's Monday, keeping this test's data away from today/this-week
    // seeded data without needing to duplicate the component's date math.
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

    // Tagged with one specific equipment type — every later test
    // deliberately browses with a DIFFERENT one selected.
    await page.locator('[data-testid="shift-equipment-select"]').selectOption(SLOT_EQUIPMENT)

    const uniqueNote = `E2E-SLOT-${RUN_ID}`
    await page.locator('[data-testid="shift-notes-input"]').fill(uniqueNote)
    await page.locator('[data-testid="shift-submit"]').click()

    // Modal closes and the new shift renders in the grid with its notes visible.
    await expect(page.getByText(uniqueNote)).toBeVisible({ timeout: 10_000 })

    createdSlot = { date: targetDate, notes: uniqueNote, staffName }
  })

  test('B. vendor@ sees the slot with a different equipment type selected, and can book it', async ({ page }) => {
    if (!createdSlot) {
      test.skip(true, 'Slot was not created in the previous test — see its skip/failure reason.')
    }

    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/booking')

    // Deliberately NOT the equipment type the slot was tagged with — this
    // is the core proof that equipment never filters availability.
    expect(VENDOR1_BROWSE_EQUIPMENT).not.toBe(SLOT_EQUIPMENT)
    await page.getByRole('button', { name: VENDOR1_BROWSE_EQUIPMENT, exact: true }).click()
    await page.locator('input[type="date"]').fill(createdSlot.date)

    await expect(page.getByText(createdSlot.notes)).toBeVisible({ timeout: 10_000 })
    if (createdSlot.staffName) {
      await expect(page.getByText(createdSlot.staffName, { exact: false }).first()).toBeVisible()
    }

    // Select the slot, then switch equipment again — this must not clear
    // the slot list or the current selection (the exact bug this rule fix
    // closes: changing equipment used to re-fetch and reset slotId).
    await page.locator(`label:has-text("${createdSlot.notes}") input[type="radio"]`).check()
    await page.getByRole('button', { name: SLOT_EQUIPMENT, exact: true }).click() // switch back to the slot's own tag
    await expect(page.locator(`label:has-text("${createdSlot.notes}") input[type="radio"]`)).toBeChecked()

    // Complete a real booking submission — "vendor can still create a
    // booking with an equipment type" — equipment type is still required
    // data on the request even though it no longer gates slot visibility.
    // Vendor/contact name fields — filled generically via their labels'
    // sibling inputs since BookingForm prefills them for a real vendor
    // session; this fill is a safety net if either is still empty.
    const vendorNameInput = page.locator('form input[type="text"]').first()
    if (!(await vendorNameInput.inputValue())) await vendorNameInput.fill(TEST_VENDOR_NAME)
    const contactNameInput = page.locator('form input[type="text"]').nth(1)
    if (!(await contactNameInput.inputValue())) await contactNameInput.fill('E2E Tester')
    await page.locator('form textarea').fill('Automated E2E test booking — safe to cancel/delete.')

    await page.getByRole('button', { name: /submit request/i }).click()
    await expect(page.getByText(/appointment code/i)).toBeVisible({ timeout: 10_000 })
    const codeText = await page.locator('span.font-mono.font-bold').first().textContent().catch(() => null)
    createdBookingCode = (codeText || '').trim() || null
  })

  test('C. vendor2@ also sees the same slot with a third equipment type selected', async ({ page }) => {
    if (!createdSlot) {
      test.skip(true, 'Slot was not created in test A — see its skip/failure reason.')
    }

    await login(page, VENDOR2_EMAIL, VENDOR2_PASSWORD)
    await page.goto('/booking')

    expect(VENDOR2_BROWSE_EQUIPMENT).not.toBe(SLOT_EQUIPMENT)
    await page.getByRole('button', { name: VENDOR2_BROWSE_EQUIPMENT, exact: true }).click()
    await page.locator('input[type="date"]').fill(createdSlot.date)

    // Proves no per-vendor capacity limit: a second, independent vendor
    // sees and can select the exact same slot vendor@ already interacted
    // with in test B — nothing marks it unavailable or "full."
    const slotLabel = page.locator(`label:has-text("${createdSlot.notes}")`)
    await expect(slotLabel).toBeVisible({ timeout: 10_000 })
    await expect(slotLabel.locator('input[type="radio"]')).toBeEnabled()
  })

  test('D. vendor cannot read staff_schedules via direct REST call', async ({ page, request }) => {
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
    const page = await browser.newPage()
    try {
      await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)

      // Cancel the test booking, if one was created — the same
      // Update Status → Cancelled action a manager uses for a real
      // request, not a database-level delete.
      if (createdBookingCode) {
        await page.goto('/requests')
        await page.locator('input[placeholder]').first().fill(TEST_VENDOR_NAME).catch(() => {})
        const row = page.locator(`tr:has-text("${TEST_VENDOR_NAME}")`).first()
        const rowVisible = await row.isVisible({ timeout: 5000 }).catch(() => false)
        if (rowVisible) {
          await row.click()
          await page.waitForURL(/\/appointments\/[^/]+$/, { timeout: 10_000 })
          await page.getByRole('button', { name: 'Cancelled', exact: true }).click().catch(() => {})
        }
      }

      // Delete the test staff_schedules slot.
      if (createdSlot) {
        await page.goto('/schedule')
        await page.locator('[data-testid="schedule-next-week"]').click()
        const card = page.locator(
          `xpath=//*[contains(text(), ${JSON.stringify(createdSlot.notes)})]/ancestor::div[contains(@class, "group/card")]`
        )
        await card.locator('[data-testid="shift-delete"]').click()
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Cleanup step failed — remove test data manually via Schedule Management / Requests.', err)
    } finally {
      await page.close()
    }
  })
})
