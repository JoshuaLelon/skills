#!/usr/bin/env node
// THE META-RULE, EXECUTABLE: no gate ships without a demonstration that it
// fails. Pantogen shipped two dependency-cruiser rules that were dead on
// arrival, an ast-grep set that never scanned a .tsx file, and a grep linter
// that was 100% false positives — all green, all enforcing nothing. This
// harness plants a violation for every gate and asserts the gate FIRES.
//
// Run after any change to a lint config, and in CI. Add a mutation in the same
// commit as any new rule — a rule with no mutation here does not exist.
//
// Each mutation: plant file(s) → run the tool → expect nonzero exit AND the
// rule id in output → remove file(s). Never touches existing files.
//
// `expectClean: true` inverts it: plant VALID input and demand exit 0. That is
// the control for the third failure above — the 100%-false-positive linter,
// which a positive mutation alone CANNOT distinguish from a working rule (it
// fires on the planted violation either way). The ADR-citation check shipped in
// exactly that state. A gate that can fail open needs a violation; a gate that
// can fail closed needs a valid input; a gate that can do both needs the pair.

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()

// Rules that CANNOT have a mutation, each with the reason stated — an entry
// here is a public admission, not a quiet skip.
// Script gates that cannot be mutation-tested, each with the reason stated.
const UNPROVABLE_SCRIPTS = {
	'verify:gates': 'this harness; a mutation of it would be self-referential',
	'check:startup':
		'builds the whole app to measure it — minutes per run, and the budget it enforces is a number, not a rule with a violation to plant',
}

const UNPROVABLE = {
	'no-bcrypt':
		'fires on an import of an installed bcrypt; installing bcrypt to prove it is worse than the gap',
}

// docs-check reads the STAGED diff, and 2b needs a MODIFICATION to a tracked
// file — neither of which a harness that plants files into the working tree can
// produce. Staging into the real repo was the first attempt and is too fragile:
// the result then depends on whatever else happens to be staged, so a negative
// control goes red for an unrelated reason. Build a throwaway repo instead,
// seed it with the real ADRs and the real script, mutate there, and delete it.
// `llms.txt` is touched so the co-change rule is always satisfied and only the
// rule under test can speak. The ADRs are seeded from HEAD, not the working
// tree: seeding from the tree let an unrelated uncommitted edit poison the
// probe, which is how a smuggled ADR body rewrite turned a negative control red
// while telling you nothing about the rule it was supposed to be testing.
// The next free ADR number, computed. Hardcoding one (0025) worked until an app
// actually reached it: the planted probe then becomes a DUPLICATE and the
// negative control goes red for a reason that has nothing to do with the rule.
// Two lab apps independently authored 0025 as their next decision.
const NEXT_ADR = String(
	Math.max(
		0,
		...readdirSync(join(ROOT, 'docs/decisions'))
			.map((f) => Number(f.match(/^(\d{4})-/)?.[1]))
			.filter((n) => !Number.isNaN(n)),
	) + 1,
).padStart(4, '0')

const docsProbe = (setup, { stage = true } = {}) => `
d=$(mktemp -d)
mkdir -p "$d/docs/decisions" "$d/src"
mkdir -p "$d/scripts"
cp scripts/docs-check.mjs "$d/scripts/"
git archive HEAD docs/decisions | tar -x -C "$d" 2>/dev/null || cp docs/decisions/*.md "$d/docs/decisions/"
printf 'seed\\n' > "$d/llms.txt"
cd "$d"
git init -q .
git add -A
git -c user.email=g@g -c user.name=g commit -qm seed
${setup}
printf 'touched\\n' >> llms.txt
${stage ? 'git add -A' : ':'}
node scripts/docs-check.mjs
rc=$?
cd /
rm -rf "$d"
exit $rc
`

