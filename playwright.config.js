import { defineConfig, devices } from '@playwright/test'

// Pilot-focused E2E suite — always targets an already-deployed FacilityFlow
// instance (Vercel), never spins up a local dev server. E2E_BASE_URL is
// required; see e2e/README.md for the full list of env vars and how to run
// this locally against a Vercel deployment.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // deliberately serial — vendor isolation tests read
                         // shared demo state and are easier to reason about
                         // one at a time than debugging flaky parallel runs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
