#!/usr/bin/env node
// Co-change enforcement, minimal edition. Two structural triggers only — a
// hard rule with false positives gets disabled, and a disabled check is worse
// than none:
//   1. A doc added/deleted/renamed in the staged diff → llms.txt must be
//      staged too (regenerate with `node scripts/docs-index.mjs`).
//   2. Any staged code citing ADR-NNNN → docs/decisions/ must contain it.
// Runs off the staged diff: cheap, deterministic, pre-commit-friendly.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

// git reports paths from the REPO root, which is not always ROOT — the spanning
// template lives inside the skills repo, so every path arrives with a directory
// prefix and every readFileSync below silently misses. That masked bug is why
// this file's ADR check could ship broken: it reported OK here and failed on
// everything in a real app. Strip the prefix; drop paths outside our subtree.
const PREFIX = execSync('git rev-parse --show-prefix', { cwd: ROOT }).toString().trim()
const gitPaths = (filter, base = 'git diff --cached --name-only') =>
	execSync(`${base} ${filter}`, { cwd: ROOT })
		.toString()
		.split('\n')
		.filter(Boolean)
		.filter((p) => p.startsWith(PREFIX))
		.map((p) => p.slice(PREFIX.length))
		.filter(Boolean)

// WHICH FILES COUNT. As a pre-commit hook, staged-only is right: it grades the
// commit being made. As part of `npm run check` — the command the README tells
// you to verify with — staged-only is a hole you can drive a truck through: an
// unstaged ADR body rewrite, and a price smuggled into an immutable file, both
// returned OK. Default to staged PLUS working-tree changes; `--staged` restores
// hook semantics.
const STAGED_ONLY = process.argv.includes('--staged')
const worktree = (filter) => (STAGED_ONLY ? [] : gitPaths(filter, 'git diff --name-only'))

// UNTRACKED files count too. `git diff` lists neither them nor `--cached` does,
// so a commit that only ADDS documents — the shape of every new ADR — was graded
// against nothing: a brand-new ADR carrying a price passed clean. The honest
// "nothing was validated" line is what surfaced this, but a check that cannot
// see a new file is not a check on the work being done.
const untracked = () =>
	STAGED_ONLY ? [] : gitPaths('', 'git ls-files --others --exclude-standard --')

const staged = [
	...new Set([...gitPaths('--diff-filter=ADR'), ...worktree('--diff-filter=ADR'), ...untracked()]),
]
const stagedAll = [...new Set([...gitPaths(''), ...worktree(''), ...untracked()])]

const problems = []

// 1. doc structure changed → index must move with it
const docsChanged = staged.filter((f) => f.startsWith('docs/') && f.endsWith('.md'))
if (docsChanged.length && !stagedAll.includes('llms.txt')) {
	problems.push(
		`docs changed (${docsChanged.join(', ')}) but llms.txt is not staged — run: node scripts/docs-index.mjs && git add llms.txt`,
	)
}

// 2. ADR citations resolve. Filenames are `NNNN-slug.md` and never contain the
// literal "ADR-" — matching /ADR-(\d{4})/ against them left this set
// permanently empty, so the check flagged every citation in the tree.
let adrs = new Set()
try {
	adrs = new Set(
		readdirSync(join(ROOT, 'docs/decisions'))
			.map((f) => f.match(/^(\d{4})-.+\.md$/)?.[1])
			.filter(Boolean),
	)
} catch {
	/* no decisions dir yet */
}
for (const f of stagedAll.filter(
	// ast-grep rule messages (.yml), wrangler config comments (.jsonc) and the
	// depcruise config (.cjs) all cite ADRs — an extension list that stopped at
	// .ts/.md left the two rules that DO name an ADR unchecked.
	(f) => /\.(ts|tsx|mjs|cjs|md|yml|yaml|jsonc)$/.test(f) && !f.startsWith('docs/decisions/'),
)) {
	let text = ''
	try {
		text = readFileSync(join(ROOT, f), 'utf8')
	} catch {
		continue // deleted in this commit
	}
	for (const m of text.matchAll(/ADR-(\d{4})/g)) {
		if (!adrs.has(m[1]))
			problems.push(`${f}: cites ADR-${m[1]}, which does not exist in docs/decisions/`)
	}
}

