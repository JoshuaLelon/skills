import { defineConfig } from 'vitest/config'

// THE UNIT TIER. Node only, no browser, no jsdom.
//
// The browser suite proves the SEQUENCE and the LANGUAGE — the order of acts,
// the copy on screen, the absences. It cannot prove the COMBINATORICS: twenty
// walked paths do not cover a store of pure functions across ninety actions.
// This is where the combinatorics go, and it costs milliseconds instead of
// seconds, which is why the pre-commit hook runs it BEFORE Playwright.
//
// It runs nothing under `e2e/`. Those are Playwright's, and a runner that
// claimed them would load a browser fixture in Node and fail confusingly.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
})
