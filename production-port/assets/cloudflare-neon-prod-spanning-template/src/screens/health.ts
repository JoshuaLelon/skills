// Health proves the whole spine: worker → Hyperdrive/pg → Neon. A 200 here is
// the deploy's first execution-verification.
import { sql } from 'drizzle-orm'
import { makeDb } from '../db/client.server'
import { app } from '../lib/context'
import type { Route } from './+types/health'

export async function loader({ context }: Route.LoaderArgs) {
	const { env } = app(context)
	const db = makeDb(env)
	await db.execute(sql`select 1`)
	return Response.json({ ok: true, env: env.ENVIRONMENT })
}
