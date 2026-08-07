// THE seeder — singular (ADR-0006/0010): onboarding and every test call this
// same function; `now` is required and every timestamp derives from it.
// Idempotent: conflict-safe on the (owner, ref) keys.
import { NOTES_SEED } from '../fixtures/entities/notes'
import { NOW } from '../fixtures/now'
import type { Db } from './client.server'
import { actions, notes, users } from './schema'

/**
 * The one conversion between fixture time and database time (ADR-0005), and the
 * only place in `src/db/` allowed to construct a Date — gated by
 * ast-grep:no-unrebased-fixture-timestamp.
 *
 * A fixture holds ABSOLUTE instants anchored on `NOW`: a prototype has to render
 * a believable date, and it reads each timestamp once per screen. A seed row has
 * to be relative to a live clock, or a seed authored in 2026 is wrong in 2027.
 * Both are right, and they are the same information — `offset = anchored - NOW`.
 * This is the single site that converts, because the prototype has N read sites
 * and the seeder has one write site. The row that was two days old against the
 * anchor is two days old whenever the seeder runs.
 *
 * Ported entity files therefore need no edit, and `NOW` becomes what ADR-0005
 * says it is: the anchor across fixtures, seeder, and flow tests alike.
 */
export function rebase(anchored: string, now: Date): Date {
	return new Date(now.getTime() + (Date.parse(anchored) - NOW.getTime()))
}

export async function ensureUser(db: Db, id: string): Promise<void> {
	await db.insert(users).values({ id }).onConflictDoNothing()
}

export async function seedFixture(db: Db, owner: string, now: Date): Promise<void> {
	await ensureUser(db, owner)
	await db
		.insert(notes)
		.values(
			// Columns listed, never spread. Two fixture fields deliberately do not
			// cross, and a spread hides both: `owner` — the fixture's is a display id,
			// production's is the uuid FK this function is handed (ADR-0010) — and
			// `createdAt`, which is rebased rather than copied. The spread this
			// replaced discarded the fixture's owner by key ORDER, which is a decision
			// nobody wrote down, and forwarded non-columns into the insert for drizzle
			// to drop in silence.
			NOTES_SEED.map((n) => ({
				owner,
				ref: n.ref,
				title: n.title,
				status: n.status,
				createdAt: rebase(n.createdAt, now),
			})),
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
