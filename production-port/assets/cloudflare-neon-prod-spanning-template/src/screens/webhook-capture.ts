// The EXTERNAL boundary (ADR-0012 seam 3): parseOr400 on a wire route types
// cannot cover. Schema is hand-rolled Zod-shaped here to keep the exemplar
// dependency-light — swap for zod/drizzle-zod in a real app.

import { makeDb } from '../db/client.server'
import { createNote } from '../db/queries.server'
import { ensureUser } from '../db/seed'
import { app } from '../lib/context'
import { forbidden, guarded, parseOr400 } from '../lib/errors'
import type { Route } from './+types/webhook-capture'

const captureSchema = {
	safeParse(input: unknown) {
		const o = input as { owner?: unknown; title?: unknown }
		if (typeof o?.owner === 'string' && typeof o?.title === 'string' && o.title.length > 0) {
			return { success: true as const, data: { owner: o.owner, title: o.title } }
		}
		return {
			success: false as const,
			error: { expected: { owner: 'uuid', title: 'non-empty string' } },
		}
	},
}

export async function action({ request, context }: Route.ActionArgs) {
	const { env, now } = app(context)
	return guarded('webhook/capture', {}, async (add) => {
		// Fail closed in production: no CAPTURE_KEY configured -> nothing captures.
		if (env.ENVIRONMENT === 'production') {
			const key = request.headers.get('x-capture-key')
			if (!env.CAPTURE_KEY || key !== env.CAPTURE_KEY) throw forbidden('capture key required')
		}
		const body = parseOr400(captureSchema, await request.json())
		add({ owner: body.owner })
		const db = makeDb(env)
		await ensureUser(db, body.owner)
		const ref = `note:${body.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')}`
		await createNote(db, body.owner, ref, body.title, now())
		return Response.json({ ok: true, ref })
	})
}
