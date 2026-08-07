// ./build is an ARTIFACT, and more than one gate now GRADES it rather than
// grading your source: `wrangler check startup` measures the built bundle
// (ADR-0017), and the integration tier runs that same bundle in workerd
// (ADR-0021). Both fail silently in the same way — run them against a stale
// ./build and they cheerfully report on yesterday's artifact while every other
// check stays green.
//
// So the rule lives here once. A second copy is a copy that drifts, and the one
// that drifts is the one that quietly stops firing.
//
// The reaction differs by host, so this module states the FACT and lets the
// caller react: a script exits nonzero, a test throws (process.exit inside a
// vitest worker kills the run without a usable failure).
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BUILD_DIR = 'build/server'
const SOURCE_DIRS = ['src', 'workers']

const newestMtime = (dir, skip = /node_modules|^build$|^\.git$/) => {
	let newest = 0
	const walk = (d) => {
		let entries
		try {
			entries = readdirSync(d, { withFileTypes: true })
		} catch {
			return
		}
		for (const e of entries) {
			if (skip.test(e.name)) continue
			const p = join(d, e.name)
			if (e.isDirectory()) walk(p)
			else if (/\.(ts|tsx|css|jsonc?|mjs)$/.test(e.name))
				newest = Math.max(newest, statSync(p).mtimeMs)
		}
	}
	walk(dir)
	return newest
}

/**
 * @returns {string | null} why ./build cannot be trusted, or null if it can.
 */
export function buildStaleness() {
	let buildMtime = 0
	try {
		buildMtime = Math.max(
			0,
			...readdirSync(BUILD_DIR, { recursive: true }).map((f) => {
				try {
					return statSync(join(BUILD_DIR, f)).mtimeMs
				} catch {
					return 0
				}
			}),
		)
	} catch {
		return `no ./${BUILD_DIR}`
	}
	if (!buildMtime) return `no ./${BUILD_DIR}`
	for (const dir of SOURCE_DIRS)
		if (newestMtime(dir) > buildMtime) return `./build is older than ${dir}/`
	return null
}

/**
 * Script-side reaction: print what would have been graded, and exit nonzero.
 * @param {string} label  the gate speaking, for the message prefix
 * @param {string} what   what this gate would have measured instead
 */
export function assertBuildFresh(label, what) {
	const stale = buildStaleness()
	if (!stale) return
	console.error(`${label}:\n  ${stale} — ${what}; run \`npm run build\` first`)
	process.exit(1)
}
