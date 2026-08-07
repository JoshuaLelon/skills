#!/usr/bin/env node
// The decision tree, DERIVED. Every edge here is declared in an ADR's status
// block; nothing in this file is authored twice. Generate any fact that lives
// in exactly one other place — the same rule docs-index follows for llms.txt.
//
// Three consumers, one parse:
//   1. GENERATE  docs/reference/adr-graph.md — the tree, the prune sets, the
//      supersession notes. `--check` fails if the committed copy is stale.
//   2. GATE      an ADR naming a rule/script that does not exist; an edge
//      pointing at a missing ADR; a cycle; a numbering gap or duplicate.
//      Confabulated enforcement is the failure this docs system was built to
//      catch — "sections titled Enforced over machinery that never existed".
//   3. REPORT    level inversions (a doc resting BELOW its own level) and rules
//      no ADR claims. Reports, not gates, per the graduation rule: a mechanism
//      earns an exit code only after it catches drift a human confirms mattered.
//      An earlier check-levels inferred edges and produced 79 false positives;
//      this one reads declared edges, so there is nothing to guess.
//   4. GENERATE  AGENTS.md §2 (divergences) and §3 (the rule index) — see the
//      catalog below for why the index is derived rather than written.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
// Validation only — no generate, no staleness compare. What verify-gates plants
// against, so a mutation can prove the gate fires without dirtying the tree.
const VALIDATE = process.argv.includes('--validate')
const OUT = 'docs/reference/adr-graph.md'
const DECISIONS = 'docs/decisions'

