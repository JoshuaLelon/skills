import { defineConfig } from 'vitest/config'

// Integration layer (testing.md): real Postgres, no browser. Needs `npm run
// db:up` first — CI skips this config (cheap half).
//
// `environment` here describes the RUNNER, not the app. The test file runs in
// Node; the app under test runs in WORKERD, started from ./build by
// createTestHarness in integration/harness.ts (ADR-0021). Reading this line as
// "the integration tier runs in Node" was true once and was the bug — the tier
// claimed to navigate the server while executing it in a runtime the server
// never runs in. check-config-traps now fails if nothing here starts the
// harness, so the claim cannot quietly revert.
export default defineConfig({
	test: {
		include: ['integration/**/*.test.ts'],
		environment: 'node',
		// Booting workerd and loading the built bundle takes seconds, and it
		// happens in beforeAll — the default 10s hook timeout is a flake waiting
		// for a cold machine.
		hookTimeout: 60_000,
		testTimeout: 30_000,
	},
})