// Traps that assert a KEY EXISTS in a committed config cannot be proven by
// planting a new file — the harness's usual move. They were therefore neither
// proven nor declared unprovable: quietly trusted, under a banner reading
// "Green means something". Move the real file aside, break it, run the trap,
// restore.
//
// The backup path is mktemp'd rather than a fixed /tmp/x.bak, because a fixed
// name is shared with every other checkout of this template on the machine: two
// runs overlapping means one deletes the only copy of the other's config and
// leaves a MUTATED file in a working tree. Observed, not theorised.
// `q` is the quote wrapped around the sed expression: single by default, double
// where the expression itself must contain single quotes (a TS string literal).
// A double-quoted expression must then stay free of $, backticks and backslashes.
//
// Standing hazard in every probe of this shape: if the harness is killed
// mid-probe, the restore never runs and the mutation stays in the working tree.
// `git checkout` the named file is the fix.
const restoreProbe = (file, sedExpr, cmd = 'node scripts/check-config-traps.mjs', q = "'") =>
	`bak=$(mktemp) && cp ${file} "$bak" && sed -i.x ${q}${sedExpr}${q} ${file} && ${cmd}; rc=$?; cp "$bak" ${file}; rm -f ${file}.x "$bak"; exit $rc`

const wranglerProbe = (sedExpr) => restoreProbe('wrangler.jsonc', sedExpr)

const schemaProbe = (sedExpr) =>
	restoreProbe('src/db/schema.ts', sedExpr, 'node scripts/check-schema-drift.mjs', '"')

