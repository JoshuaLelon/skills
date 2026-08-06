import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: 'e2e',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		contextOptions: { reducedMotion: 'reduce' },
	},
	expect: { timeout: 5_000 },
	webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: !process.env.CI },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
