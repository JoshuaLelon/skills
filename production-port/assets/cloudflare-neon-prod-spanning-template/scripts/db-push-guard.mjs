#!/usr/bin/env node
// `drizzle-kit push`, guarded: local databases only, unless you say otherwise
// out loud. Adapted from pantogen after a real incident: pushing a unique
// constraint to a Neon branch with rows produced an interactive "truncate
// table?" prompt that `--force` does NOT cover — in CI it fails closed (no
// TTY), but a human at a terminal can answer "yes" and drop a table in
// production. Local needs no ceremony; anything else needs
// ALLOW_REMOTE_DB_PUSH=1, which is not a variable you set by accident.
//
// Push is for local scratch ONLY. The production path is always:
//   npx drizzle-kit generate   (versioned SQL, reviewed, committed)
//   npm run db:migrate         (drizzle-kit migrate)
import { spawnSync } from 'node:child_process'

// Same default as drizzle.config.ts and docker-compose.yml — keep all three in step.
const LOCAL_DEFAULT = 'postgres://postgres:local@127.0.0.1:55432/app'
const url = process.env.DATABASE_URL ?? LOCAL_DEFAULT
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'db'])

let host = ''
try {
	host = new URL(url).hostname
} catch {
	console.error(`db-push-guard: DATABASE_URL is not a parseable URL.`)
	process.exit(1)
}

if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_DB_PUSH !== '1') {
	console.error(`db-push-guard: refusing to push to non-local host "${host}".`)
	console.error('Remote schema changes go through generate + migrate. If you truly mean it:')
	console.error('  ALLOW_REMOTE_DB_PUSH=1 npm run db:push')
	process.exit(1)
}

const r = spawnSync('npx', ['drizzle-kit', 'push', '--force'], { stdio: 'inherit' })
process.exit(r.status ?? 1)
