// Manager-role pilot smoke tests: login, dashboard/projects load,
// ProjectDetail opens, notification bell opens.
import { test, expect } from '@playwright/test'
import { requiredEnv, login } from './helpers.js'

const MANAGER_EMAIL = requiredEnv('E2E_MANAGER_EMAIL')
const MANAGER_PASSWORD = requiredEnv('E2E_MANAGER_PASSWORD')

test.describe('Manager pilot smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
  })

  test('1. manager login works', async ({ page }) => {
    // login() in beforeEach already waited for a post-login redirect —
    // this test just asserts the session actually landed somewhere real,
    // not back on the login form.
    await expect(page).not.toHaveURL(/\/$/)
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  })

  test('2. manager dashboard/projects load', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('text=FacilityFlow').first()).toBeVisible()
    // Dashboard renders without falling back to a route-guard redirect.
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/projects')
    await expect(page).toHaveURL(/\/projects$/)
    // Either real project cards or the page's own empty state — both are
    // valid "loaded successfully" outcomes; a console error or blank page
    // is what this test is actually guarding against.
    const loaded = page.locator('[data-testid="project-card"]').or(page.getByText(/no projects/i))
    await expect(loaded.first()).toBeVisible({ timeout: 10_000 })
  })

  test('3. ProjectDetail opens', async ({ page }) => {
    await page.goto('/projects')
    const firstCard = page.locator('[data-testid="project-card"]').first()

    if ((await page.locator('[data-testid="project-card"]').count()) === 0) {
      test.skip(true, 'No projects exist in this environment to open — seed at least one project to exercise this test.')
    }

    await firstCard.click()
    await expect(page).toHaveURL(/\/projects\/[^/]+$/)
    // Project Summary card is always present on a loaded ProjectDetail page.
    await expect(page.locator('text=/summary/i').first()).toBeVisible({ timeout: 10_000 })
  })

  test('4. notification bell opens', async ({ page }) => {
    await page.goto('/dashboard')
    const bell = page.locator('[data-testid="notification-bell"]')
    await expect(bell).toBeVisible()
    await bell.click()
    await expect(page.locator('[data-testid="notification-dropdown"]')).toBeVisible()
  })
})
