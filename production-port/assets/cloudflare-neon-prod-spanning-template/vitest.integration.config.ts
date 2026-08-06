import { defineConfig } from 'vitest/config'

// Integration layer (testing.md): real Postgres, no browser. Needs `npm run
// db:up` first — CI skips this config (cheap half).
export default defineConfig({
	test: { include: ['integration/**/*.test.ts'], environment: 'node' },
})
