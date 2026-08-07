import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: 'e2e',
	testIgnore: '**/_port/**',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:5273',
		trace: 'on-first-retry',
		contextOptions: { reducedMotion: 'reduce' },
	},
	expect: { timeout: 5_000 },
	// reuseExistingServer stays FALSE, including locally. With it on, Playwright
	// adopts whatever already listens on 5173 — and the Vite default 5173 is
	// routinely a DIFFERENT project's dev server. A full e2e run then
	// grades someone else's app and reports its failures as yours; this cost a
	// real debugging session and nearly produced a bug report against a template
	// that was fine. Same family as the stale-`./build` trap in check:startup: a
	// gate measured against the wrong artifact is worse than no gate. The cost is
	// a server boot per run; correctness is worth more than the seconds.
	webServer: { command: 'npm run dev', port: 5273, reuseExistingServer: false },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
