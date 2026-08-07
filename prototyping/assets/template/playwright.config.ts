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
    baseURL: 'http://localhost:5373',
    trace: 'on-first-retry',
    contextOptions: { reducedMotion: 'reduce' }, // animation timing is not a flow
  },
  expect: { timeout: 5_000 }, // assertion patience ≠ test patience
  // reuseExistingServer stays FALSE, including locally. With it on, Playwright
  // adopts whatever already listens on the port — and on 5173, Vite's default,
  // that is routinely a DIFFERENT project's dev server. A full e2e run then
  // grades someone else's app and reports its failures as yours. That happened:
  // a prototype run spent an hour debugging a component that was never broken,
  // against a day-planner app that was never its own. The production template
  // carried this fix, a comment describing the incident, AND a config-traps gate
  // — and none of it reached here, because playwright.config.ts was not in
  // check-parity's list. It is now.
  webServer: {
    command: 'npm run dev',
    port: 5373,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