// -- parse -------------------------------------------------------------------
const field = (text, name) =>
	text
		.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^\\n]+(?:\\n>\\s+(?!\\*\\*)[^\\n]+)*)`))?.[1]
		?.replace(/\n>\s+/g, ' ')
		.trim()

const list = (v) =>
	!v || v === '—'
		? []
		: v
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s && s !== '—')

const adrs = []
for (const f of readdirSync(join(ROOT, DECISIONS)).sort()) {
	const n = f.match(/^(\d{4})-.+\.md$/)?.[1]
	if (!n) continue
	const text = readFileSync(join(ROOT, DECISIONS, f), 'utf8')
	adrs.push({
		n,
		file: f,
		title: (text.match(/^#\s+(.+)$/m)?.[1] ?? f).replace(/^ADR-\d{4}\s*—\s*/, ''),
		level: field(text, 'Level')?.match(/^(\d)/)?.[1] ?? '?',
		constrainedBy: list(field(text, 'Constrained by')),
		enforcedBy: list(field(text, 'Enforced by')).filter((e) => !/^none\b/i.test(e)),
		judgement: /^none\b/i.test(field(text, 'Enforced by') ?? ''),
		declaredAxes: list(field(text, 'Applies to')),
		supersedes: list(field(text, 'Supersedes')),
	})
}
const byNum = new Map(adrs.map((a) => [a.n, a]))

// -- axes, DERIVED -----------------------------------------------------------
// `Applies to:` was hand-declared on every ADR and promptly contradicted itself:
// ADR-0004 claimed `any` while resting on ADR-0001, which dies with Cloudflare.
// Six such pairs. Two fields that must agree, maintained by hand, is the exact
// shape this repo mechanizes away everywhere else.
//
// A ROOT introduces its axes. Everything else INHERITS the union of its parents
// and may only NARROW — Drizzle rests on the Neon half of ADR-0001 and does not
// die with Cloudflare, so it says so, and widening is a gate failure. Prune sets
// are computed from the result, which is the one thing they must get right:
// inheriting too much would delete an ADR that should merely be re-examined.
const axesOf = (a, seen = new Set()) => {
	if (a.axes) return a.axes
	if (seen.has(a.n)) {
		a.axes = new Set(a.declaredAxes)
		return a.axes
	}
	seen.add(a.n)
	const parents = a.constrainedBy.filter((c) => /^\d{4}$/.test(c)).map((c) => byNum.get(c))
	if (!parents.length) {
		a.axes = new Set(a.declaredAxes.length ? a.declaredAxes : ['any'])
		return a.axes
	}
	a.inherited = new Set(parents.flatMap((p) => (p ? [...axesOf(p, seen)] : [])))
	a.axes = a.declaredAxes.length ? new Set(a.declaredAxes) : a.inherited
	return a.axes
}
for (const a of adrs) axesOf(a)

// Level docs above the ADRs. Absent in the template — they arrive from the
// prototype at port time (port-from-prototype carries reference/design/plans),
// which is exactly why the two halves of this stack were never joined.
const UPPER = [
	['docs/reference/intent.md', 'L0 — intent'],
	['docs/reference/product-invariants.md', 'L1 — law'],
	['docs/design/object-model.md', 'L2 — behaviour'],
]

const problems = []

// -- the rule catalog --------------------------------------------------------
// Three sources, one list, each rule carrying its OWN words — ast-grep's
// `message:`, dependency-cruiser's `comment:`, gate.mjs's `msg:`. Nothing here
// is re-authored: the index says what the rule says, so it cannot describe a
// check that has since changed (it did, in the hand-written table this
// replaces). The third source is the reason this exists at all — gate.mjs's
// rules appeared in NO document and nothing could see them.
const norm = (id) => id.replace(/-(ts|tsx)$/, '')

// A folded YAML scalar (`message: >-`) or a plain one, unwrapped to a line.
const yamlScalar = (text, key) => {
	const m = text.match(
		new RegExp(`^${key}:[ \\t]*(?:([>|][-+]?)[ \\t]*\\n?)?(.*(?:\\n .*)*)$`, 'm'),
	)
	if (!m) return null
	const out = m[2]
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.join(' ')
	// Unquote a quoted plain scalar — but only when the quotes WRAP the value.
	// Stripping either end unconditionally ate the leading quote of
	// one-door-model's "'@anthropic-ai/sdk' is imported only by…".
	return /^(['"]).*\1$/s.test(out) ? out.slice(1, -1) : out
}

const astRules = new Map()
if (existsSync(join(ROOT, 'ast-grep/rules'))) {
	for (const f of readdirSync(join(ROOT, 'ast-grep/rules')).sort()) {
		const text = readFileSync(join(ROOT, 'ast-grep/rules', f), 'utf8')
		const id = text.match(/^id:\s*(.+)$/m)?.[1]?.trim()
		if (!id) continue
		// Twins (-ts/-tsx) are one rule in two grammars. The unsuffixed file wins
		// when both are present, so the index is stable whatever order the
		// directory is read in.
		if (!astRules.has(norm(id)) || id === norm(id))
			astRules.set(norm(id), yamlScalar(text, 'message') ?? '')
	}
}

const cruiserRules = new Map()
const cruiserPath = join(ROOT, '.dependency-cruiser.cjs')
if (existsSync(cruiserPath))
	// Only severity: error. A warn is a report, not a gate, and an index that
	// listed both would claim enforcement the build does not perform.
	for (const r of createRequire(import.meta.url)(cruiserPath).forbidden ?? [])
		if (r.severity === 'error') cruiserRules.set(r.name, r.comment ?? '')

// gate.mjs is READ, not imported: importing it runs the gate (it walks the tree
// and may exit). Ids and messages are paired positionally — every rule object
// declares `id` before `msg` — and a count mismatch is a hard failure rather
// than a short index, because a silently-truncated map is the failure mode this
// whole file exists to prevent.
const gateRules = new Map()
{
	const p = join(ROOT, 'scripts/gate.mjs')
	if (existsSync(p)) {
		const src = readFileSync(p, 'utf8')
		const ids = [...src.matchAll(/\bid:\s*(['"])(.+?)\1/g)].map((m) => m[2])
		const msgs = [...src.matchAll(/\bmsg:\s*(['"])(.+?)\1/g)].map((m) => m[2])
		if (!ids.length || ids.length !== msgs.length)
			problems.push(
				`scripts/gate.mjs: read ${ids.length} rule id(s) but ${msgs.length} message(s) — the rule index cannot read the gate, and a short index is worse than none. Keep each rule's \`id:\` and \`msg:\` as single-quoted single-line fields.`,
			)
		else for (const [i, id] of ids.entries()) gateRules.set(id, msgs[i])
	}
}

const pkgScripts = new Set(
	Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}),
)

const resolves = (ref) => {
	const [kind, ...rest] = ref.split(':')
	const id = rest.join(':')
	if (kind === 'ast-grep') return astRules.has(norm(id))
	if (kind === 'depcruise') return cruiserRules.has(id)
	if (kind === 'gate') return gateRules.has(id)
	// A repo script may be an npm entry or a file in scripts/ — db-push-guard is
	// the latter, invoked by another script rather than named in package.json.
	if (kind === 'script') return pkgScripts.has(id) || existsSync(join(ROOT, `scripts/${id}.mjs`))
	return false
}