const MUTATIONS = [
	{
		gate: 'ast-grep: no-date-now-in-domain',
		files: { 'src/store/__mut__.ts': 'export const t = Date.now()\n' },
		cmd: 'npx ast-grep scan src/store/__mut__.ts',
		expect: 'no-date-now-in-domain',
	},
	{
		gate: 'ast-grep: no-testid-locator',
		files: {
			'e2e/__mut__.spec.ts':
				"declare const page: { getByTestId(s: string): unknown }\npage.getByTestId('x')\nexport {}\n",
		},
		cmd: 'npx ast-grep scan e2e/__mut__.spec.ts',
		expect: 'no-testid-locator',
	},
	{
		gate: 'ast-grep: no-owner-from-params',
		files: {
			'src/__mut__.ts':
				"declare const params: { id: string }\nconst row: { owner: string } = { owner: '' }\nrow.owner = params.id\nexport { row }\n",
		},
		cmd: 'npx ast-grep scan src/__mut__.ts',
		expect: 'no-owner-from-params',
	},
	{
		gate: 'ast-grep: no-react-legacy (Tsx twin — proves .tsx reach)',
		files: {
			'src/components/__mut__.tsx':
				"import { forwardRef } from 'react'\nexport const M = forwardRef(() => null)\nexport const STATES = []\n",
		},
		cmd: 'npx ast-grep scan src/components/__mut__.tsx',
		expect: 'no-react-legacy',
	},
	{
		gate: 'ast-grep: no-remix-imports',
		files: { 'src/__mut__.ts': "import { json } from '@remix-run/node'\nexport const m = json\n" },
		cmd: 'npx ast-grep scan src/__mut__.ts',
		expect: 'no-remix-imports',
	},
	{
		gate: 'ast-grep: no-app-load-context (Tsx twin)',
		files: {
			'src/__mut__.tsx':
				"import type { AppLoadContext } from 'react-router'\nexport type M = AppLoadContext\n",
		},
		cmd: 'npx ast-grep scan src/__mut__.tsx',
		expect: 'no-app-load-context',
	},
	{
		gate: 'ast-grep: no-inline-promise-in-use',
		files: {
			'src/components/__mut2__.tsx':
				"declare function use<T>(p: Promise<T>): T\ndeclare function fetchThing(id: string): Promise<number>\nexport const n = use(fetchThing('x'))\nexport const STATES = []\n",
		},
		cmd: 'npx ast-grep scan src/components/__mut2__.tsx',
		expect: 'no-inline-promise-in-use',
	},
	{
		gate: 'ast-grep: no-stale-zod',
		files: {
			'src/__mut__.ts':
				'declare const z: { string(): { email(): unknown } }\nexport const s = z.string().email()\n',
		},
		cmd: 'npx ast-grep scan src/__mut__.ts',
		expect: 'no-stale-zod',
	},
	{
		gate: 'ast-grep: one-door-model',
		files: {
			'src/__mut4__.ts': "import Anthropic from '@anthropic-ai/sdk'\nexport const a = Anthropic\n",
		},
		cmd: 'npx ast-grep scan src/__mut4__.ts',
		expect: 'one-door-model',
	},
	{
		gate: 'ast-grep: single-door-console',
		files: { 'src/__mut3__.ts': "console.log('raw string logging')\nexport {}\n" },
		cmd: 'npx ast-grep scan src/__mut3__.ts',
		expect: 'single-door-console',
	},
	{
		gate: 'config-traps: fires on a planted threshold',
		files: {
			'vitest.config.trap-mut.ts':
				'export default { test: { coverage: { thresholds: { lines: 80 } } } }\n',
		},
		cmd: 'node scripts/check-config-traps.mjs',
		expect: 'thresholds',
	},
	{
		gate: 'config-traps: observability block must exist',
		files: {},
		cmd: wranglerProbe('s/"observability"/"observability_REMOVED"/'),
		expect: 'observability',
	},
	{
		gate: 'config-traps: upload_source_maps must be true',
		files: {},
		cmd: wranglerProbe('s/"upload_source_maps": true/"upload_source_maps": false/'),
		expect: 'upload_source_maps',
	},
	{
		gate: 'config-traps: the traces key must be present',
		files: {},
		cmd: wranglerProbe('s/"traces"/"traces_REMOVED"/'),
		expect: 'traces',
	},
	{
		gate: 'config-traps: AGENTS.md generator markers must exist',
		files: {},
		cmd: restoreProbe('AGENTS.md', 's/<!-- divergences:start -->/<!-- REMOVED -->/'),
		expect: 'divergences:start',
	},
	{
		gate: 'config-traps: playwright reuseExistingServer must be false',
		files: {
			'playwright.config.ts.trap-mut': '',
		},
		// Rewrite the real config in a scratch copy: the trap reads the committed
		// file, so the mutation has to move it aside and restore it.
		cmd: restoreProbe(
			'playwright.config.ts',
			's/reuseExistingServer: false/reuseExistingServer: !process.env.CI/',
		),
		expect: 'reuseExistingServer must be literal false',
	},
	{
		gate: 'db-push-guard: refuses a non-local host',
		files: {},
		cmd: 'DATABASE_URL=postgres://u:p@ep-cool-name.us-east-2.aws.neon.tech/app node scripts/db-push-guard.mjs',
		expect: 'refusing to push to non-local host',
	},
	{
		gate: 'db-push-guard: a LOCAL host is not refused (negative control)',
		// It execs drizzle-kit on success, which needs a live database, so assert
		// only that the guard itself does not object — the refusal path is the rule.
		files: {},
		cmd: 'DATABASE_URL=postgres://postgres:local@127.0.0.1:55433/app node scripts/db-push-guard.mjs 2>&1 | grep -q "refusing to push" && exit 1; exit 0',
		expectClean: true,
	},
	{
		gate: 'docs-tracks: a stale pin fails --check',
		files: {},
		// Restore by COPY, not `git checkout --`: in a freshly scaffolded app the
		// file has never been committed, so checkout silently restores nothing and
		// the probe survives into the app. scaffold-prod runs verify-gates as its
		// last step, so this shipped a mutated doc into every scaffolded repo.
		cmd: `cp docs/reference/measurements.md /tmp/meas.bak && printf '\\n<!-- probe -->\\n' >> docs/reference/measurements.md; node scripts/docs-tracks.mjs --check; rc=$?; cp /tmp/meas.bak docs/reference/measurements.md; rm -f /tmp/meas.bak; exit $rc`,
		expect: 'stale',
	},
	{
		// HERMETIC, deliberately. This asserted the LIVE tree's pins were current,
		// which made it fail whenever anyone had legitimately stale pins mid-work —
		// reporting "FALSE POSITIVE: the gate flags what it should accept" and
		// advising "fix the config or the rule's file globs" when the real fix was
		// `npm run docs:bless`. A control that reads mutable repo state tests the
		// state, not the rule. Copy the docs into a scratch tree, bless there, and
		// assert the checker then agrees.
		gate: 'docs-tracks: freshly blessed pins pass --check (negative control)',
		files: {},
		cmd: `d=$(mktemp -d); cp -R docs "$d/"; (cd "$d" && node ${ROOT}/scripts/docs-tracks.mjs --bless >/dev/null && node ${ROOT}/scripts/docs-tracks.mjs --check); rc=$?; rm -rf "$d"; exit $rc`,
		expectClean: true,
	},
	{
		gate: 'config-traps: the integration tier must start the built Worker in workerd',
		files: {},
		cmd: restoreProbe('integration/harness.ts', 's/createTestHarness/harnessRipped/g'),
		expect: 'must run the app in WORKERD',
	},
	{
		gate: 'config-traps: test:int must build before it runs the tier',
		files: {},
		cmd: restoreProbe(
			'package.json',
			's|npm run build && vitest run --config vitest.integration.config.ts|vitest run --config vitest.integration.config.ts|',
		),
		expect: 'test:int does not build first',
	},
	{
		gate: 'docs-tracks: a pin on a GENERATED file is refused',
		files: {},
		cmd: restoreProbe(
			'docs/decisions/0016-observability-depth-logs-traces-and-the-price-ch.md',
			's|../reference/cloudflare-primitives.md@|../reference/adr-graph.md@|',
			'node scripts/docs-tracks.mjs',
		),
		expect: 'which is GENERATED',
	},
	{
		gate: 'config-traps: a check:* script absent from CHECKS is refused',
		files: {},
		cmd: restoreProbe('package.json', 's|"check:startup"|"check:orphaned"|'),
		expect: 'would never run',
	},
	{
		gate: 'docs-check: ADR citation resolves',
		// The bogus number is concatenated so this fixture is not itself a
		// citation — docs-check scans .mjs, and caught exactly that.
		files: {},
		cmd: docsProbe(`printf 'Cites ADR-${'9999'}.\\n' > src/probe.md`),
		expect: `cites ADR-${'9999'}`,
	},
	{
		gate: 'docs-check: a VALID ADR citation stays silent (negative control)',
		files: {},
		cmd: docsProbe(`printf 'Cites ADR-0009.\\n' > src/probe.md`),
		expectClean: true,
	},
	{
		gate: 'docs-check: an ADR BODY edit is refused',
		files: {},
		// Resolve the filename through a command substitution, not a glob in the
		// redirect target: /bin/sh (what execSync uses) does not expand those, so
		// `>> docs/decisions/0009-*.md` silently creates a file with that literal
		// name and the edit never lands. The harness reported DEAD GATE and was
		// right — the mutation was broken, not the rule.
		cmd: docsProbe(
			`f=$(ls docs/decisions/0009-*.md | head -1); printf '\\nAn added paragraph in the argument.\\n' >> "$f"`,
		),
		expect: 'ADR bodies are immutable',
	},
	{
		gate: 'docs-check: an UNSTAGED ADR body edit is refused (working-tree mode)',
		files: {},
		cmd: docsProbe(
			`f=$(ls docs/decisions/0009-*.md | head -1); printf '\\nSmuggled past the index.\\n' >> "$f"`,
			{ stage: false },
		),
		expect: 'ADR bodies are immutable',
	},
	{
		gate: 'docs-check: a STATUS BLOCK edit is allowed (negative control)',
		files: {},
		cmd: docsProbe(
			`node -e "const g=require('fs').readdirSync('docs/decisions').find(f=>f.startsWith('0009')),f='docs/decisions/'+g,fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('> **Level:**','> **Applies to:** cloudflare\\n> **Level:**'))"`,
		),
		expectClean: true,
	},
	{
		gate: 'docs-check: a price inside an immutable ADR is refused',
		files: {},
		cmd: docsProbe(
			`printf '# ADR-${NEXT_ADR} — Planted\\n\\n> **Kind:** decision · **Status:** accepted · **Updated:** x\\n> **Level:** 4 — mechanism\\n> **Scope:** planted.\\n\\nSpans bill at $9.99/M after the cutover.\\n' > docs/decisions/${NEXT_ADR}-probe.md`,
		),
		expect: 'volatile figure',
	},
	{
		gate: 'docs-check: an ADR with no volatile figure stays silent (negative control)',
		files: {},
		cmd: docsProbe(
			`printf '# ADR-${NEXT_ADR} — Planted\\n\\n> **Kind:** decision · **Status:** accepted · **Updated:** x\\n> **Level:** 4 — mechanism\\n> **Scope:** planted.\\n\\nPrices live in the reference.\\n' > docs/decisions/${NEXT_ADR}-probe.md`,
		),
		expectClean: true,
	},
	{
		gate: 'adr-graph: an ADR naming a rule that does not exist is refused',
		files: {},
		cmd: `printf '# ADR-${NEXT_ADR} — Planted\\n\\n> **Kind:** decision · **Status:** accepted · **Updated:** x\\n> **Level:** 4 — mechanism\\n> **Constrained by:** 0001\\n> **Enforced by:** ast-grep:no-such-rule-exists\\n> **Scope:** planted.\\n' > docs/decisions/${NEXT_ADR}-probe.md; node scripts/adr-graph.mjs --validate; rc=$?; rm -f docs/decisions/${NEXT_ADR}-probe.md; exit $rc`,
		expect: 'names no rule or script that exists',
	},
	{
		gate: 'adr-graph: an edge pointing at a missing ADR is refused',
		files: {},
		cmd: `printf '# ADR-${NEXT_ADR} — Planted\\n\\n> **Kind:** decision · **Status:** accepted · **Updated:** x\\n> **Level:** 4 — mechanism\\n> **Constrained by:** 0999\\n> **Enforced by:** none — judgement\\n> **Scope:** planted.\\n' > docs/decisions/${NEXT_ADR}-probe.md; node scripts/adr-graph.mjs --validate; rc=$?; rm -f docs/decisions/${NEXT_ADR}-probe.md; exit $rc`,
		expect: "Constrained by '0999' does not resolve",
	},
	{
		gate: 'adr-graph: a well-formed ADR stays silent (negative control)',
		files: {},
		cmd: `printf '# ADR-${NEXT_ADR} — Planted\\n\\n> **Kind:** decision · **Status:** accepted · **Updated:** x\\n> **Level:** 4 — mechanism\\n> **Constrained by:** 0001\\n> **Enforced by:** none — judgement\\n> **Scope:** planted.\\n' > docs/decisions/${NEXT_ADR}-probe.md; node scripts/adr-graph.mjs --validate; rc=$?; rm -f docs/decisions/${NEXT_ADR}-probe.md; exit $rc`,
		expectClean: true,
	},
	{
		gate: 'check-schema-drift: an added column with no migration is caught',
		files: {},
		cmd: schemaProbe(
			"s/verb: text().notNull(),/verb: text().notNull(), drifted: text('drift_probe'),/",
		),
		expect: 'drift_probe',
	},
	{
		// The case the obvious implementation misses. Copying `drizzle/` into a
		// scratch dir and re-running `generate` hits an interactive prompt here,
		// exits 0 and writes nothing — reporting CLEAN on a table rename. Kept as
		// its own control so that regression is caught rather than reasoned about.
		gate: 'check-schema-drift: a table RENAME is caught (not silently passed)',
		files: {},
		cmd: schemaProbe("s/'actions',/'audit_log',/"),
		expect: 'public.audit_log is in the schema but no migration creates it',
	},
	{
		// The false-positive control that matters for this gate specifically: it
		// must read the DATABASE state, not the file's text. Renaming the exported
		// TS binding changes schema.ts substantially while leaving the SQL
		// identical — anything hashing or diffing the file would fire here.
		gate: 'check-schema-drift: a TS-only edit with identical SQL stays silent (negative control)',
		files: {},
		cmd: schemaProbe(
			's/export const actions = pgTable(/export const actionsRenamedInTs = pgTable(/',
		),
		expectClean: true,
	},
	{
		gate: 'depcruise: store-is-pure',
		files: {
			'src/store/__mut__.ts': "import { useState } from 'react'\nexport const m = useState\n",
		},
		cmd: 'npx depcruise src --config .dependency-cruiser.cjs',
		expect: 'store-is-pure',
	},
	{
		gate: 'depcruise: no-fixture-in-view',
		files: {
			'src/fixtures/entities/__mut2__.ts': 'export const M = 1\n',
			'src/screens/__mut__.ts':
				"import { M } from '../fixtures/entities/__mut2__'\nexport const m = M\n",
		},
		cmd: 'npx depcruise src --config .dependency-cruiser.cjs',
		expect: 'no-fixture-in-view',
	},
	{
		gate: 'depcruise: no-db-in-view',
		files: {
			'src/db/__mut3__.ts': 'export const DB = 1\n',
			'src/components/__mut3__.tsx':
				"import { DB } from '../db/__mut3__'\nexport const m = DB\nexport const STATES = []\n",
		},
		cmd: 'npx depcruise src --config .dependency-cruiser.cjs',
		expect: 'no-db-in-view',
	},
	{
		gate: 'depcruise: no-test-in-prod',
		files: {
			'e2e/__mut_h__.ts': 'export const H = 1\n',
			'src/__mut2__.ts': "import { H } from '../e2e/__mut_h__'\nexport const m = H\n",
		},
		cmd: 'npx depcruise src --config .dependency-cruiser.cjs',
		expect: 'no-test-in-prod',
	},
	{
		gate: 'depcruise: no-circular',
		files: {
			'src/__mut_a__.ts': "import { b } from './__mut_b__'\nexport const a: number = b\n",
			'src/__mut_b__.ts': "import { a } from './__mut_a__'\nexport const b: number = a\n",
		},
		cmd: 'npx depcruise src --config .dependency-cruiser.cjs',
		expect: 'no-circular',
	},
	{
		gate: 'biome: lint fires',
		files: { 'src/__mut__.ts': 'const a = 1\na = 2\nexport {}\n' },
		cmd: 'npx biome lint src/__mut__.ts',
		expect: 'noConstAssign',
	},
	{
		gate: 'oxlint: fires',
		files: { 'src/__mut__.ts': 'const x: any = 1\nexport { x }\n' },
		cmd: 'npx oxlint src/__mut__.ts',
		expect: 'no-explicit-any',
	},
	{
		gate: 'prototype gate: strict-mode (fires on an entry file lacking StrictMode)',
		files: { 'src/entry.client.tsx': 'export function boot() {}\n' },
		cmd: 'node scripts/gate.mjs',
		expect: 'strict-mode',
	},
	{
		gate: 'prototype gate: still wired',
		files: {
			'src/screens/__mut__.tsx':
				'export function M() {\n  return <div style={{ color: "red" }}>x</div>\n}\n',
		},
		cmd: 'node scripts/gate.mjs',
		expect: 'inline-style',
	},
]

