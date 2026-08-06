import { defineConfig, devices } from '@playwright/test'

// Chromium only: cross-browser is a production question — three browsers
// triple the wait for zero design signal.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI, // a stray .only in CI silently skips the suite
  // Retries exist to CAPTURE TRACES of flakes, not to hide them — the pairing
  // with on-first-retry is the point.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    contextOptions: { reducedMotion: 'reduce' }, // animation timing is not a flow
  },
  expect: { timeout: 5_000 }, // assertion patience ≠ test patience
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
