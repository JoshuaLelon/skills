// The tenant-isolation regression test (ADR-0006): two owners write through
// the same query module against the real database; neither sees the other.
// Also exercises: seedFixture (the one seeder), the transaction use case.
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, expect, test } from 'vitest'
import { completeNote, listNotes, noteOf } from '../src/db/queries.server'
import * as schema from '../src/db/schema'
import { seedFixture } from '../src/db/seed'

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:local@127.0.0.1:55433/app',
})
const db = drizzle(pool, { schema }) as unknown as Parameters<typeof listNotes>[0]

const A = crypto.randomUUID()
const B = crypto.randomUUID()
const NOW = new Date('2026-08-04T09:00:00Z')

afterAll(() => pool.end())

test('owners are isolated through the query module', async () => {
	await seedFixture(db, A, NOW)
	await seedFixture(db, B, NOW)
	await completeNote(db, A, 'note:read-the-skeleton', NOW)

	const a = await listNotes(db, A)
	const b = await listNotes(db, B)
	expect(a.find((n) => n.ref === 'note:read-the-skeleton')?.status).toBe('done')
	expect(b.find((n) => n.ref === 'note:read-the-skeleton')?.status).toBe('open')
})

test('a missing ref throws, never returns undefined', async () => {
	await expect(noteOf(db, A, 'note:does-not-exist')).rejects.toThrow('No note')
})
