#!/usr/bin/env node
// Runs every check, then prints the verdict FIRST.
//
// Two problems with the `a && b && c` chain this replaces. It stops at the
// first failure, so a red build tells you about one problem per run — you fix,
// re-run, wait, learn about the next one. And the failure it does report is
// buried under whatever the passing checks printed, so `head`/`tail` on the
// output misses it. That is not hypothetical: this script exists because a
// `head -40` on the old chain showed 3 of 14 biome errors and the other 11
// went unnoticed.
//
// So: run everything, collect, and put a SUMMARY BLOCK AT THE TOP naming every
// failing check. `head -20` is then guaranteed to show the complete list of
// what failed — never a prefix of it. Full output follows underneath for
// anything that failed.
//
// Truncation is always announced. A summary that quietly drops the 12th
// diagnostic recreates the exact bug this script was written to kill, so every
// elision prints its own count and how to see the rest.
//
// Zero dependencies.
//
//   node scripts/check-runner.mjs                 # all checks, compact
//   node scripts/check-runner.mjs --verbose       # full output for everything
//   node scripts/check-runner.mjs --only lint,gate
import { spawnSync } from 'node:child_process'

// Order matters: check:startup measures ./build, so keep it last.
const CHECKS = [
	'docs:check',
	'config:traps',
	'types:check',
	'lint',
	'lint:arch',
	'lint:dead',
	'gate',
	'test',
	'test:int',
	'e2e',
	'check:schema-drift',
	'check:startup',
]

// CI runs the cheap half honestly (ADR-0011): no DB, no browsers. It adds
// verify:gates — the meta-gate that plants a violation per declared rule and
// asserts each one still fires. That is slow and pointless on every local save,
// but it is exactly what you want before a merge.
const CI_SKIP = new Set(['test:int', 'e2e'])

// The one-command fix, where one exists. Printed with the failure, because the
// tool's own output does not always name it: biome marks findings FIXABLE and
// shows the exact diff, and never says `lint:fix`.
const REMEDY = {
	lint: 'npm run lint:fix',
	'docs:check':
		'npm run docs:generate   (then re-read anything docs-tracks names, and `npm run docs:bless -- <adr>`)',
	'types:check': 'npm run types',
	'check:schema-drift':
		'npx drizzle-kit generate   (answer its prompt; a pty works if you are not a human)',
}
const CI_EXTRA = ['verify:gates']
const ALL = [...CHECKS, ...CI_EXTRA]

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const ci = argv.includes('--ci')
const onlyArg = argv.indexOf('--only')
const only = onlyArg !== -1 && argv[onlyArg + 1] ? argv[onlyArg + 1].split(',') : null
// A requested name that is not known must NOT be quietly skipped — silently
// running fewer checks than asked for is the failure this script exists to
// prevent, and it would report PASSED while never having run the thing.
if (only) {
	const unknown = only.filter((c) => !ALL.includes(c))
	if (unknown.length) {
		console.error(
			`check-runner: unknown check(s): ${unknown.join(', ')}\n  known: ${ALL.join(', ')}`,
		)
		process.exit(2)
	}
}
const base = ci ? [...CHECKS.filter((c) => !CI_SKIP.has(c)), ...CI_EXTRA] : CHECKS
const checks = only ? ALL.filter((c) => only.includes(c)) : base

const BAR = '═'.repeat(72)
const MAX_LINES = 6 // per failing check in the summary

// What actually helps in a summary is WHERE, then HOW MANY — not the tool's
// prose, which repeats per violation ("Formatter would have printed…" ×11) and
// crowds out the file list. So rank rather than filter:
//   1. locations   — `path/file.ts:12:3`, the only lines you can act on
//   2. counts      — "Found 9 errors", the line that says how bad it is
//   3. messages    — our own scripts' failure text (config-traps, gate, …)
const LOCATION = /^\s*\S+\.(ts|tsx|mjs|jsonc?|ya?ml):\d+(:\d+)?/
const COUNT = /(found|checked)\s+\d+|^\s*\d+\s+(error|warning|problem)/i
const MESSAGE = /(✘|×|✗|missing|exceeds|stale|out of date|drift|unused|must|does not)/i
const NOISE =
	/^\s*$|^>|npm (ERR|WARN)|^\s*at Object|node:internal|Command failed|^\s*[-+│┃]|^\s*\d+\s+\d+\s*│/

const summarize = (out) => {
	const seen = new Set()
	const lines = out
		.split('\n')
		.map((l) => l.trimEnd())
		.filter((l) => !NOISE.test(l))
		.filter((l) => (seen.has(l) ? false : seen.add(l))) // dedupe repeated prose
	const tiers = [
		lines.filter((l) => LOCATION.test(l)),
		lines.filter((l) => COUNT.test(l)),
		lines.filter((l) => MESSAGE.test(l) && !LOCATION.test(l) && !COUNT.test(l)),
	]
	const ranked = [...new Set(tiers.flat())]
	const picked = ranked.length ? ranked : lines
	return { picked: picked.slice(0, MAX_LINES), total: picked.length }
}

const started = Date.now()
const results = []
for (const name of checks) {
	const t0 = Date.now()
	process.stderr.write(`  running ${name}…\r`)
	const r = spawnSync('npm', ['run', name], { encoding: 'utf8' })
	process.stderr.write(`${' '.repeat(40)}\r`)
	results.push({
		name,
		ok: r.status === 0,
		output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
		ms: Date.now() - t0,
	})
}

const failed = results.filter((r) => !r.ok)
const passed = results.filter((r) => r.ok)
const secs = ((Date.now() - started) / 1000).toFixed(0)

// ── SUMMARY FIRST — `head -20` must show every failing check, not a prefix ──
console.log(BAR)
console.log(`CHECK SUMMARY — ${failed.length ? 'FAILED' : 'PASSED'}${ci ? ' (ci)' : ''}`)
console.log(
	`${results.length} checks in ${secs}s · ${failed.length} failed · ${passed.length} passed`,
)
// Say what was NOT run. A green summary that silently skipped the DB tiers
// reads as "everything passed" — the same lie as a truncated failure list.
if (ci)
	console.log(
		`skipped (needs DB/browsers): ${[...CI_SKIP].join(', ')} — run \`npm run check\` locally`,
	)
console.log(BAR)

if (failed.length) {
	console.log(`\nFAILED (${failed.length}): ${failed.map((r) => r.name).join(', ')}\n`)
	for (const r of failed) {
		const { picked, total } = summarize(r.output)
		console.log(`  ✘ ${r.name}`)
		for (const l of picked) console.log(`      ${l}`)
		if (total > picked.length)
			console.log(`      … ${total - picked.length} more line(s) — full output below, or --verbose`)
		// A failure that does not name its own remedy is a puzzle. Some tools print
		// the fix; biome prints "FIXABLE" and a character-level diff but never the
		// command, which agents in two separate labs then hand-edited around.
		if (REMEDY[r.name]) console.log(`      → fix: ${REMEDY[r.name]}`)
		console.log('')
	}
}
if (passed.length) console.log(`PASSED (${passed.length}): ${passed.map((r) => r.name).join(', ')}`)
console.log(`\n${BAR}`)

// ── Detail, underneath, where it cannot push the summary out of `head` ──
for (const r of results) {
	if (!verbose && r.ok) continue
	console.log(`\n--- ${r.name} (${r.ok ? 'ok' : 'FAILED'}, ${(r.ms / 1000).toFixed(1)}s) ---`)
	console.log(r.output.trimEnd())
}

process.exit(failed.length ? 1 : 0)
