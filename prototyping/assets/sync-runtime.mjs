#!/usr/bin/env node
// Does this app still match the skill it was scaffolded from?
//
// A scaffold is a one-time copy, so a live prototype never receives a fix made
// to the skill afterwards. That is not hypothetical: `host.tsx` once computed
// its effect queue and discarded it (no effect ever ran) and `states.tsx` looked
// components up by filename when files are kebab-case and components are Pascal
// (so /__states rendered nothing, in every project). Both were fixed in the
// skill; every app scaffolded before the fix still carried them, silently.
//
// This is the check that surfaces it. Zero dependencies.
//
//   node scripts/sync-runtime.mjs           report drift
//   node scripts/sync-runtime.mjs --write   update the MANAGED files
//   node scripts/sync-runtime.mjs --check   exit 1 if MANAGED files drift (CI)
//
// The skill directory is recorded at scaffold time in `.prototyping-skill`, and
// can be overridden with PROTOTYPING_SKILL=/path/to/prototyping.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const CHECK = process.argv.includes('--check')

// MANAGED — the app is never supposed to edit these, so they can be overwritten
// from the skill without asking. This is exactly the set whose bugs an app
// cannot fix for itself.
const MANAGED = [
	['template/src/host.tsx', 'src/host.tsx'],
	['template/src/walkthrough.tsx', 'src/walkthrough.tsx'],
	['template/src/states.tsx', 'src/states.tsx'],
	['gate.mjs', 'scripts/gate.mjs'],
	['strip-harness.mjs', 'scripts/strip-harness.mjs'],
]

// WATCHED — reported, never written. The app is EXPECTED to diverge here:
// `now.ts` says "change the date, not the pattern", and the starter primitives
// are meant to be edited and added to. Drift here is information, not a defect.
const WATCHED = [
	['template/src/fixtures/now.ts', 'src/fixtures/now.ts'],
	['template/src/components/btn.tsx', 'src/components/btn.tsx'],
	['template/src/components/page.tsx', 'src/components/page.tsx'],
	['template/src/components/row.tsx', 'src/components/row.tsx'],
	['template/src/components/text-input.tsx', 'src/components/text-input.tsx'],
	['template/src/components/screen-error.tsx', 'src/components/screen-error.tsx'],
]

function skillDir() {
	if (process.env.PROTOTYPING_SKILL) return process.env.PROTOTYPING_SKILL
	const pin = join(ROOT, '.prototyping-skill')
	if (existsSync(pin)) {
		const dir = readFileSync(pin, 'utf8').trim().split('\n')[0]
		if (dir && existsSync(dir)) return dir
	}
	return null
}

const SKILL = skillDir()
if (!SKILL) {
	console.error(
		'sync-runtime: no skill directory. Set PROTOTYPING_SKILL=/path/to/prototyping,\n' +
			'or write the path into .prototyping-skill (scaffold.sh does this for new apps).',
	)
	process.exit(1)
}
const ASSETS = join(SKILL, 'assets')

const read = (p) => {
	try {
		return readFileSync(p, 'utf8')
	} catch {
		return null
	}
}

let drifted = 0
const report = (rows, label, writable) => {
	const lines = []
	for (const [from, to] of rows) {
		const mine = read(join(ROOT, to))
		const theirs = read(join(ASSETS, from))
		if (theirs === null) continue // not every skill version ships every file
		if (mine === null) {
			lines.push(`  MISSING  ${to}`)
			if (writable && WRITE) writeFileSync(join(ROOT, to), theirs)
			if (writable) drifted++
			continue
		}
		if (mine === theirs) continue
		lines.push(`  ${writable && WRITE ? 'UPDATED ' : 'DIFFERS '} ${to}`)
		if (writable && WRITE) writeFileSync(join(ROOT, to), theirs)
		if (writable) drifted++
	}
	if (lines.length) console.log(`${label}\n${lines.join('\n')}`)
	return lines.length
}

console.log(`sync-runtime: comparing against ${SKILL}`)
const m = report(MANAGED, 'managed by the skill (--write updates these):', true)
const w = report(WATCHED, 'watched (yours to diverge; reported only):', false)
if (!m && !w) console.log('sync-runtime: in sync.')
else if (!WRITE && m) console.log('sync-runtime: run with --write to take the managed updates.')

if (CHECK && drifted) process.exit(1)
