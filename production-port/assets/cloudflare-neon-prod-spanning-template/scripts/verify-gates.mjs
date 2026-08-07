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
const UNPROVABLE = {
	'no-bcrypt':
		'fires on an import of an installed bcrypt; installing bcrypt to prove it is worse than the gap',
}

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
		// docs-check reads the STAGED diff, so the mutation has to stage the
		// planted file and unstage it again whatever happens. This gate shipped
		// broken (a filename regex that matched nothing, masked by the template
		// sitting in a subdirectory of the skills repo); nothing proved it fired.
		gate: 'docs-check: ADR citation resolves',
		files: { 'src/__mut__adr.md': 'Planted: cites ADR-9999, which does not exist.\n' },
		cmd: 'git add -f -- src/__mut__adr.md && node scripts/docs-check.mjs; rc=$?; git reset -q -- src/__mut__adr.md; exit $rc',
		expect: 'src/__mut__adr.md: cites ADR-9999',
	},
	{
		gate: 'docs-check: a VALID ADR citation stays silent (negative control)',
		files: { 'src/__mut__adr_ok.md': 'Planted: cites ADR-0009, which exists.\n' },
		cmd: 'git add -f -- src/__mut__adr_ok.md && node scripts/docs-check.mjs; rc=$?; git reset -q -- src/__mut__adr_ok.md; exit $rc',
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
