// Demonstrates the EXPECTED error path: a bad ref throws AppError(404) in the
// query module, guarded() logs outcome:'expected', ScreenError renders inline.
// Also the smallest honest use of the model seam (ADR-0012 seam 4, ADR-0022):
// the action asks lib/ai for a capability (TextGenerator) and never names a
// provider. With no ANTHROPIC_API_KEY the seam's echo generator answers, so
// this path runs offline and in tests deterministically — which is the point of
// the seam having a no-key default rather than a mock.
import { Form, useActionData, useLoaderData } from 'react-router'
import { Btn } from '../components/btn'
import { Page } from '../components/page'
import { makeDb } from '../db/client.server'
import { noteOf } from '../db/queries.server'
import { makeTextGenerator } from '../lib/ai/client.server'
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

export async function action({ params, context }: Route.ActionArgs) {
	const { env, owner } = app(context)
	return guarded('note/summarize', { ref: params.ref }, async (add) => {
		const who = requireOwner(owner)
		const note = await noteOf(makeDb(env), who.id, `note:${params.ref}`)
		const generate = makeTextGenerator(env)
		const { text, model } = await generate({
			purpose: 'note-summary',
			prompt: `Summarize this note in one sentence: ${note.title}`,
		})
		// model on the wide event, not the prompt: which generator answered is
		// the operational question; the prompt is user content.
		add({ model })
		return { summary: text }
	})
}

export default function NoteDetail() {
	const { note } = useLoaderData<typeof loader>()
	const summary = useActionData<typeof action>()?.summary
	return (
		<Page title={note.title}>
			<p>{note.status}</p>
			<Form method="post">
				<Btn>Summarize</Btn>
			</Form>
			{summary && (
				// section (role=region) takes aria-label; <p> does not. The label is
				// what the e2e spec locates by — role+name, never a testid.
				<section aria-label="Summary">
					<p>{summary}</p>
				</section>
			)}
		</Page>
	)
}

export { ScreenError as ErrorBoundary } from '../components/screen-error'