// -- Coverage pre-pass: every rule must have a mutation ----------------------
// "Add the rule and its mutation in the same commit" was an instruction; this
// makes it a failure. Twin ids (-ts/-tsx) normalize to their base — one
// grammar's proof covers the shared pattern.
let failed = 0
{
	const norm = (id) => id.replace(/-(ts|tsx)$/, '')
	const declared = new Set()
	if (existsSync(join(ROOT, 'ast-grep/rules'))) {
		for (const f of readdirSync(join(ROOT, 'ast-grep/rules'))) {
			const id = readFileSync(join(ROOT, 'ast-grep/rules', f), 'utf8').match(/^id:\s*(.+)$/m)?.[1]
			if (id) declared.add(norm(id.trim()))
		}
	}
	const cruiserPath = join(ROOT, '.dependency-cruiser.cjs')
	if (existsSync(cruiserPath)) {
		const cfg = createRequire(import.meta.url)(cruiserPath)
		for (const r of cfg.forbidden ?? []) if (r.severity === 'error') declared.add(r.name)
	}
	const covered = new Set(MUTATIONS.filter((m) => m.expect).map((m) => norm(m.expect)))

	// SCRIPT gates too. The pre-pass used to enumerate only ast-grep and
	// depcruise rules, so a script gate could lose its mutation and nothing
	// noticed — which is exactly what happened: a careless block-replace deleted
	// all three adr-graph mutations, the total dropped 27→26, and the run stayed
	// green. The authority for "which script gates exist" is the ADRs' own
	// `Enforced by: script:<name>` edges, so this cannot drift from the doctrine.
	const scriptCmd = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}
	const claimed = new Set()
	if (existsSync(join(ROOT, 'docs/decisions'))) {
		for (const f of readdirSync(join(ROOT, 'docs/decisions'))) {
			if (!/^\d{4}-.+\.md$/.test(f)) continue
			const line = readFileSync(join(ROOT, 'docs/decisions', f), 'utf8').match(
				/\*\*Enforced by:\*\*\s*([^\n]+)/,
			)?.[1]
			for (const m of (line ?? '').matchAll(/script:([\w:-]+)/g)) claimed.add(m[1])
		}
	}
	const allCmds = MUTATIONS.map((m) => m.cmd).join(' ')
	for (const id of [...claimed].sort()) {
		// Resolve to the file the gate actually runs, so a mutation is matched by
		// what it invokes rather than by a name someone remembered to repeat.
		const file = (scriptCmd[id] ?? `scripts/${id}.mjs`).match(/scripts\/([\w-]+\.mjs)/)?.[1]
		if (!file) continue // shells straight to a tool (wrangler types --check)
		if (allCmds.includes(file)) continue
		if (UNPROVABLE_SCRIPTS[id]) {
			console.log(`~  script:${id}: no mutation, declared unprovable — ${UNPROVABLE_SCRIPTS[id]}`)
			continue
		}
		console.error(
			`✗ UNCOVERED GATE  script:${id} (${file}) is named by an ADR's **Enforced by:** but no mutation runs it — add one here in the same commit.`,
		)
		failed++
	}
	for (const id of [...declared].sort()) {
		if (covered.has(id)) continue
		if (UNPROVABLE[id]) {
			console.log(`~  ${id}: no mutation, declared unprovable — ${UNPROVABLE[id]}`)
			continue
		}
		console.error(
			`✗ UNCOVERED RULE  ${id}: no mutation proves it fires — add one here in the same commit as the rule.`,
		)
		failed++
	}
}

