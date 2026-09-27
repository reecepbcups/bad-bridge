import { defineConfig, devices } from '@playwright/test'

const PORT = 4317

// e2e runs the production build (vite preview) against the demo adapter (?demo): no network, deterministic.
// Production builds ignore ?demo unless VITE_ALLOW_DEMO=1, so this build turns it on.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // fixed zone and locale so dates in the demo render the same everywhere
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    env: { VITE_DEPLOYMENT: 'reece-test', VITE_ALLOW_DEMO: '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