// 2b. ADRs are immutable — supersede, never edit. A staged MODIFICATION to a
// numbered ADR is flagged unless the diff is the supersession itself (adding
// the "superseded by" status pointer).
const modified = [...new Set([...gitPaths('--diff-filter=M'), ...worktree('--diff-filter=M')])]
for (const f of modified.filter((f) => /^docs\/decisions\/\d{4}-.+\.md$/.test(f))) {
	const diff =
		execSync(`git diff --cached -U0 -- "${f}"`, { cwd: ROOT }).toString() +
		(STAGED_ONLY ? '' : execSync(`git diff -U0 -- "${f}"`, { cwd: ROOT }).toString())
	// The status block is METADATA, not the decision — the README already treats
	// it as mutable (the superseded-by pointer lives there), so the rule that
	// froze the whole file was narrower than its own rationale. What is immutable
	// is the argument: Decision, Context, Alternatives declined, Consequences.
	// Edges (`Constrained by:`, `Enforced by:`) have to stay current or the
	// generated graph lies, and re-deciding is not what updating them means.
	const changed = diff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
	const bodyChanged = changed.some((l) => l.slice(1).trim() !== '' && !/^[+-]>\s/.test(l))
	if (bodyChanged && !/superseded/i.test(diff))
		problems.push(
			`${f}: ADR bodies are immutable — supersede with a new ADR (the status block may change; the argument may not)`,
		)
}

// 3. Status blocks on staged docs — scoped to the STAGED diff only, never a
// repo sweep (the sweep version misfired on scratch dirs elsewhere). Kind must
// match the folder; design docs carry a falsifiable Built line.
const KIND_BY_FOLDER = {
	decisions: 'decision',
	design: 'design',
	reference: 'reference',
	plans: 'plan',
	conventions: 'convention',
}
for (const f of stagedAll.filter(
	(f) => /^docs\/[^/]+\/.+\.md$/.test(f) && !/README\.md$|template/.test(f),
)) {
	let text = ''
	try {
		text = readFileSync(join(ROOT, f), 'utf8')
	} catch {
		continue
	}
	const folder = f.split('/')[1]
	const want = KIND_BY_FOLDER[folder]
	const kind = text.match(/\*\*Kind:\*\*\s*(\w+)/)?.[1]
	if (!kind)
		problems.push(`${f}: no status block (needs **Kind:** … per docs/conventions/documentation.md)`)
	else if (want && kind !== want)
		problems.push(`${f}: Kind '${kind}' does not match folder '${folder}' (want '${want}')`)
	if (want === 'design' && !/\*\*Built:\*\*/.test(text))
		problems.push(`${f}: design docs need a falsifiable **Built:** line`)
	if (!/\*\*Level:\*\*/.test(text) && kind)
		problems.push(`${f}: no **Level:** line (0–5, the stability tree)`)
}

// 4. No volatile figures inside an IMMUTABLE file. A price or a dated deadline
// in docs/decisions/ is a lie with a timer on it: the file cannot be edited when
// the number moves, so the doctrine goes on asserting it. ADR-0016 carried two
// per-million prices and a cutover date until they moved to reference/, which is
// a living statement of fact and the right home. The status block is exempt —
// `Updated:` is a date by definition.
for (const f of stagedAll.filter((f) => /^docs\/decisions\/\d{4}-.+\.md$/.test(f))) {
	let text = ''
	try {
		text = readFileSync(join(ROOT, f), 'utf8')
	} catch {
		continue
	}
	const body = text
		.split('\n')
		.filter((l) => !l.startsWith('>'))
		.join('\n')
	const hit = body.match(/\$\d[\d.,]*|\b20\d{2}-\d{2}-\d{2}\b/)
	if (hit)
		problems.push(
			`${f}: volatile figure '${hit[0]}' in an immutable file — prices and dated deadlines belong in docs/reference/, which can be corrected when they move`,
		)
}

if (problems.length) {
	console.error(`docs-check:\n  ${[...new Set(problems)].join('\n  ')}`)
	process.exit(1)
}
// Say how much was examined. On a clean tree there is nothing to check and a
// bare "OK" reads as validation — the false-green that check-runner already
// guards against for the skipped DB tiers, appearing here instead.
console.log(
	stagedAll.length
		? `docs-check: OK (${stagedAll.length} changed file(s) examined)`
		: 'docs-check: OK — no changed files to examine (nothing was validated)',
)
