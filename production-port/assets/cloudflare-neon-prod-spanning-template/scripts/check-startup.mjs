#!/usr/bin/env node
// Bundle size is an invariant nobody notices breaking: a dependency joins the
// Worker, cold start gets slower, and every other check stays green.
//
// WHAT THIS ACTUALLY MEASURES — established by experiment, because the obvious
// story turned out to be wrong. Wiring one screen to lib/ai (ADR-0022) moved
// the bundle 223 -> 318 KiB gzip. The tempting explanation was "the provider
// SDK should have been lazy"; it already was. Measured, seam reachable:
//   dynamic import  ->  317.95 KiB gzip, 0.0 ms startup CPU
//   static import   ->  317.82 KiB gzip, 0.0 ms startup CPU
// No difference. The bundler inlines the dynamic import into the same chunk,
// so `await import()` defers EVALUATION, not INCLUSION. The 95 KiB was
// reachability — dead code being eliminated in the before-measurement, not
// laziness working in it.
//
// So the honest claim: this gate catches a dependency entering the Worker's
// reachable graph, which is the thing that actually costs cold start. It does
// NOT verify that a lazy import is still lazy — nothing here can, and a comment
// claiming otherwise would be worse than no comment.
//
// The CPU budget has never fired in any variant above (0.0 ms throughout); the
// local profile takes ~1 sample and is too coarse for module init. Treat it as
// an unproven backstop for genuinely expensive module-scope work, not a
// tripwire — gzip is the signal that moves.
//
// Wraps `wrangler check startup` (wrangler >= 4.116.0), which is informational
// and always exits 0; the budgets below are what make it a gate.
//
// THE TRAP THIS SCRIPT ENCODES: under @cloudflare/vite-plugin the generated
// config carries no_bundle, so `wrangler check startup` MEASURES ./build — it
// does not compile your source. Run it on a stale build and it cheerfully
// reports yesterday's bundle, which is the same trap check-config-traps
// already guards for `wrangler deploy`. Hence the freshness check below, and
// hence `check:startup` builds first.
//
// Raising a budget is a DECISION — record why in the commit, the same way an
// ADR records one. Do not nudge it to make a red build green.
import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Baseline 318 KiB with lib/ai reachable. ~13% headroom: enough that ordinary
// feature work does not trip it, tight enough that a second dependency the size
// of a provider SDK does. Raising this is a decision — say why in the commit.
const MAX_GZIP_KIB = 360
// Startup CPU should be ~0: module-scope work is what this catches — a
// top-level client construction, a big table built at import time.
const MAX_STARTUP_CPU_MS = 50
const BUILD_DIR = 'build/server'

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

// Freshness: a build older than the newest source means we would measure an
// artifact that no longer corresponds to the tree.
let buildMtime = 0
try {
	buildMtime = Math.max(
		...readdirSync(BUILD_DIR, { recursive: true }).map((f) => {
			try {
				return statSync(join(BUILD_DIR, f)).mtimeMs
			} catch {
				return 0
			}
		}),
	)
} catch {
	console.error(
		'check-startup:\n  no ./build — `wrangler check startup` measures the BUILD, not your source; run `npm run build` first',
	)
	process.exit(1)
}
for (const dir of ['src', 'workers']) {
	if (newestMtime(dir) > buildMtime) {
		console.error(
			`check-startup:\n  ./build is older than ${dir}/ — this would measure a stale bundle; run \`npm run build\` first`,
		)
		process.exit(1)
	}
}

let out
try {
	out = execFileSync('npx', ['wrangler', 'check', 'startup'], { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
	console.error(
		`check-startup: could not run \`wrangler check startup\`\n  ${(e.stderr || e.message).split('\n')[0]}`,
	)
	process.exit(1)
}

// `wrangler check startup` leaves a profile in cwd; it is a build artifact.
rmSync('worker-startup.cpuprofile', { force: true })

const bundle = out.match(/Bundle:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/)
const active = out.match(/Active:\s*([\d.]+)\s*ms/)
if (!bundle || !active) {
	console.error(
		`check-startup: could not parse wrangler output — the format changed; update this script\n${out}`,
	)
	process.exit(1)
}

const [, rawKiB, gzipKiB] = bundle
const cpuMs = Number(active[1])
const problems = []
if (Number(gzipKiB) > MAX_GZIP_KIB)
	problems.push(
		`bundle ${gzipKiB} KiB gzip exceeds the ${MAX_GZIP_KIB} KiB budget — something joined the startup path; worker-startup.cpuprofile shows what`,
	)
if (cpuMs > MAX_STARTUP_CPU_MS)
	problems.push(
		`startup CPU ${cpuMs} ms exceeds the ${MAX_STARTUP_CPU_MS} ms budget — module-scope work runs on every cold start; move it behind a dynamic import or into the handler`,
	)

if (problems.length) {
	console.error(`check-startup:\n  ${problems.join('\n  ')}`)
	process.exit(1)
}
console.log(`check-startup: OK (${rawKiB} KiB raw / ${gzipKiB} KiB gzip, ${cpuMs} ms startup CPU)`)
