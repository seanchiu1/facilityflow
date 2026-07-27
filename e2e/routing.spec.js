// Confirms the Vercel SPA rewrite (vercel.json) is actually deployed —
// without it, a hard refresh on any client-side route 404s at the host
// level before React Router ever gets a chance to run.
import { test, expect } from '@playwright/test'
import { requiredEnv, login, expectNoVercel404 } from './helpers.js'

const MANAGER_EMAIL = requiredEnv('E2E_MANAGER_EMAIL')
const MANAGER_PASSWORD = requiredEnv('E2E_MANAGER_PASSWORD')
const VENDOR_EMAIL = requiredEnv('E2E_VENDOR_EMAIL')
const VENDOR_PASSWORD = requiredEnv('E2E_VENDOR_PASSWORD')

test.describe('Route refresh — no Vercel 404', () => {
  test('10a. refresh on /projects does not 404', async ({ page }) => {
    await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
    await page.goto('/projects')
    await expect(page).toHaveURL(/\/projects$/)

    await page.reload()

    await expect(page).toHaveURL(/\/projects$/)
    await expectNoVercel404(page)
  })

  test('10b. refresh on /vendor-projects does not 404', async ({ page }) => {
    await login(page, VENDOR_EMAIL, VENDOR_PASSWORD)
    await page.goto('/vendor-projects')
    await expect(page).toHaveURL(/\/vendor-projects$/)

    await page.reload()

    await expect(page).toHaveURL(/\/vendor-projects$/)
    await expectNoVercel404(page)
  })
})
