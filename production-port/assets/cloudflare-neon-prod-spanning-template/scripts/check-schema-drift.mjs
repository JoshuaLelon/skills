#!/usr/bin/env node
// Schema-vs-migration drift: does `src/db/schema.ts` describe the same database
// the committed migrations build? Until this existed you could add a column,
// never run `drizzle-kit generate`, commit, and `npm run check` was green — the
// schema and the migration folder disagreed and nothing said so. Production
// then runs the migrations, and the app runs against the schema.
//
// `drizzle-kit check` does NOT cover this, which is the trap worth naming: it
// validates the migration folder's INTERNAL consistency (journal vs snapshots)
// and never looks at your schema at all. Planting a column and running it
// prints "Everything's fine 🐶🔥" and exits 0.
//
// HOW THIS WORKS — and why it is not the obvious approach. The obvious approach
// is to copy `drizzle/` into a scratch dir and re-run `generate`: a new .sql
// file means uncommitted changes. That works for additions and drops and FAILS
// SILENTLY ON RENAMES. Given a previous state to diff against, drizzle-kit
// cannot tell `actions` renamed to `audit_log` from `actions` dropped and
// `audit_log` created, so it asks a human. With no TTY the prompt throws — but
// the throw is swallowed, the process EXITS 0, and nothing is written. A gate
// reading "no new .sql" then reports clean on the most dangerous edit there is.
//
// So this compares STATE instead of asking for a diff. Generating into an EMPTY
// directory gives drizzle-kit no previous state, so there is nothing to resolve
// and no prompt can occur: it just writes a snapshot describing the schema as
// it stands. That snapshot is compared against the newest snapshot in
// `drizzle/meta/`, which is the state the committed migrations produce. Equal
// means no drift. A rename shows up as a table present in one and absent in the
// other, like any other difference.
//
// This catches additions, drops, renames, and every column/index/constraint
// change, and it never depends on drizzle-kit's prose or its stack traces.
// What it does NOT do is tell you a rename FROM a drop-plus-add — that
// distinction needs the human answer drizzle-kit was asking for. It reports
// both tables and says so; `drizzle-kit generate` at a real terminal is where
// the question gets answered. ADR-0025.
//
// Zero dependencies.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
// Must live INSIDE the repo: drizzle-kit prepends './' to whatever `--out` it
// is given, so an absolute path (or an OS temp dir) resolves under the repo and
// the probe lands somewhere surprising. Keeping it here and deleting it in a
// `finally` is the honest version of the same idea.
const PROBE = '.schema-drift-probe'
const problems = []

const die = (msg) => {
	console.error(`check-schema-drift: ${msg}`)
	process.exit(1)
}

// Read the paths from drizzle.config.ts rather than hardcoding them, so moving
// the schema moves the gate with it. A gate that probes a path the project
// stopped using would pass forever.
const cfgPath = join(ROOT, 'drizzle.config.ts')
if (!existsSync(cfgPath)) die('no drizzle.config.ts — nothing to check.')
const cfg = readFileSync(cfgPath, 'utf8')
const cfgField = (k) => cfg.match(new RegExp(`${k}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`))?.[1]
const schemaPath = cfgField('schema')
const outDir = cfgField('out')
const dialect = cfgField('dialect')
if (!schemaPath || !outDir || !dialect)
	die(`could not read schema/out/dialect out of drizzle.config.ts — parse it or fix the config.`)

// -- the state the committed migrations produce ------------------------------
// The journal is the authority on which snapshot is newest; a lexical sort of
// the meta/ directory would be a second, quietly-drifting answer to the same
// question.
const metaDir = join(ROOT, outDir, 'meta')
const journalPath = join(metaDir, '_journal.json')
if (!existsSync(journalPath))
	die(
		`no ${outDir}/meta/_journal.json — run \`npx drizzle-kit generate\` to create the migration folder.`,
	)
const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
const newest = (journal.entries ?? []).reduce((a, e) => (a === null || e.idx > a.idx ? e : a), null)

const EMPTY_STATE = { tables: {} }
let migrated = EMPTY_STATE
// Only two real snapshots can be compared field-for-field. When either side is
// a synthesized empty state, the table list is everything that was actually
// observed, and claiming "enums differ" on top of it would be noise the probe
// never earned.
let bothReal = newest !== null
if (newest) {
	const snapPath = join(metaDir, `${String(newest.idx).padStart(4, '0')}_snapshot.json`)
	if (!existsSync(snapPath))
		die(
			`the journal names migration ${newest.tag} but ${snapPath} is missing — the migration folder is inconsistent; \`npx drizzle-kit check\` covers that.`,
		)
	migrated = JSON.parse(readFileSync(snapPath, 'utf8'))
}

