// Import { test, expect } from '../helpers' in every flow spec — the browser
// clock is then pinned to the fixture's NOW before the page loads. Determinism
// by construction, not by remembering. (Pins Date, timers, and performance.)
import { test as base, expect } from '@playwright/test'
import { NOW } from '../src/fixtures/now'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: NOW })
    await use(page)
  },
})

export { expect }
