// test/expect with the clock pre-pinned to the fixture anchor — determinism by
// construction (skill: flow tests).
import { test as base, expect } from '@playwright/test'
import { NOW } from '../src/fixtures/now'

/** @public — re-exported so specs anchor on one clock import, not two. */
export { NOW }

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.clock.install({ time: NOW })
		await use(page)
	},
})

export { expect }
