#!/usr/bin/env node
// Generates llms.txt following the llmstxt.org convention: H1, blockquote
// summary, then H2 sections listing `[name](path): note`. Hand-written prose
// ABOVE the first `## ` heading is preserved; everything from the first H2
// down is generated. A generated index cannot go stale — removing the
// opportunity beats detecting the failure.
// `--check` verifies the committed file matches what would be generated.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')

const SECTIONS = [
	['Start here', ['README.md', 'AGENTS.md', 'CLAUDE.md']],
	['Conventions — how we work', 'docs/conventions'],
	['Decisions — immutable; never edit, only supersede', 'docs/decisions'],
	['Design — how it should behave', 'docs/design'],
	['Reference — what is true', 'docs/reference'],
	['Plans — time-bounded work', 'docs/plans'],
]

const exists = (p) => {
	try {
		return statSync(join(ROOT, p)).isFile()
	} catch {
		return false
	}
}

function* mdFiles(dir) {
	let names = []
	try {
		names = readdirSync(join(ROOT, dir))
	} catch {
		return
	}
	for (const name of names.sort()) {
		const p = join(dir, name)
		if (statSync(join(ROOT, p)).isDirectory()) yield* mdFiles(p)
		else if (name.endsWith('.md')) yield p
	}
}

// Partial supersessions, read from the `Supersedes:` edges. An ADR body is
// immutable, so ADR-0009 still says "traces enabled while free" and ADR-0001
// still claims an AI gateway that was never wired — corrections that could only
// be filed as new peers. Annotating the SUPERSEDED entry here is what makes the
// index tell the truth without editing the file: an agent reading llms.txt (the
// entry point) sees the correction attached to the decision it corrects.
const superseded = new Map()
{
	let names = []
	try {
		names = readdirSync(join(ROOT, 'docs/decisions'))
	} catch {
		/* no decisions dir */
	}
	for (const name of names) {
		const n = name.match(/^(\d{4})-.+\.md$/)?.[1]
		if (!n) continue
		const raw = readFileSync(join(ROOT, 'docs/decisions', name), 'utf8')
			.match(/\*\*Supersedes:\*\*\s*([^\n]+)/)?.[1]
			?.trim()
		if (!raw || raw === '—') continue
		for (const ref of raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)) {
			const [target, topic] = ref.split('#')
			if (!/^\d{4}$/.test(target)) continue
			if (!superseded.has(target)) superseded.set(target, [])
			superseded.get(target).push(topic ? `${topic} → ADR-${n}` : `→ ADR-${n}`)
		}
	}
}

// One line per doc: [name](path): scope note (from the status block's Scope
// line, falling back to the first heading).
function entry(p) {
	const text = readFileSync(join(ROOT, p), 'utf8')
	// Scope may wrap across blockquote lines; consume continuations up to the
	// next bold field.
	const scope = text
		.match(/\*\*Scope:\*\*\s*([^\n]+(?:\n>\s+(?!\*\*)[^\n]+)*)/)?.[1]
		?.replace(/\n>\s+/g, ' ')
		.trim()
	const title = text.match(/^#\s+(.+)$/m)?.[1] ?? basename(p)
	const level = text.match(/\*\*Level:\*\*\s*(\d)/)?.[1]
	// ADRs index by their TITLE — which is the choice made, stated so a reader can
	// act on it — not by Scope. Scope was the only field that surfaced here, so it
	// accreted cross-references until it was a hand-maintained adjacency list;
	// half the seed then shared one boilerplate Scope and produced thirteen
	// identical index lines. The edges live in adr-graph.md now, derived.
	const isAdr = p.startsWith('docs/decisions/')
	const note = ((isAdr ? title.replace(/^ADR-\d{4}\s*—\s*/, '') : scope) ?? title).replace(
		/\s+/g,
		' ',
	)
	const sup = superseded.get(basename(p).match(/^(\d{4})-/)?.[1])
	const warn = sup ? ` · ⚠ **partially superseded** (${sup.join('; ')})` : ''
	return `- [${basename(p)}](${p})${level ? ` · **L${level}**` : ''}${warn}: ${note}`
}

const generated = []
for (const [heading, src] of SECTIONS) {
	const files = Array.isArray(src) ? src.filter(exists) : [...mdFiles(src)]
	if (!files.length) continue
	generated.push(`## ${heading}`, '', ...files.map(entry), '')
}

// Preserve prose above the first H2; seed it if the file is new.
let head = ''
try {
	const current = readFileSync(join(ROOT, 'llms.txt'), 'utf8')
	head = current.split(/^## /m)[0]
} catch {
	const name = basename(ROOT)
	head = `# ${name}\n\n> [FILL: one-paragraph summary of what this app is — llms.txt is the entry point for an agent with no other context.]\n\n`
}

const out = `${head}${generated.join('\n')}`.replace(/\n{3,}/g, '\n\n')

if (CHECK) {
	let current = ''
	try {
		current = readFileSync(join(ROOT, 'llms.txt'), 'utf8')
	} catch {
		/* missing counts as stale */
	}
	if (current !== out) {
		console.error('docs-index: llms.txt is stale — run: node scripts/docs-index.mjs')
		process.exit(1)
	}
	console.log('docs-index: OK')
} else {
	writeFileSync(join(ROOT, 'llms.txt'), out)
	console.log('docs-index: wrote llms.txt')
}
