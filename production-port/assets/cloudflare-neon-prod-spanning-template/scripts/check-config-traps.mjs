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

// 1b. Playwright must never adopt a stray dev server. `reuseExistingServer`
// truthy means "if something is on this port, test that" — and 5173 is the Vite
// default, so it is routinely another project. The suite then grades the wrong
// app and reports its failures as yours.
{
	const f = 'playwright.config.ts'
	const src = read(f)
	if (src && !/reuseExistingServer:\s*false/.test(src))
		problems.push(
			`${f}: reuseExistingServer must be literal false — otherwise e2e silently grades whatever already listens on the port (5173 is the Vite default; it is usually another project)`,
		)
}

// 1c. AGENTS.md's generated sections need their markers, or the generators
// write nowhere and the file silently reverts to the [FILL:] state that three
// separate agents reported as useless.
{
	const src = read('AGENTS.md')
	if (src) {
		for (const m of ['stack-index', 'divergences', 'rules'])
			if (!src.includes(`<!-- ${m}:start -->`))
				problems.push(
					`AGENTS.md: no <!-- ${m}:start --> marker — its generator has nowhere to write (export-stack.mjs / adr-graph.mjs)`,
				)
	}
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

// 1d. A `check:*` script that nothing runs is a gate that does not exist. The
// CHECKS list in check-runner is the only thing that makes one real, and adding
// a script without adding it there fails silently and permanently — the exact
// shape of every dead gate this repo has found. Generators and fixers are not
// checks; they are named, not inferred, so the exemption is a decision rather
// than a guess.
{
	const runner = read('scripts/check-runner.mjs') ?? ''
	const NOT_A_CHECK = new Set(['check:ci'])
	for (const name of Object.keys(scripts).filter((k) => k.startsWith('check:')))
		if (!NOT_A_CHECK.has(name) && !runner.includes(`'${name}'`))
			problems.push(
				`package.json has scripts.${name} but check-runner's CHECKS list does not — it would never run. Add it there, or rename it if it is a generator rather than a check.`,
			)
}
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
// 4b. The generated-but-committed Env type drifts silently (ADR-0016), and the
// startup budget only means anything if it measures a FRESH build — under the
// vite plugin `wrangler check startup` reads ./build rather than compiling
// source, so a check:startup that does not build first grades yesterday's
// bundle. Both gates are easy to quietly drop; this notices.
if (hasWrangler) {
	if (!scripts['types:check'])
		problems.push(
			'no scripts.types:check — worker-configuration.d.ts is generated but committed; without `wrangler types --check` the Env type can drift from wrangler.jsonc and tsc validates against a lie (ADR-0018)',
		)
	if (!scripts['check:startup'])
		problems.push(
			'no scripts.check:startup — nothing budgets bundle size or startup CPU; wiring one screen to a new dependency cost ~95 KiB gzip and no test failed (ADR-0017)',
		)
	else if (!/build/.test(scripts['check:startup']))
		problems.push(
			'scripts.check:startup does not build first — `wrangler check startup` measures ./build, not your source, so this grades a stale bundle (ADR-0017)',
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
// Every binding key wrangler treats as non-inheritable. Not exhaustive of the
// platform, but exhaustive of what a config here is likely to declare.
const BINDING_KEYS = [
	'hyperdrive',
	'kv_namespaces',
	'r2_buckets',
	'd1_databases',
	'durable_objects',
	'queues',
	'vectorize',
	'services',
	'workflows',
	'analytics_engine_datasets',
	'ai',
	'browser',
	'images',
	'ratelimits',
	'send_email',
	'mtls_certificates',
	'dispatch_namespaces',
	'pipelines',
	'secrets_store_secrets',
	'vpc_services',
]
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
	// Traces are the half of observability that shows WHERE the time went;
	// logs alone answer "what happened", never "what was slow". Opting out is
	// allowed — say so explicitly with "traces": { "enabled": false } — but
	// omitting the key entirely is how you find out you had no traces during
	// the incident that needed them (ADR-0016).
	if (!/"traces"/.test(wranglerRaw))
		problems.push(
			'wrangler: observability has no "traces" key — decide it explicitly ({"enabled": true} or {"enabled": false}); spans are billed per event once the free period ends, so silence here becomes either a blind incident or a surprise bill — current figures in docs/reference/cloudflare-primitives.md (ADR-0016)',
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
			// BINDINGS do not inherit either — the same trap as vars, one level
			// up, and worse: a missing binding is not a missing string, it is a
			// missing capability. Verified by building both envs and diffing the
			// generated config: a top-level hyperdrive block flattens to [] under
			// env.demo, so the demo Worker silently runs a DIFFERENT data path
			// than production. observability/upload_source_maps/compatibility_date
			// DO inherit — only bindings and vars need repeating.
			for (const k of BINDING_KEYS)
				if (w[k] !== undefined && env[k] === undefined)
					problems.push(
						`wrangler env.${envName} is missing the '${k}' binding — bindings do NOT inherit; it flattens to empty there, so this environment runs a different code path than production (environments.md)`,
					)
		}
	} catch {
		/* unparseable jsonc — the trap comments in the template still apply */
	}
}

// 7. Template-identity sentinels — the mechanical "what must be replaced"
// checklist for apps started from the spanning template. rename-app.mjs
// clears every one of these; a survivor means it was skipped.
const SENTINELS = [
	[
		'package.json',
		'"name": "cloudflare-neon-prod-spanning-template"',
		'package.json still carries the template name — run: node scripts/rename-app.mjs <app>',
	],
	[
		'wrangler.jsonc',
		'"spanning-template"',
		"wrangler still names the TEMPLATE's worker — deploying would overwrite the reference deployment (rename-app.mjs)",
	],
	[
		'wrangler.jsonc',
		'0ac30af414fe476c93a4c24b54f951c4',
		"wrangler still carries the template's own Hyperdrive id — create your own (environments.md)",
	],
	[
		'llms.txt',
		'# cloudflare-neon-prod-spanning-template',
		'llms.txt head still describes the template (rename-app.mjs, then docs:index)',
	],
]
// Skipped only in the template's own home (the skills repo) — everywhere
// else a surviving sentinel means rename-app.mjs was skipped.
const IS_TEMPLATE_HOME = process
	.cwd()
	.includes('skills/production-port/assets/cloudflare-neon-prod-spanning-template')
if (!IS_TEMPLATE_HOME) {
	for (const [file, needle, msg] of SENTINELS) {
		if (read(file)?.includes(needle)) problems.push(msg)
	}
}

// 4c. ADR-0021: the integration tier declares its runtime, and that runtime is
// workerd running ./build — not Node. The failure mode is silent and it already
// happened once: the config said `environment: 'node'`, the tests imported
// loaders and the query module straight into the Node process, and the tier
// reported coverage of "the server" it did not have. Two halves, both easy to
// drop by accident:
//   - the tier must START the built Worker (createTestHarness), and
//   - the script must BUILD first, or it starts yesterday's bundle — the same
//     stale-artifact trap as check:startup, one tier over.
const intConfig = readdirSync(ROOT).find((f) => /^vitest\.integration\.config\./.test(f))
if (intConfig) {
	let intFiles = []
	try {
		intFiles = readdirSync(join(ROOT, 'integration'), { recursive: true })
	} catch {
		/* no integration/ dir */
	}
	const wiring = intFiles
		.filter((f) => /\.(m?[jt]s|tsx)$/.test(f))
		.map((f) => read(join('integration', f)) ?? '')
		.join('\n')
	if (!/createTestHarness\s*\(/.test(wiring))
		problems.push(
			`${intConfig} exists but nothing under integration/ calls createTestHarness() — the integration tier must run the app in WORKERD against ./build (ADR-0021); importing loaders into the Node process tests the server in a runtime it never runs in`,
		)
	if (!scripts['test:int'])
		problems.push(
			`no scripts.test:int — ${intConfig} exists but nothing runs it, so the tier is decoration (ADR-0021)`,
		)
	else if (!/build/.test(scripts['test:int']))
		problems.push(
			'scripts.test:int does not build first — the integration tier starts ./build in workerd, so this grades a stale bundle (ADR-0021, ADR-0017)',
		)
}

if (problems.length) {
	console.error(`config-traps:\n  ${problems.join('\n  ')}`)
	process.exit(1)
}
console.log('config-traps: OK')