// -- the state the schema describes ------------------------------------------
const probeDir = join(ROOT, PROBE)
let current = EMPTY_STATE
try {
	rmSync(probeDir, { recursive: true, force: true })
	mkdirSync(probeDir, { recursive: true })

	// stdin is closed deliberately. It cannot prompt with an empty --out, but if
	// a future drizzle-kit ever finds a reason to ask something, this gate must
	// fail rather than hang a CI runner forever.
	const r = spawnSync(
		'npx',
		[
			'drizzle-kit',
			'generate',
			'--dialect',
			dialect,
			'--schema',
			schemaPath,
			'--out',
			`./${PROBE}`,
			'--name',
			'probe',
		],
		{ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
	)
	const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
	if (r.status !== 0)
		die(
			`drizzle-kit could not read the schema (exit ${r.status}) — fix this before trusting any drift result:\n${out.trim()}`,
		)

	// A schema with ZERO tables makes drizzle-kit exit 0 and write no snapshot at
	// all. Treating "no snapshot" as "no drift" would fail open on the largest
	// possible change — every table deleted — so absence is read as a state with
	// no tables. It is read as ONLY that: drizzle-kit reported "0 tables" and
	// said nothing about enums or sequences, so the rest of the state is carried
	// over from the migrations rather than invented, and the diff below reports
	// the dropped tables instead of a dozen fields the probe never spoke to.
	const probeSnap = join(probeDir, 'meta', '0000_snapshot.json')
	if (existsSync(probeSnap)) current = JSON.parse(readFileSync(probeSnap, 'utf8'))
	else {
		current = { ...migrated, tables: {} }
		bothReal = false
	}
} finally {
	rmSync(probeDir, { recursive: true, force: true })
}

// -- compare ------------------------------------------------------------------
// `id`/`prevId` are per-generation uuids and `_meta` is drizzle's own
// rename-bookkeeping — all three describe the generation event, not the schema,
// and differ on every run. Everything else is state and must match exactly;
// verified: on a clean tree the two snapshots are byte-identical once these are
// dropped.
const state = ({ id, prevId, _meta, ...rest }) => rest

// Snapshot format is versioned. A drizzle-kit upgrade that bumps it would make
// every field differ at once, which reads as catastrophic drift and is not — so
// say what it actually is.
if (bothReal && migrated.version !== current.version)
	die(
		`snapshot format skew: the committed migrations are format v${migrated.version}, drizzle-kit now writes v${current.version}. This is a drizzle-kit upgrade, not schema drift — regenerate the migration folder's snapshots before this gate can speak.`,
	)

const a = state(migrated)
const b = state(current)

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const diff = (x, y, path, out) => {
	if (isPlain(x) && isPlain(y)) {
		for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort())
			diff(x[k], y[k], path ? `${path}.${k}` : k, out)
		return out
	}
	if (JSON.stringify(x) !== JSON.stringify(y)) out.push(path)
	return out
}

// Tables first, and coarsely. A rename produces one absent table and one new
// one; deep-diffing straight away would bury that under every column of both.
const aTables = Object.keys(a.tables ?? {})
const bTables = Object.keys(b.tables ?? {})
const dropped = aTables.filter((t) => !bTables.includes(t))
const added = bTables.filter((t) => !aTables.includes(t))

for (const t of added) problems.push(`table ${t} is in the schema but no migration creates it`)
for (const t of dropped)
	problems.push(`table ${t} is built by the migrations but is gone from the schema`)
if (added.length && dropped.length)
	problems.push(
		`  ↑ an added and a dropped table together may be ONE RENAME. This gate cannot tell those apart — only you can. Run \`npx drizzle-kit generate\` and answer its prompt.`,
		`     It needs a TTY, which is NOT the same as needing a human: a pty works.`,
		`     Python: pty.spawn(['npx','drizzle-kit','generate'])  ·  or: expect(1)`,
		`     READ THE MENU BEFORE ANSWERING. The highlighted default is "create`,
		`     table", which generates DROP + CREATE and destroys every row. The`,
		`     rename option is a separate line you must move to.`,
	)

// Then everything else, at leaf granularity.
const rest = []
for (const t of bTables.filter((t) => aTables.includes(t)))
	diff(a.tables[t], b.tables[t], `table ${t}`, rest)
if (bothReal) {
	const { tables: _a, ...aRest } = a
	const { tables: _b, ...bRest } = b
	diff(aRest, bRest, '', rest)
}
for (const p of rest.slice(0, 25))
	problems.push(`${p} differs between the schema and the migrations`)
if (rest.length > 25) problems.push(`… and ${rest.length - 25} more difference(s)`)

if (problems.length) {
	console.error('check-schema-drift: the schema and the committed migrations disagree.\n')
	for (const p of problems) console.error(`  ${p}`)
	console.error(
		'\nThe migrations are what production runs; the schema is what the app compiles against.',
	)
	console.error('Fix: npx drizzle-kit generate   (then review and commit the SQL)')
	process.exit(1)
}

console.log(`check-schema-drift: schema matches the migrations (${bTables.length} tables).`)
