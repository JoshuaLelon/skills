// The exemplar screen: loader → query module (the accessor seam), Form →
// action → use case inside guarded() (wide events), optimistic UI state
// through the store host, screens COMPOSE primitives (L2/L3 — no utility
// classes here; the gate enforces it).
import { Form, useLoaderData } from 'react-router'
import { Btn } from '../components/btn'
import { Page } from '../components/page'
import { Row } from '../components/row'
import { TextInput } from '../components/text-input'
import { makeDb } from '../db/client.server'
import { completeNote, createNote, listNotes } from '../db/queries.server'
import { seedFixture } from '../db/seed'
import { dispatch, useAppState } from '../host'
import { requireOwner } from '../lib/auth.server'
import { app } from '../lib/context'
import { guarded } from '../lib/errors'
import type { Route } from './+types/notes'

export async function loader({ context }: Route.LoaderArgs) {
	const { env, now, owner } = app(context)
	return guarded('notes/list', { owner: owner?.id }, async (add) => {
		const who = requireOwner(owner)
		const db = makeDb(env)
		await seedFixture(db, who.id, now())
		const rows = await listNotes(db, who.id)
		add({ count: rows.length })
		return { notes: rows.map((n) => ({ ref: n.ref, title: n.title, status: n.status })) }
	})
}

export async function action({ request, context }: Route.ActionArgs) {
	const { env, now, owner } = app(context)
	return guarded('notes/mutate', { owner: owner?.id }, async (add) => {
		const who = requireOwner(owner)
		const db = makeDb(env)
		const form = await request.formData()
		const intent = String(form.get('intent'))
		add({ intent })
		if (intent === 'create') {
			const title = String(form.get('title') ?? '').trim()
			const ref = `note:${title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')}`
			add({ ref })
			await createNote(db, who.id, ref, title, now())
		} else if (intent === 'complete') {
			const ref = String(form.get('ref'))
			add({ ref })
			await completeNote(db, who.id, ref, now())
		}
		return { ok: true }
	})
}

export default function Notes() {
	const { notes } = useLoaderData<typeof loader>()
	const { hideDone } = useAppState()
	const visible = hideDone ? notes.filter((n) => n.status !== 'done') : notes
	return (
		<Page title="Notes">
			<Btn onClick={() => dispatch({ type: 'ui/toggle-done' })}>
				{hideDone ? 'Show done' : 'Hide done'}
			</Btn>
			<Form method="post">
				<TextInput name="title" aria-label="New note title" required />
				<Btn name="intent" value="create">
					Add
				</Btn>
			</Form>
			<ul>
				{visible.map((n) => (
					<li key={n.ref}>
						<Row title={n.title} done={n.status === 'done'}>
							{n.status === 'open' && (
								<Form method="post">
									<input type="hidden" name="ref" value={n.ref} />
									<Btn name="intent" value="complete" aria-label={`Complete ${n.title}`}>
										Done
									</Btn>
								</Form>
							)}
						</Row>
					</li>
				))}
			</ul>
		</Page>
	)
}

export { ScreenError as ErrorBoundary } from '../components/screen-error'
