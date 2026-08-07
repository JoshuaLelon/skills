// THE INTEGRATION TIER'S RUNTIME, DECLARED (ADR-0021).
//
// The test FILE runs in Node — vitest is the runner and that is fine. The app
// under test does not: createTestHarness starts ./build in workerd, and every
// assertion travels over HTTP into that runtime, through the same Hyperdrive
// binding production uses. The tier used to import loaders and the query module
// straight into the Node process, which tested the server in a runtime the
// server never runs in — a Node-vs-workerd difference (a missing global, the
// nodejs_compat surface, subtly different streams) would have passed here and
// failed in production.
import { createTestHarness, type TestHarness } from 'wrangler'
import { buildStaleness } from '../scripts/build-freshness.mjs'

// The config the BUILD generated, not the one you edit. Under
// @cloudflare/vite-plugin this is what `wrangler deploy` uploads (no_bundle,
// main: index.js, bindings already flattened for the selected environment), so
// pointing the harness at the source wrangler.jsonc would test a bundle nobody
// ships.
const BUILT_CONFIG = './build/server/wrangler.json'

/**
 * Starts the BUILT Worker in workerd. Call in `beforeAll`, `close()` in
 * `afterAll`. The caller awaits `listen()` — booting the runtime is the slow
 * part and belongs in a hook, not at import time.
 */
export function startBuiltWorker(): TestHarness {
	// The same stale-artifact trap ADR-0017 imposed on the startup budget: this
	// tier now grades ./build, so a stale ./build means a green run that proves
	// nothing about the tree. `test:int` builds first; this catches the person
	// who runs vitest directly.
	const stale = buildStaleness()
	if (stale)
		throw new Error(
			`${stale} — the integration tier runs the BUILT worker in workerd (ADR-0021), so this would test a stale bundle; run \`npm run build\` first`,
		)

	return createTestHarness({
		workers: [
			{
				configPath: BUILT_CONFIG,
				// The built config carries ENVIRONMENT: production — that is what the
				// artifact IS — and /login/dev fails closed there, correctly. Tests get
				// the production BUNDLE with a development ENVIRONMENT; that one var is
				// the only difference between this and a deploy.
				vars: { ENVIRONMENT: 'development' },
				// Pinned, not inherited from .dev.vars: that file is gitignored, so a
				// tier that reads it passes or fails by what happens to be on a disk.
				secrets: { SESSION_SECRET: 'integration-only-not-a-secret' },
			},
		],
	})
}

/**
 * Mints a fresh owner through the real session door. Isolation is by OWNER, not
 * by resetting storage (ADR-0006) — which is what keeps this tier parallel-safe
 * and why `reset()` is deliberately unused.
 */
export async function signIn(server: TestHarness, owner: string = crypto.randomUUID()) {
	const res = await server.fetch(`/login/dev?as=${owner}`, { redirect: 'manual' })
	const cookie = res.headers.get('set-cookie')?.split(';')[0]
	if (!cookie) throw new Error(`dev login minted no session (HTTP ${res.status})`)
	return { owner, cookie }
}
