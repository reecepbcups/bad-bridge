import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const PORT = 4318
const UI = fileURLToPath(new URL('..', import.meta.url))

// Read-only checks of the real build (reece-test on mainnet) in a browser with no wallet. Slow and network-bound:
// never part of `pnpm check` or `pnpm test:e2e`. Run with `pnpm test:e2e:live`.
export default defineConfig({
  testDir: '.',
  // its own folder: the demo e2e run wipes test-results/ when it starts
  outputDir: '../test-results-live',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // public RPCs have bad minutes
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // the reece-test build, pinned so a .env.local can't swap the deployment under the test. No VITE_ALLOW_DEMO:
    // this is the build users get, where ?demo is ignored.
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: UI,
    env: { VITE_DEPLOYMENT: 'reece-test', VITE_ALLOW_DEMO: '' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
