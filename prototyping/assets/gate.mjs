#!/usr/bin/env node
// The prototyping gate. Zero dependencies — node walks src/ and e2e/ and fails
// on violations of the standards in the prototyping skill.
//
// ONE LOGICAL FILE, THREE HOMES. The canonical copies live at
// `prototyping/assets/gate.mjs` and
// `production-port/assets/cloudflare-neon-prod-spanning-template/scripts/gate.mjs`,
// and they must stay BYTE-IDENTICAL — a prototype and its port enforce the same
// standards or the port is not a port. A scaffolded app gets a third copy; do
// not hand-edit rules there. Improve BOTH skill copies instead, so every
// prototype and every port inherits the fix.
//
// Every rule here owes a control in the template's `scripts/verify-gates.mjs`:
// a planted violation proving it fires, and — for any rule that could fire on
// correct code — a planted valid input proving it stays silent. A rule that
// cannot fail is decoration; a rule that fires on correct code gets a
// `gate:allow` and dies.
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

// Registry components arrive from `npx shadcn add` and the app MUST NOT edit
// them — the next `add` overwrites the directory. Several of them set a CSS
// custom property inline (`style={{ '--gap': spacing }}`), which is the only
// way to pass one, so the rule as written asks for an edit the app is not
// allowed to make. Same argument that produced the harness exemption above.
//
// THE EXEMPTION IS THIS NARROW ON PURPOSE: it covers code you did not write and
// may not change, and stops at the directory boundary. Your wrapper in
// `src/components/` is yours, so it obeys the rule — and the wrap is mandatory
// anyway (`raw-registry-import`). `SIZE_RULES` already gives this directory its
// own `registry primitive` tier for the same reason; the two now agree.
const REGISTRY = /^src\/components\/ui\//