for (const m of MUTATIONS) {
	for (const [p, content] of Object.entries(m.files)) {
		mkdirSync(join(ROOT, dirname(p)), { recursive: true })
		writeFileSync(join(ROOT, p), content)
	}
	let out = ''
	let exited0 = true
	try {
		out = execSync(m.cmd, { cwd: ROOT, stdio: 'pipe' }).toString()
	} catch (e) {
		exited0 = false
		out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
	}
	for (const p of Object.keys(m.files)) if (existsSync(join(ROOT, p))) rmSync(join(ROOT, p))

	// A negative control plants VALID input and demands silence. Without one, a
	// check that flags everything looks identical to a check that works: the
	// ADR-citation rule shipped matching a regex against filenames it could
	// never match, and still "fired" on every planted violation. Any gate that
	// can fail OPEN needs the positive; any gate that can fail CLOSED needs this.
	const ok = m.expectClean ? exited0 : !exited0 && out.includes(m.expect)
	const label = m.expectClean ? '✗ FALSE POSITIVE' : '✗ DEAD GATE'
	console.log(`${ok ? '✓' : label}  ${m.gate}`)
	if (!ok) {
		failed++
		console.error(
			m.expectClean
				? '   planted VALID input; expected exit 0, got a failure — the gate flags what it should accept.'
				: `   planted a violation; expected nonzero exit mentioning "${m.expect}", got ${exited0 ? 'exit 0' : 'no mention'}.`,
		)
	}
}

if (failed) {
	console.error(`\nverify-gates: ${failed} check(s) failed their control.`)
	console.error(
		"A green gate that cannot fail is decoration; a gate that fails on everything is worse. Fix the config or the rule's file globs.",
	)
	process.exit(1)
}
{
	const neg = MUTATIONS.filter((m) => m.expectClean).length
	console.log(
		`\nverify-gates: all ${MUTATIONS.length} controls passed — ${MUTATIONS.length - neg} planted violation(s) fired, ${neg} valid input(s) stayed silent. Green means something.`,
	)
}
