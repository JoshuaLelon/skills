#!/usr/bin/env node
// The fill-in checklist: every `[FILL: …]` marker across docs/, AGENTS.md and
// llms.txt, as a checklist the agent works through with the user. A report,
// not a gate — fills are worked through over a session, and a gate here would
// just get bypassed. Run any time; empty output means the docs are whole.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

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

const targets = [...mdFiles('docs'), 'AGENTS.md', 'llms.txt', 'README.md', 'wrangler.jsonc'].filter(
	(p) => {
		try {
			return statSync(join(ROOT, p)).isFile()
		} catch {
			return false
		}
	},
)

let total = 0
for (const p of targets) {
	const text = readFileSync(join(ROOT, p), 'utf8')
	const items = []
	const lines = text.split('\n')
	lines.forEach((line, i) => {
		for (const m of line.matchAll(/\[FILL:\s*([^\]]{0,90})/g)) {
			items.push(`  - [ ] ${p}:${i + 1} — ${m[1].trim()}${m[1].length >= 90 ? '…' : ''}`)
		}
	})
	if (items.length) {
		console.log(`${p} (${items.length}):`)
		console.log(items.join('\n'))
		total += items.length
	}
}

if (total) {
	console.log(
		`\ndocs-fillins: ${total} fill-in(s) remaining. Work through them with the user, top level first.`,
	)
} else {
	console.log('docs-fillins: none remaining — the doc skeleton is filled.')
}
