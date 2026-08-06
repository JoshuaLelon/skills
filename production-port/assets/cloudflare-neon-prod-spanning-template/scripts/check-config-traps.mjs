#!/usr/bin/env node
// Traps that live in CONFIG, mechanized — each was once a prose warning in an
// always-loaded doc; a script that fails is worth more than a paragraph that
// scrolls by. Runs in lefthook and `npm run check`. Zero dependencies.
//
// Every assertion prints the trap it encodes, so the failure teaches what the
// prose used to.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const problems = []

const read = (p) => {
	try {
		return readFileSync(join(ROOT, p), 'utf8')
	} catch {
		return null
	}
}

// 1. TS 7: erasableSyntaxOnly bans enum/namespace/parameter-properties
// mechanically — without it, training-data enum habits emit runtime code.
const tsconfigs = readdirSync(ROOT).filter((f) => /^tsconfig.*\.json$/.test(f))
if (
	tsconfigs.length &&
	!tsconfigs.some((f) => /"erasableSyntaxOnly"\s*:\s*true/.test(read(f) ?? ''))
) {
	problems.push(
		'no tsconfig sets erasableSyntaxOnly:true — enums/namespaces from training data will emit runtime code',
	)
}

// 2. jsdom is over — component tests run in real Chromium; jsdom silently
// lacks real APIs and passes tests the browser would fail.
for (const f of readdirSync(ROOT).filter((f) => /^vitest\.config\./.test(f))) {
	// Match actual usage, not the word — the shipped template's comment says
	// "jsdom is banned" and must not trip its own gate.
	if (/environment:\s*['"]jsdom/.test(read(f) ?? ''))
		problems.push(`${f}: jsdom environment — use Vitest browser mode (real Chromium)`)
}

// 3. Coverage thresholds get gamed — coverage is a map for finding untested
// branches, never a gate.
for (const f of readdirSync(ROOT).filter((f) => /^(vitest|vite)\.config\./.test(f))) {
	if (/thresholds/.test(read(f) ?? ''))
		problems.push(`${f}: coverage thresholds — a gated metric gets gamed; remove`)
}

// 4. Cloudflare: environment is selected at BUILD time. `wrangler deploy
// --env X` matches nothing in the generated config and silently deploys to
// PROD; a deploy script without a preceding build ships the stale ./build.
const pkg = JSON.parse(read('package.json') ?? '{}')
const scripts = pkg.scripts ?? {}
const hasWrangler = !!(pkg.devDependencies?.wrangler || pkg.dependencies?.wrangler)
for (const [name, cmd] of Object.entries(scripts)) {
	if (/wrangler\s+deploy\s+--env/.test(cmd))
		problems.push(
			`package.json scripts.${name}: 'wrangler deploy --env' silently deploys to PROD — select env at build time (CLOUDFLARE_ENV=… npm run build)`,
		)
	if (/wrangler\s+deploy/.test(cmd) && !/build/.test(cmd) && !/npm run (check|build)/.test(cmd))
		problems.push(
			`package.json scripts.${name}: 'wrangler deploy' without a build ships the stale ./build`,
		)
}
if (hasWrangler && !scripts.deploy) {
	problems.push(
		'wrangler installed but no scripts.deploy — deploys must be the scripted path (check && build && wrangler deploy), never bare wrangler',
	)
}

// 5. The manifest rule: every env var the app reads is listed in
// .dev.vars.example — a var missing there is one a fresh checkout cannot
// discover it needs.
const example = read('.dev.vars.example')
if (example) {
	const declared = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]))
	const BUILTINS = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL', 'NODE_ENV', 'CI'])
	const used = new Set()
	const scan = (dir) => {
		let names = []
		try {
			names = readdirSync(join(ROOT, dir))
		} catch {
			return
		}
		for (const n of names) {
			const p = join(dir, n)
			try {
				if (readdirSync(join(ROOT, p)) && !['node_modules'].includes(n)) {
					scan(p)
					continue
				}
			} catch {
				/* file */
			}
			if (!/\.(ts|tsx|mjs)$/.test(n)) continue
			for (const m of (read(p) ?? '').matchAll(
				/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g,
			))
				if (!BUILTINS.has(m[1])) used.add(m[1])
		}
	}
	scan('src')
	scan('workers')
	for (const v of [...used].sort())
		if (!declared.has(v))
			problems.push(
				`env var ${v} is read by the app but missing from .dev.vars.example — the manifest must list every var, set or not`,
			)
}

// 6. wrangler.jsonc: compatibility_date is top-level only (a demo on a
// different compat date is a demo of different behaviour), and env vars blocks
// must repeat every top-level var (vars does NOT inherit).
const wranglerRaw = read('wrangler.jsonc') ?? read('wrangler.json')
if (wranglerRaw) {
	// ADR-0009: the platform is the logging backend — capture must be on.
	if (!/"observability"/.test(wranglerRaw))
		problems.push(
			'wrangler: no observability block — Workers Logs is the entire log/error backend (ADR-0009); enable it',
		)
	if (!/"upload_source_maps"\s*:\s*true/.test(wranglerRaw))
		problems.push(
			'wrangler: upload_source_maps not enabled — production stack traces stay minified (ADR-0009)',
		)
	try {
		const jsonc = wranglerRaw
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '')
			.replace(/,(\s*[}\]])/g, '$1')
		const w = JSON.parse(jsonc)
		for (const [envName, env] of Object.entries(w.env ?? {})) {
			if (env.compatibility_date)
				problems.push(
					`wrangler env.${envName}: compatibility_date must be top-level only — environments inherit it`,
				)
			const top = Object.keys(w.vars ?? {})
			const envVars = new Set(Object.keys(env.vars ?? {}))
			for (const k of top)
				if (!envVars.has(k))
					problems.push(
						`wrangler env.${envName}.vars is missing '${k}' — vars does NOT inherit; every var must be repeated per env or it silently vanishes there`,
					)
		}
	} catch {
		/* unparseable jsonc — the trap comments in the template still apply */
	}
}

if (problems.length) {
	console.error(`config-traps:\n  ${problems.join('\n  ')}`)
	process.exit(1)
}
console.log('config-traps: OK')