// -- validate (GATE) ---------------------------------------------------------
const nums = adrs.map((a) => Number(a.n))
for (let i = 1; i < nums.length; i++) {
	if (nums[i] === nums[i - 1]) problems.push(`duplicate ADR number ${adrs[i].n}`)
	else if (nums[i] !== nums[i - 1] + 1)
		problems.push(
			`ADR numbering gap between ${adrs[i - 1].n} and ${adrs[i].n} — numbers are never reused, so a gap means a deleted file`,
		)
}
for (const a of adrs) {
	for (const c of a.constrainedBy)
		if (/^\d{4}$/.test(c) ? !byNum.has(c) : !existsSync(join(ROOT, c)))
			problems.push(`${a.file}: Constrained by '${c}' does not resolve`)
	for (const s of a.supersedes)
		if (!byNum.has(s.split('#')[0])) problems.push(`${a.file}: Supersedes '${s}' does not resolve`)
	for (const e of a.enforcedBy)
		if (!resolves(e))
			problems.push(`${a.file}: Enforced by '${e}' names no rule or script that exists`)
	if (!a.enforcedBy.length && !a.judgement)
		problems.push(`${a.file}: no **Enforced by:** — state a rule id or 'none — judgement'`)
	if (a.inherited && a.declaredAxes.length) {
		const wider = a.declaredAxes.filter((ax) => !a.inherited.has(ax) && !a.inherited.has('any'))
		if (wider.length)
			problems.push(
				`${a.file}: **Applies to:** claims [${wider}], which no ADR it rests on carries [${[...a.inherited]}] — an ADR cannot outlive what constrains it. Narrow it, or drop the edge that is a citation rather than a constraint.`,
			)
	}
	if (!a.constrainedBy.length && !a.declaredAxes.length)
		problems.push(`${a.file}: a root ADR must declare **Applies to:** — it introduces its axes`)
}
// cycles
{
	const seen = new Map()
	const walk = (n, stack) => {
		if (stack.includes(n)) {
			problems.push(`cycle in Constrained by: ${[...stack, n].join(' → ')}`)
			return
		}
		if (seen.get(n)) return
		seen.set(n, true)
		for (const c of byNum.get(n)?.constrainedBy ?? []) if (/^\d{4}$/.test(c)) walk(c, [...stack, n])
	}
	for (const a of adrs) walk(a.n, [])
}

// -- report (no exit code) ---------------------------------------------------
// Level direction ("rest on things above, never below") guards DOC ROT in the
// intent → law → behaviour chain: a stable doc that depends on a volatile one
// rots when the volatile one changes. Between DECISIONS the relation is
// different — an architecture decision resting on a mechanism decision is a
// genuine dependency, not a coupling smell, and every one of the ten this
// reported was of that kind. Scoped to edges that leave decisions/, where the
// rule was designed to apply. (The one real content defect it surfaced —
// ADR-0010 mixing ownership doctrine with Drizzle column syntax — was fixed by
// splitting the ADR, not by relabelling it.)
const inversions = []
for (const a of adrs)
	for (const c of a.constrainedBy) {
		if (/^\d{4}$/.test(c)) continue
		const p = join(ROOT, DECISIONS, c)
		const up = existsSync(p) ? readFileSync(p, 'utf8') : null
		const lvl = up?.match(/\*\*Level:\*\*\s*(\d)/)?.[1]
		if (lvl && Number(lvl) > Number(a.level))
			inversions.push(`${a.file} (L${a.level}) rests on ${c} (L${lvl}) — below itself`)
	}
const claimed = new Set(
	adrs.flatMap((a) => a.enforcedBy.map((e) => e.split(':').slice(1).join(':'))),
)
const unclaimed = [
	...[...astRules.keys()].filter((r) => !claimed.has(r)).map((r) => `ast-grep:${r}`),
	...[...cruiserRules.keys()].filter((r) => !claimed.has(r)).map((r) => `depcruise:${r}`),
].sort()

// Reverse of `Enforced by:` — which ADR claims each rule. The forward direction
// is already a gate (an ADR naming a rule that does not exist fails); this is
// the same edge read the other way, so the index cannot credit an ADR that
// never claimed the rule.
const claimants = new Map()
for (const a of adrs)
	for (const e of a.enforcedBy) {
		const [kind, ...rest] = e.split(':')
		const key = `${kind}:${kind === 'ast-grep' ? norm(rest.join(':')) : rest.join(':')}`
		claimants.set(key, [...(claimants.get(key) ?? []), a.n])
	}

