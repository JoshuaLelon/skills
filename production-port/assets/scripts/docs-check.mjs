#!/usr/bin/env node
// Co-change enforcement, minimal edition. Two structural triggers only — a
// hard rule with false positives gets disabled, and a disabled check is worse
// than none:
//   1. A doc added/deleted/renamed in the staged diff → llms.txt must be
//      staged too (regenerate with `node scripts/docs-index.mjs`).
//   2. Any staged code citing ADR-NNNN → docs/decisions/ must contain it.
// Runs off the staged diff: cheap, deterministic, pre-commit-friendly.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const staged = execSync("git diff --cached --name-only --diff-filter=ADR", { cwd: ROOT })
	.toString()
	.split("\n")
	.filter(Boolean);
const stagedAll = execSync("git diff --cached --name-only", { cwd: ROOT })
	.toString()
	.split("\n")
	.filter(Boolean);

const problems = [];

// 1. doc structure changed → index must move with it
const docsChanged = staged.filter((f) => f.startsWith("docs/") && f.endsWith(".md"));
if (docsChanged.length && !stagedAll.includes("llms.txt")) {
	problems.push(
		`docs changed (${docsChanged.join(", ")}) but llms.txt is not staged — run: node scripts/docs-index.mjs && git add llms.txt`,
	);
}

// 2. ADR citations resolve
let adrs = new Set();
try {
	adrs = new Set(
		readdirSync(join(ROOT, "docs/decisions"))
			.map((f) => f.match(/ADR-(\d{4})/)?.[1])
			.filter(Boolean),
	);
} catch {
	/* no decisions dir yet */
}
for (const f of stagedAll.filter((f) => /\.(ts|tsx|mjs|md)$/.test(f) && !f.startsWith("docs/decisions/"))) {
	let text = "";
	try {
		text = readFileSync(join(ROOT, f), "utf8");
	} catch {
		continue; // deleted in this commit
	}
	for (const m of text.matchAll(/ADR-(\d{4})/g)) {
		if (!adrs.has(m[1])) problems.push(`${f}: cites ADR-${m[1]}, which does not exist in docs/decisions/`);
	}
}

// 2b. ADRs are immutable — supersede, never edit. A staged MODIFICATION to a
// numbered ADR is flagged unless the diff is the supersession itself (adding
// the "superseded by" status pointer).
const modified = execSync("git diff --cached --name-only --diff-filter=M", { cwd: ROOT })
	.toString()
	.split("\n")
	.filter(Boolean);
for (const f of modified.filter((f) => /^docs\/decisions\/\d{4}-.+\.md$/.test(f))) {
	const diff = execSync(`git diff --cached -U0 -- "${f}"`, { cwd: ROOT }).toString();
	if (!/superseded/i.test(diff))
		problems.push(`${f}: ADRs are immutable — supersede with a new ADR (the only legal edit is adding the 'superseded by' pointer)`);
}

// 3. Status blocks on staged docs — scoped to the STAGED diff only, never a
// repo sweep (the sweep version misfired on scratch dirs elsewhere). Kind must
// match the folder; design docs carry a falsifiable Built line.
const KIND_BY_FOLDER = {
	decisions: "decision",
	design: "design",
	reference: "reference",
	plans: "plan",
	conventions: "convention",
};
for (const f of stagedAll.filter((f) => /^docs\/[^/]+\/.+\.md$/.test(f) && !/README\.md$|template/.test(f))) {
	let text = "";
	try {
		text = readFileSync(join(ROOT, f), "utf8");
	} catch {
		continue;
	}
	const folder = f.split("/")[1];
	const want = KIND_BY_FOLDER[folder];
	const kind = text.match(/\*\*Kind:\*\*\s*(\w+)/)?.[1];
	if (!kind) problems.push(`${f}: no status block (needs **Kind:** … per docs/conventions/documentation.md)`);
	else if (want && kind !== want) problems.push(`${f}: Kind '${kind}' does not match folder '${folder}' (want '${want}')`);
	if (want === "design" && !/\*\*Built:\*\*/.test(text))
		problems.push(`${f}: design docs need a falsifiable **Built:** line`);
	if (!/\*\*Level:\*\*/.test(text) && kind) problems.push(`${f}: no **Level:** line (0–5, the stability tree)`);
}

if (problems.length) {
	console.error(`docs-check:\n  ${[...new Set(problems)].join("\n  ")}`);
	process.exit(1);
}
console.log("docs-check: OK");
