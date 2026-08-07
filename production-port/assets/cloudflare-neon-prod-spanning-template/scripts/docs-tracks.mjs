#!/usr/bin/env node
// FRESHNESS FOR PROSE THAT CANNOT BE GENERATED.
//
// Generation beats hashing wherever the downstream is fully derivable: llms.txt
// and adr-graph.md are regenerated and diffed, so staleness is impossible rather
// than detected. This handles the other case — a human-written section that
// DEPENDS on an upstream fact but is not computable from it. ADR-0016's
// judgement rests on prices in cloudflare-primitives.md; nothing can derive the
// paragraph, and nothing noticed when the prices moved.
//
//   > **Tracks:** ../reference/cloudflare-primitives.md@a1b2c3d
//
// The pin is the upstream file's git blob hash at the moment someone last read
// it. When the upstream changes, the pin no longer matches and this says so.
//
// WHAT IT PROVES, EXACTLY: that a human looked. NOT that the prose is right — a
// rule credited with more than it catches is worse than no rule. So this is a
// REPORT by default (`--check` makes it an exit code, for a repo that wants
// one), and `--bless` records "I looked" by rewriting the pins.
//
// Adoption was pre-registered in the production-port skill's docs-system
// reference: "adopt scoped to reference/ docs extracted from design docs, when
// those exist." Extracting the ADR menus into docs/reference/ created them.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const BLESS = process.argv.includes('--bless')
const CHECK = process.argv.includes('--check')
// Blessing asserts "a human re-read this". Repo-wide, one invocation can assert
// that about documents you never opened — so `--bless <path…>` scopes it. Bare
// `--bless` still blesses everything, which is honest only when you did.
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'))

const blob = (p) => {
	try {
		return execSync(`git hash-object "${p}"`, { cwd: ROOT, stdio: 'pipe' })
			.toString()
			.trim()
			.slice(0, 7)
	} catch {
		return null
	}
}

function* docs(dir) {
	let names = []
	try {
		names = readdirSync(join(ROOT, dir))
	} catch {
		return
	}
	for (const name of names.sort()) {
		const p = join(dir, name)
		if (statSync(join(ROOT, p)).isDirectory()) yield* docs(p)
		else if (name.endsWith('.md')) yield p
	}
}

const stale = []
const missing = []
let pins = 0
let rewritten = 0

for (const f of [...docs('docs')].filter(
	(f) => !ONLY.length || ONLY.some((o) => f.endsWith(o) || f.includes(o)),
)) {
	const text = readFileSync(join(ROOT, f), 'utf8')
	const line = text.match(/\*\*Tracks:\*\*\s*([^\n]+)/)?.[1]?.trim()
	if (!line) continue
	let out = text
	for (const ref of line
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)) {
		const [rel, pinned] = ref.replace(/`/g, '').split('@')
		const target = relative(ROOT, resolve(join(ROOT, dirname(f)), rel))
		pins++
		if (!existsSync(join(ROOT, target))) {
			missing.push(`${f}: Tracks '${rel}' — no such file`)
			continue
		}
		const now = blob(target)
		if (!now) continue
		if (pinned !== now) {
			if (BLESS) {
				out = out.replace(`${rel}@${pinned}`, `${rel}@${now}`)
				rewritten++
			} else {
				stale.push(
					`${f}: tracks ${rel}, pinned @${pinned}, now @${now} — re-read it, then \`npm run docs:bless -- ${f.split('/').pop().slice(0, 4)}\` to bless just this one`,
				)
			}
		}
	}
	if (BLESS && out !== text) writeFileSync(join(ROOT, f), out)
}

if (missing.length) {
	console.error(`docs-tracks:\n  ${missing.join('\n  ')}`)
	process.exit(1)
}
if (BLESS) {
	console.log(`docs-tracks: blessed ${rewritten} pin(s) across ${pins} tracked`)
} else if (stale.length) {
	// Report, not gate — unless asked. The upstream moved; the dependent prose
	// may or may not still be true, and only a reader can say which.
	console.log(`docs-tracks: ${stale.length} of ${pins} pin(s) stale:\n  ${stale.join('\n  ')}`)
	if (CHECK) process.exit(1)
} else {
	console.log(`docs-tracks: OK (${pins} pin(s) current)`)
}