// -- generate ----------------------------------------------------------------
const axes = [...new Set(adrs.flatMap((a) => [...a.axes]))].sort()
const kids = (n) => adrs.filter((a) => a.constrainedBy.includes(n))

const tree = (a, depth, out, seen) => {
	if (seen.has(a.n)) return
	seen.add(a.n)
	out.push(`${'  '.repeat(depth)}- **ADR-${a.n}** (L${a.level}) — ${a.title}`)
	for (const k of kids(a.n)) tree(k, depth + 1, out, seen)
}

const lines = []
lines.push('# ADR graph', '')
lines.push(
	'> **Kind:** reference · **Status:** accepted · **Updated:** generated',
	'> **Level:** 3 — architecture',
	'> **Constrained by:** `../conventions/documentation.md`',
	"> **Scope:** the decision tree, derived from every ADR's status block. Do",
	'> not edit — run `npm run docs:adr-graph`. Edges live in the ADRs.',
	'',
)
lines.push(
	'Generated by `scripts/adr-graph.mjs` from the `Constrained by:` /',
	'`Enforced by:` / `Applies to:` / `Supersedes:` fields. A generated tree',
	'cannot go stale; removing the opportunity beats detecting the failure.',
	'',
)

lines.push('## The stability stack above these decisions', '')
for (const [p, label] of UPPER)
	lines.push(
		`- ${label} — \`${p}\` ${existsSync(join(ROOT, p)) ? '' : '*(absent: arrives from the prototype at port time)*'}`.trimEnd(),
	)
lines.push('')

lines.push('## Roots and what rests on them', '')
for (const a of adrs.filter((x) => !x.constrainedBy.length)) {
	const out = []
	tree(a, 0, out, new Set())
	lines.push(...out, '')
}

lines.push('## Prune sets — diverge from an axis, supersede its column', '')
lines.push(
	'Leaving an axis does not mean DELETING these files — numbers are never',
	'reused and adr-graph fails on a gap, so a deleted ADR is itself an error.',
	'It means superseding each one on the topic that carried the axis; the',
	'column then empties as the new ADRs take their place.',
	'',
)
lines.push('| axis | ADRs that die with it |', '| --- | --- |')
for (const ax of axes) {
	const hit = adrs.filter((a) => a.axes.has(ax)).map((a) => a.n)
	lines.push(`| \`${ax}\` | ${hit.length ? hit.map((n) => `ADR-${n}`).join(', ') : '—'} |`)
}
lines.push('')

const sup = adrs.filter((a) => a.supersedes.length)
if (sup.length) {
	lines.push('## Partial supersessions', '')
	lines.push(
		'The older ADR is never edited — its body is immutable. Read the newer one',
		'alongside it; these edges are why an untouched file is not the last word.',
		'',
	)
	lines.push('| older | topic superseded | by |', '| --- | --- | --- |')
	for (const a of sup)
		for (const s of a.supersedes) {
			const [n, topic] = s.split('#')
			lines.push(`| ADR-${n} | ${topic ?? '*(whole)*'} | ADR-${a.n} |`)
		}
	lines.push('')
}

lines.push('## Enforcement', '')
lines.push('| ADR | enforced by |', '| --- | --- |')
for (const a of adrs)
	lines.push(
		`| ADR-${a.n} | ${a.enforcedBy.length ? a.enforcedBy.map((e) => `\`${e}\``).join(', ') : '*judgement*'} |`,
	)
lines.push('')

const generated = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`

// -- AGENTS.md §2, derived ----------------------------------------------------
// A divergence from the seed IS a supersession edge; nothing else needs saying,
// and a hand-written table here was [FILL:] in every app that ever existed.
const divergenceBlock = () => {
	const rows = adrs
		.filter((a) => a.supersedes.length)
		.flatMap((a) =>
			a.supersedes.map((s) => {
				const [n, topic] = s.split('#')
				return `| ADR-${n}${topic ? ` (${topic})` : ''} | ADR-${a.n} — ${a.title} |`
			}),
		)
	return rows.length
		? ['| seed decision | replaced by |', '| --- | --- |', ...rows].join('\n')
		: '*No divergences yet — this app still runs the seed decisions as accepted.*'
}

