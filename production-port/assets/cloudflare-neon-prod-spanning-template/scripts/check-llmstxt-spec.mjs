#!/usr/bin/env node
// The docs system follows the llms.txt convention from llmstxt.org. This
// checks whether the upstream spec has changed since the skill's scripts were
// written against it — same idea as a `Tracks: path@hash` line, pointed at the
// web. Network-tolerant: offline is a note, never a failure.
//
// When it reports a change: read the new spec, update docs-index.mjs, then bump
// SPEC_HASH below. There is ONE copy of each — the spanning template's — and
// scaffold-prod.sh copies from here, so a fix made here reaches both paths.
import { createHash } from 'node:crypto'

// sha256 of the normalized spec text this generator was written against.
// Set to the value printed on first run (or after adopting a spec change).
const SPEC_HASH = '3b9f2b65cff0e694737ec53a82faca6822ee2c709ce50c750448e120b1359783' // pinned 2026-08-06
const SPEC_URL = 'https://llmstxt.org/'

const normalize = (s) =>
	s
		.replace(/<[^>]+>/g, ' ') // strip tags — we track content, not site chrome
		.replace(/\s+/g, ' ')
		.trim()

try {
	const res = await fetch(SPEC_URL, { signal: AbortSignal.timeout(10_000) })
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	const hash = createHash('sha256')
		.update(normalize(await res.text()))
		.digest('hex')
	if (hash === SPEC_HASH) {
		console.log('llmstxt-spec: unchanged upstream.')
	} else {
		console.log(
			`llmstxt-spec: UPSTREAM CHANGED (current ${hash.slice(0, 12)}…, pinned ${SPEC_HASH.slice(0, 12)}…).`,
		)
		console.log('  1. Read https://llmstxt.org/ and diff against what docs-index.mjs generates.')
		console.log('  2. Update scripts/docs-index.mjs.')
		console.log('  3. Bump SPEC_HASH in this script.')
		console.log('  (If the change is cosmetic site chrome, just bump the hash.)')
	}
} catch (e) {
	console.log(
		`llmstxt-spec: could not reach ${SPEC_URL} (${e.message ?? e}) — skipping, not failing.`,
	)
}

// -- Playbook masters pin -----------------------------------------------------
// The skill's AGENTS template and references are DISTILLED from these masters;
// when a master changes, the distillation is stale. Same procedure: re-read
// what changed, update the skill's template/references, bump the pin.
const PLAYBOOKS_HASH = '72ae4d14286011256618244301b6d60be67a985750bc3e12e93d759788f34938' // pinned 2026-08-06
try {
	const { readFileSync, readdirSync } = await import('node:fs')
	const { join } = await import('node:path')
	const home = process.env.HOME ?? ''
	const dir = join(home, 'workspace')
	const masters = readdirSync(dir)
		.filter((f) => /^epic-.*\.md$|^deprecations\.md$/.test(f))
		.sort()
	if (masters.length) {
		const h = createHash('sha256')
		for (const f of masters) h.update(f).update(readFileSync(join(dir, f)))
		const hash = h.digest('hex')
		if (PLAYBOOKS_HASH === 'PENDING') {
			console.log(`playbook-pin: first run — set PLAYBOOKS_HASH to ${hash}`)
		} else if (hash === PLAYBOOKS_HASH) {
			console.log(`playbook-pin: masters unchanged (${masters.length} files).`)
		} else {
			console.log('playbook-pin: MASTERS CHANGED — re-distill into the production-port skill')
			console.log(
				'  (AGENTS-template §4, references/react-patterns.md, references/testing.md), then bump PLAYBOOKS_HASH.',
			)
		}
	}
} catch {
	/* no workspace masters on this machine — nothing to pin */
}
