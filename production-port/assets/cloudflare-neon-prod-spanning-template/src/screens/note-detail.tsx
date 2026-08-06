// Demonstrates the EXPECTED error path: a bad ref throws AppError(404) in the
// query module, guarded() logs outcome:'expected', ScreenError renders inline.
import { useLoaderData } from 'react-router'
import { Page } from '../components/page'
import { makeDb } from '../db/client.server'
import { noteOf } from '../db/queries.server'
import { requireOwner } from '../lib/auth.server'
import { app } from '../lib/context'
import { guarded } from '../lib/errors'
import type { Route } from './+types/note-detail'

export async function loader({ params, context }: Route.LoaderArgs) {
	const { env, owner } = app(context)
	return guarded('note/read', { ref: params.ref }, async () => {
		const who = requireOwner(owner)
		const note = await noteOf(makeDb(env), who.id, `note:${params.ref}`)
		return { note: { ref: note.ref, title: note.title, status: note.status } }
	})
}

export default function NoteDetail() {
	const { note } = useLoaderData<typeof loader>()
	return (
		<Page title={note.title}>
			<p>{note.status}</p>
		</Page>
	)
}

export { ScreenError as ErrorBoundary } from '../components/screen-error'
