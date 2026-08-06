// Schema conventions are ADR-0010; every deviation needs a superseding ADR.
// Global-machinery tables exempt from `owner`: (none yet — name them here).
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
	id: uuid().primaryKey().defaultRandom(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type NoteStatus = 'open' | 'done'

export const notes = pgTable(
	'notes',
	{
		owner: uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		ref: text().notNull(), // type:kebab-slug, carried from the fixture
		title: text().notNull(),
		status: text().$type<NoteStatus>().notNull().default('open'),
		body: jsonb().$type<unknown>(), // read only after arriving at the row
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		doneAt: timestamp('done_at', { withTimezone: true }), // event-marking: nullable, no default
	},
	(t) => [
		primaryKey({ columns: [t.owner, t.ref] }),
		// the notes screen's hot query: open notes for one owner, newest first
		index('notes_owner_status').on(t.owner, t.status, t.createdAt),
	],
)

export type ActionRow = { type: string } & Record<string, unknown>

export const actions = pgTable(
	'actions',
	{
		id: uuid().primaryKey().defaultRandom(),
		owner: uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subject: text().notNull(),
		subjectRef: text('subject_ref'),
		verb: text().notNull(),
		by: text().notNull(), // the owner, or 'model'
		before: jsonb().$type<unknown>(),
		after: jsonb().$type<unknown>(),
		at: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [
		// the history view: one owner's actions, newest first
		index('actions_owner_at').on(t.owner, t.at),
	],
)
