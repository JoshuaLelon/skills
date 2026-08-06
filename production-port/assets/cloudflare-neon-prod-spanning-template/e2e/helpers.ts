// test/expect with the clock pre-pinned to the fixture anchor — determinism by
// construction (skill: flow tests).
import { test as base, expect } from '@playwright/test'

export const NOW = new Date('2026-08-04T09:00:00')

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.clock.install({ time: NOW })
		await use(page)
	},
})

export { expect }
