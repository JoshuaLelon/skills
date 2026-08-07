// The tenant-isolation regression test (ADR-0006), driven through the RUNNING
// Worker (ADR-0021): two owners act through the real HTTP surface — loader,
// action, guarded(), the one seeder, the query module, the Hyperdrive binding,
// real Postgres — and neither sees the other. Nothing here imports app code;
// everything asserted below executed in workerd, in the bundle a deploy ships.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { signIn, startBuiltWorker } from './harness'

// The Done button carries aria-label `Complete <title>`; its presence is the
// note's status, read the same way a user reads it.
const CAN_COMPLETE_FIRST_NOTE = /Complete Read the walking skeleton/

let server: ReturnType<typeof startBuiltWorker>

beforeAll(async () => {
	server = startBuiltWorker()
	await server.listen()
})
// `server?` — if beforeAll threw (a stale ./build is the likely reason) there
// is nothing to close, and a TypeError here would bury the real failure.
afterAll(() => server?.close())

const notesPage = async (cookie: string) => {
	const res = await server.fetch('/', { headers: { cookie } })
	expect(res.status).toBe(200)
	return res.text()
}

test('the tier runs the BUILT worker through Hyperdrive, not a Node import', async () => {
	// The binding production uses. In the old Node tier the query module read
	// DATABASE_URL directly, so `env.HYPERDRIVE` — the one seam between the
	// Worker and Neon — was never on the path a test exercised.
	const env = await server.getWorker<Env>().getEnv()
	expect(env.HYPERDRIVE?.connectionString).toBeTruthy()

	// /health is the whole spine: worker → Hyperdrive → Postgres.
	const res = await server.fetch('/health')
	expect(res.status).toBe(200)
	expect(await res.json()).toEqual({ ok: true, env: 'development' })
})

test('owners are isolated through the running worker', async () => {
	const a = await signIn(server)
	const b = await signIn(server)

	// The notes loader seeds on first visit — the one seeder (ADR-0010), reached
	// the way the product reaches it rather than called directly.
	expect(await notesPage(a.cookie)).toMatch(CAN_COMPLETE_FIRST_NOTE)
	expect(await notesPage(b.cookie)).toMatch(CAN_COMPLETE_FIRST_NOTE)

	server.clearLogs()
	// `?index` targets the INDEX route's action. A document POST to `/` matches
	// root, which has no action, and React Router answers 405 — the app is
	// right and the request was wrong, which is the kind of thing a tier that
	// never made a real request cannot tell you.
	const done = await server.fetch('/?index', {
		method: 'POST',
		headers: { cookie: a.cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ intent: 'complete', ref: 'note:read-the-skeleton' }).toString(),
	})
	expect(done.status).toBe(200)

	// A completed it; B's copy is untouched. Same ref, same query module, two
	// owners — the regression this tier exists for.
	expect(await notesPage(a.cookie)).not.toMatch(CAN_COMPLETE_FIRST_NOTE)
	expect(await notesPage(b.cookie)).toMatch(CAN_COMPLETE_FIRST_NOTE)

	// The wide event comes back from the RUNTIME's log stream (ADR-0009), which
	// is also the proof this ran inside workerd and not in this Node process.
	const emitted = server
		.getLogs()
		.map((l) => l.message)
		.join('\n')
	expect(emitted).toContain('notes/mutate')
	expect(emitted).toContain(a.owner)
})

test('a missing ref is an EXPECTED error: 404 from the boundary, not a crash', async () => {
	const a = await signIn(server)
	const res = await server.fetch('/notes/does-not-exist', { headers: { cookie: a.cookie } })
	expect(res.status).toBe(404)
	expect(await res.text()).toContain('404')
})
