// Import { test, expect } from '../helpers' in every flow spec — the browser
// clock is then pinned to the fixture's NOW before the page loads. Determinism
// by construction, not by remembering. (Pins Date, timers, and performance.)
//
// Pinning is right HERE and wrong in production, and the rule behind both is
// that the clock follows the DATA. A prototype's fixture holds absolute instants
// anchored on NOW and there is no server, so clock and data agree only when the
// clock is NOW. After the port the seeder rebases those same instants onto a
// live `now`, so the data is relative to the real clock and production's copy of
// this file leaves the clock alone. check-parity.mjs asserts both halves, so the
// divergence stays deliberate instead of becoming drift.
import { test as base, expect } from '@playwright/test'
import { NOW } from '../src/fixtures/now'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: NOW })
    await use(page)
  },
})

export { expect }