const LINE_RULES = [
	{
		id: 'inline-style',
		where: /^src\/.*\.(tsx|jsx|html)$/,
		unless: new RegExp(`${HARNESS.source}|${REGISTRY.source}`),
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
		valueImportsOnly: true,
		where: /^src\/(components|screens)\//,
		re: /from\s+["'][^"']*fixtures\/entities/,
		msg: 'the view reads data through accessors, never the fixture; the accessor becomes the loader (skill: fixture rules)',
	},
	{
		// `when` narrows a line rule by a whole-file property. It is needed here
		// because the standard is about reducer CASES, and no line regex can tell
		// that a `TASKS.find(...)` six hundred lines down sits inside one. The
		// import is the checkable proxy: a case can only read a fixture its own
		// file pulled into scope.
		id: 'fixture-in-reducer',
		valueImportsOnly: true,
		where: /^src\/store\//,
		when: (text) => /^\s*case\s+["']/m.test(text),
		re: /^(?!.*\bimport\s+type\b).*from\s+["'][^"']*fixtures\/entities/,
		msg: 'a file holding reducer cases may not have fixture ROWS in scope — a case reading one reads outside its arguments, and nothing else catches it: impure-store looks for clocks and the DOM, and replay equality cannot see it because the fixture is constant within a run. Seed in a module with no cases (freshState in store/state.ts) and pass everything else in the action (skill: store rules)',
	},
	{
		id: 'script-import',
		where: /^src\//,
		unless: /^src\/walkthrough\.tsx$/,
		re: /from\s+["'][^"']*fixtures\/script/,
		msg: 'only the walkthrough may import fixtures/script — strip-harness.mjs DELETES that directory, so product code importing it stops compiling at the port; a stand-in for a call production will make belongs in fixtures/model/ (skill: fixture rules)',
	},
	{
		// THE SEAM ITSELF, not the provider behind it.
		//
		// `ast-grep:one-door-model` refuses an import of the model SDK outside
		// `src/lib/ai/**`, and that is a real rule — it stops provider DTOs and
		// stop-reasons leaking into features. But it tests PROVIDER LEAKAGE, and
		// door usage is a different claim: `fixtures/model/` imports no SDK, so a
		// screen can call the stand-in directly, resolve in the browser, never
		// cross the door and never reach a server, with that rule green the whole
		// time. Measured on one app at the port: twelve capabilities, one caller
		// through the door, and the docs read as though the door was live.
		//
		// The skill already states this rule in prose — "the only VALUE imports of
		// `fixtures/model/` are in the registerFx handlers" — and a standard held
		// in prose is the state that produced every failure verify-gates exists
		// for. So it is a rule now.
		id: 'model-door',
		valueImportsOnly: true,
		where: /^src\//,
		// The handler layer is named by WHAT IT DOES, not by where it sits: a file
		// that registers an fx handler IS where a call belongs, whether the app
		// calls it `fx.ts`, `effects.ts` or something else. Naming a path here
		// instead would point the exemption at a file most apps do not have —
		// which is exactly how `script-import` above ends up enforcing nothing
		// once `src/walkthrough.tsx` is stripped.
		when: (text) => !/\bregisterFx\s*\(/.test(text),
		// `fixtures/` may reach its own stand-ins. `lib/ai/` is the production
		// door and may hold the fallback the stand-in becomes. A TEST MAY IMPORT
		// THE STAND-IN — it is frequently the thing under test, and a rule about
		// what SHIPS has nothing to say about a file that does not.
		unless: /^src\/(fixtures\/|lib\/ai\/)|\.test\.tsx?$/,
		// A VALUE import only — `import type` is erased and carries no call, the
		// same distinction `fixture-in-reducer` above draws. `valueImportsOnly`
		// extends that across a MULTI-LINE type import; see typeImportLines below.
		re: /^(?!.*\bimport\s+type\b).*from\s+["'][^"']*fixtures\/model\//,
		msg: 'a model capability is reached through the fx handler that stands in for the real call, never from a screen, a component or a reducer — fixtures/model/ is a stand-in for a call production WILL make, so a value import outside the handler ships the stand-in and the port has to rewrite the call site instead of the body. Type imports stay anywhere: they are erased, and the types ARE the call contract (skill: fixture rules)',
	},
	{
		id: 'wall-clock-in-view',
		where: /^src\/(screens|components)\//,
		re: /(Date\.now\(|new Date\(\s*\))/,
		msg: 'the view reads `now` from state, never the wall clock — anything time-dependent is a pure function of (state, now) or it can only be seen at this moment (skill: store rules). `new Date(iso)` for formatting is fine',
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
		// The slug half has two separators, and each has exactly one meaning: a
		// hyphen joins words inside one level (`assess-proof`), a dot separates
		// levels (`retain.assess-proof` is two levels, the second of two words).
		// Admitting the dot does not loosen the rule, because the dot is admitted
		// only where it means something: a leading dot, a trailing dot and a
		// doubled dot all fail. Be exact about what did NOT change —
		// `retain-assess-proof` still passes, and no reader and no program can
		// split it back into its levels. The regex cannot tell a one-level slug
		// from a flattened one, and it never could. What the dot adds is the
		// ability to SAY levels at all; use it, and the ambiguity survives only
		// where nobody needed levels. The dots cross the port unedited —
		// production's key is (owner, ref), a text column, and a URL segment
		// takes a dot.
		id: 'bad-ref-format',
		where: /^src\/fixtures\/entities\//,
		re: /\bref:\s*["'](?![a-z0-9_]+:[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*["'])/,
		msg: "refs are type:<slug>, where the slug joins words with a hyphen and separates levels with a dot (`prompt:retain.assess-proof`); minted once, never derived from the title — the field is `ref` because it becomes production's (owner, ref) key (skill: conventions)",
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
// Tag rules: an opening tag must carry an attribute.
// ---------------------------------------------------------------------------
// A line rule cannot express this. A JSX opening tag routinely spans several
// lines, and a per-line regex would read only the line the tag starts on and
// pass every tag whose attributes wrapped. So these scan the whole file and
// slice each tag from `<` to its first `>`. That slice ends early if an
// attribute value contains a bare `>` — the failure direction is a false
// positive, which `gate:allow` answers, never a rule that silently passes.
const TAG_RULES = [
	{
		id: 'unnamed-region',
		where: /^src\/.*\.tsx$/,
		unless: HARNESS,
		tag: /<(section|form)\b/g,
		attr: /\saria-label(ledby)?[=\s]/,
		msg: '<section> and <form> get their landmark role ONLY from an accessible name; without one the element is not a region — invisible to a screen reader AND unaddressable by getByRole("region", { name }), which fails a flow test long after the design decided the part was addressable (skill: address by role and name)',
	},
]

// Returns the 0-based line index of every offending tag. Scans CODE ONLY: this
// codebase explains itself in comments, so `<section>` appears in prose about
// naming sections far more often than a real unnamed one does — the first run of
// this rule flagged the JSDoc that documents the fix. Line rules keep matching
// comments (an accent leak in a comment is still worth seeing); a tag rule
// cannot, because it asserts something about markup that is not there.
function tagOffences(text, rule) {
	const out = []
	const code = maskComments(text)
	for (const m of code.matchAll(rule.tag)) {
		const close = code.indexOf('>', m.index)
		const open = code.slice(m.index, close === -1 ? code.length : close)
		if (!rule.attr.test(open)) out.push(code.slice(0, m.index).split('\n').length - 1)
	}
	return out
}

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
// Cross-file rule: every effect a case NAMES must have a handler.
// ---------------------------------------------------------------------------
// The one rule here that cannot be a line rule, because the fact it checks spans
// two files: `{ fx: 'compose' }` is written in a reducer case, and
// `registerFx('compose', …)` is written beside the call it makes. So both halves
// are collected over the whole tree and compared once the walk is done — the
// same shape the trip-wires use.
//
// THE HOST ALREADY THROWS ON THIS IN DEV, AND THAT HAS NOT BEEN ENOUGH. The
// throw needs the dispatch to be REACHED, so an effect on a path nobody has
// walked is invisible to it — and that is exactly where these land. The evidence
// case shipped SEVEN, each one a button that dispatches correctly, reduces
// correctly, and does nothing: invisible to the gate, to replay equality, and to
// every assertion about state, because the state is right. The two checks are
// the same fact at different times, and only this one fires before somebody
// builds a screen on top of the hole.
//
// IT READS STRING LITERALS ON BOTH SIDES, so a computed name (`fx: kind`) is not
// seen at all. That is the safe direction: this rule can miss, never misfire.
// Registration ANYWHERE under `src/` counts, inside a function included — when
// handlers are installed is the app's decision, and a gate that demanded
// top-level calls would be legislating it.
const FX_DECLARED = /\bfx:\s*['"]([\w.-]+)['"]/g
const FX_REGISTERED = /\bregisterFx\(\s*['"]([\w.-]+)['"]/g
const fxDeclared = []
const fxRegistered = new Set()

// ---------------------------------------------------------------------------
// Size rules: how large a file may get, in CODE lines.
// ---------------------------------------------------------------------------
// Comments and blank lines DO NOT COUNT. That is the whole design of the rule.
// A prototype's long explanatory comment is the cheapest thing in the repo and
// the first thing a size limit would kill — you would watch people delete the
// "why" to make the number go down. So the limit measures only what costs money
// to read and to port: the code. Real files here run 25–55% comment; a
// total-lines limit would be a limit on writing things down.
//
// Limits are per directory because a reducer and a primitive have different
// natural sizes. First match wins, so the specific patterns come first.
//
// Two tiers, because a file crosses a size threshold gradually: `warn` prints
// and still passes (the tripwire that gets a file split while splitting is
// still cheap), `max` fails. The escape hatch is the usual one — put
// `gate:allow file-size` anywhere in a file that is deliberately large.
const SIZE_EXEMPT = /^src\/(walkthrough|states|host)\.tsx$/ // skill-owned; fix upstream

const SIZE_RULES = [
	{ where: /^src\/components\/ui\//, what: 'registry primitive', warn: 250, max: 400 },
	{ where: /^src\/components\//, what: 'primitive', warn: 150, max: 220 },
	{ where: /^src\/screens\//, what: 'screen', warn: 200, max: 300 },
	{ where: /^src\/store\//, what: 'store slice', warn: 220, max: 320 },
	{ where: /^src\/fixtures\//, what: 'fixture', warn: 300, max: 450 },
	{ where: /^e2e\//, what: 'flow test', warn: 100, max: 160 },
	{ where: /\.css$/, what: 'stylesheet', warn: 350, max: 500 },
	{ where: /^src\//, what: 'module', warn: 150, max: 250 },
]

// Deliberately not a tokenizer. A line counts as non-code only when it *starts*
// a comment, so a string or a regex that merely contains `//` or `/*` can never
// be mistaken for one. That is the safe direction: the count can drift high,
// never silently low. `{/*` is here because JSX comments are the ones this
// codebase writes most, and missing them turned an 11-line file into 58.
// True for every line that is blank or comment-only. Used twice: to count code
// lines, and to blank comments out before a tag rule reads the markup.
function commentLines(text) {
	const out = []
	let inBlock = false
	for (const raw of text.split('\n')) {
		const t = raw.trim()
		if (inBlock) {
			out.push(true)
			if (t.includes('*/')) inBlock = false
			continue
		}
		if (t === '' || t.startsWith('//')) {
			out.push(true)
			continue
		}
		if (t.startsWith('/*') || t.startsWith('{/*')) {
			out.push(true)
			if (!t.includes('*/')) inBlock = true
			continue
		}
		out.push(false)
	}
	return out
}

const codeLines = (text) => commentLines(text).filter((c) => !c).length

// Same text, same line numbering, comment lines emptied.
function maskComments(text) {
	const mask = commentLines(text)
	return text
		.split('\n')
		.map((line, i) => (mask[i] ? '' : line))
		.join('\n')
}

// ---------------------------------------------------------------------------
// Complexity trip-wires: whole-tree signals. WARNINGS ONLY, always.
// ---------------------------------------------------------------------------
// Each says "this shape has outgrown the arrangement you built it in", and each
// names the move that answers it.
//
// THEY NEVER FAIL, deliberately. A threshold that can fail becomes a number to
// game, and shaving one state field to get under a line is exactly the behaviour
// these exist to catch. They are silent on a fresh scaffold and start firing as
// the prototype grows — a trip-wire calibrated to pass the repository it was
// written in teaches nothing.
//
// EVERY ROW CARRIES WHAT IT IS A PROXY FOR, and the warning prints it. That line
// is the one that stops the failure mode these are most likely to cause: a row
// whose advice has been taken IN FULL, and whose number then goes the wrong way.
// Measured — the store row said "this logic needs a tier that is not the
// browser", the tier was built, it found a real bug in its first minute, and the
// count rose from 2,162 to 2,329 because the features that landed next added
// code. A reader with only the number would conclude nothing had happened. A
// reader with the proxy can ask "is that logic checked outside the browser now?"
// and answer yes. The `state fields` row moved twice, in both directions, for
// two unrelated reasons, and neither move was the point.
const TRIPS = {
	screens: {
		warn: 7,
		proxy: 'how many places a user has to learn',
		does: 'design the information architecture before adding the eighth',
	},
	entities: {
		warn: 12,
		proxy: 'whether this is still a fixture or already a schema',
		does: "write the seeder's column list, and check `owner` is on every row",
	},
	'locked flows': {
		warn: 20,
		proxy: 'how long a full run costs before people stop running it',
		does: 'turn on fullyParallel, and let the unit tier carry the combinatorics',
	},
	'State fields': {
		warn: 35,
		proxy: 'how many independent things one shape claims to hold',
		does: 'split the store, and look for booleans that are one union',
	},
	'store code lines': {
		warn: 1200,
		proxy: 'how much pure logic only a browser suite ever checks',
		does: 'run a unit tier over the store (vitest.config.ts)',
	},
	'acts before the first assertion, in one test': {
		warn: 5,
		proxy: 'how much of a test is arriving rather than asserting',
		does: 'name that starting state as a world and open() it (skill: store rules)',
	},
}

const counts = Object.fromEntries(Object.keys(TRIPS).map((k) => [k, 0]))

// Fields declared DIRECTLY on `interface State` — brace-aware, so a nested
// shape counts as the one field it is. Reads masked text, so a field named in a
// comment is not one.
function stateFields(code) {
	const m = /interface\s+State\s*\{/.exec(code)
	if (!m) return 0
	let depth = 0
	let n = 0
	for (const line of code.slice(m.index + m[0].length - 1).split('\n')) {
		const before = depth
		for (const ch of line) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
		if (before === 1 && /^\s*(readonly\s+)?[A-Za-z_$][\w$]*\??\s*:/.test(line)) n++
		if (before > 0 && depth <= 0) break
	}
	return n
}

// Acts inside one test, before that test's first assertion.
//
// `goto` and `open` are NOT acts. Every test navigates, so counting the
// navigation adds one to every number and moves the threshold instead of
// measuring anything — and it is the step a world ABSORBS, so counting it would
// make this row argue against the fix it recommends.
const ACT =
	/\.(click|dblclick|fill|press|type|check|uncheck|selectOption|setInputFiles|hover|dragTo|focus)\(|page\.(mouse|keyboard)\.\w+\(/g

function mostActs(code) {
	let most = 0
	for (const block of code.split(/\btest\s*\(/).slice(1)) {
		const head = block.split(/\bexpect\s*\(/)[0]
		most = Math.max(most, (head.match(ACT) || []).length)
	}
	return most
}

// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'.git',
	'test-results',
	'playwright-report',
	'_port',
])

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

/**
 * Every line index covered by an `import type … from …`, MULTI-LINE INCLUDED.
 *
 * The rules above match one line at a time, so a type import spread over six
 * lines shows the matcher only its `} from '…'` tail — with the `type` keyword
 * five lines up, out of view. Every import-shaped rule here writes
 * `^(?!.*\bimport\s+type\b)` to mean "value imports only", and every one of
 * them was therefore reporting multi-line type imports as violations.
 *
 * Found by planting a control for `model-door`: it flagged two innocent files
 * that import types across several lines and import no value at all.
 * `fixture-in-reducer` and `seam-leak` have the same hole and had simply never
 * met a multi-line type import in a file they watch.
 *
 * A false positive is worse here than a miss: it teaches people the gate is
 * noise, and `gate:allow` then gets used to silence correct rules.
 */
const typeImportLines = (text) => {
	const out = new Set()
	const re = /^[ \t]*import\s+type\b[\s\S]*?from\s+["'][^"']*["']/gm
	for (const m of text.matchAll(re)) {
		const first = text.slice(0, m.index).split('\n').length - 1
		for (let k = 0; k < m[0].split('\n').length; k++) out.add(first + k)
	}
	return out
}

const violations = []
const warnings = []
let checked = 0

for (const top of ['src', 'e2e']) {
	for (const file of walk(top)) {
		if (!/\.(ts|tsx|js|jsx|html|css)$/.test(file)) continue
		checked++
		const text = readFileSync(join(ROOT, file), 'utf8')
		const lines = text.split('\n')
		const typeLines = typeImportLines(text)

		for (const rule of LINE_RULES) {
			if (!rule.where.test(file)) continue
			if (rule.unless?.test(file)) continue
			if (rule.when && !rule.when(text)) continue
			lines.forEach((line, i) => {
				// A rule that says "value imports only" means it across the whole
				// statement, not just the line its `from` happens to land on.
				if (rule.valueImportsOnly && typeLines.has(i)) return
				if (rule.re.test(line) && !allowed(rule.id, lines, i))
					violations.push(`${file}:${i + 1}  [${rule.id}] ${rule.msg}`)
			})
		}
		for (const rule of TAG_RULES) {
			if (!rule.where.test(file)) continue
			if (rule.unless?.test(file)) continue
			for (const i of tagOffences(text, rule)) {
				if (!allowed(rule.id, lines, i))
					violations.push(`${file}:${i + 1}  [${rule.id}] ${rule.msg}`)
			}
		}
		for (const rule of FILE_RULES) {
			if (!rule.where.test(file)) continue
			if (rule.check(text) && !text.includes(`gate:allow ${rule.id}`))
				violations.push(`${file}:1  [${rule.id}] ${rule.msg}`)
		}

		// `unregistered-fx`, first half: COLLECT. The comparison waits until the
		// whole tree has been read, because the handler for an effect named here
		// lives in a file the walk may not have reached yet.
		{
			const code = maskComments(text)
			if (/^src\/store\//.test(file))
				code.split('\n').forEach((line, i) => {
					for (const m of line.matchAll(FX_DECLARED))
						if (!allowed('unregistered-fx', lines, i))
							fxDeclared.push({ file, at: i + 1, name: m[1] })
				})
			if (/^src\//.test(file)) for (const m of code.matchAll(FX_REGISTERED)) fxRegistered.add(m[1])
		}

		// Trip-wire tallies. Unit tests are excluded from the store's line count:
		// the signal is how much LOGIC has to be checked, not how much checking
		// there is.
		if (/^src\/screens\/[^/]+\.tsx$/.test(file)) counts.screens++
		if (/^src\/fixtures\/entities\/[^/]+\.ts$/.test(file)) counts.entities++
		if (/^src\/store\//.test(file) && !/\.test\.tsx?$/.test(file)) {
			counts['store code lines'] += codeLines(text)
			counts['State fields'] = Math.max(counts['State fields'], stateFields(maskComments(text)))
		}
		if (/^e2e\/flows\//.test(file)) {
			const code = maskComments(text)
			counts['locked flows'] += (code.match(/\btest\s*\(/g) || []).length
			const acts = 'acts before the first assertion, in one test'
			counts[acts] = Math.max(counts[acts], mostActs(code))
		}

		if (!SIZE_EXEMPT.test(file) && !text.includes('gate:allow file-size')) {
			const rule = SIZE_RULES.find((r) => r.where.test(file))
			if (rule) {
				const n = codeLines(text)
				const over = (limit) =>
					`${file}:1  [file-size] ${n} code lines — a ${rule.what} is ${limit} ` +
					`(comments and blanks are free; split it, or add \`gate:allow file-size\`)`
				if (n > rule.max) violations.push(over(`capped at ${rule.max}`))
				else if (n > rule.warn) warnings.push(over(`meant to stay under ${rule.warn}`))
			}
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

// `unregistered-fx`, second half: COMPARE, now that both sides of the tree have
// been read. Named per SITE and not per effect — the same missing handler in
// three cases is three lines to go and look at, and the alternative is one line
// that makes you grep for the other two.
for (const d of fxDeclared) {
	if (fxRegistered.has(d.name)) continue
	violations.push(
		`${d.file}:${d.at}  [unregistered-fx] this case emits { fx: '${d.name}' } and nothing in src/ ` +
			`calls registerFx('${d.name}') — the state is right and the effect simply never happens, ` +
			'which is the one bug a reducer cannot show you. Register a handler beside the call it ' +
			'makes, or fix the name (skill: store rules)',
	)
}

// Warnings print either way — they are the early signal, so they must not be
// swallowed by a passing run or buried under a failing one.
if (warnings.length) {
	console.warn(warnings.sort().join('\n'))
	console.warn(`gate: ${warnings.length} warning(s) — not failures yet.\n`)
}

// Printed as their own block, after the file warnings, because they are about
// the tree and not about a line anyone can go and fix.
const tripped = Object.entries(TRIPS).filter(([id, t]) => counts[id] >= t.warn)
if (tripped.length) {
	for (const [id, t] of tripped) {
		console.warn(`gate: trip-wire — ${id}: ${counts[id]}, at or over ${t.warn}`)
		console.warn(`             a proxy for: ${t.proxy}`)
		console.warn(`             do: ${t.does}`)
	}
	console.warn(
		'READ THE ADVICE, NOT THE NUMBER. These never fail. A row whose advice is\n' +
			'already taken is satisfied however the number then moves — a store grows when\n' +
			'features land, and that is not a regression. Never shrink the measurement to\n' +
			'clear a row: that fixes the proxy and leaves the thing.\n',
	)
}

if (violations.length) {
	console.error(violations.sort().join('\n'))
	console.error(`\ngate: ${violations.length} violation(s) in ${checked} files.`)
	console.error('Intentional? Add a `gate:allow <rule-id>` comment on or above the line.')
	process.exit(1)
}
console.log(`gate: OK (${checked} files)`)
