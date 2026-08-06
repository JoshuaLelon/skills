// THE seeder — singular (ADR-0006/0010): onboarding and every test call this
// same function; `now` is required and every timestamp derives from it.
// Idempotent: conflict-safe on the (owner, ref) keys.
import { NOTES_SEED } from '../fixtures/entities/notes'
import type { Db } from './client.server'
import { actions, notes, users } from './schema'

export async function ensureUser(db: Db, id: string): Promise<void> {
	await db.insert(users).values({ id }).onConflictDoNothing()
}

export async function seedFixture(db: Db, owner: string, now: Date): Promise<void> {
	await ensureUser(db, owner)
	await db
		.insert(notes)
		.values(
			NOTES_SEED.map((n) => ({ ...n, owner, createdAt: new Date(now.getTime() + n.offsetMs) })),
		)
		.onConflictDoNothing()
	await db
		.insert(actions)
		.values({
			owner,
			subject: 'note',
			subjectRef: NOTES_SEED[0].ref,
			verb: 'seed',
			by: owner,
			at: now,
		})
		.onConflictDoNothing()
}
