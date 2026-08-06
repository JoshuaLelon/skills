#!/usr/bin/env node
// The prototyping gate. Zero dependencies — node walks src/ and e2e/ and fails
// on violations of the standards in the prototyping skill. Copied verbatim from
// the skill's assets/ at scaffold time; do not hand-edit rules per project —
// improve the skill's copy instead, so every prototype inherits the fix.
//
// Escape hatch: put `gate:allow <rule-id>` in a comment on the offending line
// or the line above it. Every exception is then greppable and deliberate.
//
// Usage: node scripts/gate.mjs        (wired as `npm run gate`, plus tsc -b)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

// ---------------------------------------------------------------------------
// Line rules: { id, where (path regex), re (line regex), msg (the standard) }
// ---------------------------------------------------------------------------
// Harness files ship from the skill's template and are deliberately styled
// inline (dashed borders, the accent) — exempt from product style rules.
const HARNESS = /^src\/(walkthrough|states)\.tsx$/

const LINE_RULES = [
	{
		id: 'inline-style',
		where: /^src\/.*\.(tsx|jsx|html)$/,
		unless: HARNESS,
		re: /\sstyle=(["']|\{\{)/,
		msg: 'style= is a decision with no name; name it in a primitive (skill: gates)',
	},
	{
		id: 'utility-in-screen',
		where: /^src\/screens\//,
		re: /class(Name)?=["'{`][^"'`]*\b(text-|bg-|p[xytrbl]?-\d|m[xytrbl]?-\d|flex\b|grid\b|gap-|w-\d|h-\d|max-w-|min-w-|rounded|border\b|border-|font-|leading-|tracking-|items-|justify-|space-[xy]-|overflow-|absolute\b|relative\b|hidden\b|inline-)/,
		msg: 'utility classes live inside primitives; screens compose (skill: L2/L3)',
	},
	{
		id: 'export-let',
		where: /^src\//,
		re: /^\s*export\s+(let|var)\s/,
		msg: 'module-level mutable state hides from the store; put it in state (skill: store rules)',
	},
	{
		id: 'impure-store',
		where: /^src\/store\//,
		re: /(Date\.now\(|new Date\(|Math\.random\(|setTimeout\(|setInterval\(|document\.|window\.|localStorage)/,
		msg: 'the reducer is pure: time/randomness/DOM come in via actions or NOW (skill: store rules)',
	},
	{
		id: 'store-imports-view',
		where: /^src\/store\//,
		re: /from\s+["'][^"']*\/(components|screens)\/|from\s+["']react(-dom)?["']/,
		msg: 'the store never imports the view or the framework; it must port unedited (skill: L1)',
	},
	{
		id: 'fixture-holds-view',
		where: /^src\/fixtures\/entities\//,
		re: /(var\(--|<(div|span|p|a|b|i|em|strong|img|ul|ol|li|br|hr|table|tr|td|h[1-6])\b|Date\.now\(|new Date\()/,
		msg: 'fixtures are typed plain data: no CSS values, no HTML, timestamps derive from NOW (skill: L0)',
	},
	{
		id: 'seam-leak',
		where: /^src\/(components|screens)\//,
		re: /from\s+["'][^"']*fixtures\/entities/,
		msg: 'the view reads data through accessors, never the fixture; the accessor becomes the loader (skill: fixture rules)',
	},
	{
		id: 'raw-registry-import',
		where: /^src\/screens\//,
		re: /from\s+["'][^"']*components\/ui\//,
		msg: 'screens import your named primitive, never the registry copy — wrap it (skill: L2)',
	},
	{
		id: 'bad-locator',
		where: /^e2e\//,
		re: /(getByTestId\(|waitForTimeout\(|\.locator\(\s*["'`][.#])/,
		msg: 'role/name locators only; no test ids, css selectors, or sleeps (skill: flow tests)',
	},
	{
		id: 'bad-test-name',
		where: /^e2e\//,
		re: /\b(test|it)\(\s*["'`][^"'`]*\bshould\b/i,
		msg: "test names are verb-first and never 'should' — name the intention (skill: flow tests)",
	},
	{
		id: 'snapshot-in-file',
		where: /^e2e\//,
		re: /toMatchAriaSnapshot\(\s*\{/,
		msg: 'aria snapshots live inline — the test is the readable flow spec (skill: conventions)',
	},
	{
		id: 'bad-id-format',
		where: /^src\/fixtures\/entities\//,
		re: /\bid:\s*["'](?![a-z0-9_]+:[a-z0-9-]+["'])/,
		msg: 'ids are type:kebab-slug, minted once, never derived from the title (skill: conventions)',
	},
	{
		id: 'accent-leak',
		where: /^src\//,
		unless: /^src\/walkthrough\.tsx$/,
		re: /#e6007a/i,
		msg: 'the harness accent is the pointer — nothing in the product may use it (skill: walk)',
	},
	{
		id: 'bad-action-name',
		where: /^src\/store\//,
		re: /case\s+["'][^"'/]+["']\s*:/,
		msg: "actions are 'entity/verb' strings (skill: conventions)",
	},
]

// ---------------------------------------------------------------------------
// File rules: whole-file checks.
// ---------------------------------------------------------------------------
const FILE_RULES = [
	{
		id: 'missing-states',
		where: /^src\/components\/[^/]+\.tsx$/,
		check: (text) => !/export const STATES/.test(text),
		msg: 'every primitive exports STATES so /__states never goes stale (skill: states page)',
	},
	{
		id: 'strict-mode',
		where: /^src\/(main|entry\.client)\.tsx$/,
		check: (text) => !text.includes('<StrictMode>'),
		msg: 'StrictMode IS the render-idempotence check; it stays on — in main.tsx (vite) or entry.client.tsx (RR8)',
	},
]

// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report'])

function* walk(dir, rel = '') {
	let entries
	try {
		entries = readdirSync(join(ROOT, dir === '.' ? rel : join(dir, rel)))
	} catch {
		return
	}
	const base = dir === '.' ? rel : join(dir, rel)
	for (const name of entries) {
		if (SKIP_DIRS.has(name)) continue
		const p = join(base, name)
		if (statSync(join(ROOT, p)).isDirectory()) yield* walk('.', p)
		else yield p
	}
}

const allowed = (id, lines, i) =>
	lines[i].includes(`gate:allow ${id}`) || (i > 0 && lines[i - 1].includes(`gate:allow ${id}`))

const violations = []
let checked = 0

for (const top of ['src', 'e2e']) {
	for (const file of walk(top)) {
		if (!/\.(ts|tsx|js|jsx|html|css)$/.test(file)) continue
		checked++
		const text = readFileSync(join(ROOT, file), 'utf8')
		const lines = text.split('\n')

		for (const rule of LINE_RULES) {
			if (!rule.where.test(file)) continue
			if (rule.unless?.test(file)) continue
			lines.forEach((line, i) => {
				if (rule.re.test(line) && !allowed(rule.id, lines, i))
					violations.push(`${file}:${i + 1}  [${rule.id}] ${rule.msg}`)
			})
		}
		for (const rule of FILE_RULES) {
			if (!rule.where.test(file)) continue
			if (rule.check(text) && !text.includes(`gate:allow ${rule.id}`))
				violations.push(`${file}:1  [${rule.id}] ${rule.msg}`)
		}
	}
}

// A gate that scanned nothing enforces nothing — fail loudly instead of
// greening an empty (or relocated) tree. Catches src/ moving to app/.
if (checked === 0) {
	console.error(
		"gate: scanned 0 files — src/ and e2e/ are empty or the tree moved. The gate's globs must move with it.",
	)
	process.exit(1)
}

if (violations.length) {
	console.error(violations.sort().join('\n'))
	console.error(`\ngate: ${violations.length} violation(s) in ${checked} files.`)
	console.error('Intentional? Add a `gate:allow <rule-id>` comment on or above the line.')
	process.exit(1)
}
console.log(`gate: OK (${checked} files)`)