// -- AGENTS.md §3, derived ----------------------------------------------------
// The map an agent reads BEFORE writing code: every rule that can fail a build,
// in the rule's own words, with the ADR that claims it. §3 was this table by
// hand once and drifted — three rules missing, every script gate missing, one
// row describing a check that had changed — so it was deleted and the reasoning
// left where each rule fires. That was right about the copy and wrong about the
// map: nothing then answered "what does this repo enforce". Generated, it
// cannot drift; the rule's full message still prints at the moment you break it.
const summarize = (msg) => {
	const t = msg.replace(/\s+/g, ' ').trim()
	// The rule author's first sentence, unless it is too short to say anything
	// on its own ("Role/name locators only.") — then keep going.
	for (const m of t.matchAll(/\.\s/g)) if (m.index >= 40) return t.slice(0, m.index + 1)
	return t
}
const cell = (s) => s.replaceAll('|', '\\|')

const rulesBlock = () => {
	const rows = [
		...[...astRules].map(([id, m]) => ['ast-grep', id, m]),
		...[...cruiserRules].map(([id, m]) => ['depcruise', id, m]),
		...[...gateRules].map(([id, m]) => ['gate', id, m]),
	]
	const counts = ['ast-grep', 'depcruise', 'gate']
		.map((t) => `${rows.filter((r) => r[0] === t).length} ${t}`)
		.join(', ')
	return [
		'Generated by adr-graph.mjs from the rules themselves — do not hand-edit.',
		`${rows.length} rules that FAIL a build: ${counts}. dependency-cruiser's`,
		'`warn` entries are reports, not gates, and are not listed. Each row is the',
		"rule's own message, shortened; the whole of it prints when the rule fires.",
		'',
		'| rule | forbids | tool | claimed by |',
		'| --- | --- | --- | --- |',
		...rows.map(
			([tool, id, msg]) =>
				`| \`${id}\` | ${cell(summarize(msg))} | ${tool} | ${(claimants.get(`${tool}:${id}`) ?? []).map((n) => `ADR-${n}`).join(', ') || '—'} |`,
		),
	].join('\n')
}

const AGENTS = 'AGENTS.md'
let agentsOut = null
{
	const blocks = [
		['divergences', divergenceBlock],
		['rules', rulesBlock],
	]
	if (existsSync(join(ROOT, AGENTS))) {
		let cur = readFileSync(join(ROOT, AGENTS), 'utf8')
		for (const [name, build] of blocks) {
			const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`)
			// A missing marker is not this script's failure to report: config-traps
			// asserts every marker exists, so a block with no home is caught there
			// rather than half-written here.
			if (!re.test(cur)) continue
			cur = cur.replace(re, `$1\n${build()}\n$2`)
			agentsOut = cur
		}
	}
}

// -- emit --------------------------------------------------------------------
if (problems.length) {
	console.error(`adr-graph:\n  ${[...new Set(problems)].join('\n  ')}`)
	process.exit(1)
}
if (inversions.length)
	console.log(
		`adr-graph: ${inversions.length} level inversion(s) — report only:\n  ${inversions.join('\n  ')}`,
	)
if (unclaimed.length)
	console.log(
		`adr-graph: ${unclaimed.length} rule(s) no ADR claims — report only:\n  ${unclaimed.join(', ')}`,
	)

if (VALIDATE) {
	console.log(`adr-graph: ${adrs.length} ADRs, edges and enforcement all resolve`)
} else if (CHECK) {
	const current = existsSync(join(ROOT, OUT)) ? readFileSync(join(ROOT, OUT), 'utf8') : ''
	if (current !== generated) {
		console.error(`adr-graph: ${OUT} is stale — run: node scripts/adr-graph.mjs`)
		process.exit(1)
	}
	if (agentsOut && agentsOut !== readFileSync(join(ROOT, AGENTS), 'utf8')) {
		console.error(
			`adr-graph: ${AGENTS} is stale (§2 divergences / §3 rule index) — run: node scripts/adr-graph.mjs`,
		)
		process.exit(1)
	}
	console.log('adr-graph: OK')
} else {
	writeFileSync(join(ROOT, OUT), generated)
	if (agentsOut) writeFileSync(join(ROOT, AGENTS), agentsOut)
	console.log(
		`adr-graph: wrote ${OUT}${agentsOut ? ` and ${AGENTS} §2–§3 (${astRules.size + cruiserRules.size + gateRules.size} rules indexed)` : ''}`,
	)
}
