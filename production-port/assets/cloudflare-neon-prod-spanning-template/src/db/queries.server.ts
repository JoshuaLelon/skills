// The query module — concrete, no repository interface (ADR-0012 declined
// seams). Signatures mirror what the prototype's accessors had, which is what
// makes the swap invisible to screens. The transaction wraps the USE CASE:
// completeNote writes the note and its action row atomically.
import { and, desc, eq } from 'drizzle-orm'
import { AppError } from '../lib/errors'
import type { Db } from './client.server'
import { actions, notes } from './schema'

export async function listNotes(db: Db, owner: string) {
	return db.select().from(notes).where(eq(notes.owner, owner)).orderBy(desc(notes.createdAt))
}

export async function noteOf(db: Db, owner: string, ref: string) {
	const [row] = await db
		.select()
		.from(notes)
		.where(and(eq(notes.owner, owner), eq(notes.ref, ref)))
	// Throwing beats undefined — same rule as the prototype accessors.
	if (!row) throw new AppError(404, `No note ${ref}`)
	return row
}

export async function createNote(db: Db, owner: string, ref: string, title: string, now: Date) {
	await db.transaction(async (tx) => {
		await tx.insert(notes).values({ owner, ref, title, createdAt: now })
		await tx.insert(actions).values({
			owner,
			subject: 'note',
			subjectRef: ref,
			verb: 'create',
			by: owner,
			after: { title },
			at: now,
		})
	})
}

export async function completeNote(db: Db, owner: string, ref: string, now: Date) {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.update(notes)
			.set({ status: 'done', doneAt: now })
			.where(and(eq(notes.owner, owner), eq(notes.ref, ref)))
			.returning()
		if (!row) throw new AppError(404, `No note ${ref}`)
		await tx.insert(actions).values({
			owner,
			subject: 'note',
			subjectRef: ref,
			verb: 'finish',
			by: owner,
			before: { status: 'open' },
			after: { status: 'done' },
			at: now,
		})
	})
}
