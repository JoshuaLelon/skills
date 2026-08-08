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
//   node scripts/sync-runtime.mjs --write --force
//                                           also overwrite DIVERGED files,
//                                           DISCARDING the local changes
//
// The skill directory is recorded at scaffold time in `.prototyping-skill`, and
// can be overridden with PROTOTYPING_SKILL=/path/to/prototyping.
//
// --write NEVER SILENTLY DESTROYS LOCAL WORK. It used to: a managed file the app
// had edited was simply overwritten, with a line saying UPDATED and no hint that
// anything had been lost. That deleted an afternoon of harness work in a real
// project, and the only reason it came back was an editor's undo history.
//
// Telling "the app edited it" from "the skill moved on" needs a third fact —
// comparing two files can only ever say THAT they differ. So sync records the
// hash of every managed file it writes or finds already in sync, in
// `.prototyping-sync.json`. Commit that file: it is the shared baseline, and a
// fresh clone without it has to re-earn the same knowledge.
//
//   mine === theirs                     in sync (and the hash is recorded)
//   mine !== theirs, mine === baseline  the SKILL moved on  -> UPDATE, safe
//   mine !== theirs, mine !== baseline  the APP edited it   -> DIVERGED, skipped
//   no baseline recorded yet            treated as DIVERGED -> skipped
//
// The last line is the important one. Better to skip a legitimate update and say
// so than to delete work, so an unknown file is guarded, not overwritten. The
// cost is a real update that needs `--force` once; the alternative cost is
// somebody's afternoon.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WRITE = process.argv.includes('--write')
const CHECK = process.argv.includes('--check')
const FORCE = process.argv.includes('--force')

// MANAGED — the app is never supposed to edit these, so the skill may update
// them. This is exactly the set whose bugs an app cannot fix for itself. "Never
// supposed to" is not "never does", which is what DIVERGED is for.
const MANAGED = [
	['template/src/host.tsx', 'src/host.tsx'],
	['template/src/walkthrough.tsx', 'src/walkthrough.tsx'],
	['template/src/states.tsx', 'src/states.tsx'],
	['gate.mjs', 'scripts/gate.mjs'],
	['strip-harness.mjs', 'scripts/strip-harness.mjs'],
	// Sync updates itself. It was the one runtime file outside its own list,
	// which made it the one file whose bugs could never reach a live prototype —
	// the exact failure it exists to prevent. Node reads a script fully before
	// running it, so rewriting this file mid-run is safe; the new copy takes
	// effect next time.
	['sync-runtime.mjs', 'scripts/sync-runtime.mjs'],
	// clock.ts is byte-identical with the production template's copy
	// (check-parity.mjs) — an app editing it breaks the port it is preparing for.
	// It was in neither list while it was prototype-only, so a fix to it reached
	// no existing app; now that it crosses, drift here is a defect, not news.
	['template/src/fixtures/clock.ts', 'src/fixtures/clock.ts'],
]

// WATCHED — reported, never written. The app is EXPECTED to diverge here:
// `now.ts` says "change the date, not the pattern", and the starter primitives
// are meant to be edited and added to. Drift here is information, not a defect.
const WATCHED = [
	['template/src/fixtures/now.ts', 'src/fixtures/now.ts'],
	// helpers.ts is a fixture apps legitimately extend, so it is never written —
	// but most never touch it, and it carries skill-owned mechanism (the clock
	// pin, the uncaught-page-error failure that connects the host's dev
	// invariants to the suite). Silence here would keep those from every
	// prototype already out there.
	['template/e2e/helpers.ts', 'e2e/helpers.ts'],
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

// ---------------------------------------------------------------------------
// The baseline: what sync last wrote, or last saw already matching.
// ---------------------------------------------------------------------------
const STATE_FILE = '.prototyping-sync.json'
const sha = (text) => createHash('sha256').update(text).digest('hex')

let baseline = {}
try {
	baseline = JSON.parse(readFileSync(join(ROOT, STATE_FILE), 'utf8'))
} catch {
	baseline = {} // absent or unreadable — every managed file is then unknown
}
let baselineDirty = false
const remember = (to, text) => {
	const h = sha(text)
	if (baseline[to] !== h) {
		baseline[to] = h
		baselineDirty = true
	}
}

// ---------------------------------------------------------------------------
console.log(`sync-runtime: comparing against ${SKILL}`)

const lines = []
let pending = 0 // managed files an ordinary --write would change
let diverged = 0 // managed files --write refused to touch

for (const [from, to] of MANAGED) {
	const theirs = read(join(ASSETS, from))
	if (theirs === null) continue // not every skill version ships every file
	const mine = read(join(ROOT, to))

	if (mine === null) {
		lines.push(`  ${WRITE ? 'CREATED ' : 'MISSING '}  ${to}`)
		if (WRITE) {
			writeFileSync(join(ROOT, to), theirs)
			remember(to, theirs)
		} else pending++
		continue
	}

	if (mine === theirs) {
		remember(to, mine) // in sync: safe to trust as the baseline
		continue
	}

	// It differs. Whose change is it?
	const known = baseline[to] === sha(mine)

	if (!known && !FORCE) {
		diverged++
		lines.push(
			`  DIVERGED  ${to}\n` +
				`            Differs from the skill AND from anything sync has written,\n` +
				`            so the change is probably yours. --write will not touch it.\n` +
				`            Compare:  diff ${join(ASSETS, from)} ${to}\n` +
				`            Then push your change upstream into the skill, or re-run with\n` +
				`            --force to DISCARD your version and take the skill's.`,
		)
		continue
	}

	const why = known ? '' : '   (forced — local changes discarded)'
	lines.push(`  ${WRITE ? 'UPDATED ' : 'UPDATE  '}  ${to}${why}`)
	if (WRITE) {
		writeFileSync(join(ROOT, to), theirs)
		remember(to, theirs)
	} else pending++
}

if (lines.length) console.log(`managed by the skill (--write updates these):\n${lines.join('\n')}`)

// WATCHED is unchanged: reported, never written, never counted as a defect.
const watched = []
for (const [from, to] of WATCHED) {
	const theirs = read(join(ASSETS, from))
	if (theirs === null) continue
	const mine = read(join(ROOT, to))
	if (mine === null) watched.push(`  MISSING   ${to}`)
	else if (mine !== theirs) watched.push(`  DIFFERS   ${to}`)
}
if (watched.length)
	console.log(`watched (yours to diverge; reported only):\n${watched.join('\n')}`)

if (baselineDirty) {
	writeFileSync(join(ROOT, STATE_FILE), `${JSON.stringify(baseline, null, 2)}\n`)
}

if (!lines.length && !watched.length) console.log('sync-runtime: in sync.')
else if (!WRITE && pending) console.log('sync-runtime: run with --write to take the managed updates.')

if (diverged) {
	console.error(
		`\nsync-runtime: ${diverged} managed file(s) DIVERGED and were left alone.\n` +
			'A managed file you have edited is information, not noise — the skill is the\n' +
			'place that fix belongs, so every prototype gets it. Push it upstream.',
	)
	process.exit(1)
}
if (CHECK && pending) process.exit(1)
