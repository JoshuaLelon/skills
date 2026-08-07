// The exemplar entity's fixture — shaped like a query result (skill: fixture
// rules). ids are type:kebab-slug; timestamps derive from NOW through clock.ts,
// never the wall clock.
//
// This is what a PORTED fixture looks like: the prototype writes entity files in
// exactly this shape — same field NAMES,  included — and they land here
// unedited. Two values still do not survive: timestamps are rebased onto the
// seeder's now, and owner is replaced by its uuid parameter. `createdAt` stays an absolute
// instant anchored on NOW — src/db/seed.ts rebases it onto the seeder's `now`,
// which is the one place fixture time meets a live clock.
//
// `owner` is carried and deliberately NOT used: production owner is the uuid FK
// the seeder is handed (ADR-0010). It stays in the fixture because it is what
// makes owner-scoping visible while there is no database (fixture rule 6), and
// seed.ts names the discard rather than letting a spread perform it.
import type { NoteStatus } from '../../db/schema'
import { daysBefore } from '../clock'

export const NOTES_SEED: {
	ref: string
	owner: string
	title: string
	status: NoteStatus
	createdAt: string
}[] = [
	{
		ref: 'note:read-the-skeleton',
		owner: 'owner:jlm',
		title: 'Read the walking skeleton',
		status: 'open',
		createdAt: daysBefore(2),
	},
	{
		ref: 'note:map-a-feature',
		owner: 'owner:jlm',
		title: 'Map one prototype feature onto it',
		status: 'open',
		createdAt: daysBefore(1),
	},
]
