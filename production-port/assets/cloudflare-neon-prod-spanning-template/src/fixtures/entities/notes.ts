// The exemplar entity's fixture — shaped like a query result (skill: fixture
// rules). ids are type:kebab-slug; offsets derive from NOW, never wall clock.
import type { NoteStatus } from '../../db/schema'

export const NOTES_SEED: {
	ref: string
	title: string
	status: NoteStatus
	offsetMs: number
}[] = [
	{
		ref: 'note:read-the-skeleton',
		title: 'Read the walking skeleton',
		status: 'open',
		offsetMs: 0,
	},
	{
		ref: 'note:map-a-feature',
		title: 'Map one prototype feature onto it',
		status: 'open',
		offsetMs: 1000,
	},
]
