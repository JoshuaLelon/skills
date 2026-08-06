// ADR-0001: in production the Worker reaches Neon through the Hyperdrive
// binding (direct string inside; Hyperdrive pools). Locally the binding's
// localConnectionString points at docker. One Pool per request scope is the
// workerd model — pg connections cannot outlive the invocation.
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type Db = ReturnType<typeof makeDb>

export function makeDb(env: Env) {
	// Hyperdrive in production; DATABASE_URL locally (dev server, vitest, drizzle-kit).
	const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL
	const pool = new pg.Pool({ connectionString: url, max: 5 })
	return drizzle(pool, { schema })
}
